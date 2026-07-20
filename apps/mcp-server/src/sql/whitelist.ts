/**
 * SQL whitelist for the `sql_query` MCP tool.
 *
 * Defense-in-depth has 8 layers (see `docs/mcp-server.md` §6.4). This file
 * implements the keyword/identifier pre-check (layers 4-6). The runtime
 * concerns (READ ONLY transaction, statement_timeout, LIMIT injection) live
 * in `readonly-tx.ts`, and the HTTP bearer auth lives in `apps/mcp-server
 * /src/auth.ts`.
 *
 * What this module decides, before any SQL touches Postgres:
 *
 *   1. The SQL is exactly ONE statement (no `;` other than trailing).
 *   2. The first keyword is SELECT / WITH / EXPLAIN SELECT / SHOW COLUMNS FROM.
 *   3. None of the banned keywords appear (write / DDL / session config).
 *   4. Every identifier that looks like a table reference resolves to an
 *      entry in `WHITELIST_TABLES`. Schema-qualified names (`public.*`) are
 *      rejected so callers can't reach `pg_catalog` / `pg_shadow` / etc.
 *   5. No function calls anywhere (`pg_read_server_files`, `current_user`, …)
 *      — only bare column references and identifiers are allowed.
 *   6. Column references resolve to the matching table's column set when
 *      we can determine the table from the same statement; anything outside
 *      is rejected.
 *
 * This parser deliberately rejects things a real DBMS would accept (CTE
 * nesting, subqueries, JSON path expressions, etc.). It targets the
 * "small SELECT against behaviour_event / game_record" queries a human or
 * LLM might want to run for ad-hoc inspection — never a real reporting
 * workload. If you need richer SQL, write a dedicated MCP tool backed by
 * a service in `packages/api` instead.
 */

// Tables the MCP can read from. Each entry lists the readable columns.
// Anything else is rejected — even if it exists in the database.
export const WHITELIST_TABLES: Record<string, ReadonlySet<string>> = {
	behavior_event: new Set([
		"id",
		"event_type",
		"event_name",
		"session_id",
		"anonymous_id",
		"user_id",
		"path",
		"target",
		"properties",
		"occurred_at",
		"user_agent",
		"alerted_at",
		"created_at",
	]),
	game_record: new Set([
		"id",
		"user_id",
		"game_id",
		"score",
		"metrics",
		"theme",
		"moves",
		"seconds",
		"stars",
		"is_new_best",
		"client_nonce",
		"created_at",
	]),
	user: new Set(["id", "name", "email", "email_verified", "image", "created_at", "updated_at"]),
	session: new Set(["id", "user_id", "token", "expires_at", "ip_address", "user_agent", "created_at", "updated_at"]),
	account: new Set(["id", "user_id", "provider_id", "account_id", "created_at", "updated_at"]),
	verification: new Set(["id", "identifier", "value", "expires_at", "created_at", "updated_at"]),
};

// Reserved keywords allowed as the leading statement keyword. Used to
// confirm that we are not running a write/DDL command.
const ALLOWED_LEAD = new Set([
	"select",
	"with",
	"explain",
	"show",
]);

// Banned keywords (whole-word match, case-insensitive). These cover the
// surface that can mutate state, configure the session, or call arbitrary
// server-side helpers that bypass the SELECT-only safety net.
//
// We don't try to enumerate every banned token — for example we don't ban
// "user" because that's a legitimate table. Instead we ban the verbs /
// session-config commands and rely on the identifier check to keep callers
// out of anything else.
const BANNED_PATTERNS: RegExp[] = [
	/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|vacuum|copy|\\copy|set\b|reset|call|do|notify|listen|unlisten|lock|comment|refresh|reindex|cluster|analyze)\b/i,
];

// Identifier regex: letters, digits, underscore, starting with letter/_.
// Used to pull candidate column / table tokens from the raw SQL.
const IDENT = /[a-zA-Z_][a-zA-Z0-9_]*/g;

// Tokens we ignore when scanning identifiers — these are SQL syntax, not
// column or table references.
const RESERVED = new Set([
	"a",
	"select",
	"from",
	"where",
	"and",
	"or",
	"not",
	"is",
	"null",
	"true",
	"false",
	"case",
	"when",
	"then",
	"else",
	"end",
	"as",
	"on",
	"join",
	"left",
	"right",
	"inner",
	"outer",
	"cross",
	"using",
	"natural",
	"group",
	"by",
	"order",
	"having",
	"limit",
	"offset",
	"fetch",
	"first",
	"next",
	"row",
	"rows",
	"with",
	"recursive",
	"union",
	"intersect",
	"except",
	"all",
	"distinct",
	"in",
	"any",
	"some",
	"exists",
	"between",
	"like",
	"ilike",
	"similar",
	"to",
	"asc",
	"desc",
	"nulls",
	"count",
	"sum",
	"avg",
	"min",
	"max",
	"date_trunc",
	"now",
	"now()",
	"explain",
	"show",
	"columns",
]);

export interface ValidationOk {
	ok: true;
}

export interface ValidationFail {
	ok: false;
	reason: string;
}

/**
 * Tokenise and gate the SQL. Intentionally strict — anything not
 * recognisable as a plain SELECT against our whitelist tables is rejected.
 */
