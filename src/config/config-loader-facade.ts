/**
 * Config Loader Facade
 *
 * Single import path for all config loading operations.
 * Re-exports everything from unified-config-loader and config-manager,
 * and adds memoization for loadOrCreateUnifiedConfig to reduce file I/O.
 *
 * Usage:
 *   import { getCachedConfig, saveConfig, mutateConfig } from '../config/config-loader-facade';
 *   import { getCcsDir, loadSettings } from '../config/config-loader-facade';
 */

// Re-export all functions from unified-config-loader
export {
  loadUnifiedConfig,
  loadOrCreateUnifiedConfig,
  saveUnifiedConfig,
  mutateUnifiedConfig,
  updateUnifiedConfig,
  getConfigYamlPath,
  getConfigJsonPath,
  hasUnifiedConfig,
  hasLegacyConfig,
  getConfigFormat,
  isUnifiedMode,
  getDefaultProfile,
  setDefaultProfile,
  getWebSearchConfig,
  getGlobalEnvConfig,
  getContinuityInheritanceMap,
  getCliproxySafetyConfig,
  getThinkingConfig,
  getOfficialChannelsConfig,
  isDashboardAuthEnabled,
  getDashboardAuthConfig,
  getBrowserConfig,
  getImageAnalysisConfig,
  getLoggingConfig,
  getCursorConfig,
} from './unified-config-loader';

// Re-export types from unified-config-loader
export type { GeminiWebSearchInfo } from './unified-config-loader';

// Re-export selected functions from config-manager
export { loadSettings, loadConfigSafe, readConfig, getCcsDir } from '../utils/config-manager';

// Internal imports for memoization wrappers
import type { UnifiedConfig } from './unified-config-types';
import {
  loadOrCreateUnifiedConfig as _loadOrCreateUnifiedConfig,
  saveUnifiedConfig as _saveUnifiedConfig,
  mutateUnifiedConfig as _mutateUnifiedConfig,
  updateUnifiedConfig as _updateUnifiedConfig,
} from './unified-config-loader';

// ---------------------------------------------------------------------------
// Memoization cache
// ---------------------------------------------------------------------------

let _configCache: UnifiedConfig | null = null;

/**
 * Get the unified config with in-memory caching.
 * First call reads from disk; subsequent calls return the cached object.
 *
 * Call invalidateConfigCache() or use mutateConfig()/updateConfig()
 * to force a re-read from disk.
 */
export function getCachedConfig(): UnifiedConfig {
  if (!_configCache) {
    _configCache = _loadOrCreateUnifiedConfig();
  }
  return _configCache;
}

/**
 * Clear the memoization cache.
 * The next call to getCachedConfig() will re-read from disk.
 */
export function invalidateConfigCache(): void {
  _configCache = null;
}

/**
 * Save config to disk and update the cache to the given object.
 * Does NOT invalidate — the provided config IS the new cache value.
 */
export function saveConfig(config: UnifiedConfig): void {
  _saveUnifiedConfig(config);
  _configCache = config;
}

/**
 * Atomically mutate config (read-modify-write with lock) and invalidate cache.
 * After mutation, the next getCachedConfig() call will re-read from disk.
 */
export function mutateConfig(mutator: (config: UnifiedConfig) => void): UnifiedConfig {
  const result = _mutateUnifiedConfig(mutator);
  _configCache = null;
  return result;
}

/**
 * Partial-update config and invalidate cache.
 * Shorthand for mutateConfig with Object.assign.
 */
export function updateConfig(updates: Partial<UnifiedConfig>): UnifiedConfig {
  const result = _updateUnifiedConfig(updates);
  _configCache = null;
  return result;
}

/**
 * Get the current cache state (for diagnostics/testing).
 * Returns true if a cached config exists, false otherwise.
 */
export function hasCachedConfig(): boolean {
  return _configCache !== null;
}
