import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import {
	GAMES,
	type GameId,
	gameRecord,
	THEMES,
	type Theme,
} from "@x-game/db/schema/game";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { publishGameCompleted } from "../services/game-events";

const gameIdSchema = z.enum(GAMES);
const themeSchema = z.enum(THEMES);

// `metrics` is a free-form jsonb blob. Each game decides its own shape; the
// API does not narrow it further. memory-match stores {theme?, moves, seconds,
// stars} here; arcade games store their own per-game keys.
const metricsSchema = z.record(z.string(), z.unknown()).default({});

// Convenience Zod helper: a single input shape every game calls with.
const submitInputSchema = z.object({
	gameId: gameIdSchema,
	score: z.number().int().min(0).max(1_000_000),
	metrics: metricsSchema,
	// memory-match legacy secondary dimension. Other games omit it.
	theme: themeSchema.optional(),
	clientNonce: z.string().uuid(),
});

export type SubmitInput = z.infer<typeof submitInputSchema>;

// Derive the canonical gameId for the analytics event. memory-match emits a
// `memory-match:<theme>` id so downstream consumers can split per theme;
// other games emit their plain slug.
function eventGameId(gameId: GameId, theme?: Theme): string {
	if (gameId === "memory-match" && theme) {
		return `memory-match:${theme}`;
	}
	return gameId;
}

// Pull `durationSeconds` out of metrics if a game chose to record it there.
// memory-match and all arcade games report a duration, so this is a shared
// helper used by SNS event publishing.
function readDurationSeconds(metrics: Record<string, unknown>): number {
	const raw = metrics.seconds ?? metrics.durationSeconds;
	if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
	return Math.max(0, Math.floor(raw));
}

// Decorate a raw `gameRecord` row with a `durationSeconds` derived from its
// `metrics` blob. Front-end tables can read this single field instead of
// poking at metrics for each game.
type GameRecordRow = typeof gameRecord.$inferSelect;
type DisplayGameRecord = GameRecordRow & {
	durationSeconds: number | null;
};

function withDisplay(row: GameRecordRow): DisplayGameRecord {
	return {
		...row,
		durationSeconds: readDurationSeconds(row.metrics),
	};
}

