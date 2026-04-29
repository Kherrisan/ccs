/**
 * Profile Mapper for CLIProxy Sync
 *
 * Transforms CCS settings-based profiles into CLIProxy ClaudeKey format.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../../utils/config-manager';
import { expandPath } from '../../utils/helpers';
import { listApiProfiles, isApiProfileConfigured } from '../../api/services/profile-reader';
import type { ClaudeKey } from '../management-api-types';

/**
 * Profile info with settings for sync.
 */
export interface SyncableProfile {
  /** Profile name (e.g., "glm", "kimi") */
  name: string;
  /** Path to settings.json file */
  settingsPath: string;
  /** Whether profile has valid API key */
  isConfigured: boolean;
  /** Environment variables from settings.json */
  env?: Record<string, string>;
}

/**
 * Settings.json file structure (Claude compatible).
 */
interface SettingsJson {
  env?: Record<string, string>;
}

function resolveProfileSettingsPath(settingsPath: string): string {
  const normalized = settingsPath.replace(/\\/g, '/');
  if (normalized.startsWith('~/.ccs/')) {
    return path.join(getCcsDir(), normalized.slice('~/.ccs/'.length));
  }

  return expandPath(settingsPath);
}

/**
 * Load syncable API profiles from CCS config.
 * Filters to only configured profiles (with real API keys).
 */
export function loadSyncableProfiles(): SyncableProfile[] {
  const { profiles } = listApiProfiles();
  const syncable: SyncableProfile[] = [];

  for (const profile of profiles) {
    // Skip unconfigured profiles
    if (!profile.isConfigured) {
      continue;
    }

    // Local CLIProxy sync writes Claude-compatible entries only.
    // Profiles pinned to non-claude targets are intentionally skipped.
    if (profile.target !== 'claude') {
      continue;
    }

    // Load settings.json for env vars
    const settingsPath = resolveProfileSettingsPath(profile.settingsPath);

    let env: Record<string, string> | undefined;
    try {
      if (fs.existsSync(settingsPath)) {
        const content = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(content) as SettingsJson;
        env = settings.env;
      }
    } catch {
      // Skip profiles with unreadable settings
      continue;
    }

    // Must have ANTHROPIC_AUTH_TOKEN
    const token = env?.ANTHROPIC_AUTH_TOKEN;
    if (!token || token.includes('YOUR_') || token.includes('your-')) {
      continue;
    }

    syncable.push({
      name: profile.name,
      settingsPath,
      isConfigured: true,
      env,
    });
  }

  return syncable;
}

/**
 * Sanitize profile name for YAML safety.
 * Replaces non-alphanumeric chars (except - and _) with hyphens.
 */
function sanitizeProfileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-');
}

/**
 * Map a single profile to ClaudeKey format.
 */
export function mapProfileToClaudeKey(profile: SyncableProfile): ClaudeKey | null {
  const env = profile.env;
  if (!env) return null;

  const apiKey = env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) return null;

  const baseUrl = env.ANTHROPIC_BASE_URL;
  const modelName = env.ANTHROPIC_MODEL;

  // Generate prefix from profile name (e.g., "glm" -> "glm-")
  const sanitizedName = sanitizeProfileName(profile.name);
  if (!sanitizedName || sanitizedName === '') {
    return null; // Skip profiles with invalid names
  }

  // Skip if name is too long (>64 chars)
  if (sanitizedName.length > 64) {
    return null;
  }

  // Skip if name has no alphanumeric characters (e.g., only special chars -> "-----")
  if (!/[a-zA-Z0-9]/.test(sanitizedName)) {
    return null;
  }

  const prefix = `${sanitizedName}-`;

  const claudeKey: ClaudeKey = {
    'api-key': apiKey,
    prefix,
  };

  if (baseUrl) {
    claudeKey['base-url'] = baseUrl;
  }

  // Use model name directly from profile (no alias mapping)
  if (modelName) {
    claudeKey.models = [
      {
        name: modelName,
        alias: '',
      },
    ];

    // Append extra models from ANTHROPIC_EXTRA_MODELS env var (comma-separated).
    // Skip duplicates of the primary model and any repeated entries to keep
    // the synced CLIProxy `models` array clean.
    const extraModelsRaw = env.ANTHROPIC_EXTRA_MODELS;
    if (extraModelsRaw && extraModelsRaw.trim()) {
      const seen = new Set<string>([modelName]);
      const extraModels = extraModelsRaw
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0);
      for (const extra of extraModels) {
        if (seen.has(extra)) {
          continue;
        }
        seen.add(extra);
        claudeKey.models.push({
          name: extra,
          alias: '',
        });
      }
    }
  }

  return claudeKey;
}

/**
 * Generate sync payload from all configured profiles.
 * Returns array of ClaudeKey ready to push to remote CLIProxy.
 */
export function generateSyncPayload(): ClaudeKey[] {
  const profiles = loadSyncableProfiles();
  const keys: ClaudeKey[] = [];

  for (const profile of profiles) {
    const key = mapProfileToClaudeKey(profile);
    if (key) {
      keys.push(key);
    }
  }

  return keys;
}

/**
 * Generate sync preview with profile details.
 * Used for dry-run mode to show what would be synced.
 */
export interface SyncPreviewItem {
  /** Profile name */
  name: string;
  /** Base URL (masked) */
  baseUrl?: string;
  /** Model name */
  modelName?: string;
}

export function generateSyncPreview(): SyncPreviewItem[] {
  const profiles = loadSyncableProfiles();
  const preview: SyncPreviewItem[] = [];

  for (const profile of profiles) {
    preview.push({
      name: profile.name,
      baseUrl: profile.env?.ANTHROPIC_BASE_URL,
      modelName: profile.env?.ANTHROPIC_MODEL,
    });
  }

  return preview;
}

/**
 * Get count of syncable profiles.
 */
export function getSyncableProfileCount(): number {
  return loadSyncableProfiles().length;
}

/**
 * Check if profile is syncable (configured with valid API key).
 */
export function isProfileSyncable(profileName: string): boolean {
  return isApiProfileConfigured(profileName);
}
