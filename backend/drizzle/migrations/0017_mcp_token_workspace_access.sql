CREATE TABLE IF NOT EXISTS "mcp_token_workspace_access" (
	"token_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"can_write" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_token_workspace_access_pk" PRIMARY KEY("token_id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "mcp_token_workspace_access" ADD CONSTRAINT "mcp_token_workspace_access_token_id_mcp_tokens_id_fk"
  FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_token_workspace_access" ADD CONSTRAINT "mcp_token_workspace_access_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD COLUMN IF NOT EXISTS "oauth_client_id" text;
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_oauth_client_id_mcp_oauth_clients_id_fk"
  FOREIGN KEY ("oauth_client_id") REFERENCES "public"."mcp_oauth_clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_oauth_client"
  UNIQUE("user_id","oauth_client_id");
--> statement-breakpoint
INSERT INTO "mcp_token_workspace_access" ("token_id", "workspace_id", "can_write")
SELECT t.id, a.workspace_id, a.can_write
FROM "mcp_workspace_access" a
JOIN "mcp_tokens" t ON t.user_id = a.user_id AND t.revoked_at IS NULL
ON CONFLICT DO NOTHING;
