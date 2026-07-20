import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
	const rootEnv = resolve(process.cwd(), "../.env");
	if (existsSync(rootEnv)) loadEnv({ path: rootEnv, override: false });
}

import { serve } from "@hono/node-server";

import { app } from "./app";

serve(
	{
		fetch: app.fetch,
		port: 3001,
	},
	(info) => {
		console.log(`MCP server is running on http://localhost:${info.port}/mcp`);
	},
);
