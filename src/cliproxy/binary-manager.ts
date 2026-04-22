/**
 * Binary Manager for CLIProxyAPI
 *
 * Facade pattern wrapper for modular binary management.
 * Pattern: Mirrors npm install behavior (fast check, download only when needed)
 */

import * as fs from 'fs';
import * as path from 'path';
import { info, warn } from '../utils/ui';
import { getBinDir, CLIPROXY_DEFAULT_PORT } from './config-generator';
import { BinaryInfo, BinaryManagerConfig } from './types';
import {
  BACKEND_CONFIG,
  DEFAULT_BACKEND,
  CLIPROXY_MAX_STABLE_VERSION,
  getExecutableName,
} from './platform-detector';
import { stopProxy } from './services/proxy-lifecycle-service';
import { waitForPortFree } from '../utils/port-utils';
import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import {
  UpdateCheckResult,
  checkForUpdates,
  deleteBinary,
  getVersionCachePath,
  getBinaryPath,
  isBinaryInstalled,
  getBinaryInfo,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
  getVersionPinPath,
  readInstalledVersion,
  ensureBinary,
  migrateVersionPin,
} from './binary';

import type { CLIProxyBackend } from './types';
import { getVersionListCachePath } from './binary/version-cache';

export const CLIPROXY_PLUS_TRACKING_URL = 'https://github.com/kaitranntt/ccs/issues/1062';

/**
 * Track whether we've already warned the user about the Plus fallback this
 * process lifetime. Prevents spamming the warning on every command.
 */
let plusFallbackWarned = false;

function emitPlusFallbackWarning(): void {
  if (plusFallbackWarned) return;
  plusFallbackWarned = true;
  process.stderr.write(
    `${warn(
      'CLIProxyAPIPlus upstream repo is currently unavailable; local CLIProxy is falling back to ' +
        '`backend: original`. Run `ccs config` to update your saved config. ' +
        `Tracking: ${CLIPROXY_PLUS_TRACKING_URL}`
    )}\n`
  );
}

export function getPlusBackendUnavailableMessage(provider?: string): string {
  const prefix = provider
    ? `${provider} requires CLIProxyAPIPlus,`
    : 'CLIProxyAPIPlus upstream repo is currently unavailable,';
  return (
    `${prefix} but local CLIProxy currently supports only \`backend: original\`. ` +
    `Tracking: ${CLIPROXY_PLUS_TRACKING_URL}`
  );
}

export function resolveLocalBackend(
  backend: CLIProxyBackend = DEFAULT_BACKEND,
  options: { warnOnFallback?: boolean } = {}
): CLIProxyBackend {
  if (backend !== 'plus') return backend;
  if (options.warnOnFallback) {
    emitPlusFallbackWarning();
  }
  return 'original';
}

