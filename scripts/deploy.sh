#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# x-game 全栈部署：后端（SAM）+ 前端（S3 + CloudFront）。
#
# 执行步骤：
#   1. 检查 sam、aws、pnpm、openssl 等前置工具。
#   2. 加载 .env，并校验 BETTER_AUTH_SECRET 至少为 32 个字符。
#   3. sam build  → 通过 Makefile 构建后端产物。
#   4. sam deploy → 创建或更新 Lambda、RDS、S3、CloudFront 等资源。
#   5. 读取 Stack 输出 → 获取前端 Bucket、CloudFront ID 和公网地址。
#   6. 构建 Vite 前端 → 同步到 S3 → 刷新 CloudFront 缓存。
#
# 使用方法：
#   ./scripts/deploy.sh                 # 使用 .env 中的 DEPLOY_STAGE
#   ./scripts/deploy.sh prod            # 显式指定 prod 环境
#   ./scripts/deploy.sh dev --no-confirm
#
# 操作边界：
#   - 本脚本负责管理 AWS 资源并上传前端产物。
#   - 本脚本不管理 Cloudflare DNS；外部 DNS-only CNAME 应始终指向当前
#     CloudFront 分配的域名。
#   - 本脚本不生成 Drizzle migration；请先生成并提交 SQL。
#   - 更新部署必须复用 BETTER_AUTH_SECRET，轮换它会让所有用户退出登录。
#   - 首次创建 RDS、NAT 和 VPC Origin 通常需要 10～20 分钟。
#   - `set -euo pipefail` 会在首个错误处停止；修复原因后直接重跑即可，
#     CloudFormation ChangeSet 支持重复执行。
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── 解析参数 ────────────────────────────────────────────────────────────
STAGE="${1:-${DEPLOY_STAGE:-dev}}"
shift || true
# 已启用 `set -u`，而 macOS 默认的 bash 3.2 在展开空数组时仍可能触发
# nounset。这里同时采用两层兼容处理：
#   1. 预先初始化数组，确保变量处于“已设置”状态。
#   2. 转发参数时使用条件展开语法，兼容 bash 3.2～5.x；空数组时不执行操作。
EXTRA_ARGS=()
if [ "$#" -gt 0 ]; then
  # `--no-confirm` 是本脚本提供的简写；SAM 实际只接受
  # `--no-confirm-changeset`，因此在转发前完成转换。
  for arg in "$@"; do
    if [ "$arg" = "--no-confirm" ]; then
      EXTRA_ARGS+=("--no-confirm-changeset")
    else
      EXTRA_ARGS+=("$arg")
    fi
  done
fi

case "$STAGE" in
  dev|staging|prod) ;;
  *) echo "✗ invalid stage '$STAGE' (use dev|staging|prod)"; exit 1 ;;
esac

# ── 检查前置工具 ────────────────────────────────────────────────────────
command -v sam >/dev/null || { echo "✗ sam CLI not installed — see https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"; exit 1; }
command -v aws >/dev/null || { echo "✗ aws CLI not installed"; exit 1; }
command -v pnpm >/dev/null || { echo "✗ pnpm not installed"; exit 1; }
command -v openssl >/dev/null || { echo "✗ openssl not installed"; exit 1; }

# ── 加载 .env（如果存在）────────────────────────────────────────────────
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

# ── 检查 Drizzle Schema 与已提交 migration 是否同步 ────────────────────
# 尽力而为的防护：如果 packages/db/src/schema 中存在未提交修改，但
# migrations 目录没有对应变化，部署后运行时代码会与 Lambda 冷启动时应用的
# SQL 不一致。此时直接终止部署，避免破坏数据库状态。
#
# 这只是启发式检查，无法发现已经提交到历史中的不一致。CI 会在每个 PR 中
# 重新执行生成器，并确认没有产生新差异。
echo "▶ verifying Drizzle schema ↔ committed migrations"
SCHEMA_PENDING=$(git status --porcelain -- packages/db/src/schema/ | wc -l | tr -d ' ')
MIG_PENDING=$(git status --porcelain -- packages/db/src/migrations/ | wc -l | tr -d ' ')
SCHEMA_AHEAD=$(git log --oneline -1 -- packages/db/src/schema/ | wc -l | tr -d ' ')

# 情况 1：工作区修改了 Schema，但没有对应的 migration。
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

# 情况 2：最近一次提交修改了 Schema，却没有修改 migration，通常意味着
# 忘记执行 db:generate。
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

# ── 渲染注入密钥后的 samconfig.toml ─────────────────────────────────────
# samconfig.toml 使用 $BETTER_AUTH_SECRET 作为占位符，但 TOML 不会自动展开
# Shell 变量。如果不处理，SAM 会把字面量传给 CloudFormation，并因长度不足
# 被拒绝。这里将真实值写入临时配置文件，脚本退出时自动删除。
RENDERED_CONFIG="$(mktemp -t samconfig.XXXXXX).toml"
trap 'rm -f "$RENDERED_CONFIG"' EXIT
# 使用不会出现在 Base64 密钥中的 sed 分隔符，并在匹配侧转义 `$`。
# 替换值会在调用 sed 时展开，然后才写入临时文件。
sed -e "s|\$BETTER_AUTH_SECRET|$BETTER_AUTH_SECRET|g" \
  "$ROOT_DIR/samconfig.toml" > "$RENDERED_CONFIG"

