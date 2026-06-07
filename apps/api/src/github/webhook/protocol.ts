import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  emptySyncPlan,
  type GitHubAccountType,
  type InstallationSnapshot,
  type PullRequestMergeableState,
  type PullRequestReviewState,
  type PullRequestSnapshot,
  type RepositorySnapshot,
  type ReviewRequestSnapshot,
  type WebhookDelivery,
  type WebhookSyncPlan,
} from './types'

const GitHubIdSchema = z.union([z.string().min(1), z.number().int()]).transform(String)
const NodeIdSchema = z.string().min(1)
const DateSchema = z.string().datetime({ offset: true }).transform(value => new Date(value))
const NullableDateSchema = z.string().datetime({ offset: true }).nullable().transform(
  value => value === null ? null : new Date(value),
)
const AccountTypeSchema = z.enum(['User', 'Organization'])

const AccountSchema = z.object({
  id: GitHubIdSchema,
  login: z.string().min(1),
  type: AccountTypeSchema,
})

const InstallationSchema = z.object({
  id: GitHubIdSchema,
  account: AccountSchema.nullable().optional(),
  suspended_at: NullableDateSchema.optional(),
})

const RepositoryOwnerSchema = z.object({
  id: GitHubIdSchema.optional(),
  login: z.string().min(1),
  type: AccountTypeSchema.optional(),
})

const RepositorySchema = z.object({
  node_id: NodeIdSchema,
  name: z.string().min(1),
  full_name: z.string().min(3),
  owner: RepositoryOwnerSchema.optional(),
  default_branch: z.string().nullable().optional(),
  private: z.boolean().optional(),
  archived: z.boolean().optional(),
})

const RequestedReviewerSchema = z.object({
  deleted: z.boolean().optional(),
  login: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  type: z.string().optional(),
}).nullable()

const RequestedTeamSchema = z.object({
  deleted: z.boolean().optional(),
  slug: z.string().min(1).optional(),
}).nullable()

const PullRequestSchema = z.object({
  node_id: NodeIdSchema,
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.string().url(),
  user: z.object({ login: z.string().min(1) }).nullable(),
  base: z.object({ ref: z.string().min(1) }),
  head: z.object({
    ref: z.string().min(1),
    repo: z.object({
      name: z.string().min(1),
      owner: z.object({ login: z.string().min(1) }),
    }).nullable(),
  }),
  draft: z.boolean().optional().default(false),
  state: z.enum(['open', 'closed']),
  merged: z.boolean().optional().default(false),
  mergeable: z.boolean().nullable().optional(),
  updated_at: DateSchema,
  closed_at: NullableDateSchema,
  merged_at: NullableDateSchema,
  commits: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  requested_reviewers: z.array(RequestedReviewerSchema).nullable().optional(),
  requested_teams: z.array(RequestedTeamSchema).nullable().optional(),
})

const ReviewSchema = z.object({
  node_id: NodeIdSchema,
  user: z.object({ login: z.string().min(1) }).nullable(),
  state: z.string().min(1),
  submitted_at: NullableDateSchema.optional().default(null),
})

const BasePayloadSchema = z.object({
  action: z.string().min(1).optional(),
  installation: InstallationSchema.optional(),
  repository: RepositorySchema.optional(),
})

const DeliveryActionSchema = z.object({
  action: z.string().min(1).optional(),
})
const InstallationPayloadSchema = BasePayloadSchema.extend({
  installation: InstallationSchema,
})

const InstallationEventPayloadSchema = InstallationPayloadSchema.extend({
  repositories: z.array(RepositorySchema).optional().default([]),
})

const InstallationRepositoriesPayloadSchema = InstallationPayloadSchema.extend({
  repositories_added: z.array(RepositorySchema).optional().default([]),
  repositories_removed: z.array(RepositorySchema).optional().default([]),
})

const RepositoryPayloadSchema = BasePayloadSchema.extend({
  installation: InstallationSchema,
  repository: RepositorySchema,
})

const PullRequestPayloadSchema = RepositoryPayloadSchema.extend({
  pull_request: PullRequestSchema,
})

const ReviewPayloadSchema = PullRequestPayloadSchema.extend({
  review: ReviewSchema,
})

