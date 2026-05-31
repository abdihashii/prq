import type { BucketedResponse, PullRequest } from '@prq/shared'
import type {
  DashboardDisplayBuckets,
  StackNode,
} from '@/lib/dashboard-display/dashboard-display'
import { flattenDisplayItems } from '@/lib/dashboard-display/dashboard-display'

const BASE: PullRequest = {
  id: 'PR_base',
  number: 1234,
  title: 'feat(web): add semantic color tokens for chromatic surfaces',
  url: 'https://github.com/example/repo/pull/1234',
  repository: { owner: 'example', name: 'repo' },
  headRepository: { owner: 'example', name: 'repo' },
  author: { login: 'octocat' },
  baseRefName: 'main',
  headRefName: 'feature/default-pr',
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
  const repository = overrides.repository ?? BASE.repository
  const headRepository = Object.hasOwn(overrides, 'headRepository')
    ? (overrides.headRepository ?? null)
    : repository

  return { ...BASE, headRepository, ...overrides }
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

const STACK_REPO = { owner: 'acme', name: 'checkout' }
const REVIEW_STACK_REPO = { owner: 'platform', name: 'control-plane' }

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

function displayBuckets(overrides: Partial<DashboardDisplayBuckets>): DashboardDisplayBuckets {
  return {
    review: [],
    attention: [],
    ready: [],
    waiting: [],
    drafts: [],
    ...overrides,
  }
}

function prItems(prs: PullRequest[]) {
  return prs.map((pr) => ({ kind: 'pr' as const, pr }))
}

function responseFromDisplayBuckets(displayItems: DashboardDisplayBuckets): BucketedResponse {
  return {
    ...BUCKETED_RESPONSE_POPULATED,
    buckets: {
      review: flattenDisplayItems(displayItems.review),
      attention: flattenDisplayItems(displayItems.attention),
      ready: flattenDisplayItems(displayItems.ready),
      waiting: flattenDisplayItems(displayItems.waiting),
      drafts: flattenDisplayItems(displayItems.drafts),
    },
  }
}

const DENSE_REVIEW_TITLES = [
  'feat(api): add installation sync cursor backfill',
  'fix(web): preserve selected repo filters on refresh',
  'refactor(shared): collapse status rollup formatting',
  'feat(worker): retry webhook deliveries after secondary limits',
  'fix(auth): clear stale device-flow cookies on 401',
  'docs: document GraphQL search pagination limits',
  'feat(web): show unavailable reviewers in queue rows',
  'test(api): cover review thread aggregation',
  'refactor(web): simplify settings drawer hydration',
  'fix(api): normalize mannequin review requests',
]

const DENSE_WAITING_TITLES = [
  'feat(web): extract dashboard notification effect',
  'feat(api): expose tracked repo candidates',
  'refactor(web): convert polling controls to select primitives',
  'fix(shared): keep unknown mergeability out of ready bucket',
  'feat(api): add rate limit observability payload',
  'test(web): cover token-health revoked session state',
  'docs: clarify local OAuth app setup',
  'chore(web): prune stale onboarding copy',
]

export const DENSE_REVIEW_BUCKET: PullRequest[] = DENSE_REVIEW_TITLES.map((title, index) => build({
  id: `PR_dense_review_${index}`,
  number: 5100 + index,
  title,
  repository: index % 2 === 0 ? { owner: 'acme', name: 'api' } : { owner: 'acme', name: 'web' },
  author: { login: ['nina', 'sam', 'maya', 'lee'][index % 4] },
  bucket: 'review',
  updatedAt: minutesAgo(8 + index * 11),
  statusCheckRollup: { state: (['SUCCESS', 'PENDING', 'FAILURE', 'SUCCESS'] as const)[index % 4] },
  commentsTotalCount: index % 3 === 0 ? 14 + index : index + 1,
  unresolvedThreadCount: index % 4 === 0 ? 2 : 0,
  unresolvedThreadAuthors: index % 4 === 0 ? ['nina'] : [],
  viewerIsRequestedReviewer: index % 3 !== 0,
  viewerHasReviewed: index % 3 === 0,
  needsRereview: index % 3 === 0,
}))

export const DENSE_ATTENTION_BUCKET: PullRequest[] = Array.from({ length: 5 }, (_, index) => build({
  id: `PR_dense_attention_${index}`,
  number: 5200 + index,
  title: [
    'feat(web): add dashboard stack affordance',
    'fix(api): honor ignored repos before bucketing',
    'refactor(shared): rename review attention helpers',
    'feat(web): persist dark mode before first paint',
    'test(api): cover bad credentials cleanup path',
  ][index],
  repository: { owner: 'octo-org', name: index % 2 === 0 ? 'prq' : 'infra' },
  bucket: 'attention',
  updatedAt: minutesAgo(18 + index * 23),
  reviewDecision: index % 2 === 0 ? 'CHANGES_REQUESTED' : null,
  statusCheckRollup: { state: index === 1 ? 'FAILURE' : 'SUCCESS' },
  commentsTotalCount: 6 + index,
  unresolvedThreadCount: index + 1,
  unresolvedThreadAuthors: ['reviewer-a', 'reviewer-b'].slice(0, index % 2 === 0 ? 1 : 2),
  newCommentsSincePush: index % 2 === 0 ? 0 : index + 1,
}))

export const DENSE_READY_BUCKET: PullRequest[] = Array.from({ length: 4 }, (_, index) => build({
  id: `PR_dense_ready_${index}`,
  number: 5300 + index,
  title: [
    'feat(web): split settings auth section',
    'fix(shared): stabilize relative-time formatting',
    'test(web): add notification badge coverage',
    'refactor(api): isolate GitHub error mapping',
  ][index],
  repository: { owner: 'octo-org', name: 'prq' },
  bucket: 'ready',
  updatedAt: minutesAgo(6 + index * 17),
  reviewDecision: 'APPROVED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 2 + index,
}))

export const DENSE_WAITING_BUCKET: PullRequest[] = DENSE_WAITING_TITLES.map((title, index) => build({
  id: `PR_dense_waiting_${index}`,
  number: 5400 + index,
  title,
  repository: { owner: 'octo-org', name: index % 2 === 0 ? 'prq' : 'docs' },
  bucket: 'waiting',
  updatedAt: minutesAgo(14 + index * 19),
  reviewDecision: 'REVIEW_REQUIRED',
  mergeable: index === 4 ? 'UNKNOWN' : 'MERGEABLE',
  statusCheckRollup: { state: index % 3 === 0 ? 'PENDING' : 'SUCCESS' },
  commentsTotalCount: index,
  requestedReviewers: [
    { kind: 'User', handle: ['alex', 'priya', 'marco'][index % 3] },
  ],
}))

export const DENSE_DRAFTS_BUCKET: PullRequest[] = Array.from({ length: 3 }, (_, index) => build({
  id: `PR_dense_draft_${index}`,
  number: 5500 + index,
  title: [
    'wip: prototype persisted dashboard filters',
    'wip: spike installation table sync',
    'wip: explore compact mobile bucket rows',
  ][index],
  repository: { owner: 'octo-org', name: 'prq' },
  bucket: 'drafts',
  isDraft: true,
  updatedAt: minutesAgo(33 + index * 31),
  statusCheckRollup: index === 0 ? { state: 'PENDING' } : null,
  commitsTotalCount: 2 + index * 3,
}))

const STACK_AUTH_BASE = build({
  id: 'PR_stack_auth_base',
  number: 6101,
  title: 'feat(auth): introduce installation session shell',
  repository: STACK_REPO,
  bucket: 'waiting',
  baseRefName: 'main',
  headRefName: 'feat/install-session-shell',
  updatedAt: minutesAgo(44),
  reviewDecision: 'REVIEW_REQUIRED',
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 5,
  requestedReviewers: [{ kind: 'User', handle: 'alex' }],
})

const STACK_AUTH_PERMISSIONS = build({
  id: 'PR_stack_auth_permissions',
  number: 6102,
  title: 'feat(auth): map installation permissions to viewer scope',
  repository: STACK_REPO,
  bucket: 'waiting',
  baseRefName: 'feat/install-session-shell',
  headRefName: 'feat/install-permissions',
  updatedAt: minutesAgo(31),
  reviewDecision: 'REVIEW_REQUIRED',
  statusCheckRollup: { state: 'PENDING' },
  commentsTotalCount: 2,
  requestedReviewers: [{ kind: 'User', handle: 'alex' }],
})

const STACK_AUTH_REPOS = build({
  id: 'PR_stack_auth_repos',
  number: 6103,
  title: 'feat(auth): filter repo picker by installation access',
  repository: STACK_REPO,
  bucket: 'waiting',
  baseRefName: 'feat/install-permissions',
  headRefName: 'feat/install-repo-filter',
  updatedAt: minutesAgo(19),
  reviewDecision: 'REVIEW_REQUIRED',
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 8,
  requestedReviewers: [{ kind: 'User', handle: 'alex' }],
})

const STACK_AUTH_AUDIT = build({
  id: 'PR_stack_auth_audit',
  number: 6104,
  title: 'feat(auth): add audit surface for installation changes',
  repository: STACK_REPO,
  bucket: 'waiting',
  baseRefName: 'feat/install-permissions',
  headRefName: 'feat/install-audit-surface',
  updatedAt: minutesAgo(11),
  reviewDecision: 'REVIEW_REQUIRED',
  statusCheckRollup: { state: 'EXPECTED' },
  commentsTotalCount: 1,
  requestedReviewers: [{ kind: 'User', handle: 'sam' }],
})

export const NESTED_STACK: StackNode = {
  pr: STACK_AUTH_BASE,
  children: [
    {
      pr: STACK_AUTH_PERMISSIONS,
      children: [
        { pr: STACK_AUTH_REPOS },
        { pr: STACK_AUTH_AUDIT },
      ],
    },
  ],
}

export const DISPLAY_BUCKETS_NESTED_STACKS = displayBuckets({
  waiting: [
    { kind: 'stack', root: NESTED_STACK },
    { kind: 'pr', pr: WAITING_PENDING },
  ],
  ready: [{ kind: 'pr', pr: READY_TO_MERGE }],
})

export const BUCKETED_RESPONSE_NESTED_STACKS = responseFromDisplayBuckets(DISPLAY_BUCKETS_NESTED_STACKS)

const REVIEW_STACK_BASE = build({
  id: 'PR_review_stack_base',
  number: 7201,
  title: 'feat(queue): expose batch review assignment model',
  repository: REVIEW_STACK_REPO,
  author: { login: 'teammate' },
  bucket: 'review',
  baseRefName: 'main',
  headRefName: 'feat/batch-review-assignment',
  updatedAt: minutesAgo(16),
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 3,
  viewerIsRequestedReviewer: true,
})

const REVIEW_STACK_CHILD = build({
  id: 'PR_review_stack_child',
  number: 7202,
  title: 'feat(queue): render reviewer workload preview',
  repository: REVIEW_STACK_REPO,
  author: { login: 'teammate' },
  bucket: 'review',
  baseRefName: 'feat/batch-review-assignment',
  headRefName: 'feat/reviewer-workload-preview',
  updatedAt: minutesAgo(9),
  statusCheckRollup: { state: 'FAILURE' },
  commentsTotalCount: 10,
  unresolvedThreadCount: 2,
  unresolvedThreadAuthors: ['octocat'],
  viewerIsRequestedReviewer: true,
})

const REVIEW_STACK_TOP = build({
  id: 'PR_review_stack_top',
  number: 7203,
  title: 'test(queue): cover reassignment when reviewers rotate',
  repository: REVIEW_STACK_REPO,
  author: { login: 'teammate' },
  bucket: 'review',
  baseRefName: 'feat/reviewer-workload-preview',
  headRefName: 'test/reviewer-rotation',
  updatedAt: minutesAgo(4),
  statusCheckRollup: { state: 'PENDING' },
  commentsTotalCount: 1,
  viewerHasReviewed: true,
  needsRereview: true,
})

export const REVIEW_STACK: StackNode = {
  pr: REVIEW_STACK_BASE,
  children: [
    {
      pr: REVIEW_STACK_CHILD,
      children: [{ pr: REVIEW_STACK_TOP }],
    },
  ],
}

export const DISPLAY_BUCKETS_REVIEW_STACKS = displayBuckets({
  review: [
    { kind: 'stack', root: REVIEW_STACK },
    { kind: 'pr', pr: REVIEW_REQUESTED_SUCCESS },
    { kind: 'pr', pr: REVIEW_RE_REVIEW_PENDING },
  ],
  attention: [{ kind: 'pr', pr: ATTENTION_CHANGES_REQUESTED }],
})

export const BUCKETED_RESPONSE_REVIEW_STACKS = responseFromDisplayBuckets(DISPLAY_BUCKETS_REVIEW_STACKS)

const AUTO_RETARGET_BASE = build({
  id: 'PR_auto_retarget_base',
  number: 8301,
  title: 'feat(dashboard): land stack-aware row grouping',
  repository: { owner: 'octo-org', name: 'prq' },
  bucket: 'ready',
  baseRefName: 'main',
  headRefName: 'feat/dashboard-stack-grouping',
  updatedAt: minutesAgo(27),
  reviewDecision: 'APPROVED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 4,
})

const AUTO_RETARGET_CHILD = build({
  id: 'PR_auto_retarget_child',
  number: 8302,
  title: 'feat(dashboard): preserve stack context after parent merge',
  repository: { owner: 'octo-org', name: 'prq' },
  bucket: 'ready',
  baseRefName: 'main',
  headRefName: 'feat/dashboard-stack-context',
  updatedAt: minutesAgo(7),
  reviewDecision: 'APPROVED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: { state: 'SUCCESS' },
  commentsTotalCount: 6,
})

export const AUTO_RETARGET_STACK: StackNode = {
  pr: AUTO_RETARGET_BASE,
  children: [
    {
      pr: AUTO_RETARGET_CHILD,
      autoRetarget: { previousBaseRefName: 'feat/dashboard-stack-grouping' },
    },
  ],
}

export const DISPLAY_BUCKETS_AUTO_RETARGET = displayBuckets({
  ready: [{ kind: 'stack', root: AUTO_RETARGET_STACK }],
  waiting: [{ kind: 'pr', pr: WAITING_PENDING }],
})

export const BUCKETED_RESPONSE_AUTO_RETARGET = responseFromDisplayBuckets(DISPLAY_BUCKETS_AUTO_RETARGET)

export const DISPLAY_BUCKETS_DENSE = displayBuckets({
  review: [
    { kind: 'stack', root: REVIEW_STACK },
    ...prItems(DENSE_REVIEW_BUCKET),
  ],
  attention: prItems(DENSE_ATTENTION_BUCKET),
  ready: [
    { kind: 'stack', root: AUTO_RETARGET_STACK },
    ...prItems(DENSE_READY_BUCKET),
  ],
  waiting: [
    { kind: 'stack', root: NESTED_STACK },
    ...prItems(DENSE_WAITING_BUCKET),
  ],
  drafts: prItems(DENSE_DRAFTS_BUCKET),
})

export const BUCKETED_RESPONSE_DENSE = responseFromDisplayBuckets(DISPLAY_BUCKETS_DENSE)
