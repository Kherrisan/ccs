import { randomUUID } from 'crypto';
import { getResolvedLoggingConfig } from './log-config';
import { redactContext } from './log-redaction';
import { appendStructuredLogEntry } from './log-storage';
import type { LogEntry, LoggingLevel } from './log-types';

const processRunId = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

function createEntry(
  source: string,
  level: LoggingLevel,
  event: string,
  message: string,
  context: Record<string, unknown>
): LogEntry {
  const config = getResolvedLoggingConfig();
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
    message,
    processId: process.pid,
    runId: processRunId,
    context: config.redact ? redactContext(context) : context,
  };
}

export interface Logger {
  child(context: Record<string, unknown>): Logger;
  debug(event: string, message: string, context?: Record<string, unknown>): void;
  info(event: string, message: string, context?: Record<string, unknown>): void;
  warn(event: string, message: string, context?: Record<string, unknown>): void;
  error(event: string, message: string, context?: Record<string, unknown>): void;
}

export function createLogger(source: string, baseContext: Record<string, unknown> = {}): Logger {
  const write = (
    level: LoggingLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>
  ) => {
    appendStructuredLogEntry(
      createEntry(source, level, event, message, { ...baseContext, ...(context || {}) })
    );
  };

  return {
    child(context: Record<string, unknown>) {
      return createLogger(source, { ...baseContext, ...context });
    },
    debug(event, message, context) {
      write('debug', event, message, context);
    },
    info(event, message, context) {
      write('info', event, message, context);
    },
    warn(event, message, context) {
      write('warn', event, message, context);
    },
    error(event, message, context) {
      write('error', event, message, context);
    },
  };
}
