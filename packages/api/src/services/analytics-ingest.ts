import { auth } from "@x-game/auth";
import { createDb } from "@x-game/db";
import { behaviorEvent } from "@x-game/db/schema/analytics";
import type { Context } from "hono";

import { behaviorBatchInputSchema } from "../analytics-contract";
import { notifyAnalyticsAnomalies } from "./analytics-alerts";

export async function ingestBehaviorEvents(context: Context) {
	const contentLength = Number(context.req.header("content-length") ?? 0);
	if (contentLength > 128_000) {
		return context.json({ error: "Payload too large" }, 413);
	}

	let json: unknown;
	try {
		const body = await context.req.text();
		if (body.length > 128_000) {
			return context.json({ error: "Payload too large" }, 413);
		}
		json = JSON.parse(body);
	} catch {
		return context.json({ error: "Invalid JSON" }, 400);
	}
	const parsed = behaviorBatchInputSchema.safeParse(json);
	if (!parsed.success) {
		return context.json({ error: "Invalid analytics payload" }, 400);
	}

	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	const userAgent = context.req.header("user-agent")?.slice(0, 500);
	const db = createDb();
	const rows = await db
		.insert(behaviorEvent)
		.values(
			parsed.data.events.map((event) => ({
				...event,
				userId: session?.user.id ?? null,
				occurredAt: new Date(event.occurredAt),
				userAgent,
			})),
		)
		.onConflictDoNothing({ target: behaviorEvent.id })
		.returning({ id: behaviorEvent.id });

	// Fire-and-forget alert evaluation. The rows that lost the onConflictDoNothing
	// race (duplicates) will be filtered out by the dedup UPDATE, so we can
	// pass every id through without pre-checking.
	const claimedIds = rows.map((row) => row.id);
	notifyAnalyticsAnomalies(claimedIds);

	return context.json({ accepted: parsed.data.events.length }, 202);
}