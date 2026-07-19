import { env } from "@x-game/env/server";

import type { BehaviorEventInput } from "../analytics-contract";

type Anomaly = {
	label: string;
	event: BehaviorEventInput;
};

function detectAnomaly(event: BehaviorEventInput): Anomaly | null {
	if (event.eventType === "error") {
		return { label: "前端运行异常", event };
	}
	if (event.eventType !== "performance") return null;

	const value = Number(event.properties.value ?? 0);
	if (event.eventName === "LCP" && value > 4000) {
		return { label: `LCP 过慢（${Math.round(value)}ms）`, event };
	}
	if (event.eventName === "CLS" && value > 0.25) {
		return { label: `CLS 偏高（${value.toFixed(3)}）`, event };
	}
	if (event.eventName === "INP" && value > 500) {
		return { label: `INP 过慢（${Math.round(value)}ms）`, event };
	}
	return null;
}

export async function notifyAnalyticsAnomalies(events: BehaviorEventInput[]) {
	if (!env.FEISHU_ANALYTICS_WEBHOOK_URL) return;
	const anomalies = events.map(detectAnomaly).filter((item) => item !== null);
	if (anomalies.length === 0) return;

	const lines = anomalies
		.slice(0, 8)
		.map(
			({ label, event }) =>
				`• ${label}\n  页面：${event.path}\n  事件：${event.eventName}\n  时间：${event.occurredAt}`,
		);
	const response = await fetch(env.FEISHU_ANALYTICS_WEBHOOK_URL, {
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
