CREATE TABLE "notification_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"reporter_replied" boolean DEFAULT true NOT NULL,
	"assigned" boolean DEFAULT true NOT NULL,
	"regression" boolean DEFAULT true NOT NULL,
	"triage_digest" boolean,
	"ai_key_failing" boolean DEFAULT true NOT NULL,
	"webhook_failing" boolean DEFAULT true NOT NULL,
	"digest_day" text,
	"digest_covered_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "refused_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "last_refused_status" integer;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "refusal_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "team_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "emails_stopped_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "failure_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;