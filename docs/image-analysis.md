# Image Analysis Configuration Guide

CCS provides first-class image and PDF analysis for third-party Claude launches that do not have reliable native vision support.

## How Image Analysis Works

Native Claude accounts keep Anthropic's own vision flow.

Third-party profiles now use a CCS-managed local MCP tool named `ImageAnalysis` when the runtime is available. CCS also appends a short steering hint so Claude prefers that tool over `Read` for local image and PDF files.

Healthy Claude-target launches suppress the legacy CCS `Read` hook so MCP stays authoritative. If the managed runtime cannot be provisioned, CCS keeps the old `Read` hook available only as a compatibility fallback when that path is still viable. If runtime/auth/proxy readiness is degraded beyond that, CCS falls back to native `Read` instead of failing the whole launch.

## Routing Model

ImageAnalysis requests go straight to the CCS-managed provider route:

```text
Claude -> ccs-image-analysis MCP -> CCS provider route -> /api/provider/<backend>/v1/messages
```

Important:
- CCS does not relay image analysis through Claude Code, another CLI, or a second model wrapper.
- For bridge-backed settings profiles, CCS resolves the backend and provider path before launch.
- CCS avoids leaking a profile's ordinary third-party `ANTHROPIC_BASE_URL` or token into image analysis unless that profile is explicitly using a CLIProxy bridge.

## Profile Behavior

| Profile Type | Image Method |
|--------------|--------------|
| Claude `default` / `account` | Native Claude vision / native `Read` |
| Third-party settings / CLIProxy / Copilot | CCS local `ImageAnalysis` MCP tool when ready |
| Third-party when MCP provisioning fails but provider-backed analysis is still viable | Legacy CCS `Read` hook fallback |
| Third-party when runtime/auth/proxy is unavailable | Native `Read` fallback |

## Configuration

Configure via dashboard (`Settings -> Image`) or `~/.ccs/config.yaml`:

```yaml
image_analysis:
  enabled: true
  timeout: 60
  fallback_backend: agy
  provider_models:
    agy: gemini-3-1-flash-preview
    codex: gpt-5.1-codex-mini
    ghcp: claude-haiku-4.5
```

Useful commands:

```bash
ccs config image-analysis
ccs config image-analysis --enable
ccs config image-analysis --disable
ccs config image-analysis --set-fallback agy
ccs config image-analysis --set-profile-backend glm agy
ccs config image-analysis --clear-profile-backend glm
```

## Prompt Templates

CCS installs editable prompt templates at:

```text
~/.ccs/prompts/image-analysis/
```

Templates:
- `default.txt`
- `screenshot.txt`
- `document.txt`

CCS automatically selects `screenshot` for screenshot-like filenames, `document` for PDFs, and `default` otherwise.

## Runtime Environment

Key runtime env vars:

| Variable | Purpose |
|----------|---------|
| `CCS_IMAGE_ANALYSIS_SKIP` | Disable image analysis for the current launch |
| `CCS_IMAGE_ANALYSIS_SKIP_HOOK` | Suppress only the legacy CCS `Read` hook while keeping MCP ImageAnalysis available |
| `CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL` | Explicit CCS runtime base URL |
| `CCS_IMAGE_ANALYSIS_RUNTIME_PATH` | Provider route such as `/api/provider/agy` |
| `CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY` | Explicit CCS runtime auth key |
| `CCS_IMAGE_ANALYSIS_MODEL` | Force a single image-analysis model |
| `CCS_DEBUG` | Verbose runtime logging |

## Self-Heal

CCS now auto-heals stale managed image-analysis state in three places:

- Healthy Claude launches remove stale CCS-managed image `Read` hooks from the active profile settings before launch.
- `Settings -> Image` save/provisioning repairs managed MCP runtime files, syncs managed MCP entries into isolated Claude config dirs, and cleans stale CCS-managed image hooks from `~/.ccs/*.settings.json`.
- `ccs doctor --fix` repairs invalid image-analysis config, removes stale CCS-managed image hooks, and resyncs managed `ccs-image-analysis` MCP entries into isolated configs.

## Troubleshooting

### Claude still uses `Read`

- Confirm `ccs config image-analysis` shows `enabled: true`
- Check the active profile resolves to a configured backend
- Run `ccs doctor --fix` to repair stale managed hooks or missing managed MCP sync
- Run with `CCS_DEBUG=1` to see runtime preparation details

### ImageAnalysis is not exposed

- Verify CLIProxy auth for the resolved backend
- Verify the local or remote CLIProxy target is reachable
- Check `~/.claude.json` and inherited account configs for `ccs-image-analysis`

### I need to prove requests are going directly to the provider route

Run with `CCS_DEBUG=1` and inspect the resolved runtime path. The request target should be provider-scoped, for example:

```text
/api/provider/agy/v1/messages
```
