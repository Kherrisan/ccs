/**
 * Startup Lock for CLIProxy
 *
 * File-based mutex to prevent race conditions when multiple
 * CCS processes try to start CLIProxy simultaneously.
 *
 * Uses a lock file with PID and timestamp to coordinate startup.
 * Lock is automatically released after timeout or process exit.
 *
 * Lock Timeout Rationale (10 seconds):
 * - CLIProxy startup typically takes 1-3s (binary spawn + port bind)
 * - HTTP health check takes ~1s timeout
 * - Session registration takes <100ms
 * - Total expected lock hold time: 2-5s
 * - 10s provides 2x safety margin for slow systems/disk I/O
 * - Too short: legitimate startups fail on slow systems
 * - Too long: dead processes block other terminals unnecessarily
 *
 * Why file-based instead of port-based:
 * - Works before port is bound (prevents duplicate spawn attempts)
 * - Survives process crashes (stale detection via PID check)
 * - Cross-platform (Windows, macOS, Linux)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCliproxyDir } from './config-generator';
import { createLogger } from '../services/logging';

/** Lock file structure */
interface LockData {
  pid: number;
  timestamp: number;
  hostname: string;
}

/** Lock acquisition result */
export interface LockResult {
  acquired: boolean;
  lockPath: string;
  release: () => void;
}

/** Lock file name */
const LOCK_FILE = '.startup.lock';

/** Lock timeout in ms (stale lock auto-released) */
const LOCK_TIMEOUT_MS = 10000; // 10 seconds - see module docstring for rationale

/** Optional logger function for verbose output */
type LogFn = (msg: string) => void;

/** No-op logger for when verbose is disabled */
const noopLog: LogFn = () => {};
const logger = createLogger('cliproxy:startup-lock');

/**
 * Get path to startup lock file
 */
function getLockPath(): string {
  return path.join(getCliproxyDir(), LOCK_FILE);
}

/**
 * Check if a lock is stale (old or from dead process)
 */
function isLockStale(lockData: LockData): boolean {
  // Check timestamp
  if (Date.now() - lockData.timestamp > LOCK_TIMEOUT_MS) {
    return true;
  }

  // Check if PID is still running
  try {
    process.kill(lockData.pid, 0);
    return false; // Process exists
  } catch {
    return true; // Process dead
  }
}

/**
 * Try to acquire the startup lock once.
 *
 * @param log Logger function for verbose output
 * @returns LockResult with acquired=true if lock obtained
 */
function tryAcquireLockOnce(log: LogFn): LockResult {
  const lockPath = getLockPath();
  const dir = path.dirname(lockPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    log(`Creating lock directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Check for existing lock
  if (fs.existsSync(lockPath)) {
    try {
      const content = fs.readFileSync(lockPath, 'utf-8');
      const lockData = JSON.parse(content) as LockData;

      if (!isLockStale(lockData)) {
        // Lock is held by another active process
        log(`Lock held by PID ${lockData.pid} (age: ${Date.now() - lockData.timestamp}ms)`);
        return {
          acquired: false,
          lockPath,
          release: () => {},
        };
      }
      // Lock is stale - remove and continue
      log(`Removing stale lock from PID ${lockData.pid}`);
    } catch {
      // Invalid lock file - remove and continue
      log('Removing invalid lock file');
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Ignore removal errors
    }
  }

  // Try to create lock atomically
  const lockData: LockData = {
    pid: process.pid,
    timestamp: Date.now(),
    hostname: require('os').hostname(),
  };

  try {
    // Use 'wx' flag for exclusive creation (fails if exists)
    fs.writeFileSync(lockPath, JSON.stringify(lockData), { flag: 'wx', mode: 0o600 });
    log(`Lock acquired by PID ${process.pid}`);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EEXIST') {
      // Another process created lock between our check and write
      log('Lock acquisition race - another process won');
      return {
        acquired: false,
        lockPath,
        release: () => {},
      };
    }
    throw error;
  }

  // Lock acquired - return release function
  const release = () => {
    try {
      // Only release if we still own it
      const content = fs.readFileSync(lockPath, 'utf-8');
      const currentLock = JSON.parse(content) as LockData;
      if (currentLock.pid === process.pid) {
        fs.unlinkSync(lockPath);
        log('Lock released');
      }
    } catch {
      // Ignore release errors
    }
  };

  return {
    acquired: true,
    lockPath,
    release,
  };
}

/**
 * Acquire the startup lock with retries.
 *
 * @param options.retries Number of retry attempts (default: 20)
 * @param options.retryInterval Ms between retries (default: 250)
 * @param options.verbose Enable verbose logging (default: false)
 * @returns LockResult
 * @throws Error if lock cannot be acquired after all retries
 */
export async function acquireStartupLock(options?: {
  retries?: number;
  retryInterval?: number;
  verbose?: boolean;
}): Promise<LockResult> {
  const retries = options?.retries ?? 20;
  const retryInterval = options?.retryInterval ?? 250;
  const log: LogFn = options?.verbose
    ? (msg) => logger.debug('lock.verbose', msg, { retries, retryInterval })
    : noopLog;

  log(`Attempting to acquire startup lock (max ${retries} retries, ${retryInterval}ms interval)`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = tryAcquireLockOnce(log);
    if (result.acquired) {
      return result;
    }

    if (attempt < retries) {
      log(`Retry ${attempt + 1}/${retries} in ${retryInterval}ms...`);
      await new Promise((r) => setTimeout(r, retryInterval));
    }
  }

  log(`Failed to acquire lock after ${retries} attempts`);
  throw new Error(
    `Failed to acquire startup lock after ${retries} attempts. ` +
      `Another CCS process may be starting CLIProxy.`
  );
}

/**
 * Execute a function while holding the startup lock.
 * Lock is automatically released after function completes or throws.
 *
 * @param fn Function to execute
 * @param options Lock acquisition options (retries, retryInterval, verbose)
 * @returns Result of fn
 */
export async function withStartupLock<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; retryInterval?: number; verbose?: boolean }
): Promise<T> {
  const lock = await acquireStartupLock(options);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
