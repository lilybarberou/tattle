ALTER TABLE "report" ADD COLUMN "release" text;--> statement-breakpoint
CREATE INDEX "report_project_release_idx" ON "report" USING btree ("project_id","release");