# SAM makefile builder target for the ServerFunction.
#
# SAM copies this Makefile to a temp build directory before invoking make,
# so $(CURDIR) here points to the temp dir, NOT to apps/server. We rely on
# $X_GAME_ROOT (set by scripts/deploy.sh to the absolute workspace root) to
# locate pnpm + the tsdown-emitted bundle.
#
# The Makefile target must be named build-<FunctionLogicalId> and must put
# its output in $ARTIFACTS_DIR.
#
# $X_GAME_ROOT must point to the workspace root (the directory that contains
# pnpm-workspace.yaml). scripts/deploy.sh sets it automatically; if you
# invoke `sam build` directly, export it yourself:
#
#   X_GAME_ROOT="$PWD" sam build
#
ROOT_DIR := $(X_GAME_ROOT)

ifeq ($(ROOT_DIR),)
$(error X_GAME_ROOT is not set — sam build needs the workspace root to run pnpm. Run ./scripts/deploy.sh, or invoke `X_GAME_ROOT="$$PWD" sam build` from the workspace root.)
endif

ifneq ($(wildcard $(ROOT_DIR)/pnpm-workspace.yaml),)
# looks like the right directory
else
$(error X_GAME_ROOT='$(ROOT_DIR)' does not look like the workspace root — pnpm-workspace.yaml not found there. Pass the directory that contains pnpm-workspace.yaml.)
endif

build-ServerFunction:
	cd $(ROOT_DIR) && pnpm install --frozen-lockfile
	cd $(ROOT_DIR) && pnpm --filter server build
	mkdir -p $(ARTIFACTS_DIR)
	cp $(ROOT_DIR)/apps/server/dist/lambda.mjs $(ARTIFACTS_DIR)/lambda.mjs
	cp $(ROOT_DIR)/apps/server/dist/lambda.mjs.map $(ARTIFACTS_DIR)/lambda.mjs.map 2>/dev/null || true
	echo '{"type":"module","main":"lambda.mjs"}' > $(ARTIFACTS_DIR)/package.json

.PHONY: build-ServerFunction