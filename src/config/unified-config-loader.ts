/**
 * Unified Config Loader
 *
 * Loads and saves the unified YAML configuration.
 * Provides fallback to legacy JSON format for backward compatibility.
 *
 * Phase 1-3 refactor (issue #1164): io-locks, normalizers, and yaml-serializer
 * have been extracted to src/config/loader/. This file re-exports everything
 * needed by callers so existing import sites continue to work unchanged.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {
  isUnifiedConfig,
  createEmptyUnifiedConfig,
  UNIFIED_CONFIG_VERSION,
  DEFAULT_COPILOT_CONFIG,
  DEFAULT_CURSOR_CONFIG,
  DEFAULT_GLOBAL_ENV,
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  DEFAULT_CLIPROXY_SAFETY_CONFIG,
  DEFAULT_OPENAI_COMPAT_PROXY_CONFIG,
  DEFAULT_QUOTA_MANAGEMENT_CONFIG,
  DEFAULT_THINKING_CONFIG,
  DEFAULT_OFFICIAL_CHANNELS_CONFIG,
  DEFAULT_DASHBOARD_AUTH_CONFIG,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  DEFAULT_LOGGING_CONFIG,
} from './unified-config-types';
import type {
  UnifiedConfig,
  CLIProxySafetyConfig,
  GlobalEnvConfig,
  ThinkingConfig,
  OfficialChannelsConfig,
  DashboardAuthConfig,
  BrowserConfig,
  ImageAnalysisConfig,
  LoggingConfig,
  CursorConfig,
} from './unified-config-types';
import { isUnifiedConfigEnabled } from './feature-flags';
import { normalizeOfficialChannelIds } from '../channels/official-channels-runtime';
import { canonicalizeImageAnalysisConfig } from '../utils/hooks/image-analysis-backend-resolver';
import { normalizeSearxngBaseUrl } from '../utils/websearch/types';

// Phase 1: io-locks
export {
  CONFIG_YAML,
  CONFIG_JSON,
  CONFIG_LOCK,
  LOCK_STALE_MS,
  GO_DURATION_SEGMENT,
  GO_DURATION_PATTERN,
  getConfigYamlPath,
  getConfigJsonPath,
  acquireLock,
  releaseLock,
  hasUnifiedConfig,
  hasLegacyConfig,
  sleepSync,
  withConfigWriteLock,
} from './loader/io-locks';
import {
  getConfigYamlPath,
  hasUnifiedConfig,
  hasLegacyConfig,
  withConfigWriteLock,
  loadUnifiedConfigWithLockHeld,
  writeUnifiedConfigWithLockHeld,
} from './loader/io-locks';

// Phase 2: normalizers
export {
  normalizeBrowserDevtoolsPort,
  normalizeBrowserPolicy,
  normalizeBrowserEvalMode,
  canonicalizeBrowserConfig,
  normalizeSessionAffinityTtl,
  hasPositiveDuration,
  validateCompositeVariants,
  normalizeContinuityInheritanceMap,
  normalizeContinuityConfig,
  normalizeOfficialChannelsConfig,
} from './loader/normalizers';
import type { LegacyDiscordChannelsConfig } from './loader/normalizers';
import {
  canonicalizeBrowserConfig,
  validateCompositeVariants,
  normalizeContinuityConfig,
  normalizeOfficialChannelsConfig,
  normalizeSessionAffinityTtl,
} from './loader/normalizers';

// Phase 3: yaml-serializer
export { generateYamlHeader, generateYamlWithComments } from './loader/yaml-serializer';
import { generateYamlHeader, generateYamlWithComments } from './loader/yaml-serializer';

// ---------------------------------------------------------------------------
// getConfigFormat (depends on hasUnifiedConfig, hasLegacyConfig, isUnifiedConfigEnabled)
// ---------------------------------------------------------------------------

/**
 * Determine which config format is active.
 * Returns 'yaml' if unified config exists or is enabled,
 * 'json' if only legacy config exists,
 * 'none' if no config exists.
 */
export function getConfigFormat(): 'yaml' | 'json' | 'none' {
  if (hasUnifiedConfig()) return 'yaml';
  if (isUnifiedConfigEnabled()) return 'yaml';
  if (hasLegacyConfig()) return 'json';
  return 'none';
}

