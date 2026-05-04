/**
 * Unit tests for proxy-resolver.ts (Phase 03 extraction)
 *
 * Tests cover the proxy resolution + remote reachability + binary acquisition
 * logic extracted from executor/index.ts.
 */

import { beforeEach, describe, expect, it, jest } from 'bun:test';
import type { ResolveExecutorProxyContext } from '../proxy-resolver';
import type { ExecutorConfig } from '../../types';
import type { UnifiedConfig } from '../../../config/schemas/unified-config';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockEnsureCLIProxyBinary = jest.fn().mockResolvedValue('/usr/local/bin/cliproxy');
const mockGetConfiguredBackend = jest.fn().mockReturnValue('original');
const mockGetPlusBackendUnavailableMessage = jest.fn().mockReturnValue('Plus backend unavailable');

jest.mock('../../binary-manager', () => ({
  ensureCLIProxyBinary: mockEnsureCLIProxyBinary,
  getConfiguredBackend: mockGetConfiguredBackend,
  getPlusBackendUnavailableMessage: mockGetPlusBackendUnavailableMessage,
}));

const mockCheckRemoteProxy = jest.fn();
jest.mock('../../services/remote-proxy-client', () => ({
  checkRemoteProxy: mockCheckRemoteProxy,
}));

jest.mock('../retry-handler', () => ({
  isNetworkError: jest.fn().mockReturnValue(false),
  handleNetworkError: jest.fn(),
}));

const mockResolveProxyConfig = jest.fn();
jest.mock('../../proxy/proxy-config-resolver', () => ({
  resolveProxyConfig: mockResolveProxyConfig,
}));

