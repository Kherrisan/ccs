/**
 * Tests for delegation-handler CLI flag passthrough feature
 * Covers: parseStringFlag, timeout validation, max-turns validation, agents JSON validation
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';

// Import the DelegationHandler class
import { DelegationHandler } from '../../../src/delegation/delegation-handler';

describe('DelegationHandler', () => {
  let handler: DelegationHandler;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    handler = new DelegationHandler();
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('_extractOptions - timeout validation', () => {
    it('accepts valid positive timeout', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--timeout', '30000']);
      expect(options.timeout).toBe(30000);
    });

    it('rejects NaN timeout with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--timeout', 'abc']);
      expect(options.timeout).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects negative timeout with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--timeout', '-5000']);
      expect(options.timeout).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects zero timeout with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--timeout', '0']);
      expect(options.timeout).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects timeout exceeding max (600000ms) with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--timeout', '700000']);
      expect(options.timeout).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('ignores missing timeout value at end of args', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--timeout']);
      expect(options.timeout).toBeUndefined();
    });
  });

  describe('_extractOptions - max-turns validation', () => {
    it('accepts valid positive max-turns', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--max-turns', '10']);
      expect(options.maxTurns).toBe(10);
    });

    it('rejects NaN max-turns with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--max-turns', 'abc']);
      expect(options.maxTurns).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects negative max-turns with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--max-turns', '-5']);
      expect(options.maxTurns).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects zero max-turns with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--max-turns', '0']);
      expect(options.maxTurns).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('caps max-turns at 100 when exceeding limit', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--max-turns', '500']);
      expect(options.maxTurns).toBe(100);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('accepts max-turns at exactly 100', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--max-turns', '100']);
      expect(options.maxTurns).toBe(100);
    });
  });

  describe('_extractOptions - fallback-model validation', () => {
    it('accepts valid fallback-model', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--fallback-model', 'sonnet']);
      expect(options.fallbackModel).toBe('sonnet');
    });

    it('rejects dash-prefixed value with warning', () => {
      const options = handler._extractOptions([
        'glm',
        '-p',
        'test',
        '--fallback-model',
        '--other-flag',
      ]);
      expect(options.fallbackModel).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects empty string value', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--fallback-model', '']);
      expect(options.fallbackModel).toBeUndefined();
    });

    it('rejects whitespace-only value', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--fallback-model', '   ']);
      expect(options.fallbackModel).toBeUndefined();
    });
  });

  describe('_extractOptions - agents JSON validation', () => {
    it('accepts valid JSON for agents', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--agents', '{"name":"test"}']);
      expect(options.agents).toBe('{"name":"test"}');
    });

    it('rejects invalid JSON with warning', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--agents', '{invalid json}']);
      expect(options.agents).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects dash-prefixed value', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--agents', '--other']);
      expect(options.agents).toBeUndefined();
    });

    it('accepts JSON array for agents', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--agents', '[{"a":1}]']);
      expect(options.agents).toBe('[{"a":1}]');
    });
  });

  describe('_extractOptions - betas validation', () => {
    it('accepts valid betas value', () => {
      const options = handler._extractOptions([
        'glm',
        '-p',
        'test',
        '--betas',
        'feature1,feature2',
      ]);
      expect(options.betas).toBe('feature1,feature2');
    });

    it('rejects dash-prefixed value', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--betas', '--feature']);
      expect(options.betas).toBeUndefined();
    });
  });

  describe('_extractOptions - extraArgs passthrough', () => {
    it('passes unknown flags through to extraArgs', () => {
      const options = handler._extractOptions(['glm', '-p', 'test', '--unknown-flag', 'value']);
      expect(options.extraArgs).toContain('--unknown-flag');
      expect(options.extraArgs).toContain('value');
    });

    it('excludes CCS-handled flags from extraArgs', () => {
      const options = handler._extractOptions([
        'glm',
        '-p',
        'test',
        '--max-turns',
        '10',
        '--unknown',
        'val',
      ]);
      expect(options.extraArgs).not.toContain('--max-turns');
      expect(options.extraArgs).not.toContain('10');
      expect(options.extraArgs).toContain('--unknown');
    });

    it('passes Claude effort override through to extraArgs', () => {
      const options = handler._extractOptions(['glm', '--effort', 'low', '-p', 'test']);
      expect(options.extraArgs).toEqual(['--effort', 'low']);
    });
  });

  describe('_extractProfile', () => {
    it('extracts profile name from first non-flag arg', () => {
      const profile = handler._extractProfile(['glm', '-p', 'test']);
      expect(profile).toBe('glm');
    });

    it('returns empty string when no profile found', () => {
      const profile = handler._extractProfile(['-p', 'test']);
      expect(profile).toBe('');
    });

    it('skips flag values correctly', () => {
      const profile = handler._extractProfile(['-p', 'test', 'kimi']);
      expect(profile).toBe('kimi');
    });

    it('skips effort flag values before profile names', () => {
      const profile = handler._extractProfile(['--effort', 'low', 'glm', '-p', 'test']);
      expect(profile).toBe('glm');
    });

    it('keeps leading profile names before effort flags', () => {
      const profile = handler._extractProfile(['glm', '--effort', 'low', '-p', 'test']);
      expect(profile).toBe('glm');
    });
  });
});
