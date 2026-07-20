// Inlined Drizzle migrator for the Lambda bundle.
//
// Why this exists: tsdown's `noExternal: /.+/.+/` resolves most npm
// packages, but `drizzle-orm/node-postgres/migrator` is left as a bare
// ESM specifier in the bundled lambda.mjs. At Lambda runtime there's
// no `node_modules/drizzle-orm/` (we ship a single-file bundle), so
// `import { migrate } from "drizzle-orm/node-postgres/migrator"` throws
// ERR_MODULE_NOT_FOUND on cold start and every request 504s.
//
// The "official" migrator is a 4-line wrapper around two primitives:
//   1. readMigrationFiles(folder) — reads meta/_journal.json + *.sql
//   2. db.dialect.migrate(...)    — already available on the drizzle
//                                   NodePgDatabase instance
// Both are reproduced below. readMigrationFiles is inlined because the
// top-level `drizzle-orm/migrator` import has the same bundling problem.
// All Node built-ins used here (`node:crypto`, `node:fs`, `node:path`)
// are available in the Lambda runtime without bundling.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type MigrationMeta = {
	sql: string[];
	bps: boolean;
	folderMillis: number;
	hash: string;
};

type JournalEntry = {
	tag: string;
	breakpoints: boolean;
	when: number;
};

type Journal = {
	entries: JournalEntry[];
};

/**
 * Read Drizzle migration files from a folder following the standard
 * `meta/_journal.json` + `<tag>.sql` layout produced by `drizzle-kit generate`.
 *
 * Inlined from `drizzle-orm/migrator.js` so the Lambda bundle doesn't
 * need to resolve that subpath at runtime.
 */
function readMigrationFiles(migrationsFolder: string): MigrationMeta[] {
	const journalPath = join(migrationsFolder, "meta/_journal.json");
	if (!existsSync(journalPath)) {
		throw new Error(`Can't find meta/_journal.json file at ${journalPath}`);
	}
	const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
	return journal.entries.map((entry) => {
		const sqlPath = join(migrationsFolder, `${entry.tag}.sql`);
		const sql = readFileSync(sqlPath, "utf8");
		return {
			sql: sql.split("--> statement-breakpoint"),
			bps: entry.breakpoints,
			folderMillis: entry.when,
			hash: createHash("sha256").update(sql).digest("hex"),
		};
	});
}

/**
 * Apply pending migrations using drizzle's pg dialect. The dialect
 * method handles the `__drizzle_migrations` table bookkeeping and
 * per-statement transactions, so we just feed it the parsed journal.
 *
 * Inlined from `drizzle-orm/node-postgres/migrator.js`.
 */
export async function migrate(
	db: unknown,
	config: { migrationsFolder: string },
): Promise<void> {
	const migrations = readMigrationFiles(config.migrationsFolder);
	// The public `NodePgDatabase` type doesn't expose `dialect` /
	// `session` — they're internal. We cast to `unknown` then to the
	// shape the bundled `PgDialect.migrate` expects.
	const internalDb = db as unknown as {
		dialect: {
			migrate: (
				migrations: MigrationMeta[],
				session: unknown,
				config: { migrationsFolder: string },
			) => Promise<void>;
		};
		session: unknown;
	};
	await internalDb.dialect.migrate(migrations, internalDb.session, config);
}
