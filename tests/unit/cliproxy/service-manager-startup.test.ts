import { describe, expect, it, mock } from 'bun:test';

const ensureBinaryCalls: Array<unknown> = [];

mock.module('../../../src/cliproxy/binary-manager', () => ({
  ensureCLIProxyBinary: async (_verbose = false, options?: unknown) => {
    ensureBinaryCalls.push(options);
    throw new Error(
      'CLIProxy Plus binary is not installed locally. Run "ccs cliproxy install" when you have network access.'
    );
  },
}));

mock.module('../../../src/cliproxy/config-generator', () => ({
  ensureConfigDir: () => undefined,
  generateConfig: () => '/tmp/cliproxy-config.yaml',
  regenerateConfig: () => '/tmp/cliproxy-config.yaml',
  configNeedsRegeneration: () => false,
  CLIPROXY_DEFAULT_PORT: 8317,
  getCliproxyWritablePath: () => '/tmp',
}));

mock.module('../../../src/cliproxy/proxy-detector', () => ({
  detectRunningProxy: async () => ({ running: false, verified: false }),
  waitForProxyHealthy: async () => false,
}));

mock.module('../../../src/cliproxy/startup-lock', () => ({
  withStartupLock: async <T>(fn: () => Promise<T>) => await fn(),
}));

mock.module('../../../src/cliproxy/session-tracker', () => ({
  registerSession: () => undefined,
}));

mock.module('../../../src/cliproxy/stats-fetcher', () => ({
  isCliproxyRunning: async () => false,
}));

mock.module('../../../src/cliproxy/auth/token-refresh-config', () => ({
  getTokenRefreshConfig: () => null,
}));

mock.module('../../../src/cliproxy/auth/token-refresh-worker', () => ({
  TokenRefreshWorker: class {
    isActive(): boolean {
      return false;
    }
    start(): void {}
    stop(): void {}
  },
}));

const { ensureCliproxyService } = await import(
  `../../../src/cliproxy/service-manager?service-manager-startup=${Date.now()}`
);

describe('ensureCliproxyService', () => {
  it('fails fast without attempting a runtime install when the local binary is missing', async () => {
    ensureBinaryCalls.length = 0;

    const result = await ensureCliproxyService(8317, false);

    expect(result).toEqual({
      started: false,
      alreadyRunning: false,
      port: 8317,
      error:
        'Failed to prepare binary: CLIProxy Plus binary is not installed locally. Run "ccs cliproxy install" when you have network access.',
    });
    expect(ensureBinaryCalls).toEqual([
      {
        allowInstall: false,
        skipAutoUpdate: true,
      },
    ]);
  });
});
