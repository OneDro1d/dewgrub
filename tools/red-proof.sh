#!/usr/bin/env bash
# Shows that the tests of a version fail on the tree before it: a fresh clone of the OLD ref, the test file of the
# NEW ref put on top, then the tests. The run must fail. Stores the raw output as evidence.
# Usage: tools/red-proof.sh v7 v6 test/service.test.mjs red-error-size.txt
#        (new ref, old ref, test file, name of the output file in evidence/<new ref>/)
#        tools/red-proof.sh HEAD v7 e2e/test_release.py red-release.txt v8
#        (a fifth word names the evidence folder: for a new ref that has no tag yet, so that the output can be
#        part of the commit that gets the tag)
# A test file in test/ is run by Node, one in e2e/ by Python (DEWGRUB_PYTHON, default python3) with Playwright.
set -u
cd "$(dirname "$0")/.."
root="$(pwd)"
new="${1:?usage: tools/red-proof.sh <new ref> <old ref> <test file> <output file> [evidence folder]}"
old="${2:?old ref}"
file="${3:?test file}"
name="${4:?output file}"
folder="${5:-$new}"
py="${DEWGRUB_PYTHON:-python3}"
pyhome="$("$py" -c 'import sys; print(sys.prefix)')"
tmp="$(mktemp -d)"
git clone -q "$root" "$tmp/checkout"
git -C "$tmp/checkout" checkout -q "$old"
git -C "$tmp/checkout" checkout -q "$(git rev-parse "$new^{commit}")" -- "$file"
mkdir -p "evidence/$folder"
out="evidence/$folder/$name"

case "$file" in
  *.py) shown="python3 -m unittest discover -s $(dirname "$file") -p $(basename "$file") -v" ;;
  *)    shown="node --test --test-reporter=spec $file" ;;
esac

# Folder names of this machine never reach an evidence file.
show() {
  sed -e "s#$tmp/checkout#<checkout>#g" -e "s#$pyhome#<python>#g" -e "s#$HOME#<home>#g"
}

{
  echo "version:      $folder"
  echo "tree:         $old ($(git rev-parse "$old^{commit}")), a fresh clone"
  echo "test file:    $file as it is at $(git rev-parse "$new^{commit}")"
  echo "date:         $(date -u +%Y-%m-%dT%H:%M:%SZ), by tools/red-proof.sh"
  echo "node:         $(node --version)"
  echo "command:      $shown"
  echo "expected:     the command should fail: the old tree does not obey the new rule"
  echo "shown as:     <checkout> = the temporary clone, <python> = the Python install, <home> = the home folder"
  echo "----------------------------------------------------------------------"
} > "$out"
case "$file" in
  *.py) ( cd "$tmp/checkout" && "$py" -m unittest discover -s "$(dirname "$file")" -p "$(basename "$file")" -v ) 2>&1 | show >> "$out" ;;
  *)    ( cd "$tmp/checkout" && node --test --test-reporter=spec "$file" ) 2>&1 | show >> "$out" ;;
esac
code="${PIPESTATUS[0]}"
echo "----------------------------------------------------------------------" >> "$out"
echo "exit code: $code" >> "$out"
rm -rf "$tmp"
tail -n 12 "$out"
if [ "$code" = 0 ]; then
  echo "NOT RED: the new tests pass on the old tree, so they prove nothing about the change"
  exit 1
fi
echo "RED as expected (exit $code)"
