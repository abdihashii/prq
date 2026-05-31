CREATE TYPE "public"."auto_retarget_status" AS ENUM('succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."github_account_type" AS ENUM('User', 'Organization');--> statement-breakpoint
CREATE TYPE "public"."pull_request_mergeable_state" AS ENUM('MERGEABLE', 'CONFLICTING', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."pull_request_review_state" AS ENUM('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."pull_request_state" AS ENUM('OPEN', 'CLOSED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."requested_reviewer_kind" AS ENUM('User', 'Bot', 'Mannequin', 'Team');--> statement-breakpoint
CREATE TYPE "public"."pull_request_review_decision" AS ENUM('APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."status_check_state" AS ENUM('SUCCESS', 'PENDING', 'FAILURE', 'ERROR', 'EXPECTED');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "auto_retarget_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_pull_request_id" text NOT NULL,
	"parent_github_pull_request_id" text,
	"delivery_id" text,
	"previous_base_ref_name" text NOT NULL,
	"next_base_ref_name" text NOT NULL,
	"status" "auto_retarget_status" NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"github_installation_id" text PRIMARY KEY NOT NULL,
	"account_github_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" "github_account_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_users" (
	"github_id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_request_review_requests" (
	"github_pull_request_id" text NOT NULL,
	"reviewer_kind" "requested_reviewer_kind" NOT NULL,
	"reviewer_handle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_request_review_requests_pk" PRIMARY KEY("github_pull_request_id","reviewer_kind","reviewer_handle")
);
--> statement-breakpoint
CREATE TABLE "pull_request_reviews" (
	"github_review_id" text PRIMARY KEY NOT NULL,
	"github_pull_request_id" text NOT NULL,
	"author_login" text,
	"state" "pull_request_review_state" NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"github_pull_request_id" text PRIMARY KEY NOT NULL,
	"github_repository_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"author_login" text,
	"base_ref_name" text NOT NULL,
	"head_ref_name" text NOT NULL,
	"head_repository_owner" text,
	"head_repository_name" text,
	"is_draft" boolean DEFAULT false NOT NULL,
	"state" "pull_request_state" DEFAULT 'OPEN' NOT NULL,
	"review_decision" "pull_request_review_decision",
	"mergeable" "pull_request_mergeable_state" DEFAULT 'UNKNOWN' NOT NULL,
	"status_check_rollup_state" "status_check_state",
	"latest_commit_committed_at" timestamp with time zone,
	"github_updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"commits_total_count" integer DEFAULT 0 NOT NULL,
	"comments_total_count" integer DEFAULT 0 NOT NULL,
	"unresolved_thread_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"github_repository_id" text PRIMARY KEY NOT NULL,
	"github_installation_id" text,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text,
	"private" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"github_installation_id" text,
	"github_repository_id" text,
	"status" "webhook_delivery_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "auto_retarget_events" ADD CONSTRAINT "auto_retarget_events_github_pull_request_id_pull_requests_github_pull_request_id_fk" FOREIGN KEY ("github_pull_request_id") REFERENCES "public"."pull_requests"("github_pull_request_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_retarget_events" ADD CONSTRAINT "auto_retarget_events_parent_github_pull_request_id_pull_requests_github_pull_request_id_fk" FOREIGN KEY ("parent_github_pull_request_id") REFERENCES "public"."pull_requests"("github_pull_request_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_retarget_events" ADD CONSTRAINT "auto_retarget_events_delivery_id_webhook_deliveries_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("delivery_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_review_requests" ADD CONSTRAINT "pull_request_review_requests_github_pull_request_id_pull_requests_github_pull_request_id_fk" FOREIGN KEY ("github_pull_request_id") REFERENCES "public"."pull_requests"("github_pull_request_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_github_pull_request_id_pull_requests_github_pull_request_id_fk" FOREIGN KEY ("github_pull_request_id") REFERENCES "public"."pull_requests"("github_pull_request_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_github_repository_id_repositories_github_repository_id_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."repositories"("github_repository_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_github_installation_id_github_installations_github_installation_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("github_installation_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_github_installation_id_github_installations_github_installation_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("github_installation_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_github_repository_id_repositories_github_repository_id_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."repositories"("github_repository_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_retarget_events_pull_request_idx" ON "auto_retarget_events" USING btree ("github_pull_request_id");--> statement-breakpoint
CREATE INDEX "auto_retarget_events_parent_pull_request_idx" ON "auto_retarget_events" USING btree ("parent_github_pull_request_id");--> statement-breakpoint
CREATE INDEX "auto_retarget_events_delivery_idx" ON "auto_retarget_events" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "github_installations_account_github_id_idx" ON "github_installations" USING btree ("account_github_id");--> statement-breakpoint
CREATE INDEX "github_installations_account_login_idx" ON "github_installations" USING btree ("account_login");--> statement-breakpoint
CREATE UNIQUE INDEX "github_users_login_unique" ON "github_users" USING btree ("login");--> statement-breakpoint
CREATE INDEX "pull_request_review_requests_reviewer_idx" ON "pull_request_review_requests" USING btree ("reviewer_kind","reviewer_handle");--> statement-breakpoint
CREATE INDEX "pull_request_reviews_pull_request_idx" ON "pull_request_reviews" USING btree ("github_pull_request_id");--> statement-breakpoint
CREATE INDEX "pull_request_reviews_author_idx" ON "pull_request_reviews" USING btree ("author_login");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_repository_number_unique" ON "pull_requests" USING btree ("github_repository_id","number");--> statement-breakpoint
CREATE INDEX "pull_requests_author_login_idx" ON "pull_requests" USING btree ("author_login");--> statement-breakpoint
CREATE INDEX "pull_requests_base_ref_idx" ON "pull_requests" USING btree ("github_repository_id","base_ref_name");--> statement-breakpoint
CREATE INDEX "pull_requests_head_ref_idx" ON "pull_requests" USING btree ("head_repository_owner","head_repository_name","head_ref_name");--> statement-breakpoint
CREATE INDEX "pull_requests_state_idx" ON "pull_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "repositories_installation_idx" ON "repositories" USING btree ("github_installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_owner_name_unique" ON "repositories" USING btree ("owner","name");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event_idx" ON "webhook_deliveries" USING btree ("event");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_installation_idx" ON "webhook_deliveries" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_repository_idx" ON "webhook_deliveries" USING btree ("github_repository_id");