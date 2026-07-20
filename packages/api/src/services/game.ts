import type { createDb } from "@x-game/db";
import {
	GAMES,
	type GameId,
	gameRecord,
	type Theme,
} from "@x-game/db/schema/game";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";

import { withDisplay, type DisplayRecord } from "./leaderboard";

/**
 * Game 对局聚合 SQL,共享给 tRPC router 与 MCP tools。
 */

export type GameDb = Awaited<ReturnType<typeof createDb>>;

export interface HistoryByUserArgs {
	userId: string;
	gameId: GameId;
	theme?: Theme;
	sinceDays: number;
	page: number;
	limit: number;
}

export interface HistoryByUserResult {
	items: DisplayRecord[];
	total: number;
	page: number;
	pageCount: number;
}

export async function historyByUser(
	db: GameDb,
	args: HistoryByUserArgs,
): Promise<HistoryByUserResult> {
	const { userId, gameId, theme, sinceDays, page, limit } = args;
	const since = new Date(Date.now() - sinceDays * 86_400_000);
	const baseWhere = and(
		eq(gameRecord.userId, userId),
		eq(gameRecord.gameId, gameId),
		theme ? eq(gameRecord.theme, theme) : undefined,
		gte(gameRecord.createdAt, since),
	);
	const offset = page * limit;

	const [items, totalRows] = await Promise.all([
		db
			.select()
			.from(gameRecord)
			.where(baseWhere)
			.orderBy(desc(gameRecord.createdAt), desc(gameRecord.id))
			.limit(limit)
			.offset(offset),
		db.select({ value: count() }).from(gameRecord).where(baseWhere),
	]);

	const total = Number(totalRows[0]?.value ?? 0);
	const pageCount = Math.max(1, Math.ceil(total / limit));

	return {
		items: items.map(withDisplay),
		total,
		page,
		pageCount,
	};
}

export type BestResult =
	| { gameId: GameId; theme: Theme | null; best: DisplayRecord | null; total: number }
	| Array<{ gameId: GameId; best: DisplayRecord | null; total: number }>;

export async function bestOf(
	db: GameDb,
	{
		userId,
		gameId,
		theme,
	}: {
		userId: string;
		gameId?: GameId;
		theme?: Theme;
	},
): Promise<BestResult> {
	if (gameId) {
		const bestWhere = and(
			eq(gameRecord.userId, userId),
			eq(gameRecord.gameId, gameId),
			theme ? eq(gameRecord.theme, theme) : undefined,
		);
		const [bestRows, totalRows] = await Promise.all([
			db
				.select()
				.from(gameRecord)
				.where(bestWhere)
				.orderBy(
					desc(gameRecord.score),
					asc(gameRecord.createdAt),
					asc(gameRecord.id),
				)
				.limit(1),
			db.select({ value: count() }).from(gameRecord).where(bestWhere),
		]);
		return {
			gameId,
			theme: theme ?? null,
			best: bestRows[0] ? withDisplay(bestRows[0]) : null,
			total: Number(totalRows[0]?.value ?? 0),
		};
	}

	// Per-game summary aggregated across the user's full history.
	const aggregates = await db
		.select({
			gameId: gameRecord.gameId,
			bestScore: sql<number | null>`max(${gameRecord.score})`,
			total: count(),
		})
		.from(gameRecord)
		.where(eq(gameRecord.userId, userId))
		.groupBy(gameRecord.gameId);

	const out: Array<{ gameId: GameId; best: DisplayRecord | null; total: number }> = [];

	for (const gid of GAMES) {
		const agg = aggregates.find((row) => row.gameId === gid);
		const total = Number(agg?.total ?? 0);
		if (total === 0) {
			out.push({ gameId: gid, best: null, total: 0 });
			continue;
		}
		const bestRows = await db
			.select()
			.from(gameRecord)
			.where(and(eq(gameRecord.userId, userId), eq(gameRecord.gameId, gid)))
			.orderBy(
				desc(gameRecord.score),
				asc(gameRecord.createdAt),
				asc(gameRecord.id),
			)
			.limit(1);
		out.push({
			gameId: gid,
			best: bestRows[0] ? withDisplay(bestRows[0]) : null,
			total,
		});
	}

	return out;
}