// ---------------------------------------------------------------------------
// mergeWithDefaults (Phase 4 territory — kept here until then)
// ---------------------------------------------------------------------------

/**
 * Merge partial config with defaults.
 * Preserves existing data while filling in missing sections.
 */
function mergeWithDefaults(partial: Partial<UnifiedConfig>): UnifiedConfig {
  const defaults = createEmptyUnifiedConfig();
  const continuity = normalizeContinuityConfig(partial);
  return {
    version: partial.version ?? defaults.version,
    setup_completed: partial.setup_completed,
    default: partial.default ?? defaults.default,
    accounts: partial.accounts ?? defaults.accounts,
    profiles: partial.profiles ?? defaults.profiles,
    cliproxy: {
      ...partial.cliproxy,
      oauth_accounts: partial.cliproxy?.oauth_accounts ?? defaults.cliproxy.oauth_accounts,
      providers: defaults.cliproxy.providers, // Always use defaults for providers
      variants: partial.cliproxy?.variants ?? defaults.cliproxy.variants,
      logging: {
        enabled: partial.cliproxy?.logging?.enabled ?? defaults.cliproxy.logging?.enabled ?? false,
        request_log:
          partial.cliproxy?.logging?.request_log ?? defaults.cliproxy.logging?.request_log ?? false,
      },
      safety: {
        antigravity_ack_bypass:
          partial.cliproxy?.safety?.antigravity_ack_bypass ??
          DEFAULT_CLIPROXY_SAFETY_CONFIG.antigravity_ack_bypass,
      },
      // Kiro browser behavior setting (optional)
      kiro_no_incognito: partial.cliproxy?.kiro_no_incognito,
      // Auth config - preserve user values, no defaults (uses constants as fallback)
      auth: partial.cliproxy?.auth,
      // Background token refresh config (optional)
      token_refresh: partial.cliproxy?.token_refresh,
      // Backend selection - validate and preserve user choice (original vs plus)
      backend:
        partial.cliproxy?.backend === 'original' || partial.cliproxy?.backend === 'plus'
          ? partial.cliproxy.backend
          : undefined, // Invalid values become undefined (defaults to 'original' at runtime)
      // Auto-sync - default to true
      auto_sync: partial.cliproxy?.auto_sync ?? defaults.cliproxy.auto_sync ?? true,
      routing: {
        strategy:
          partial.cliproxy?.routing?.strategy === 'fill-first' ||
          partial.cliproxy?.routing?.strategy === 'round-robin'
            ? partial.cliproxy.routing.strategy
            : defaults.cliproxy.routing?.strategy,
        session_affinity:
          typeof partial.cliproxy?.routing?.session_affinity === 'boolean'
            ? partial.cliproxy.routing.session_affinity
            : defaults.cliproxy.routing?.session_affinity,
        session_affinity_ttl: normalizeSessionAffinityTtl(
          partial.cliproxy?.routing?.session_affinity_ttl,
          defaults.cliproxy.routing?.session_affinity_ttl ?? '1h'
        ),
      },
    },
    proxy: {
      port: partial.proxy?.port ?? DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.port,
      profile_ports: partial.proxy?.profile_ports ?? {
        ...DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.profile_ports,
      },
      routing: {
        default: partial.proxy?.routing?.default ?? defaults.proxy?.routing?.default,
        background: partial.proxy?.routing?.background ?? defaults.proxy?.routing?.background,
        think: partial.proxy?.routing?.think ?? defaults.proxy?.routing?.think,
        longContext: partial.proxy?.routing?.longContext ?? defaults.proxy?.routing?.longContext,
        webSearch: partial.proxy?.routing?.webSearch ?? defaults.proxy?.routing?.webSearch,
        longContextThreshold:
          partial.proxy?.routing?.longContextThreshold ??
          defaults.proxy?.routing?.longContextThreshold,
      },
    },
    logging: {
      enabled: partial.logging?.enabled ?? DEFAULT_LOGGING_CONFIG.enabled,
      level: partial.logging?.level ?? DEFAULT_LOGGING_CONFIG.level,
      rotate_mb: partial.logging?.rotate_mb ?? DEFAULT_LOGGING_CONFIG.rotate_mb,
      retain_days: partial.logging?.retain_days ?? DEFAULT_LOGGING_CONFIG.retain_days,
      redact: partial.logging?.redact ?? DEFAULT_LOGGING_CONFIG.redact,
      live_buffer_size:
        partial.logging?.live_buffer_size ?? DEFAULT_LOGGING_CONFIG.live_buffer_size,
    },
    preferences: {
      ...defaults.preferences,
      ...partial.preferences,
    },
    websearch: {
      enabled: partial.websearch?.enabled ?? defaults.websearch?.enabled ?? true,
      providers: {
        exa: {
          enabled: partial.websearch?.providers?.exa?.enabled ?? false,
          max_results: partial.websearch?.providers?.exa?.max_results ?? 5,
        },
        tavily: {
          enabled: partial.websearch?.providers?.tavily?.enabled ?? false,
          max_results: partial.websearch?.providers?.tavily?.max_results ?? 5,
        },
        brave: {
          enabled: partial.websearch?.providers?.brave?.enabled ?? false,
          max_results: partial.websearch?.providers?.brave?.max_results ?? 5,
        },
        searxng: {
          enabled: partial.websearch?.providers?.searxng?.enabled ?? false,
          url: normalizeSearxngBaseUrl(partial.websearch?.providers?.searxng?.url) ?? '',
          max_results: partial.websearch?.providers?.searxng?.max_results ?? 5,
        },
        duckduckgo: {
          enabled: partial.websearch?.providers?.duckduckgo?.enabled ?? true,
          max_results: partial.websearch?.providers?.duckduckgo?.max_results ?? 5,
        },
        gemini: {
          enabled:
            partial.websearch?.providers?.gemini?.enabled ??
            partial.websearch?.gemini?.enabled ?? // Legacy fallback
            false,
          model: partial.websearch?.providers?.gemini?.model ?? 'gemini-2.5-flash',
          timeout:
            partial.websearch?.providers?.gemini?.timeout ??
            partial.websearch?.gemini?.timeout ?? // Legacy fallback
            55,
        },
        opencode: {
          enabled: partial.websearch?.providers?.opencode?.enabled ?? false,
          model: partial.websearch?.providers?.opencode?.model ?? 'opencode/grok-code',
          timeout: partial.websearch?.providers?.opencode?.timeout ?? 90,
        },
        grok: {
          enabled: partial.websearch?.providers?.grok?.enabled ?? false,
          timeout: partial.websearch?.providers?.grok?.timeout ?? 55,
        },
      },
      // Legacy fields (keep for backwards compatibility during read)
      gemini: partial.websearch?.gemini,
    },
    // Copilot config - strictly opt-in, merge with defaults
    copilot: {
      enabled: partial.copilot?.enabled ?? DEFAULT_COPILOT_CONFIG.enabled,
      auto_start: partial.copilot?.auto_start ?? DEFAULT_COPILOT_CONFIG.auto_start,
      port: partial.copilot?.port ?? DEFAULT_COPILOT_CONFIG.port,
      account_type: partial.copilot?.account_type ?? DEFAULT_COPILOT_CONFIG.account_type,
      rate_limit: partial.copilot?.rate_limit ?? DEFAULT_COPILOT_CONFIG.rate_limit,
      wait_on_limit: partial.copilot?.wait_on_limit ?? DEFAULT_COPILOT_CONFIG.wait_on_limit,
      model: partial.copilot?.model ?? DEFAULT_COPILOT_CONFIG.model,
    },
    // Cursor config - disabled by default, merge with defaults
    cursor: {
      enabled: partial.cursor?.enabled ?? DEFAULT_CURSOR_CONFIG.enabled,
      port: partial.cursor?.port ?? DEFAULT_CURSOR_CONFIG.port,
      auto_start: partial.cursor?.auto_start ?? DEFAULT_CURSOR_CONFIG.auto_start,
      ghost_mode: partial.cursor?.ghost_mode ?? DEFAULT_CURSOR_CONFIG.ghost_mode,
      model: partial.cursor?.model ?? DEFAULT_CURSOR_CONFIG.model,
      opus_model: partial.cursor?.opus_model,
      sonnet_model: partial.cursor?.sonnet_model,
      haiku_model: partial.cursor?.haiku_model,
    },
    // Global env - injected into all non-Claude subscription profiles
    global_env: {
      enabled: partial.global_env?.enabled ?? true,
      env: partial.global_env?.env ?? { ...DEFAULT_GLOBAL_ENV },
    },
    continuity,
    // CLIProxy server config - remote/local CLIProxyAPI settings
    cliproxy_server: {
      remote: {
        enabled:
          partial.cliproxy_server?.remote?.enabled ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.enabled,
        host: partial.cliproxy_server?.remote?.host ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.host,
        // Port is optional - undefined means use protocol default (443 for HTTPS, 8317 for HTTP)
        port: partial.cliproxy_server?.remote?.port,
        protocol:
          partial.cliproxy_server?.remote?.protocol ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.remote.protocol,
        auth_token:
          partial.cliproxy_server?.remote?.auth_token ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.remote.auth_token,
        // management_key is optional - falls back to auth_token when not set
        management_key: partial.cliproxy_server?.remote?.management_key,
      },
      fallback: {
        enabled:
          partial.cliproxy_server?.fallback?.enabled ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.fallback.enabled,
        auto_start:
          partial.cliproxy_server?.fallback?.auto_start ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.fallback.auto_start,
      },
      local: {
        port: partial.cliproxy_server?.local?.port ?? DEFAULT_CLIPROXY_SERVER_CONFIG.local.port,
        auto_start:
          partial.cliproxy_server?.local?.auto_start ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.local.auto_start,
      },
    },
    // Quota management config - hybrid auto+manual account selection
    quota_management: {
      mode: partial.quota_management?.mode ?? DEFAULT_QUOTA_MANAGEMENT_CONFIG.mode,
      auto: {
        preflight_check:
          partial.quota_management?.auto?.preflight_check ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.preflight_check,
        exhaustion_threshold:
          partial.quota_management?.auto?.exhaustion_threshold ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.exhaustion_threshold,
        tier_priority:
          partial.quota_management?.auto?.tier_priority ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.tier_priority,
        cooldown_minutes:
          partial.quota_management?.auto?.cooldown_minutes ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.cooldown_minutes,
      },
      manual: {
        paused_accounts:
          partial.quota_management?.manual?.paused_accounts ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.manual.paused_accounts,
        forced_default:
          partial.quota_management?.manual?.forced_default ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.manual.forced_default,
        tier_lock:
          partial.quota_management?.manual?.tier_lock ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.manual.tier_lock,
      },
      runtime_monitor: {
        enabled:
          partial.quota_management?.runtime_monitor?.enabled ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.enabled,
        normal_interval_seconds:
          partial.quota_management?.runtime_monitor?.normal_interval_seconds ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.normal_interval_seconds,
        critical_interval_seconds:
          partial.quota_management?.runtime_monitor?.critical_interval_seconds ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.critical_interval_seconds,
        warn_threshold:
          partial.quota_management?.runtime_monitor?.warn_threshold ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.warn_threshold,
        exhaustion_threshold:
          partial.quota_management?.runtime_monitor?.exhaustion_threshold ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.exhaustion_threshold,
        cooldown_minutes:
          partial.quota_management?.runtime_monitor?.cooldown_minutes ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.cooldown_minutes,
      },
    },
    // Thinking config - auto/manual/off control for reasoning budget
    thinking: {
      mode: partial.thinking?.mode ?? DEFAULT_THINKING_CONFIG.mode,
      override: partial.thinking?.override,
      tier_defaults: {
        opus: partial.thinking?.tier_defaults?.opus ?? DEFAULT_THINKING_CONFIG.tier_defaults.opus,
        sonnet:
          partial.thinking?.tier_defaults?.sonnet ?? DEFAULT_THINKING_CONFIG.tier_defaults.sonnet,
        haiku:
          partial.thinking?.tier_defaults?.haiku ?? DEFAULT_THINKING_CONFIG.tier_defaults.haiku,
      },
      provider_overrides: partial.thinking?.provider_overrides,
      show_warnings: partial.thinking?.show_warnings ?? DEFAULT_THINKING_CONFIG.show_warnings,
    },
    channels: normalizeOfficialChannelsConfig(
      partial as Partial<UnifiedConfig> & { discord_channels?: LegacyDiscordChannelsConfig }
    ),
    // Dashboard auth config - disabled by default
    dashboard_auth: {
      enabled: partial.dashboard_auth?.enabled ?? DEFAULT_DASHBOARD_AUTH_CONFIG.enabled,
      username: partial.dashboard_auth?.username ?? DEFAULT_DASHBOARD_AUTH_CONFIG.username,
      password_hash:
        partial.dashboard_auth?.password_hash ?? DEFAULT_DASHBOARD_AUTH_CONFIG.password_hash,
      session_timeout_hours:
        partial.dashboard_auth?.session_timeout_hours ??
        DEFAULT_DASHBOARD_AUTH_CONFIG.session_timeout_hours,
    },
    browser: canonicalizeBrowserConfig(partial.browser),
    // Image analysis config - enabled by default for CLIProxy providers
    image_analysis: canonicalizeImageAnalysisConfig({
      enabled: partial.image_analysis?.enabled ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled,
      timeout: partial.image_analysis?.timeout ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout,
      provider_models:
        partial.image_analysis?.provider_models ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models,
      fallback_backend:
        partial.image_analysis?.fallback_backend ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.fallback_backend,
      profile_backends:
        partial.image_analysis?.profile_backends ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.profile_backends,
    }),
  };
}

