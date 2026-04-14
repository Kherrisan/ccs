import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('version-checker stale cache fallback', () => {
  let originalCcsHome: string | undefined;
  let tempHome = '';

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-version-checker-'));
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

  it('uses a stale latest-version cache when GitHub lookup fails', async () => {
    const {
      getVersionCachePath,
      writeInstalledVersion,
    } = await import('../../../src/cliproxy/binary/version-cache');
    const { VERSION_CACHE_DURATION_MS } = await import('../../../src/cliproxy/binary/types');
    const { checkForUpdates } = await import('../../../src/cliproxy/binary/version-checker');
    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');

    fs.mkdirSync(plusBinDir, { recursive: true });
    writeInstalledVersion(plusBinDir, '6.6.80');
    fs.writeFileSync(
      getVersionCachePath('plus'),
      JSON.stringify({
        latestVersion: '6.9.23-0',
        checkedAt: Date.now() - VERSION_CACHE_DURATION_MS - 1_000,
      }),
      'utf8'
    );

    const result = await checkForUpdates(plusBinDir, '6.6.80', false, 'plus', {
      fetchLatestVersionFn: async () => {
        throw new Error('GitHub API error: HTTP 403');
      },
    });

    expect(result.latestVersion).toBe('6.9.23-0');
    expect(result.currentVersion).toBe('6.6.80');
    expect(result.hasUpdate).toBe(true);
    expect(result.fromCache).toBe(true);
  });

  it('uses a stale release-list cache when GitHub list lookup fails', async () => {
    const { getVersionListCachePath } = await import('../../../src/cliproxy/binary/version-cache');
    const { VERSION_CACHE_DURATION_MS } = await import('../../../src/cliproxy/binary/types');
    const { fetchAllVersions } = await import('../../../src/cliproxy/binary/version-checker');
    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');

    fs.mkdirSync(plusBinDir, { recursive: true });
    fs.writeFileSync(
      getVersionListCachePath('plus'),
      JSON.stringify({
        versions: ['6.9.23-0', '6.9.22-0', '6.9.19-0'],
        latestStable: '6.9.23-0',
        latest: '6.9.23-0',
        checkedAt: Date.now() - VERSION_CACHE_DURATION_MS - 1_000,
      }),
      'utf8'
    );

    const result = await fetchAllVersions(false, 'plus', {
      fetchJsonFn: async () => {
        throw new Error('GitHub API error: HTTP 403');
      },
    });

    expect(result.versions).toEqual(['6.9.23-0', '6.9.22-0', '6.9.19-0']);
    expect(result.latestStable).toBe('6.9.23-0');
    expect(result.latest).toBe('6.9.23-0');
    expect(result.fromCache).toBe(true);
  });
});
