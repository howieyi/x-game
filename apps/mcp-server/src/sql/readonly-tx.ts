import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { McpDb } from "../db";

/**
 * Read-only transaction wrapper.
 *
 * Layer 2 + 3 of the SQL 8-layer defense (see `docs/mcp-server.md` §6.4):
 *   - `BEGIN READ ONLY` rejects any INSERT/UPDATE/DELETE with PG error 25006;
 *   - `SET LOCAL statement_timeout = '5s'` — defence in depth against a
 *     pathological query that snuck past the parser. This is local to the
 *     tx so we never leak it back to the pool after commit;
 *   - `SET LOCAL idle_in_transaction_session_timeout` killed idle-in-tx
 *     sessions to avoid holding a Pool slot hostage.
 *
 * Drizzle's `transaction` callback returns the result of the inner async
 * function, so `T` flows through transparently.
 */

type AnyDb = NodePgDatabase<Record<string, never>>;

export async function withReadOnlyTx<T>(
	db: McpDb,
	statementTimeoutMs: number,
	fn: (tx: McpDb) => Promise<T>,
): Promise<T> {
	// `sql` tagged templates return executable SQL fragments; we run three
	// of them as part of the same transaction by issuing them before `fn`.
	return (db as unknown as AnyDb).transaction(async (tx) => {
		const dbtx = tx as unknown as McpDb;
		await dbtx.execute(
			sql.raw(`SET TRANSACTION READ ONLY`),
		);
		await dbtx.execute(
			sql.raw(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`),
		);
		await dbtx.execute(
			sql.raw(`SET LOCAL idle_in_transaction_session_timeout = '10s'`),
		);
		return fn(dbtx);
	}) as Promise<T>;
}
