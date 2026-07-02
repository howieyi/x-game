#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Verify the Drizzle schema and the committed migrations are in sync.
#
# Strategy: snapshot the committed migrations, run `drizzle-kit generate`
# against the project's own drizzle.config.ts, and check whether
# drizzle-kit produced any new files. If it did, the schema has drifted
# forward from the committed SQL — the next deploy would push code that
# doesn't match the database state. Restore the snapshot on exit so this
# script never leaves behind a spurious file.
#
# This is the CI complement to deploy.sh's working-tree guard. deploy.sh
# catches the "you forgot to commit" case at deploy time; this script
# catches the "you committed code but never ran db:generate" case at PR
# time, where it's much cheaper to fix.
#
# Runs without DATABASE_URL — `drizzle-kit generate` does not connect to
# a database, it just diffs schema files against the last migration's
# snapshot.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

command -v pnpm >/dev/null || { echo "✗ pnpm not installed"; exit 1; }
command -v git >/dev/null || { echo "✗ git not installed"; exit 1; }

MIG_DIR="packages/db/src/migrations"

# Snapshot the committed migrations so we can restore them no matter
# what drizzle-kit does. cp -R is portable; a tar pipe would be faster
# but adds a dep on GNU tar semantics.
SNAP="$(mktemp -d -t drizzle-mig.XXXXXX)"
cp -R "$MIG_DIR/." "$SNAP/"

cleanup() {
  # Always restore the working tree — we never want this script to
  # leave behind a spurious migration file.
  rm -rf "$MIG_DIR"
  mkdir -p "$MIG_DIR"
  cp -R "$SNAP/." "$MIG_DIR/"
  rm -rf "$SNAP"
}
trap cleanup EXIT

# Run drizzle-kit's own generator using the project's config. Exit
# code is unreliable across versions when nothing has changed
# (sometimes "No schema changes" exits 0, sometimes 1), so we
# swallow it and infer drift from the git status below.
pnpm --filter @x-game/db exec drizzle-kit generate >/dev/null 2>&1 || true

# Any change in the migrations folder (new or modified) means
# drizzle-kit wanted to emit SQL — i.e. schema drift.
drift="$(git status --porcelain -- "$MIG_DIR")"

if [ -n "$drift" ]; then
  cat >&2 <<EOF
✗ Drizzle schema drift detected — committed migrations are out of date
  with packages/db/src/schema.

  drizzle-kit would generate:
$(echo "$drift" | sed 's/^/    /')

  Run locally and commit the SQL before pushing:

    pnpm --filter @x-game/db db:generate
    git add packages/db/src/migrations
    git commit -m "feat(db): <describe schema change>"

EOF
  exit 1
fi

echo "✓ Drizzle schema and committed migrations are in sync"
