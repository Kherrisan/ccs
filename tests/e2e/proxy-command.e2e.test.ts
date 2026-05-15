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

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createProfileConfig(profiles: Record<string, Record<string, string>>) {
  const ccsDir = path.join(tempDir, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  const configProfiles = Object.fromEntries(
    Object.keys(profiles).map((name) => [name, path.join(ccsDir, `${name}.settings.json`)])
  );
  writeJson(path.join(ccsDir, 'config.json'), { profiles: configProfiles });
  for (const [name, env] of Object.entries(profiles)) {
    writeJson(configProfiles[name], { env });
  }
}

function getRunningPort(statusOutput: string) {
  const match = statusOutput.match(/Local URL: http:\/\/127\.0\.0\.1:(\d+)/);
  expect(match).not.toBeNull();
  return Number(match?.[1]);
}
beforeAll(() => {
  if (process.env.CCS_E2E_SKIP_BUILD === '1') {
    expect(fs.existsSync(DIST_ENTRY)).toBe(true);
    return;
  }
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
  it('shows help for subcommand help flags without executing the subcommand', () => {
    const help = runCli(['proxy', 'stop', '--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: ccs proxy <start|stop|status|activate> [profile] [options]');
    expect(help.stdout).toContain('stop [profile]    Stop the running proxy (or all proxies when omitted)');
    expect(help.stdout).toContain('Pin an exact local proxy port for this launch');
    expect(help.stdout).not.toContain('default: 3456');
  });

  it('shows the last-known proxy state when no proxy is currently running', async () => {
    const stalePort = await getPort();
    const proxyDir = path.join(tempDir, '.ccs', 'proxy');
    fs.mkdirSync(proxyDir, { recursive: true });
    fs.writeFileSync(
      path.join(proxyDir, 'stale.session.json'),
      JSON.stringify(
        {
          profileName: 'stale',
          settingsPath: path.join(tempDir, '.ccs', 'stale.settings.json'),
          host: '127.0.0.1',
          port: stalePort,
          baseUrl: 'http://127.0.0.1:11434',
          authToken: 'deadbeef',
          model: 'qwen3-coder',
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const status = runCli(['proxy', 'status']);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain(`Proxy is not running (last known port ${stalePort})`);
    expect(status.stdout).toContain('Profile: stale');
  });

  it('surfaces the actual adaptive port in status and activation output', async () => {
    createProfileConfig({
      hf: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      },
    });
    expect(runCli(['proxy', 'start', 'hf', '--host', '127.0.0.1']).status).toBe(0);
    const status = runCli(['proxy', 'status', 'hf']);
    expect(status.status).toBe(0);
    const port = getRunningPort(status.stdout);
    expect(status.stdout).toContain(`Proxy running on port ${port}`);
    expect(status.stdout).toContain('Host: 127.0.0.1');
    expect(status.stdout).toContain('Profile: hf');
    const activate = runCli(['proxy', 'activate', 'hf', '--shell', 'bash']);
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

  it('respects an explicit --port override in status output', async () => {
    const port = await getPort();
    createProfileConfig({
      hf: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      },
    });
    const started = runCli(['proxy', 'start', 'hf', '--port', String(port), '--host', '127.0.0.1']);
    expect(started.status).toBe(0);
    const status = runCli(['proxy', 'status', 'hf']);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain(`Proxy running on port ${port}`);
    expect(status.stdout).toContain(`Local URL: http://127.0.0.1:${port}`);
  }, 35000);

  it('rejects malformed explicit port values instead of coercing numeric prefixes', () => {
    createProfileConfig({
      hf: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      },
    });

    const invalid = runCli(['proxy', 'start', 'hf', '--port', '3456junk']);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Invalid port: 3456junk');
  });

  it('requires an explicit profile when activating with multiple running proxies', async () => {
    const firstPort = await getPort();
    createProfileConfig({
      ccg: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-ccg',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      },
      ccgm: {
        ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'sk-ccgm',
        ANTHROPIC_MODEL: 'gpt-4.1',
      },
    });
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
