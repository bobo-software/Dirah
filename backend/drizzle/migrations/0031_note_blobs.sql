CREATE TABLE IF NOT EXISTS "note_blobs" (
	"note_id" uuid NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE,
	"blob_id" text NOT NULL REFERENCES "blobs"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("note_id", "blob_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_blobs_blob_idx" ON "note_blobs" ("blob_id");
--> statement-breakpoint
-- A note's image gets its own blob even when the workspace already holds the same
-- bytes (so it can stay private to the note), so the hash is no longer unique.
-- BlobService still de-duplicates workspace uploads by hash.
DROP INDEX IF EXISTS "blobs_workspace_id_content_hash_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blobs_workspace_id_content_hash_idx" ON "blobs" ("workspace_id", "content_hash");
