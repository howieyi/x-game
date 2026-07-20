import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 本地数据库命令从 monorepo 根目录执行，但 drizzle-kit 会把 cwd 切到
// packages/db。使用 import.meta.dirname 计算绝对路径，避免依赖启动目录。
// 根 .env 是本项目的主要本地配置；apps/server/.env 仅补充缺失项，不覆盖
// Shell 或根 .env 已显式提供的 DATABASE_URL。
const configDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(configDir, "../..");
dotenv.config({ path: resolve(workspaceRoot, ".env"), override: false });
dotenv.config({
	path: resolve(workspaceRoot, "apps/server/.env"),
	override: false,
});

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
});
