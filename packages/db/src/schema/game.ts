import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const THEMES = [
	"animals",
	"space",
	"food",
	"music",
	"ocean",
	"gems",
	"faces",
] as const;
export type Theme = (typeof THEMES)[number];

export const gameRecord = pgTable(
	"game_record",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		theme: text("theme", { enum: THEMES }).notNull(),
		moves: integer("moves").notNull(),
		seconds: integer("seconds").notNull(),
		stars: integer("stars").notNull(),
		isNewBest: boolean("is_new_best").notNull().default(false),
		clientNonce: text("client_nonce").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("game_record_user_nonce_uniq").on(t.userId, t.clientNonce),
		index("game_record_user_theme_idx").on(t.userId, t.theme),
		index("game_record_theme_moves_seconds_idx").on(
			t.theme,
			t.moves,
			t.seconds,
		),
	],
);

export const gameRecordRelations = relations(gameRecord, ({ one }) => ({
	user: one(user, {
		fields: [gameRecord.userId],
		references: [user.id],
	}),
}));

// Reverse side of the user <-> gameRecord relation.
// Drizzle merges multiple `relations()` calls on the same table, so this
// extends the `userRelations` defined in `./auth` without modifying it.
export const userGameRecordsRelations = relations(user, ({ many }) => ({
	gameRecords: many(gameRecord),
}));
