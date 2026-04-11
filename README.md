<div align="center">

# CCS - Claude Code Switch

![CCS Logo](assets/ccs-logo-medium.png)

### The multi-provider profile and runtime manager for Claude Code and compatible CLIs

Run Claude, Codex, Droid-routed profiles, GLM, local models, and
Anthropic-compatible APIs without config thrash.

[![License](https://img.shields.io/badge/license-MIT-C15F3C?style=for-the-badge)](LICENSE)
[![npm](https://img.shields.io/npm/v/@kaitranntt/ccs?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@kaitranntt/ccs)
[![PoweredBy](https://img.shields.io/badge/PoweredBy-ClaudeKit-C15F3C?style=for-the-badge)](https://claudekit.cc?ref=HMNKXOHN)

**[Website](https://ccs.kaitran.ca)** |
**[Documentation](https://docs.ccs.kaitran.ca)** |
**[Product Tour](https://docs.ccs.kaitran.ca/getting-started/product-tour)** |
**[CLI Reference](https://docs.ccs.kaitran.ca/reference/cli-commands)**

</div>

## Why CCS

CCS gives you one stable command surface while letting you switch between:

- multiple runtimes such as Claude Code, Factory Droid, and Codex CLI
- multiple Claude subscriptions and isolated account contexts
- OAuth providers like Codex, Copilot, Kiro, Claude, Qwen, Kimi, and more
- API and local-model profiles like GLM, Kimi, OpenRouter, Ollama, llama.cpp,
  Novita, and Alibaba Coding Plan

The goal is simple: stop rewriting config files, stop breaking active sessions,
and move between providers in seconds.

## Quick Start

```bash
npm install -g @kaitranntt/ccs
ccs config
```

Then launch whatever runtime fits the task:

```bash
ccs
ccs codex
ccs --target droid glm
ccs glm
ccs ollama
```

Need the full setup path instead of the short version?

| Need | Start here |
| --- | --- |
| Install and verify CCS | [`/getting-started/installation`](https://docs.ccs.kaitran.ca/getting-started/installation) |
| First successful session | [`/getting-started/first-session`](https://docs.ccs.kaitran.ca/getting-started/first-session) |
| Visual walkthrough | [`/getting-started/product-tour`](https://docs.ccs.kaitran.ca/getting-started/product-tour) |
| Provider selection | [`/providers/concepts/overview`](https://docs.ccs.kaitran.ca/providers/concepts/overview) |
| Full command reference | [`/reference/cli-commands`](https://docs.ccs.kaitran.ca/reference/cli-commands) |
| Troubleshooting | [`/reference/troubleshooting`](https://docs.ccs.kaitran.ca/reference/troubleshooting) |

## See CCS In Action

### Usage Analytics

![Analytics Dashboard](assets/screenshots/analytics.webp)

Track usage, costs, and session patterns across profiles. Deep dive:
[Dashboard Analytics](https://docs.ccs.kaitran.ca/features/dashboard/analytics).

### Live Auth And Health Monitoring

![Live Auth Monitor](assets/screenshots/live-auth-monitor.webp)

See auth state, account health, and provider readiness without dropping into raw
config. Deep dive:
[Live Auth Monitor](https://docs.ccs.kaitran.ca/features/dashboard/live-auth-monitor).

### OAuth Provider Control Center

![CLIProxy API](assets/screenshots/cliproxyapi.webp)

Manage OAuth-backed providers, quota visibility, and proxy-wide routing from one place. CCS now
surfaces round-robin vs fill-first natively in both CLI and dashboard flows instead of hiding that
choice inside raw upstream controls.
Deep dive:
[CLIProxy API](https://docs.ccs.kaitran.ca/features/proxy/cliproxy-api).

### Managed Tooling And Fallbacks

![WebSearch Fallback](assets/screenshots/websearch.webp)

CCS can provision first-class local tools like WebSearch and image analysis for
third-party launches instead of leaving you to wire them by hand. Deep dive:
[WebSearch](https://docs.ccs.kaitran.ca/features/ai/websearch).

## Docs Matrix

The README stays short on purpose. The docs site owns the detailed guides and
reference material.

| If you want to... | Read this |
| --- | --- |
| Understand what CCS is and how the pieces fit together | [Introduction](https://docs.ccs.kaitran.ca/introduction) |
| Install CCS cleanly on a new machine | [Installation](https://docs.ccs.kaitran.ca/getting-started/installation) |
| Go from install to a successful first run | [Your First CCS Session](https://docs.ccs.kaitran.ca/getting-started/first-session) |
| See the dashboard and workflow surfaces before setup | [Product Tour](https://docs.ccs.kaitran.ca/getting-started/product-tour) |
| Compare OAuth providers, Claude accounts, and API profiles | [Provider Overview](https://docs.ccs.kaitran.ca/providers/concepts/overview) |
| Learn the dashboard structure and feature pages | [Dashboard Overview](https://docs.ccs.kaitran.ca/features/dashboard/overview) |
| Configure profiles, paths, and environment variables | [Configuration](https://docs.ccs.kaitran.ca/getting-started/configuration) |
| Keep OpenCode aligned with your live CCS setup | [OpenCode Sync Plugin](https://docs.ccs.kaitran.ca/features/workflow/opencode-sync) |
| Browse every command and flag | [CLI Commands](https://docs.ccs.kaitran.ca/reference/cli-commands) |
| Recover from install, auth, or provider failures | [Troubleshooting](https://docs.ccs.kaitran.ca/reference/troubleshooting) |
| Understand storage, config, and architecture details | [Reference](https://docs.ccs.kaitran.ca/reference/architecture) |

## Example Workflow

```bash
# Design with default Claude
ccs "design the auth flow"

# Implement with a different provider
ccs codex "implement the user service"

# Use a cheaper API profile for routine work
ccs glm "clean up tests and docs"

# Run a local model when you need privacy or offline access
ccs ollama "summarize these logs"
```

## Community Projects

| Project | Author | Description |
| --- | --- | --- |
| [opencode-ccs-sync](https://github.com/JasonLandbridge/opencode-ccs-sync) | [@JasonLandbridge](https://github.com/JasonLandbridge) | Auto-sync CCS providers into OpenCode |

## Contribute And Report Safely

- Contributing guide: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Starter work:
  [good first issue](https://github.com/kaitranntt/ccs/labels/good%20first%20issue),
  [help wanted](https://github.com/kaitranntt/ccs/labels/help%20wanted)
- Questions: [open a question issue](https://github.com/kaitranntt/ccs/issues/new/choose)
- Security reports: [SECURITY.md](./SECURITY.md) and the
  [private advisory form](https://github.com/kaitranntt/ccs/security/advisories/new)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=kaitranntt/ccs&type=date&legend=top-left)](https://www.star-history.com/#kaitranntt/ccs&type=date&legend=top-left)
