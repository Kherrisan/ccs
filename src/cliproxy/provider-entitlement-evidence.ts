import type { AccountTier } from './accounts/types';
import type {
  ProviderAccessState,
  ProviderCapacityState,
  ProviderEntitlementEvidence,
  ProviderEntitlementSource,
} from './provider-entitlement-types';

const RAW_TIER_LABELS: Record<string, string> = {
  'free-tier': 'Free',
  'legacy-tier': 'Legacy',
  'standard-tier': 'Standard',
  'g1-pro-tier': 'Pro',
  'g1-ultra-tier': 'Ultra',
};

export function normalizeProviderTierId(rawTierId: string | null | undefined): AccountTier {
  if (!rawTierId) return 'unknown';
  const normalized = rawTierId.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('ultra')) return 'ultra';
  if (normalized.includes('pro')) return 'pro';
  if (normalized.includes('free') || normalized.includes('legacy')) return 'free';
  return 'unknown';
}

export function getProviderTierLabel(rawTierId: string | null | undefined): string | null {
  if (!rawTierId) return null;
  const normalized = rawTierId.trim().toLowerCase();
  return normalized ? (RAW_TIER_LABELS[normalized] ?? rawTierId.trim()) : null;
}

export function buildProviderEntitlementEvidence(input: {
  normalizedTier: AccountTier;
  rawTierId?: string | null;
  rawTierLabel?: string | null;
  source: ProviderEntitlementSource;
  confidence: 'high' | 'medium' | 'low';
  accessState: ProviderAccessState;
  capacityState: ProviderCapacityState;
  notes?: string | null;
  lastVerifiedAt?: number;
}): ProviderEntitlementEvidence {
  const rawTierId = input.rawTierId?.trim() || null;
  return {
    normalizedTier: input.normalizedTier,
    rawTierId,
    rawTierLabel: input.rawTierLabel ?? getProviderTierLabel(rawTierId),
    source: input.source,
    confidence: input.confidence,
    accessState: input.accessState,
    capacityState: input.capacityState,
    notes: input.notes ?? null,
    lastVerifiedAt: input.lastVerifiedAt ?? Date.now(),
  };
}

export function isModelCapacityExhausted(
  message: string | null | undefined,
  detail: string | null | undefined,
  errorCode: string | null | undefined
): boolean {
  const haystack = `${message || ''} ${detail || ''} ${errorCode || ''}`.toLowerCase();
  return (
    haystack.includes('model_capacity_exhausted') ||
    haystack.includes('no capacity available') ||
    haystack.includes('capacity exhausted')
  );
}
