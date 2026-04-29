import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

describe('Gemini refresh delegation', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let moduleVersion = 0;

  beforeEach(() => {
    moduleVersion += 1;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-gemini-delegation-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_HOME = tempHome;
    delete process.env.CCS_DIR;
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });

    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    if (originalCcsDir === undefined) {
      delete process.env.CCS_DIR;
    } else {
      process.env.CCS_DIR = originalCcsDir;
    }
  });

  it('treats Gemini as runtime-managed even when the local token lacks OAuth client metadata', async () => {
    const { getProviderAuthDir } = await import(
      `../../../src/cliproxy/config-generator?gemini-delegation-config=${moduleVersion}`
    );
    const { ensureTokenValid } = await import(
      `../../../src/cliproxy/auth/token-manager?gemini-delegation-manager=${moduleVersion}`
    );

    const authDir = getProviderAuthDir('gemini');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      path.join(authDir, 'gemini-delegated.json'),
      JSON.stringify(
        {
          type: 'gemini',
          email: 'delegated@example.com',
          project_id: 'delegated-project',
          token: {
            access_token: 'expired-access-token',
            refresh_token: 'still-present-refresh-token',
            expiry: Date.now() - 60_000,
          },
        },
        null,
        2
      )
    );

    const result = await ensureTokenValid('gemini');

    expect(result).toEqual({
      valid: true,
      refreshed: false,
    });
  });
});
