#!/usr/bin/env bash
# Reproducible acceptance run (works with bun or plain npm/node):
#   1. Reseed the demo database (wipes all data; dev seed).
#   2. Run the full acceptance suite against the dev server on :3000
#      (override with ACCEPTANCE_BASE_URL).
#   3. Reseed again so the running app is left in a clean demo state
#      (the suite intentionally creates throwaway services like T3_TEST /
#      APPLIC_TEST; without this step they would show up in the catalogue).
#
# Usage:  bash scripts/run-acceptance.sh          # dev server on :3000
#         ACCEPTANCE_BASE_URL=http://localhost:3001 bash scripts/run-acceptance.sh
set -euo pipefail
cd "$(dirname "$0")/.."

run_ts() {
  if command -v bun >/dev/null 2>&1; then bun "$1"; else npx --yes tsx "$1"; fi
}

echo "==> Reseeding demo database (wipes all data; dev seed)..."
run_ts scripts/seed.ts

echo ""
echo "==> Running acceptance suite..."
if run_ts scripts/acceptance-tests.ts; then
  echo ""
  echo "==> Suite green — restoring clean demo data..."
  run_ts scripts/seed.ts
  echo "==> Done. Database reset to the seeded demo state."
else
  echo "" >&2
  echo "==> Suite FAILED — database left as-is for debugging." >&2
  exit 1
fi
