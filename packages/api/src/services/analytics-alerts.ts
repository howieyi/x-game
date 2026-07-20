import { createDb } from "@x-game/db";
import { behaviorEvent } from "@x-game/db/schema/analytics";
import { env } from "@x-game/env/server";
import { and, inArray, isNull } from "drizzle-orm";

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
	const result = (await response.json().catch(() => null)) as {
		StatusCode?: number;
		code?: number;
	} | null;
	const businessCode = result?.StatusCode ?? result?.code;
	if (typeof businessCode === "number" && businessCode !== 0) {
		throw new Error(`飞书 Webhook 拒绝请求，业务码 ${businessCode}`);
	}
}

async function loadPendingRows(ids: string[]): Promise<BehaviorEventRow[]> {
	if (ids.length === 0) return [];
	const db = createDb();
	return db
		.select()
		.from(behaviorEvent)
		.where(
			and(inArray(behaviorEvent.id, ids), isNull(behaviorEvent.alertedAt)),
		) as Promise<BehaviorEventRow[]>;
}

/**
 * 由 SQS Worker 调用。只有飞书明确成功后才写 alertedAt；抛出的错误会让
 * Lambda 返回 partial batch failure，由 SQS 重试并最终进入 DLQ。
 */
export async function processAnalyticsAnomalies(
	eventIds: string[],
): Promise<void> {
	if (!env.FEISHU_ANALYTICS_WEBHOOK_URL) return;
	if (eventIds.length === 0) return;

	const pending = await loadPendingRows(eventIds);
	if (pending.length === 0) return;
	const anomalies = pending
		.map(classify)
		.filter((item): item is Anomaly => item !== null);
	if (anomalies.length === 0) return;

	await dispatch(anomalies);

	const db = createDb();
	await db
		.update(behaviorEvent)
		.set({ alertedAt: new Date() })
		.where(
			and(
				inArray(
					behaviorEvent.id,
					anomalies.map(({ row }) => row.id),
				),
				isNull(behaviorEvent.alertedAt),
			),
		);
}
