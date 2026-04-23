import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let originalCcsHome: string | undefined;
let tempHome = '';

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-binary-manager-'));
  process.env.CCS_HOME = tempHome;
});

afterEach(() => {
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  if (tempHome && fs.existsSync(tempHome)) {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

describe('installCliproxyVersion', () => {
  it('degrades explicit plus backend requests to original before install flows run', async () => {
    let seenBackend: string | undefined;

    const binaryManager = await import(
      `../../../src/cliproxy/binary-manager?binary-manager-explicit-plus=${Date.now()}`
    );

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: (_config: unknown, backend: string) => {
        seenBackend = backend;
        return {
          isBinaryInstalled: () => false,
          deleteBinary: () => undefined,
          ensureBinary: async () => '/tmp/ccs-bin/original/cliproxy',
        };
      },
      stopProxyFn: async () => ({ stopped: false, error: 'No active CLIProxy session found' }),
      waitForPortFreeFn: async () => true,
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(seenBackend).toBe('original');
  });

  it('returns original and emits a real warning when plus backend is resolved locally', async () => {
    const binaryManager = await import(
      `../../../src/cliproxy/binary-manager?binary-manager-warning=${Date.now()}`
    );

    const writes: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      expect(binaryManager.resolveLocalBackend('plus', { warnOnFallback: true })).toBe('original');
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(writes.join('')).toContain('CLIProxyAPIPlus upstream repo is currently unavailable');
    expect(writes.join('')).toContain('backend: original');
  });

  it('reuses plus binary and pin state when local runtime falls back to original', async () => {
    const { createEmptyUnifiedConfig } = await import('../../../src/config/unified-config-types');
    const { saveUnifiedConfig } = await import('../../../src/config/unified-config-loader');
    const { savePinnedVersion } = await import('../../../src/cliproxy/binary/version-cache');
    const { getExecutableName } = await import('../../../src/cliproxy/platform-detector');
    const binaryService = await import(
      `../../../src/cliproxy/services/binary-service?binary-service-plus-migration=${Date.now()}`
    );

    const config = createEmptyUnifiedConfig();
    config.cliproxy = { ...config.cliproxy, backend: 'plus' };
    saveUnifiedConfig(config);

    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');
    fs.mkdirSync(plusBinDir, { recursive: true });
    fs.writeFileSync(path.join(plusBinDir, getExecutableName('plus')), 'fake-binary');
    fs.writeFileSync(path.join(plusBinDir, '.version'), '6.6.80-0');
    savePinnedVersion('6.6.80-0', 'plus');

    const status = binaryService.getBinaryStatus();

    expect(status.installed).toBe(true);
    expect(status.pinnedVersion).toBe('6.6.80-0');
    expect(status.binaryPath).toContain('/original/');
  });

  it('attempts to stop the proxy even when there is no tracked running session', async () => {
    const calls = {
      stopProxy: 0,
      waitForPortFree: 0,
      deleteBinary: 0,
      ensureBinary: 0,
    };

    const binaryManager = await import(
      `../../../src/cliproxy/binary-manager?binary-manager-install=${Date.now()}`
    );

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: () => ({
        isBinaryInstalled: () => false,
        deleteBinary: () => {
          calls.deleteBinary += 1;
        },
        ensureBinary: async () => {
          calls.ensureBinary += 1;
          return '/tmp/ccs-bin/plus/cliproxy';
        },
      }),
      stopProxyFn: async () => {
        calls.stopProxy += 1;
        return { stopped: false, error: 'No active CLIProxy session found' };
      },
      waitForPortFreeFn: async () => {
        calls.waitForPortFree += 1;
        return true;
      },
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(calls.stopProxy).toBe(1);
    expect(calls.waitForPortFree).toBe(0);
    expect(calls.deleteBinary).toBe(0);
    expect(calls.ensureBinary).toBe(1);
  });

  it('fails fast when runtime startup forbids installing a missing binary', async () => {
    const binaryManager = await import(
      `../../../src/cliproxy/binary-manager?binary-manager-runtime=${Date.now()}`
    );

    await expect(
      binaryManager.ensureCLIProxyBinary(false, {
        allowInstall: false,
        skipAutoUpdate: true,
      })
    ).rejects.toThrow(
      'CLIProxy binary is not installed locally. Run "ccs cliproxy install" when you have network access.'
    );
  });
});
