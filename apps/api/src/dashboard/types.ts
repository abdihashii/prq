import type { DashboardResponse, PullRequest, RequestedReviewer } from '@prq/shared'
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
}

export interface StoredDashboardState {
  ownedRepositories: StoredRepository[]
  pullRequests: StoredPullRequest[]
}

export interface DashboardStore {
  load(viewer: AuthenticatedViewer): Promise<StoredDashboardState>
}

export interface DashboardProjectionService {
  getDashboard(args: {
    viewer: AuthenticatedViewer
    repositoryAllowlist: ReadonlySet<string>
  }): Promise<DashboardResponse>
}

export interface DashboardAuthorization {
  refresh(
    principal: AuthenticatedPrincipal,
    now: Date,
  ): Promise<AuthorizedRepository[]>
}

export interface DashboardReconciler {
  reconcile(
    repository: AuthorizedRepository,
    principal: AuthenticatedPrincipal,
    now: Date,
  ): Promise<void>
}

export interface DashboardFacade {
  getDashboard(args: {
    principal: AuthenticatedPrincipal
    repositoryAllowlist: ReadonlySet<string>
  }): Promise<DashboardResponse>
}
