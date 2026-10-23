CREATE TABLE IF NOT EXISTS "doc_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"snapshot" bytea NOT NULL,
	"update_clock" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_revisions" ADD CONSTRAINT "doc_revisions_doc_id_pages_id_fk"
  FOREIGN KEY ("doc_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_revisions_doc_id_created_at_idx"
  ON "doc_revisions" ("doc_id", "created_at" DESC);
