/**
 * Browser Utilities
 */

export {
  getBrowserMcpServerName,
  getBrowserMcpServerPath,
  installBrowserMcpServer,
  ensureBrowserMcpConfig,
  ensureBrowserMcp,
  uninstallBrowserMcpServer,
  removeBrowserMcpConfig,
  uninstallBrowserMcp,
  syncBrowserMcpToConfigDir,
  ensureBrowserMcpOrThrow,
} from './mcp-installer';

export { appendBrowserToolArgs } from './claude-tool-args';

export {
  buildBrowserLaunchCommands,
  buildManagedBrowserAttachSetupOptions,
  describeManagedBrowserAttachNotReady,
  ensureManagedBrowserUserDataDir,
  getRecommendedBrowserUserDataDir,
  getBrowserAttachOverride,
  getEffectiveClaudeBrowserAttachConfig,
  isManagedClaudeBrowserAttachConfig,
  resolveOptionalBrowserAttachRuntime,
} from './browser-settings';
export type {
  BrowserLaunchCommands,
  BrowserAttachRuntimeResolution,
  EffectiveClaudeBrowserAttachConfig,
  ManagedBrowserAttachBootstrap,
  ManagedBrowserAttachNotReadyMessage,
} from './browser-settings';

export {
  resolveBrowserRuntimeEnv,
  resolveDefaultChromeUserDataDir,
  resolveConfiguredBrowserProfileDir,
} from './chrome-reuse';
export type { BrowserReuseOptions, BrowserRuntimeEnv } from './chrome-reuse';

export { getBrowserStatus, getManagedBrowserSetupHint } from './browser-status';
export type {
  BrowserStatusPayload,
  ClaudeBrowserStatus,
  CodexBrowserStatus,
} from './browser-status';

export { runBrowserSetup } from './browser-setup';
export type { BrowserSetupResult } from './browser-setup';
