#!/usr/bin/env bash
# The one command that re-runs every check. Exit code 0 means all green.
set -eu
cd "$(dirname "$0")"

echo "== 1/2 unit tests (Node, no browser) =="
node --test test/

echo "== 2/2 every logic requirement is named by a test =="
node tools/trace.mjs --only=R-L

echo "ALL CHECKS PASSED"
