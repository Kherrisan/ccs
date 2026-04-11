import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { getResolvedLoggingConfig } from './log-config';
import {
  ensureLoggingDirectories,
  getCurrentLogPath,
  buildArchiveLogPath,
  getLogArchiveDir,
} from './log-paths';
import { pushRecentLogEntry } from './log-buffer';
import { shouldWriteLogLevel, type LogEntry } from './log-types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
let lastPruneAt = 0;

function getRotateBytes(rotateMb: number): number {
  return Math.max(1, rotateMb) * 1024 * 1024;
}

function rotateCurrentLogIfNeeded(): void {
  const config = getResolvedLoggingConfig();
  const currentLogPath = getCurrentLogPath();

  if (!fs.existsSync(currentLogPath)) {
    return;
  }

  const stats = fs.statSync(currentLogPath);
  const ageMs = Date.now() - stats.mtimeMs;
  const exceedsSize = stats.size >= getRotateBytes(config.rotate_mb);
  const exceedsAge = ageMs >= ONE_DAY_MS;
  if (!exceedsSize && !exceedsAge) {
    return;
  }

  const currentContent = fs.readFileSync(currentLogPath, 'utf8');
  if (!currentContent.trim()) {
    fs.truncateSync(currentLogPath, 0);
    return;
  }

  const archivePath = buildArchiveLogPath(new Date(stats.mtimeMs || Date.now()));
  fs.writeFileSync(archivePath, zlib.gzipSync(currentContent), { mode: 0o600 });
  fs.truncateSync(currentLogPath, 0);
}

export function pruneExpiredLogArchives(): void {
  const config = getResolvedLoggingConfig();
  const archiveDir = getLogArchiveDir();
  if (!fs.existsSync(archiveDir)) {
    return;
  }

  const cutoffMs = Date.now() - config.retain_days * ONE_DAY_MS;
  for (const entry of fs.readdirSync(archiveDir)) {
    const archivePath = path.join(archiveDir, entry);
    try {
      const stats = fs.lstatSync(archivePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        continue;
      }
      if (stats.mtimeMs < cutoffMs) {
        fs.unlinkSync(archivePath);
      }
    } catch {
      continue;
    }
  }
}

export function appendStructuredLogEntry(entry: LogEntry): void {
  const config = getResolvedLoggingConfig();
  if (!config.enabled || !shouldWriteLogLevel(entry.level, config.level)) {
    return;
  }

  try {
    ensureLoggingDirectories();
    rotateCurrentLogIfNeeded();
    fs.appendFileSync(getCurrentLogPath(), `${JSON.stringify(entry)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    pushRecentLogEntry(entry, config.live_buffer_size);
    if (Date.now() - lastPruneAt >= PRUNE_INTERVAL_MS) {
      pruneExpiredLogArchives();
      lastPruneAt = Date.now();
    }
  } catch {
    // Logging must never break runtime behavior.
  }
}
