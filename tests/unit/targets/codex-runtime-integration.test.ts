import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCcs(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const ccsEntry = path.join(process.cwd(), 'src', 'ccs.ts');
  const result = spawnSync(process.execPath, [ccsEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readLoggedCodexCalls(logPath: string): string[][] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs
    .readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

describe('codex runtime integration', () => {
  let tmpHome: string;
  let ccsDir: string;
  let fakeCodexPath: string;
  let codexArgsLogPath: string;
  let emptyPathDir: string;

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-route-it-'));
    ccsDir = path.join(tmpHome, '.ccs');
    fakeCodexPath = path.join(tmpHome, 'fake-codex.js');
    codexArgsLogPath = path.join(tmpHome, 'codex-args.log');
    emptyPathDir = path.join(tmpHome, 'empty-bin');

    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(emptyPathDir, { recursive: true });

    fs.writeFileSync(
      fakeCodexPath,
      `#!/usr/bin/env node
const fs = require('fs');
const out = process.env.CCS_TEST_CODEX_ARGS_OUT;
if (out) {
  fs.appendFileSync(out, JSON.stringify(process.argv.slice(2)) + '\\n');
}
if (process.argv[2] === '--version') {
  process.stdout.write(process.env.CCS_TEST_CODEX_VERSION || 'codex-cli 0.118.0-alpha.3');
  process.exit(0);
}
if (process.argv[2] === '--help') {
  process.stdout.write(
    process.env.CCS_TEST_CODEX_HELP ||
      '  -c, --config <key=value>\\n  -p, --profile <CONFIG_PROFILE>\\n'
  );
  process.exit(0);
}
process.exit(0);
`,
      { encoding: 'utf8', mode: 0o755 }
    );
    fs.chmodSync(fakeCodexPath, 0o755);
  });

  afterEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('ignores numeric CCS_THINKING env overrides for native Codex default mode', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_THINKING: '8192',
    });

    expect(result.status).toBe(0);
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls.at(-1)).toEqual(['fix failing tests']);
  });

  it('ignores off-style CCS_THINKING env overrides for native Codex default mode', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_THINKING: 'off',
    });

    expect(result.status).toBe(0);
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls.at(-1)).toEqual(['fix failing tests']);
  });

  it('fails fast when native Codex reasoning overrides need unsupported --config support', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', '--target', 'codex', '--effort', 'high', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_HELP: '  -p, --profile <CONFIG_PROFILE>\\n',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not advertise --config overrides');
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls).toEqual([['--version'], ['--help']]);
  });

  it('reports unsupported generic settings profiles before Codex install guidance', () => {
    if (process.platform === 'win32') return;

    const settingsPath = path.join(ccsDir, 'myglm.settings.json');
    const configPath = path.join(ccsDir, 'config.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://example.invalid/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'gpt-5.4',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          profiles: {
            myglm: settingsPath,
          },
        },
        null,
        2
      )
    );

    const result = runCcs(['myglm', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      PATH: emptyPathDir,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Codex CLI currently supports native default sessions and Codex-routed CLIProxy sessions only.'
    );
    expect(result.stderr).not.toContain('Install a recent @openai/codex build');
  });
});
