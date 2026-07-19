import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const ANALYTICS_EVENT_TYPES = [
	"page_view",
	"click",
	"performance",
	"error",
	"visibility",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const behaviorEvent = pgTable(
	"behavior_event",
	{
		id: text("id").primaryKey(),
		eventType: text("event_type", { enum: ANALYTICS_EVENT_TYPES }).notNull(),
		eventName: text("event_name").notNull(),
		sessionId: text("session_id").notNull(),
		anonymousId: text("anonymous_id").notNull(),
		userId: text("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		path: text("path").notNull(),
		title: text("title"),
		referrer: text("referrer"),
		target: text("target"),
		properties: jsonb("properties")
			.$type<Record<string, string | number | boolean | null>>()
			.notNull()
			.default({}),
		durationMs: integer("duration_ms"),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("behavior_event_created_at_idx").on(table.createdAt),
		index("behavior_event_type_created_at_idx").on(
			table.eventType,
			table.createdAt,
		),
		index("behavior_event_path_created_at_idx").on(table.path, table.createdAt),
		index("behavior_event_session_idx").on(table.sessionId),
		index("behavior_event_user_idx").on(table.userId, table.createdAt),
	],
);
