#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# 检查 Drizzle Schema 与已提交的 migration 是否同步。
#
# 策略：备份已提交的 migration，使用项目自己的 drizzle.config.ts 执行
# `drizzle-kit generate`，然后检查是否生成了新文件。如果产生变化，说明
# Schema 已领先于已提交 SQL，下一次部署会发布与数据库状态不一致的代码。
# 脚本退出时会还原备份，不在工作区残留临时生成文件。
#
# 这是 deploy.sh 工作区检查的 CI 补充：deploy.sh 捕获“忘记提交”的情况，
# 本脚本在 PR 阶段捕获“提交了代码但忘记执行 db:generate”的情况。
#
# 不需要 DATABASE_URL：`drizzle-kit generate` 不连接数据库，只比较 Schema
# 文件与上一次 migration 快照。
#
# 安全边界：cleanup() 会临时删除并重建 MIG_DIR。执行前先完整复制到 mktemp
# 私有目录，EXIT trap 会在成功、失败或中断时运行。不要改成仓库级 reset，
# 因为工作区中可能存在用户的其他修改。
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

command -v pnpm >/dev/null || { echo "✗ pnpm not installed"; exit 1; }
command -v git >/dev/null || { echo "✗ git not installed"; exit 1; }

MIG_DIR="packages/db/src/migrations"

# 备份已提交 migration，确保无论 drizzle-kit 做了什么都能恢复。cp -R
# 跨平台兼容；使用 tar 虽更快，但会引入 GNU tar 语义依赖。
SNAP="$(mktemp -d -t drizzle-mig.XXXXXX)"
cp -R "$MIG_DIR/." "$SNAP/"

cleanup() {
  # 始终恢复工作区，避免残留临时生成的 migration 文件。
  rm -rf "$MIG_DIR"
  mkdir -p "$MIG_DIR"
  cp -R "$SNAP/." "$MIG_DIR/"
  rm -rf "$SNAP"
}
trap cleanup EXIT

# 使用项目配置运行 drizzle-kit 生成器。不同版本在“无 Schema 变化”时的
# 退出码并不稳定，因此忽略退出码，改用下方 git status 判断漂移。
pnpm --filter @x-game/db exec drizzle-kit generate >/dev/null 2>&1 || true

# migrations 目录中的任何新增或修改，都表示 drizzle-kit 需要输出 SQL，
# 即存在 Schema 漂移。
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
