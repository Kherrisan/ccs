import type { LogEntry } from './log-types';

let recentEntries: LogEntry[] = [];

export function pushRecentLogEntry(entry: LogEntry, maxEntries: number): void {
  recentEntries.push(entry);
  if (recentEntries.length > maxEntries) {
    recentEntries = recentEntries.slice(recentEntries.length - maxEntries);
  }
}

export function getRecentLogEntries(): LogEntry[] {
  return [...recentEntries];
}

export function clearRecentLogEntries(): void {
  recentEntries = [];
}
