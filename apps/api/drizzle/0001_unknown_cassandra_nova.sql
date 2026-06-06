CREATE TABLE "github_sessions" (
	"session_id_hash" text PRIMARY KEY NOT NULL,
	"github_user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_sessions" ADD CONSTRAINT "github_sessions_github_user_id_github_users_github_id_fk" FOREIGN KEY ("github_user_id") REFERENCES "public"."github_users"("github_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_sessions_user_idx" ON "github_sessions" USING btree ("github_user_id");--> statement-breakpoint
CREATE INDEX "github_sessions_expires_at_idx" ON "github_sessions" USING btree ("expires_at");