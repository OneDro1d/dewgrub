#!/usr/bin/env bash
# Regenerates the evidence of the old versions v1..v5 by running each tag's own checks again on a fresh clone.
# Why, twice:
#   at v5 the outputs first stored for v1..v4 carried folder names of the machine they were made on;
#   at v6 every commit id changed (the authors were rewritten to a neutral identity), and the outputs quote ids.
# Raw output is not edited by hand, so each time it was produced again. The only change to the text is made by
# this script and is stated in every file: the machine's folder names are shown as <checkout>, <python>, <home>.
# The outputs first stored are still in git history (git show v4:evidence/v4/check-output.txt, and so on).
#
# Usage: DEWGRUB_PYTHON=/path/to/python tools/regen-evidence.sh        (about 25 minutes)
# The tags v2..v4 look for Chromium where Playwright installs it for the current user.
set -u
cd "$(dirname "$0")/.."
root="$(pwd)"
py="${DEWGRUB_PYTHON:-python3}"
export DEWGRUB_PYTHON="$py"
pyhome="$("$py" -c 'import sys; print(sys.prefix)')"
tmp="$(mktemp -d)"

# Folder names of this machine never reach an evidence file.
show() {
  sed -e "s#$tmp/[a-z0-9]*#<checkout>#g" -e "s#$pyhome#<python>#g" -e "s#$HOME#<home>#g"
}

# run <version> <git ref> <output file> <expected: pass|fail> <command...>
run() {
  local v="$1" ref="$2" file="$3" expect="$4"
  shift 4
  local dir="$tmp/$(echo "$ref" | tr -c 'a-z0-9\n' 'x')"
  if [ ! -d "$dir" ]; then
    git clone -q "$root" "$dir"
    git -C "$dir" checkout -q "$ref"
  fi
  mkdir -p "evidence/$v"
  local out="evidence/$v/$file"
  {
    echo "version:      $v"
    echo "git ref:      $ref ($(git rev-parse "$ref^{commit}"))"
    echo "regenerated:  $(date -u +%Y-%m-%dT%H:%M:%SZ) by tools/regen-evidence.sh, on a fresh clone of that ref"
    echo "node:         $(node --version)"
    echo "command:      $*"
    echo "expected:     the command should $expect"
    echo "shown as:     <checkout> = the temporary clone, <python> = the Python install, <home> = the home folder"
    echo "----------------------------------------------------------------------"
  } | show > "$out"
  ( cd "$dir" && "$@" ) 2>&1 | show >> "$out"
  local code="${PIPESTATUS[0]}"
  echo "----------------------------------------------------------------------" >> "$out"
  echo "exit code: $code" >> "$out"
  local got=fail
  [ "$code" = 0 ] && got=pass
  echo "$v/$file: exit $code (expected to $expect)"
  [ "$got" = "$expect" ] || failed=1
}

command_note() {
  cat > "evidence/$1/COMMAND.txt" <<EOF
Every file in this folder names, in its first lines, the git ref and the command that produced it.
They were produced by tools/regen-evidence.sh (or, where a file says so, by tools/evidence.sh or
tools/quickstart-proof.sh): a fresh clone of the ref, then the command, output unedited except that folder names
of the machine are shown as <checkout>, <python>, <home> and the like.
The outputs first stored for this version are in git history.
EOF
}

failed=0
first="$(git rev-list --max-parents=0 HEAD)"

run v1 "$first" red-output.txt fail node --test test/
run v1 v1 check-output.txt pass ./check.sh
run v2 v2 check-output.txt pass ./check.sh
run v3 v3~1 mutation-before.txt fail node tools/mutate.mjs
run v3 v3 check-output.txt pass ./check.sh
# The review tests of v4, run against the page as it was at v3: they must fail there.
v3dist="$tmp/v3/dist"
run v4 v4 red-output.txt fail env DEWGRUB_DIST="$v3dist" "$py" -m unittest discover -s e2e -k test_R_B13 -k test_R_B14 -k test_R_B9 -v
run v4 v4 check-output.txt pass ./check.sh
run v5 v5 check-output.txt pass ./check.sh
# The fit-for-strangers tests of v5, put on the tree as it was at v4: they must fail there.
# (This changes the v4 clone, so it comes after every other use of it.)
git -C "$tmp/v4" checkout -q v5 -- e2e/test_public.py
run v5 v4 red-output.txt fail "$py" -m unittest discover -s e2e -p test_public.py -v
for v in v1 v2 v3 v4 v5; do command_note "$v"; done

rm -rf "$tmp"
if [ "$failed" = 0 ]; then echo "REGENERATED: every command ended as expected"; else echo "SOMETHING DID NOT END AS EXPECTED"; fi
exit "$failed"
