ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'page';
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_kind_check";
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_kind_check" CHECK ("kind" IN ('page', 'folder', 'markdown'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pages_live_slug_parent"
  ON "pages" (
    "workspace_id",
    COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "slug"
  )
  WHERE "deleted_at" IS NULL AND "slug" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markdown_bodies" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markdown_bodies" ADD CONSTRAINT "markdown_bodies_page_id_pages_id_fk"
  FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
