ALTER TABLE "issue_vote" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "chat_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "detected_locale" text;--> statement-breakpoint
-- Reports sent before: the widget and the React Native SDK put the device's
-- language in device.language ("fr-FR", "en"…).
UPDATE "report" SET "locale" = CASE WHEN lower("device"->>'language') LIKE 'fr%' THEN 'fr' ELSE 'en' END WHERE "device" ? 'language';
