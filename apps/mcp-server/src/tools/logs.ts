import {
	CloudWatchLogsClient,
	type FilteredLogEvent,
	FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { mcpEnv } from "../env";
import type { ToolHandler, ToolRegistry } from "../server";

/**
 * Lambda 日志搜索工具。
 *
 * 走 AWS SDK v3 `FilterLogEventsCommand`。IAM 权限仅 `FilterLogEvents` /
 * `GetLogEvents` on 三个 LogGroup(在 template.yaml 里显式声明),没有写
 * 权限。
 *
 * LogGroup 名根据当前 stage 拼出;`logGroup` enum 起防御作用,不允许任
 * 意字符串——避免调用方把 CWL 当通配符搜索工具。
 */

const logGroupEnum = z.enum(["server", "event-worker", "mcp-server"]);

const searchLogsSchema = z.object({
	logGroup: logGroupEnum
		.default("server")
		.describe(
			"Which Log Group to search: 'server' (platform server), 'event-worker' (SQS consumer), 'mcp-server' (this function itself).",
		),
	filterPattern: z
		.string()
		.max(500)
		.optional()
		.describe(
			"CloudWatch filter pattern syntax, e.g. '[ERROR] \"MyRoute\"' or '{ $.level = \"error\" }'. Forwarded as-is.",
		),
	sinceMinutes: z
		.number()
		.int()
		.min(1)
		.max(24 * 60)
		.default(60)
		.describe("Lookback window in minutes (1..1440)"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.default(50)
		.describe("Max returned events (1..100)"),
});

const LOG_GROUP_BY_ALIAS: Record<z.infer<typeof logGroupEnum>, () => string> = {
	server: () => `/aws/lambda/x-game-platform-server-${stage()}`,
	"event-worker": () => `/aws/lambda/x-game-event-worker-${stage()}`,
	"mcp-server": () => `/aws/lambda/x-game-mcp-server-${stage()}`,
};

function stage(): string {
	return mcpEnv.DEPLOY_STAGE || "dev";
}

let _client: CloudWatchLogsClient | null = null;

function getClient(): CloudWatchLogsClient {
	if (!_client) {
		_client = new CloudWatchLogsClient({});
	}
	return _client;
}

function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(reason: string): CallToolResult {
	return { isError: true, content: [{ type: "text", text: reason }] };
}

export interface SearchLogsResult {
	logGroup: string;
	matchedCount: number;
	events: Array<{ timestamp: number; message: string }>;
}

export async function searchLambdaLogs(
	alias: z.infer<typeof logGroupEnum>,
	{
		filterPattern,
		sinceMinutes,
		limit,
	}: {
		filterPattern?: string;
		sinceMinutes: number;
		limit: number;
	},
): Promise<SearchLogsResult> {
	const logGroupName = LOG_GROUP_BY_ALIAS[alias]();
	const client = getClient();
	const startTime = Date.now() - sinceMinutes * 60_000;

	const out = await client.send(
		new FilterLogEventsCommand({
			logGroupName,
			filterPattern,
			startTime,
			limit,
		}),
	);

	const events = (out.events ?? []).map((e: FilteredLogEvent) => ({
		timestamp: e.timestamp ?? 0,
		message: e.message ?? "",
	}));

	return {
		logGroup: logGroupName,
		matchedCount: events.length,
		events,
	};
}

export function registerLogsTools(registry: ToolRegistry): void {
	const tool: Tool = {
		name: "search_lambda_logs",
		description:
			"Query a CloudWatch Logs Log Group via AWS FilterLogEvents. Returns up to `limit` events in reverse chronological order matching the optional filter pattern. Useful for inspecting recent server / event-worker / mcp-server log output during incident triage.",
		inputSchema: {
			type: "object",
			properties: {
				logGroup: {
					type: "string",
					enum: ["server", "event-worker", "mcp-server"],
					default: "server",
				},
				filterPattern: { type: "string", maxLength: 500 },
				sinceMinutes: {
					type: "number",
					minimum: 1,
					maximum: 1440,
					default: 60,
				},
				limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
			},
			required: [],
			additionalProperties: false,
		},
	};

	const handler: ToolHandler = {
		schema: tool,
		handle: async (args) => {
			const input = searchLogsSchema.parse(args ?? {});
			try {
				const data = await searchLambdaLogs(input.logGroup, {
					filterPattern: input.filterPattern,
					sinceMinutes: input.sinceMinutes,
					limit: input.limit,
				});
				return jsonResult(data);
			} catch (err) {
				console.error("[mcp] search_lambda_logs failed:", err);
				return errorResult("无法查询 Lambda 日志(检查 IAM 与 Log Group 名)");
			}
		},
	};

	registry.tools.push(tool);
	registry.handlerMap.set(tool.name, handler);
}
