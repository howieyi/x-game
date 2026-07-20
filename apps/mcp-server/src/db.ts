import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { mcpEnv } from "./env";

/**
 * Drizzle DB 连接(Node-Postgres 驱动)。
 *
 * 复用 `packages/db` 的 `resolveDatabaseUrl` 模式:dev 用 `DATABASE_URL`,
 * prod 从 Secrets Manager 拉 RDS 托管密钥拼 DSN,URL 编码密码绕过 CFN
 * `!Sub` 的限制。
 *
 * 不传 schema 给 drizzle——MCP tools 层都用 `sql\`\`` 模板拼接 SQL
 * 走原始查询,不需要 Drizzle ORM 反射。如果后续 M2 抽 services 复用了
 * server 的 ORM 表 ref,再让 `getDb(schema)` 接受可选 schema 参数即可。
 *
 * 单例:同一进程内一个 Pool,跨多次工具调用复用,避免每个请求都 new。
 */

type AnySchema = Record<string, never>;

let _db: NodePgDatabase<AnySchema> | null = null;
let _smClient: SecretsManagerClient | null = null;

async function resolveDatabaseUrl(): Promise<string> {
	if (mcpEnv.DATABASE_URL) return mcpEnv.DATABASE_URL;
	if (!mcpEnv.DB_SECRET_ARN) {
		throw new Error(
			"Neither DATABASE_URL nor DB_SECRET_ARN is set — cannot connect to the database.",
		);
	}
	const sm = _smClient ?? new SecretsManagerClient({});
	_smClient = sm;
	const out = await sm.send(
		new GetSecretValueCommand({ SecretId: mcpEnv.DB_SECRET_ARN }),
	);
	if (!out.SecretString) {
		throw new Error(
			`Secrets Manager returned no SecretString for ${mcpEnv.DB_SECRET_ARN}`,
		);
	}
	const parsed = JSON.parse(out.SecretString) as {
		username?: string;
		password?: string;
		host?: string;
		port?: number | string;
		dbname?: string;
	};
	const { username, password } = parsed;
	const host = parsed.host ?? mcpEnv.DB_HOST;
	const port = parsed.port ?? mcpEnv.DB_PORT ?? 5432;
	const dbname = parsed.dbname ?? mcpEnv.DB_NAME;
	if (!username || !password) {
		throw new Error(
			`Secret ${mcpEnv.DB_SECRET_ARN} missing username/password fields`,
		);
	}
	if (!host || !dbname) {
		throw new Error(
			`No database host/name available: secret ${mcpEnv.DB_SECRET_ARN} has no host/dbname and DB_HOST/DB_NAME env vars are not set`,
		);
	}
	const u = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${dbname}?sslmode=require&uselibpqcompat=true`;
	return u;
}

export type McpDb = NodePgDatabase<AnySchema>;

export async function getDb(): Promise<McpDb> {
	if (!_db) {
		const url = await resolveDatabaseUrl();
		_db = drizzle(url) as McpDb;
	}
	return _db;
}
