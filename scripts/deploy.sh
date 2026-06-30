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
EXTRA_ARGS=("$@")

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

if [ -n "${AWS_REGION:-}" ]; then export AWS_DEFAULT_REGION="$AWS_REGION"; fi
if [ -n "${AWS_PROFILE:-}" ]; then export AWS_PROFILE; fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "→ AWS account: $AWS_ACCOUNT_ID, region: ${AWS_REGION:-us-east-1}, stage: $STAGE"

# ── 1. build backend ────────────────────────────────────────────────────
echo
echo "▶ sam build  (this runs pnpm install + tsdown via Makefile builder)"
X_GAME_ROOT="$ROOT_DIR" sam build \
  --config-env "$STAGE" \
  --template "$ROOT_DIR/template.yaml"

# ── 2. deploy backend ───────────────────────────────────────────────────
echo
echo "▶ sam deploy"
sam deploy \
  --config-env "$STAGE" \
  --template-file "$ROOT_DIR/.aws-sam/build/template.yaml" \
  "${EXTRA_ARGS[@]}"

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

echo "  api       : $API_URL"
echo "  web url   : $WEB_URL"
echo "  web bucket: $WEB_BUCKET"
echo "  cf id     : $WEB_DISTRIBUTION_ID"

# ── 4. build + push web ─────────────────────────────────────────────────
echo
echo "▶ building web (vite)"
pnpm --filter web build

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

# ── 5. apply Drizzle schema ─────────────────────────────────────────────
echo
echo "▶ applying database schema (drizzle push)"
DATABASE_URL="$(aws rds generate-db-auth-token \
  --hostname "$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' --output text)" \
  --port 5432 \
  --username postgres 2>/dev/null || true)"

# Easier: ask the user to run db:push themselves once they have DB access.
# We can't reach the cluster from the deploy box (no VPC access). Surface
# what they need instead of trying to set up a tunnel here.
cat <<EOF

⚠ The database lives in private subnets and is not reachable from this
  machine. To apply the Drizzle schema, run the schema from inside the VPC
  (e.g. EC2 bastion, Cloud9, or AWS SSM port-forward):

    aws ssm start-session --target <bastion-or-lambda-id> \\
        --document-name AWS-StartPortForwardingSessionToRemoteHost \\
        --parameters '{"host":["$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' --output text)"],"portNumber":["5432"],"localPortNumber":["5432"]}'

    # in another shell:
    DATABASE_URL="postgresql://postgres:<password-from-secretsmanager>@localhost:5432/xgame?sslmode=disable" \\
      pnpm db:push

  The master password is in Secrets Manager at:
    $(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' --output text)

EOF

echo
echo "✓ deploy complete"
echo "  web  : $WEB_URL"
echo "  api  : $API_URL"