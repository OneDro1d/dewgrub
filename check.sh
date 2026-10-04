#!/usr/bin/env bash
# The one command that re-runs every check. Exit code 0 means all green. Takes about 2 minutes.
# Needs: Node 20+, git, and a Python with Playwright and a Chromium it can start.
#   DEWGRUB_PYTHON    the Python to use      (default: the build machine's Playwright venv, else python3)
#   DEWGRUB_CHROMIUM  the browser executable (default: the newest headless shell Playwright has installed)
set -eu
cd "$(dirname "$0")"

PY="${DEWGRUB_PYTHON:-/home/coder/.local/share/smm-venv/bin/python}"
[ -x "$PY" ] || PY=python3

echo "== 1/5 unit tests (Node, no browser) =="
node --test test/

echo "== 2/5 deliberate faults: break the logic 28 ways, the unit tests must notice each one =="
node tools/mutate.mjs

echo "== 3/5 the committed dist/index.html is what the source builds to =="
node tools/build.mjs --check

echo "== 4/5 browser tests (headless Chromium against dist/index.html) =="
"$PY" -m unittest discover -s e2e -v

echo "== 5/5 every requirement is named by a test =="
node tools/trace.mjs

echo "ALL CHECKS PASSED"
