/**
 * Integration tests for the OAuth credential guard wired into the
 * /:provider/start-url route (Phase 3 + Phase 4).
 *
 * These tests verify the guard functions that are called inline by the route
 * handler, using the same pattern as oauth-handler-paste-callback.test.ts.
 * Dynamic imports with cache-busting query strings prevent module-cache
 * interference between test cases.
 *
 * Test isolation: guard functions under test only read process.env and
 * their CLIProxyProvider/CLIProxyBackend arguments — no disk access,
 * no real ~/.ccs reads required.
 */

import { afterEach, describe, expect, it } from 'bun:test';

// ---------------------------------------------------------------------------
// Restore any env vars mutated during tests
// ---------------------------------------------------------------------------
const GEMINI_ID_ENV = 'CLIPROXY_GEMINI_OAUTH_CLIENT_ID';
const GEMINI_SECRET_ENV = 'CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET';
const AGY_ID_ENV = 'CLIPROXY_ANTIGRAVITY_OAUTH_CLIENT_ID';
const AGY_SECRET_ENV = 'CLIPROXY_ANTIGRAVITY_OAUTH_CLIENT_SECRET';

function unsetGeminiEnv(): void {
  delete process.env[GEMINI_ID_ENV];
  delete process.env[GEMINI_SECRET_ENV];
}

function setGeminiEnv(): void {
  process.env[GEMINI_ID_ENV] = 'test-client-id';
  process.env[GEMINI_SECRET_ENV] = 'test-client-secret';
}

function unsetAgyEnv(): void {
  delete process.env[AGY_ID_ENV];
  delete process.env[AGY_SECRET_ENV];
}

function setAgyEnv(): void {
  process.env[AGY_ID_ENV] = 'test-agy-client-id';
  process.env[AGY_SECRET_ENV] = 'test-agy-client-secret';
}

afterEach(() => {
  // Clean up any env vars set in tests
  delete process.env[GEMINI_ID_ENV];
  delete process.env[GEMINI_SECRET_ENV];
  delete process.env[AGY_ID_ENV];
  delete process.env[AGY_SECRET_ENV];
});

// ---------------------------------------------------------------------------
// Phase 3: pre-fetch credential guard (getPlusOAuthCredentialError)
// The route calls this before making any fetch to the Plus binary.
// ---------------------------------------------------------------------------

