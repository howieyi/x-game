import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db";
import { mcpEnv } from "../env";
import type { ToolHandler, ToolRegistry } from "../server";
import { withReadOnlyTx } from "../sql/readonly-tx";
import {
	detectLimit,
	ensureLimit,
	HARD_ROW_CAP,
	validateSql,
} from "../sql/whitelist";

/**
 * `sql_query` — generic read-only SQL executor.
 *
 * 8-layer defense (see `docs/mcp-server.md` §6.4). All but the first
 * (HTTP bearer auth) live below:
 *
 *   2. READ ONLY transaction (`withReadOnlyTx`)
 *   3. SET LOCAL statement_timeout = 5s
 *   4. keyword pre-check (`validateSql`)
 *   5. identifier whitelist (table / column)
 *   6. function-call blacklist
 *   7. LIMIT injection (auto append, hard cap 1000)
 *   8. error / log sanitisation
 *
 * Gated behind `MCP_ENABLE_SQL_QUERY=true` for prod. dev defaults to off;
 * opt-in via env.ts default.
 */

const STATEMENT_TIMEOUT_MS = 5_000;

const sqlQuerySchema = z.object({
	sql: z
		.string()
		.min(1)
		.max(5000)
		.describe(
			"Read-only SQL statement. Must be a single SELECT / WITH / EXPLAIN SELECT / SHOW COLUMNS FROM <table>; no function calls, no DDL, no DML.",
		),
	rowLimit: z
		.number()
		.int()
		.min(1)
		.max(HARD_ROW_CAP)
		.default(100)
		.describe("Row cap. Auto-appended to the SQL if no LIMIT is present."),
});

function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(reason: string): CallToolResult {
	return { isError: true, content: [{ type: "text", text: reason }] };
}

export interface SqlQueryResult {
	rows: Record<string, unknown>[];
	rowCount: number;
	truncated: boolean;
	elapsedMs: number;
}

export async function sqlQuery({
	sql: rawSql,
	rowLimit,
}: {
	sql: string;
	rowLimit: number;
}): Promise<SqlQueryResult> {
	const startedAt = Date.now();

	// --- Layer 4-6: keyword/identifier pre-check ---
	const validation = validateSql(rawSql);
	if (!validation.ok) {
		throw new Error(`SQL rejected by policy: ${validation.reason}`);
	}

	// --- Layer 7: LIMIT injection ---
	const seenLimit = detectLimit(rawSql);
	if (seenLimit !== null && seenLimit > HARD_ROW_CAP) {
		throw new Error(
			`SQL rejected: LIMIT ${seenLimit} > hard cap ${HARD_ROW_CAP}`,
		);
	}
	const { sql: withLimit } = ensureLimit(rawSql, rowLimit);

	// --- Layer 2 + 3: READ ONLY + statement_timeout ---
	const db = await getDb();
	return withReadOnlyTx(db, STATEMENT_TIMEOUT_MS, async (tx) => {
		const result = await tx.execute(sql.raw(withLimit));
		const elapsed = Date.now() - startedAt;

		// Drizzle returns `Record<string, unknown>[]` from `.execute` for
		// `pg`-driver; reshape into the public shape.
		const rows = Array.isArray(result)
			? (result as Record<string, unknown>[])
			: (((result as unknown as { rows?: unknown[] }).rows ?? []) as Record<
					string,
					unknown
				>[]);

		const truncated = rows.length === rowLimit;
		return {
			rows,
			rowCount: rows.length,
			truncated,
			elapsedMs: elapsed,
		};
	});
}

export function registerSqlTools(registry: ToolRegistry): void {
	if (!mcpEnv.MCP_ENABLE_SQL_QUERY) {
		// Production default: tool is NOT registered at all. Without an
		// entry in `tools/`, the LLM cannot discover or call `sql_query`,
		// even if it tries by name — `tools/call` replies with "unknown
		// tool" from the SDK.
		return;
	}

	const tool: Tool = {
		name: "sql_query",
		description:
			"Run a strictly-scoped read-only SQL statement against non-sensitive columns of behavior_event and game_record. Authentication tables, identifiers, raw properties, multi-statement SQL, DDL, DML, function calls, schema-qualified paths, and positional parameters are rejected. LIMIT is auto-appended. Prefer the dedicated tools above.",
		inputSchema: {
			type: "object",
			properties: {
				sql: { type: "string", minLength: 1, maxLength: 5000 },
				rowLimit: {
					type: "number",
					minimum: 1,
					maximum: HARD_ROW_CAP,
					default: 100,
				},
			},
			required: ["sql"],
			additionalProperties: false,
		},
	};

	const handler: ToolHandler = {
		schema: tool,
		handle: async (args) => {
			const input = sqlQuerySchema.parse(args ?? {});
			try {
				const data = await sqlQuery(input);
				return jsonResult(data);
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "internal SQL tool error";
				console.error("[mcp] sql_query rejected:", msg);
				return errorResult(`SQL rejected: ${msg}`);
			}
		},
	};

	registry.tools.push(tool);
	registry.handlerMap.set(tool.name, handler);
}
