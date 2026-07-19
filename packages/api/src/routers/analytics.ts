import { TRPCError } from "@trpc/server";
import { createDb } from "@x-game/db";
import { behaviorEvent } from "@x-game/db/schema/analytics";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

export const analyticsRouter = router({
	overview: protectedProcedure
		.input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
		.query(async ({ input }) => {
			const db = createDb();
			const since = new Date(Date.now() - input.days * 86_400_000);
			const range = gte(behaviorEvent.createdAt, since);

			try {
				const [summaryRows, trendRows, typeRows, pageRows, performanceRows] =
					await Promise.all([
						db
							.select({
								total: count(),
								sessions: sql<number>`count(distinct ${behaviorEvent.sessionId})`,
								visitors: sql<number>`count(distinct ${behaviorEvent.anonymousId})`,
								errors: sql<number>`count(*) filter (where ${behaviorEvent.eventType} = 'error')`,
							})
							.from(behaviorEvent)
							.where(range),
						db
							.select({
								day: sql<string>`to_char(date_trunc('day', ${behaviorEvent.createdAt}), 'MM-DD')`,
								events: count(),
								sessions: sql<number>`count(distinct ${behaviorEvent.sessionId})`,
							})
							.from(behaviorEvent)
							.where(range)
							.groupBy(sql`date_trunc('day', ${behaviorEvent.createdAt})`)
							.orderBy(sql`date_trunc('day', ${behaviorEvent.createdAt})`),
						db
							.select({ type: behaviorEvent.eventType, value: count() })
							.from(behaviorEvent)
							.where(range)
							.groupBy(behaviorEvent.eventType)
							.orderBy(desc(count())),
						db
							.select({
								path: behaviorEvent.path,
								views: count(),
								visitors: sql<number>`count(distinct ${behaviorEvent.anonymousId})`,
							})
							.from(behaviorEvent)
							.where(and(range, eq(behaviorEvent.eventType, "page_view")))
							.groupBy(behaviorEvent.path)
							.orderBy(desc(count()))
							.limit(8),
						db
							.select({
								name: behaviorEvent.eventName,
								average: sql<number>`avg((${behaviorEvent.properties}->>'value')::numeric)`,
								p75: sql<number>`percentile_cont(0.75) within group (order by (${behaviorEvent.properties}->>'value')::numeric)`,
							})
							.from(behaviorEvent)
							.where(and(range, eq(behaviorEvent.eventType, "performance")))
							.groupBy(behaviorEvent.eventName),
					]);

				const summary = summaryRows[0];
				return {
					summary: {
						total: Number(summary?.total ?? 0),
						sessions: Number(summary?.sessions ?? 0),
						visitors: Number(summary?.visitors ?? 0),
						errors: Number(summary?.errors ?? 0),
					},
					trend: trendRows.map((row) => ({
						...row,
						events: Number(row.events),
						sessions: Number(row.sessions),
					})),
					types: typeRows.map((row) => ({
						type: row.type,
						value: Number(row.value),
					})),
					pages: pageRows.map((row) => ({
						...row,
						views: Number(row.views),
						visitors: Number(row.visitors),
					})),
					performance: performanceRows.map((row) => ({
						name: row.name,
						average: Math.round(Number(row.average ?? 0) * 100) / 100,
						p75: Math.round(Number(row.p75 ?? 0) * 100) / 100,
					})),
				};
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
			const db = createDb();
			return db
				.select({
					id: behaviorEvent.id,
					eventType: behaviorEvent.eventType,
					eventName: behaviorEvent.eventName,
					path: behaviorEvent.path,
					target: behaviorEvent.target,
					createdAt: behaviorEvent.createdAt,
					properties: behaviorEvent.properties,
				})
				.from(behaviorEvent)
				.orderBy(desc(behaviorEvent.createdAt))
				.limit(input.limit);
		}),
});
