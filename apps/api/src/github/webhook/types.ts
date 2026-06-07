export type GitHubAccountType = 'User' | 'Organization'
export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED'
export type PullRequestMergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
export type RequestedReviewerKind = 'User' | 'Bot' | 'Mannequin' | 'Team'
export type PullRequestReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING'

export interface InstallationSnapshot {
  githubInstallationId: string
  /** Account fields are either all present for an upsert or all absent for an ID-only update. */
  accountGithubId?: string
  accountLogin?: string
  accountType?: GitHubAccountType
  active?: boolean
  suspendedAt?: Date | null
}

export interface RepositorySnapshot {
  githubRepositoryId: string
  githubInstallationId: string
  owner: string
  name: string
  fullName: string
  defaultBranch?: string | null
  private?: boolean
  archived?: boolean
}

export interface PullRequestSnapshot {
  githubPullRequestId: string
  githubRepositoryId: string
  number: number
  title: string
  url: string
  authorLogin: string | null
  baseRefName: string
  headRefName: string
  headRepositoryOwner: string | null
  headRepositoryName: string | null
  isDraft: boolean
  state: PullRequestState
  mergeable?: PullRequestMergeableState
  githubUpdatedAt: Date
  closedAt: Date | null
  mergedAt: Date | null
  commitsTotalCount?: number
  commentsTotalCount?: number
}

export interface ReviewRequestSnapshot {
  reviewerKind: RequestedReviewerKind
  reviewerHandle: string
}

export interface PullRequestWithReviewRequests {
  pullRequest: PullRequestSnapshot
  reviewRequests?: ReviewRequestSnapshot[]
}

export interface ReviewSnapshot {
  githubReviewId: string
  githubPullRequestId: string
  authorLogin: string | null
  state: PullRequestReviewState
  submittedAt: Date | null
}

/**
 * A webhook sync plan describes the complete semantic state change for one
 * delivery. Applying a plan more than once has the same result, and mutation
 * order is intentionally hidden from payload handlers.
 */
export interface WebhookSyncPlan {
  installations: InstallationSnapshot[]
  repositories: RepositorySnapshot[]
  attachedRepositories: Array<{
    githubRepositoryId: string
    githubInstallationId: string
  }>
  detachedRepositoryIds: string[]
  deletedRepositoryIds: string[]
  pullRequests: PullRequestWithReviewRequests[]
  reviews: ReviewSnapshot[]
}

export interface WebhookDelivery {
  deliveryId: string
  event: string
  action: string | null
  payload: unknown
}

/**
 * The semantic store owns delivery idempotency and state-write ordering.
 * A processed delivery is immutable; received and failed deliveries may be
 * retried, and state plus the processed transition commit atomically.
 */
export interface WebhookStore {
  reserveDelivery: (delivery: WebhookDelivery) => Promise<void>
  applyDelivery: (
    deliveryId: string,
    syncPlan: WebhookSyncPlan,
    now: Date,
  ) => Promise<'processed' | 'duplicate'>
  markDeliveryFailed: (deliveryId: string, error: unknown, now: Date) => Promise<void>
}

export const emptySyncPlan = (): WebhookSyncPlan => ({
  installations: [],
  repositories: [],
  attachedRepositories: [],
  detachedRepositoryIds: [],
  deletedRepositoryIds: [],
  pullRequests: [],
  reviews: [],
})
