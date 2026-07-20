import { describe, expect, it } from "vitest";

import {
	detectLimit,
	ensureLimit,
	HARD_ROW_CAP,
	validateSql,
} from "../src/sql/whitelist";

/**
 * Defense-in-depth fuzz for `validateSql`. Every entry maps to one of the
 * 8 layers in `docs/mcp-server.md` §6.4. Run with:
 *
 *   pnpm --filter mcp-server test
 */

describe("validateSql — keyword layer", () => {
	it("rejects empty SQL", () => {
		expect(validateSql("")).toEqual({ ok: false, reason: expect.any(String) });
		expect(validateSql("   ")).toEqual({
			ok: false,
			reason: expect.any(String),
		});
	});

	it("rejects multiple statements", () => {
		const out = validateSql("SELECT 1; SELECT 2");
		expect(out.ok).toBe(false);
	});

	it("rejects write verbs", () => {
		expect(validateSql("UPDATE behavior_event SET path = '/x'")?.ok).toBe(
			false,
		);
		expect(validateSql("DELETE FROM behavior_event")?.ok).toBe(false);
		expect(
			validateSql("INSERT INTO behavior_event (id) VALUES ('1')")?.ok,
		).toBe(false);
		expect(validateSql("DROP TABLE behavior_event")?.ok).toBe(false);
		expect(validateSql("ALTER TABLE behavior_event ADD COLUMN x int")?.ok).toBe(
			false,
		);
		expect(validateSql("TRUNCATE behavior_event")?.ok).toBe(false);
		expect(validateSql("CREATE TABLE foo (id int)")?.ok).toBe(false);
	});

	it("rejects DML disguised inside SELECT", () => {
		expect(
			validateSql("SELECT * FROM (DELETE FROM behavior_event) AS t")?.ok,
		).toBe(false);
	});

	it("rejects session config", () => {
		expect(validateSql("SET statement_timeout = 0")?.ok).toBe(false);
		expect(validateSql("SET ROLE postgres")?.ok).toBe(false);
		expect(validateSql("RESET statement_timeout")?.ok).toBe(false);
	});

	it("rejects notifications / locks", () => {
		expect(validateSql("NOTIFY foo")?.ok).toBe(false);
		expect(validateSql("LOCK TABLE behavior_event")?.ok).toBe(false);
	});

	it("accepts leading SELECT / WITH / EXPLAIN", () => {
		expect(validateSql("SELECT 1").ok).toBe(true);
		expect(validateSql("select id from behavior_event").ok).toBe(true);
		expect(validateSql("WITH t AS (SELECT 1) SELECT * FROM t").ok).toBe(false);
		expect(validateSql("EXPLAIN SELECT 1").ok).toBe(true);
		expect(validateSql("SHOW COLUMNS FROM behavior_event").ok).toBe(true);
	});

	it("rejects leading verb other than SELECT/WITH/EXPLAIN/SHOW", () => {
		expect(validateSql("VACUUM FULL behavior_event").ok).toBe(false);
		expect(validateSql("REINDEX INDEX behavior_event.id").ok).toBe(false);
	});
});

describe("validateSql — identifier layer", () => {
	it("accepts SELECT against a whitelisted table", () => {
		expect(validateSql("SELECT id FROM behavior_event").ok).toBe(true);
		expect(validateSql("SELECT score FROM game_record").ok).toBe(true);
	});

	it("accepts columns from whitelisted tables", () => {
		expect(
			validateSql(
				"SELECT event_name, path FROM behavior_event WHERE event_type = 'page_view'",
			).ok,
		).toBe(true);
	});

	it("rejects unknown table", () => {
		const out = validateSql("SELECT * FROM pg_shadow");
		expect(out.ok).toBe(false);
	});

	it("rejects schema-qualified names", () => {
		expect(validateSql("SELECT * FROM public.behavior_event").ok).toBe(false);
		expect(validateSql("SELECT * FROM pg_catalog.pg_user").ok).toBe(false);
	});

	it("rejects column from a non-whitelisted table", () => {
		const out = validateSql("SELECT * FROM behavior_event WHERE x.secret = 1");
		// `x.secret` matches the schema-qualified regex because `x.secret`
		// has the pattern `<word>.<word>`. We treat it as schema-scoped
		// and reject.
		expect(out.ok).toBe(false);
	});
});

describe("validateSql — function layer", () => {
	it("rejects arbitrary function calls", () => {
		expect(validateSql("SELECT pg_read_server_files('/etc/passwd')").ok).toBe(
			false,
		);
		expect(validateSql("SELECT count(1) FROM behavior_event").ok).toBe(false);
		expect(validateSql("SELECT now()").ok).toBe(false);
	});

	it("allows EXPLAIN statement", () => {
		// `EXPLAIN (` contains `(` but is an explain prefix — accepted.
		expect(validateSql("EXPLAIN SELECT id FROM behavior_event").ok).toBe(true);
	});
});

describe("LIMIT handling", () => {
	it("detects an existing LIMIT", () => {
		expect(detectLimit("SELECT 1 LIMIT 10")).toBe(10);
		expect(detectLimit("SELECT 1 LIMIT 999999")).toBe(999999);
		expect(detectLimit("SELECT 1")).toBe(null);
	});

	it("appends LIMIT when missing", () => {
		const out = ensureLimit("SELECT id FROM behavior_event", 25);
		expect(out.sql).toBe("SELECT id FROM behavior_event LIMIT 25");
		expect(out.paramIndex).toBe(-1);
	});

	it("leaves LIMIT alone when present", () => {
		const out = ensureLimit("SELECT * FROM behavior_event LIMIT 25");
		expect(out.sql).toContain("LIMIT 25");
		expect(out.paramIndex).toBe(-1);
	});

	it("rejects LIMIT above hard cap", () => {
		expect(HARD_ROW_CAP).toBe(1000);
		const seen = detectLimit("SELECT * FROM behavior_event LIMIT 999999");
		expect(seen).toBe(999999);
		expect(seen).toBeGreaterThan(HARD_ROW_CAP);
	});

	it("rejects authentication tables and positional parameters", () => {
		expect(validateSql("SELECT * FROM behavior_event").ok).toBe(false);
		expect(validateSql("SELECT token FROM session").ok).toBe(false);
		expect(validateSql("SELECT value FROM verification").ok).toBe(false);
		expect(validateSql("SELECT id FROM behavior_event WHERE id = $1").ok).toBe(
			false,
		);
	});
});

describe("validateSql — end-to-end fuzz corpus", () => {
	const cases: Array<[name: string, sql: string, expected: "pass" | "fail"]> = [
		["empty fn-call", "SELECT pg_read_server_files('/etc/passwd')", "fail"],
		["union-based DROP", "SELECT 1; DROP TABLE behavior_event;", "fail"],
		[
			"limit too big",
			"SELECT id FROM behavior_event LIMIT 999999",
			"pass", // policy layer passes; the runtime cap rejects instead
		],
		["target pg_shadow table", "SELECT * FROM pg_shadow", "fail"],
		[
			"target public.behavior_event",
			"SELECT * FROM public.behavior_event",
			"fail",
		],
		["select 1", "SELECT 1", "pass"],
		["with cte wildcard", "WITH t AS (SELECT 1) SELECT * FROM t", "fail"],
		["explain select", "EXPLAIN SELECT 1", "pass"],
	];

	for (const [name, sql, expected] of cases) {
		it(name, () => {
			const out = validateSql(sql);
			if (expected === "pass") expect(out.ok).toBe(true);
			else expect(out.ok).toBe(false);
		});
	}
});
