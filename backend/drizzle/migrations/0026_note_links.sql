CREATE TABLE IF NOT EXISTS "note_links" (
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "note_links_source_id_target_id_pk" PRIMARY KEY("source_id","target_id")
);
--> statement-breakpoint
ALTER TABLE "note_links" DROP CONSTRAINT IF EXISTS "note_links_source_id_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_source_id_notes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note_links" DROP CONSTRAINT IF EXISTS "note_links_target_id_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_target_id_notes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note_links" DROP CONSTRAINT IF EXISTS "note_links_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_links_target_id_idx" ON "note_links" ("target_id");
