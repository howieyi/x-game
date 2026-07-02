import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		// At least one of these must be set:
		//   - DATABASE_URL: full DSN, used in dev (pnpm dev) and local migration
		//   - DB_SECRET_ARN: ARN of a Secrets Manager secret containing
		//     { username, password, host, port, dbname }. Used in production
		//     (Lambda) so the password can be URL-encoded at runtime before
		//     being spliced into the DSN — CFN's !Sub has no URL encoder,
		//     and RDS auto-generates passwords with special chars that crash
		//     new URL() if left raw.
		DATABASE_URL: z.string().min(1).optional(),
		DB_SECRET_ARN: z.string().min(1).optional(),
		// RDS-managed master secrets (ManageMasterUserPassword) contain ONLY
		// { username, password } — no host/port/dbname. Those come from the
		// template via these vars (Database.Endpoint.Address etc.).
		DB_HOST: z.string().min(1).optional(),
		DB_PORT: z.string().min(1).optional(),
		DB_NAME: z.string().min(1).optional(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
