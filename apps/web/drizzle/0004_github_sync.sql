ALTER TABLE "project" ADD COLUMN "github_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "github_secret" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "github_last_delivery_at" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "github_last_delivery" text;