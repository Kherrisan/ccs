import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import RecoveryManager from '../../src/management/recovery-manager';

function createDirectorySymlink(targetDir: string, linkPath: string): void {
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

  try {
    fs.symlinkSync(targetDir, linkPath, symlinkType as fs.symlink.Type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      throw new Error(
        `Symlink creation is not permitted in this environment (${code}) for ${linkPath}`
      );
    }
    throw error;
  }
}

describe('RecoveryManager', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-recovery-manager-test-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('recreates ~/.ccs/shared when recovery finds a dangling symlink', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const sharedDir = path.join(ccsDir, 'shared');
    fs.mkdirSync(ccsDir, { recursive: true });
    createDirectorySymlink(path.join(tempHome, 'missing-shared'), sharedDir);

    const recovery = new RecoveryManager();

    expect(() => recovery.ensureSharedDirectories()).not.toThrow();
    expect(fs.statSync(sharedDir).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(sharedDir, 'commands')).isDirectory()).toBe(true);
    expect(recovery.getRecoverySummary()).toContain(`Removed broken symlink: ${sharedDir}`);
  });

  it('recreates ~/.ccs/shared/commands when recovery finds a dangling symlink', () => {
    const sharedDir = path.join(tempHome, '.ccs', 'shared');
    const commandsDir = path.join(sharedDir, 'commands');
    fs.mkdirSync(sharedDir, { recursive: true });
    createDirectorySymlink(path.join(tempHome, 'missing-commands'), commandsDir);

    const recovery = new RecoveryManager();

    expect(() => recovery.ensureSharedDirectories()).not.toThrow();
    expect(fs.statSync(commandsDir).isDirectory()).toBe(true);
    expect(recovery.getRecoverySummary()).toContain(`Removed broken symlink: ${commandsDir}`);
  });

  it('preserves valid shared command symlinks', () => {
    const sharedDir = path.join(tempHome, '.ccs', 'shared');
    const commandsDir = path.join(sharedDir, 'commands');
    const externalCommandsDir = path.join(tempHome, 'external-commands');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(externalCommandsDir, { recursive: true });
    createDirectorySymlink(externalCommandsDir, commandsDir);

    const recovery = new RecoveryManager();

    expect(() => recovery.ensureSharedDirectories()).not.toThrow();
    expect(fs.lstatSync(commandsDir).isSymbolicLink()).toBe(true);
    expect(path.resolve(path.dirname(commandsDir), fs.readlinkSync(commandsDir))).toBe(
      externalCommandsDir
    );
    expect(recovery.getRecoverySummary()).not.toContain(`Removed broken symlink: ${commandsDir}`);
  });

  it('does not delete a valid shared command symlink when target access is denied', () => {
    const sharedDir = path.join(tempHome, '.ccs', 'shared');
    const commandsDir = path.join(sharedDir, 'commands');
    const externalCommandsDir = path.join(tempHome, 'external-commands');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(externalCommandsDir, { recursive: true });
    createDirectorySymlink(externalCommandsDir, commandsDir);

    const originalStatSync = fs.statSync.bind(fs);
    spyOn(fs, 'statSync').mockImplementation((targetPath: fs.PathLike) => {
      if (String(targetPath) === commandsDir) {
        const error = new Error('simulated permission failure') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }

      return originalStatSync(targetPath);
    });

    const recovery = new RecoveryManager();

    expect(() => recovery.ensureSharedDirectories()).not.toThrow();
    expect(fs.lstatSync(commandsDir).isSymbolicLink()).toBe(true);
    expect(path.resolve(path.dirname(commandsDir), fs.readlinkSync(commandsDir))).toBe(
      externalCommandsDir
    );
    expect(recovery.getRecoverySummary()).not.toContain(`Removed broken symlink: ${commandsDir}`);
    expect(recovery.getRecoverySummary()).toContain(
      `Skipped ${commandsDir}: symlink target is not accessible (EACCES)`
    );
  });
});
