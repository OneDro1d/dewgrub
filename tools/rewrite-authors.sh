#!/usr/bin/env bash
# One-time step, done once at the end of v6 and kept here as the record of what was done.
# Rewrites the author and the committer of every commit on every branch and tag to one neutral identity
# (a role, not a person), keeping every date and every message. All commit ids change; the tags move with them.
# Then it sets that identity for future commits in this repository only, and drops the old commits for good.
#
# Why: the history was made on a machine whose git identity was a person's name and work address. A public
# history must not carry those. Take a backup first if you want the old ids back: git bundle create <file> --all
set -eu
cd "$(dirname "$0")/.."

NAME='OneDroid Showcase Builder'
MAIL='showcase-builder@users.noreply.onedroid.ai'

if [ -n "$(git status --porcelain)" ]; then
  echo "the working folder has uncommitted changes: commit them first" >&2
  exit 1
fi

git config user.name "$NAME"
git config user.email "$MAIL"

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --env-filter "export GIT_AUTHOR_NAME='$NAME' GIT_AUTHOR_EMAIL='$MAIL' GIT_COMMITTER_NAME='$NAME' GIT_COMMITTER_EMAIL='$MAIL'" \
  --tag-name-filter cat -- --branches --tags

# filter-branch keeps the old commits under refs/original, and the reflog keeps them too. Remove both,
# so that no copy of this repository carries the old identity in objects nobody can see.
git for-each-ref --format='%(refname)' refs/original | while read -r ref; do git update-ref -d "$ref"; done
git reflog expire --expire=now --all
git gc --quiet --prune=now

echo "identities now in the history (author | committer):"
git log --branches --tags --format='%an <%ae> | %cn <%ce>' | sort -u
echo "commits: $(git rev-list --count --branches --tags)"
