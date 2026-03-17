import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

let tempDir = '';
let originalCwd = '';
let originalConsoleLog: typeof console.log;
let logLines: string[] = [];

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ccs-api-export-test-'));
  originalCwd = process.cwd();
  process.chdir(tempDir);
  logLines = [];
  originalConsoleLog = console.log;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };

  const uiModule = {
    initUI: async () => {},
    header: (message: string) => message,
    subheader: (message: string) => message,
    color: (message: string) => message,
    dim: (message: string) => message,
    ok: (message: string) => message,
    info: (message: string) => message,
    warn: (message: string) => message,
    fail: (message: string) => message,
  };
  mock.module('../../../src/utils/ui', () => uiModule);
  mock.module('../../../src/utils/ui.ts', () => uiModule);

  mock.module('../../../src/api/services', () => ({
    exportApiProfile: () => ({
      success: true,
      redacted: false,
      bundle: {
        profile: { name: 'profile-a' },
      },
    }),
  }));
});

afterEach(() => {
  console.log = originalConsoleLog;
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
  mock.restore();
});

async function loadHandleApiExportCommand() {
  const mod = await import(
    `../../../src/commands/api-command/export-command?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleApiExportCommand;
}

describe('api export command', () => {
  it('accepts dash-prefixed output paths', async () => {
    const handleApiExportCommand = await loadHandleApiExportCommand();

    await handleApiExportCommand(['profile-a', '--out', '--snapshot.json']);

    const outputPath = resolve(process.cwd(), '--snapshot.json');
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, 'utf8')).toContain('"name": "profile-a"');
    expect(logLines.join('\n')).toContain(`Profile exported to: ${outputPath}`);
  });
});
