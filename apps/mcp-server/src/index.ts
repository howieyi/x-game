import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
	// 无论从 monorepo 根目录还是 apps/mcp-server 启动，都按当前文件位置
	// 定位根 .env，避免依赖命令执行时的工作目录。
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const rootEnv = resolve(currentDir, "../../..", ".env");
	if (existsSync(rootEnv)) loadEnv({ path: rootEnv, override: false });
}

import { serve } from "@hono/node-server";

// app 的依赖树会在模块初始化阶段校验 MCP 环境变量，因此必须等根 .env
// 加载完成后再动态导入。
const { app } = await import("./app");

serve(
	{
		fetch: app.fetch,
		port: 3001,
	},
	(info) => {
		console.log(`MCP server is running on http://localhost:${info.port}/mcp`);
	},
);
