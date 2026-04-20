# Browser Automation

Last Updated: 2026-04-19

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

The managed `ccs-browser` runtime currently exposes seven tool groups:

- **Session inspection**: `browser_get_session_info`, `browser_get_url_and_title`, `browser_get_visible_text`, `browser_get_dom_snapshot`
- **Navigation and interaction**: `browser_navigate`, `browser_click`, `browser_type`, `browser_press_key`, `browser_scroll`, `browser_select_page`, `browser_open_page`, `browser_close_page`, `browser_take_screenshot`, `browser_drag_element`, `browser_pointer_action`, `browser_start_replay`, `browser_get_replay`, `browser_cancel_replay`, `browser_start_orchestration`, `browser_get_orchestration`, `browser_cancel_orchestration`
- **Hover diagnostics**: `browser_hover`, `browser_query`, `browser_take_element_screenshot`
- **Readiness and page evaluation**: `browser_wait_for`, `browser_eval`
- **Event observation**: `browser_wait_for_event`
- **Network interception**: `browser_add_intercept_rule`, `browser_remove_intercept_rule`, `browser_list_intercept_rules`, `browser_list_requests`
- **File transfer**: `browser_set_download_behavior`, `browser_list_downloads`, `browser_cancel_download`, `browser_set_file_input`, `browser_drag_files`

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

Phase 5 capability details:

- `browser_get_session_info` marks the currently selected page
- `browser_select_page` chooses the default target page for later tool calls
- `browser_open_page` opens a new tab and makes it selected
- `browser_close_page` closes the selected page by default and deterministically falls back only when the selected page is closed or no longer available
- existing tools still honor explicit `pageIndex`; when omitted, they resolve through the selected page
- selected page state is session-local MCP runtime state and is not persisted across runtime restarts

Phase 6 capability details:

- interception rules are session-local and bind to the concrete page selected when the rule is created
- Phase 6 supports minimal request matching by `urlIncludes` and `method`
- Phase 6A actions are limited to `continue` and `fail`
- Phase 6B adds `fulfill` mock responses on top of the existing session-local interception model
- fulfill rules can return a custom status code, optional response headers, and a UTF-8 response body
- `browser_list_requests` returns recent request summaries, not full bodies
- response bodies are applied only to the matched request and are not persisted beyond the current MCP session

Phase 7 capability details:

- `browser_add_intercept_rule` also accepts `resourceType`, `urlPattern`, `urlRegex`, `headerMatchers`, and `priority`
- richer matching rules remain page-bound and session-local; creating a rule still binds it to the concrete page selected at creation time
- higher `priority` rules win before lower-priority rules, while equal-priority rules continue to follow creation order
- `headerMatchers` are request-matching conditions; `responseHeaders` on `fulfill` rules remain response headers

Phase 8 capability details:

- `browser_set_download_behavior` configures browser-scoped download acceptance for the current attach session; `behavior: "accept"` can use an explicit `downloadPath` or a session-local default directory
- `browser_list_downloads` returns recent download summaries only; it does not read or return downloaded file contents
- `browser_cancel_download` cancels an in-progress download by `downloadId` or `guid`
- `browser_set_file_input` sets one or more local files on a matched `<input type="file">` using the existing selected-page, `pageIndex`, `pageId`, `frameSelector`, `nth`, and `pierceShadow` routing semantics
- download controls are browser-scoped because they map to Chrome's Browser domain; file input uploads remain page-scoped selector actions
- download behavior and recent download summaries are session-local runtime state and are not persisted across runtime restarts

Phase 9 capability details:

- `browser_drag_files` drags one or more local files onto a matched drop target by constructing page-side `File` objects and a `DataTransfer` payload, then dispatching `dragenter`, `dragover`, and `drop`
- `browser_drag_files` reuses the existing selected-page, `pageIndex`, `pageId`, `nth`, `frameSelector`, and `pierceShadow` selector-routing semantics, and returns only a result summary rather than file contents
- `browser_drag_element` drags a matched source element either to another matched target element or to explicit coordinates using browser-level mouse events
- `browser_drag_element` and `browser_pointer_action` both honor selected-page routing plus explicit `pageIndex` or `pageId`; `pageIndex` and `pageId` remain mutually exclusive
- `browser_pointer_action` is a limited fallback primitive for `move`, `down`, `up`, and `pause`; it is not a recording format, scripting DSL, or multi-pointer gesture system
- Phase 9 remains session-local and does not add recording, replay, orchestration, touch gestures, or cross-page drag semantics

