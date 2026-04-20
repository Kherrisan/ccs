import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import getPort from 'get-port';
import {
  getOpenAICompatProxyStatus,
  listOpenAICompatProxyStatuses,
  startOpenAICompatProxy,
  stopOpenAICompatProxy,
} from '../../../src/proxy/proxy-daemon';
import { resolveOpenAICompatProfileConfig } from '../../../src/proxy/profile-router';
import {
  getLegacyOpenAICompatProxyPidPath,
  getLegacyOpenAICompatProxySessionPath,
  getOpenAICompatProxySessionPath,
} from '../../../src/proxy/proxy-daemon-paths';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';

let originalCcsHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-openai-proxy-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(async () => {
  await stopOpenAICompatProxy();
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('openai proxy daemon lifecycle', () => {
  it('starts, reports status, serves health/models, and stops', async () => {
    const port = await getPort();
    const settingsPath = path.join(tempDir, 'hf.settings.json');
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

    const profile = resolveOpenAICompatProfileConfig('hf', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected an OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile, { port });
    expect(started.success).toBe(true);
    expect(started.authToken).toBeTruthy();

    const status = await getOpenAICompatProxyStatus();
    expect(status.running).toBe(true);
    expect(status.profileName).toBe('hf');
    expect(status.authToken).toBe(started.authToken);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const models = (await (
      await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { 'x-api-key': started.authToken! },
      })
    ).json()) as { data?: Array<{ id: string }> };
    expect(models.data?.map((entry) => entry.id)).toEqual(['qwen3-coder']);

    const stopped = await stopOpenAICompatProxy();
    expect(stopped.success).toBe(true);
    expect((await getOpenAICompatProxyStatus()).running).toBe(false);
  }, 35000);

  it('allows different profiles to run on different ports', async () => {
    const firstPort = await getPort();
    const firstSettingsPath = path.join(tempDir, 'hf.settings.json');
    fs.writeFileSync(
      firstSettingsPath,
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
    const firstProfile = resolveOpenAICompatProfileConfig('hf', firstSettingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!firstProfile) {
      throw new Error('Expected first OpenAI-compatible profile');
    }

    const firstStart = await startOpenAICompatProxy(firstProfile, { port: firstPort });
    expect(firstStart.success).toBe(true);

    const secondPort = await getPort();
    const secondSettingsPath = path.join(tempDir, 'openai.settings.json');
    fs.writeFileSync(
      secondSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-openai',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );
    const secondProfile = resolveOpenAICompatProfileConfig('openai', secondSettingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-openai',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!secondProfile) {
      throw new Error('Expected second OpenAI-compatible profile');
    }

    const secondStart = await startOpenAICompatProxy(secondProfile, { port: secondPort });
    expect(secondStart.success).toBe(true);
    expect(secondStart.port).toBe(secondPort);

    const health = await fetch(`http://127.0.0.1:${firstPort}/health`);
    expect(health.status).toBe(200);

    const secondHealth = await fetch(`http://127.0.0.1:${secondPort}/health`);
    expect(secondHealth.status).toBe(200);
  });

  it('keeps a legacy singleton daemon visible across upgrade', async () => {
    const port = await getPort();
    const settingsPath = path.join(tempDir, 'legacy.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-legacy',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('legacy', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama-legacy',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected a legacy OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile, { port });
    expect(started.success).toBe(true);
    expect(started.pid).toBeDefined();

    const proxyDir = path.dirname(getLegacyOpenAICompatProxyPidPath());
    fs.writeFileSync(getLegacyOpenAICompatProxyPidPath(), String(started.pid), 'utf8');
    fs.writeFileSync(
      getLegacyOpenAICompatProxySessionPath(),
      JSON.stringify(
        {
          profileName: profile.profileName,
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port,
          baseUrl: profile.baseUrl,
          authToken: started.authToken,
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    fs.rmSync(path.join(proxyDir, 'legacy.daemon.pid'), { force: true });
    fs.rmSync(path.join(proxyDir, 'legacy.session.json'), { force: true });

    const status = await getOpenAICompatProxyStatus('legacy');
    expect(status.running).toBe(true);
    expect(status.port).toBe(port);

    const restarted = await startOpenAICompatProxy(profile);
    expect(restarted.success).toBe(true);
    expect(restarted.alreadyRunning).toBe(true);
    expect(restarted.port).toBe(port);

    const stopped = await stopOpenAICompatProxy('legacy');
    expect(stopped.success).toBe(true);
    expect(fs.existsSync(getLegacyOpenAICompatProxyPidPath())).toBe(false);
    expect(fs.existsSync(getLegacyOpenAICompatProxySessionPath())).toBe(false);
  }, 35000);

  it('fails when an explicit port is already occupied', async () => {
    const occupiedPort = await getPort();
    const server = Bun.serve({
      port: occupiedPort,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });

    try {
      const settingsPath = path.join(tempDir, 'occupied-explicit.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-explicit',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('explicit', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-explicit',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected an explicit-port OpenAI-compatible profile');
      }

      const started = await startOpenAICompatProxy(profile, { port: occupiedPort });
      expect(started.success).toBe(false);
      expect(started.port).toBe(occupiedPort);
      expect(started.error).toContain(`Requested proxy port ${occupiedPort} is already in use`);
    } finally {
      server.stop(true);
    }
  });

  it('fails when a configured profile port is already occupied', async () => {
    const occupiedPort = await getPort();
    const server = Bun.serve({
      port: occupiedPort,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });

    try {
      mutateUnifiedConfig((config) => {
        config.proxy = {
          ...(config.proxy ?? {}),
          profile_ports: { mapped: occupiedPort },
        };
      });

      const settingsPath = path.join(tempDir, 'occupied-mapped.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-mapped',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('mapped', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-mapped',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected a mapped-port OpenAI-compatible profile');
      }

      const started = await startOpenAICompatProxy(profile);
      expect(started.success).toBe(false);
      expect(started.port).toBe(occupiedPort);
      expect(started.error).toContain(`Requested proxy port ${occupiedPort} is already in use`);
    } finally {
      server.stop(true);
    }
  });

  it('keeps the existing proxy running if replacement startup fails', async () => {
    const firstPort = await getPort();
    const occupiedPort = await getPort();
    const busyServer = Bun.serve({
      port: occupiedPort,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });

    try {
      const settingsPath = path.join(tempDir, 'rollback.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-rollback',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('rollback', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-rollback',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected a rollback OpenAI-compatible profile');
      }

      const firstStart = await startOpenAICompatProxy(profile, { port: firstPort });
      expect(firstStart.success).toBe(true);

      const restarted = await startOpenAICompatProxy(profile, { port: occupiedPort });
      expect(restarted.success).toBe(false);

      const status = await getOpenAICompatProxyStatus('rollback');
      expect(status.running).toBe(true);
      expect(status.port).toBe(firstPort);
      expect((await fetch(`http://127.0.0.1:${firstPort}/health`)).status).toBe(200);
    } finally {
      busyServer.stop(true);
    }
  });

  it('reuses the last-known port even when it is outside the default fallback range', async () => {
    const preferredPort = await getPort();
    const settingsPath = path.join(tempDir, 'outside-range.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-outside-range',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('outside-range', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama-outside-range',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected an outside-range OpenAI-compatible profile');
    }

    fs.mkdirSync(path.dirname(getOpenAICompatProxySessionPath('outside-range')), { recursive: true });
    fs.writeFileSync(
      getOpenAICompatProxySessionPath('outside-range'),
      JSON.stringify(
        {
          profileName: profile.profileName,
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port: preferredPort,
          baseUrl: profile.baseUrl,
          authToken: 'stale-token',
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const started = await startOpenAICompatProxy(profile);
    expect(started.success).toBe(true);
    expect(started.port).toBe(preferredPort);
  });

  it('stops legacy daemons even when the legacy session is missing a profile name', async () => {
    const port = await getPort();
    const settingsPath = path.join(tempDir, 'legacy-missing-profile.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-legacy-missing-profile',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('legacy-missing-profile', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama-legacy-missing-profile',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected a legacy fallback OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile, { port });
    expect(started.success).toBe(true);
    expect(started.pid).toBeDefined();

    const proxyDir = path.dirname(getLegacyOpenAICompatProxyPidPath());
    fs.writeFileSync(getLegacyOpenAICompatProxyPidPath(), String(started.pid), 'utf8');
    fs.writeFileSync(
      getLegacyOpenAICompatProxySessionPath(),
      JSON.stringify(
        {
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port,
          baseUrl: profile.baseUrl,
          authToken: started.authToken,
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    fs.rmSync(path.join(proxyDir, 'legacy-missing-profile.daemon.pid'), { force: true });
    fs.rmSync(path.join(proxyDir, 'legacy-missing-profile.session.json'), { force: true });

    const statuses = await listOpenAICompatProxyStatuses();
    expect(statuses.some((status) => status.port === port)).toBe(true);

    const stopped = await stopOpenAICompatProxy();
    expect(stopped.success).toBe(true);
    expect(fs.existsSync(getLegacyOpenAICompatProxyPidPath())).toBe(false);
    expect(fs.existsSync(getLegacyOpenAICompatProxySessionPath())).toBe(false);
  }, 35000);

  it('keeps the requested profile name in stopped status results', async () => {
    const status = await getOpenAICompatProxyStatus('never-started');
    expect(status.running).toBe(false);
    expect(status.profileName).toBe('never-started');
  });
});
