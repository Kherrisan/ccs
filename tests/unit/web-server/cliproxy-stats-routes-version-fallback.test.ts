import { describe, expect, it } from 'bun:test';

describe('cliproxy-stats-routes version fallback', () => {
  it('returns a degraded update-check payload instead of propagating a 500', async () => {
    const { resolveCliproxyUpdateCheckPayload } = await import(
      '../../../src/web-server/routes/cliproxy-stats-routes'
    );

    const body = await resolveCliproxyUpdateCheckPayload('plus', {
      checkCliproxyUpdateFn: async () => {
        throw new Error('GitHub API error: HTTP 403');
      },
      getInstalledVersionFn: () => '6.6.80',
    });

    expect(body).toMatchObject({
      hasUpdate: false,
      currentVersion: '6.6.80',
      latestVersion: '6.6.80',
      backend: 'plus',
      backendLabel: 'CLIProxy Plus',
      fromCache: true,
    });
  });

  it('returns a degraded versions payload instead of propagating a 500', async () => {
    const { resolveCliproxyVersionsPayload } = await import(
      '../../../src/web-server/routes/cliproxy-stats-routes'
    );

    const body = await resolveCliproxyVersionsPayload('plus', {
      fetchAllVersionsFn: async () => {
        throw new Error('GitHub API error: HTTP 403');
      },
      getInstalledVersionFn: () => '6.6.80',
    });

    expect(body).toMatchObject({
      versions: ['6.6.80'],
      latestStable: '6.6.80',
      latest: '6.6.80',
      currentVersion: '6.6.80',
      fromCache: true,
    });
  });
});
