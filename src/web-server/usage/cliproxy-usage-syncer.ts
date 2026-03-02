/**
 * CLIProxy Usage Syncer
 *
 * Periodically fetches CLIProxy usage data, transforms it, and persists
 * snapshots locally so analytics data survives CLIProxy restarts.
 *
 * Snapshot location: ~/.ccs/cache/cliproxy-usage/latest.json
 * Sync interval: 5 minutes
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchCliproxyUsageRaw } from '../../cliproxy/stats-fetcher';
import {
  transformCliproxyToDailyUsage,
  transformCliproxyToHourlyUsage,
  transformCliproxyToMonthlyUsage,
} from './cliproxy-usage-transformer';
import type { DailyUsage, HourlyUsage, MonthlyUsage } from './types';
import { getCcsDir } from '../../utils/config-manager';
import { ok, info, warn } from '../../utils/ui';

// ---------------------------------------------------------------------------
// Snapshot format
// ---------------------------------------------------------------------------

interface CliproxyUsageSnapshot {
  version: number;
  timestamp: number;
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
}

const SNAPSHOT_VERSION = 1;

// Module-level interval ID
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Cache directory helpers
// ---------------------------------------------------------------------------

function getCliproxyCacheDir(): string {
  return path.join(getCcsDir(), 'cache', 'cliproxy-usage');
}

function getLatestSnapshotPath(): string {
  return path.join(getCliproxyCacheDir(), 'latest.json');
}

function ensureCliproxyCacheDir(): void {
  const dir = getCliproxyCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Load cached data
// ---------------------------------------------------------------------------

/**
 * Read the latest CLIProxy usage snapshot from disk.
 * Returns empty arrays on failure (file not found, parse error, version mismatch).
 */
export async function loadCachedCliproxyData(): Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
}> {
  const empty = { daily: [], hourly: [], monthly: [] };

  try {
    const snapshotPath = getLatestSnapshotPath();
    if (!fs.existsSync(snapshotPath)) {
      return empty;
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot: CliproxyUsageSnapshot = JSON.parse(raw);

    if (snapshot.version !== SNAPSHOT_VERSION) {
      console.log(info('CLIProxy snapshot version mismatch, will refresh on next sync'));
      return empty;
    }

    return { daily: snapshot.daily, hourly: snapshot.hourly, monthly: snapshot.monthly };
  } catch (err) {
    console.log(warn('Failed to read CLIProxy snapshot:') + ` ${(err as Error).message}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Fetch latest CLIProxy usage data and persist a snapshot to disk.
 * Non-fatal: logs warning and returns early if CLIProxy is unavailable.
 */
export async function syncCliproxyUsage(): Promise<void> {
  const raw = await fetchCliproxyUsageRaw();

  if (raw === null) {
    console.log(warn('CLIProxy usage sync skipped: proxy unavailable'));
    return;
  }

  try {
    ensureCliproxyCacheDir();

    const daily = transformCliproxyToDailyUsage(raw);
    const hourly = transformCliproxyToHourlyUsage(raw);
    const monthly = transformCliproxyToMonthlyUsage(raw);

    const snapshot: CliproxyUsageSnapshot = {
      version: SNAPSHOT_VERSION,
      timestamp: Date.now(),
      daily,
      hourly,
      monthly,
    };

    // Atomic write: temp file + rename
    const snapshotPath = getLatestSnapshotPath();
    const tempFile = snapshotPath + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(snapshot), 'utf-8');
    fs.renameSync(tempFile, snapshotPath);

    console.log(ok('CLIProxy usage snapshot updated'));
  } catch (err) {
    // Non-fatal - stale snapshot will continue to be served
    console.log(warn('Failed to write CLIProxy snapshot:') + ` ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Interval management
// ---------------------------------------------------------------------------

/**
 * Start periodic CLIProxy usage sync (every 5 minutes).
 * Performs an immediate sync on startup.
 */
export function startCliproxySync(): void {
  console.log(info('Starting CLIProxy usage sync (interval: 5 min)'));

  // Fire-and-forget initial sync
  void syncCliproxyUsage();

  syncIntervalId = setInterval(
    () => {
      void syncCliproxyUsage();
    },
    5 * 60 * 1000
  );
}

/**
 * Stop periodic CLIProxy usage sync.
 */
export function stopCliproxySync(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
