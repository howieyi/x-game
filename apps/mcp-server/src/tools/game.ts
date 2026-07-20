import {
	bestOf,
	historyByUser,
	type GameDb,
} from "@x-game/api/services/game";
import {
	gameIdSchema,
	listTop,
	type LeaderboardDb,
	themeSchema,
} from "@x-game/api/services/leaderboard";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getDb } from "../db";
import type { ToolHandler, ToolRegistry } from "../server";

/**
 * Game 对局 / 排行榜 MCP 工具。
 *
 * Service SQL 在 `packages/api/src/services/{leaderboard,game}.ts`,与 tRPC
 * router 共享。
 *
 * 这些工具接受 `userId` / `callerUserId` 入参,信任 caller(无人做 per-user
 * 二次过滤);审计通过 `[mcp.call]` 日志落 CloudWatch。
 */

const themeEnum = themeSchema;

const leaderboardSchema = z.object({
	gameId: gameIdSchema.describe("Game identifier"),
	theme: themeEnum
		.optional()
		.describe("memory-match theme (ignored by other games)"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(10)
		.describe("Top N (1..50, default 10)"),
	callerUserId: z
		.string()
		.min(1)
		.optional()
		.describe(
			"User id for which to attach `me` (personal best + rank). Omit to skip.",
		),
});

const historySchema = z.object({
	userId: z.string().min(1).describe("User whose history to query"),
	gameId: gameIdSchema,
	theme: themeEnum.optional(),
	sinceDays: z
		.number()
		.int()
		.min(1)
		.max(365)
		.default(30)
		.describe("Lookback window in days"),
	page: z.number().int().min(0).default(0),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(20)
		.describe("Page size (1..50, default 20)"),
});

const bestSchema = z.object({
	userId: z.string().min(1),
	gameId: gameIdSchema
		.optional()
		.describe(
			"Restrict to a single game. Omit for an aggregate summary across the platform.",
		),
	theme: themeEnum.optional(),
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

export function registerGameTools(registry: ToolRegistry): void {
	const leaderboardTool: Tool = {
		name: "get_leaderboard_top",
		description:
			"Top N leaderboard for a game (memory-match optionally narrowed by theme). Returns ranked items with `rank / user / record.durationSeconds`. If `callerUserId` is set and not present in the top, `me` contains the personal best + computed rank under the same ordering rules.",
		inputSchema: {
			type: "object",
			properties: {
				gameId: { type: "string" },
				theme: { type: "string" },
				limit: { type: "number", minimum: 1, maximum: 50, default: 10 },
				callerUserId: { type: "string" },
			},
			required: ["gameId"],
			additionalProperties: false,
		},
	};
	const leaderboardHandler: ToolHandler = {
		schema: leaderboardTool,
		handle: async (args) => {
			const input = leaderboardSchema.parse(args ?? {});
			try {
				const db = (await getDb()) as unknown as LeaderboardDb;
				const out = await listTop(db, {
					gameId: input.gameId,
					theme: input.theme,
					limit: input.limit,
					callerUserId: input.callerUserId,
				});
				return jsonResult(out);
			} catch (err) {
				console.error("[mcp] get_leaderboard_top failed:", err);
				return errorResult("无法加载排行榜");
			}
		},
	};
	registry.tools.push(leaderboardTool);
	registry.handlerMap.set(leaderboardTool.name, leaderboardHandler);

	const historyTool: Tool = {
		name: "query_game_records",
		description:
			"Game-record history for a user, paginated, optionally narrowed by game/theme/time. Returns {items, total, page, pageCount}. Each item carries a derived `durationSeconds`.",
		inputSchema: {
			type: "object",
			properties: {
				userId: { type: "string" },
				gameId: { type: "string" },
				theme: { type: "string" },
				sinceDays: { type: "number", minimum: 1, maximum: 365, default: 30 },
				page: { type: "number", minimum: 0, default: 0 },
				limit: { type: "number", minimum: 1, maximum: 50, default: 20 },
			},
			required: ["userId", "gameId"],
			additionalProperties: false,
		},
	};
	const historyHandler: ToolHandler = {
		schema: historyTool,
		handle: async (args) => {
			const input = historySchema.parse(args ?? {});
			try {
				const db = (await getDb()) as unknown as GameDb;
				const out = await historyByUser(db, {
					userId: input.userId,
					gameId: input.gameId,
					theme: input.theme,
					sinceDays: input.sinceDays,
					page: input.page,
					limit: input.limit,
				});
				return jsonResult(out);
			} catch (err) {
				console.error("[mcp] query_game_records failed:", err);
				return errorResult("无法加载对局历史");
			}
		},
	};
	registry.tools.push(historyTool);
	registry.handlerMap.set(historyTool.name, historyHandler);

	const bestTool: Tool = {
		name: "get_user_best",
		description:
			"Personal best for a user. With `gameId` set, returns a single {best, total} object for that game (optionally narrowed by theme). Without `gameId`, returns an array of one entry per game across the platform.",
		inputSchema: {
			type: "object",
			properties: {
				userId: { type: "string" },
				gameId: { type: "string" },
				theme: { type: "string" },
			},
			required: ["userId"],
			additionalProperties: false,
		},
	};
	const bestHandler: ToolHandler = {
		schema: bestTool,
		handle: async (args) => {
			const input = bestSchema.parse(args ?? {});
			try {
				const db = (await getDb()) as unknown as GameDb;
				const out = await bestOf(db, {
					userId: input.userId,
					gameId: input.gameId,
					theme: input.theme,
				});
				return jsonResult(out);
			} catch (err) {
				console.error("[mcp] get_user_best failed:", err);
				return errorResult("无法加载最佳成绩");
			}
		},
	};
	registry.tools.push(bestTool);
	registry.handlerMap.set(bestTool.name, bestHandler);
}
