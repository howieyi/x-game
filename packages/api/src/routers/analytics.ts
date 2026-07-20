import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	overview,
	recent,
	type AnalyticsDb,
} from "../services/analytics-aggregate";

/**
 * Thin tRPC wrapper. All aggregation SQL now lives in
 * `packages/api/src/services/analytics-aggregate.ts`, shared with the MCP
 * tools so both surfaces never drift.
 */
export const analyticsRouter = router({
	overview: protectedProcedure
		.input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
		.query(async ({ input }) => {
			const db = createDb() as unknown as AnalyticsDb;
			try {
				return await overview(db, { days: input.days });
			} catch (error) {
				console.error("[analytics.overview]", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "无法加载行为分析数据",
					cause: error,
				});
			}
		}),

	recent: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
		.query(async ({ input }) => {
			const db = createDb() as unknown as AnalyticsDb;
			return recent(db, { limit: input.limit });
		}),
});
