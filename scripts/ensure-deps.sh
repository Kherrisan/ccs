#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="$ROOT_DIR/ui"

ensure_root_deps() {
  echo "[deps] Syncing root dependencies"
  (cd "$ROOT_DIR" && bun install --frozen-lockfile)
}

ensure_ui_deps() {
  echo "[deps] Syncing UI dependencies"
  (cd "$UI_DIR" && bun install --frozen-lockfile)
}

ensure_root_deps
ensure_ui_deps
