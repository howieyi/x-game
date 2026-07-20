# ServerFunction 使用的 SAM Makefile 构建目标。
#
# SAM 调用 make 前会把本文件复制到临时构建目录，所以此处 $(CURDIR) 指向
# 临时目录，而不是 apps/server。通过 $X_GAME_ROOT（由 deploy.sh 设置为
# 工作区绝对路径）定位 pnpm 与 tsdown 构建产物。
#
# 目标必须命名为 build-<FunctionLogicalId>，并将结果写入 $ARTIFACTS_DIR。
#
# $X_GAME_ROOT 必须指向包含 pnpm-workspace.yaml 的工作区根目录。
# deploy.sh 会自动设置；直接调用 sam build 时需要手动传入：
#
#   X_GAME_ROOT="$PWD" sam build
#
ROOT_DIR := $(X_GAME_ROOT)

ifeq ($(ROOT_DIR),)
$(error X_GAME_ROOT is not set — sam build needs the workspace root to run pnpm. Run ./scripts/deploy.sh, or invoke `X_GAME_ROOT="$$PWD" sam build` from the workspace root.)
endif

ifneq ($(wildcard $(ROOT_DIR)/pnpm-workspace.yaml),)
# 目录结构符合工作区根目录特征
else
$(error X_GAME_ROOT='$(ROOT_DIR)' does not look like the workspace root — pnpm-workspace.yaml not found there. Pass the directory that contains pnpm-workspace.yaml.)
endif

build-ServerFunction:
	# SAM 可能在一次构建中调用两个目标。冻结 lockfile 保证重复安装结果一致，
	# pnpm 的共享 Store 则降低第二次安装成本。
	cd $(ROOT_DIR) && pnpm install --frozen-lockfile
	cd $(ROOT_DIR) && pnpm --filter server build
	mkdir -p $(ARTIFACTS_DIR)
	# 复制完整 tsdown dist，而不是只复制 lambda.mjs。tsdown 会拆分出多个
	# chunk；如果这些文件不在 /var/task，函数初始化会出现
	# ERR_MODULE_NOT_FOUND，所有请求都会返回 504。
	cp -R $(ROOT_DIR)/apps/server/dist/. $(ARTIFACTS_DIR)/
	# 将 Drizzle SQL migration 与 Bundle 一起发布，使 Lambda 能在冷启动时
	# 执行 migrate()。SAM 会把 CodeUri 解压到 /var/task。
	cp -r $(ROOT_DIR)/packages/db/src/migrations $(ARTIFACTS_DIR)/migrations
	echo '{"type":"module","main":"lambda.mjs"}' > $(ARTIFACTS_DIR)/package.json

# 两个函数复用同一份 dist，确保入口、chunk 和 migration 使用相同打包规则。
build-GameEventWorkerFunction: build-ServerFunction

.PHONY: build-ServerFunction build-GameEventWorkerFunction
