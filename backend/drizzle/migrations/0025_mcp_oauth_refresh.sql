ALTER TABLE "mcp_tokens" DROP CONSTRAINT IF EXISTS "mcp_tokens_user_oauth_client";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_user_oauth_client_active" ON "mcp_tokens" USING btree ("user_id","oauth_client_id") WHERE "mcp_tokens"."revoked_at" is null;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "resource" text;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "scope" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_refresh_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"token_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"resource" text,
	"scope" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" DROP CONSTRAINT IF EXISTS "mcp_oauth_refresh_tokens_token_id_mcp_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_token_id_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" DROP CONSTRAINT IF EXISTS "mcp_oauth_refresh_tokens_client_id_mcp_oauth_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_client_id_mcp_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" DROP CONSTRAINT IF EXISTS "mcp_oauth_refresh_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_refresh_tokens_token_idx" ON "mcp_oauth_refresh_tokens" USING btree ("token_id");
