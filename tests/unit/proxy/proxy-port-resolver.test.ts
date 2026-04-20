import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';
import { resolveOpenAICompatProxyPreferredPort } from '../../../src/proxy/proxy-port-resolver';

let originalCcsHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-config-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(() => {
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('resolveOpenAICompatProxyPreferredPort', () => {
  it('returns the configured profile-scoped port when present', () => {
    mutateUnifiedConfig((config) => {
      config.proxy = {
        ...(config.proxy ?? {}),
        port: 3456,
        profile_ports: { ccgm: 3461 },
      };
    });

    expect(resolveOpenAICompatProxyPreferredPort('ccgm')).toBe(3461);
  });

  it('falls back to the shared default port when no profile mapping exists', () => {
    expect(resolveOpenAICompatProxyPreferredPort('ccg')).toBe(3456);
  });
});
