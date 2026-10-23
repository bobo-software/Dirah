ALTER TABLE "pages" ALTER COLUMN "kind" SET DEFAULT 'markdown';
--> statement-breakpoint
-- Remaining kind=page rows are converted by convertBlockPages() (migrate.ts / createApp),
-- which then drops doc_updates / doc_snapshots / doc_revisions and tightens pages_kind_check.