// ---------------------------------------------------------------------------
// Public API — load / save / mutate
// ---------------------------------------------------------------------------

/**
 * Load unified config from YAML file.
 * Returns null if file doesn't exist.
 * Auto-upgrades config if version is outdated (regenerates comments).
 */
export function loadUnifiedConfig(): UnifiedConfig | null {
  const yamlPath = getConfigYamlPath();

  // If file doesn't exist, return null
  if (!fs.existsSync(yamlPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(yamlPath, 'utf8');
    const parsed = yaml.load(content);

    if (!isUnifiedConfig(parsed)) {
      throw new Error(`Invalid config format in ${yamlPath}`);
    }

    // Auto-upgrade if version is outdated (regenerates YAML with new comments and fields)
    if ((parsed.version ?? 1) < UNIFIED_CONFIG_VERSION) {
      // Merge with defaults to add new fields (e.g., model for websearch providers)
      const upgraded = mergeWithDefaults(parsed);
      upgraded.version = UNIFIED_CONFIG_VERSION;
      try {
        saveUnifiedConfig(upgraded);
        if (process.env.CCS_DEBUG) {
          console.error(`[i] Config upgraded to v${UNIFIED_CONFIG_VERSION}`);
        }
        return upgraded;
      } catch (saveError) {
        console.error('[!] Config upgrade failed to save:', (saveError as Error).message);
        // Continue using the upgraded version in-memory even if save fails
      }
    }

    return parsed;
  } catch (err) {
    // U3: Provide better context for YAML syntax errors
    if (err instanceof yaml.YAMLException) {
      const mark = err.mark;
      console.error(`[X] YAML syntax error in ${yamlPath}:`);
      console.error(
        `    Line ${(mark?.line ?? 0) + 1}, Column ${(mark?.column ?? 0) + 1}: ${err.reason || 'Invalid syntax'}`
      );
      if (mark?.snippet) {
        console.error(`    ${mark.snippet}`);
      }
      console.error(
        `    Tip: Check for missing colons, incorrect indentation, or unquoted special characters.`
      );
    } else {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[X] Failed to load config: ${error}`);
    }
    throw err;
  }
}

/**
 * Load config, preferring YAML if available, falling back to creating empty config.
 * Merges with defaults to ensure all sections exist.
 */
export function loadOrCreateUnifiedConfig(): UnifiedConfig {
  const existing = loadUnifiedConfig();
  if (existing) {
    // Merge with defaults to fill any missing sections
    const merged = mergeWithDefaults(existing);
    // Validate composite variant provider strings
    validateCompositeVariants(merged);
    return merged;
  }

  // Create empty config
  const config = createEmptyUnifiedConfig();
  return config;
}

/**
 * Save unified config to YAML file.
 * Uses atomic write (temp file + rename) to prevent corruption.
 * Uses lockfile to prevent concurrent writes.
 */
export function saveUnifiedConfig(config: UnifiedConfig): void {
  withConfigWriteLock(() => {
    writeUnifiedConfigWithLockHeld(config, generateYamlHeader, generateYamlWithComments);
  });
}

/**
 * Atomically mutate unified config with lock held across read-modify-write.
 * Prevents stale writes from overwriting concurrent updates.
 */
export function mutateUnifiedConfig(mutator: (config: UnifiedConfig) => void): UnifiedConfig {
  return withConfigWriteLock(() => {
    const current = loadUnifiedConfigWithLockHeld(mergeWithDefaults, validateCompositeVariants);
    const previousBrowser = current.browser
      ? canonicalizeBrowserConfig(current.browser)
      : undefined;
    mutator(current);
    if (current.browser) {
      current.browser = canonicalizeBrowserConfig(current.browser, previousBrowser);
    }
    writeUnifiedConfigWithLockHeld(current, generateYamlHeader, generateYamlWithComments);
    return current;
  });
}

/**
 * Update unified config with partial data.
 * Loads existing config, merges changes, and saves.
 */
export function updateUnifiedConfig(updates: Partial<UnifiedConfig>): UnifiedConfig {
  return mutateUnifiedConfig((config) => {
    Object.assign(config, updates);
  });
}

// ---------------------------------------------------------------------------
// Public API — getters / derived helpers
// ---------------------------------------------------------------------------

/**
 * Check if unified config mode is active.
 * Returns true if config.yaml exists OR CCS_UNIFIED_CONFIG=1.
 *
 * Use this centralized function instead of duplicating the logic.
 */
export function isUnifiedMode(): boolean {
  return hasUnifiedConfig() || isUnifiedConfigEnabled();
}

/**
 * Get or set default profile name.
 */
export function getDefaultProfile(): string | undefined {
  const config = loadUnifiedConfig();
  return config?.default;
}

export function setDefaultProfile(name: string): void {
  updateUnifiedConfig({ default: name });
}

/**
 * Gemini CLI WebSearch configuration
 */
export interface GeminiWebSearchInfo {
  enabled: boolean;
  model: string;
  timeout: number;
}

/**
 * Get websearch configuration.
 * Returns defaults if not configured.
 * Supports deterministic providers and optional Gemini/OpenCode/Grok CLI fallbacks.
 */
export function getWebSearchConfig(): {
  enabled: boolean;
  providers?: {
    exa?: { enabled?: boolean; max_results?: number };
    tavily?: { enabled?: boolean; max_results?: number };
    brave?: { enabled?: boolean; max_results?: number };
    searxng?: { enabled?: boolean; url?: string; max_results?: number };
    duckduckgo?: { enabled?: boolean; max_results?: number };
    gemini?: GeminiWebSearchInfo;
    opencode?: { enabled?: boolean; model?: string; timeout?: number };
    grok?: { enabled?: boolean; timeout?: number };
  };
  // Legacy fields (deprecated)
  gemini?: { enabled?: boolean; timeout?: number };
} {
  const config = loadOrCreateUnifiedConfig();

  // Build provider configs
  const exaConfig = {
    enabled: config.websearch?.providers?.exa?.enabled ?? false,
    max_results: config.websearch?.providers?.exa?.max_results ?? 5,
  };

  const tavilyConfig = {
    enabled: config.websearch?.providers?.tavily?.enabled ?? false,
    max_results: config.websearch?.providers?.tavily?.max_results ?? 5,
  };

  const duckDuckGoConfig = {
    enabled: config.websearch?.providers?.duckduckgo?.enabled ?? true,
    max_results: config.websearch?.providers?.duckduckgo?.max_results ?? 5,
  };

  const braveConfig = {
    enabled: config.websearch?.providers?.brave?.enabled ?? false,
    max_results: config.websearch?.providers?.brave?.max_results ?? 5,
  };

  const searxngConfig = {
    enabled: config.websearch?.providers?.searxng?.enabled ?? false,
    url: normalizeSearxngBaseUrl(config.websearch?.providers?.searxng?.url) ?? '',
    max_results: config.websearch?.providers?.searxng?.max_results ?? 5,
  };

  const geminiConfig: GeminiWebSearchInfo = {
    enabled:
      config.websearch?.providers?.gemini?.enabled ?? config.websearch?.gemini?.enabled ?? false,
    model: config.websearch?.providers?.gemini?.model ?? 'gemini-2.5-flash',
    timeout:
      config.websearch?.providers?.gemini?.timeout ?? config.websearch?.gemini?.timeout ?? 55,
  };

  const opencodeConfig = {
    enabled: config.websearch?.providers?.opencode?.enabled ?? false,
    model: config.websearch?.providers?.opencode?.model ?? 'opencode/grok-code',
    timeout: config.websearch?.providers?.opencode?.timeout ?? 90,
  };

  const grokConfig = {
    enabled: config.websearch?.providers?.grok?.enabled ?? false,
    timeout: config.websearch?.providers?.grok?.timeout ?? 55,
  };

  // Auto-enable master switch if ANY provider is enabled
  const anyProviderEnabled =
    exaConfig.enabled ||
    tavilyConfig.enabled ||
    braveConfig.enabled ||
    searxngConfig.enabled ||
    duckDuckGoConfig.enabled ||
    geminiConfig.enabled ||
    opencodeConfig.enabled ||
    grokConfig.enabled;
  const enabled = anyProviderEnabled && (config.websearch?.enabled ?? true);

  return {
    enabled,
    providers: {
      exa: exaConfig,
      tavily: tavilyConfig,
      brave: braveConfig,
      searxng: searxngConfig,
      duckduckgo: duckDuckGoConfig,
      gemini: geminiConfig,
      opencode: opencodeConfig,
      grok: grokConfig,
    },
    // Legacy field for backwards compatibility
    gemini: config.websearch?.gemini,
  };
}

/**
 * Get global_env configuration.
 * Returns defaults if not configured.
 */
export function getGlobalEnvConfig(): GlobalEnvConfig {
  const config = loadOrCreateUnifiedConfig();
  return {
    enabled: config.global_env?.enabled ?? true,
    env: config.global_env?.env ?? { ...DEFAULT_GLOBAL_ENV },
  };
}

/**
 * Get continuity inheritance mapping.
 * Returns empty mapping when not configured.
 */
export function getContinuityInheritanceMap(): Record<string, string> {
  const config = loadOrCreateUnifiedConfig();
  return config.continuity?.inherit_from_account ?? {};
}

/**
 * Get cliproxy safety configuration.
 * Returns defaults if not configured.
 */
export function getCliproxySafetyConfig(): CLIProxySafetyConfig {
  const config = loadOrCreateUnifiedConfig();
  return {
    antigravity_ack_bypass:
      config.cliproxy?.safety?.antigravity_ack_bypass ??
      DEFAULT_CLIPROXY_SAFETY_CONFIG.antigravity_ack_bypass,
  };
}

/**
 * Get thinking configuration.
 * Returns defaults if not configured.
 */
export function getThinkingConfig(): ThinkingConfig {
  const config = loadOrCreateUnifiedConfig();

  // W2: Check for invalid thinking config (e.g., thinking: true instead of object)
  if (config.thinking !== undefined && typeof config.thinking !== 'object') {
    console.warn(
      `[!] Invalid thinking config: expected object, got ${typeof config.thinking}. Using defaults.`
    );
    console.warn(`    Tip: Use 'thinking: { mode: auto }' instead of 'thinking: true'`);
    return DEFAULT_THINKING_CONFIG;
  }

  return {
    mode: config.thinking?.mode ?? DEFAULT_THINKING_CONFIG.mode,
    override: config.thinking?.override,
    tier_defaults: {
      opus: config.thinking?.tier_defaults?.opus ?? DEFAULT_THINKING_CONFIG.tier_defaults.opus,
      sonnet:
        config.thinking?.tier_defaults?.sonnet ?? DEFAULT_THINKING_CONFIG.tier_defaults.sonnet,
      haiku: config.thinking?.tier_defaults?.haiku ?? DEFAULT_THINKING_CONFIG.tier_defaults.haiku,
    },
    provider_overrides: config.thinking?.provider_overrides,
    show_warnings: config.thinking?.show_warnings ?? DEFAULT_THINKING_CONFIG.show_warnings,
  };
}

/**
 * Get Official Channels configuration.
 * Returns defaults if not configured.
 */
export function getOfficialChannelsConfig(): OfficialChannelsConfig {
  const config = loadOrCreateUnifiedConfig();

  return {
    selected:
      config.channels?.selected && config.channels.selected.length > 0
        ? normalizeOfficialChannelIds(config.channels.selected)
        : DEFAULT_OFFICIAL_CHANNELS_CONFIG.selected,
    unattended: config.channels?.unattended ?? DEFAULT_OFFICIAL_CHANNELS_CONFIG.unattended,
  };
}

/**
 * Get dashboard_auth configuration with ENV var override.
 * Priority: ENV vars > config.yaml > defaults
 */
export function isDashboardAuthEnabled(): boolean {
  const envEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;

  if (envEnabled !== undefined) {
    return envEnabled === 'true' || envEnabled === '1';
  }

  const config = loadOrCreateUnifiedConfig();
  return config.dashboard_auth?.enabled ?? false;
}

/**
 * Get dashboard_auth configuration with ENV var override.
 * Priority: ENV vars > config.yaml > defaults
 */
export function getDashboardAuthConfig(): DashboardAuthConfig {
  const config = loadOrCreateUnifiedConfig();

  // ENV vars take precedence
  const envEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
  const envUsername = process.env.CCS_DASHBOARD_USERNAME;
  const envPasswordHash = process.env.CCS_DASHBOARD_PASSWORD_HASH;

  return {
    enabled:
      envEnabled !== undefined
        ? envEnabled === 'true' || envEnabled === '1'
        : (config.dashboard_auth?.enabled ?? false),
    username: envUsername ?? config.dashboard_auth?.username ?? '',
    password_hash: envPasswordHash ?? config.dashboard_auth?.password_hash ?? '',
    session_timeout_hours: config.dashboard_auth?.session_timeout_hours ?? 24,
  };
}

/**
 * Get browser automation configuration.
 * Returns canonicalized defaults if not configured.
 */
export function getBrowserConfig(): BrowserConfig {
  const config = loadOrCreateUnifiedConfig();
  return canonicalizeBrowserConfig(config.browser);
}

/**
 * Get image_analysis configuration.
 * Returns defaults if not configured.
 */
export function getImageAnalysisConfig(): ImageAnalysisConfig {
  const config = loadOrCreateUnifiedConfig();

  return canonicalizeImageAnalysisConfig({
    enabled: config.image_analysis?.enabled ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled,
    timeout: config.image_analysis?.timeout ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout,
    provider_models:
      config.image_analysis?.provider_models ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models,
    fallback_backend:
      config.image_analysis?.fallback_backend ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.fallback_backend,
    profile_backends:
      config.image_analysis?.profile_backends ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.profile_backends,
  });
}

export function getLoggingConfig(): LoggingConfig {
  const config = loadOrCreateUnifiedConfig();

  return {
    enabled: config.logging?.enabled ?? DEFAULT_LOGGING_CONFIG.enabled,
    level: config.logging?.level ?? DEFAULT_LOGGING_CONFIG.level,
    rotate_mb: config.logging?.rotate_mb ?? DEFAULT_LOGGING_CONFIG.rotate_mb,
    retain_days: config.logging?.retain_days ?? DEFAULT_LOGGING_CONFIG.retain_days,
    redact: config.logging?.redact ?? DEFAULT_LOGGING_CONFIG.redact,
    live_buffer_size: config.logging?.live_buffer_size ?? DEFAULT_LOGGING_CONFIG.live_buffer_size,
  };
}

/**
 * Get cursor configuration.
 * Returns defaults if not configured.
 */
export function getCursorConfig(): CursorConfig {
  const config = loadOrCreateUnifiedConfig();
  return config.cursor ?? { ...DEFAULT_CURSOR_CONFIG };
}
