ALTER TABLE "mcp_audit" ADD COLUMN IF NOT EXISTS "actor" text;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD COLUMN IF NOT EXISTS "statement_kind" text;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD COLUMN IF NOT EXISTS "sql_hash" text;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD COLUMN IF NOT EXISTS "row_count" integer;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD COLUMN IF NOT EXISTS "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD COLUMN IF NOT EXISTS "error_code" text;
