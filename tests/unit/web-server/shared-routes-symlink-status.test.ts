import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkSymlinkStatus } from '../../../src/web-server/shared-routes-symlink-status';

/**
 * All tests set process.env.CCS_HOME to a temp directory so getCcsDir()
 * never touches the user's real ~/.ccs/. CLAUDE_CONFIG_DIR is also
 * overridden so checkSymlinkStatus() does not reference ~/.claude/.
 */

describe('checkSymlinkStatus', () => {
  let tempHome: string;
  let ccsDir: string;
  let sharedDir: string;
  let originalCcsHome: string | undefined;
  let originalClaudeConfigDir: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-symlink-status-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    process.env.CCS_HOME = tempHome;
    // Point CLAUDE_CONFIG_DIR to a dir we control so expected targets resolve correctly.
    process.env.CLAUDE_CONFIG_DIR = path.join(tempHome, 'claude-config');

    ccsDir = path.join(tempHome, '.ccs');
    sharedDir = path.join(ccsDir, 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Missing shared directory
  // ---------------------------------------------------------------------------

  it('reports none when shared directory does not exist', () => {
    fs.rmSync(sharedDir, { recursive: true, force: true });
    const result = checkSymlinkStatus();
    expect(result.valid).toBe(false);
    expect(result.mode).toBe('none');
    expect(result.message).toContain('not found');
  });

  // ---------------------------------------------------------------------------
  // All-missing (no entries at all)
  // ---------------------------------------------------------------------------

  it('reports none when no entries exist under shared/', () => {
    const result = checkSymlinkStatus();
    expect(result.valid).toBe(false);
    expect(result.mode).toBe('none');
    expect(result.message).toBe('Shared resources not configured');
    expect(result.links).toEqual({ commands: 'missing', skills: 'missing', agents: 'missing' });
  });

  // ---------------------------------------------------------------------------
  // Windows copy-fallback mode: all three are non-empty directories
  // ---------------------------------------------------------------------------

  it('reports valid copy mode when all three entries are non-empty directories (Windows fallback)', () => {
    for (const entryType of ['commands', 'skills', 'agents']) {
      const dir = path.join(sharedDir, entryType);
      fs.mkdirSync(dir, { recursive: true });
      // Place a file so the directory is non-empty.
      fs.writeFileSync(path.join(dir, 'placeholder.md'), `# ${entryType}`);
    }

    const result = checkSymlinkStatus();
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('copy');
    expect(result.message).toBe('Copies active (Windows fallback)');
    expect(result.links).toEqual({ commands: 'copy', skills: 'copy', agents: 'copy' });
  });

  // ---------------------------------------------------------------------------
  // Symlink mode: all three are valid symlinks to CLAUDE_CONFIG_DIR/<type>
  // ---------------------------------------------------------------------------

  it('reports valid symlink mode when all three entries are correct symlinks', () => {
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR as string;
    for (const entryType of ['commands', 'skills', 'agents']) {
      const target = path.join(claudeConfigDir, entryType);
      fs.mkdirSync(target, { recursive: true });
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(target, path.join(sharedDir, entryType), symlinkType as fs.symlink.Type);
    }

    const result = checkSymlinkStatus();
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('symlink');
    expect(result.message).toBe('Symlinks active');
    expect(result.links).toEqual({ commands: 'symlink', skills: 'symlink', agents: 'symlink' });
  });

  // ---------------------------------------------------------------------------
  // Mixed / partial: only commands exists as a copy
  // ---------------------------------------------------------------------------

  it('reports invalid mixed mode when only commands exists as a copy', () => {
    const commandsDir = path.join(sharedDir, 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(path.join(commandsDir, 'build.md'), 'Run build');

    const result = checkSymlinkStatus();
    expect(result.valid).toBe(false);
    // mode must reflect a non-uniform state
    expect(['mixed', 'none']).toContain(result.mode);
    // message must reference the mixed/partial state
    expect(result.message.toLowerCase()).toMatch(/mixed|not configured/);
    expect(result.links.commands).toBe('copy');
    expect(result.links.skills).toBe('missing');
    expect(result.links.agents).toBe('missing');
  });

  // ---------------------------------------------------------------------------
  // Mixed: two copies, one missing
  // ---------------------------------------------------------------------------

  it('reports invalid mixed mode when two entries are copies and one is missing', () => {
    for (const entryType of ['commands', 'skills']) {
      const dir = path.join(sharedDir, entryType);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'placeholder.md'), `# ${entryType}`);
    }
    // agents intentionally absent

    const result = checkSymlinkStatus();
    expect(result.valid).toBe(false);
    expect(result.mode).toBe('mixed');
    expect(result.message).toContain('Mixed');
    expect(result.links.commands).toBe('copy');
    expect(result.links.skills).toBe('copy');
    expect(result.links.agents).toBe('missing');
  });

  // ---------------------------------------------------------------------------
  // Empty directory is treated as missing (not a valid copy)
  // ---------------------------------------------------------------------------

  it('treats an empty directory as missing, not a valid copy', () => {
    for (const entryType of ['commands', 'skills', 'agents']) {
      fs.mkdirSync(path.join(sharedDir, entryType), { recursive: true });
      // intentionally empty
    }

    const result = checkSymlinkStatus();
    // All entries empty -> all missing -> mode none
    expect(result.valid).toBe(false);
    expect(result.mode).toBe('none');
    expect(result.links).toEqual({ commands: 'missing', skills: 'missing', agents: 'missing' });
  });
});
