import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const githubAccountTypeEnum = pgEnum('github_account_type', [
  'User',
  'Organization',
])

export const pullRequestStateEnum = pgEnum('pull_request_state', [
  'OPEN',
  'CLOSED',
  'MERGED',
])

export const reviewDecisionEnum = pgEnum('pull_request_review_decision', [
  'APPROVED',
  'CHANGES_REQUESTED',
  'REVIEW_REQUIRED',
])

export const mergeableStateEnum = pgEnum('pull_request_mergeable_state', [
  'MERGEABLE',
  'CONFLICTING',
  'UNKNOWN',
])

export const statusCheckStateEnum = pgEnum('status_check_state', [
  'SUCCESS',
  'PENDING',
  'FAILURE',
  'ERROR',
  'EXPECTED',
])

export const requestedReviewerKindEnum = pgEnum('requested_reviewer_kind', [
  'User',
  'Bot',
  'Mannequin',
  'Team',
])

export const pullRequestReviewStateEnum = pgEnum('pull_request_review_state', [
  'APPROVED',
  'CHANGES_REQUESTED',
  'COMMENTED',
  'DISMISSED',
  'PENDING',
])

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'received',
  'processed',
  'failed',
])

export const autoRetargetStatusEnum = pgEnum('auto_retarget_status', [
  'pending',
  'applying',
  'succeeded',
  'failed',
  'skipped',
])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const nullableTimestamp = (name: string) => timestamp(name, { withTimezone: true })

export const githubUsers = pgTable('github_users', {
  githubId: text('github_id').primaryKey(),
  login: text('login').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex('github_users_login_unique').on(table.login),
])

