import type { LoggingConfig, LoggingLevel } from '../../config/unified-config-types';

export type { LoggingConfig, LoggingLevel };

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LoggingLevel;
  source: string;
  event: string;
  message: string;
  processId: number;
  runId: string;
  context?: Record<string, unknown>;
}

export interface LogSourceSummary {
  source: string;
  label: string;
  kind: 'native' | 'legacy';
  count: number;
  lastTimestamp: string | null;
}

export interface ReadLogEntriesOptions {
  source?: string;
  level?: LoggingLevel;
  search?: string;
  limit?: number;
}

export const LOG_LEVELS: readonly LoggingLevel[] = ['error', 'warn', 'info', 'debug'];

const LOG_LEVEL_PRIORITY: Record<LoggingLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function shouldWriteLogLevel(level: LoggingLevel, configuredLevel: LoggingLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[configuredLevel];
}

export function isLoggingLevel(value: string | undefined): value is LoggingLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value as LoggingLevel);
}
