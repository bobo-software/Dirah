-- Deleting a workspace hides it at once and purges it 48 hours later.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_deleted_at_idx" ON "workspaces" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
