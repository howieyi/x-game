import { defineConfig } from "tsdown";

// 部署构建产物（全部输出到 ./dist）：
//   - index.mjs：本地 Node 服务端，外置 node_modules 依赖
//   - lambda.mjs：Lambda 入口，依赖全部内联（避免冷启动依赖解析 + 减少体积）
//
// noExternal 全开是为了让 Lambda 部署包自包含，避免镜像构建时 lib
// 解析到 workspace 软链接的路径。SAM Makefile 必须复制整个 dist 目录。
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
		noExternal: [/.+/],
	},
]);
