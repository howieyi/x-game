import { protectedProcedure, publicProcedure, router } from "../index";

import { gameRouter } from "./game";
import { leaderboardRouter } from "./leaderboard";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	game: gameRouter,
	leaderboard: leaderboardRouter,
});
export type AppRouter = typeof appRouter;
