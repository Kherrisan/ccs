const CODEX_BROWSER_MCP_SERVER_NAME = 'ccs_browser';
const DEFAULT_BROWSER_TOOL_TIMEOUT_SEC = 30;
const PLAYWRIGHT_MCP_PACKAGE = '@playwright/mcp@0.0.70';

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlArray(values: string[]): string {
  return JSON.stringify(values);
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

export function getCodexBrowserMcpServerName(): string {
  return CODEX_BROWSER_MCP_SERVER_NAME;
}

export function buildCodexBrowserMcpOverrides(): string[] {
  return [
    `mcp_servers.${CODEX_BROWSER_MCP_SERVER_NAME}.command=${formatTomlString(getNpxCommand())}`,
    `mcp_servers.${CODEX_BROWSER_MCP_SERVER_NAME}.args=${formatTomlArray(['-y', PLAYWRIGHT_MCP_PACKAGE])}`,
    `mcp_servers.${CODEX_BROWSER_MCP_SERVER_NAME}.enabled=true`,
    `mcp_servers.${CODEX_BROWSER_MCP_SERVER_NAME}.tool_timeout_sec=${DEFAULT_BROWSER_TOOL_TIMEOUT_SEC}`,
  ];
}
