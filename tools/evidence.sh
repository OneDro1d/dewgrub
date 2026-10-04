#!/usr/bin/env bash
# Runs every check and stores the raw output as the evidence of one version.
# Usage: tools/evidence.sh v3        (run it on a clean, committed tree)
set -u
cd "$(dirname "$0")/.."
v="${1:?usage: tools/evidence.sh vN}"
mkdir -p "evidence/$v"
out="evidence/$v/check-output.txt"
{
  echo "version:  $v"
  echo "date:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit:   $(git rev-parse HEAD)"
  echo "tree:     $(git status --porcelain -- . ':!evidence' | wc -l) uncommitted change(s) outside evidence/"
  echo "node:     $(node --version)"
  echo "command:  ./check.sh"
  echo "----------------------------------------------------------------------"
} > "$out"
./check.sh >> "$out" 2>&1
code=$?
echo "----------------------------------------------------------------------" >> "$out"
echo "exit code: $code" >> "$out"
cat > "evidence/$v/COMMAND.txt" <<EOF
From the repository root, at the commit named in check-output.txt:

    ./check.sh

tools/evidence.sh $v ran exactly that and wrote its full output, unedited, to check-output.txt.
EOF
tail -n 12 "$out"
exit $code
