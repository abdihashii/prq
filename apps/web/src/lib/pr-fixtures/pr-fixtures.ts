import type { BucketedResponse, PullRequest } from '@prq/shared'

const BASE: PullRequest = {
  id: 'PR_base',
  number: 1234,
  title: 'feat(web): add semantic color tokens for chromatic surfaces',
  url: 'https://github.com/example/repo/pull/1234',
  repository: { owner: 'example', name: 'repo' },
  author: { login: 'octocat' },
  baseRefName: 'main',
  isDraft: false,
  updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  statusCheckRollup: { state: 'SUCCESS' },
  latestCommit: { committedDate: new Date(Date.now() - 18 * 60 * 1000).toISOString() },
  commitsTotalCount: 3,
  commentsTotalCount: 0,
  requestedReviewers: [],
  bucket: 'review',
  viewerHasReviewed: false,
  viewerLatestReviewSubmittedAt: null,
  viewerIsRequestedReviewer: true,
  needsRereview: false,
  newCommentsSincePush: 0,
  unresolvedThreadCount: 0,
  unresolvedThreadAuthors: [],
}

function build(overrides: Partial<PullRequest>): PullRequest {
  return { ...BASE, ...overrides }
}

export const REVIEW_REQUESTED_SUCCESS = build({
  id: 'PR_review_ok',
  number: 4201,
  title: 'feat(api): tokenize chromatic outputs for status icons',
  bucket: 'review',
  viewerIsRequestedReviewer: true,
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 4,
})

export const REVIEW_RE_REVIEW_PENDING = build({
  id: 'PR_review_rereview',
  number: 4180,
  title: 'refactor(web): split BucketSection from PrRow for cleaner stories',
  bucket: 'review',
  viewerHasReviewed: true,
  viewerLatestReviewSubmittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  needsRereview: true,
  statusCheckRollup: { state: 'PENDING' },
  commentsTotalCount: 12,
  unresolvedThreadCount: 2,
  unresolvedThreadAuthors: ['reviewer-a'],
})

export const REVIEW_REQUESTED_FAILURE = build({
  id: 'PR_review_fail',
  number: 4150,
  title: 'fix(api): handle 429 on token-health endpoint',
  bucket: 'review',
  statusCheckRollup: { state: 'FAILURE' },
  commentsTotalCount: 1,
})

export const REVIEW_NO_CI = build({
  id: 'PR_review_no_ci',
  number: 4101,
  title: 'docs: clarify PAT scopes for fine-grained tokens',
  bucket: 'review',
  statusCheckRollup: null,
  commentsTotalCount: 0,
})

export const ATTENTION_CHANGES_REQUESTED = build({
  id: 'PR_attn_changes',
  number: 4099,
  title: 'feat(web): add Storybook with theme decorator',
  bucket: 'attention',
  reviewDecision: 'CHANGES_REQUESTED',
  author: null,
  statusCheckRollup: { state: 'PENDING' },
  commentsTotalCount: 7,
  unresolvedThreadCount: 3,
  unresolvedThreadAuthors: ['lead-reviewer'],
})

export const ATTENTION_NEW_COMMENTS = build({
  id: 'PR_attn_comments',
  number: 4087,
  title: 'feat(shared): add bucket display config',
  bucket: 'attention',
  newCommentsSincePush: 4,
  commentsTotalCount: 9,
  statusCheckRollup: { state: 'SUCCESS' },
})

export const READY_TO_MERGE = build({
  id: 'PR_ready',
  number: 4055,
  title: 'feat(web): wire token-health query to settings panel',
  bucket: 'ready',
  reviewDecision: 'APPROVED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 6,
})

export const WAITING_PENDING = build({
  id: 'PR_waiting_pending',
  number: 4031,
  title: 'refactor(api): collapse mapGithubError duplication',
  bucket: 'waiting',
  reviewDecision: 'REVIEW_REQUIRED',
  statusCheckRollup: { state: 'PENDING' },
  commentsTotalCount: 2,
})

export const WAITING_CONFLICT = build({
  id: 'PR_waiting_conflict',
  number: 4011,
  title: 'feat(web): inline dashboard onboarding empty state',
  bucket: 'waiting',
  reviewDecision: 'REVIEW_REQUIRED',
  mergeable: 'CONFLICTING',
  statusCheckRollup: { state: 'SUCCESS' },
})

export const DRAFT = build({
  id: 'PR_draft',
  number: 3998,
  title: 'wip: explore token aliases for warning palette',
  bucket: 'drafts',
  isDraft: true,
  statusCheckRollup: null,
})

export const REVIEW_BUCKET: PullRequest[] = [
  REVIEW_REQUESTED_SUCCESS,
  REVIEW_RE_REVIEW_PENDING,
  REVIEW_REQUESTED_FAILURE,
  REVIEW_NO_CI,
]
export const ATTENTION_BUCKET: PullRequest[] = [
  ATTENTION_CHANGES_REQUESTED,
  ATTENTION_NEW_COMMENTS,
]
export const READY_BUCKET: PullRequest[] = [READY_TO_MERGE]
export const WAITING_BUCKET: PullRequest[] = [WAITING_PENDING, WAITING_CONFLICT]
export const DRAFTS_BUCKET: PullRequest[] = [DRAFT]

const SYNCED_AT = new Date(Date.now() - 30 * 1000).toISOString()
const RESET_AT = new Date(Date.now() + 45 * 60 * 1000).toISOString()

export const BUCKETED_RESPONSE_POPULATED: BucketedResponse = {
  buckets: {
    review: REVIEW_BUCKET,
    attention: ATTENTION_BUCKET,
    ready: READY_BUCKET,
    waiting: WAITING_BUCKET,
    drafts: DRAFTS_BUCKET,
  },
  viewerLogin: 'octocat',
  syncedAt: SYNCED_AT,
  rateLimit: { cost: 1, remaining: 4998, resetAt: RESET_AT },
  trackableRepos: [],
}

export const BUCKETED_RESPONSE_MIXED: BucketedResponse = {
  ...BUCKETED_RESPONSE_POPULATED,
  buckets: {
    review: REVIEW_BUCKET,
    attention: [],
    ready: READY_BUCKET,
    waiting: [],
    drafts: DRAFTS_BUCKET,
  },
}

export const BUCKETED_RESPONSE_EMPTY: BucketedResponse = {
  ...BUCKETED_RESPONSE_POPULATED,
  buckets: { review: [], attention: [], ready: [], waiting: [], drafts: [] },
}
