import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import {
	gameIdSchema,
	listTop,
	type LeaderboardDb,
	themeSchema,
} from "../services/leaderboard";

/**
 * Thin tRPC wrapper around the shared leaderboard service. The SQL / ranking
 * order lives in `services/leaderboard.ts` so MCP tools reuse the exact same
 * aggregation.
 */
export const leaderboardRouter = router({
	list: publicProcedure
		.input(
			z.object({
				gameId: gameIdSchema,
				theme: themeSchema.optional(),
				limit: z.number().int().min(1).max(50).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDb() as unknown as LeaderboardDb;
			const { gameId, theme, limit } = input;

			try {
				return await listTop(db, {
					gameId,
					theme,
					limit,
					callerUserId: ctx.session?.user.id,
				});
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
