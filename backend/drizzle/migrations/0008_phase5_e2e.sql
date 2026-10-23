CREATE TABLE IF NOT EXISTS "user_crypto" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"wrapped_private_key" text NOT NULL,
	"kdf_salt" text NOT NULL,
	"kdf_iterations" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_crypto" ADD CONSTRAINT "user_crypto_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_member_keys" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wrapped_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_keys_pk" PRIMARY KEY ("workspace_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_member_keys" ADD CONSTRAINT "workspace_member_keys_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_member_keys" ADD CONSTRAINT "workspace_member_keys_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "encrypted" boolean DEFAULT false NOT NULL;
