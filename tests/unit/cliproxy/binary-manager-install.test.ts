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
