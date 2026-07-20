import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Local dev only: `tsx watch` defaults to cwd when loading `.env`, which is
// `apps/server/` and only contains a subset of keys. Layer the monorepo
// root `.env` on top so shared secrets (e.g. `FEISHU_ANALYTICS_WEBHOOK_URL`)
// are visible without duplication. Lambda receives vars from the function
// configuration and skips this path entirely.
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
	const rootEnv = resolve(process.cwd(), "../.env");
	if (existsSync(rootEnv)) loadEnv({ path: rootEnv, override: false });
}

import { serve } from "@hono/node-server";

import { app } from "./app";

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