Phase 10A capability details:

- `browser_start_recording`, `browser_stop_recording`, `browser_get_recording`, and `browser_clear_recording` add a minimal recording workflow on top of the existing Browser MCP tool surface
- recording state is session-local and is not persisted across runtime restarts
- Phase 10A records structured steps only; replay and orchestration remain out of scope for this phase
- high-level recording prefers `click`, `type`, `press_key`, `scroll`, and `drag_element`; unresolved interactions may be represented as `pointer_action` or warnings
- only one active recording session is allowed per MCP runtime; if the recorded page is closed, the session stops and keeps the captured result plus a warning summary

Phase 10B capability details:

- `browser_start_replay`, `browser_get_replay`, and `browser_cancel_replay` add a minimal replay workflow that consumes Phase 10A-compatible structured steps
- replay state is session-local and is not persisted across runtime restarts
- replay executes steps sequentially and stops on the first failure
- replay reuses existing Browser MCP action semantics rather than introducing a new replay DSL
- only one active replay session is allowed per MCP runtime; orchestration remains out of scope for Phase 10B

Phase 10C capability details:

- `browser_start_orchestration`, `browser_get_orchestration`, and `browser_cancel_orchestration` add a minimal fixed-block orchestration workflow
- orchestration state is session-local and is not persisted across runtime restarts
- fixed orchestration blocks reuse existing wait / replay / action / query semantics rather than introducing a general DSL
- orchestration runs blocks sequentially and stops on the first failure
- block nesting, branching, loops, and workflow-engine behaviors remain out of scope

Phase 11A capability details:

- `assert_query` now supports structured `assertions[]` with multiple field checks in one block
- supported operators are `equals`, `contains`, `gt`, `gte`, `lt`, and `lte`
- assertion failures now include clearer diagnostics such as failed assertion index, field, expected value, and actual value
- Phase 11A continues to reuse `browser_query` as the data source rather than introducing a new diagnostics runtime

Minimal multi-tab workflow examples:

```json
{
  "name": "browser_select_page",
  "arguments": {
    "pageIndex": 1
  }
}
```

```json
{
  "name": "browser_open_page",
  "arguments": {
    "url": "https://example.com/docs"
  }
}
```

```json
{
  "name": "browser_add_intercept_rule",
  "arguments": {
    "resourceType": "XHR",
    "headerMatchers": [
      { "name": "x-env", "valueIncludes": "staging" }
    ],
    "priority": 10,
    "action": "fulfill",
    "statusCode": 200,
    "contentType": "application/json",
    "body": "{\"ok\":true}"
  }
}
```

A common hover-debug workflow is:

1. call `browser_hover` to move the browser pointer onto the card or trigger
2. call `browser_wait_for` if the hover state needs time to appear
3. call `browser_query` on the hover-only control to inspect `exists`, `count`, visibility, opacity, `href`, `onclick`, and bounds
4. call `browser_take_element_screenshot` to confirm the revealed state
5. call `browser_eval` in read-only mode when you need page-side inspection that the structured tools do not expose directly

Scoped selector notes:

- `browser_click`, `browser_hover`, `browser_query`, `browser_wait_for`, `browser_take_element_screenshot`, `browser_set_file_input`, `browser_drag_files`, `browser_drag_element`, and selector-based `browser_pointer_action` moves accept optional `frameSelector` for same-origin iframes whose `contentDocument` is accessible
- the same selector-based tools accept optional `pierceShadow: true` for open shadow-root traversal
- Phase 10A recording keeps reusing the existing selected-page routing model; recorded steps may preserve selector context such as `frameSelector` and `pierceShadow` when the target can be resolved stably
- `browser_drag_element` reuses the same source/target selector scope for element-to-element drags; coordinate targets remain page-viewport coordinates
- `browser_pointer_action` selector-based `move` steps resolve a matched element center before dispatching browser-level mouse events
- closed shadow roots, frame-index routing, cross-page shared rules, request body matching, advanced boolean matcher groups, recording/replay orchestration, and touch/multi-pointer gestures are still out of scope

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
