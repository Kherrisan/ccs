import { render, screen } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
import { AccountSurfaceCard } from '@/components/account/shared/account-surface-card';
import type { GeminiCliQuotaResult } from '@/lib/api-client';

function createGeminiQuotaResult(
  overrides: Partial<GeminiCliQuotaResult> = {}
): GeminiCliQuotaResult {
  return {
    success: true,
    buckets: [],
    projectId: 'project-123',
    tierLabel: 'Pro',
    tierId: 'g1-pro-tier',
    creditBalance: 12,
    entitlement: {
      normalizedTier: 'pro',
      rawTierId: 'g1-pro-tier',
      rawTierLabel: 'Pro',
      source: 'runtime_api',
      confidence: 'high',
      accessState: 'entitled',
      capacityState: 'available',
      lastVerifiedAt: Date.now(),
      notes: null,
    },
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('AccountSurfaceCard', () => {
  it('prefers live quota entitlement tier over a stale account tier for Gemini badges', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="gemini"
        accountId="user@example.com"
        email="user@example.com"
        displayEmail="user@example.com"
        tier="unknown"
        quota={createGeminiQuotaResult()}
        showQuota={false}
      />
    );

    expect(screen.getByText('pro')).toBeInTheDocument();
  });
});
