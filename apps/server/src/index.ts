import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { config as loadEnv } from "dotenv";

// Local dev only: `tsx watch` defaults to cwd when loading `.env`, which is
// `apps/server/` and only contains a subset of keys. Layer the monorepo
// root `.env` on top so shared secrets (e.g. `FEISHU_ANALYTICS_WEBHOOK_URL`)
// are visible without duplication. Lambda receives vars from the function
// configuration and skips this path entirely.
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const rootEnv = resolve(currentDir, "../../..", ".env");
	if (existsSync(rootEnv)) loadEnv({ path: rootEnv, override: false });
}

// ESM 静态 import 会早于上面的 loadEnv 执行，因此必须在本地环境加载完成后
// 再导入 app；app 的依赖树会在模块初始化阶段立即校验 @x-game/env/server。
const { app } = await import("./app");

// Local dev / standalone Node server entry. The production Lambda handler
// lives in ./lambda.ts and reuses the same Hono app instance.
serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