export const gameRouter = router({
	submit: protectedProcedure
		.input(submitInputSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;
			const { gameId, score, metrics, theme, clientNonce } = input;

			try {
				// 1) Idempotency check: same (userId, clientNonce) → return existing.
				const existing = await db
					.select()
					.from(gameRecord)
					.where(
						and(
							eq(gameRecord.userId, userId),
							eq(gameRecord.clientNonce, clientNonce),
						),
					)
					.limit(1);

				const dedupRecord = existing[0];
				if (dedupRecord) {
					return {
						record: withDisplay(dedupRecord),
						isNewBest: dedupRecord.isNewBest,
						prevBest: null,
						dedup: true,
					};
				}

				// 2) Look up the previous best for this (userId, gameId, theme?).
				// memory-match partitions by theme so two different card decks
				// count as independent leaderboards; every other game keeps
				// `theme` null and therefore ranks a single shared board.
				const prevBestWhere = theme
					? and(
							eq(gameRecord.userId, userId),
							eq(gameRecord.gameId, gameId),
							eq(gameRecord.theme, theme),
						)
					: and(eq(gameRecord.userId, userId), eq(gameRecord.gameId, gameId));

				const prevBestRows = await db
					.select()
					.from(gameRecord)
					.where(prevBestWhere)
					.orderBy(
						desc(gameRecord.score),
						asc(gameRecord.createdAt),
						asc(gameRecord.id),
					)
					.limit(1);

				const prevBest = prevBestRows[0] ?? null;

				// 3) isNewBest: a higher score beats the previous best.
				// First-ever record always counts as a personal best.
				const isNewBest = !prevBest || score > prevBest.score;

				// 4) Insert new record.
				const id = crypto.randomUUID();
				const inserted = await db
					.insert(gameRecord)
					.values({
						id,
						userId,
						gameId,
						score,
						metrics,
						theme: theme ?? null,
						// Legacy columns stay populated for memory-match so older
						// read paths keep working; arcade games leave them null.
						moves:
							typeof metrics.moves === "number"
								? Math.floor(metrics.moves)
								: null,
						seconds:
							typeof metrics.seconds === "number"
								? Math.floor(metrics.seconds)
								: null,
						stars:
							typeof metrics.stars === "number"
								? Math.floor(metrics.stars)
								: null,
						isNewBest,
						clientNonce,
					})
					.returning();

				const record = inserted[0];
				if (!record) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to insert game record",
					});
				}

				try {
					await publishGameCompleted({
						eventId: record.id,
						userId,
						gameId: eventGameId(gameId, theme),
						score,
						durationSeconds: readDurationSeconds(metrics),
					});
				} catch (eventError) {
					// Persistence remains the source of truth. A transient event-bus
					// failure must not make the client retry an already committed game.
					console.error("[game.events] publish failed", eventError);
				}

				return {
					record: withDisplay(record),
					isNewBest,
					prevBest,
					dedup: false,
				};
			} catch (err) {
				if (err instanceof TRPCError) {
					throw err;
				}
				console.error("[game.submit]", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to submit game record",
					cause: err,
				});
			}
		}),

	myHistory: protectedProcedure
		.input(
			z.object({
				gameId: gameIdSchema,
				theme: themeSchema.optional(),
				page: z.number().int().min(0).default(0),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;
			const { gameId, theme, page, limit } = input;
			const offset = page * limit;

			try {
				const baseWhere = theme
					? and(
							eq(gameRecord.userId, userId),
							eq(gameRecord.gameId, gameId),
							eq(gameRecord.theme, theme),
						)
					: and(eq(gameRecord.userId, userId), eq(gameRecord.gameId, gameId));

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
			} catch (err) {
				console.error("[game.myHistory]", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to load game history",
					cause: err,
				});
			}
		}),

	myBest: protectedProcedure
		.input(
			z.object({
				gameId: gameIdSchema.optional(),
				theme: themeSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;

			try {
				// Per-game summary (optionally narrowed by theme for memory-match).
				if (input.gameId) {
					const gameId = input.gameId;
					const theme = input.theme;

					const bestWhere = theme
						? and(
								eq(gameRecord.userId, userId),
								eq(gameRecord.gameId, gameId),
								eq(gameRecord.theme, theme),
							)
						: and(eq(gameRecord.userId, userId), eq(gameRecord.gameId, gameId));

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
						best: bestRows[0] ? withDisplay(bestRows[0]) : null,
						total: Number(totalRows[0]?.value ?? 0),
						gameId,
						theme: theme ?? null,
					};
				}

				// No gameId → aggregate across the whole platform. Each game is
				// reported separately so the client can render one card per game.
				const aggregates = await db
					.select({
						gameId: gameRecord.gameId,
						bestScore: sql<number | null>`max(${gameRecord.score})`,
						total: count(),
					})
					.from(gameRecord)
					.where(eq(gameRecord.userId, userId))
					.groupBy(gameRecord.gameId);

				const results: Array<{
					gameId: GameId;
					best: DisplayGameRecord | null;
					total: number;
				}> = [];

				for (const gameId of GAMES) {
					const agg = aggregates.find((row) => row.gameId === gameId);
					const total = Number(agg?.total ?? 0);

					if (total === 0) {
						results.push({ gameId, best: null, total: 0 });
						continue;
					}

					const bestRows = await db
						.select()
						.from(gameRecord)
						.where(
							and(eq(gameRecord.userId, userId), eq(gameRecord.gameId, gameId)),
						)
						.orderBy(
							desc(gameRecord.score),
							asc(gameRecord.createdAt),
							asc(gameRecord.id),
						)
						.limit(1);

					results.push({
						gameId,
						best: bestRows[0] ? withDisplay(bestRows[0]) : null,
						total,
					});
				}

				return results;
			} catch (err) {
				console.error("[game.myBest]", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to load best records",
					cause: err,
				});
			}
		}),
});
