import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { type GameId, gameRecord } from "@x-game/db/schema/game";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	bestOf,
	historyByUser,
	type GameDb,
} from "../services/game";
import {
	gameIdSchema,
	themeSchema,
	withDisplay,
} from "../services/leaderboard";
import { publishGameCompleted } from "../services/game-events";

// Reuse local schemas to keep the router input shape stable.
const gameIdInputSchema = gameIdSchema;
const themeInputSchema = themeSchema;

const metricsSchema = z.record(z.string(), z.unknown()).default({});

const submitInputSchema = z.object({
	gameId: gameIdInputSchema,
	score: z.number().int().min(0).max(1_000_000),
	metrics: metricsSchema,
	theme: themeInputSchema.optional(),
	clientNonce: z.string().uuid(),
});

export type SubmitInput = z.infer<typeof submitInputSchema>;

function eventGameId(gameId: GameId, theme?: string): string {
	if (gameId === "memory-match" && theme) {
		return `memory-match:${theme}`;
	}
	return gameId;
}

function readDurationSeconds(metrics: Record<string, unknown>): number {
	const raw = metrics.seconds ?? metrics.durationSeconds;
	if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
	return Math.max(0, Math.floor(raw));
}

export const gameRouter = router({
	submit: protectedProcedure
		.input(submitInputSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;
			const { gameId, score, metrics, theme, clientNonce } = input;

			try {
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
					.orderBy(desc(gameRecord.score), desc(gameRecord.createdAt), desc(gameRecord.id))
					.limit(1);

				const prevBest = prevBestRows[0] ?? null;

				const isNewBest = !prevBest || score > prevBest.score;

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
				gameId: gameIdInputSchema,
				theme: themeInputSchema.optional(),
				page: z.number().int().min(0).default(0),
				limit: z.number().int().min(1).max(50).default(20),
				sinceDays: z.number().int().min(1).max(365).default(30),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb() as unknown as GameDb;
			try {
				return await historyByUser(db, {
					userId: ctx.session.user.id,
					gameId: input.gameId,
					theme: input.theme,
					sinceDays: input.sinceDays,
					page: input.page,
					limit: input.limit,
				});
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
				gameId: gameIdInputSchema.optional(),
				theme: themeInputSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb() as unknown as GameDb;
			try {
				return await bestOf(db, {
					userId: ctx.session.user.id,
					gameId: input.gameId,
					theme: input.theme,
				});
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
