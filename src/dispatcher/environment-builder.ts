/**
 * Runtime environment and launch-args builders.
 *
 * Extracted from src/ccs.ts (lines 146-163, 300-327, 329-369).
 * Covers update-cache helpers and launch-arg resolution for native Claude/Codex targets.
 */

import { warn } from '../utils/ui';
import { resolveBrowserExposure } from '../utils/browser';
import { getBrowserConfig, getOfficialChannelsConfig } from '../config/config-loader-facade';
import {
  buildOfficialChannelsArgs,
  getOfficialChannelsEnvironmentStatus,
  officialChannelRequiresMacOS,
  resolveOfficialChannelsLaunchPlan,
} from '../channels/official-channels-runtime';
import { getOfficialChannelReadiness } from '../channels/official-channels-store';
import { buildCodexBrowserMcpOverrides } from '../utils/browser-codex-overrides';
import { getVersion } from '../utils/version';
import {
  checkForUpdates,
  showUpdateNotification,
  checkCachedUpdate,
} from '../utils/update-checker';
import { resolveTargetType } from '../targets/target-resolver';
import type { BrowserLaunchOverride } from '../utils/browser';

// ========== Codex Runtime Config ==========

export function resolveCodexRuntimeConfigOverrides(
  target: ReturnType<typeof resolveTargetType>,
  browserLaunchOverride: BrowserLaunchOverride | undefined
): string[] {
  if (target !== 'codex') {
    return [];
  }

  const codexBrowserExposure = resolveBrowserExposure(
    getBrowserConfig().codex,
    browserLaunchOverride
  );
  if (!codexBrowserExposure.exposeForLaunch) {
    return [];
  }

  return buildCodexBrowserMcpOverrides();
}

// ========== Update Cache Helpers ==========

/**
 * Perform background update check (refreshes cache, no notification).
 */
export async function refreshUpdateCache(): Promise<void> {
  try {
    const currentVersion = getVersion();
    // npm is now the only supported installation method
    await checkForUpdates(currentVersion, true, 'npm');
  } catch (_e) {
    // Silently fail - update check shouldn't crash main CLI
  }
}

/**
 * Show update notification if cached result indicates update available.
 * Returns true if notification was shown.
 */
export async function showCachedUpdateNotification(): Promise<boolean> {
  try {
    const currentVersion = getVersion();
    const updateInfo = checkCachedUpdate(currentVersion);

    if (updateInfo) {
      await showUpdateNotification(updateInfo);
      return true;
    }
  } catch (_e) {
    // Silently fail
  }
  return false;
}

// ========== Native Claude Launch Args ==========

export function resolveNativeClaudeLaunchArgs(
  args: string[],
  profileType: 'default' | 'account',
  targetConfigDir?: string
): string[] {
  const config = getOfficialChannelsConfig();
  const environment = getOfficialChannelsEnvironmentStatus(
    targetConfigDir ? { CLAUDE_CONFIG_DIR: targetConfigDir } : undefined
  );
  const channelReadiness = {
    telegram: getOfficialChannelReadiness('telegram'),
    discord: getOfficialChannelReadiness('discord'),
    imessage: !officialChannelRequiresMacOS('imessage') || process.platform === 'darwin',
  };
  const plan = resolveOfficialChannelsLaunchPlan({
    args,
    config,
    target: 'claude',
    profileType,
    environment,
    channelReadiness,
  });

  for (const message of plan.skippedMessages) {
    console.error(warn(message));
  }

  if (
    config.selected.length > 0 &&
    environment.auth.state === 'eligible' &&
    environment.auth.orgRequirementMessage
  ) {
    console.error(warn(environment.auth.orgRequirementMessage));
  }

  if (!plan.applied) {
    return args;
  }

  return buildOfficialChannelsArgs(args, plan.appliedChannels, plan.wantsPermissionBypass);
}
