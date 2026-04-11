import type { LogsLevel } from '@/lib/api-client';

export function formatLogTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'No activity yet';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatRelativeLogTime(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'No activity yet';
  }

  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return timestamp;
  }

  const diffSeconds = Math.round((value - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 60) {
    return formatter.format(diffSeconds, 'second');
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(Math.round(diffHours / 24), 'day');
}

export function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return '{}';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getLevelLabel(level: LogsLevel) {
  switch (level) {
    case 'error':
      return 'Error';
    case 'warn':
      return 'Warn';
    case 'info':
      return 'Info';
    case 'debug':
      return 'Debug';
  }
}
