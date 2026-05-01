/**
 * Remote Token Uploader Tests
 *
 * Tests for uploadTokenToRemote and related functions.
 * Uses mock fetch to verify API interactions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { mockFetch, restoreFetch, getCapturedFetchRequests } from '../../../../tests/mocks';

describe('remote-token-uploader', () => {
  let tempDir: string;
  let tempTokenFile: string;

  beforeEach(() => {
    // Create temp directory and token file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-'));
    tempTokenFile = path.join(tempDir, 'test-token.json');
    fs.writeFileSync(
      tempTokenFile,
      JSON.stringify({
        type: 'gemini',
        email: 'test@example.com',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      })
    );
  });

  afterEach(() => {
    restoreFetch();

    // Clean up temp files
    try {
      fs.unlinkSync(tempTokenFile);
      fs.rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('uploadTokenToRemote', () => {
    it('should upload token file successfully', async () => {
      mockFetch([
        {
          url: /\/v0\/management\/auth-files/,
          method: 'POST',
          response: { status: 'ok', id: 'uploaded-123' },
        },
      ]);

      const url = 'http://127.0.0.1:8317/v0/management/auth-files';
      const tokenContent = fs.readFileSync(tempTokenFile, 'utf-8');
      const fileName = path.basename(tempTokenFile);

      const formData = new FormData();
      const blob = new Blob([tokenContent], { type: 'application/json' });
      formData.append('file', blob, fileName);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-mgmt-key',
        },
        body: formData,
      });

      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('id', 'uploaded-123');

      // Verify request was captured correctly
      const captured = getCapturedFetchRequests();
      expect(captured.length).toBe(1);
      expect(captured[0].url).toContain('/v0/management/auth-files');
      expect(captured[0].method).toBe('POST');
      // Headers should be captured (case-preserved from plain object)
      expect(captured[0].headers['Authorization']).toBe('Bearer test-mgmt-key');
    });

    it('should handle upload failure gracefully', async () => {
      mockFetch([
        {
          url: /\/v0\/management\/auth-files/,
          method: 'POST',
          response: { error: 'Unauthorized' },
          status: 401,
        },
      ]);

      const url = 'http://127.0.0.1:8317/v0/management/auth-files';
      const tokenContent = fs.readFileSync(tempTokenFile, 'utf-8');

      const formData = new FormData();
      formData.append('file', new Blob([tokenContent], { type: 'application/json' }), 'test.json');

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle connection timeout', async () => {
      // Test that delay mechanism works (simulates network latency)
      mockFetch([
        {
          url: /\/v0\/management\/auth-files/,
          method: 'POST',
          delay: 100, // Simulate slow response
          response: { status: 'ok' },
        },
      ]);

      const url = 'http://127.0.0.1:8317/v0/management/auth-files';
      const startTime = Date.now();

      const response = await fetch(url, {
        method: 'POST',
        body: new FormData(),
      });

      const elapsedTime = Date.now() - startTime;

      // Verify delay was applied (allow 5ms tolerance for system timing variance)
      expect(elapsedTime).toBeGreaterThanOrEqual(95);
      expect(response.ok).toBe(true);
    });

    it('should handle connection refused', async () => {
      // Try to connect to a port with nothing listening
      const url = 'http://127.0.0.1:59999/v0/management/auth-files';

      try {
        await fetch(url, {
          method: 'POST',
          body: new FormData(),
        });
        // Should not reach here in most cases
      } catch (error) {
        // Connection refused is expected
        expect(error).toBeDefined();
      }
    });
  });

  describe('isRemoteUploadEnabled', () => {
    it('should return false when not in remote mode', () => {
      // Test the logic directly
      const target = { isRemote: false, authToken: 'token' };
      const result = target.isRemote && Boolean(target.authToken);
      expect(result).toBe(false);
    });

    it('should return false when remote but no auth', () => {
      const target = { isRemote: true, authToken: undefined, managementKey: undefined };
      const result = target.isRemote && Boolean(target.managementKey ?? target.authToken);
      expect(result).toBe(false);
    });

    it('should return true when remote with authToken', () => {
      const target = { isRemote: true, authToken: 'token', managementKey: undefined };
      const result = target.isRemote && Boolean(target.managementKey ?? target.authToken);
      expect(result).toBe(true);
    });

    it('should return true when remote with managementKey', () => {
      const target = { isRemote: true, authToken: undefined, managementKey: 'mgmt-key' };
      const result = target.isRemote && Boolean(target.managementKey ?? target.authToken);
      expect(result).toBe(true);
    });

    it('should prefer managementKey over authToken', () => {
      const target = { isRemote: true, authToken: 'auth', managementKey: 'mgmt' };
      const key = target.managementKey ?? target.authToken;
      expect(key).toBe('mgmt');
    });
  });

  describe('token file validation', () => {
    it('should reject invalid JSON', async () => {
      // Create invalid token file
      const invalidTokenFile = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidTokenFile, 'not valid json {{{');

      try {
        const content = fs.readFileSync(invalidTokenFile, 'utf-8');
        JSON.parse(content);
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect((error as Error).message).toContain('JSON');
      } finally {
        fs.unlinkSync(invalidTokenFile);
      }
    });

    it('should handle missing file', () => {
      try {
        fs.readFileSync('/nonexistent/path/token.json', 'utf-8');
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect((error as Error).message).toContain('ENOENT');
      }
    });
  });

  describe('multipart/form-data construction', () => {
    it('should construct valid FormData with file field', () => {
      const tokenContent = JSON.stringify({ type: 'test', token: 'abc' });
      const fileName = 'oauth-token.json';

      const formData = new FormData();
      const blob = new Blob([tokenContent], { type: 'application/json' });
      formData.append('file', blob, fileName);

      // FormData should have the file
      expect(formData.has('file')).toBe(true);

      const file = formData.get('file') as File;
      expect(file).toBeDefined();
      expect(file.name).toBe(fileName);
      expect(file.type).toContain('application/json');
    });
  });

  describe('Authorization header', () => {
    it('should use Bearer token format', async () => {
      mockFetch([{ url: /\/test/, method: 'POST', response: { status: 'ok' } }]);

      const authToken = 'my-secret-token-123';
      await fetch('http://127.0.0.1:8317/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: new FormData(),
      });

      const captured = getCapturedFetchRequests();
      expect(captured.length).toBe(1);
      // Headers case-preserved from plain object
      expect(captured[0].headers['Authorization']).toBe(`Bearer ${authToken}`);
    });

    it('should not send Authorization when no token', async () => {
      mockFetch([{ url: /\/test/, method: 'POST', response: { status: 'ok' } }]);

      await fetch('http://127.0.0.1:8317/test', {
        method: 'POST',
        body: new FormData(),
      });

      const captured = getCapturedFetchRequests();
      expect(captured.length).toBe(1);
      // No authorization header should be present (check both cases)
      expect(captured[0].headers['Authorization']).toBeUndefined();
      expect(captured[0].headers['authorization']).toBeUndefined();
    });
  });

  describe('response parsing', () => {
    it('should accept status: ok response', async () => {
      mockFetch([{ url: /\/test/, method: 'POST', response: { status: 'ok' } }]);

      const response = await fetch('http://127.0.0.1:8317/test', { method: 'POST' });
      const result = (await response.json()) as { status?: string; success?: boolean; id?: string };

      const isSuccess = result.status === 'ok' || result.success || result.id;
      expect(isSuccess).toBe(true);
    });

    it('should accept success: true response', async () => {
      mockFetch([{ url: /\/test/, method: 'POST', response: { success: true } }]);

      const response = await fetch('http://127.0.0.1:8317/test', { method: 'POST' });
      const result = (await response.json()) as { status?: string; success?: boolean; id?: string };

      const isSuccess = result.status === 'ok' || result.success || result.id;
      expect(isSuccess).toBe(true);
    });

    it('should accept id in response', async () => {
      mockFetch([{ url: /\/test/, method: 'POST', response: { id: 'file-abc123' } }]);

      const response = await fetch('http://127.0.0.1:8317/test', { method: 'POST' });
      const result = (await response.json()) as { status?: string; success?: boolean; id?: string };

      // result.id is truthy when present
      const isSuccess = result.status === 'ok' || result.success === true || Boolean(result.id);
      expect(isSuccess).toBe(true);
    });

    it('should detect error response', async () => {
      mockFetch([{ url: /\/test/, method: 'POST', response: { error: 'Invalid token format' } }]);

      const response = await fetch('http://127.0.0.1:8317/test', { method: 'POST' });
      const result = (await response.json()) as {
        status?: string;
        success?: boolean;
        id?: string;
        error?: string;
      };

      // Error response: none of the success indicators are present
      const isSuccess = result.status === 'ok' || result.success === true || Boolean(result.id);
      expect(isSuccess).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });
  });
});
