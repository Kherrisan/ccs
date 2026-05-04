/**
 * Official Channels IDs (leaf module, no runtime dependencies)
 *
 * Pure helpers extracted from `official-channels-runtime` so that
 * config-loader code can use them without transitively pulling in
 * `claude-detector` / `shell-executor` / `websearch-manager`.
 *
 * The full channel definitions (with display names, plugin specs, env keys,
 * etc.) live in `official-channels-runtime`. This module only owns:
 * - the canonical ordered list of channel IDs
 * - the type-narrowing predicate
 * - the order-preserving normalizer
 * - the legacy-discord shim
 */

import type { OfficialChannelId } from '../config/unified-config-types';

/** Canonical, ordered list of official channel IDs. */
export const OFFICIAL_CHANNEL_IDS: readonly OfficialChannelId[] = [
  'telegram',
  'discord',
  'imessage',
] as const;

const OFFICIAL_CHANNEL_ID_SET = new Set<string>(OFFICIAL_CHANNEL_IDS);

export function isOfficialChannelId(value: string): value is OfficialChannelId {
  return OFFICIAL_CHANNEL_ID_SET.has(value);
}

export function normalizeOfficialChannelIds(values: readonly string[]): OfficialChannelId[] {
  const seen = new Set<OfficialChannelId>();
  const normalized: OfficialChannelId[] = [];

  for (const channelId of OFFICIAL_CHANNEL_IDS) {
    if (!values.includes(channelId) || seen.has(channelId)) {
      continue;
    }
    seen.add(channelId);
    normalized.push(channelId);
  }

  return normalized;
}

export function resolveLegacyDiscordSelection(enabled: boolean | undefined): OfficialChannelId[] {
  return enabled ? ['discord'] : [];
}
