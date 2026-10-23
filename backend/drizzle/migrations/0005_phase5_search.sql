ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "search_text" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("search_text", ''))) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_search_tsv_idx" ON "pages" USING GIN ("search_tsv");
