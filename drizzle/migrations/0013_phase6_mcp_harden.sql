ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "mcp_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"token_id" uuid,
	"tool" text NOT NULL,
	"node_id" uuid,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_token_id_mcp_tokens_id_fk"
  FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_audit_user_created_idx" ON "mcp_audit" ("user_id", "created_at");
