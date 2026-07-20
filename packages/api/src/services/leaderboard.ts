import type { createDb } from "@x-game/db";
import { user } from "@x-game/db/schema/auth";
import { GAMES, gameRecord, THEMES, type GameId, type Theme } from "@x-game/db/schema/game";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Leaderboard 聚合 SQL,共享给 tRPC router 与 MCP tools。
 *
 * 关键点:排名规则 `score DESC, createdAt ASC, id ASC` 在两个工具里必须
 * 完全一致,否则对外 Top N 与 myBest 的 rank 会出现同一玩家在不同入口
 * 排名不同的诡异现象。
 */

export type LeaderboardDb = Awaited<ReturnType<typeof createDb>>;

export const gameIdSchema = z.enum(GAMES);
export const themeSchema = z.enum(THEMES);

export interface DisplayGameRecord {
	id: string;
	userId: string;
	gameId: GameId;
	score: number;
	theme: Theme | null;
	metrics: unknown;
	moves: number | null;
	seconds: number | null;
	stars: number | null;
	isNewBest: boolean | null;
	clientNonce: string;
	createdAt: Date;
	durationSeconds: number | null;
}

function readDurationSeconds(metrics: unknown): number | null {
	if (!metrics || typeof metrics !== "object") return null;
	const m = metrics as Record<string, unknown>;
	const raw = m.seconds ?? m.durationSeconds;
	if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
	return Math.max(0, Math.floor(raw));
}

export type DisplayGameRecordRow = {
	id: string;
	userId: string;
	gameId: GameId;
	score: number;
	theme: Theme | null;
	metrics: unknown;
	moves: number | null;
	seconds: number | null;
	stars: number | null;
	isNewBest: boolean | null;
	clientNonce: string;
	createdAt: Date;
};

export type DisplayRecord = DisplayGameRecordRow & { durationSeconds: number | null };

export function withDisplay(row: DisplayGameRecordRow): DisplayRecord {
	return { ...row, durationSeconds: readDurationSeconds(row.metrics) };
}

export interface LeaderboardItem {
	rank: number;
	user: { id: string; name: string };
	record: DisplayRecord;
}

export interface LeaderboardMe {
	rank: number;
	user: { id: string; name: string };
	record: DisplayRecord;
}

export interface LeaderboardResult {
	items: LeaderboardItem[];
	me: LeaderboardMe | null;
}

/**
 * Top-N leaderboard for a given game (+ optional theme for memory-match).
 *
 * `callerUserId` is the MCP equivalent of `ctx.session.user.id`: when set,
 * and the caller is NOT already in the top N, we attach their personal
 * best + computed rank under `me`.
 *
 * The caller is responsible for any per-user authorization — the function
 * trusts the input.
 */
export async function listTop(
	db: LeaderboardDb,
	{
		gameId,
		theme,
		limit,
		callerUserId,
	}: {
		gameId: GameId;
		theme?: Theme;
		limit: number;
		callerUserId?: string;
	},
): Promise<LeaderboardResult> {
	const whereClause = theme
		? and(eq(gameRecord.gameId, gameId), eq(gameRecord.theme, theme))
		: eq(gameRecord.gameId, gameId);

	const topRows = await db
		.select({
			record: gameRecord,
			userId: user.id,
			userName: user.name,
		})
		.from(gameRecord)
		.innerJoin(user, eq(gameRecord.userId, user.id))
		.where(whereClause)
		.orderBy(
			desc(gameRecord.score),
			asc(gameRecord.createdAt),
			asc(gameRecord.id),
		)
		.limit(limit);

	const items: LeaderboardItem[] = topRows.map((row, index) => ({
		rank: index + 1,
		user: { id: row.userId, name: row.userName },
		record: withDisplay(row.record),
	}));

	if (!callerUserId) {
		return { items, me: null };
	}

	const inTop = items.some((row) => row.user.id === callerUserId);
	if (inTop) {
		return { items, me: null };
	}

	const myBestWhere = theme
		? and(
				eq(gameRecord.userId, callerUserId),
				eq(gameRecord.gameId, gameId),
				eq(gameRecord.theme, theme),
			)
		: and(
				eq(gameRecord.userId, callerUserId),
				eq(gameRecord.gameId, gameId),
			);

	const myBestRows = await db
		.select()
		.from(gameRecord)
		.where(myBestWhere)
		.orderBy(
			desc(gameRecord.score),
			asc(gameRecord.createdAt),
			asc(gameRecord.id),
		)
		.limit(1);

	const myBestRecord = myBestRows[0];
	if (!myBestRecord) {
		return { items, me: null };
	}

	const better = await db
		.select({ value: sql<number>`count(*)` })
		.from(gameRecord)
		.leftJoin(user, eq(gameRecord.userId, user.id))
		.where(
			and(
				whereClause,
				or(
					sql`${gameRecord.score} > ${myBestRecord.score}`,
					and(
						eq(gameRecord.score, myBestRecord.score),
						sql`${gameRecord.createdAt} < ${myBestRecord.createdAt}`,
					),
					and(
						eq(gameRecord.score, myBestRecord.score),
						eq(gameRecord.createdAt, myBestRecord.createdAt),
						sql`${gameRecord.id} < ${myBestRecord.id}`,
					),
				),
			),
		);

	const meNameRow = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, callerUserId))
		.limit(1);

	const rank = Number(better[0]?.value ?? 0) + 1;

	return {
		items,
		me: {
			rank,
			user: { id: callerUserId, name: meNameRow[0]?.name ?? "" },
			record: withDisplay(myBestRecord),
		},
	};
}
