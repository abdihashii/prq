ALTER TYPE "public"."auto_retarget_status" ADD VALUE 'pending' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "public"."auto_retarget_status" ADD VALUE 'applying' BEFORE 'succeeded';--> statement-breakpoint
ALTER TABLE "auto_retarget_events" DROP CONSTRAINT "auto_retarget_events_github_pull_request_id_pull_requests_github_pull_request_id_fk";
--> statement-breakpoint
ALTER TABLE "auto_retarget_events" ALTER COLUMN "github_pull_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_retarget_events" ALTER COLUMN "previous_base_ref_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_retarget_events" ADD CONSTRAINT "auto_retarget_events_github_pull_request_id_pull_requests_github_pull_request_id_fk" FOREIGN KEY ("github_pull_request_id") REFERENCES "public"."pull_requests"("github_pull_request_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_retarget_events_parent_succeeded_unique" ON "auto_retarget_events" USING btree ("parent_github_pull_request_id") WHERE "auto_retarget_events"."status" = 'succeeded';