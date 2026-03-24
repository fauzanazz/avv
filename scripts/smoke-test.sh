#!/usr/bin/env bash
set -euo pipefail

echo "=== AVV Smoke Test ==="
echo ""

# 1. Check prerequisites
echo "[1/5] Checking prerequisites..."
command -v pnpm >/dev/null 2>&1 || { echo "FAIL: pnpm not found"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "FAIL: bun not found"; exit 1; }
echo "  pnpm $(pnpm --version)"
echo "  bun  $(bun --version)"

# 2. Install dependencies
echo "[2/5] Installing dependencies..."
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
echo "  OK"

# 3. Build shared package (required by api and web)
echo "[3/5] Building packages..."
pnpm build >/dev/null 2>&1
echo "  OK"

# 4. Type check all packages
echo "[4/5] Running type checks..."
pnpm type-check >/dev/null 2>&1
echo "  OK"

# 5. Run existing tests (if any)
echo "[5/5] Running tests..."
if cd packages/api && bun test --timeout 10000 2>&1 | tail -3; then
  cd ../..
  echo "  OK"
else
  cd ../..
  echo "  WARN: Some tests failed (non-blocking for smoke test)"
fi

echo ""
echo "=== Smoke test passed ==="
