CREATE TABLE IF NOT EXISTS "ticket_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text DEFAULT 'Untitled board' NOT NULL,
	"description" text,
	"next_number" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_boards" DROP CONSTRAINT IF EXISTS "ticket_boards_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_boards" ADD CONSTRAINT "ticket_boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_boards" DROP CONSTRAINT IF EXISTS "ticket_boards_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_boards" ADD CONSTRAINT "ticket_boards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_boards" DROP CONSTRAINT IF EXISTS "ticket_boards_key_check";
--> statement-breakpoint
ALTER TABLE "ticket_boards" ADD CONSTRAINT "ticket_boards_key_check" CHECK ("key" ~ '^[A-Z][A-Z0-9]{1,9}$');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_boards_workspace_key_idx" ON "ticket_boards" ("workspace_id", "key") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"category" text DEFAULT 'todo' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_statuses" DROP CONSTRAINT IF EXISTS "ticket_statuses_board_id_ticket_boards_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_board_id_ticket_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."ticket_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_statuses" DROP CONSTRAINT IF EXISTS "ticket_statuses_category_check";
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_category_check" CHECK ("category" IN ('todo', 'doing', 'done'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_statuses_board_id_idx" ON "ticket_statuses" ("board_id", "position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_groups" DROP CONSTRAINT IF EXISTS "ticket_groups_board_id_ticket_boards_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_groups" ADD CONSTRAINT "ticket_groups_board_id_ticket_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."ticket_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_groups_board_id_idx" ON "ticket_groups" ("board_id", "position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"due_date" date,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status_position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"search_text" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_board_id_ticket_boards_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_board_id_ticket_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."ticket_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_group_id_ticket_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_group_id_ticket_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ticket_groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_status_id_ticket_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_priority_check";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_check" CHECK ("priority" IN ('none', 'low', 'medium', 'high', 'urgent'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_board_number_idx" ON "tickets" ("board_id", "number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_group_position_idx" ON "tickets" ("group_id", "position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_status_position_idx" ON "tickets" ("status_id", "status_position");
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("search_text", ''))) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_search_tsv_idx" ON "tickets" USING GIN ("search_tsv");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_assignees" (
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_assignees_pk" PRIMARY KEY ("ticket_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_assignees" DROP CONSTRAINT IF EXISTS "ticket_assignees_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_assignees" DROP CONSTRAINT IF EXISTS "ticket_assignees_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_assignees_user_id_idx" ON "ticket_assignees" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_comments" DROP CONSTRAINT IF EXISTS "ticket_comments_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_comments" DROP CONSTRAINT IF EXISTS "ticket_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_comments_ticket_id_idx" ON "ticket_comments" ("ticket_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_activity" DROP CONSTRAINT IF EXISTS "ticket_activity_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_activity" DROP CONSTRAINT IF EXISTS "ticket_activity_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_activity_ticket_id_idx" ON "ticket_activity" ("ticket_id", "created_at");