if [ -n "${AWS_REGION:-}" ]; then export AWS_DEFAULT_REGION="$AWS_REGION"; fi
if [ -n "${AWS_PROFILE:-}" ]; then export AWS_PROFILE; fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
DEPLOY_REGION="${AWS_REGION:-us-east-1}"
ARTIFACT_BUCKET="x-game-sam-artifacts-${AWS_ACCOUNT_ID}-${DEPLOY_REGION}"
# 当本机配置了多个 AWS 账号时，应在确认 ChangeSet 前核对这里解析出的身份。
echo "→ AWS account: $AWS_ACCOUNT_ID, region: $DEPLOY_REGION, stage: $STAGE"

# 如果旧环境已完全释放，则重新创建项目自有的 SAM 产物 Bucket。把初始化逻辑
# 放在这里，可以在空账号中重复部署，而不依赖 SAM 另行维护的默认 Stack。
if ! aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null; then
  echo "▶ creating SAM artifact bucket: $ARTIFACT_BUCKET"
  if [ "$DEPLOY_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$ARTIFACT_BUCKET" --region "$DEPLOY_REGION"
  else
    aws s3api create-bucket \
      --bucket "$ARTIFACT_BUCKET" \
      --region "$DEPLOY_REGION" \
      --create-bucket-configuration "LocationConstraint=$DEPLOY_REGION"
  fi
  aws s3api put-public-access-block \
    --bucket "$ARTIFACT_BUCKET" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  aws s3api put-bucket-encryption \
    --bucket "$ARTIFACT_BUCKET" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  aws s3api put-bucket-versioning \
    --bucket "$ARTIFACT_BUCKET" \
    --versioning-configuration Status=Enabled
fi
# 该初始化 Bucket 会有意保留在应用 Stack 之外，以便删除应用后仍可上传下一版
# SAM 产物并重新安装。

# ── 1. 构建后端 ─────────────────────────────────────────────────────────
echo
echo "▶ sam build  (this runs pnpm install + tsdown via Makefile builder)"
X_GAME_ROOT="$ROOT_DIR" sam build \
  --config-file "$RENDERED_CONFIG" \
  --config-env "$STAGE" \
  --template "$ROOT_DIR/template.yaml"

# ── 2. 部署后端及基础设施 ───────────────────────────────────────────────
echo
echo "▶ sam deploy"
sam deploy \
  --config-file "$RENDERED_CONFIG" \
  --config-env "$STAGE" \
  --template-file "$ROOT_DIR/.aws-sam/build/template.yaml" \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
# 执行到这里说明基础设施已经更新完成。后续前端构建或上传失败不会触发
# CloudFormation 回滚；修复问题后安全重跑即可。

# ── 3. 读取 Stack 输出 ──────────────────────────────────────────────────
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

# API_URL 是内网 ALB 地址，只能通过 CloudFront VPC Origin 访问。
# 该值仅用于排障，不应暴露给浏览器。
echo "  public url: $WEB_URL"
echo "  web bucket: $WEB_BUCKET"
echo "  cf id     : $WEB_DISTRIBUTION_ID"
echo "  api (internal ALB, behind CF): $API_URL"

# ── 4. 构建并发布前端 ───────────────────────────────────────────────────
echo
echo "▶ building web (vite) — VITE_SERVER_URL=$WEB_URL"
# 将 CloudFront 域名注入为 API Origin。前端与 API 共用同一公网主机；
# tRPC 和 Better-Auth 分别访问 `${WEB_URL}/trpc` 与
# `${WEB_URL}/api/auth`，再由 CloudFront 转发到私有 API。
VITE_SERVER_URL="$WEB_URL" pnpm --filter web build

echo
echo "▶ syncing apps/web/dist → s3://$WEB_BUCKET"
aws s3 sync "$ROOT_DIR/apps/web/dist/" "s3://$WEB_BUCKET/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# index.html 不能长期缓存，因为它保存当前带哈希静态资源的引用。
aws s3 cp "$ROOT_DIR/apps/web/dist/index.html" "s3://$WEB_BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo "▶ invalidating CloudFront $WEB_DISTRIBUTION_ID"
aws cloudfront create-invalidation \
  --distribution-id "$WEB_DISTRIBUTION_ID" \
  --paths "/*" \
  --output text --query "Invalidation.Id"
# 返回 ID 只表示刷新请求已被接受；边缘节点仍会异步传播，可能在脚本退出后
# 继续执行数分钟。

# ── 5. 数据库 Schema 在 Lambda 冷启动时自动应用 ────────────────────────
# 参见 apps/server/src/lambda.ts：每个容器只运行一次 `migrate()`，并通过
# 进行中的 Promise 与 PostgreSQL advisory lock 避免并发冷启动竞争。
# 修改 Schema 后必须先执行 `pnpm db:generate` 并提交 SQL；Lambda 只会携带
# 已存在的 migration 文件。

echo
echo "✓ deploy complete"
echo "  public url: $WEB_URL  (single entry — web + API)"
