import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';
import {
  resolveOpenAICompatProxyAdaptivePort,
  resolveOpenAICompatProxyPortPreference,
  resolveOpenAICompatProxyPreferredPort,
} from '../../../src/proxy/proxy-port-resolver';

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

  it('returns a configured shared proxy port as a shared preference', () => {
    mutateUnifiedConfig((config) => {
      config.proxy = {
        ...(config.proxy ?? {}),
        port: 45_000,
        profile_ports: {},
      };
    });

    expect(resolveOpenAICompatProxyPortPreference('ccg')).toEqual({
      port: 45_000,
      source: 'shared',
    });
  });

  it('treats legacy shared 3456 as an adaptive default on read', () => {
    mutateUnifiedConfig((config) => {
      config.proxy = {
        ...(config.proxy ?? {}),
        port: 3456,
        profile_ports: {},
      };
    });

    expect(resolveOpenAICompatProxyPortPreference('ccg')).toEqual({
      port: resolveOpenAICompatProxyAdaptivePort('ccg'),
      source: 'adaptive',
    });
  });

  it('preserves an explicit shared 43456 port when the user configures it', () => {
    mutateUnifiedConfig((config) => {
      config.proxy = {
        ...(config.proxy ?? {}),
        port: 43_456,
        profile_ports: {},
      };
    });

    expect(resolveOpenAICompatProxyPortPreference('ccg')).toEqual({
      port: 43_456,
      source: 'shared',
    });
  });

  it('falls back to an adaptive shared default when no profile mapping exists', () => {
    const portPreference = resolveOpenAICompatProxyPortPreference('ccg');

    expect(portPreference).toEqual({
      port: resolveOpenAICompatProxyAdaptivePort('ccg'),
      source: 'adaptive',
    });
    expect(resolveOpenAICompatProxyPreferredPort('ccg')).not.toBe(3456);
  });

  it('derives a stable adaptive default that does not keep all profiles on 3456', () => {
    const first = resolveOpenAICompatProxyPreferredPort('ccg');
    const second = resolveOpenAICompatProxyPreferredPort('ccg');
    const other = resolveOpenAICompatProxyPreferredPort('ccgm');

    expect(first).toBe(second);
    expect(first).not.toBe(3456);
    expect(other).not.toBe(3456);
    expect(other).not.toBe(first);
  });
});
