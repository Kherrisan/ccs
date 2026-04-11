/**
 * Auth Utilities Unit Tests
 *
 * Tests for shared authentication utility functions
 */

import { describe, it, expect } from 'bun:test';
import {
  getTokenExpiryTimestamp,
  isTokenExpired,
  sanitizeEmail,
} from '../../../src/cliproxy/auth-utils';

describe('Auth Utilities', () => {
  describe('sanitizeEmail', () => {
    it('should replace @ with underscore', () => {
      const result = sanitizeEmail('user@example.com');
      expect(result).not.toContain('@');
      expect(result).toContain('user_example');
    });

    it('should replace . with underscore', () => {
      const result = sanitizeEmail('user@example.com');
      expect(result).not.toContain('.');
      expect(result).toBe('user_example_com');
    });

    it('should handle multiple dots', () => {
      const result = sanitizeEmail('user.name@sub.example.com');
      expect(result).toBe('user_name_sub_example_com');
    });

    it('should handle email without dots in domain', () => {
      const result = sanitizeEmail('user@localhost');
      expect(result).toBe('user_localhost');
    });

    it('should handle empty string', () => {
      const result = sanitizeEmail('');
      expect(result).toBe('');
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for undefined input', () => {
      const result = isTokenExpired(undefined);
      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      const result = isTokenExpired('');
      expect(result).toBe(false);
    });

    it('should return true for past date', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const result = isTokenExpired(pastDate);
      expect(result).toBe(true);
    });

    it('should return false for future date', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const result = isTokenExpired(futureDate);
      expect(result).toBe(false);
    });

    it('should return false for invalid date string', () => {
      // new Date('invalid') returns Invalid Date, getTime() returns NaN
      // NaN < Date.now() is false
      const result = isTokenExpired('not-a-date');
      expect(result).toBe(false);
    });

    it('should handle ISO date strings', () => {
      const pastISO = '2020-01-01T00:00:00.000Z';
      expect(isTokenExpired(pastISO)).toBe(true);

      const futureISO = '2030-01-01T00:00:00.000Z';
      expect(isTokenExpired(futureISO)).toBe(false);
    });

    it('should handle Unix timestamp strings deterministically', () => {
      const pastTimestamp = String(Date.now() - 86400000); // Yesterday
      expect(isTokenExpired(pastTimestamp)).toBe(true);
    });

    it('should handle Unix timestamps provided as numbers', () => {
      const futureTimestamp = Date.now() + 86400000;
      expect(isTokenExpired(futureTimestamp)).toBe(false);
    });

    it('should treat Unix-seconds values as seconds, not milliseconds', () => {
      const futureUnixSeconds = Math.floor((Date.now() + 60000) / 1000);
      expect(isTokenExpired(futureUnixSeconds)).toBe(false);
      expect(isTokenExpired(String(futureUnixSeconds))).toBe(false);
    });

    it('should expose normalized expiry timestamps for string and numeric inputs', () => {
      const futureTimestamp = Date.now() + 60000;
      expect(getTokenExpiryTimestamp(futureTimestamp)).toBe(futureTimestamp);
      expect(getTokenExpiryTimestamp(String(futureTimestamp))).toBe(futureTimestamp);
      const futureUnixSeconds = Math.floor((Date.now() + 60000) / 1000);
      expect(getTokenExpiryTimestamp(futureUnixSeconds)).toBe(futureUnixSeconds * 1000);
      expect(getTokenExpiryTimestamp(String(futureUnixSeconds))).toBe(futureUnixSeconds * 1000);
      expect(getTokenExpiryTimestamp('not-a-date')).toBeNull();
    });
  });
});