function copyFallbackStateIfMissing(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

export function syncPlusFallbackStateIfNeeded(configuredBackend: CLIProxyBackend): void {
  if (configuredBackend !== 'plus') return;

  const plusDir = getBackendBinDir('plus');
  const originalDir = getBackendBinDir('original');

  copyFallbackStateIfMissing(
    path.join(plusDir, getExecutableName('plus')),
    path.join(originalDir, getExecutableName('original'))
  );
  copyFallbackStateIfMissing(path.join(plusDir, '.version'), path.join(originalDir, '.version'));
  copyFallbackStateIfMissing(getVersionPinPath('plus'), getVersionPinPath('original'));
  copyFallbackStateIfMissing(getVersionCachePath('plus'), getVersionCachePath('original'));
  copyFallbackStateIfMissing(getVersionListCachePath('plus'), getVersionListCachePath('original'));
}

function getConfiguredOrDefaultBackend(): CLIProxyBackend {
  try {
    const config = loadOrCreateUnifiedConfig();
    return config.cliproxy?.backend || DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

export function getStoredConfiguredBackend(): CLIProxyBackend {
  return getConfiguredOrDefaultBackend();
}

/**
 * Get backend from config, with runtime fallback to 'original' when the user
 * still has `backend: plus` saved.
 *
 * Context (issue #1062): the upstream `router-for-me/CLIProxyAPIPlus` repo was
 * deleted, so any `backend: plus` install/update path hits a 404. Rather than
 * forcing users to manually edit config.yaml, we degrade to `original` at
 * runtime and warn once. This keeps existing installations working without a
 * reconfig step, while CCS self-maintains its own Plus fork (future work).
 */
export function getConfiguredBackend(options: { warnOnFallback?: boolean } = {}): CLIProxyBackend {
  return resolveLocalBackend(getConfiguredOrDefaultBackend(), options);
}

/**
 * Get backend-specific binary directory.
 * Stores binaries in separate dirs: bin/original/ and bin/plus/
 */
function getBackendBinDir(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  const baseDir = getBinDir();
  return `${baseDir}/${backend}`;
}

/** Default configuration (uses backend from config.yaml or defaults to `DEFAULT_BACKEND`) */
function createDefaultConfig(backend: CLIProxyBackend = DEFAULT_BACKEND): BinaryManagerConfig {
  const backendConfig = BACKEND_CONFIG[backend];
  return {
    version: backendConfig.fallbackVersion,
    releaseUrl: `https://github.com/${backendConfig.repo}/releases/download`,
    binPath: getBackendBinDir(backend),
    maxRetries: 3,
    verbose: false,
    forceVersion: false,
    skipAutoUpdate: false,
    allowInstall: true,
    backend, // Pass backend for installer to use correct download URL
  };
}

/**
 * Binary Manager class for CLIProxyAPI binary lifecycle
 */
export class BinaryManager {
  private config: BinaryManagerConfig;
  private backend: CLIProxyBackend;

  constructor(config: Partial<BinaryManagerConfig> = {}, backend?: CLIProxyBackend) {
    const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
    syncPlusFallbackStateIfNeeded(configuredBackend);
    this.backend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
    const defaultConfig = createDefaultConfig(this.backend);
    this.config = { ...defaultConfig, ...config };
  }

  /** Ensure binary is available (download if missing, update if outdated) */
  async ensureBinary(): Promise<string> {
    return ensureBinary(this.config);
  }

  /** Check for updates by comparing installed version with latest release */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    return checkForUpdates(
      this.config.binPath,
      this.config.version,
      this.config.verbose,
      this.backend
    );
  }

  /** Get full path to binary executable */
  getBinaryPath(): string {
    return getBinaryPath(this.config.binPath, this.backend);
  }

  /** Check if binary exists */
  isBinaryInstalled(): boolean {
    return isBinaryInstalled(this.config.binPath, this.backend);
  }

  /** Get binary info if installed */
  async getBinaryInfo(): Promise<BinaryInfo | null> {
    return getBinaryInfo(this.config.binPath, this.config.version, this.backend);
  }

  /** Delete binary (for cleanup or reinstall) */
  deleteBinary(): void {
    deleteBinary(this.config.binPath, this.config.verbose, this.backend);
  }
}

export interface EnsureCLIProxyBinaryOptions {
  allowInstall?: boolean;
  skipAutoUpdate?: boolean;
}

/** Convenience function respecting version pin */
export async function ensureCLIProxyBinary(
  verbose = false,
  options: EnsureCLIProxyBinaryOptions = {}
): Promise<string> {
  const configuredBackend = getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const backend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });

  // Migrate old shared pin to backend-specific location (one-time migration)
  migrateVersionPin(backend);

  const pinnedVersion = getPinnedVersion(backend);
  if (pinnedVersion) {
    if (verbose) console.error(`[cliproxy] Using pinned version: ${pinnedVersion}`);
    return new BinaryManager(
      {
        version: pinnedVersion,
        verbose,
        forceVersion: true,
        skipAutoUpdate: options.skipAutoUpdate ?? false,
        allowInstall: options.allowInstall ?? true,
      },
      backend
    ).ensureBinary();
  }
  return new BinaryManager(
    {
      verbose,
      skipAutoUpdate: options.skipAutoUpdate ?? false,
      allowInstall: options.allowInstall ?? true,
    },
    backend
  ).ensureBinary();
}

/** Check if CLIProxyAPI binary is installed */
export function isCLIProxyInstalled(backend?: CLIProxyBackend): boolean {
  const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const effectiveBackend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
  return new BinaryManager({}, effectiveBackend).isBinaryInstalled();
}

/** Get CLIProxyAPI binary path (may not exist) */
export function getCLIProxyPath(backend?: CLIProxyBackend): string {
  const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const effectiveBackend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
  return new BinaryManager({}, effectiveBackend).getBinaryPath();
}

/** Get installed CLIProxyAPI version from .version file */
export function getInstalledCliproxyVersion(backend?: CLIProxyBackend): string {
  const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const effectiveBackend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
  return readInstalledVersion(
    getBackendBinDir(effectiveBackend),
    BACKEND_CONFIG[effectiveBackend].fallbackVersion
  );
}

