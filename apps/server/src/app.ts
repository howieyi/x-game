import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@x-game/api/context";
import { appRouter } from "@x-game/api/routers/index";
import { ingestBehaviorEvents } from "@x-game/api/services/analytics-ingest";
import { auth } from "@x-game/auth";
import { env } from "@x-game/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// Shared Hono app, reused by:
//   - src/index.ts  (dev / long-running Node server via @hono/node-server)
//   - src/lambda.ts (AWS Lambda via hono/aws-lambda adapter)
export const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.post("/api/analytics/events", ingestBehaviorEvents);

app.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

app.get("/api/health", (c) => {
	return c.json({
		status: "ok",
		service: "nexus-game-platform",
		timestamp: new Date().toISOString(),
	});
});
