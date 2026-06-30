import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { user } from "@x-game/db/schema/auth";
import { gameRecord } from "@x-game/db/schema/game";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const leaderboardRouter = router({
	list: publicProcedure
		.input(
			z.object({
				theme: z.enum([
					"animals",
					"space",
					"food",
					"music",
					"ocean",
					"gems",
					"faces",
				]),
				limit: z.number().int().min(1).max(50).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb();
			const { theme, limit } = input;

			try {
				const topRows = await db
					.select({
						record: gameRecord,
						userId: user.id,
						userName: user.name,
					})
					.from(gameRecord)
					.innerJoin(user, eq(gameRecord.userId, user.id))
					.where(eq(gameRecord.theme, theme))
					.orderBy(
						asc(gameRecord.moves),
						asc(gameRecord.seconds),
						asc(gameRecord.createdAt),
						asc(gameRecord.id),
					)
					.limit(limit);

				const items = topRows.map((row, index) => ({
					rank: index + 1,
					user: { id: row.userId, name: row.userName },
					record: row.record,
				}));

				// If the caller is logged in and not in the top N, attach their
				// personal best for the theme and compute their rank.
				const session = ctx.session;
				if (session) {
					const meId = session.user.id;
					const inTop = items.some((row) => row.user.id === meId);

					if (!inTop) {
						// Pull the user's best record for this theme.
						const myBestRows = await db
							.select()
							.from(gameRecord)
							.where(
								and(eq(gameRecord.userId, meId), eq(gameRecord.theme, theme)),
							)
							.orderBy(
								asc(gameRecord.moves),
								asc(gameRecord.seconds),
								asc(gameRecord.createdAt),
								asc(gameRecord.id),
							)
							.limit(1);

						const myBestRecord = myBestRows[0] ?? null;

						if (myBestRecord) {
							// Count records that beat (moves, seconds, createdAt, id)
							// strictly better than the user's best.
							const better = await db
								.select({ value: sql<number>`count(*)` })
								.from(gameRecord)
								.leftJoin(user, eq(gameRecord.userId, user.id))
								.where(
									and(
										eq(gameRecord.theme, theme),
										or(
											sql`${gameRecord.moves} < ${myBestRecord.moves}`,
											and(
												eq(gameRecord.moves, myBestRecord.moves),
												sql`${gameRecord.seconds} < ${myBestRecord.seconds}`,
											),
											and(
												eq(gameRecord.moves, myBestRecord.moves),
												eq(gameRecord.seconds, myBestRecord.seconds),
												sql`${gameRecord.createdAt} < ${myBestRecord.createdAt}`,
											),
											and(
												eq(gameRecord.moves, myBestRecord.moves),
												eq(gameRecord.seconds, myBestRecord.seconds),
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
									record: myBestRecord,
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
