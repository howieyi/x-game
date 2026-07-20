import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// ---------------------------------------------------------------------------
// Game registry
// ---------------------------------------------------------------------------
// `gameId` is the canonical identifier every platform game uses when writing
// records, querying leaderboards, or publishing events. Adding a new game is
// a two-step process: append its slug to `GAMES` and ship the corresponding
// client integration that submits `game.submit` with that id.

export const GAMES = [
	"memory-match",
	"arcade-2d",
	"arena-3d",
	"quantum-storm",
	"gravity-rift",
] as const;
export type GameId = (typeof GAMES)[number];

// ---------------------------------------------------------------------------
// Memory-match legacy dimensions (kept for backward compatibility)
// ---------------------------------------------------------------------------
// memory-match internally partitions records by `theme` (card deck). Other
// games leave this column null.

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

// Shape of the jsonb `metrics` blob per game. Kept loose on the DB side so a
// new game can ship without a schema migration; consumers narrow per game.
export type GameMetrics = Record<string, unknown>;

export const gameRecord = pgTable(
	"game_record",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		// Platform-wide game identifier (level-1 partition).
		gameId: text("game_id", { enum: GAMES }).notNull(),

		// Universal score: leaderboards always rank `score DESC`. Each game is
		// responsible for mapping its own outcome to a comparable number
		// (memory-match derives score from moves/seconds; arcade games submit
		// their in-game score directly).
		score: integer("score").notNull(),

		// Free-form per-game metrics. memory-match stores the legacy
		// {theme, moves, seconds, stars} tuple here so old data stays
		// introspectable; arcade games store their own shape.
		metrics: jsonb("metrics").$type<GameMetrics>().notNull().default({}),

		// memory-match secondary dimension. NULL for all other games.
		theme: text("theme", { enum: THEMES }),

		// Legacy memory-match columns — nullable now so non memory-match rows
		// can omit them. Reads still tolerate historical rows that populated
		// them; new writes leave them null in favor of `metrics`.
		moves: integer("moves"),
		seconds: integer("seconds"),
		stars: integer("stars"),

		isNewBest: boolean("is_new_best").notNull().default(false),
		clientNonce: text("client_nonce").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("game_record_user_nonce_uniq").on(t.userId, t.clientNonce),
		index("game_record_user_game_idx").on(t.userId, t.gameId),
		index("game_record_game_score_idx").on(t.gameId, t.score),
		index("game_record_user_game_theme_idx").on(t.userId, t.gameId, t.theme),
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
