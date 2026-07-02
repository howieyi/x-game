import { env } from "@x-game/env/server";
import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

/**
 * Resolve the DATABASE_URL to hand to Drizzle.
 *
 * Two paths:
 *   1. `DATABASE_URL` already set (dev / pnpm dev / pnpm db:migrate) — use as-is.
 *   2. `DB_SECRET_ARN` set (production Lambda) — fetch the secret JSON from
 *      Secrets Manager, URL-encode the password, and assemble the DSN.
 *
 * Why we can't do (2) in the template: CFN's `!Sub` has no URL-encoding
 * function, and RDS auto-generates passwords with shell-special chars
 * (`(`, `)`, `#`, `*`, `|`, etc.) that `new URL()` rejects when raw. So we
 * build the DSN in code where we can call `encodeURIComponent`.
 */
async function resolveDatabaseUrl(): Promise<string> {
	if (env.DATABASE_URL) return env.DATABASE_URL;

	if (!env.DB_SECRET_ARN) {
		throw new Error(
			"Neither DATABASE_URL nor DB_SECRET_ARN is set — cannot connect to the database.",
		);
	}

	const sm = new SecretsManagerClient({});
	const out = await sm.send(
		new GetSecretValueCommand({ SecretId: env.DB_SECRET_ARN }),
	);
	if (!out.SecretString) {
		throw new Error(
			`Secrets Manager returned no SecretString for ${env.DB_SECRET_ARN}`,
		);
	}
	const parsed = JSON.parse(out.SecretString) as {
		username?: string;
		password?: string;
		host?: string;
		port?: number | string;
		dbname?: string;
	};
	const { username, password, host, port, dbname } = parsed;
	if (!username || !password || !host || !dbname) {
		throw new Error(
			`Secret ${env.DB_SECRET_ARN} missing required fields (username/password/host/dbname)`,
		);
	}
	const u = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port ?? 5432}/${dbname}?sslmode=require&uselibpqcompat=true`;
	return u;
}

// `db` is created at module load. In Lambda that's once per cold start;
// in `pnpm dev` (tsx watch) it's once per reload. We resolve the URL
// eagerly so any secret-rotation / IAM error surfaces during boot instead
// of on the first request.
const databaseUrl = await resolveDatabaseUrl();

export function createDb() {
	return drizzle(databaseUrl, { schema });
}

export const db = createDb();