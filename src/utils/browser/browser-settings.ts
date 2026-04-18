import * as fs from 'fs';
import * as path from 'path';
import type { BrowserConfig } from '../../config/unified-config-types';
import { getCcsDir } from '../config-manager';
import { expandPath } from '../helpers';
import { getNodePlatformKey } from './platform';
import { type BrowserRuntimeEnv, resolveBrowserRuntimeEnv } from './chrome-reuse';

export type BrowserOverrideSource = 'CCS_BROWSER_USER_DATA_DIR' | 'CCS_BROWSER_PROFILE_DIR';

export interface EffectiveClaudeBrowserAttachConfig {
  enabled: boolean;
  source: 'config' | BrowserOverrideSource;
  overrideActive: boolean;
  userDataDir: string;
  devtoolsPort: number;
  hasExplicitDevtoolsPort: boolean;
}

export function getRecommendedBrowserUserDataDir(): string {
  return path.join(getCcsDir(), 'browser', 'chrome-user-data');
}

export interface BrowserAttachRuntimeResolution {
  runtimeEnv?: BrowserRuntimeEnv;
  warning?: string;
}

export interface ManagedBrowserAttachBootstrap {
  usesManagedDefaultDir: boolean;
  createdProfileDir: boolean;
}

export interface ManagedBrowserAttachNotReadyMessage {
  state: 'path_missing' | 'browser_not_running' | 'endpoint_unreachable';
  title: string;
  detail: string;
  nextStep: string;
  warning: string;
}

function isManagedDefaultBrowserAttach(config: EffectiveClaudeBrowserAttachConfig): boolean {
  return (
    config.source === 'config' &&
    path.resolve(config.userDataDir) === path.resolve(getRecommendedBrowserUserDataDir())
  );
}

