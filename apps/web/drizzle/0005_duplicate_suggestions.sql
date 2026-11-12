CREATE TABLE "ai_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"base_url" text,
	"model" text NOT NULL,
	"api_key_encrypted" text,
	"api_key_last4" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"suggested_issue_id" text NOT NULL,
	"source" text NOT NULL,
	"reason" text NOT NULL,
	"score" real,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_suggestion" ADD CONSTRAINT "duplicate_suggestion_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_suggestion" ADD CONSTRAINT "duplicate_suggestion_suggested_issue_id_issue_id_fk" FOREIGN KEY ("suggested_issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_suggestion_pair_idx" ON "duplicate_suggestion" USING btree ("issue_id","suggested_issue_id");--> statement-breakpoint
CREATE INDEX "duplicate_suggestion_suggested_idx" ON "duplicate_suggestion" USING btree ("suggested_issue_id");--> statement-breakpoint
CREATE INDEX "issue_search_idx" ON "issue" USING gin (to_tsvector('simple', "title" || ' ' || "description"));