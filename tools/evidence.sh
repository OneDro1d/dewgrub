#!/usr/bin/env bash
# Runs every check on a CLEAN CHECKOUT of the current commit and stores the raw output as evidence.
# Usage: tools/evidence.sh v5            (full check, about 8 minutes)
#        tools/evidence.sh v5 --quick    (skips the deliberately broken pages)
# The clean checkout is a fresh "git clone" of this repository into a temporary folder, so files that
# exist only in the working folder cannot make a check pass.
set -u
cd "$(dirname "$0")/.."
v="${1:?usage: tools/evidence.sh vN [--quick]}"
mode="${2:-}"
sha="$(git rev-parse HEAD)"
py="${DEWGRUB_PYTHON:-python3}"
pyhome="$("$py" -c 'import sys; print(sys.prefix)')"
tmp="$(mktemp -d)"
git clone -q . "$tmp/checkout"
git -C "$tmp/checkout" checkout -q "$sha"
mkdir -p "evidence/$v"
out="evidence/$v/check-output.txt"

# Folder names of this machine never reach an evidence file.
show() {
  sed -e "s#$tmp/checkout#<checkout>#g" -e "s#$pyhome#<python>#g" -e "s#$HOME#<home>#g"
}

{
  echo "version:   $v"
  echo "date:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit:    $sha"
  echo "where:     a fresh git clone of that commit, in a temporary folder"
  echo "node:      $(node --version)"
  echo "command:   ./check.sh $mode"
  echo "shown as:  <checkout> = the temporary clone, <python> = the Python install, <home> = the home folder"
  echo "----------------------------------------------------------------------"
} > "$out"
( cd "$tmp/checkout" && ./check.sh $mode ) 2>&1 | show >> "$out"
code="${PIPESTATUS[0]}"
echo "----------------------------------------------------------------------" >> "$out"
echo "exit code: $code" >> "$out"
rm -rf "$tmp"
cat > "evidence/$v/COMMAND.txt" <<EOF
Every file in this folder names, in its first lines, the commit and the command that produced it.
check-output.txt: tools/evidence.sh $v $mode (a fresh git clone into a temporary folder, then ./check.sh $mode).
Output is unedited, except that folder names of the machine are shown as <checkout>, <python> and <home>.
EOF
tail -n 6 "$out"
exit "$code"