const SUPPORTED_INSTALLATION_ACTIONS = new Set([
  'created',
  'deleted',
  'suspend',
  'unsuspend',
  'new_permissions_accepted',
])
const SUPPORTED_INSTALLATION_REPOSITORY_ACTIONS = new Set(['added', 'removed'])
const SUPPORTED_REPOSITORY_ACTIONS = new Set([
  'created',
  'deleted',
  'renamed',
  'transferred',
  'archived',
  'unarchived',
  'privatized',
  'publicized',
  'edited',
])
const SUPPORTED_PULL_REQUEST_ACTIONS = new Set([
  'assigned',
  'unassigned',
  'labeled',
  'unlabeled',
  'opened',
  'edited',
  'closed',
  'reopened',
  'synchronize',
  'converted_to_draft',
  'ready_for_review',
  'locked',
  'unlocked',
  'review_requested',
  'review_request_removed',
  'auto_merge_enabled',
  'auto_merge_disabled',
  'enqueued',
  'dequeued',
  'milestoned',
  'demilestoned',
])
const SUPPORTED_REVIEW_ACTIONS = new Set(['submitted', 'edited', 'dismissed'])
const ACTION_EVENTS = new Set([
  'installation',
  'installation_repositories',
  'repository',
  'pull_request',
  'pull_request_review',
])

export class WebhookRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 500,
  ) {
    super(message)
    this.name = 'WebhookRequestError'
  }
}

export function readWebhookHeaders(request: Request): {
  deliveryId: string
  event: string
  signature: string
} {
  const deliveryId = requiredHeader(request, 'x-github-delivery')
  const event = requiredHeader(request, 'x-github-event')
  const signature = requiredHeader(request, 'x-hub-signature-256')
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()

  if (mediaType !== 'application/json') {
    throw new WebhookRequestError('Content-Type must be application/json', 400)
  }
  if (!/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    throw new WebhookRequestError('X-Hub-Signature-256 is malformed', 400)
  }

  return { deliveryId, event, signature }
}

export function verifyWebhookSignature(body: Uint8Array, signature: string, secret: string): void {
  if (!secret) {
    throw new WebhookRequestError('GitHub webhook secret is not configured', 500)
  }

  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'hex')
  const actual = Buffer.from(signature.slice('sha256='.length), 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new WebhookRequestError('GitHub webhook signature is invalid', 401)
  }
}

export function parseWebhookJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  }
  catch {
    throw new WebhookRequestError('Request body must be valid UTF-8 JSON', 400)
  }
}

export function describeDelivery(
  deliveryId: string,
  event: string,
  payload: unknown,
): WebhookDelivery {
  const action = DeliveryActionSchema.safeParse(payload)
  return {
    deliveryId,
    event,
    action: action.success ? action.data.action ?? null : null,
    payload,
  }
}

export function normalizeWebhook(delivery: WebhookDelivery): WebhookSyncPlan {
  const action = delivery.action

  if (delivery.event === 'ping') return emptySyncPlan()
  if (!action) {
    if (ACTION_EVENTS.has(delivery.event)) {
      throw new WebhookRequestError('Supported GitHub webhook event is missing an action', 400)
    }
    return emptySyncPlan()
  }

  switch (delivery.event) {
    case 'installation':
      return SUPPORTED_INSTALLATION_ACTIONS.has(action)
        ? installationPlan(parseSupported(InstallationEventPayloadSchema, delivery.payload), action)
        : emptySyncPlan()
    case 'installation_repositories':
      return SUPPORTED_INSTALLATION_REPOSITORY_ACTIONS.has(action)
        ? installationRepositoriesPlan(
            parseSupported(InstallationRepositoriesPayloadSchema, delivery.payload),
            action,
          )
        : emptySyncPlan()
    case 'repository':
      return SUPPORTED_REPOSITORY_ACTIONS.has(action)
        ? repositoryPlan(parseSupported(RepositoryPayloadSchema, delivery.payload), action)
        : emptySyncPlan()
    case 'pull_request':
      return SUPPORTED_PULL_REQUEST_ACTIONS.has(action)
        ? pullRequestPlan(parseSupported(PullRequestPayloadSchema, delivery.payload))
        : emptySyncPlan()
    case 'pull_request_review':
      return SUPPORTED_REVIEW_ACTIONS.has(action)
        ? reviewPlan(parseSupported(ReviewPayloadSchema, delivery.payload))
        : emptySyncPlan()
    default:
      return emptySyncPlan()
  }
}

