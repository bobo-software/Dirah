ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_status_check";
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_status_check" CHECK ("status" IN ('', 'todo', 'doing', 'done'));
