import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import browserRoutes from '../../../src/web-server/routes/browser-routes';
import { loadOrCreateUnifiedConfig } from '../../../src/config/unified-config-loader';

describe('browser routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalDashboardAuthEnabled: string | undefined;
  let forcedRemoteAddress = '127.0.0.1';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: forcedRemoteAddress,
        configurable: true,
      });
      next();
    });
    app.use('/api/browser', browserRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const onError = (error: Error) => reject(error);

      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccs-browser-routes-'));
    originalCcsHome = process.env.CCS_HOME;
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    process.env.CCS_HOME = tempHome;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '127.0.0.1';
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }

    rmSync(tempHome, { recursive: true, force: true });
  });

  it('blocks remote access when dashboard auth is disabled', async () => {
    forcedRemoteAddress = '10.10.0.24';

    const response = await fetch(`${baseUrl}/api/browser`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Browser endpoints require localhost access when dashboard auth is disabled.',
    });
  });

  it('returns the default browser config and status payload', async () => {
    const response = await fetch(`${baseUrl}/api/browser`);
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.config).toMatchObject({
      claude: {
        enabled: false,
        userDataDir: join(tempHome, '.ccs', 'browser', 'chrome-user-data'),
        devtoolsPort: 9222,
      },
      codex: {
        enabled: true,
      },
    });
    expect(payload.status.claude).toMatchObject({
      state: 'disabled',
      managedMcpServerName: 'ccs-browser',
    });
    expect(payload.status.codex).toMatchObject({
      enabled: true,
      serverName: 'ccs_browser',
    });
  });

  it('updates the saved browser config through the dashboard route', async () => {
    const response = await fetch(`${baseUrl}/api/browser`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claude: {
          enabled: true,
          userDataDir: '/tmp/ccs-browser',
          devtoolsPort: 9333,
        },
        codex: {
          enabled: false,
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.browser.config).toMatchObject({
      claude: {
        enabled: true,
        userDataDir: '/tmp/ccs-browser',
        devtoolsPort: 9333,
      },
      codex: {
        enabled: false,
      },
    });

    const config = loadOrCreateUnifiedConfig();
    expect(config.browser).toMatchObject({
      claude: {
        enabled: true,
        user_data_dir: '/tmp/ccs-browser',
        devtools_port: 9333,
      },
      codex: {
        enabled: false,
      },
    });
  });

  it('treats a blank user-data directory as a reset to the recommended path', async () => {
    const firstResponse = await fetch(`${baseUrl}/api/browser`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claude: {
          enabled: true,
          userDataDir: '/tmp/ccs-browser-custom',
          devtoolsPort: 9333,
        },
      }),
    });

    expect(firstResponse.status).toBe(200);

    const resetResponse = await fetch(`${baseUrl}/api/browser`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claude: {
          userDataDir: '   ',
        },
      }),
    });

    expect(resetResponse.status).toBe(200);
    const payload = await resetResponse.json();
    expect(payload.browser.config.claude).toMatchObject({
      enabled: true,
      userDataDir: join(tempHome, '.ccs', 'browser', 'chrome-user-data'),
      devtoolsPort: 9333,
    });
    expect(payload.browser.status.claude.state).toBe('browser_not_running');
    expect(payload.browser.status.claude.detail).toContain('CCS created the managed browser profile');
    expect(existsSync(join(tempHome, '.ccs', 'browser', 'chrome-user-data'))).toBe(true);

    const config = loadOrCreateUnifiedConfig();
    expect(config.browser).toMatchObject({
      claude: {
        enabled: true,
        user_data_dir: join(tempHome, '.ccs', 'browser', 'chrome-user-data'),
        devtools_port: 9333,
      },
    });
  });

  it('rejects invalid DevTools ports at the route boundary', async () => {
    const response = await fetch(`${baseUrl}/api/browser`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claude: {
          devtoolsPort: 0,
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid value for claude.devtoolsPort. Must be an integer between 1 and 65535.',
    });
  });
});
