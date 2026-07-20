import {
	type AnalyticsDb,
	overview,
	recent,
	searchErrors,
} from "@x-game/api/services/analytics-aggregate";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getDb } from "../db";
import type { ToolHandler, ToolRegistry } from "../server";

/**
 * Behavior 行为埋点 MCP 工具。
 *
 * Service 层的 SQL 写在 `packages/api/src/services/analytics-aggregate.ts`,
 * 本文件只负责 MCP schema(zod → JSON Schema)、tool 注册与结果 wrap。
 *
 * 注意:`callerUserId` 在 MCP 这层用于审计日志(`tool=query_behavior_overview
 * callerUserId=u_xxx`),不会影响返回数据——这些是平台级聚合,不做 user 过滤。
 */

const AnalyticsEventTypeEnum = z.enum([
	"page_view",
	"click",
	"performance",
	"error",
	"visibility",
	"signup",
	"first_play",
]);

const overviewSchema = z.object({
	days: z
		.number()
		.int()
		.min(1)
		.max(90)
		.default(7)
		.describe("Lookback window in days (1..90, default 7)"),
});

const recentSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.default(30)
		.describe("Number of recent events (1..100, default 30)"),
	eventType: AnalyticsEventTypeEnum.optional().describe(
		"Optional event-type filter",
	),
});

const searchErrorsSchema = z.object({
	sinceMinutes: z
		.number()
		.int()
		.min(1)
		.max(7 * 24 * 60)
		.default(60)
		.describe("Lookback window in minutes (default 60)"),
	pathLike: z
		.string()
		.max(200)
		.optional()
		.describe("Optional substring filter against event.path (ILIKE)"),
	messageLike: z
		.string()
		.max(200)
		.optional()
		.describe(
			"Optional substring filter against properties.message (ILIKE)",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(20)
		.describe("Sample row cap (1..50, default 20)"),
});

function jsonResult(data: unknown): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
	};
}

function errorResult(reason: string): CallToolResult {
	return {
		isError: true,
		content: [{ type: "text", text: reason }],
	};
}

export function registerAnalyticsTools(registry: ToolRegistry): void {
	const overviewTool: Tool = {
		name: "query_behavior_overview",
		description:
			"Aggregate behavior_event rows over a lookback window: total events, distinct sessions / visitors / errors, daily trend (events + sessions), top event types, top pages, and P75 of performance metrics. Returns a single nested object matching the platform analytics dashboard shape.",
		inputSchema: {
			type: "object",
			properties: {
				days: {
					type: "number",
					minimum: 1,
					maximum: 90,
					default: 7,
					description: "Lookback window in days",
				},
			},
			required: [],
			additionalProperties: false,
		},
	};
	const overviewHandler: ToolHandler = {
		schema: overviewTool,
		handle: async (args) => {
			const input = overviewSchema.parse(args ?? {});
			try {
				const db = (await getDb()) as unknown as AnalyticsDb;
				const data = await overview(db, input);
				return jsonResult(data);
			} catch (err) {
				console.error("[mcp] query_behavior_overview failed:", err);
				return errorResult("无法加载行为分析数据");
			}
		},
	};
	registry.tools.push(overviewTool);
	registry.handlerMap.set(overviewTool.name, overviewHandler);

	const recentTool: Tool = {
		name: "list_recent_events",
		description:
			"Return the most recent behavior events in reverse chronological order. Useful for inspecting what users did in the last few minutes.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number", minimum: 1, maximum: 100, default: 30 },
				eventType: {
					type: "string",
					enum: [
						"page_view",
						"click",
						"performance",
						"error",
						"visibility",
						"signup",
						"first_play",
					],
				},
			},
			required: [],
			additionalProperties: false,
		},
	};
	const recentHandler: ToolHandler = {
		schema: recentTool,
		handle: async (args) => {
			const input = recentSchema.parse(args ?? {});
			try {
				const db = (await getDb()) as unknown as AnalyticsDb;
				const rows = await recent(db, input);
				return jsonResult(rows);
			} catch (err) {
				console.error("[mcp] list_recent_events failed:", err);
				return errorResult("无法加载最近事件");
			}
		},
	};
	registry.tools.push(recentTool);
	registry.handlerMap.set(recentTool.name, recentHandler);

	const searchErrorsTool: Tool = {
		name: "search_errors",
		description:
			"Filter behavior_event rows where event_type='error'. Returns total count + up to `limit` sample rows with id, path, eventName, message and createdAt. Supports optional substring filters on path and on properties.message.",
		inputSchema: {
			type: "object",
			properties: {
				sinceMinutes: { type: "number", minimum: 1, default: 60 },
				pathLike: { type: "string", maxLength: 200 },
				messageLike: { type: "string", maxLength: 200 },
				limit: { type: "number", minimum: 1, maximum: 50, default: 20 },
			},
			required: [],
			additionalProperties: false,
		},
	};
	const searchErrorsHandler: ToolHandler = {
		schema: searchErrorsTool,
		handle: async (args) => {
			const input = searchErrorsSchema.parse(args ?? {});
			try {
				const db = (await getDb()) as unknown as AnalyticsDb;
				const data = await searchErrors(db, input);
				return jsonResult(data);
			} catch (err) {
				console.error("[mcp] search_errors failed:", err);
				return errorResult("无法加载错误事件");
			}
		},
	};
	registry.tools.push(searchErrorsTool);
	registry.handlerMap.set(searchErrorsTool.name, searchErrorsHandler);
}
