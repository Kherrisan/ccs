import type { CLIProxyProvider } from '../../cliproxy/types';
import { isCLIProxyProvider } from '../../cliproxy/provider-capabilities';

export interface MergedAccountEntry {
  type: string;
  created: string;
  last_used: string | null;
  context_mode?: 'isolated' | 'shared';
  context_group?: string;
  continuity_mode?: 'standard' | 'deeper';
  context_inferred?: boolean;
  continuity_inferred?: boolean;
  shared_resource_mode?: 'shared' | 'profile-local';
  shared_resource_inferred?: boolean;
  bare?: boolean;
  provider?: string;
  displayName?: string;
}

/** Parse CLIProxy account key format: "provider:accountId" */
export function parseCliproxyKey(
  key: string
): { provider: CLIProxyProvider; accountId: string } | null {
  let normalizedKey = key;
  if (key.startsWith('cliproxy:')) {
    normalizedKey = key.slice('cliproxy:'.length);
  } else if (key.startsWith('cliproxy+')) {
    normalizedKey = key.slice('cliproxy+'.length);
  }
  const colonIndex = normalizedKey.indexOf(':');
  if (colonIndex === -1) return null;

  const provider = normalizedKey.slice(0, colonIndex);
  const accountId = normalizedKey.slice(colonIndex + 1);

  if (!isCLIProxyProvider(provider) || !accountId) return null;
  return { provider, accountId };
}

export function buildCliproxyAccountKey(
  rawKey: string,
  merged: Record<string, MergedAccountEntry>
): string | null {
  const candidateKeys = [rawKey, `cliproxy:${rawKey}`, `cliproxy+${rawKey}`];
  for (const key of candidateKeys) {
    if (!merged[key]) {
      return key;
    }
  }
  return null;
}
