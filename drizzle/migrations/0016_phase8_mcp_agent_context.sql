ALTER TABLE "mcp_tokens" ADD COLUMN IF NOT EXISTS "default_workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_default_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("default_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "agent_index_path" text;
