#!/usr/bin/env bash
# Proves the three commands of the README's "Check it yourself": on a fresh clone of the current commit, in a
# fresh Python virtual environment, with an empty Playwright browser cache (so Chromium is really downloaded).
# Usage: tools/quickstart-proof.sh v6 [git ref]     (the ref defaults to HEAD)
# It downloads Playwright and Chromium and takes about 12 minutes.
set -u
cd "$(dirname "$0")/.."
root="$(pwd)"
v="${1:?usage: tools/quickstart-proof.sh vN [git ref, default HEAD]}"
sha="$(git rev-parse "${2:-HEAD}^{commit}")"
tmp="$(mktemp -d)"
mkdir -p "evidence/$v"
out="$root/evidence/$v/quickstart-output.txt"

git clone -q "$root" "$tmp/checkout"
git -C "$tmp/checkout" checkout -q "$sha"
python3 -m venv "$tmp/venv"
# shellcheck disable=SC1091
. "$tmp/venv/bin/activate"
export PLAYWRIGHT_BROWSERS_PATH="$tmp/browsers"
unset DEWGRUB_PYTHON DEWGRUB_CHROMIUM
cd "$tmp/checkout"

# Folder names of this machine never reach an evidence file.
show() {
  sed -e "s#$tmp/checkout#<checkout>#g" -e "s#$tmp/venv#<venv>#g" -e "s#$tmp/browsers#<browser cache>#g" -e "s#$HOME#<home>#g"
}

step() {
  echo
  echo "\$ $*"
  "$@"
  local code=$?
  echo "[exit code $code]"
  [ "$code" = 0 ] || failed=1
}

failed=0
{
  echo "what:      the three commands of the README, run as written"
  echo "date:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit:    $sha"
  echo "where:     a fresh git clone of that commit, a fresh virtual environment (python3 -m venv), an empty browser cache"
  echo "python:    $(python3 --version)"
  echo "node:      $(node --version)"
  echo "shown as:  <checkout>, <venv>, <browser cache>, <home> = folders of the machine this ran on"
  echo "----------------------------------------------------------------------"
  step pip install playwright
  step playwright install chromium
  step ./check.sh
  echo "----------------------------------------------------------------------"
  if [ "$failed" = 0 ]; then echo "ALL THREE COMMANDS ENDED WITH EXIT CODE 0"; else echo "A COMMAND FAILED"; fi
  exit "$failed"
} 2>&1 | show > "$out"
code="${PIPESTATUS[0]}"
cd "$root"
rm -rf "$tmp"
tail -n 4 "$out"
exit "$code"
