import * as fs from 'fs';
import { DEFAULT_LOGGING_CONFIG } from '../../config/unified-config-types';
import {
  getConfigYamlPath,
  getLoggingConfig as getUnifiedLoggingConfig,
} from '../../config/unified-config-loader';
import type { LoggingConfig } from './log-types';

const CACHE_RECHECK_MS = 1000;
let cachedConfig: LoggingConfig = { ...DEFAULT_LOGGING_CONFIG };
let cachedMtimeMs: number | null = null;
let lastCheckedAt = 0;

export function invalidateLoggingConfigCache(): void {
  cachedConfig = { ...DEFAULT_LOGGING_CONFIG };
  cachedMtimeMs = null;
  lastCheckedAt = 0;
}

export function getResolvedLoggingConfig(): LoggingConfig {
  const now = Date.now();
  if (now - lastCheckedAt < CACHE_RECHECK_MS) {
    return cachedConfig;
  }

  try {
    const configPath = getConfigYamlPath();
    const nextMtimeMs = fs.existsSync(configPath) ? fs.statSync(configPath).mtimeMs : null;
    if (nextMtimeMs === cachedMtimeMs) {
      lastCheckedAt = now;
      return cachedConfig;
    }

    cachedConfig = {
      ...DEFAULT_LOGGING_CONFIG,
      ...getUnifiedLoggingConfig(),
    };
    cachedMtimeMs = nextMtimeMs;
    lastCheckedAt = now;
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_LOGGING_CONFIG };
    cachedMtimeMs = null;
    lastCheckedAt = now;
    return cachedConfig;
  }
}
