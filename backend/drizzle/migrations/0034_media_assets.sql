-- Media assets: images, video and audio kept as nodes in the docs tree
-- (pages.kind = 'asset'), so folders act as collections. One row per asset page.
ALTER TABLE "blobs" ALTER COLUMN "byte_size" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_kind_check";
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_kind_check" CHECK ("kind" IN ('folder', 'markdown', 'asset'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"page_id" uuid PRIMARY KEY NOT NULL REFERENCES "pages"("id") ON DELETE CASCADE,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"blob_id" text NOT NULL REFERENCES "blobs"("id") ON DELETE RESTRICT,
	"media_type" text NOT NULL,
	"mime" text NOT NULL,
	"ext" text NOT NULL,
	"original_name" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"fps" real,
	"has_audio" boolean,
	"thumbnail_blob_id" text REFERENCES "blobs"("id") ON DELETE SET NULL,
	"preview_blob_id" text REFERENCES "blobs"("id") ON DELETE SET NULL,
	"role" text NOT NULL DEFAULT 'other',
	"tags" text[] NOT NULL DEFAULT '{}',
	"description" text NOT NULL DEFAULT '',
	"prompt_hint" text NOT NULL DEFAULT '',
	"source_url" text,
	"license" text,
	"generation" jsonb,
	"status" text NOT NULL DEFAULT 'processing',
	"error" text,
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_workspace_idx" ON "assets" ("workspace_id", "media_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_tags_idx" ON "assets" USING gin ("tags");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_status_idx" ON "assets" ("status") WHERE "status" = 'processing';
