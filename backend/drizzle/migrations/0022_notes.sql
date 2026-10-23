CREATE TABLE IF NOT EXISTS "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"icon" text,
	"cover" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"pinned_at" timestamp with time zone,
	"content" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_visibility_check" CHECK ("visibility" IN ('private', 'workspace'))
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_id_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("search_text", ''))) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_workspace_author_deleted_idx" ON "notes" ("workspace_id", "author_id", "deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_workspace_visibility_deleted_idx" ON "notes" ("workspace_id", "visibility", "deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_parent_id_idx" ON "notes" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_search_tsv_idx" ON "notes" USING GIN ("search_tsv");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "note_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "note_tags_workspace_name_idx" ON "note_tags" ("workspace_id", lower("name"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "note_tag_links" (
	"note_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "note_tag_links_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "note_tag_links" ADD CONSTRAINT "note_tag_links_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note_tag_links" ADD CONSTRAINT "note_tag_links_tag_id_note_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."note_tags"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_tag_links_tag_id_idx" ON "note_tag_links" ("tag_id");
