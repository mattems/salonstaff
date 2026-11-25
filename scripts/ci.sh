#!/usr/bin/env bash
# Every check the "Lint, typecheck, test" and "Secret scan" jobs of .github/workflows/ci.yml run,
# run here instead (CI on pull requests is off, to save Actions minutes). Needs the Docker
# Postgres (`bun dev` or `docker compose up -d postgres`). Keep this and ci.yml in step.
# Usage: bun run ci
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "Secret scan"
# Mounted at their own paths: a worktree's .git file points at the main checkout's .git by its
# absolute path, and without it gitleaks scans no commits and still passes.
git_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd)
docker run --rm -v "$PWD:$PWD" -v "$git_dir:$git_dir" ghcr.io/gitleaks/gitleaks:v8.30.1 \
  git "$PWD" --redact --no-banner -c "$PWD/.gitleaks.toml"

step "Lint";      bun run lint
step "Typecheck"; bun run typecheck
step "Test";      bun run test -- --concurrency 2
step "Web apps build"
bun run --cwd apps/web build
bun run --cwd apps/admin build

step "API types match the API"
bun run api:types
if [ -n "$(git status --porcelain apps/web/src/lib/api apps/admin/src/lib/api)" ]; then
  echo "The API changed without regenerating the web apps' types. 'bun run api:types' has done it: commit the result." >&2
  git status --short apps/web/src/lib/api apps/admin/src/lib/api
  exit 1
fi

step "Migrations match the schema"
(cd packages/db && bun --env-file=../../.env drizzle-kit generate)
if [ -n "$(git status --porcelain packages/db/migrations)" ]; then
  echo "The schema changed without a migration. 'drizzle-kit generate' has made one: name it with 'bun db:generate -- --name <name>' or commit it." >&2
  git status --short packages/db/migrations
  exit 1
fi

step "All checks passed"
