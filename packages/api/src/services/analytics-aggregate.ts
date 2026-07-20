import type { createDb } from "@x-game/db";
import { behaviorEvent } from "@x-game/db/schema/analytics";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";

/**
 * 行为埋点聚合 SQL,无状态、纯函数。原先住在 routers/analytics.ts 里,
 * 现在抽出来给 tRPC router 与 MCP tools 共享。
 *
 * 接收一个 Drizzle DB 实例——调用方(tRPC router / MCP tools)各自负责
 * 构造。返回结构与原 tRPC procedure 完全一致,前端代码不需要改。
 */

export type AnalyticsDb = Awaited<ReturnType<typeof createDb>>;

export interface AnalyticsOverviewResult {
	summary: { total: number; sessions: number; visitors: number; errors: number };
	trend: Array<{ day: string; events: number; sessions: number }>;
	types: Array<{ type: string; value: number }>;
	pages: Array<{ path: string; views: number; visitors: number }>;
	performance: Array<{ name: string; average: number; p75: number }>;
}

export async function overview(
	db: AnalyticsDb,
	{ days }: { days: number },
): Promise<AnalyticsOverviewResult> {
	const since = new Date(Date.now() - days * 86_400_000);
	const range = gte(behaviorEvent.createdAt, since);

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
}

export interface RecentRow {
	id: string;
	eventType: string;
	eventName: string;
	path: string | null;
	target: string | null;
	createdAt: Date;
	properties: unknown;
}

export async function recent(
	db: AnalyticsDb,
	{
		limit,
		eventType,
	}: {
		limit: number;
		eventType?: string;
	},
): Promise<RecentRow[]> {
	const where = eventType
		? and(sql`${behaviorEvent.eventType} = ${eventType}`)
		: undefined;
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
		.where(where)
		.orderBy(desc(behaviorEvent.createdAt))
		.limit(limit) as unknown as RecentRow[];
}

export interface ErrorSample {
	id: string;
	path: string | null;
	eventName: string;
	message: string | null;
	createdAt: Date;
}

export interface SearchErrorsResult {
	count: number;
	samples: ErrorSample[];
}

/**
 * Search `behavior_event` rows where `event_type = 'error'`, filtered by path
 * (substring) and an optional message substring inside `properties.message`.
 * Returns at most `limit` rows, but reports the total `count` separately.
 */
export async function searchErrors(
	db: AnalyticsDb,
	{
		sinceMinutes,
		pathLike,
		messageLike,
		limit,
	}: {
		sinceMinutes: number;
		pathLike?: string;
		messageLike?: string;
		limit: number;
	},
): Promise<SearchErrorsResult> {
	const since = new Date(Date.now() - sinceMinutes * 60_000);

	const baseWhere = and(
		eq(behaviorEvent.eventType, "error"),
		gte(behaviorEvent.createdAt, since),
	);

	const filters = [baseWhere];
	if (pathLike) {
		filters.push(sql`${behaviorEvent.path} ILIKE ${"%" + escapeLike(pathLike) + "%"}`);
	}
	if (messageLike) {
		filters.push(
			sql`(${behaviorEvent.properties}->>'message') ILIKE ${"%" + escapeLike(messageLike) + "%"}`,
		);
	}
	const where = and(...filters);

	const [countRows, sampleRows] = await Promise.all([
		db
			.select({ value: count() })
			.from(behaviorEvent)
			.where(where),
		db
			.select({
				id: behaviorEvent.id,
				path: behaviorEvent.path,
				eventName: behaviorEvent.eventName,
				message: sql<string | null>`${behaviorEvent.properties}->>'message'`,
				createdAt: behaviorEvent.createdAt,
			})
			.from(behaviorEvent)
			.where(where)
			.orderBy(desc(behaviorEvent.createdAt))
			.limit(limit),
	]);

	return {
		count: Number(countRows[0]?.value ?? 0),
		samples: sampleRows.map((row) => ({
			...row,
			message: row.message,
		})),
	};
}

/**
 * Escape LIKE wildcards inside a user-supplied substring. We pass the value
 * to PG via parameterised query (`sql\`... ILIKE ${...}\``), so SQL injection
 * is already prevented; this only escapes `%` and `_` so that user filters
 * don't accidentally match arbitrary text.
 */
function escapeLike(input: string): string {
	return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
