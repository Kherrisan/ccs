# Cursor IDE Integration

This guide covers the deprecated CCS-owned Cursor IDE bridge, including auth import, local daemon lifecycle, live probe checks, and dashboard controls.

`ccs cursor` now belongs to the CLIProxy-backed Cursor provider path.
Use `ccs legacy cursor` for the deprecated local bridge documented here.

## What It Provides

- OpenAI-compatible local endpoint powered by Cursor credentials.
- Anthropic-compatible local endpoint at `/v1/messages` for Claude-native clients.
- Cursor model list and chat completions via the local CCS daemon.
- Dedicated dashboard page: `ccs config` -> `Deprecated` -> `Cursor IDE (Legacy)`.

## What This Runtime Actually Does

`ccs legacy cursor` does not launch Cursor IDE itself.

The current workflow is:
1. import Cursor credentials from local SQLite or manual input
2. run a local CCS daemon on `127.0.0.1:<port>`
3. launch Claude Code against that daemon
4. have CCS translate requests to Cursor upstream

Treat this as a CCS-managed Cursor bridge, not a generic CLIProxy-backed provider path.

## Prerequisites

- Cursor IDE installed and logged in.
- CCS installed and configured (`ccs config` works).
- For auto-detect auth on macOS/Linux: `sqlite3` available in PATH.

## CLI Workflow

### 1) Enable integration

```bash
ccs legacy cursor enable
```

### 2) Import credentials

Auto-detect from Cursor local SQLite state:

```bash
ccs legacy cursor auth
```

Manual fallback:

```bash
ccs legacy cursor auth --manual --token <token> --machine-id <machine-id>
```

### 3) Start daemon

```bash
ccs legacy cursor start
```

### 4) Run a live probe

```bash
ccs legacy cursor probe
```

Use this to verify that the current build can complete one real authenticated request through the local daemon.

### 5) Run Cursor-backed Claude

```bash
ccs legacy cursor "explain this repo"
```

### 6) Verify status

```bash
ccs legacy cursor status
```

Use `ccs legacy cursor` with bare or normal Claude args to run through the local Cursor proxy.
The admin namespace remains available for setup and inspection:

```bash
ccs legacy cursor help
```

### 7) Stop daemon

```bash
ccs legacy cursor stop
```

## Supported Cursor Provider Path

For the supported CLIProxy-backed Cursor provider, use:

```bash
ccs cursor --auth
ccs cursor --accounts
ccs cursor --config
ccs cursor "task"
```

## Runtime Defaults

- Default port: `20129`
- `ghost_mode`: enabled
- `auto_start`: disabled
- Model list resolution: authenticated live fetch when available, with cached/default fallback.
- Request model validation: if a requested model is not present in the available Cursor model catalog, daemon falls back to the resolved default model.
- Daemon API surface: `POST /v1/chat/completions`, `POST /v1/messages`, and `GET /v1/models`.
- Live verification: `ccs legacy cursor probe` or `POST /api/cursor/probe`

These values are managed in unified config and can be updated from CLI or dashboard.

## Dashboard Usage

Open dashboard:

```bash
ccs config
```

Then navigate to `Cursor IDE (Legacy)` in the `Deprecated` section.

Available controls:

- Integration toggle (`enabled`)
- Auth actions (auto-detect, manual import)
- Daemon actions (start/stop)
- Runtime config (port, auto-start, ghost mode)
- Models list with searchable combobox filtering for large catalogs
- Raw editor for `~/.ccs/cursor.settings.json`

## Raw Settings and Unified Config Sync

Raw settings are stored in:

`~/.ccs/cursor.settings.json`

When raw settings include a local `ANTHROPIC_BASE_URL` port override, CCS synchronizes that port back into unified config so CLI and dashboard remain consistent.

## Troubleshooting

### `Not authenticated` or `expired` in `ccs cursor status`

- Re-run `ccs legacy cursor auth` (or manual auth command).

### `ccs legacy cursor probe` fails even though status is green

- `status` proves local config/auth/daemon readiness only.
- `probe` proves the live runtime path.
- If `probe` fails with upstream protocol errors, inspect the current CCS build first rather than assuming the local daemon is healthy.

### Auto-detect fails

- Ensure Cursor is logged in.
- Confirm `sqlite3` is installed or use manual import.
- Use manual auth import if needed.

### Daemon fails to start

- Check if port `20129` is in use.
- Change port in dashboard config tab, then retry `ccs legacy cursor start`.
