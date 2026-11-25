#!/usr/bin/env bash
# Says whether a change touches anything that needs testing, so CI can skip the
# tests and the deploy for changes that don't. Skipped: documentation (anything
# under docs/ and any Markdown file) and the springboard (apps/springboard), a
# local page that is never deployed. When in doubt, the answer is "true".
# Usage: scripts/changed-code.sh <base commit> <head commit>   → prints true or false
set -euo pipefail

base="${1:-}"
head="${2:-HEAD}"

# No usable base (a brand-new branch, or history we don't have): run everything.
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo true
  exit 0
fi

if git diff --name-only "$base" "$head" | grep -qvE '^docs/|^apps/springboard/|\.md$'; then
  echo true
else
  echo false
fi
