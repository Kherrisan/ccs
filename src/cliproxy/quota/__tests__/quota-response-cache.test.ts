/**
 * Quota Response Cache Unit Tests
 *
 * Tests for in-memory quota caching with TTL expiration
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getCachedQuota,
  setCachedQuota,
  invalidateQuotaCache,
  invalidateProviderCache,
  clearQuotaCache,
  getQuotaCacheStats,
  QUOTA_CACHE_TTL_MS,
} from '../quota-response-cache';

interface TestQuota {
  success: boolean;
  buckets: { label: string; remainingPercent: number }[];
}

describe('Quota Response Cache', () => {
  beforeEach(() => {
    clearQuotaCache();
  });

  afterEach(() => {
    clearQuotaCache();
  });

  describe('setCachedQuota and getCachedQuota', () => {
    it('should store and retrieve quota data', () => {
      const quota: TestQuota = {
        success: true,
        buckets: [{ label: 'Flash', remainingPercent: 80 }],
      };

      setCachedQuota('gemini', 'user@example.com', quota);
      const cached = getCachedQuota<TestQuota>('gemini', 'user@example.com');

      expect(cached).not.toBeNull();
      expect(cached?.success).toBe(true);
      expect(cached?.buckets[0].remainingPercent).toBe(80);
    });

    it('should return null for non-existent cache entry', () => {
      const cached = getCachedQuota('gemini', 'nonexistent@example.com');
      expect(cached).toBeNull();
    });

    it('should isolate cache entries by provider', () => {
      const geminiQuota: TestQuota = { success: true, buckets: [] };
      const codexQuota = { success: true, windows: [] };

      setCachedQuota('gemini', 'user@example.com', geminiQuota);
      setCachedQuota('codex', 'user@example.com', codexQuota);

      const cached1 = getCachedQuota<TestQuota>('gemini', 'user@example.com');
      const cached2 = getCachedQuota<{ windows: unknown[] }>('codex', 'user@example.com');

      expect(cached1?.buckets).toBeDefined();
      expect(cached2?.windows).toBeDefined();
    });

    it('should isolate cache entries by account', () => {
      const quota1: TestQuota = { success: true, buckets: [{ label: 'A', remainingPercent: 50 }] };
      const quota2: TestQuota = { success: true, buckets: [{ label: 'B', remainingPercent: 90 }] };

      setCachedQuota('gemini', 'user1@example.com', quota1);
      setCachedQuota('gemini', 'user2@example.com', quota2);

      const cached1 = getCachedQuota<TestQuota>('gemini', 'user1@example.com');
      const cached2 = getCachedQuota<TestQuota>('gemini', 'user2@example.com');

      expect(cached1?.buckets[0].label).toBe('A');
      expect(cached2?.buckets[0].label).toBe('B');
    });

    it('should update existing cache entry', () => {
      const quota1: TestQuota = { success: true, buckets: [{ label: 'X', remainingPercent: 30 }] };
      const quota2: TestQuota = { success: true, buckets: [{ label: 'X', remainingPercent: 70 }] };

      setCachedQuota('gemini', 'user@example.com', quota1);
      setCachedQuota('gemini', 'user@example.com', quota2);

      const cached = getCachedQuota<TestQuota>('gemini', 'user@example.com');
      expect(cached?.buckets[0].remainingPercent).toBe(70);
    });
  });

  describe('cache TTL expiration', () => {
    it('should return data within TTL', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user@example.com', quota);

      // Immediately retrieve (well within TTL)
      const cached = getCachedQuota<TestQuota>('gemini', 'user@example.com');
      expect(cached).not.toBeNull();
    });

    it('should return null for expired cache with custom TTL', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user@example.com', quota);

      // Request with 0ms TTL (effectively expired immediately)
      const cached = getCachedQuota<TestQuota>('gemini', 'user@example.com', 0);
      expect(cached).toBeNull();
    });

    it('should return null for expired cache entry', async () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user@example.com', quota);

      // Wait briefly and use very short TTL
      await new Promise((resolve) => setTimeout(resolve, 10));
      const cached = getCachedQuota<TestQuota>('gemini', 'user@example.com', 5);
      expect(cached).toBeNull();
    });

    it('should delete expired entries on access', async () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user@example.com', quota);

      // First access should find it
      const stats1 = getQuotaCacheStats();
      expect(stats1.size).toBe(1);

      // Access with short TTL should expire and delete
      await new Promise((resolve) => setTimeout(resolve, 10));
      getCachedQuota('gemini', 'user@example.com', 5);

      // Entry should be deleted
      const stats2 = getQuotaCacheStats();
      expect(stats2.size).toBe(0);
    });
  });

  describe('invalidateQuotaCache', () => {
    it('should invalidate specific account cache', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user@example.com', quota);
      setCachedQuota('gemini', 'other@example.com', quota);

      invalidateQuotaCache('gemini', 'user@example.com');

      expect(getCachedQuota('gemini', 'user@example.com')).toBeNull();
      expect(getCachedQuota('gemini', 'other@example.com')).not.toBeNull();
    });

    it('should be safe to call on non-existent entry', () => {
      // Should not throw
      invalidateQuotaCache('gemini', 'nonexistent@example.com');
      expect(getCachedQuota('gemini', 'nonexistent@example.com')).toBeNull();
    });
  });

  describe('invalidateProviderCache', () => {
    it('should invalidate all accounts for a provider', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user1@example.com', quota);
      setCachedQuota('gemini', 'user2@example.com', quota);
      setCachedQuota('codex', 'user1@example.com', quota);

      invalidateProviderCache('gemini');

      expect(getCachedQuota('gemini', 'user1@example.com')).toBeNull();
      expect(getCachedQuota('gemini', 'user2@example.com')).toBeNull();
      expect(getCachedQuota('codex', 'user1@example.com')).not.toBeNull();
    });

    it('should be safe to call for non-existent provider', () => {
      // Should not throw
      invalidateProviderCache('nonexistent');
      expect(getQuotaCacheStats().size).toBe(0);
    });
  });

  describe('clearQuotaCache', () => {
    it('should clear all cache entries', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user1@example.com', quota);
      setCachedQuota('gemini', 'user2@example.com', quota);
      setCachedQuota('codex', 'user@example.com', quota);
      setCachedQuota('agy', 'user@example.com', quota);

      const statsBefore = getQuotaCacheStats();
      expect(statsBefore.size).toBe(4);

      clearQuotaCache();

      const statsAfter = getQuotaCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('getQuotaCacheStats', () => {
    it('should return correct cache size', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user1@example.com', quota);
      setCachedQuota('codex', 'user2@example.com', quota);

      const stats = getQuotaCacheStats();
      expect(stats.size).toBe(2);
    });

    it('should return cache entry keys', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('gemini', 'user@example.com', quota);
      setCachedQuota('codex', 'other@example.com', quota);

      const stats = getQuotaCacheStats();
      expect(stats.entries).toContain('gemini:user@example.com');
      expect(stats.entries).toContain('codex:other@example.com');
    });

    it('should return empty stats for empty cache', () => {
      const stats = getQuotaCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toHaveLength(0);
    });
  });

  describe('QUOTA_CACHE_TTL_MS constant', () => {
    it('should be 2 minutes (120000ms)', () => {
      expect(QUOTA_CACHE_TTL_MS).toBe(2 * 60 * 1000);
    });
  });

  describe('cache key generation', () => {
    it('should handle special characters in account IDs', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      const accountWithPlus = 'user+tag@example.com';
      const accountWithDots = 'first.last@example.com';

      setCachedQuota('gemini', accountWithPlus, quota);
      setCachedQuota('gemini', accountWithDots, quota);

      expect(getCachedQuota('gemini', accountWithPlus)).not.toBeNull();
      expect(getCachedQuota('gemini', accountWithDots)).not.toBeNull();
    });

    it('should handle empty strings gracefully', () => {
      const quota: TestQuota = { success: true, buckets: [] };
      setCachedQuota('', '', quota);

      // Should still work, even if unusual
      const stats = getQuotaCacheStats();
      expect(stats.entries).toContain(':');
    });
  });

  describe('concurrent access patterns', () => {
    it('should handle rapid set/get operations', () => {
      const quota: TestQuota = { success: true, buckets: [] };

      // Simulate rapid updates
      for (let i = 0; i < 100; i++) {
        setCachedQuota('gemini', 'user@example.com', {
          ...quota,
          buckets: [{ label: `iter-${i}`, remainingPercent: i }],
        });
      }

      const cached = getCachedQuota<TestQuota>('gemini', 'user@example.com');
      expect(cached?.buckets[0].label).toBe('iter-99');
    });

    it('should handle multiple providers simultaneously', () => {
      const providers = ['gemini', 'codex', 'agy'];
      const accounts = ['user1@example.com', 'user2@example.com'];
      const quota: TestQuota = { success: true, buckets: [] };

      // Set cache for all combinations
      for (const provider of providers) {
        for (const account of accounts) {
          setCachedQuota(provider, account, {
            ...quota,
            buckets: [{ label: `${provider}-${account}`, remainingPercent: 50 }],
          });
        }
      }

      const stats = getQuotaCacheStats();
      expect(stats.size).toBe(6);

      // Verify all entries exist
      for (const provider of providers) {
        for (const account of accounts) {
          const cached = getCachedQuota<TestQuota>(provider, account);
          expect(cached?.buckets[0].label).toBe(`${provider}-${account}`);
        }
      }
    });
  });
});
