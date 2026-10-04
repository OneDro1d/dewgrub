#!/usr/bin/env bash
# Prints the numbers quoted in the README, from the repository itself. Usage: tools/numbers.sh
set -eu
cd "$(dirname "$0")/.."

lines() { cat "$@" | wc -l | tr -d ' '; }

echo "game source lines (src/, with comments and blank lines):  $(lines src/*)"
echo "  of which game logic (src/game.js):                      $(lines src/game.js)"
echo "test lines (test/ and e2e/):                              $(lines test/* e2e/*.py)"
echo "tool lines (tools/ and check.sh):                         $(lines tools/* check.sh)"
echo "built page, bytes (dist/index.html):                      $(wc -c < dist/index.html | tr -d ' ')"
echo "unit tests (node:test):                                   $(grep -c "^test('" test/*.mjs | awk -F: '{s+=$2} END {print s}')"
echo "browser tests (Playwright):                               $(grep -c "    def test_" e2e/test_*.py | awk -F: '{s+=$2} END {print s}')"
echo "requirements (docs/REQUIREMENTS.md, R- rows):             $(grep -c '^| R-' docs/REQUIREMENTS.md)"
echo "not-provable claims (NP- rows):                           $(grep -c '^| NP-' docs/REQUIREMENTS.md)"
echo "deliberate logic faults (tools/mutate.mjs):               $(grep -c "^  \['" tools/mutate.mjs)"
echo "deliberate page faults (tools/mutate-page.mjs):           $(grep -c "^  \['" tools/mutate-page.mjs)"
echo "versions (git tags):                                      $(git tag | tr '\n' ' ')"
echo "commits:                                                  $(git rev-list --count HEAD)"
first=$(git log --reverse --format=%ct | head -n 1)
last=$(git log -1 --format=%ct)
echo "first commit:                                             $(git log --reverse --format=%cI | head -n 1)"
echo "last commit:                                              $(git log -1 --format=%cI)"
echo "minutes from first to last commit:                        $(( (last - first) / 60 ))"
echo "runtime dependencies (package.json files):                $(git ls-files | grep -c 'package.json' || true)"
