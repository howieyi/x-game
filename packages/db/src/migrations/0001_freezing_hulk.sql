CREATE TABLE "behavior_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_name" text NOT NULL,
	"session_id" text NOT NULL,
	"anonymous_id" text NOT NULL,
	"user_id" text,
	"path" text NOT NULL,
	"title" text,
	"referrer" text,
	"target" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "behavior_event" ADD CONSTRAINT "behavior_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "behavior_event_created_at_idx" ON "behavior_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "behavior_event_type_created_at_idx" ON "behavior_event" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "behavior_event_path_created_at_idx" ON "behavior_event" USING btree ("path","created_at");--> statement-breakpoint
CREATE INDEX "behavior_event_session_idx" ON "behavior_event" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "behavior_event_user_idx" ON "behavior_event" USING btree ("user_id","created_at");