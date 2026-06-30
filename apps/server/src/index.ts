import { serve } from "@hono/node-server";
import { app } from "./app";

// Local dev / standalone Node server entry. The production Lambda handler
// lives in ./lambda.ts and reuses the same Hono app instance.
serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);