interface InstallCliproxyVersionDeps {
  createManager?: (
    config: Partial<BinaryManagerConfig>,
    backend: CLIProxyBackend
  ) => Pick<BinaryManager, 'isBinaryInstalled' | 'deleteBinary' | 'ensureBinary'>;
  stopProxyFn?: typeof stopProxy;
  waitForPortFreeFn?: typeof waitForPortFree;
  formatInfo?: typeof info;
  formatWarn?: typeof warn;
  getInstalledVersion?: typeof getInstalledCliproxyVersion;
}

/** Install a specific version of CLIProxyAPI */
export async function installCliproxyVersion(
  version: string,
  verbose = false,
  backend?: CLIProxyBackend,
  deps: InstallCliproxyVersionDeps = {}
): Promise<void> {
  const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const effectiveBackend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
  const manager =
    deps.createManager?.({ version, verbose, forceVersion: true }, effectiveBackend) ??
    new BinaryManager({ version, verbose, forceVersion: true }, effectiveBackend);
  const stopProxyFn = deps.stopProxyFn ?? stopProxy;
  const waitForPortFreeFn = deps.waitForPortFreeFn ?? waitForPortFree;
  const formatInfo = deps.formatInfo ?? info;
  const formatWarn = deps.formatWarn ?? warn;
  const getInstalledVersion = deps.getInstalledVersion ?? getInstalledCliproxyVersion;

  // Always attempt a best-effort stop first so we also catch untracked proxies
  // that are running without a session lock.
  if (verbose) console.log(formatInfo('Stopping running CLIProxy before update...'));
  const result = await stopProxyFn();
  if (result.stopped) {
    // Wait for port to be fully released
    const portFree = await waitForPortFreeFn(CLIPROXY_DEFAULT_PORT, 5000);
    if (!portFree && verbose) {
      console.log(formatWarn('Port did not free up in time, proceeding anyway...'));
    }
  } else if (verbose && result.error && result.error !== 'No active CLIProxy session found') {
    console.log(formatWarn(`Could not stop proxy: ${result.error}`));
  }

  if (manager.isBinaryInstalled()) {
    const label = effectiveBackend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
    if (verbose)
      console.log(
        formatInfo(`Removing existing ${label} v${getInstalledVersion(effectiveBackend)}`)
      );
    manager.deleteBinary();
  }
  await manager.ensureBinary();

  if (verbose) {
    console.log(formatInfo('New version will be active on next CLIProxy command'));
  }
}

/** Fetch the latest CLIProxyAPI version from GitHub API */
export async function fetchLatestCliproxyVersion(backend?: CLIProxyBackend): Promise<string> {
  const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const effectiveBackend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
  const result = await new BinaryManager({}, effectiveBackend).checkForUpdates();
  return result.latestVersion;
}

/** Update check result for API response */
export interface CliproxyUpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  fromCache: boolean;
  checkedAt: number;
  // Backend info
  backend: CLIProxyBackend;
  backendLabel: string;
  // Stability fields
  isStable: boolean;
  maxStableVersion: string;
  stabilityMessage?: string;
}

/** Check for CLIProxyAPI binary updates */
export async function checkCliproxyUpdate(
  backend?: CLIProxyBackend
): Promise<CliproxyUpdateCheckResult> {
  const configuredBackend = backend ?? getConfiguredOrDefaultBackend();
  syncPlusFallbackStateIfNeeded(configuredBackend);
  const effectiveBackend = resolveLocalBackend(configuredBackend, { warnOnFallback: true });
  const result = await new BinaryManager({}, effectiveBackend).checkForUpdates();

  // Import isNewerVersion for stability check
  const { isNewerVersion } = await import('./binary/version-checker');
  const isStable = !isNewerVersion(result.currentVersion, CLIPROXY_MAX_STABLE_VERSION);
  const stabilityMessage = isStable
    ? undefined
    : `v${result.currentVersion} has known stability issues. Max stable: v${CLIPROXY_MAX_STABLE_VERSION}`;

  const backendLabel = effectiveBackend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';

  return {
    ...result,
    backend: effectiveBackend,
    backendLabel,
    isStable,
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    stabilityMessage,
  };
}

// Re-export version pin functions
export {
  getVersionPinPath,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
  migrateVersionPin,
};

export default BinaryManager;
