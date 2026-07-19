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
	await db
		.insert(behaviorEvent)
		.values(
			parsed.data.events.map((event) => ({
				...event,
				userId: session?.user.id ?? null,
				occurredAt: new Date(event.occurredAt),
				userAgent,
			})),
		)
		.onConflictDoNothing({ target: behaviorEvent.id });

	await notifyAnalyticsAnomalies(parsed.data.events).catch((error) => {
		// 告警失败不能让已经成功持久化的埋点返回失败，否则客户端重试会造成
		// 无意义流量；事件 ID 的唯一键仍会保证幂等。
		console.error("[analytics.alert]", error);
	});
	return context.json({ accepted: parsed.data.events.length }, 202);
}