function installationPlan(
  payload: z.infer<typeof InstallationEventPayloadSchema>,
  action: string,
): WebhookSyncPlan {
  const installation = installationSnapshot(
    payload.installation,
    payload.repository ?? payload.repositories[0],
    action,
  )
  return {
    ...emptySyncPlan(),
    installations: [installation],
    repositories: action === 'created'
      ? payload.repositories.map(repo => repositorySnapshot(repo, installation.githubInstallationId))
      : [],
    attachedRepositories: action === 'created'
      ? payload.repositories.map(repo => ({
          githubRepositoryId: repo.node_id,
          githubInstallationId: installation.githubInstallationId,
        }))
      : [],
  }
}

function installationRepositoriesPlan(
  payload: z.infer<typeof InstallationRepositoriesPayloadSchema>,
  action: string,
): WebhookSyncPlan {
  const ownerRepository = payload.repositories_added[0] ?? payload.repositories_removed[0]
  const installation = installationSnapshot(payload.installation, ownerRepository)
  const added = action === 'added'
    ? payload.repositories_added.map(repo => repositorySnapshot(repo, installation.githubInstallationId))
    : []
  const removed = action === 'removed'
    ? payload.repositories_removed.map(repo => repo.node_id)
    : []

  return {
    ...emptySyncPlan(),
    installations: [installation],
    repositories: added,
    attachedRepositories: action === 'added'
      ? added.map(repository => ({
          githubRepositoryId: repository.githubRepositoryId,
          githubInstallationId: installation.githubInstallationId,
        }))
      : [],
    detachedRepositoryIds: removed,
  }
}

function repositoryPlan(
  payload: z.infer<typeof RepositoryPayloadSchema>,
  action: string,
): WebhookSyncPlan {
  const installation = installationSnapshot(payload.installation, payload.repository)

  return {
    ...emptySyncPlan(),
    installations: [installation],
    repositories: action === 'deleted'
      ? []
      : [repositorySnapshot(payload.repository, installation.githubInstallationId)],
    deletedRepositoryIds: action === 'deleted' ? [payload.repository.node_id] : [],
  }
}

function pullRequestPlan(
  payload: z.infer<typeof PullRequestPayloadSchema>,
): WebhookSyncPlan {
  const installation = installationSnapshot(
    payload.installation,
    payload.repository,
  )

  return {
    ...emptySyncPlan(),
    installations: [installation],
    repositories: [
      repositorySnapshot(payload.repository, installation.githubInstallationId),
    ],
    pullRequests: [{
      pullRequest: pullRequestSnapshot(payload.pull_request, payload.repository.node_id),
      reviewRequests: reviewRequestSnapshots(payload.pull_request),
    }],
  }
}

function reviewPlan(payload: z.infer<typeof ReviewPayloadSchema>): WebhookSyncPlan {
  const plan = pullRequestPlan(payload)
  const state = reviewState(payload.review.state)
  return {
    ...plan,
    reviews: [{
      githubReviewId: payload.review.node_id,
      githubPullRequestId: payload.pull_request.node_id,
      authorLogin: payload.review.user?.login ?? null,
      state,
      submittedAt: payload.review.submitted_at,
    }],
  }
}

function installationSnapshot(
  installation: z.infer<typeof InstallationSchema>,
  repository: z.infer<typeof RepositorySchema> | undefined,
  lifecycleAction?: string,
): InstallationSnapshot {
  const account = installation.account ?? accountFromRepository(repository)
  const suspendedAt = installation.suspended_at ?? null
  return {
    githubInstallationId: installation.id,
    ...(account
      ? {
          accountGithubId: account.id,
          accountLogin: account.login,
          accountType: account.type,
        }
      : {}),
    ...(lifecycleAction !== undefined
      ? {
          active: lifecycleAction !== 'deleted'
            && lifecycleAction !== 'suspend'
            && suspendedAt === null,
          suspendedAt,
        }
      : {}),
  }
}

function accountFromRepository(repository: z.infer<typeof RepositorySchema> | undefined): {
  id: string
  login: string
  type: GitHubAccountType
} | undefined {
  const owner = repository?.owner
  if (!owner?.id || !owner.type) return undefined
  return { id: owner.id, login: owner.login, type: owner.type }
}

