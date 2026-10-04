#!/usr/bin/env bash
# Shows that the tests of a version fail on the tree before it: a fresh clone of the OLD ref, the test file of the
# NEW ref put on top, then the tests. The run must fail. Stores the raw output as evidence.
# Usage: tools/red-proof.sh v7 v6 test/service.test.mjs red-error-size.txt
#        (new ref, old ref, test file, name of the output file in evidence/<new ref>/)
set -u
cd "$(dirname "$0")/.."
root="$(pwd)"
new="${1:?usage: tools/red-proof.sh <new ref> <old ref> <test file> <output file>}"
old="${2:?old ref}"
file="${3:?test file}"
name="${4:?output file}"
tmp="$(mktemp -d)"
git clone -q "$root" "$tmp/checkout"
git -C "$tmp/checkout" checkout -q "$old"
git -C "$tmp/checkout" checkout -q "$new" -- "$file"
mkdir -p "evidence/$new"
out="evidence/$new/$name"

# Folder names of this machine never reach an evidence file.
show() {
  sed -e "s#$tmp/checkout#<checkout>#g" -e "s#$HOME#<home>#g"
}

{
  echo "version:      $new"
  echo "tree:         $old ($(git rev-parse "$old^{commit}")), a fresh clone"
  echo "test file:    $file as it is at $new ($(git rev-parse "$new^{commit}"))"
  echo "date:         $(date -u +%Y-%m-%dT%H:%M:%SZ), by tools/red-proof.sh"
  echo "node:         $(node --version)"
  echo "command:      node --test --test-reporter=spec $file"
  echo "expected:     the command should fail: the old tree does not obey the new rule"
  echo "shown as:     <checkout> = the temporary clone, <home> = the home folder"
  echo "----------------------------------------------------------------------"
} > "$out"
( cd "$tmp/checkout" && node --test --test-reporter=spec "$file" ) 2>&1 | show >> "$out"
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