jest.mock('../../config/config-generator', () => ({
  CLIPROXY_DEFAULT_PORT: 8317,
  validatePort: jest.fn((port: number | undefined) => port ?? 8317),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { resolveExecutorProxy } = await import('../proxy-resolver');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMinimalUnifiedConfig(): UnifiedConfig {
  return {
    cliproxy_server: undefined,
  } as unknown as UnifiedConfig;
}

function makeBaseCfg(): ExecutorConfig {
  return {
    port: 8317,
    timeout: 5000,
    verbose: false,
    pollInterval: 100,
  };
}

function makeContext(
  overrides: Partial<ResolveExecutorProxyContext> = {}
): ResolveExecutorProxyContext {
  return {
    unifiedConfig: makeMinimalUnifiedConfig(),
    allProviders: ['gemini'],
    verbose: false,
    cfg: makeBaseCfg(),
    log: jest.fn(),
    ...overrides,
  };
}

/** Mock resolveProxyConfig to return a local-mode config */
function mockLocalProxyConfig(remainingArgs: string[] = []): void {
  mockResolveProxyConfig.mockReturnValue({
    config: {
      mode: 'local',
      port: 8317,
      protocol: 'http',
      fallbackEnabled: false,
      autoStartLocal: false,
      remoteOnly: false,
      forceLocal: true,
    },
    remainingArgs,
  });
}

/** Mock resolveProxyConfig to return a remote-mode config */
function mockRemoteProxyConfig(remainingArgs: string[] = []): void {
  mockResolveProxyConfig.mockReturnValue({
    config: {
      mode: 'remote',
      host: '192.168.1.100',
      port: 8317,
      protocol: 'http',
      fallbackEnabled: false,
      autoStartLocal: false,
      remoteOnly: false,
      forceLocal: false,
    },
    remainingArgs,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCLIProxyBinary.mockResolvedValue('/usr/local/bin/cliproxy');
  mockGetConfiguredBackend.mockReturnValue('original');
});

describe('resolveExecutorProxy — local mode', () => {
  it('returns useRemoteProxy=false and correct binary for local mode', async () => {
    mockLocalProxyConfig(['--verbose']);
    const result = await resolveExecutorProxy(['--verbose'], makeContext());

    expect(result.useRemoteProxy).toBe(false);
    expect(result.localBackend).toBe('original');
    expect(result.binaryPath).toBe('/usr/local/bin/cliproxy');
    expect(result.argsWithoutProxy).toEqual(['--verbose']);
  });

  it('strips proxy flags and passes remainingArgs through', async () => {
    mockLocalProxyConfig(['clean-arg']);
    const result = await resolveExecutorProxy(['--local-proxy', 'clean-arg'], makeContext());

    expect(result.argsWithoutProxy).toEqual(['clean-arg']);
    expect(result.useRemoteProxy).toBe(false);
  });

  it('does not call checkRemoteProxy in local mode', async () => {
    mockLocalProxyConfig();
    await resolveExecutorProxy([], makeContext());

    expect(mockCheckRemoteProxy).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — remote mode reachable', () => {
  it('returns useRemoteProxy=true when remote proxy is reachable', async () => {
    mockRemoteProxyConfig();
    mockCheckRemoteProxy.mockResolvedValue({ reachable: true, latencyMs: 12, error: undefined });

    const result = await resolveExecutorProxy([], makeContext());

    expect(result.useRemoteProxy).toBe(true);
  });

  it('skips binary acquisition when remote proxy is reachable', async () => {
    mockRemoteProxyConfig();
    mockCheckRemoteProxy.mockResolvedValue({ reachable: true, latencyMs: 5, error: undefined });

    const result = await resolveExecutorProxy([], makeContext());

    expect(result.binaryPath).toBeUndefined();
    expect(mockEnsureCLIProxyBinary).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — remote mode unreachable', () => {
  it('throws expected message when remoteOnly=true and remote is unreachable', async () => {
    mockResolveProxyConfig.mockReturnValue({
      config: {
        mode: 'remote',
        host: '192.168.1.100',
        port: 8317,
        protocol: 'http',
        fallbackEnabled: false,
        autoStartLocal: false,
        remoteOnly: true,
        forceLocal: false,
      },
      remainingArgs: [],
    });
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Connection refused' });

    await expect(resolveExecutorProxy([], makeContext())).rejects.toThrow(
      'Remote proxy unreachable and --remote-only specified'
    );
  });

  it('throws when fallback disabled and remote is unreachable', async () => {
    mockResolveProxyConfig.mockReturnValue({
      config: {
        mode: 'remote',
        host: '192.168.1.100',
        port: 8317,
        protocol: 'http',
        fallbackEnabled: false,
        autoStartLocal: false,
        remoteOnly: false,
        forceLocal: false,
      },
      remainingArgs: [],
    });
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Timeout' });

    await expect(resolveExecutorProxy([], makeContext())).rejects.toThrow(
      'Remote proxy unreachable and fallback disabled'
    );
  });

  it('falls back to local and acquires binary when autoStartLocal=true', async () => {
    mockResolveProxyConfig.mockReturnValue({
      config: {
        mode: 'remote',
        host: '192.168.1.100',
        port: 8317,
        protocol: 'http',
        fallbackEnabled: true,
        autoStartLocal: true,
        remoteOnly: false,
        forceLocal: false,
      },
      remainingArgs: [],
    });
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Timeout' });
    mockEnsureCLIProxyBinary.mockResolvedValue('/usr/local/bin/cliproxy');

    const result = await resolveExecutorProxy([], makeContext());

    expect(result.useRemoteProxy).toBe(false);
    expect(result.binaryPath).toBe('/usr/local/bin/cliproxy');
    expect(mockEnsureCLIProxyBinary).toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — proxyConfig propagated in result', () => {
  it('returns the resolved proxyConfig object', async () => {
    mockLocalProxyConfig();

    const result = await resolveExecutorProxy([], makeContext());

    expect(result.proxyConfig).toBeDefined();
    expect(result.proxyConfig.mode).toBe('local');
    expect(result.proxyConfig.port).toBe(8317);
  });

  it('returns mutated cfg with validated port', async () => {
    mockLocalProxyConfig();
    const ctx = makeContext();

    const result = await resolveExecutorProxy([], ctx);

    // cfg is mutated in place and also returned
    expect(result.cfg).toBe(ctx.cfg);
    expect(result.cfg.port).toBe(8317);
  });
});
