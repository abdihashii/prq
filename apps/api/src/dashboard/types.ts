import type { DashboardResponse, Installation, PullRequest, RequestedReviewer } from '@prq/shared'
import type { AuthenticatedPrincipal, AuthenticatedViewer } from '../auth/session'

export interface AuthorizedRepository {
  githubRepositoryId: string
  githubInstallationId: string
  owner: string
  name: string
  dashboardReconciledAt: Date | null
}

export interface StoredRepository {
  owner: string
  name: string
}

export interface StoredPullRequest {
  id: string
  number: number
  title: string
  url: string
  repository: StoredRepository
  headRepository: StoredRepository | null
  authorLogin: string | null
  baseRefName: string
  headRefName: string
  isDraft: boolean
  updatedAt: Date
  reviewDecision: PullRequest['reviewDecision']
  mergeable: PullRequest['mergeable']
  statusCheckRollupState: NonNullable<PullRequest['statusCheckRollup']>['state'] | null
  latestCommitCommittedAt: Date | null
  commitsTotalCount: number
  commentsTotalCount: number
  unresolvedThreadCount: number
  requestedReviewers: RequestedReviewer[]
  viewerReviewSubmittedAt: Array<Date | null>
  autoRetargetPreviousBaseRefName: string | null
}

export interface StoredDashboardState {
  ownedRepositories: StoredRepository[]
  installations: Installation[]
  pullRequests: StoredPullRequest[]
}

export interface DashboardStore {
  load(viewer: AuthenticatedViewer): Promise<StoredDashboardState>
}

export interface DashboardProjectionService {
  getDashboard(args: {
    viewer: AuthenticatedViewer
    // `null` means no filter: track every repo in install scope (All mode).
    repositoryAllowlist: ReadonlySet<string> | null
  }): Promise<DashboardResponse>
}

export interface DashboardAuthorization {
  refresh(
    principal: AuthenticatedPrincipal,
    now: Date,
  ): Promise<AuthorizedRepository[]>
}

/**
 * Carries only the GitHub bearer the reconciler's fetch layer needs, so the
 * GitHub layer no longer depends on a session-bound principal. The token may be a
 * user OAuth token (request path) or an App installation token (background cron).
 */
export interface GitHubTokenAuth {
  token: string
}

export interface DashboardReconciler {
  reconcile(
    repository: AuthorizedRepository,
    auth: GitHubTokenAuth,
    now: Date,
  ): Promise<void>
}

export interface DashboardFacade {
  getDashboard(args: {
    principal: AuthenticatedPrincipal
    // `null` means no filter: track every repo in install scope (All mode).
    repositoryAllowlist: ReadonlySet<string> | null
  }): Promise<DashboardResponse>
}