function buildCurrentPlatformLaunchCommand(userDataDir: string, devtoolsPort: number): string {
  const quotedPath = JSON.stringify(userDataDir);
  switch (getNodePlatformKey()) {
    case 'darwin':
      return `open -na "Google Chrome" --args --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
    case 'win32':
      return `chrome.exe --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
    default:
      return `google-chrome --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
  }
}

export function resolveBrowserUserDataDir(value?: string): string | undefined {
  return value?.trim() ? expandPath(value) : undefined;
}

export function ensureManagedBrowserUserDataDir(
  config: EffectiveClaudeBrowserAttachConfig
): ManagedBrowserAttachBootstrap {
  if (!isManagedDefaultBrowserAttach(config)) {
    return {
      usesManagedDefaultDir: false,
      createdProfileDir: false,
    };
  }

  try {
    fs.statSync(config.userDataDir);
    return {
      usesManagedDefaultDir: true,
      createdProfileDir: false,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') {
      return {
        usesManagedDefaultDir: true,
        createdProfileDir: false,
      };
    }
  }

  try {
    fs.mkdirSync(config.userDataDir, { recursive: true, mode: 0o700 });
    return {
      usesManagedDefaultDir: true,
      createdProfileDir: true,
    };
  } catch {
    return {
      usesManagedDefaultDir: true,
      createdProfileDir: false,
    };
  }
}

export function describeManagedBrowserAttachNotReady(
  config: EffectiveClaudeBrowserAttachConfig,
  errorMessage: string,
  options: {
    createdProfileDir?: boolean;
    launchCommand?: string;
  } = {}
): ManagedBrowserAttachNotReadyMessage | undefined {
  if (!isManagedDefaultBrowserAttach(config)) {
    return undefined;
  }

  const launchCommand =
    options.launchCommand ??
    buildCurrentPlatformLaunchCommand(config.userDataDir, config.devtoolsPort);
  const continueWithoutTools =
    'CCS will continue without browser tools until the attach session is ready.';

  if (errorMessage.includes('Chrome reuse metadata')) {
    const summary = options.createdProfileDir
      ? `CCS created the managed browser profile at ${config.userDataDir}, but no running attach-mode Chrome session is using it yet`
      : `No running attach-mode Chrome session is using the managed browser profile at ${config.userDataDir}`;
    const nextStep = `Start Chrome with remote debugging and the managed user-data dir. Example: ${launchCommand}`;
    return {
      state: 'browser_not_running',
      title: 'Claude Browser Attach is waiting for a managed Chrome session.',
      detail: `${summary}. Diagnostic: ${errorMessage}`,
      nextStep,
      warning: `${summary}. ${nextStep} ${continueWithoutTools}`,
    };
  }

  if (errorMessage.includes('Chrome DevTools endpoint')) {
    const summary = `CCS could not reach the attach-mode DevTools endpoint for the managed browser profile at ${config.userDataDir}`;
    const nextStep = `Restart Chrome in attach mode and retry. Example: ${launchCommand}`;
    return {
      state: 'endpoint_unreachable',
      title: 'Claude Browser Attach could not reach the managed Chrome session.',
      detail: `${summary}. Diagnostic: ${errorMessage}`,
      nextStep,
      warning: `${summary}. ${nextStep} ${continueWithoutTools}`,
    };
  }

  if (errorMessage.includes('Chrome profile directory is invalid')) {
    const summary = `CCS could not initialize the managed browser profile at ${config.userDataDir}`;
    const nextStep = `Confirm the path is writable or reset it to the CCS-managed default, then launch Chrome in attach mode. Example: ${launchCommand}`;
    return {
      state: 'path_missing',
      title: 'Claude Browser Attach could not initialize the managed profile.',
      detail: `${summary}. Diagnostic: ${errorMessage}`,
      nextStep,
      warning: `${summary}. ${nextStep} ${continueWithoutTools}`,
    };
  }

  return undefined;
}

export function getBrowserAttachOverride(env: NodeJS.ProcessEnv = process.env): {
  userDataDir?: string;
  devtoolsPort?: number;
  source?: BrowserOverrideSource;
} {
  const explicitUserDataDir = resolveBrowserUserDataDir(env.CCS_BROWSER_USER_DATA_DIR);
  if (explicitUserDataDir) {
    return {
      userDataDir: explicitUserDataDir,
      devtoolsPort: parseDevtoolsPort(env.CCS_BROWSER_DEVTOOLS_PORT),
      source: 'CCS_BROWSER_USER_DATA_DIR',
    };
  }

  const legacyProfileDir = resolveBrowserUserDataDir(env.CCS_BROWSER_PROFILE_DIR);
  if (legacyProfileDir) {
    return {
      userDataDir: legacyProfileDir,
      devtoolsPort: parseDevtoolsPort(env.CCS_BROWSER_DEVTOOLS_PORT),
      source: 'CCS_BROWSER_PROFILE_DIR',
    };
  }

  return {};
}

export function getEffectiveClaudeBrowserAttachConfig(
  config: BrowserConfig,
  env: NodeJS.ProcessEnv = process.env
): EffectiveClaudeBrowserAttachConfig {
  const override = getBrowserAttachOverride(env);
  const configUserDataDir =
    resolveBrowserUserDataDir(config.claude.user_data_dir) ?? getRecommendedBrowserUserDataDir();
  const configPort = normalizeDevtoolsPort(config.claude.devtools_port);

  if (override.userDataDir) {
    return {
      enabled: true,
      source: override.source as BrowserOverrideSource,
      overrideActive: true,
      userDataDir: override.userDataDir,
      devtoolsPort: override.devtoolsPort ?? configPort,
      hasExplicitDevtoolsPort: override.devtoolsPort !== undefined,
    };
  }

  return {
    enabled: config.claude.enabled,
    source: 'config',
    overrideActive: false,
    userDataDir: configUserDataDir,
    devtoolsPort: configPort,
    // Config-backed browser attach always keeps an explicit port so launches
    // stay aligned with Settings > Browser, even when the effective value is
    // the default 9222.
    hasExplicitDevtoolsPort: true,
  };
}

export async function resolveOptionalBrowserAttachRuntime(
  config: EffectiveClaudeBrowserAttachConfig
): Promise<BrowserAttachRuntimeResolution> {
  if (!config.enabled) {
    return {};
  }

  const bootstrap = ensureManagedBrowserUserDataDir(config);
  if (bootstrap.createdProfileDir) {
    return {
      warning: describeManagedBrowserAttachNotReady(
        config,
        `Chrome reuse metadata not found: ${path.join(config.userDataDir, 'DevToolsActivePort')}`,
        { createdProfileDir: true }
      )?.warning,
    };
  }

  try {
    return {
      runtimeEnv: await resolveBrowserRuntimeEnv({
        profileDir: config.userDataDir,
        devtoolsPort: config.hasExplicitDevtoolsPort ? String(config.devtoolsPort) : undefined,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const managedDefaultMessage = describeManagedBrowserAttachNotReady(config, message, {
      createdProfileDir: bootstrap.createdProfileDir,
    });
    if (managedDefaultMessage) {
      return {
        warning: managedDefaultMessage.warning,
      };
    }

    throw error;
  }
}

function parseDevtoolsPort(value?: string): number | undefined {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return normalizeDevtoolsPort(Number.parseInt(value.trim(), 10));
}

function normalizeDevtoolsPort(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 9222;
  }

  const port = Math.floor(value as number);
  if (port < 1 || port > 65535) {
    return 9222;
  }

  return port;
}
