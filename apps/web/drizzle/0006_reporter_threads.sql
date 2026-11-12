CREATE TABLE "report_message" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"author_type" text NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "identity_secret" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "reporter_key_hash" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "verified_user_id" text;--> statement-breakpoint
ALTER TABLE "report_message" ADD CONSTRAINT "report_message_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_message_report_idx" ON "report_message" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "report_reporter_key_idx" ON "report" USING btree ("project_id","reporter_key_hash");--> statement-breakpoint
CREATE INDEX "report_verified_user_idx" ON "report" USING btree ("project_id","verified_user_id");