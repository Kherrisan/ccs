# Browser Automation

Last Updated: 2026-04-18

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

The managed `ccs-browser` runtime currently exposes five tool groups:

- **Session inspection**: `browser_get_session_info`, `browser_get_url_and_title`, `browser_get_visible_text`, `browser_get_dom_snapshot`
- **Navigation and interaction**: `browser_navigate`, `browser_click`, `browser_type`, `browser_press_key`, `browser_scroll`, `browser_take_screenshot`
- **Hover diagnostics**: `browser_hover`, `browser_query`, `browser_take_element_screenshot`
- **Readiness and page evaluation**: `browser_wait_for`, `browser_eval`
- **Event observation**: `browser_wait_for_event`

Notable Phase 1 capability details:

- `browser_click` accepts zero-based `nth` so Claude can target the Nth matching element
- `browser_query` is multi-match aware and can return `count`, `href`, and `onclick` in addition to visibility-oriented fields
- `browser_wait_for` can wait on page text or selector state before the next step runs
- `browser_eval` is gated by `browser.claude.eval_mode` and supports `disabled`, `readonly`, or `readwrite`; readonly mode uses side-effect-blocked evaluation and may reject expressions that could mutate page state

Phase 3 capability details:

- `browser_click`, `browser_hover`, `browser_query`, `browser_wait_for`, and `browser_take_element_screenshot` accept optional `frameSelector` to resolve targets inside a specific same-origin iframe
- the same scoped-selector tools accept optional `pierceShadow: true` to search open shadow roots beneath the selected root
- `browser_wait_for_event` observes typed page or browser events for dialogs, navigation, requests, and downloads

Phase 4 capability details:

- `browser_click` also accepts optional `offsetX`, `offsetY`, `button`, and `clickCount` for more precise element-relative click control
- `browser_press_key` sends real browser-level key events, supports modifier combinations plus repeat counts, and covers a focused set of common special keys such as `Enter`, `Tab`, `Escape`, and arrow keys
- `browser_scroll` supports page-level `by-offset` scrolling and element-scoped `by-offset` or `into-view` scrolling, including same-origin iframe scoping

A common hover-debug workflow is:

1. call `browser_hover` to move the browser pointer onto the card or trigger
2. call `browser_wait_for` if the hover state needs time to appear
3. call `browser_query` on the hover-only control to inspect `exists`, `count`, visibility, opacity, `href`, `onclick`, and bounds
4. call `browser_take_element_screenshot` to confirm the revealed state
5. call `browser_eval` in read-only mode when you need page-side inspection that the structured tools do not expose directly

Scoped selector notes:

- `browser_click`, `browser_hover`, `browser_query`, `browser_wait_for`, and `browser_take_element_screenshot` accept optional `frameSelector` for same-origin iframes whose `contentDocument` is accessible
- the same selector-based tools accept optional `pierceShadow: true` for open shadow-root traversal
- closed shadow roots, frame-index routing, request interception, and download acceptance controls are still out of scope

Example event wait:

```json
{
  "name": "browser_wait_for_event",
  "arguments": {
    "event": { "kind": "navigation", "urlIncludes": "/checkout" },
    "timeoutMs": 2000
  }
}
```

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
  - choose the `browser_eval` access level (`disabled`, `readonly`, `readwrite`)
  - review readiness and next-step guidance
  - copy a generated browser launch command
- **Codex Browser Tools**
  - enable/disable CCS-managed browser tooling for Codex-target launches
  - choose the stored `browser_eval` access level for Browser settings parity
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
    eval_mode: readonly
  codex:
    enabled: true
    eval_mode: readonly
```

Notes:

- `claude.user_data_dir` is a **Chrome user-data directory**, not a display-name browser profile
- `claude.devtools_port` is the expected remote debugging port for attach mode
- `claude.eval_mode` controls whether `browser_eval` is disabled, read-only, or read/write for Claude Browser Attach
- `codex.enabled` controls whether CCS injects browser tooling into Codex-target launches
- `codex.eval_mode` is stored and surfaced in Browser settings for parity; in Phase 1, `browser_eval` enforcement primarily applies to Claude Browser Attach

## Environment Variable Overrides

CCS still supports environment-variable overrides for backward compatibility.

| Variable | Description |
|----------|-------------|
| `CCS_BROWSER_USER_DATA_DIR` | Preferred override for Claude Browser Attach user-data dir |
| `CCS_BROWSER_PROFILE_DIR` | Legacy alias for the same attach directory |
| `CCS_BROWSER_DEVTOOLS_PORT` | Explicit DevTools port override |
| `CCS_BROWSER_EVAL_MODE` | Explicit `browser_eval` access override for Claude Browser Attach |

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

## Troubleshooting

### Browser status says Claude Browser Attach is disabled

Enable Claude Browser Attach in `Settings -> Browser` or via the browser config block in
`~/.ccs/config.yaml`.

### Browser status says the path is missing

The configured Chrome user-data directory does not exist yet.

1. Create the directory or use the generated launch command
2. Start Chrome in attach mode with `--remote-debugging-port`
3. Rerun `ccs browser doctor`

### Browser status says no running browser session was found

CCS could not find usable DevTools attach metadata for the configured user-data directory.

1. Make sure Chrome was started with `--remote-debugging-port=<port>`
2. Make sure it is using the same `user_data_dir` configured in CCS
3. Rerun `ccs browser doctor`

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
