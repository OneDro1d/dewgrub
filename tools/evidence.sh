#!/usr/bin/env bash
# Runs every check on a CLEAN CHECKOUT of the current commit and stores the raw output as evidence.
# Usage: tools/evidence.sh v4            (full check, about 8 minutes)
#        tools/evidence.sh v4 --quick    (skips the deliberately broken pages)
# The clean checkout is a fresh "git clone" of this repository into a temporary folder, so files that
# exist only in the working folder cannot make a check pass.
set -u
cd "$(dirname "$0")/.."
v="${1:?usage: tools/evidence.sh vN [--quick]}"
mode="${2:-}"
sha="$(git rev-parse HEAD)"
tmp="$(mktemp -d)"
git clone -q . "$tmp/checkout"
git -C "$tmp/checkout" checkout -q "$sha"
mkdir -p "evidence/$v"
out="evidence/$v/check-output.txt"
{
  echo "version:  $v"
  echo "date:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit:   $sha"
  echo "where:    a fresh git clone of that commit, in a temporary folder"
  echo "node:     $(node --version)"
  echo "command:  ./check.sh $mode"
  echo "----------------------------------------------------------------------"
} > "$out"
( cd "$tmp/checkout" && ./check.sh $mode ) >> "$out" 2>&1
code=$?
echo "----------------------------------------------------------------------" >> "$out"
echo "exit code: $code" >> "$out"
rm -rf "$tmp"
cat > "evidence/$v/COMMAND.txt" <<EOF
From a clean checkout of the commit named in check-output.txt:

    ./check.sh $mode

tools/evidence.sh $v $mode did exactly that (git clone into a temporary folder, then ./check.sh) and wrote the
full output, unedited, to check-output.txt.
EOF
tail -n 6 "$out"
exit $code
