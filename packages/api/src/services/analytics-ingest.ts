import { auth } from "@x-game/auth";
import { createDb } from "@x-game/db";
import { behaviorEvent } from "@x-game/db/schema/analytics";
import type { Context } from "hono";

import { behaviorBatchInputSchema } from "../analytics-contract";
import { publishAnalyticsAlerts } from "./game-events";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function requestIp(context: Context): string {
	return (
		context.req.header("cf-connecting-ip") ??
		context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown"
	);
}

function isRateLimited(key: string, now = Date.now()): boolean {
	const current = rateBuckets.get(key);
	if (!current || current.resetAt <= now) {
		if (rateBuckets.size > 10_000) rateBuckets.clear();
		rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
		return false;
	}
	current.count += 1;
	return current.count > RATE_LIMIT;
}

function pathOnly(value: string): string {
	try {
		return new URL(value, "https://analytics.invalid").pathname.slice(0, 500);
	} catch {
		return value.split(/[?#]/, 1)[0]?.slice(0, 500) || "/";
	}
}

export async function ingestBehaviorEvents(context: Context) {
	if (isRateLimited(requestIp(context))) {
		context.header("Retry-After", "60");
		return context.json({ error: "Too many analytics requests" }, 429);
	}
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
				path: pathOnly(event.path),
				referrer: event.referrer ? pathOnly(event.referrer) : undefined,
				occurredAt: new Date(event.occurredAt),
				userAgent,
			})),
		)
		.onConflictDoNothing({ target: behaviorEvent.id })
		.returning({ id: behaviorEvent.id });

	// 通过 SNS → SQS → Worker 投递异常检查。发布失败时返回 503，让客户端
	// 使用同一事件 ID 重试；消费者按 alertedAt 幂等确认，不会重复告警。
	try {
		// 匿名埋点只用于统计，不允许触发外部告警，避免公开接口被用于刷飞书。
		// 已登录事件仍受每 IP 限速，并经 SQS 的重试/DLQ 保护。
		await publishAnalyticsAlerts(
			session ? parsed.data.events.map((event) => event.id) : [],
		);
	} catch (error) {
		console.error("[analytics.ingest] failed to enqueue alerts", error);
		return context.json({ error: "Analytics alert queue unavailable" }, 503);
	}

	return context.json({ accepted: rows.length }, 202);
}
