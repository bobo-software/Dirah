CREATE TABLE IF NOT EXISTS "oauth_mobile_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_mobile_codes" DROP CONSTRAINT IF EXISTS "oauth_mobile_codes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_mobile_codes" ADD CONSTRAINT "oauth_mobile_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_mobile_codes_code_hash_idx" ON "oauth_mobile_codes" ("code_hash");
