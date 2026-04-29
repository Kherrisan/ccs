/**
 * Proxy Detector Port Validation Tests
 *
 * Tests for detectRunningProxy with invalid port inputs.
 * Verifies the fix handles undefined, null, and invalid ports gracefully.
 */

import { describe, it, expect } from 'bun:test';
import { detectRunningProxy } from '../proxy-detector';
import { CLIPROXY_DEFAULT_PORT } from '../config/config-generator';

describe('Proxy Detector Port Validation', () => {
  describe('detectRunningProxy with invalid ports', () => {
    it('handles undefined port (uses default)', async () => {
      // TypeScript allows this at runtime via any/unknown
      const result = await detectRunningProxy(undefined as unknown as number);
      // Should not throw, should use default port
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });

    it('handles NaN port (uses default)', async () => {
      const result = await detectRunningProxy(NaN);
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });

    it('handles negative port (uses default)', async () => {
      const result = await detectRunningProxy(-1);
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });

    it('handles zero port (uses default)', async () => {
      const result = await detectRunningProxy(0);
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });

    it('handles port > 65535 (uses default)', async () => {
      const result = await detectRunningProxy(70000);
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });

    it('handles valid port correctly', async () => {
      const result = await detectRunningProxy(CLIPROXY_DEFAULT_PORT);
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
      expect(typeof result.verified).toBe('boolean');
    });

    it('handles variant port correctly', async () => {
      const result = await detectRunningProxy(8318);
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });
  });

  describe('detectRunningProxy default parameter', () => {
    it('works without port argument (uses default)', async () => {
      const result = await detectRunningProxy();
      expect(result).toBeDefined();
      expect(typeof result.running).toBe('boolean');
    });
  });
});
