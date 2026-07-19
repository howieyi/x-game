import { defineConfig } from "tsdown";

// 部署构建产物（全部输出到 ./dist）：
//   - index.mjs：独立 Node 服务，外置 node_modules 依赖
//   - lambda.mjs：HTTP Lambda 入口，依赖一并打包
//   - eventWorker.mjs：SQS 消费 Lambda 入口，依赖一并打包
//
// 即使设置 noExternal，tsdown 仍可能生成同级 *.mjs chunk。SAM Makefile
// 必须复制完整 dist 目录。CI 会检查该约束，因为缺少 chunk 会在 Lambda
// 冷启动时触发 ERR_MODULE_NOT_FOUND。
export default defineConfig([
	{
		entry: { index: "./src/index.ts" },
		format: "esm",
		outDir: "./dist",
		noExternal: [/@x-game\/.*/],
	},
	{
		entry: { lambda: "./src/lambda.ts" },
		format: "esm",
		outDir: "./dist",
		// 打包所有依赖，避免发布 pnpm workspace 软链接，并减少冷启动解压内容。
		noExternal: [/.+/],
	},
	{
		entry: { eventWorker: "./src/event-worker.ts" },
		format: "esm",
		outDir: "./dist",
		// Lambda 产物不包含 node_modules，因此必须内联 npm 包。
		noExternal: [/.+/],
	},
]);
