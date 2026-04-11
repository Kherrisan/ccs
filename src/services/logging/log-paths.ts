import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../../utils/config-manager';

const LOGS_DIR = 'logs';
const ARCHIVE_DIR = 'archive';
const CURRENT_LOG_FILE = 'current.jsonl';

export function getNativeLogsDir(): string {
  return path.join(getCcsDir(), LOGS_DIR);
}

export function getCurrentLogPath(): string {
  return path.join(getNativeLogsDir(), CURRENT_LOG_FILE);
}

export function getLogArchiveDir(): string {
  return path.join(getNativeLogsDir(), ARCHIVE_DIR);
}

export function getLegacyCliproxyLogsDir(): string {
  return path.join(getCcsDir(), 'cliproxy', 'logs');
}

export function ensureLoggingDirectories(): void {
  fs.mkdirSync(getNativeLogsDir(), { recursive: true, mode: 0o700 });
  fs.mkdirSync(getLogArchiveDir(), { recursive: true, mode: 0o700 });
}

export function isPathInsideDirectory(candidatePath: string, rootDir: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(rootDir);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function buildArchiveLogPath(timestamp: Date = new Date()): string {
  const compact = timestamp.toISOString().replace(/[:.]/g, '-');
  return path.join(getLogArchiveDir(), `ccs-${compact}.jsonl.gz`);
}
