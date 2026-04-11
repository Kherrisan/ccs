import { mutateUnifiedConfig } from '../../config/unified-config-loader';
import {
  getResolvedLoggingConfig,
  invalidateLoggingConfigCache,
  readLogEntries,
  readLogSourceSummaries,
} from '../../services/logging';
import type { LoggingConfig } from '../../config/unified-config-types';
import type { ReadLogEntriesOptions } from '../../services/logging';

export function getDashboardLoggingConfig(): LoggingConfig {
  return getResolvedLoggingConfig();
}

export function updateDashboardLoggingConfig(updates: Partial<LoggingConfig>): LoggingConfig {
  const updated = mutateUnifiedConfig((config) => {
    config.logging = {
      ...getResolvedLoggingConfig(),
      ...config.logging,
      ...updates,
    };
  });
  invalidateLoggingConfigCache();

  return {
    ...getResolvedLoggingConfig(),
    ...updated.logging,
  };
}

export function listDashboardLogSources() {
  return readLogSourceSummaries();
}

export function listDashboardLogEntries(options: ReadLogEntriesOptions = {}) {
  return readLogEntries(options);
}
