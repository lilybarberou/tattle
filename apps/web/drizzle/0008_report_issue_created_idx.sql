-- The issue list reads the newest report of each issue: (issue_id, created_at)
-- serves it with one lookup per issue, and still serves lookups by issue_id
-- alone, so it replaces report_issue_idx. About 1.5 s per 300,000 reports,
-- during which new reports wait (no CONCURRENTLY inside a migration).
CREATE INDEX "report_issue_created_idx" ON "report" USING btree ("issue_id","created_at");--> statement-breakpoint
DROP INDEX "report_issue_idx";
