# McpFunction 使用的 SAM Makefile 构建目标。
#
# 与 apps/server/Makefile 同样的模式：SAM 调用 make 前会复制本文件到
# 临时构建目录；通过 $X_GAME_ROOT（deploy.sh 设置为工作区绝对路径）
# 定位 pnpm 与 tsdown 构建产物。
#
# 目标必须命名为 build-<FunctionLogicalId>，并将结果写入 $ARTIFACTS_DIR。
#
# $X_GAME_ROOT 必须指向包含 pnpm-workspace.yaml 的工作区根目录。
#   deploy.sh 会自动设置；直接调用 sam build 时需要手动传入：
#     X_GAME_ROOT="$PWD" sam build
#
# 注意：MCP server 是只读服务，cold-start 不需要 migrate()。因此不复制
# packages/db/src/migrations，Lambda 体积更小。
ROOT_DIR := $(X_GAME_ROOT)

ifeq ($(ROOT_DIR),)
$(error X_GAME_ROOT is not set — sam build needs the workspace root to run pnpm. Run ./scripts/deploy.sh, or invoke `X_GAME_ROOT="$$PWD" sam build` from the workspace root.)
endif

ifneq ($(wildcard $(ROOT_DIR)/pnpm-workspace.yaml),)
else
$(error X_GAME_ROOT='$(ROOT_DIR)' does not look like the workspace root — pnpm-workspace.yaml not found there. Pass the directory that contains pnpm-workspace.yaml.)
endif

build-McpFunction:
	# SAM 可能在一次构建中调用两个目标。冻结 lockfile 保证重复安装结果一致，
	# pnpm 的共享 Store 则降低第二次安装成本。
	cd $(ROOT_DIR) && pnpm install --frozen-lockfile
	cd $(ROOT_DIR) && pnpm --filter mcp-server build
	mkdir -p $(ARTIFACTS_DIR)
	# 复制完整 tsdown dist，保留 Lambda chunk。如果文件不在 /var/task，
	# 函数初始化会抛 ERR_MODULE_NOT_FOUND，所有请求都会返回 504。
	cp -R $(ROOT_DIR)/apps/mcp-server/dist/. $(ARTIFACTS_DIR)/
	echo '{"type":"module","main":"lambda.mjs"}' > $(ARTIFACTS_DIR)/package.json

.PHONY: build-McpFunction
