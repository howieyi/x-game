import { handle } from "hono/aws-lambda";
import { db } from "@x-game/db";

import { app } from "./app";
import { migrate } from "./migrator";

// Apply Drizzle migrations on cold start so the schema is always in sync
// with whatever code version is deployed — no manual step, no SSM tunnel,
// no public RDS exposure.
//
// Concurrency: the in-flight promise is shared across every request in
// this container, so the migration only runs once per cold start. Drizzle's
// `migrate()` also takes a pg advisory lock, so even if multiple Lambda
// instances cold-start at the same time the second one observes the
// migration already applied and exits within one round-trip.
//
// Failure: an error clears the promise so the next cold start (in a fresh
// container) can retry — we don't want to cache a permanently-failed
// promise across container lifecycles.
//
// Where the SQL files come from: apps/server/Makefile copies
// packages/db/src/migrations into ARTIFACTS_DIR/migrations. Lambda extracts
// CodeUri to /var/task and runs with process.cwd() === /var/task, so the
// relative path resolves correctly at runtime.

const MIGRATIONS_FOLDER = "./migrations";

let migrationPromise: Promise<void> | null = null;

function ensureMigrated(): Promise<void> {
	if (migrationPromise) return migrationPromise;
	console.log("[migrate] applying pending schema migrations");
	migrationPromise = migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
		.then(() => {
			console.log("[migrate] schema is up to date");
		})
		.catch((err) => {
			migrationPromise = null; // allow retry on the next cold start
			console.error("[migrate] migration failed:", err);
			throw err;
		});
	return migrationPromise;
}

const serve = handle(app);

export const handler = async (
	...args: Parameters<typeof serve>
): Promise<Awaited<ReturnType<typeof serve>>> => {
	await ensureMigrated();
	return serve(...args);
};
