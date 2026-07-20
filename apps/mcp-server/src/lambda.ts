import { handle } from "hono/aws-lambda";

import { app } from "./app";

/**
 * AWS Lambda handler for the MCP server.
 *
 * Unlike `apps/server/src/lambda.ts` we do **not** run Drizzle migrations on
 * cold start — MCP is strictly read-only against a stable schema, so skipping
 * `migrate()` shaves cold-start latency and shrinks the deploy artifact (the
 * `packages/db/src/migrations` directory is not bundled for this function).
 */
export const handler = handle(app);