function repositorySnapshot(
  repository: z.infer<typeof RepositorySchema>,
  githubInstallationId: string,
): RepositorySnapshot {
  const owner = repository.owner?.login ?? repository.full_name.split('/', 1)[0]
  if (!owner) {
    throw new WebhookRequestError('Supported payload repository owner is missing', 400)
  }
  return {
    githubRepositoryId: repository.node_id,
    githubInstallationId,
    owner,
    name: repository.name,
    fullName: repository.full_name,
    ...(repository.default_branch !== undefined
      ? { defaultBranch: repository.default_branch }
      : {}),
    ...(repository.private !== undefined ? { private: repository.private } : {}),
    ...(repository.archived !== undefined ? { archived: repository.archived } : {}),
  }
}

function pullRequestSnapshot(
  pullRequest: z.infer<typeof PullRequestSchema>,
  githubRepositoryId: string,
): PullRequestSnapshot {
  const mergeable = mergeableState(pullRequest.mergeable)
  return {
    githubPullRequestId: pullRequest.node_id,
    githubRepositoryId,
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.html_url,
    authorLogin: pullRequest.user?.login ?? null,
    baseRefName: pullRequest.base.ref,
    headRefName: pullRequest.head.ref,
    headRepositoryOwner: pullRequest.head.repo?.owner.login ?? null,
    headRepositoryName: pullRequest.head.repo?.name ?? null,
    isDraft: pullRequest.draft,
    state: pullRequest.merged ? 'MERGED' : pullRequest.state.toUpperCase() as 'OPEN' | 'CLOSED',
    ...(mergeable !== undefined ? { mergeable } : {}),
    githubUpdatedAt: pullRequest.updated_at,
    closedAt: pullRequest.closed_at,
    mergedAt: pullRequest.merged_at,
    ...(pullRequest.commits !== undefined ? { commitsTotalCount: pullRequest.commits } : {}),
    ...(pullRequest.comments !== undefined ? { commentsTotalCount: pullRequest.comments } : {}),
  }
}

function reviewRequestSnapshots(
  pullRequest: z.infer<typeof PullRequestSchema>,
): ReviewRequestSnapshot[] | undefined {
  if (pullRequest.requested_reviewers === undefined
    || pullRequest.requested_teams === undefined) {
    return undefined
  }
  return [
    ...(pullRequest.requested_reviewers ?? []).flatMap(reviewRequestSnapshot),
    ...(pullRequest.requested_teams ?? []).flatMap((team) => {
      if (!team?.slug || team.deleted) return []
      return [{ reviewerKind: 'Team' as const, reviewerHandle: team.slug }]
    }),
  ]
}

function reviewRequestSnapshot(
  reviewer: z.infer<typeof RequestedReviewerSchema>,
): ReviewRequestSnapshot[] {
  if (!reviewer || reviewer.deleted) return []
  if (reviewer.slug) return [{ reviewerKind: 'Team', reviewerHandle: reviewer.slug }]
  if (!reviewer.login) return []

  const reviewerKind = reviewer.type ?? 'User'
  switch (reviewerKind) {
    case 'User':
    case 'Bot':
    case 'Mannequin':
      return [{ reviewerKind, reviewerHandle: reviewer.login }]
    default:
      return []
  }
}

function mergeableState(value: boolean | null | undefined): PullRequestMergeableState | undefined {
  if (value === true) return 'MERGEABLE'
  if (value === false) return 'CONFLICTING'
  return undefined
}

function reviewState(value: string): PullRequestReviewState {
  switch (value.toLowerCase()) {
    case 'approved':
      return 'APPROVED'
    case 'changes_requested':
      return 'CHANGES_REQUESTED'
    case 'commented':
      return 'COMMENTED'
    case 'dismissed':
      return 'DISMISSED'
    case 'pending':
      return 'PENDING'
    default:
      throw new WebhookRequestError(`Unsupported pull request review state: ${value}`, 400)
  }
}

function parseSupported<T>(
  schema: z.ZodType<T>,
  payload: unknown,
): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new WebhookRequestError('Supported GitHub webhook payload is malformed', 400)
  }
  return result.data
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim()
  if (!value) throw new WebhookRequestError(`${name} header is required`, 400)
  return value
}
