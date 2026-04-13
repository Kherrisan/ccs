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
  resolveBrowserRuntimeEnv,
  resolveDefaultChromeUserDataDir,
  resolveConfiguredBrowserProfileDir,
} from './chrome-reuse';
export type { BrowserReuseOptions, BrowserRuntimeEnv } from './chrome-reuse';