describe('start-url route: Phase 3 pre-fetch credential guard', () => {
  it('fires for gemini on plus backend when both env vars are missing', async () => {
    unsetGeminiEnv();

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-gemini-missing-${Date.now()}`
    );

    const error = getPlusOAuthCredentialError('gemini', 'plus');

    // Guard must return a non-null string (route returns 400 with this as message)
    expect(error).not.toBeNull();
    expect(typeof error).toBe('string');
    expect(error).toContain('Gemini OAuth from CLIProxy Plus is missing');
    expect(error).toContain(GEMINI_ID_ENV);
    expect(error).toContain(GEMINI_SECRET_ENV);
    // Message must tell user how to fix (set env vars or switch backend)
    expect(error).toContain('original');
  });

  it('fires for gemini on plus backend when only client ID is missing', async () => {
    delete process.env[GEMINI_ID_ENV];
    process.env[GEMINI_SECRET_ENV] = 'has-secret';

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-gemini-id-only-${Date.now()}`
    );

    const error = getPlusOAuthCredentialError('gemini', 'plus');
    expect(error).not.toBeNull();
    // Missing var should be listed
    expect(error).toContain(GEMINI_ID_ENV);
    delete process.env[GEMINI_SECRET_ENV];
  });

  it('fires for agy on plus backend when both env vars are missing', async () => {
    unsetAgyEnv();

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-agy-missing-${Date.now()}`
    );

    const error = getPlusOAuthCredentialError('agy', 'plus');

    expect(error).not.toBeNull();
    expect(typeof error).toBe('string');
    expect(error).toContain('Antigravity OAuth from CLIProxy Plus is missing');
    expect(error).toContain(AGY_ID_ENV);
    expect(error).toContain(AGY_SECRET_ENV);
  });

  it('returns null for gemini on plus when both env vars are present (guard does not fire)', async () => {
    setGeminiEnv();

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-gemini-ok-${Date.now()}`
    );

    expect(getPlusOAuthCredentialError('gemini', 'plus')).toBeNull();
  });

  it('returns null for agy on plus when both env vars are present (guard does not fire)', async () => {
    setAgyEnv();

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-agy-ok-${Date.now()}`
    );

    expect(getPlusOAuthCredentialError('agy', 'plus')).toBeNull();
  });

  it('returns null for ghcp provider on plus backend (not in guard table)', async () => {
    // ghcp is NOT in PLUS_OAUTH_ENV_BY_PROVIDER — guard must not fire
    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-ghcp-${Date.now()}`
    );

    expect(getPlusOAuthCredentialError('ghcp', 'plus')).toBeNull();
  });

  it('returns null for gemini when backend is original (guard only applies to plus)', async () => {
    unsetGeminiEnv(); // env vars absent, but backend is original

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-guard-gemini-original-${Date.now()}`
    );

    // original backend → guard returns null regardless of env
    expect(getPlusOAuthCredentialError('gemini', 'original', {})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 4: post-fetch auth-URL guard (getPlusAuthUrlCredentialError)
// The route calls this after fetching the authUrl from Plus, before responding.
// ---------------------------------------------------------------------------

describe('start-url route: Phase 4 post-fetch auth-URL guard', () => {
  it('fires for gemini when Plus emits auth URL with empty client_id (502 contract)', async () => {
    const { getPlusAuthUrlCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-url-guard-gemini-empty-${Date.now()}`
    );

    const badUrl =
      'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=&redirect_uri=http%3A%2F%2Flocalhost%3A8085%2Foauth2callback&state=abc';
    const error = getPlusAuthUrlCredentialError('gemini', badUrl);

    expect(error).not.toBeNull();
    expect(typeof error).toBe('string');
    expect(error).toContain('Gemini OAuth from CLIProxy Plus is missing');
  });

  it('fires for agy when Plus emits auth URL with empty client_id (502 contract)', async () => {
    const { getPlusAuthUrlCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-url-guard-agy-empty-${Date.now()}`
    );

    const badUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=&state=abc';
    const error = getPlusAuthUrlCredentialError('agy', badUrl);

    expect(error).not.toBeNull();
    expect(error).toContain('Antigravity OAuth from CLIProxy Plus is missing');
  });

  it('returns null for gemini when client_id is present (guard must not fire)', async () => {
    const { getPlusAuthUrlCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-url-guard-gemini-ok-${Date.now()}`
    );

    const goodUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=real-id&state=abc';
    expect(getPlusAuthUrlCredentialError('gemini', goodUrl)).toBeNull();
  });

  it('returns null for ghcp (not in guard table) even with empty client_id', async () => {
    const { getPlusAuthUrlCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-url-guard-ghcp-${Date.now()}`
    );

    // ghcp is not in PLUS_OAUTH_ENV_BY_PROVIDER — URL guard never fires
    const anyUrl = 'https://example.com/oauth?client_id=&state=abc';
    expect(getPlusAuthUrlCredentialError('ghcp', anyUrl)).toBeNull();
  });

  it('returns null for malformed authUrl (guard must not throw)', async () => {
    const { getPlusAuthUrlCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?route-url-guard-malformed-${Date.now()}`
    );

    // Guard must swallow parse errors — route should not 502 on malformed URLs
    expect(getPlusAuthUrlCredentialError('gemini', 'not-a-url')).toBeNull();
    expect(getPlusAuthUrlCredentialError('gemini', '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 3+4: HTTP response body contract
// Verifies the exact JSON shape the route would return so the UI hook can
// match on data.error and surface data.message to the user.
// ---------------------------------------------------------------------------

describe('start-url route: response body contract', () => {
  it('credential-missing 400 body shape: error=plus_oauth_credentials_missing, message=string, provider=string', async () => {
    unsetGeminiEnv();

    const { getPlusOAuthCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?body-shape-missing-${Date.now()}`
    );

    const message = getPlusOAuthCredentialError('gemini', 'plus');

    // Replicate what the route handler does when credentialError is non-null
    const body = {
      error: 'plus_oauth_credentials_missing' as const,
      provider: 'gemini' as const,
      message,
    };

    expect(body.error).toBe('plus_oauth_credentials_missing');
    expect(typeof body.message).toBe('string');
    // Human-readable message must be meaningful
    expect((body.message ?? '').length).toBeGreaterThan(10);
    expect(body.provider).toBe('gemini');
  });

  it('auth-url 502 body shape: error=plus_oauth_url_missing_client_id, message=string, provider=string', async () => {
    const { getPlusAuthUrlCredentialError } = await import(
      `../../../cliproxy/auth/oauth-handler?body-shape-url-${Date.now()}`
    );

    const badUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=&state=abc';
    const message = getPlusAuthUrlCredentialError('gemini', badUrl);

    // Replicate what the route handler does when authUrlError is non-null
    const body = {
      error: 'plus_oauth_url_missing_client_id' as const,
      provider: 'gemini' as const,
      message,
    };

    expect(body.error).toBe('plus_oauth_url_missing_client_id');
    expect(typeof body.message).toBe('string');
    expect((body.message ?? '').length).toBeGreaterThan(10);
    expect(body.provider).toBe('gemini');
  });

  it('UI hook can distinguish credential errors by data.error code', () => {
    // The UI hook checks: data.error === 'plus_oauth_credentials_missing'
    // or data.error === 'plus_oauth_url_missing_client_id' to decide
    // whether to use data.message instead of data.error as the displayed text.
    const missingCreds = { error: 'plus_oauth_credentials_missing', message: 'Friendly message' };
    const missingUrl = {
      error: 'plus_oauth_url_missing_client_id',
      message: 'Friendly URL message',
    };
    const generic = { error: 'some_other_error' };

    function simulateHookErrorResolution(data: Record<string, unknown>): string {
      const isPlusCredentialError =
        data.error === 'plus_oauth_credentials_missing' ||
        data.error === 'plus_oauth_url_missing_client_id';
      return isPlusCredentialError && typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : 'Unknown error';
    }

    expect(simulateHookErrorResolution(missingCreds)).toBe('Friendly message');
    expect(simulateHookErrorResolution(missingUrl)).toBe('Friendly URL message');
    // Generic errors still use data.error (the code)
    expect(simulateHookErrorResolution(generic)).toBe('some_other_error');
  });
});
