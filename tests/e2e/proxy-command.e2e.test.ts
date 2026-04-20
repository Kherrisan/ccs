import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import getPort from 'get-port';

const DIST_ENTRY = path.join(process.cwd(), 'dist', 'ccs.js');

let originalCcsHome: string | undefined;
let tempDir: string;

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [DIST_ENTRY, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CCS_HOME: tempDir,
      ...extraEnv,
    },
  });
}

beforeAll(() => {
  const result = spawnSync(process.execPath, ['run', 'build'], {
    encoding: 'utf8',
    env: process.env,
  });
  expect(result.status).toBe(0);
});

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-e2e-'));
});

afterEach(() => {
  runCli(['proxy', 'stop']);
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('proxy command e2e', () => {
  it('starts, reports status, activates, and stops via the built CLI', async () => {
    const port = await getPort();
    const ccsDir = path.join(tempDir, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const settingsPath = path.join(ccsDir, 'hf.settings.json');
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { hf: settingsPath } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const started = runCli(['proxy', 'start', 'hf', '--port', String(port), '--host', '127.0.0.1']);
    expect(started.status).toBe(0);

    const status = runCli(['proxy', 'status']);
    expect(status.stdout).toContain(`Proxy running on port ${port}`);
    expect(status.stdout).toContain('Host: 127.0.0.1');
    expect(status.stdout).toContain('Profile: hf');

    const activate = runCli(['proxy', 'activate', '--shell', 'bash']);
    expect(activate.stdout).toContain(`export ANTHROPIC_BASE_URL='http://127.0.0.1:${port}'`);
    expect(activate.stdout).toMatch(/export ANTHROPIC_AUTH_TOKEN='[a-f0-9]{48}'/);
    expect(activate.stdout).toContain("export DISABLE_TELEMETRY='1'");
    expect(activate.stdout).toContain("export DISABLE_COST_WARNINGS='1'");
    expect(activate.stdout).toContain("export API_TIMEOUT_MS='600000'");
    expect(activate.stdout).toContain("export NO_PROXY='127.0.0.1,localhost'");

    const activateFish = runCli(['proxy', 'activate', '--fish']);
    expect(activateFish.stdout).toContain(`set -gx ANTHROPIC_BASE_URL 'http://127.0.0.1:${port}'`);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const info = await fetch(`http://127.0.0.1:${port}/`);
    expect(info.status).toBe(200);
    await expect(info.json()).resolves.toMatchObject({
      ok: true,
      service: 'ccs-openai-compat-proxy',
      bind: {
        host: '127.0.0.1',
        port,
      },
      profile: {
        name: 'hf',
      },
    });

    const stopped = runCli(['proxy', 'stop']);
    expect(stopped.status).toBe(0);
  }, 35000);

  it('requires an explicit profile when activating with multiple running proxies', async () => {
    const firstPort = await getPort();
    const ccsDir = path.join(tempDir, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const firstSettingsPath = path.join(ccsDir, 'ccg.settings.json');
    const secondSettingsPath = path.join(ccsDir, 'ccgm.settings.json');
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { ccg: firstSettingsPath, ccgm: secondSettingsPath } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      firstSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-ccg',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );
    fs.writeFileSync(
      secondSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-ccgm',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );

    expect(runCli(['proxy', 'start', 'ccg', '--port', String(firstPort)]).status).toBe(0);
    const secondPort = await getPort();
    expect(runCli(['proxy', 'start', 'ccgm', '--port', String(secondPort)]).status).toBe(0);

    const activate = runCli(['proxy', 'activate', '--shell', 'bash']);
    expect(activate.status).toBe(1);
    expect(activate.stderr).toContain(
      'Multiple proxies are running. Specify a profile: ccs proxy activate <profile>'
    );
  }, 35000);
});
