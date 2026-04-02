#!/usr/bin/env bash
#
# Legacy GLMT compatibility smoke probe
# Verifies that user-facing GLMT marketing is gone while internal transformer
# modules still exist for compatibility and Cursor translation.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

PASSED=0
FAILED=0

test_pass() {
  echo "[OK] $1"
  PASSED=$((PASSED + 1))
}

test_fail() {
  echo "[X]  $1"
  FAILED=$((FAILED + 1))
}

test_info() {
  echo "[i]  $1"
}

echo "=== Legacy GLMT Compatibility Smoke Test ==="
echo

echo "Test 1: Internal transformer sources remain available"
for file in \
  "$REPO_DIR/src/glmt/glmt-transformer.ts" \
  "$REPO_DIR/src/glmt/delta-accumulator.ts" \
  "$REPO_DIR/src/glmt/sse-parser.ts" \
  "$REPO_DIR/src/cursor/cursor-anthropic-response.ts"; do
  if [ -f "$file" ]; then
    test_pass "$(basename "$file") exists"
  else
    test_fail "Missing internal compatibility file: $file"
  fi
done

echo
echo "Test 2: Root help no longer advertises ccs glmt"
if command -v ccs >/dev/null 2>&1; then
  if ccs --help | grep -q "ccs glmt"; then
    test_fail "Root help still advertises ccs glmt"
  else
    test_pass "Root help hides ccs glmt"
  fi
else
  test_info "ccs binary not found in PATH; skipping live help probe"
fi

echo
echo "Test 3: Legacy glmt settings file inspection"
if [ -f "$HOME/.ccs/glmt.settings.json" ]; then
  test_pass "Legacy glmt.settings.json detected"
  if grep -q "api/coding/paas/v4/chat/completions" "$HOME/.ccs/glmt.settings.json"; then
    test_info "Legacy proxy endpoint still present in settings; CCS should normalize it at runtime"
  else
    test_info "Settings already point at a direct endpoint or custom override"
  fi
else
  test_info "No legacy glmt.settings.json found; nothing to migrate locally"
fi

echo
echo "=== Summary ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo

if [ "$FAILED" -eq 0 ]; then
  echo "[OK] Legacy compatibility surface looks consistent."
  echo "[i]  Preferred profiles: ccs glm for Z.AI, ccs km for reasoning-first Kimi."
  exit 0
fi

echo "[X] Review the failures above."
exit 1
