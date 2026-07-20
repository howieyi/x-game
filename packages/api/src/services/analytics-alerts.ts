import { createDb } from "@x-game/db";
import { behaviorEvent } from "@x-game/db/schema/analytics";
import { and, inArray, isNull } from "drizzle-orm";
import { env } from "@x-game/env/server";

type BehaviorEventRow = typeof behaviorEvent.$inferSelect;

type Anomaly = {
	row: BehaviorEventRow;
	label: string;
};

// Severity for the alerting logic; keeps the per-event thresholds next to
// the human-readable label they render as.
function classify(row: BehaviorEventRow): Anomaly | null {
	if (row.eventType === "signup") {
		return { row, label: "新用户注册" };
	}
	if (row.eventType === "first_play") {
		return { row, label: `首次游戏：${row.eventName}` };
	}
	if (row.eventType === "error") {
		return { row, label: "前端运行异常" };
	}
	if (row.eventType !== "performance") return null;

	const raw = (row.properties as Record<string, unknown> | null)?.value;
	const value = typeof raw === "number" ? raw : Number(raw ?? 0);
	if (row.eventName === "LCP" && value > 4000) {
		return { row, label: `LCP 过慢（${Math.round(value)}ms）` };
	}
	if (row.eventName === "CLS" && value > 0.25) {
		return { row, label: `CLS 偏高（${value.toFixed(3)}）` };
	}
	if (row.eventName === "INP" && value > 500) {
		return { row, label: `INP 过慢（${Math.round(value)}ms）` };
	}
	return null;
}

// Send one combined message per call; cap at 8 lines to keep the bot reply
// readable.
async function dispatch(anomalies: Anomaly[]) {
	if (anomalies.length === 0) return;
	const url = env.FEISHU_ANALYTICS_WEBHOOK_URL;
	if (!url) return;
	const lines = anomalies
		.slice(0, 8)
		.map(
			({ label, row }) =>
				`• ${label}\n  页面：${row.path}\n  事件：${row.eventName}\n  时间：${row.occurredAt.toISOString()}`,
		);
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			msg_type: "text",
			content: {
				text: `【NEXUS 行为监控告警】\n${lines.join("\n")}`,
			},
		}),
		signal: AbortSignal.timeout(5000),
	});
	if (!response.ok) {
		throw new Error(`飞书 Webhook 返回 HTTP ${response.status}`);
	}
}

// Claim un-alerted rows atomically. The conditional UPDATE (with
// `alerted_at IS NULL`) acts as a row-level lock: concurrent callers either
// win the UPDATE and receive the row in RETURNING, or see zero rows and
// know a sibling worker already claimed it. Either way, an event id is
// surfaced to Feishu at most once.
async function claimRows(ids: string[]): Promise<BehaviorEventRow[]> {
	if (ids.length === 0) return [];
	const db = createDb();
	const claimed = await db
		.update(behaviorEvent)
		.set({ alertedAt: new Date() })
		.where(
			and(
				inArray(behaviorEvent.id, ids),
				isNull(behaviorEvent.alertedAt),
			),
		)
		.returning();
	return claimed as BehaviorEventRow[];
}

/**
 * Fire-and-forget wrapper around the actual dedup + dispatch flow.
 *
 * Intentionally swallows errors: the HTTP response that triggered the
 * ingest should not be held hostage by a misbehaving webhook. Failures are
 * logged so operators still see them server-side.
 */
export function notifyAnalyticsAnomalies(eventIds: string[]): void {
	if (!env.FEISHU_ANALYTICS_WEBHOOK_URL) return;
	if (eventIds.length === 0) return;

	void (async () => {
		try {
			const claimed = await claimRows(eventIds);
			if (claimed.length === 0) return;
			const anomalies = claimed
				.map(classify)
				.filter((item): item is Anomaly => item !== null);
			if (anomalies.length === 0) return;
			await dispatch(anomalies);
		} catch (error) {
			console.error("[analytics.alert]", error);
		}
	})();
}