import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { user } from "@x-game/db/schema/auth";
import { GAMES, gameRecord, THEMES } from "@x-game/db/schema/game";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

const gameIdSchema = z.enum(GAMES);
const themeSchema = z.enum(THEMES);

// Decorate raw rows with a derived `durationSeconds` so the front-end table
// doesn't need to know per-game metrics shape.
function readDurationSeconds(metrics: unknown): number | null {
	if (!metrics || typeof metrics !== "object") return null;
	const m = metrics as Record<string, unknown>;
	const raw = m.seconds ?? m.durationSeconds;
	if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
	return Math.max(0, Math.floor(raw));
}

export const leaderboardRouter = router({
	list: publicProcedure
		.input(
			z.object({
				// Platform-wide game identifier. Required so each game gets its
				// own board (memory-match, arcade-2d, ...).
				gameId: gameIdSchema,
				// memory-match secondary dimension; ignored by other games.
				theme: themeSchema.optional(),
				limit: z.number().int().min(1).max(50).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb();
			const { gameId, theme, limit } = input;

			try {
				// memory-match narrows by theme (independent boards per card
				// deck). Every other game leaves `theme` undefined and shares
				// a single leaderboard.
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
					// Universal ranking: higher `score` wins, ties broken by the
					// earliest record. `id` provides a final deterministic
					// tiebreak so concurrent submissions with the same score
					// and timestamp still produce a stable order.
					.orderBy(
						desc(gameRecord.score),
						asc(gameRecord.createdAt),
						asc(gameRecord.id),
					)
					.limit(limit);

				const items = topRows.map((row, index) => ({
					rank: index + 1,
					user: { id: row.userId, name: row.userName },
					record: {
						...row.record,
						durationSeconds: readDurationSeconds(row.record.metrics),
					},
				}));

				// If the caller is logged in and not in the top N, attach their
				// personal best and compute their rank.
				const session = ctx.session;
				if (session) {
					const meId = session.user.id;
					const inTop = items.some((row) => row.user.id === meId);

					if (!inTop) {
						const myBestWhere = theme
							? and(
									eq(gameRecord.userId, meId),
									eq(gameRecord.gameId, gameId),
									eq(gameRecord.theme, theme),
								)
							: and(eq(gameRecord.userId, meId), eq(gameRecord.gameId, gameId));

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

						const myBestRecord = myBestRows[0] ?? null;

						if (myBestRecord) {
							// Rank = (#records that strictly outrank me) + 1.
							// Same score + earlier createdAt beats me; identical
							// timestamps fall back to id ordering.
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
								.where(eq(user.id, meId))
								.limit(1);

							const rank = Number(better[0]?.value ?? 0) + 1;

							return {
								items,
								me: {
									rank,
									user: { id: meId, name: meNameRow[0]?.name ?? "" },
									record: {
										...myBestRecord,
										durationSeconds: readDurationSeconds(myBestRecord.metrics),
									},
								},
							};
						}
					}
				}

				return { items, me: null };
			} catch (err) {
				console.error("[leaderboard.list]", err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to load leaderboard",
					cause: err,
				});
			}
		}),
});
