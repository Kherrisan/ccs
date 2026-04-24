import { describe, expect, it } from 'bun:test';
import { parseGitLabPatAuthResponse } from '../../../src/cliproxy/auth/gitlab-pat-response';

describe('parseGitLabPatAuthResponse', () => {
  it('sanitizes HTML error bodies for non-ok responses', () => {
    const result = parseGitLabPatAuthResponse(
      false,
      502,
      '<html><body>gateway error</body></html>',
      'glpat-secret-token'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe('[HTML error response omitted]');
    }
  });

  it('sanitizes reflected PAT tokens from structured error payloads', () => {
    const result = parseGitLabPatAuthResponse(
      false,
      400,
      JSON.stringify({ status: 'error', error: 'Rejected token glpat-secret-token for login' }),
      'glpat-secret-token'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain('[redacted]');
      expect(result.errorMessage).not.toContain('glpat-secret-token');
    }
  });

  it('rejects ok responses whose body is not valid success JSON', () => {
    const result = parseGitLabPatAuthResponse(
      true,
      200,
      'upstream temporarily unavailable',
      'glpat-secret-token'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain('upstream temporarily unavailable');
    }
  });

  it('accepts explicit success payloads', () => {
    const result = parseGitLabPatAuthResponse(
      true,
      200,
      JSON.stringify({ status: 'ok', saved_path: '/tmp/gitlab.json' }),
      'glpat-secret-token'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.status).toBe('ok');
    }
  });
});
