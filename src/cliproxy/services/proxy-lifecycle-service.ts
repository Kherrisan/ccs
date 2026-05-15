/**
 * CLIProxy Proxy Lifecycle Service
 *
 * Handles start/stop/status operations for CLIProxy instances.
 * Delegates to session-tracker and service-manager for actual process management.
 */

import {
  stopProxy as stopProxySession,
  getProxyStatus as getProxyStatusSession,
} from '../session-tracker';
import { ensureCliproxyService } from '../service-manager';
import { resolveLifecyclePort } from '../config/port-manager';

/** Proxy status result */
export interface ProxyStatusResult {
  running: boolean;
  port?: number;
  pid?: number;
  sessionCount?: number;
  startedAt?: string;
}

/** Stop proxy result */
export interface StopProxyResult {
  stopped: boolean;
  port?: number;
  pid?: number;
  sessionCount?: number;
  error?: string;
}

/** Start proxy result */
export interface StartProxyResult {
  started: boolean;
  alreadyRunning: boolean;
  port: number;
  configRegenerated?: boolean;
  error?: string;
}

/**
 * Get current proxy status
 */
export function getProxyStatus(port: number = resolveLifecyclePort()): ProxyStatusResult {
  return getProxyStatusSession(port);
}

/**
 * Stop the running CLIProxy instance
 */
export async function stopProxy(port: number = resolveLifecyclePort()): Promise<StopProxyResult> {
  return stopProxySession(port);
}

/**
 * Start CLIProxy service (or reuse existing running instance)
 */
export async function startProxy(
  port: number = resolveLifecyclePort(),
  verbose: boolean = false
): Promise<StartProxyResult> {
  return ensureCliproxyService(port, verbose);
}

/**
 * Check if proxy is currently running
 */
export function isProxyRunning(): boolean {
  const status = getProxyStatusSession(resolveLifecyclePort());
  return status.running;
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  const status = getProxyStatusSession(resolveLifecyclePort());
  return status.sessionCount ?? 0;
}
