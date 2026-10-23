ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'note' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_kind_check";
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_kind_check" CHECK ("kind" IN ('note', 'kanban'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kanban_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kanban_columns" DROP CONSTRAINT IF EXISTS "kanban_columns_board_id_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_board_id_notes_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_columns_board_id_idx" ON "kanban_columns" ("board_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kanban_cards" (
	"board_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kanban_cards_board_id_note_id_pk" PRIMARY KEY("board_id","note_id")
);
--> statement-breakpoint
ALTER TABLE "kanban_cards" DROP CONSTRAINT IF EXISTS "kanban_cards_board_id_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_board_id_notes_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kanban_cards" DROP CONSTRAINT IF EXISTS "kanban_cards_note_id_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kanban_cards" DROP CONSTRAINT IF EXISTS "kanban_cards_column_id_kanban_columns_id_fk";
--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_column_id_kanban_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_cards_column_id_idx" ON "kanban_cards" ("column_id");
