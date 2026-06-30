# SAM makefile builder target for the ServerFunction.
#
# SAM copies this Makefile to a temp build directory before invoking make,
# so $(CURDIR) here points to the temp dir, NOT to apps/server. We rely on
# $X_GAME_ROOT (set by scripts/deploy.sh to the absolute workspace root) to
# locate pnpm + the tsdown-emitted bundle.
#
# The Makefile target must be named build-<FunctionLogicalId> and must put
# its output in $ARTIFACTS_DIR.
ROOT_DIR := $(X_GAME_ROOT)

build-ServerFunction:
	cd $(ROOT_DIR) && pnpm install --frozen-lockfile
	cd $(ROOT_DIR) && pnpm --filter server build
	mkdir -p $(ARTIFACTS_DIR)
	cp $(ROOT_DIR)/apps/server/dist/lambda.mjs $(ARTIFACTS_DIR)/lambda.mjs
	cp $(ROOT_DIR)/apps/server/dist/lambda.mjs.map $(ARTIFACTS_DIR)/lambda.mjs.map 2>/dev/null || true
	echo '{"type":"module","main":"lambda.mjs"}' > $(ARTIFACTS_DIR)/package.json

.PHONY: build-ServerFunction