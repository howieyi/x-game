import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { verifyMcpAuth } from "./auth";
import { createStatelessMcp } from "./transport";

/**
 * Shared Hono app for the MCP server.
 *
 * Routes:
 *   GET /mcp/healthz — always 200, used by ALB health check (no auth)
 *   *   /mcp         — Streamable HTTP MCP endpoint (auth required)
 *
 * Middleware order: logger → cors → auth → handler
 *
 * The auth middleware short-circuits with a 401 JSON envelope before any
 * transport setup happens, so unauthorized callers can never trigger a
 * Postgres round-trip or Secrets Manager read.
 *
 * The MCP handler delegates to `WebStandardStreamableHTTPServerTransport`
 * which accepts a web `Request` and returns a web `Response` — exactly
 * the shape Hono hands us via `c.req.raw`.
 */

export const app = new Hono();
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

app.use(logger());

app.use(
	"/*",
	cors({
		origin: "*", // MCP clients are owner-only; CORS is permissive on purpose
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
		credentials: false,
		exposeHeaders: ["Mcp-Session-Id"],
	}),
);

app.get("/mcp/healthz", (c) =>
	c.json({ status: "ok", service: "x-game-mcp-server" }),
);

app.all("/mcp", async (c) => {
	const authHeader =
		c.req.header("authorization") ?? c.req.header("Authorization");
	const auth = await verifyMcpAuth(authHeader);
	if (!auth.ok) {
		return c.json(
			{ error: { code: "UNAUTHORIZED", message: "unauthorized" } },
			401,
		);
	}

	const clientKey =
		c.req.header("cf-connecting-ip") ??
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown";
	const now = Date.now();
	const bucket = requestBuckets.get(clientKey);
	if (!bucket || bucket.resetAt <= now) {
		if (requestBuckets.size > 10_000) requestBuckets.clear();
		requestBuckets.set(clientKey, { count: 1, resetAt: now + 60_000 });
	} else {
		bucket.count += 1;
		if (bucket.count > 60) {
			c.header("Retry-After", "60");
			return c.json(
				{ error: { code: "RATE_LIMITED", message: "too many requests" } },
				429,
			);
		}
	}

	const mcp = await createStatelessMcp();
	return mcp.transport.handleRequest(c.req.raw);
});
