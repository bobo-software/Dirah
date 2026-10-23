CREATE TABLE IF NOT EXISTS "task_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"icon" text,
	"mode" text DEFAULT 'checklist' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT IF EXISTS "task_lists_mode_check";
--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_mode_check" CHECK ("mode" IN ('checklist'));
--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT IF EXISTS "task_lists_visibility_check";
--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_visibility_check" CHECK ("visibility" IN ('private', 'workspace'));
--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT IF EXISTS "task_lists_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_lists" DROP CONSTRAINT IF EXISTS "task_lists_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_lists_workspace_id_idx" ON "task_lists" ("workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"text" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_list_items" DROP CONSTRAINT IF EXISTS "task_list_items_list_id_task_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "task_list_items" ADD CONSTRAINT "task_list_items_list_id_task_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."task_lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_list_items" DROP CONSTRAINT IF EXISTS "task_list_items_checked_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_list_items" ADD CONSTRAINT "task_list_items_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_list_items_list_id_position_idx" ON "task_list_items" ("list_id", "position");