export const githubInstallations = pgTable('github_installations', {
  githubInstallationId: text('github_installation_id').primaryKey(),
  accountGithubId: text('account_github_id').notNull(),
  accountLogin: text('account_login').notNull(),
  accountType: githubAccountTypeEnum('account_type').notNull(),
  active: boolean('active').notNull().default(true),
  suspendedAt: nullableTimestamp('suspended_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('github_installations_account_github_id_idx').on(table.accountGithubId),
  index('github_installations_account_login_idx').on(table.accountLogin),
])

export const githubSessions = pgTable('github_sessions', {
  sessionIdHash: text('session_id_hash').primaryKey(),
  githubUserId: text('github_user_id').notNull().references(
    () => githubUsers.githubId,
    { onDelete: 'cascade' },
  ),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: nullableTimestamp('access_token_expires_at'),
  refreshTokenExpiresAt: nullableTimestamp('refresh_token_expires_at'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('github_sessions_user_idx').on(table.githubUserId),
  index('github_sessions_expires_at_idx').on(table.expiresAt),
])

export const repositories = pgTable('repositories', {
  githubRepositoryId: text('github_repository_id').primaryKey(),
  githubInstallationId: text('github_installation_id').references(
    () => githubInstallations.githubInstallationId,
    { onDelete: 'set null' },
  ),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  defaultBranch: text('default_branch'),
  private: boolean('private').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  dashboardReconciledAt: nullableTimestamp('dashboard_reconciled_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('repositories_installation_idx').on(table.githubInstallationId),
  uniqueIndex('repositories_owner_name_unique').on(table.owner, table.name),
])

export const githubUserRepositories = pgTable('github_user_repositories', {
  githubUserId: text('github_user_id').notNull().references(
    () => githubUsers.githubId,
    { onDelete: 'cascade' },
  ),
  githubRepositoryId: text('github_repository_id').notNull().references(
    () => repositories.githubRepositoryId,
    { onDelete: 'cascade' },
  ),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  primaryKey({
    columns: [table.githubUserId, table.githubRepositoryId],
    name: 'github_user_repositories_pk',
  }),
  index('github_user_repositories_user_idx').on(table.githubUserId),
  index('github_user_repositories_repository_idx').on(table.githubRepositoryId),
])

export const pullRequests = pgTable('pull_requests', {
  githubPullRequestId: text('github_pull_request_id').primaryKey(),
  githubRepositoryId: text('github_repository_id').notNull().references(
    () => repositories.githubRepositoryId,
    { onDelete: 'cascade' },
  ),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  authorLogin: text('author_login'),
  baseRefName: text('base_ref_name').notNull(),
  headRefName: text('head_ref_name').notNull(),
  headRepositoryOwner: text('head_repository_owner'),
  headRepositoryName: text('head_repository_name'),
  isDraft: boolean('is_draft').notNull().default(false),
  state: pullRequestStateEnum('state').notNull().default('OPEN'),
  reviewDecision: reviewDecisionEnum('review_decision'),
  mergeable: mergeableStateEnum('mergeable').notNull().default('UNKNOWN'),
  statusCheckRollupState: statusCheckStateEnum('status_check_rollup_state'),
  latestCommitCommittedAt: nullableTimestamp('latest_commit_committed_at'),
  githubUpdatedAt: timestamp('github_updated_at', { withTimezone: true }).notNull(),
  closedAt: nullableTimestamp('closed_at'),
  mergedAt: nullableTimestamp('merged_at'),
  commitsTotalCount: integer('commits_total_count').notNull().default(0),
  commentsTotalCount: integer('comments_total_count').notNull().default(0),
  unresolvedThreadCount: integer('unresolved_thread_count').notNull().default(0),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex('pull_requests_repository_number_unique').on(table.githubRepositoryId, table.number),
  index('pull_requests_author_login_idx').on(table.authorLogin),
  index('pull_requests_base_ref_idx').on(table.githubRepositoryId, table.baseRefName),
  index('pull_requests_head_ref_idx').on(
    table.headRepositoryOwner,
    table.headRepositoryName,
    table.headRefName,
  ),
  index('pull_requests_state_idx').on(table.state),
])

export const pullRequestReviewRequests = pgTable('pull_request_review_requests', {
  githubPullRequestId: text('github_pull_request_id').notNull().references(
    () => pullRequests.githubPullRequestId,
    { onDelete: 'cascade' },
  ),
  reviewerKind: requestedReviewerKindEnum('reviewer_kind').notNull(),
  reviewerHandle: text('reviewer_handle').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  primaryKey({
    columns: [table.githubPullRequestId, table.reviewerKind, table.reviewerHandle],
    name: 'pull_request_review_requests_pk',
  }),
  index('pull_request_review_requests_reviewer_idx').on(
    table.reviewerKind,
    table.reviewerHandle,
  ),
])

export const pullRequestReviews = pgTable('pull_request_reviews', {
  githubReviewId: text('github_review_id').primaryKey(),
  githubPullRequestId: text('github_pull_request_id').notNull().references(
    () => pullRequests.githubPullRequestId,
    { onDelete: 'cascade' },
  ),
  authorLogin: text('author_login'),
  state: pullRequestReviewStateEnum('state').notNull(),
  submittedAt: nullableTimestamp('submitted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('pull_request_reviews_pull_request_idx').on(table.githubPullRequestId),
  index('pull_request_reviews_author_idx').on(table.authorLogin),
])

export const webhookDeliveries = pgTable('webhook_deliveries', {
  deliveryId: text('delivery_id').primaryKey(),
  event: text('event').notNull(),
  action: text('action'),
  githubInstallationId: text('github_installation_id').references(
    () => githubInstallations.githubInstallationId,
    { onDelete: 'set null' },
  ),
  githubRepositoryId: text('github_repository_id').references(
    () => repositories.githubRepositoryId,
    { onDelete: 'set null' },
  ),
  status: webhookDeliveryStatusEnum('status').notNull().default('received'),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: nullableTimestamp('processed_at'),
  errorMessage: text('error_message'),
}, table => [
  index('webhook_deliveries_event_idx').on(table.event),
  index('webhook_deliveries_installation_idx').on(table.githubInstallationId),
  index('webhook_deliveries_repository_idx').on(table.githubRepositoryId),
])

export const autoRetargetEvents = pgTable('auto_retarget_events', {
  id: serial('id').primaryKey(),
  githubPullRequestId: text('github_pull_request_id').references(
    () => pullRequests.githubPullRequestId,
    { onDelete: 'set null' },
  ),
  parentGithubPullRequestId: text('parent_github_pull_request_id').references(
    () => pullRequests.githubPullRequestId,
    { onDelete: 'set null' },
  ),
  deliveryId: text('delivery_id').references(
    () => webhookDeliveries.deliveryId,
    { onDelete: 'set null' },
  ),
  previousBaseRefName: text('previous_base_ref_name'),
  nextBaseRefName: text('next_base_ref_name').notNull(),
  status: autoRetargetStatusEnum('status').notNull(),
  errorMessage: text('error_message'),
  createdAt: createdAt(),
}, table => [
  index('auto_retarget_events_pull_request_idx').on(table.githubPullRequestId),
  index('auto_retarget_events_parent_pull_request_idx').on(table.parentGithubPullRequestId),
  index('auto_retarget_events_delivery_idx').on(table.deliveryId),
  uniqueIndex('auto_retarget_events_parent_succeeded_unique')
    .on(table.parentGithubPullRequestId)
    .where(sql`${table.status} = 'succeeded'`),
])
