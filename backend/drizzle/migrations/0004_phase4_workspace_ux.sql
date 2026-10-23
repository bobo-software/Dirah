ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_favorites" (
	"user_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_favorites_user_id_page_id_pk" PRIMARY KEY("user_id","page_id")
);
--> statement-breakpoint
ALTER TABLE "page_favorites" ADD CONSTRAINT "page_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_favorites" ADD CONSTRAINT "page_favorites_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_workspace_id_deleted_at_idx" ON "pages" ("workspace_id", "deleted_at");
