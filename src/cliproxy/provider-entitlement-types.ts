import type { AccountTier } from './accounts/types';

export type ProviderEntitlementSource =
  | 'runtime_api'
  | 'runtime_inference'
  | 'registry_cache'
  | 'official_docs';

export type ProviderAccessState =
  | 'entitled'
  | 'not_entitled'
  | 'capacity_exhausted'
  | 'temporarily_unavailable'
  | 'unknown';

export type ProviderCapacityState =
  | 'available'
  | 'capacity_exhausted'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'unknown';

export interface ProviderEntitlementEvidence {
  normalizedTier: AccountTier;
  rawTierId: string | null;
  rawTierLabel: string | null;
  source: ProviderEntitlementSource;
  confidence: 'high' | 'medium' | 'low';
  accessState: ProviderAccessState;
  capacityState: ProviderCapacityState;
  lastVerifiedAt: number;
  notes?: string | null;
}
