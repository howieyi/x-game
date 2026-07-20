-- Drop legacy indexes that reference soon-to-be-nullable columns.
DROP INDEX "game_record_user_theme_idx";--> statement-breakpoint
DROP INDEX "game_record_theme_moves_seconds_idx";--> statement-breakpoint

-- Relax NOT NULL on columns that are no longer required for non-memory-match rows.
ALTER TABLE "game_record" ALTER COLUMN "theme" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_record" ALTER COLUMN "moves" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_record" ALTER COLUMN "seconds" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_record" ALTER COLUMN "stars" DROP NOT NULL;--> statement-breakpoint

-- Add the new platform columns. `DEFAULT` is required so the ALTER succeeds
-- against pre-existing rows; it is dropped below once backfill completes.
ALTER TABLE "game_record" ADD COLUMN "game_id" text DEFAULT 'memory-match' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_record" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_record" ADD COLUMN "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- Backfill historical rows: every existing record is a memory-match game.
-- Score is recomputed from the legacy formula so leaderboard ordering stays
-- stable across the schema cutover. The legacy metrics are mirrored into the
-- jsonb blob so the frontend can keep reading them without a second query.
UPDATE "game_record"
SET "score" = GREATEST(0, 10000 - "moves" * 100 - "seconds" * 10);--> statement-breakpoint

UPDATE "game_record"
SET "metrics" = jsonb_build_object(
  'theme', "theme",
  'moves', "moves",
  'seconds', "seconds",
  'stars', "stars"
)
WHERE "theme" IS NOT NULL;--> statement-breakpoint

-- Drop the temporary defaults. New writes must supply gameId/score explicitly.
ALTER TABLE "game_record" ALTER COLUMN "game_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "game_record" ALTER COLUMN "score" DROP DEFAULT;--> statement-breakpoint

-- New indexes for the platform-wide query patterns.
CREATE INDEX "game_record_user_game_idx" ON "game_record" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "game_record_game_score_idx" ON "game_record" USING btree ("game_id","score");--> statement-breakpoint
CREATE INDEX "game_record_user_game_theme_idx" ON "game_record" USING btree ("user_id","game_id","theme");