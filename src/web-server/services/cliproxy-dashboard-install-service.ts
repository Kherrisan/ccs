import {
  installCliproxyVersion,
  resolveLocalBackend,
  syncPlusFallbackStateIfNeeded,
} from '../../cliproxy/binary-manager';
import { ensureCliproxyService, type ServiceStartResult } from '../../cliproxy/service-manager';
import { getProxyStatus as getProxyProcessStatus } from '../../cliproxy/session-tracker';
import { isCliproxyRunning } from '../../cliproxy/stats-fetcher';
import type { CLIProxyBackend } from '../../cliproxy/types';
import {
  isRunningUnderSupervisord,
  restartCliproxyViaSupervisord,
} from '../../docker/supervisord-lifecycle';

interface ProxyStatusLike {
  running: boolean;
}

interface InstallDashboardCliproxyVersionDeps {
  getProxyStatus: () => ProxyStatusLike;
  isCliproxyRunning: () => Promise<boolean>;
  installCliproxyVersion: (
    version: string,
    verbose?: boolean,
    backend?: CLIProxyBackend
  ) => Promise<void>;
  ensureCliproxyService: () => Promise<ServiceStartResult>;
}

const defaultDeps: InstallDashboardCliproxyVersionDeps = {
  getProxyStatus: getProxyProcessStatus,
  isCliproxyRunning,
  installCliproxyVersion,
  ensureCliproxyService: () => ensureCliproxyService(),
};

export interface DashboardCliproxyInstallResult {
  success: boolean;
  restarted: boolean;
  port?: number;
  message: string;
  error?: string;
}

async function wasProxyRunning(deps: InstallDashboardCliproxyVersionDeps): Promise<boolean> {
  const status = deps.getProxyStatus();
  if (status.running) {
    return true;
  }

  return deps.isCliproxyRunning();
}

export async function installDashboardCliproxyVersion(
  version: string,
  backend: CLIProxyBackend,
  deps: InstallDashboardCliproxyVersionDeps = defaultDeps
): Promise<DashboardCliproxyInstallResult> {
  syncPlusFallbackStateIfNeeded(backend);
  const effectiveBackend = resolveLocalBackend(backend, { warnOnFallback: true });
  const backendLabel = effectiveBackend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
  const shouldRestoreService = await wasProxyRunning(deps);

  // The installer owns the stop-and-replace lifecycle, including best-effort
  // shutdown for tracked and untracked proxies before swapping the binary.
  await deps.installCliproxyVersion(version, true, effectiveBackend);

  if (!shouldRestoreService) {
    return {
      success: true,
      restarted: false,
      message: `Successfully installed ${backendLabel} v${version}`,
    };
  }

  // In Docker, supervisord owns process lifecycle — delegate restart to it
  if (isRunningUnderSupervisord()) {
    const result = restartCliproxyViaSupervisord();
    return {
      success: result.success,
      restarted: result.success,
      port: result.port,
      error: result.error,
      message: result.success
        ? `Successfully installed ${backendLabel} v${version} and restarted it on port ${result.port}`
        : `Installed ${backendLabel} v${version}, but restart failed`,
    };
  }

  const startResult = await deps.ensureCliproxyService();
  if (!startResult.started && !startResult.alreadyRunning) {
    return {
      success: false,
      restarted: false,
      error: startResult.error || `Installed ${backendLabel} v${version}, but restart failed`,
      message: `Installed ${backendLabel} v${version}, but failed to restart it`,
    };
  }

  return {
    success: true,
    restarted: true,
    port: startResult.port,
    message: `Successfully installed ${backendLabel} v${version} and restarted it on port ${startResult.port}`,
  };
}
