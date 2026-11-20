ALTER TABLE "mcp_tokens" ADD COLUMN IF NOT EXISTS "workspace_scope" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_workspace_scope_check" CHECK ("workspace_scope" in ('selected', 'all', 'all_read_only'));
