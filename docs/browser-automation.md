# Browser Automation

Last Updated: 2026-04-16

CCS provides browser automation through two separate runtime paths:

- **Claude Browser Attach**: reuses a running Chrome/Chromium session through the CCS-managed local `ccs-browser` MCP runtime
- **Codex Browser Tools**: injects Playwright MCP tooling into Codex-target launches

These are related, but they are not the same implementation and they do not promise a shared browser session.

## How Browser Automation Works

### Claude Browser Attach

Claude-target CCS launches can provision a managed local MCP server named `ccs-browser`.
That path is designed for workflows where you want Claude to interact with a browser session
that already has useful authenticated state.

Claude Browser Attach requires a browser launched in attach mode with remote debugging
enabled. A recent Chrome update alone is not sufficient.

### Codex Browser Tools

Codex-target CCS launches use a separate managed path: CCS injects Playwright MCP overrides
for the `ccs_browser` runtime config entry.

This is configured from the same Browser settings surface, but it is distinct from Claude
Browser Attach.

## Configuration

### Via Dashboard

Open `ccs config` -> `Settings` -> `Browser`.

The Browser screen exposes two sections:

- **Claude Browser Attach**
  - enable/disable the Claude attach lane
  - choose the Chrome user-data directory
  - set the expected DevTools port
  - review readiness and next-step guidance
  - copy a generated browser launch command
- **Codex Browser Tools**
  - enable/disable CCS-managed browser tooling for Codex-target launches
  - review whether the detected Codex build supports managed browser overrides

### Via CLI

```bash
ccs help browser
ccs browser status
ccs browser doctor
```

Use `ccs browser status` for the current state and `ccs browser doctor` for actionable
troubleshooting guidance.

### Via Config File

Edit `~/.ccs/config.yaml`:

```yaml
browser:
  claude:
    enabled: false
    user_data_dir: "~/.ccs/browser/chrome-user-data"
    devtools_port: 9222
  codex:
    enabled: true
```

Notes:

- `claude.user_data_dir` is a **Chrome user-data directory**, not a display-name browser profile
- `claude.devtools_port` is the expected remote debugging port for attach mode
- `codex.enabled` controls whether CCS injects browser tooling into Codex-target launches

## Environment Variable Overrides

CCS still supports environment-variable overrides for backward compatibility.

| Variable | Description |
|----------|-------------|
| `CCS_BROWSER_USER_DATA_DIR` | Preferred override for Claude Browser Attach user-data dir |
| `CCS_BROWSER_PROFILE_DIR` | Legacy alias for the same attach directory |
| `CCS_BROWSER_DEVTOOLS_PORT` | Explicit DevTools port override |

If an override is active, Browser status surfaces should report that the current session is being
managed externally by environment variables.

Override precedence is:

1. `CCS_BROWSER_USER_DATA_DIR`
2. `CCS_BROWSER_PROFILE_DIR`
3. the persisted `browser.claude.user_data_dir` config value

Config-backed Browser Attach always passes an explicit DevTools port to the runtime, even when the
effective value is the default `9222`. Metadata-based port discovery is preserved only for the
legacy `CCS_BROWSER_PROFILE_DIR` flow when `CCS_BROWSER_DEVTOOLS_PORT` is not set.

## Managed Runtime Files

- `~/.claude.json` -> CCS manages `mcpServers.ccs-browser` for Claude Browser Attach
- `~/.ccs/mcp/ccs-browser-server.cjs` -> local Claude Browser Attach MCP runtime
- `Codex runtime config overrides` -> CCS manages the `ccs_browser` MCP entry for Codex-target launches

Do not treat the generic Codex MCP editor as the primary browser setup path. CCS-managed browser
entries should be configured from `Settings -> Browser`.

## Launching Chrome For Claude Attach

Claude Browser Attach needs a browser launched with remote debugging.

Typical examples:

```bash
# macOS
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.ccs/browser/chrome-user-data"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.ccs/browser/chrome-user-data"

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\\.ccs\\browser\\chrome-user-data"
```

Using a dedicated CCS browser data dir is recommended. It avoids profile-locking issues and keeps
automation state separate from your daily browser profile.

When Claude Browser Attach uses the recommended managed path (`~/.ccs/browser/chrome-user-data`),
CCS now creates that directory automatically the first time it needs it. After that bootstrap step,
the remaining requirement is a running Chrome session started with `--remote-debugging-port`.

## Troubleshooting

### Browser status says Claude Browser Attach is disabled

Enable Claude Browser Attach in `Settings -> Browser` or via the browser config block in
`~/.ccs/config.yaml`.

### Browser status says the path is missing

The configured Chrome user-data directory does not exist yet.

1. Create the directory or use the generated launch command
2. Start Chrome in attach mode with `--remote-debugging-port`
3. Rerun `ccs browser doctor`

If you are using the CCS-managed default path, this usually means the path could not be created
automatically and now needs manual attention.

### Browser status says no running browser session was found

CCS could not find usable DevTools attach metadata for the configured user-data directory.

1. Make sure Chrome was started with `--remote-debugging-port=<port>`
2. Make sure it is using the same `user_data_dir` configured in CCS
3. Rerun `ccs browser doctor`

For the CCS-managed default path, this is the normal first-run state after CCS bootstraps the
directory for you.

### Browser status says the DevTools endpoint is unreachable

CCS found attach metadata, but the endpoint did not answer successfully.

1. Restart the attach browser session
2. Confirm the expected port matches the real remote debugging port
3. Rerun `ccs browser status`

### Codex Browser Tools are unavailable

Codex browser tooling depends on a Codex build that supports `--config` overrides.

If CCS reports `unsupported_build`, upgrade Codex and rerun `ccs browser status`.

## Security Notes

- Browser automation may operate inside authenticated browser sessions
- Prefer a dedicated automation user-data dir instead of your everyday browser profile
- Do not commit browser paths, secrets, or generated session state to version control
- Treat `~/.ccs/config.yaml`, `~/.claude.json`, and the browser user-data directory as local machine state
