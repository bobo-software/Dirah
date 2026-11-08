-- 3D model stats on assets, and single-use upload links for MCP agents.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "vertex_count" integer;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "triangle_count" integer;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "bbox" jsonb;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "model_info" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"token_id" uuid,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"parent_id" uuid REFERENCES "pages"("id") ON DELETE SET NULL,
	"filename" text NOT NULL,
	"title" text,
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"asset_page_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_upload_intents_expires_idx" ON "asset_upload_intents" ("expires_at") WHERE "used_at" IS NULL;
