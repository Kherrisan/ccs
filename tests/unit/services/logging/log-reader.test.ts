import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearRecentLogEntries,
  pushRecentLogEntry,
} from '../../../../src/services/logging/log-buffer';
import { getCurrentLogPath } from '../../../../src/services/logging/log-paths';
import { readLogEntries } from '../../../../src/services/logging/log-reader';
import type { LogEntry } from '../../../../src/services/logging/log-types';

function createEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    level: overrides.level ?? 'info',
    source: overrides.source ?? 'unit:test',
    event: overrides.event ?? 'test.event',
    message: overrides.message ?? 'message',
    processId: overrides.processId ?? 1234,
    runId: overrides.runId ?? 'run-1',
    context: overrides.context ?? {},
  };
}

describe('log reader', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-log-reader-'));
    process.env.CCS_HOME = tempHome;
    clearRecentLogEntries();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    clearRecentLogEntries();
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = '';
  });

  it('caches unchanged current log file parses between reads', () => {
    const currentLogPath = getCurrentLogPath();
    fs.mkdirSync(path.dirname(currentLogPath), { recursive: true });
    fs.writeFileSync(
      currentLogPath,
      `${JSON.stringify(
        createEntry({
          id: 'disk-entry',
          message: 'Newest on-disk entry',
          timestamp: '2026-04-08T11:00:00.000Z',
        })
      )}\n`
    );

    pushRecentLogEntry(
      createEntry({
        id: 'recent-1',
        message: 'Buffered entry',
        timestamp: '2026-04-08T10:00:00.000Z',
      }),
      250
    );

    const readSpy = spyOn(fs, 'readFileSync');

    try {
      const first = readLogEntries({ limit: 2 });
      const second = readLogEntries({ limit: 2 });

      expect(first.map((entry) => entry.id)).toEqual(['disk-entry', 'recent-1']);
      expect(second.map((entry) => entry.id)).toEqual(['disk-entry', 'recent-1']);
      expect(readSpy).toHaveBeenCalledTimes(1);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('refreshes the cached parse when the current log file changes', () => {
    const currentLogPath = getCurrentLogPath();
    fs.mkdirSync(path.dirname(currentLogPath), { recursive: true });
    fs.writeFileSync(
      currentLogPath,
      `${JSON.stringify(
        createEntry({
          id: 'disk-old',
          message: 'Older on-disk entry',
          timestamp: '2026-04-08T11:00:00.000Z',
        })
      )}\n`
    );

    const readSpy = spyOn(fs, 'readFileSync');

    try {
      expect(readLogEntries({ limit: 1 }).map((entry) => entry.id)).toEqual(['disk-old']);

      fs.writeFileSync(
        currentLogPath,
        `${JSON.stringify(
          createEntry({
            id: 'disk-new',
            message: 'Newer on-disk entry',
            timestamp: '2026-04-08T12:00:00.000Z',
          })
        )}\n`
      );
      const futureTimestamp = new Date(Date.now() + 10_000);
      fs.utimesSync(currentLogPath, futureTimestamp, futureTimestamp);

      expect(readLogEntries({ limit: 1 }).map((entry) => entry.id)).toEqual(['disk-new']);
      expect(readSpy).toHaveBeenCalledTimes(2);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('keeps file-backed matches when buffered entries already satisfy the limit', () => {
    const currentLogPath = getCurrentLogPath();
    fs.mkdirSync(path.dirname(currentLogPath), { recursive: true });
    fs.writeFileSync(
      currentLogPath,
      [
        JSON.stringify(
          createEntry({
            id: 'disk-newest',
            source: 'dashboard',
            message: 'Newest dashboard entry on disk',
            timestamp: '2026-04-08T12:30:00.000Z',
          })
        ),
        JSON.stringify(
          createEntry({
            id: 'disk-older',
            source: 'dashboard',
            message: 'Older dashboard entry on disk',
            timestamp: '2026-04-08T10:30:00.000Z',
          })
        ),
      ].join('\n') + '\n'
    );

    pushRecentLogEntry(
      createEntry({
        id: 'recent-middle',
        source: 'dashboard',
        message: 'Buffered dashboard entry',
        timestamp: '2026-04-08T11:30:00.000Z',
      }),
      250
    );
    pushRecentLogEntry(
      createEntry({
        id: 'recent-oldest',
        source: 'dashboard',
        message: 'Oldest buffered dashboard entry',
        timestamp: '2026-04-08T09:30:00.000Z',
      }),
      250
    );

    const entries = readLogEntries({ source: 'dashboard', limit: 2 });

    expect(entries.map((entry) => entry.id)).toEqual(['disk-newest', 'recent-middle']);
  });
});
