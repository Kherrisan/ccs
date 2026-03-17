# Contributing to CCS

CCS is a Bun + TypeScript CLI with a React dashboard. This guide is the shortest path to making a clean change without reverse-engineering the repo first.

## Before You Start

- Open or claim an issue if the change is more than a typo.
- Branch from `dev`.
- Open PRs against `dev`.
- Use conventional commits.
- If you change user-facing behavior, update the docs that describe it.

If you are new to the project, start with a docs fix, a focused bug fix, or an issue labeled `good first issue`.

## Repo Map

| Area | Main paths | Typical follow-up |
| --- | --- | --- |
| CLI runtime | `src/`, `lib/`, `config/`, `scripts/` | Add or update tests in `tests/` |
| Dashboard UI | `ui/src/` | Run `cd ui && bun run validate` |
| Web server and config APIs | `src/web-server/`, `src/api/`, `src/config/` | Add unit or integration coverage |
| Documentation | `README.md`, `docs/`, `CONTRIBUTING.md` | Keep user-facing docs in sync |
| Static assets | `assets/` | Verify screenshots and references still match |

Useful directories:

- `tests/unit/` for focused logic tests
- `tests/integration/` for cross-module behavior
- `tests/npm/` for packaging checks
- `tests/native/` for shell and platform coverage
- `docs/` for architecture, roadmap, and internal implementation notes

## Environment Setup

### Prerequisites

- Node.js `>=18`
- Bun `>=1.0`
- GitHub CLI (`gh`) if you want to open PRs from the terminal

### Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/ccs.git
cd ccs
git remote add upstream https://github.com/kaitranntt/ccs.git

git checkout dev
git pull upstream dev

bun install
cd ui && bun install && cd ..
```

## Branching and PRs

Create all normal contribution branches from `dev`.

```bash
git checkout dev
git pull upstream dev
git checkout -b feat/short-description
```

Use these prefixes:

- `feat/*` for features
- `fix/*` for bug fixes
- `docs/*` for documentation-only changes

Rules:

- Never commit directly to `main` or `dev`.
- Open PRs to `dev`, not `main`.
- Treat `hotfix/*` as maintainer-only emergency flow from `main`.
- Delete your branch after merge.

Example:

```bash
git push -u origin docs/contributing-refresh
gh pr create --base dev --title "docs(contributing): refresh contributor guide"
```

## Local Development

### Safe test environment

CCS reads and writes under `~/.ccs/`. Do not test against your real setup when developing.

Unix:

```bash
export CCS_HOME="$(mktemp -d)"
```

PowerShell:

```powershell
$env:CCS_HOME = Join-Path $env:TEMP ("ccs-" + [guid]::NewGuid())
```

If you touch code that reads CCS paths, route it through `getCcsDir()` in `src/utils/config-manager.ts` so tests stay isolated.

### Common workflows

```bash
bun run build            # Compile CLI
bun run dev              # Build server and start local config dashboard
bun run dev:symlink      # Point global ccs to local build
bun run dev:unlink       # Restore original global ccs
cd ui && bun run dev     # Dashboard-only dev server
```

Use `bun run dev` from the repo root when working on the local dashboard experience behind `ccs config`.

## Validation

Run these before you open or update a PR:

```bash
bun run format
bun run lint:fix
bun run validate
bun run validate:ci-parity
```

If you changed the dashboard:

```bash
cd ui
bun run format
bun run validate
```

Helpful targeted commands:

```bash
bun run test:unit
bun run test:all
bun run test:native
bun run test:e2e
```

`bun run validate` is the main gate. It covers typechecking, linting, format checks, maintainability checks, and automated tests for the main project.

## What To Update With Your Change

### If you change CLI behavior

- Update the relevant `--help` output in `src/commands/`.
- Add or update automated coverage in `tests/`.
- Update `README.md` if the user workflow changed.

### If you change dashboard behavior

- Keep CLI and dashboard parity where the feature supports both.
- Update `ui/src/` and any affected tests.
- Run UI validation from `ui/`.

### If you change config, providers, or architecture

- Update the relevant docs in `docs/`.
- Mention migration or compatibility notes in the PR.

## Commit Style

All commits must use conventional commit format.

```bash
git commit -m "fix(doctor): handle missing config gracefully"
git commit -m "feat(cliproxy): add provider quota check"
git commit -m "docs(contributing): simplify contributor workflow"
```

Avoid:

```bash
git commit -m "fix stuff"
git commit -m "WIP"
git commit -m "update file"
```

## Release Notes

Releases are automated with semantic-release.

- Merges to `dev` publish the `@dev` channel.
- Merges to `main` publish the `@latest` channel.
- Do not manually bump versions, create tags, or run manual `npm publish`.

## Need Help?

- Bugs and features: https://github.com/kaitranntt/ccs/issues
- Questions and discussion: https://github.com/kaitranntt/ccs/discussions
- User-facing docs: [README.md](./README.md)
- Internal architecture notes: [docs/](./docs)
- Community expectations: [`.github/CODE_OF_CONDUCT.md`](./.github/CODE_OF_CONDUCT.md)
