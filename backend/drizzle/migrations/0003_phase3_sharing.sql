ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ("role" IN ('owner', 'editor', 'viewer'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"permission" text DEFAULT 'view' NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_permission_check" CHECK ("permission" IN ('view'))
);
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_page_id_idx" ON "share_links" ("page_id");
