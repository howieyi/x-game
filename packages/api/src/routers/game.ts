import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { gameRecord, THEMES } from "@x-game/db/schema/game";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const themeSchema = z.enum(THEMES);

export const gameRouter = router({
	submit: protectedProcedure
		.input(
			z.object({
				theme: themeSchema,
				moves: z.number().int().min(8).max(99),
				seconds: z.number().int().min(1).max(3600),
				stars: z.number().int().min(1).max(3),
				clientNonce: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;

			try {
				// 1) Idempotency check: same (userId, clientNonce) → return existing.
				const existing = await db
					.select()
					.from(gameRecord)
					.where(
						and(
							eq(gameRecord.userId, userId),
							eq(gameRecord.clientNonce, input.clientNonce),
						),
					)
					.limit(1);

				const dedupRecord = existing[0];
				if (dedupRecord) {
					return {
						record: dedupRecord,
						isNewBest: dedupRecord.isNewBest,
						prevBest: null,
						dedup: true,
					};
				}

				// 2) Look up the historical best for this (userId, theme).
				const prevBestRows = await db
					.select()
					.from(gameRecord)
					.where(
						and(
							eq(gameRecord.userId, userId),
							eq(gameRecord.theme, input.theme),
						),
					)
					.orderBy(
						asc(gameRecord.moves),
						asc(gameRecord.seconds),
						asc(gameRecord.createdAt),
						asc(gameRecord.id),
					)
					.limit(1);

				const prevBest = prevBestRows[0] ?? null;

				// 3) Compute isNewBest.
				const isNewBest =
					!prevBest ||
					input.moves < prevBest.moves ||
					(input.moves === prevBest.moves && input.seconds < prevBest.seconds);

				// 4) Insert new record.
				const id = crypto.randomUUID();
				const inserted = await db
					.insert(gameRecord)
					.values({
						id,
						userId,
						theme: input.theme,
						moves: input.moves,
						seconds: input.seconds,
						stars: input.stars,
						isNewBest,
						clientNonce: input.clientNonce,
					})
					.returning();

				const record = inserted[0];
				if (!record) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to insert game record",
					});
				}

				return {
					record,
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
				theme: themeSchema.optional(),
				page: z.number().int().min(0).default(0),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;
			const { theme, page, limit } = input;
			const offset = page * limit;

			try {
				const whereClause = theme
					? and(eq(gameRecord.userId, userId), eq(gameRecord.theme, theme))
					: eq(gameRecord.userId, userId);

				const [items, totalRows, threeStarRows] = await Promise.all([
					db
						.select()
						.from(gameRecord)
						.where(whereClause)
						.orderBy(desc(gameRecord.createdAt), desc(gameRecord.id))
						.limit(limit)
						.offset(offset),
					db.select({ value: count() }).from(gameRecord).where(whereClause),
					db
						.select({ value: count() })
						.from(gameRecord)
						.where(
							theme
								? and(
										eq(gameRecord.userId, userId),
										eq(gameRecord.theme, theme),
										eq(gameRecord.stars, 3),
									)
								: and(eq(gameRecord.userId, userId), eq(gameRecord.stars, 3)),
						),
				]);

				const total = Number(totalRows[0]?.value ?? 0);
				const threeStarCount = Number(threeStarRows[0]?.value ?? 0);
				const pageCount = Math.max(1, Math.ceil(total / limit));

				return {
					items,
					total,
					threeStarCount,
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
				theme: themeSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb();
			const userId = ctx.session.user.id;

			try {
				if (input.theme) {
					const theme = input.theme;
					const [bestRows, totalRows, threeStarRows] = await Promise.all([
						db
							.select()
							.from(gameRecord)
							.where(
								and(eq(gameRecord.userId, userId), eq(gameRecord.theme, theme)),
							)
							.orderBy(
								asc(gameRecord.moves),
								asc(gameRecord.seconds),
								asc(gameRecord.createdAt),
								asc(gameRecord.id),
							)
							.limit(1),
						db
							.select({ value: count() })
							.from(gameRecord)
							.where(
								and(eq(gameRecord.userId, userId), eq(gameRecord.theme, theme)),
							),
						db
							.select({ value: count() })
							.from(gameRecord)
							.where(
								and(
									eq(gameRecord.userId, userId),
									eq(gameRecord.theme, theme),
									eq(gameRecord.stars, 3),
								),
							),
					]);

					return {
						best: bestRows[0] ?? null,
						total: Number(totalRows[0]?.value ?? 0),
						threeStarCount: Number(threeStarRows[0]?.value ?? 0),
						theme,
					};
				}

				// Aggregate across all 7 themes.
				const aggregates = await db
					.select({
						theme: gameRecord.theme,
						bestMoves: sql<number | null>`min(${gameRecord.moves})`,
						bestSeconds: sql<number | null>`min(${gameRecord.seconds})`,
						total: count(),
						threeStarCount: sql<number>`count(*) filter (where ${gameRecord.stars} = 3)`,
					})
					.from(gameRecord)
					.where(eq(gameRecord.userId, userId))
					.groupBy(gameRecord.theme);

				// For each theme with a best, fetch the canonical best row (tiebreak
				// by createdAt then id). Themes with no records are returned as null.
				const results: Array<{
					theme: (typeof THEMES)[number];
					best: typeof gameRecord.$inferSelect | null;
					total: number;
					threeStarCount: number;
				}> = [];

				for (const theme of THEMES) {
					const agg = aggregates.find((row) => row.theme === theme);
					const total = Number(agg?.total ?? 0);
					const threeStarCount = Number(agg?.threeStarCount ?? 0);

					if (total === 0) {
						results.push({ theme, best: null, total: 0, threeStarCount: 0 });
						continue;
					}

					const bestRows = await db
						.select()
						.from(gameRecord)
						.where(
							and(eq(gameRecord.userId, userId), eq(gameRecord.theme, theme)),
						)
						.orderBy(
							asc(gameRecord.moves),
							asc(gameRecord.seconds),
							asc(gameRecord.createdAt),
							asc(gameRecord.id),
						)
						.limit(1);

					results.push({
						theme,
						best: bestRows[0] ?? null,
						total,
						threeStarCount,
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
