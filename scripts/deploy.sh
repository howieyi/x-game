#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# x-game full-stack deploy: backend (SAM) + web frontend (S3 + CloudFront).
#
# Steps:
#   1. Validate prerequisites (sam, aws, pnpm, openssl).
#   2. Load .env and require BETTER_AUTH_SECRET >= 32 chars.
#   3. sam build  → compiles server bundle via Makefile builder.
#   4. sam deploy → creates/updates API, Lambda, Aurora, S3, CloudFront.
#   5. Read outputs → web bucket + CloudFront distribution id.
#   6. Build web (vite) → sync to S3 → invalidate CloudFront.
#
# Usage:
#   ./scripts/deploy.sh                 # uses DEPLOY_STAGE from .env
#   ./scripts/deploy.sh prod            # explicit stage, ignores .env
#   ./scripts/deploy.sh dev --no-confirm
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── parse args ──────────────────────────────────────────────────────────
STAGE="${1:-${DEPLOY_STAGE:-dev}}"
shift || true
# `set -u` is on, and on bash 3.2 (macOS default) an empty array still trips
# nounset when expanded as "${EXTRA_ARGS[@]}". Two fixes layered:
#   1. Pre-init the array so it's "set" rather than "unset".
#   2. Use the conditional-expansion form below when forwarding, which is
#      safe across bash 3.2 → 5.x and degrades to a no-op when empty.
EXTRA_ARGS=()
if [ "$#" -gt 0 ]; then
  EXTRA_ARGS=("$@")
fi

case "$STAGE" in
  dev|staging|prod) ;;
  *) echo "✗ invalid stage '$STAGE' (use dev|staging|prod)"; exit 1 ;;
esac

# ── prerequisites ───────────────────────────────────────────────────────
command -v sam >/dev/null || { echo "✗ sam CLI not installed — see https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"; exit 1; }
command -v aws >/dev/null || { echo "✗ aws CLI not installed"; exit 1; }
command -v pnpm >/dev/null || { echo "✗ pnpm not installed"; exit 1; }
command -v openssl >/dev/null || { echo "✗ openssl not installed"; exit 1; }

# ── load .env if present ────────────────────────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "✗ BETTER_AUTH_SECRET is not set."
  echo "  Add it to .env or export it. Generate with: openssl rand -base64 48"
  exit 1
fi
if [ "${#BETTER_AUTH_SECRET}" -lt 32 ]; then
  echo "✗ BETTER_AUTH_SECRET must be >=32 chars (current: ${#BETTER_AUTH_SECRET})"
  exit 1
fi

# ── verify Drizzle schema and committed migrations are in sync ─────────
# Best-effort guard: if any tracked schema file under packages/db/src/schema
# has uncommitted changes but the migrations folder has not also changed,
# the deploy would push code whose runtime schema doesn't match the SQL
# the Lambda will apply on cold start. Fail loud instead of corrupting the
# cluster.
#
# Heuristic only — it cannot detect schema-vs-migration divergence that's
# already been committed (e.g. a forgotten generate from a previous PR).
# For that, run `pnpm --filter @x-game/db db:generate` in CI on every PR
# and assert the diff is empty.
echo "▶ verifying Drizzle schema ↔ committed migrations"
SCHEMA_PENDING=$(git status --porcelain -- packages/db/src/schema/ | wc -l | tr -d ' ')
MIG_PENDING=$(git status --porcelain -- packages/db/src/migrations/ | wc -l | tr -d ' ')
SCHEMA_AHEAD=$(git log --oneline -1 -- packages/db/src/schema/ | wc -l | tr -d ' ')

# Case 1: working tree has schema changes but no corresponding migration.
if [ "$SCHEMA_PENDING" -gt 0 ] && [ "$MIG_PENDING" -eq 0 ]; then
  cat <<EOF >&2
✗ Schema files changed but no migration committed:
  $SCHEMA_PENDING pending schema file(s), 0 pending migration file(s).
  Refusing to deploy — generate and commit the SQL first:

    pnpm --filter @x-game/db db:generate
    git add packages/db/src/migrations
    git commit -m "feat(db): <describe schema change>"

EOF
  exit 1
fi

