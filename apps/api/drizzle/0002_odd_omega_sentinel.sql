CREATE TABLE "github_user_repositories" (
	"github_user_id" text NOT NULL,
	"github_repository_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_user_repositories_pk" PRIMARY KEY("github_user_id","github_repository_id")
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "dashboard_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_user_repositories" ADD CONSTRAINT "github_user_repositories_github_user_id_github_users_github_id_fk" FOREIGN KEY ("github_user_id") REFERENCES "public"."github_users"("github_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_user_repositories" ADD CONSTRAINT "github_user_repositories_github_repository_id_repositories_github_repository_id_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."repositories"("github_repository_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_user_repositories_user_idx" ON "github_user_repositories" USING btree ("github_user_id");--> statement-breakpoint
CREATE INDEX "github_user_repositories_repository_idx" ON "github_user_repositories" USING btree ("github_repository_id");