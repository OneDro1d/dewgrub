#!/usr/bin/env bash
# The one command that re-runs every check. Exit code 0 means all green.
#   ./check.sh           everything, about 9 minutes
#   ./check.sh --quick   skips step 5 (the deliberately broken pages), about 5 minutes
# Needs: Node 20+, git, and a Python with Playwright (pip install playwright; playwright install chromium).
#   DEWGRUB_PYTHON    the Python to use      (default: python3)
#   DEWGRUB_CHROMIUM  the browser executable (default: the Chromium that "playwright install chromium" put in place)
set -eu
cd "$(dirname "$0")"

PY="${DEWGRUB_PYTHON:-python3}"
export DEWGRUB_PYTHON="$PY"

echo "== 1/6 unit tests (Node, no browser): game logic, presentation, the local service, the players =="
node --test test/

echo "== 2/6 deliberate faults in the logic, the service and the players: the unit tests must notice each time =="
node tools/mutate.mjs

echo "== 3/6 the committed dist/index.html is what the source builds to =="
node tools/build.mjs --check

echo "== 4/6 browser tests (headless Chromium against dist/index.html) =="
"$PY" -m unittest discover -s e2e -v

if [ "${1:-}" = "--quick" ]; then
  echo "== 5/6 SKIPPED (--quick): deliberate page faults =="
else
  echo "== 5/6 deliberate page faults: break the page, the named browser test must fail each time =="
  node tools/mutate-page.mjs
fi

echo "== 6/6 every requirement is named by a test =="
node tools/trace.mjs

if [ "${1:-}" = "--quick" ]; then
  echo "QUICK CHECKS PASSED (step 5 was skipped)"
else
  echo "ALL CHECKS PASSED"
fi