# Case 2: the most recent commit changed schema but didn't touch
# migrations. Probably the classic "I forgot db:generate" mistake.
if [ "$SCHEMA_PENDING" -eq 0 ] && [ "$MIG_PENDING" -eq 0 ]; then
  HEAD_SCHEMA=$(git diff --name-only HEAD~1 HEAD -- packages/db/src/schema/ 2>/dev/null | wc -l | tr -d ' ')
  HEAD_MIG=$(git diff --name-only HEAD~1 HEAD -- packages/db/src/migrations/ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$HEAD_SCHEMA" -gt 0 ] && [ "$HEAD_MIG" -eq 0 ] && [ "$SCHEMA_AHEAD" -gt 0 ]; then
    cat <<EOF >&2
✗ Last commit touched schema but not migrations:
  schema files changed:    $HEAD_SCHEMA
  migration files changed: 0
  Looks like `pnpm db:generate` was forgotten. Roll back, generate, then
  recommit:

    pnpm --filter @x-game/db db:generate
    git add packages/db/src/migrations
    git commit --amend --no-edit

EOF
    exit 1
  fi
fi
echo "  ✓ schema and migrations are in sync"

# ── render samconfig.toml with secrets injected ─────────────────────────
# samconfig.toml references $BETTER_AUTH_SECRET as a placeholder, but TOML
# has no shell expansion — SAM would otherwise hand the literal 15-char
# string "$BETTER_AUTH_SECRET" to CloudFormation, which then rejects it
# (must be ≥32 chars). Render to a temp file with the real value baked in
# and point sam at that. The temp file is deleted on script exit.
RENDERED_CONFIG="$(mktemp -t samconfig.XXXXXX).toml"
trap 'rm -f "$RENDERED_CONFIG"' EXIT
# Use a sed delimiter that's not in a base64 secret (which only contains
# [A-Za-z0-9+/=]) and escape $ in the pattern. The replacement side
# expands the env var at sed-invocation time, before the file is written.
sed -e "s|\$BETTER_AUTH_SECRET|$BETTER_AUTH_SECRET|g" \
  "$ROOT_DIR/samconfig.toml" > "$RENDERED_CONFIG"

if [ -n "${AWS_REGION:-}" ]; then export AWS_DEFAULT_REGION="$AWS_REGION"; fi
if [ -n "${AWS_PROFILE:-}" ]; then export AWS_PROFILE; fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "→ AWS account: $AWS_ACCOUNT_ID, region: ${AWS_REGION:-us-east-1}, stage: $STAGE"

# ── 1. build backend ────────────────────────────────────────────────────
echo
echo "▶ sam build  (this runs pnpm install + tsdown via Makefile builder)"
X_GAME_ROOT="$ROOT_DIR" sam build \
  --config-file "$RENDERED_CONFIG" \
  --config-env "$STAGE" \
  --template "$ROOT_DIR/template.yaml"

# ── 2. deploy backend ───────────────────────────────────────────────────
echo
echo "▶ sam deploy"
sam deploy \
  --config-file "$RENDERED_CONFIG" \
  --config-env "$STAGE" \
  --template-file "$ROOT_DIR/.aws-sam/build/template.yaml" \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}

# ── 3. pull outputs ─────────────────────────────────────────────────────
echo
echo "▶ reading stack outputs"
STACK_NAME="x-game-${STAGE}"
WEB_BUCKET="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" \
  --output text)"
WEB_DISTRIBUTION_ID="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebDistributionId'].OutputValue" \
  --output text)"
WEB_URL="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue" \
  --output text)"
API_URL="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text)"

# API_URL is the internal ALB DNS — only reachable via CloudFront VPC Origin.
# Surface it for debugging only; the browser should never see this URL.
echo "  public url: $WEB_URL"
echo "  web bucket: $WEB_BUCKET"
echo "  cf id     : $WEB_DISTRIBUTION_ID"
echo "  api (internal ALB, behind CF): $API_URL"

# ── 4. build + push web ─────────────────────────────────────────────────
echo
echo "▶ building web (vite) — VITE_SERVER_URL=$WEB_URL"
# Inject the CloudFront domain as the API origin. Everything (web + API)
# now lives behind this single host; tRPC and Better-Auth both call into
# `${WEB_URL}/trpc` and `${WEB_URL}/api/auth` respectively, both of which
# CloudFront routes to the private API via the VPC Origin.
VITE_SERVER_URL="$WEB_URL" pnpm --filter web build

echo
echo "▶ syncing apps/web/dist → s3://$WEB_BUCKET"
aws s3 sync "$ROOT_DIR/apps/web/dist/" "s3://$WEB_BUCKET/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# index.html must NOT be long-cached — that's where the hashed asset refs live.
aws s3 cp "$ROOT_DIR/apps/web/dist/index.html" "s3://$WEB_BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo "▶ invalidating CloudFront $WEB_DISTRIBUTION_ID"
aws cloudfront create-invalidation \
  --distribution-id "$WEB_DISTRIBUTION_ID" \
  --paths "/*" \
  --output text --query "Invalidation.Id"

# ── 5. database schema is applied inside the Lambda on cold start ──────
# See apps/server/src/lambda.ts — `migrate()` runs once per container,
# gated by an in-flight promise + pg advisory lock, so concurrent cold
# starts across instances don't race. Nothing to do from here.
# Remember to `pnpm db:generate` and commit the SQL before deploying if
# you changed schema; the Lambda only ships files that already exist.

echo
echo "✓ deploy complete"
echo "  public url: $WEB_URL  (single entry — web + API)"