export function validateSql(sql: string): ValidationOk | ValidationFail {
	const trimmed = sql.trim().replace(/;\s*$/, "");

	if (!trimmed) return { ok: false, reason: "empty SQL" };

	// Strip out single-quoted string literals before any keyword / function
	// / identifier scan — `'page_view'` and `'foo bar'` would otherwise
	// pollute the identifier set.
	const stripped = trimmed.replace(/'[^']*'/g, "''");

	// (1) Multi-statement guard: at most one `;` allowed (the trailing one
	// we already stripped). Any remaining `;` means at least two statements.
	if (stripped.includes(";")) {
		return { ok: false, reason: "multiple statements not allowed" };
	}

	// (2) Leading keyword: SELECT / WITH / EXPLAIN [SELECT] / SHOW COLUMNS FROM.
	const firstWord = stripped.split(/[\s(]+/)[0]?.toLowerCase();
	if (!firstWord || !ALLOWED_LEAD.has(firstWord)) {
		return {
			ok: false,
			reason: `unsupported leading verb: ${firstWord ?? ""}; use SELECT / WITH / EXPLAIN SELECT / SHOW COLUMNS FROM`,
		};
	}

	// (3) Banned keyword scan.
	for (const pat of BANNED_PATTERNS) {
		if (pat.test(stripped)) {
			return { ok: false, reason: "forbidden keyword in SQL" };
		}
	}

	// (4) Schema-qualified identifiers (`db.*`, `public.*`) blocked up
	// front, before any other token extraction.
	if (/\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_]/i.test(stripped)) {
		const starPrefix = /(\b[a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*\*/g;
		if (starPrefix.test(stripped)) {
			return { ok: false, reason: "schema/table.* not allowed" };
		}
	}

	// (5) Function call guard. We specifically allow `AS (...)` (subquery
	// aliasing) and `EXPLAIN (option list)` because those are SQL syntax,
	// not function invocations. Anything else is rejected.
	if (/[a-zA-Z_]+\s*\(/i.test(stripped)) {
		if (firstWord !== "explain") {
			const fnCallMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
			let m: RegExpExecArray | null;
			while ((m = fnCallMatch.exec(stripped))) {
				const tok = m[1];
				if (!tok) continue;
				const lower = tok.toLowerCase();
				if (lower === "explain") continue;
				if (lower === "as") continue; // AS (subquery) syntax
				return {
					ok: false,
					reason: `function call '...${tok}(...)' not allowed`,
				};
			}
		}
	}

	// (6) Identifier whitelist. Strip string literals already done; pull
	// every alpha token, ignore syntax, then check each remaining token is
	// either a whitelisted table or a column of a known table.
	const tokens = new Set<string>();
	for (const m of stripped.matchAll(IDENT)) {
		const tok = m[0];
		if (!tok) continue;
		if (RESERVED.has(tok.toLowerCase())) continue;
		if (/^\d+$/.test(tok)) continue;
		tokens.add(tok);
	}

	// Tolerate `SELECT <literal>` (no identifiers) — useful for diagnostic
	// queries like `SELECT 1` that hit no tables at all.
	if (tokens.size === 0) {
		return { ok: true };
	}

	// Every identifier must be either a whitelisted table OR a column
	// belonging to one of the tables named in the same statement.
	const seenTables = new Set<string>();
	for (const tok of tokens) {
		if (WHITELIST_TABLES[tok]) {
			seenTables.add(tok);
		}
	}

	// `WITH <cte_name> AS (...)` introduces a CTE binding. Capture the
	// name so subsequent references inside the same statement resolve
	// against the CTE. The CTE itself has no column whitelist (we cannot
	// parse its projection list), so its alias appears in `cteNames` and
	// is allowed to act as a free-standing token in column checks.
	const cteNames = new Set<string>();
	if (firstWord === "with") {
		const m = stripped.match(/^with\s+([a-zA-Z_]\w*)/i);
		if (m && m[1]) {
			cteNames.add(m[1]);
			seenTables.add(m[1]);
		}
		const rm = stripped.match(/^with\s+recursive\s+([a-zA-Z_]\w*)/i);
		if (rm && rm[1] && rm[1] !== m?.[1]) {
			cteNames.add(rm[1]);
			seenTables.add(rm[1]);
		}
	}

	const colSets: ReadonlySet<string>[] = [];
	for (const t of seenTables) {
		const cols = WHITELIST_TABLES[t];
		if (cols) colSets.push(cols);
	}

	for (const tok of tokens) {
		if (WHITELIST_TABLES[tok]) continue;
		if (cteNames.has(tok)) continue; // a CTE binding itself
		const isKnownColumn = colSets.some((cols) => cols.has(tok));
		if (!isKnownColumn) {
			return {
				ok: false,
				reason: `identifier not whitelisted: ${tok}`,
			};
		}
	}

	return { ok: true };
}

/**
 * Detect & normalise a trailing LIMIT clause. If the SQL already has one,
 * parse the number; otherwise return null so callers know to inject one.
 */
export function detectLimit(sql: string): number | null {
	const m = sql.match(/\bLIMIT\s+(\d+)\b/i);
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) ? n : null;
}

/**
 * Append `LIMIT $N` to a SQL statement if one isn't already present.
 * Returns the SQL with the placeholder appended and the index of the
 * placeholder so the caller can add a parameter at the correct slot.
 */
export function ensureLimit(sql: string): { sql: string; paramIndex: number } {
	const trimmed = sql.trim().replace(/;\s*$/, "");
	const paramIndex = (trimmed.match(/\$\d+/g)?.length ?? 0) + 1;
	if (/\bLIMIT\b/i.test(trimmed)) {
		return { sql: trimmed, paramIndex: -1 };
	}
	return { sql: `${trimmed} LIMIT $${paramIndex}`, paramIndex };
}

export const HARD_ROW_CAP = 1000;
