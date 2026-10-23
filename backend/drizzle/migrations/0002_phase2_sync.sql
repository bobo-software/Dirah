CREATE TABLE IF NOT EXISTS "doc_updates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"update" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doc_snapshots" (
	"doc_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" bytea NOT NULL,
	"update_clock" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"mime" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_updates" ADD CONSTRAINT "doc_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "doc_updates" ADD CONSTRAINT "doc_updates_doc_id_pages_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "doc_snapshots" ADD CONSTRAINT "doc_snapshots_doc_id_pages_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_updates_doc_id_id_idx" ON "doc_updates" ("doc_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blobs_workspace_id_content_hash_idx" ON "blobs" ("workspace_id", "content_hash");
