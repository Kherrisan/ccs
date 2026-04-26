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

type FetchCliproxyUsageRaw = typeof fetchCliproxyUsageRaw;

const SNAPSHOT_VERSION = 2;
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Sync interval in ms, configurable via CCS_CLIPROXY_SYNC_INTERVAL env var (default: 5 min) */
const SYNC_INTERVAL_MS = Math.max(
  30_000,
  parseInt(process.env.CCS_CLIPROXY_SYNC_INTERVAL ?? '300000', 10) || 300_000
);

// Module-level interval ID
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let snapshotTimestampOrdinal = 0;

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

function getSnapshotTimestamp(): number {
  snapshotTimestampOrdinal = (snapshotTimestampOrdinal + 1) % 1000;
  return Date.now() + snapshotTimestampOrdinal / 1000;
}

function readSnapshot(emitWarnings = true): CliproxyUsageSnapshot | null {
  try {
    const snapshotPath = getLatestSnapshotPath();
    if (!fs.existsSync(snapshotPath)) {
      return null;
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(raw) as CliproxyUsageSnapshot;

    if (snapshot.version !== SNAPSHOT_VERSION) {
      if (emitWarnings) {
        console.log(info('CLIProxy snapshot version mismatch, will refresh on next sync'));
      }
      return null;
    }

    if (!Number.isFinite(snapshot.timestamp)) {
      if (emitWarnings) {
        console.log(info('CLIProxy snapshot timestamp invalid, will refresh on next sync'));
      }
      return null;
    }

    return snapshot;
  } catch (err) {
    if (emitWarnings) {
      console.log(warn('Failed to read CLIProxy snapshot:') + ` ${(err as Error).message}`);
    }
    return null;
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

  const snapshot = readSnapshot();
  if (!snapshot) {
    return empty;
  }

  const age = Date.now() - snapshot.timestamp;
  if (age > SNAPSHOT_MAX_AGE_MS) {
    console.log(info('Using stale CLIProxy snapshot while proxy sync is unavailable'));
  }

  return { daily: snapshot.daily, hourly: snapshot.hourly, monthly: snapshot.monthly };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Fetch latest CLIProxy usage data and persist a snapshot to disk.
 * Non-fatal: logs warning and returns early if CLIProxy is unavailable.
 */
export async function syncCliproxyUsage(
  fetchRaw: FetchCliproxyUsageRaw = fetchCliproxyUsageRaw
): Promise<void> {
  const syncStartedAt = getSnapshotTimestamp();
  const raw = await fetchRaw();

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
      timestamp: syncStartedAt,
      daily,
      hourly,
      monthly,
    };

    const snapshotPath = getLatestSnapshotPath();
    const tempFile = `${snapshotPath}.${process.pid}.${syncStartedAt}.tmp`;
    const currentSnapshot = readSnapshot(false);
    if (currentSnapshot && currentSnapshot.timestamp > snapshot.timestamp) {
      console.log(info('Skipping stale CLIProxy snapshot write'));
      return;
    }

    fs.writeFileSync(tempFile, JSON.stringify(snapshot), 'utf-8');
    const latestSnapshot = readSnapshot(false);
    if (latestSnapshot && latestSnapshot.timestamp > snapshot.timestamp) {
      fs.rmSync(tempFile, { force: true });
      console.log(info('Skipping stale CLIProxy snapshot write'));
      return;
    }

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
export function startCliproxySync(syncNow: () => Promise<void> = () => syncCliproxyUsage()): void {
  if (syncIntervalId !== null) {
    return;
  }

  const intervalMin = Math.round(SYNC_INTERVAL_MS / 60_000);
  console.log(info(`Starting CLIProxy usage sync (interval: ${intervalMin} min)`));

  // Fire-and-forget initial sync
  void syncNow();

  syncIntervalId = setInterval(() => {
    void syncNow();
  }, SYNC_INTERVAL_MS);
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
