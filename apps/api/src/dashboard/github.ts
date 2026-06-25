import { and, eq, isNull, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase, type Database } from '../db'
import { defaultFetch } from '../fetch'
import { mapWithConcurrency } from './concurrency'
import {
  githubInstallations,
  githubUserRepositories,
  githubUsers,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
} from '../db/schema'
import {
  DashboardBadCredentialsError,
  DashboardRateLimitedError,
  DashboardRepositoryGoneError,
  DashboardUpstreamError,
} from './errors'
import type {
  AuthorizedRepository,
  DashboardAuthorization,
  DashboardReconciler,
  GitHubTokenAuth,
} from './types'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = `${GITHUB_API_URL}/graphql`
const PAGE_SIZE = 100
const SCOPE_REFRESH_INTERVAL_MS = 10 * 60 * 1000
const INSTALLATION_CRAWL_CONCURRENCY = 4

const GitHubIdSchema = z.union([z.string().min(1), z.number().int()]).transform(String)
const DateSchema = z.string().datetime({ offset: true }).transform(value => new Date(value))
const NullableDateSchema = z.string().datetime({ offset: true }).nullable().transform(
  value => value === null ? null : new Date(value),
)
const AccountTypeSchema = z.enum(['User', 'Organization'])
const InstallationSchema = z.object({
  id: GitHubIdSchema,
  account: z.object({
    id: GitHubIdSchema,
    login: z.string().min(1),
    type: AccountTypeSchema,
  }),
  suspended_at: NullableDateSchema.optional(),
})
const RepositorySchema = z.object({
  node_id: z.string().min(1),
  name: z.string().min(1),
  full_name: z.string().min(3),
  owner: z.object({ login: z.string().min(1) }),
  default_branch: z.string().nullable(),
  private: z.boolean(),
  archived: z.boolean(),
})
const InstallationsPageSchema = z.object({
  total_count: z.number().int().nonnegative(),
  installations: z.array(InstallationSchema),
})
const RepositoriesPageSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(RepositorySchema),
})

interface InstallationSnapshot {
  githubInstallationId: string
  accountGithubId: string
  accountLogin: string
  accountType: 'User' | 'Organization'
  active: boolean
  suspendedAt: Date | null
}

interface RepositorySnapshot {
  githubRepositoryId: string
  githubInstallationId: string
  owner: string
  name: string
  fullName: string
  defaultBranch: string | null
  private: boolean
  archived: boolean
}

export interface DashboardAuthorizationStore {
  replaceSnapshot(args: {
    githubUserId: string
    installations: InstallationSnapshot[]
    repositories: RepositorySnapshot[]
    now: Date
  }): Promise<AuthorizedRepository[]>
  /**
   * Reads the persisted authorized scope without crawling GitHub: the
   * timestamp of the last scope refresh and the repositories already on record.
   */
  loadAuthorizedScope(githubUserId: string): Promise<{
    refreshedAt: Date | null
    repositories: AuthorizedRepository[]
  }>
}

type DashboardDbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export function createGitHubDashboardAuthorization(dependencies: {
  store?: DashboardAuthorizationStore
  fetch?: typeof fetch
} = {}): DashboardAuthorization {
  const store = dependencies.store ?? createDrizzleDashboardAuthorizationStore()
  const fetchImpl = dependencies.fetch ?? defaultFetch

  return {
    async refresh(principal, now) {
      // Gate the GitHub crawl on a freshness window: a null timestamp (never
      // refreshed, or invalidated after an app install) is treated as stale and
      // forces a crawl; otherwise read the persisted scope straight from the DB.
      const scope = await store.loadAuthorizedScope(principal.githubId)
      if (
        scope.refreshedAt !== null
        && now.getTime() - scope.refreshedAt.getTime() < SCOPE_REFRESH_INTERVAL_MS
      ) {
        return scope.repositories
      }

      // Crawl installations with bounded concurrency. GitHub asks that requests
      // for a single user be made serially-ish, not in an unbounded burst; a cap
      // keeps a many-installation user from tripping secondary rate limits.
      const installations = await fetchAllInstallations(principal.accessToken, fetchImpl)
      const repositorySnapshots = (await mapWithConcurrency(
        installations,
        INSTALLATION_CRAWL_CONCURRENCY,
        async (installation) => {
          const installationRepositories = await fetchAllInstallationRepositories(
            installation.githubInstallationId,
            principal.accessToken,
            fetchImpl,
          )
          return installationRepositories.map(repository => ({
            ...repository,
            githubInstallationId: installation.githubInstallationId,
          }))
        },
      )).flat()

      return store.replaceSnapshot({
        githubUserId: principal.githubId,
        installations,
        repositories: deduplicateRepositories(repositorySnapshots),
        now,
      })
    },
  }
}

export function createDrizzleDashboardAuthorizationStore(
  db: Database = getDatabase().db,
): DashboardAuthorizationStore {
  return {
    async replaceSnapshot(args) {
      return db.transaction(async (tx) => {
        for (const installation of args.installations) {
          await tx.insert(githubInstallations).values({
            ...installation,
            updatedAt: args.now,
          }).onConflictDoUpdate({
            target: githubInstallations.githubInstallationId,
            set: {
              accountGithubId: installation.accountGithubId,
              accountLogin: installation.accountLogin,
              accountType: installation.accountType,
              active: installation.active,
              suspendedAt: installation.suspendedAt,
              updatedAt: args.now,
            },
          })
        }

        for (const repository of args.repositories) {
          const [staleRepository] = await tx.select({
            githubRepositoryId: repositories.githubRepositoryId,
          }).from(repositories).where(and(
            eq(repositories.owner, repository.owner),
            eq(repositories.name, repository.name),
            ne(repositories.githubRepositoryId, repository.githubRepositoryId),
          )).limit(1).for('update', { of: repositories })
          if (staleRepository) {
            const historicalName
              = `${repository.name}#historical-${staleRepository.githubRepositoryId}`
            await tx.update(repositories).set({
              name: historicalName,
              fullName: `${repository.owner}/${historicalName}`,
              updatedAt: args.now,
            }).where(eq(repositories.githubRepositoryId, staleRepository.githubRepositoryId))
          }

          await tx.insert(repositories).values({
            ...repository,
            updatedAt: args.now,
          }).onConflictDoUpdate({
            target: repositories.githubRepositoryId,
            set: {
              githubInstallationId: repository.githubInstallationId,
              owner: repository.owner,
              name: repository.name,
              fullName: repository.fullName,
              defaultBranch: repository.defaultBranch,
              private: repository.private,
              archived: repository.archived,
              updatedAt: args.now,
            },
          })
        }

        if (args.repositories.length > 0) {
          await tx.insert(githubUserRepositories).values(args.repositories.map(repository => ({
            githubUserId: args.githubUserId,
            githubRepositoryId: repository.githubRepositoryId,
            updatedAt: args.now,
          }))).onConflictDoUpdate({
            target: [
              githubUserRepositories.githubUserId,
              githubUserRepositories.githubRepositoryId,
            ],
            set: { updatedAt: args.now },
          })
          await tx.delete(githubUserRepositories).where(and(
            eq(githubUserRepositories.githubUserId, args.githubUserId),
            notInArray(
              githubUserRepositories.githubRepositoryId,
              args.repositories.map(repository => repository.githubRepositoryId),
            ),
          ))
        }
        else {
          await tx.delete(githubUserRepositories)
            .where(eq(githubUserRepositories.githubUserId, args.githubUserId))
        }

        await tx.update(githubUsers)
          .set({ authorizedScopeRefreshedAt: args.now })
          .where(eq(githubUsers.githubId, args.githubUserId))

        return readAuthorizedRepositories(tx, args.githubUserId)
      })
    },

    async loadAuthorizedScope(githubUserId) {
      const [userRows, authorizedRepositories] = await Promise.all([
        db.select({ refreshedAt: githubUsers.authorizedScopeRefreshedAt })
          .from(githubUsers)
          .where(eq(githubUsers.githubId, githubUserId))
          .limit(1),
        readAuthorizedRepositories(db, githubUserId),
      ])
      return {
        refreshedAt: userRows[0]?.refreshedAt ?? null,
        repositories: authorizedRepositories,
      }
    },
  }
}

/**
 * Reads the viewer's authorized repositories (those linked to the user and
 * scoped to an active installation) straight from the database. Shared by the
 * post-write snapshot return and the gated read so the join is defined once.
 */
function readAuthorizedRepositories(
  executor: DashboardDbExecutor,
  githubUserId: string,
): Promise<AuthorizedRepository[]> {
  return executor.select({
    githubRepositoryId: repositories.githubRepositoryId,
    githubInstallationId: repositories.githubInstallationId,
    owner: repositories.owner,
    name: repositories.name,
    dashboardReconciledAt: repositories.dashboardReconciledAt,
  }).from(githubUserRepositories)
    .innerJoin(
      repositories,
      eq(githubUserRepositories.githubRepositoryId, repositories.githubRepositoryId),
    )
    .innerJoin(
      githubInstallations,
      eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
    )
    .where(and(
      eq(githubUserRepositories.githubUserId, githubUserId),
      eq(githubInstallations.active, true),
    ))
    .then(rows => rows.flatMap(row => row.githubInstallationId === null ? [] : [{
      ...row,
      githubInstallationId: row.githubInstallationId,
    }]))
}

async function fetchAllInstallations(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<InstallationSnapshot[]> {
  const values = await fetchRestPages({
    path: '/user/installations',
    accessToken,
    fetchImpl,
    schema: InstallationsPageSchema,
    items: page => page.installations,
    total: page => page.total_count,
  })
  return values.map(installation => ({
    githubInstallationId: installation.id,
    accountGithubId: installation.account.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    active: installation.suspended_at === null || installation.suspended_at === undefined,
    suspendedAt: installation.suspended_at ?? null,
  }))
}

async function fetchAllInstallationRepositories(
  installationId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<Omit<RepositorySnapshot, 'githubInstallationId'>[]> {
  const values = await fetchRestPages({
    path: `/user/installations/${encodeURIComponent(installationId)}/repositories`,
    accessToken,
    fetchImpl,
    schema: RepositoriesPageSchema,
    items: page => page.repositories,
    total: page => page.total_count,
  })
  return values.map(repository => ({
    githubRepositoryId: repository.node_id,
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    defaultBranch: repository.default_branch,
    private: repository.private,
    archived: repository.archived,
  }))
}

async function fetchRestPages<TPage, TItem>(args: {
  path: string
  accessToken: string
  fetchImpl: typeof fetch
  schema: z.ZodType<TPage>
  items: (page: TPage) => TItem[]
  total: (page: TPage) => number
}): Promise<TItem[]> {
  const values: TItem[] = []
  for (let page = 1; ; page += 1) {
    const url = new URL(`${GITHUB_API_URL}${args.path}`)
    url.searchParams.set('per_page', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    const body = await githubJson(url, args.accessToken, args.fetchImpl)
    const parsed = args.schema.safeParse(body)
    if (!parsed.success) throw new DashboardUpstreamError()
    const items = args.items(parsed.data)
    values.push(...items)
    if (values.length >= args.total(parsed.data) || items.length < PAGE_SIZE) return values
  }
}

function deduplicateRepositories(repositories: RepositorySnapshot[]): RepositorySnapshot[] {
  return [...new Map(repositories.map(repository => [
    repository.githubRepositoryId,
    repository,
  ])).values()]
}

const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
})
const RequestedReviewerSchema = z.object({
  __typename: z.string().min(1),
  login: z.string().min(1).nullable().optional(),
  slug: z.string().min(1).nullable().optional(),
})
const ReviewRequestNodeSchema = z.object({
  requestedReviewer: RequestedReviewerSchema.nullable(),
})
const ReviewNodeSchema = z.object({
  id: z.string().min(1),
  author: z.object({ login: z.string().min(1) }).nullable(),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']),
  submittedAt: NullableDateSchema,
})
const ReviewThreadNodeSchema = z.object({ isResolved: z.boolean() })
const ReviewRequestNodesSchema = z.array(ReviewRequestNodeSchema.nullable()).transform(
  nodes => nodes.filter((node): node is z.infer<typeof ReviewRequestNodeSchema> => node !== null),
)
const ReviewNodesSchema = z.array(ReviewNodeSchema.nullable()).transform(
  nodes => nodes.filter((node): node is z.infer<typeof ReviewNodeSchema> => node !== null),
)
const ReviewThreadNodesSchema = z.array(ReviewThreadNodeSchema.nullable()).transform(
  nodes => nodes.filter((node): node is z.infer<typeof ReviewThreadNodeSchema> => node !== null),
)
const PullRequestNodeSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  author: z.object({ login: z.string().min(1) }).nullable(),
  baseRefName: z.string().min(1),
  headRefName: z.string().min(1),
  headRepository: z.object({
    name: z.string().min(1),
    owner: z.object({ login: z.string().min(1) }),
  }).nullable(),
  isDraft: z.boolean(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
  statusCheckRollup: z.object({
    state: z.enum(['SUCCESS', 'PENDING', 'FAILURE', 'ERROR', 'EXPECTED']),
  }).nullable(),
  updatedAt: DateSchema,
  closedAt: NullableDateSchema,
  mergedAt: NullableDateSchema,
  commits: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(z.object({
      commit: z.object({ committedDate: DateSchema }),
    })),
  }),
  comments: z.object({ totalCount: z.number().int().nonnegative() }),
  reviewRequests: z.object({
    nodes: ReviewRequestNodesSchema,
    pageInfo: PageInfoSchema,
  }),
  reviews: z.object({
    nodes: ReviewNodesSchema,
    pageInfo: PageInfoSchema,
  }),
  reviewThreads: z.object({
    nodes: ReviewThreadNodesSchema,
    pageInfo: PageInfoSchema,
  }),
})
const OpenPullRequestsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequests: z.object({
        nodes: z.array(PullRequestNodeSchema),
        pageInfo: PageInfoSchema,
      }),
    }).nullable(),
  }),
})
const NestedPullRequestResponseSchema = z.object({
  data: z.object({
    node: z.object({
      reviewRequests: z.object({
        nodes: ReviewRequestNodesSchema,
        pageInfo: PageInfoSchema,
      }),
      reviews: z.object({
        nodes: ReviewNodesSchema,
        pageInfo: PageInfoSchema,
      }),
      reviewThreads: z.object({
        nodes: ReviewThreadNodesSchema,
        pageInfo: PageInfoSchema,
      }),
    }).nullable(),
  }),
})
const PullRequestStatesResponseSchema = z.object({
  data: z.object({
    nodes: z.array(z.object({
      id: z.string().min(1),
      state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
      updatedAt: DateSchema,
      closedAt: NullableDateSchema,
      mergedAt: NullableDateSchema,
    }).nullable()),
  }),
})

type PullRequestNode = z.infer<typeof PullRequestNodeSchema>
type ReviewRequestNode = z.infer<typeof ReviewRequestNodeSchema>
type ReviewNode = z.infer<typeof ReviewNodeSchema>

interface ReconciledPullRequest {
  pullRequest: PullRequestNode
  reviewRequests: ReviewRequestNode[]
  reviews: ReviewNode[]
  unresolvedThreadCount: number
}

interface MissingPullRequestState {
  id: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  updatedAt: Date
  closedAt: Date | null
  mergedAt: Date | null
}

export interface DashboardReconciliationStore {
  findOpenPullRequestIds(repositoryId: string): Promise<string[]>
  persist(args: {
    repository: AuthorizedRepository
    pullRequests: ReconciledPullRequest[]
    missingStates: MissingPullRequestState[]
    now: Date
  }): Promise<void>
  /**
   * Lists repositories due for a background reconcile: those on an active
   * installation, not archived, and never reconciled or last reconciled before
   * `staleBefore`. Ordered oldest-first (never-reconciled first) so a run that
   * hits `limit` still makes forward progress and cannot starve any repo.
   */
  listStaleRepositories(args: {
    staleBefore: Date
    limit: number
  }): Promise<AuthorizedRepository[]>
  /**
   * Retires a repository GitHub no longer resolves: archives the row (so the
   * stale-list and freshness queries skip it) and closes its still-open PRs (so
   * they drop off the dashboard), stamping the reconcile time.
   */
  markRepositoryGone(repository: AuthorizedRepository, now: Date): Promise<void>
}

export function createGitHubDashboardReconciler(dependencies: {
  store?: DashboardReconciliationStore
  fetch?: typeof fetch
} = {}): DashboardReconciler {
  const store = dependencies.store ?? createDrizzleDashboardReconciliationStore()
  const fetchImpl = dependencies.fetch ?? defaultFetch

  return {
    async reconcile(repository, auth, now) {
      const previouslyOpenIds = await store.findOpenPullRequestIds(repository.githubRepositoryId)
      let openPullRequests: ReconciledPullRequest[]
      try {
        openPullRequests = await fetchOpenPullRequests(repository, auth, fetchImpl)
      }
      catch (error) {
        // A deleted/transferred repo is terminal, not a sync failure: retire the row
        // (archive it, close its now-orphaned PRs) so it leaves the reconcile rotation.
        if (error instanceof DashboardRepositoryGoneError) {
          await store.markRepositoryGone(repository, now)
          return
        }
        throw error
      }
      const openIds = new Set(openPullRequests.map(entry => entry.pullRequest.id))
      const missingIds = previouslyOpenIds.filter(id => !openIds.has(id))
      const missingStates = await fetchPullRequestStates(missingIds, auth, fetchImpl)
      if (missingStates.length !== missingIds.length) throw new DashboardUpstreamError()
      await store.persist({ repository, pullRequests: openPullRequests, missingStates, now })
    },
  }
}

export function createDrizzleDashboardReconciliationStore(
  db: Database = getDatabase().db,
): DashboardReconciliationStore {
  return {
    async findOpenPullRequestIds(repositoryId) {
      return db.select({ id: pullRequests.githubPullRequestId })
        .from(pullRequests)
        .where(and(
          eq(pullRequests.githubRepositoryId, repositoryId),
          eq(pullRequests.state, 'OPEN'),
        ))
        .then(rows => rows.map(row => row.id))
    },

    async listStaleRepositories({ staleBefore, limit }) {
      return db.select({
        githubRepositoryId: repositories.githubRepositoryId,
        githubInstallationId: repositories.githubInstallationId,
        owner: repositories.owner,
        name: repositories.name,
        dashboardReconciledAt: repositories.dashboardReconciledAt,
      }).from(repositories)
        .innerJoin(
          githubInstallations,
          eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
        )
        .where(and(
          eq(githubInstallations.active, true),
          eq(repositories.archived, false),
          or(
            isNull(repositories.dashboardReconciledAt),
            lt(repositories.dashboardReconciledAt, staleBefore),
          ),
        ))
        .orderBy(sql`${repositories.dashboardReconciledAt} asc nulls first`)
        .limit(limit)
        .then(rows => rows.flatMap(row => row.githubInstallationId === null ? [] : [{
          ...row,
          githubInstallationId: row.githubInstallationId,
        }]))
    },

    async markRepositoryGone(repository, now) {
      await db.transaction(async (tx) => {
        await tx.update(pullRequests).set({
          state: 'CLOSED',
          closedAt: now,
          lastSyncedAt: now,
          updatedAt: now,
        }).where(and(
          eq(pullRequests.githubRepositoryId, repository.githubRepositoryId),
          eq(pullRequests.state, 'OPEN'),
        ))
        await tx.update(repositories).set({
          archived: true,
          dashboardReconciledAt: now,
          updatedAt: now,
        }).where(eq(repositories.githubRepositoryId, repository.githubRepositoryId))
      })
    },

    async persist(args) {
      await db.transaction(async (tx) => {
        for (const entry of args.pullRequests) {
          const pullRequest = entry.pullRequest
          const accepted = await tx.insert(pullRequests).values({
            githubPullRequestId: pullRequest.id,
            githubRepositoryId: args.repository.githubRepositoryId,
            number: pullRequest.number,
            title: pullRequest.title,
            url: pullRequest.url,
            authorLogin: pullRequest.author?.login ?? null,
            baseRefName: pullRequest.baseRefName,
            headRefName: pullRequest.headRefName,
            headRepositoryOwner: pullRequest.headRepository?.owner.login ?? null,
            headRepositoryName: pullRequest.headRepository?.name ?? null,
            isDraft: pullRequest.isDraft,
            state: pullRequest.state,
            reviewDecision: pullRequest.reviewDecision,
            mergeable: pullRequest.mergeable,
            statusCheckRollupState: pullRequest.statusCheckRollup?.state ?? null,
            latestCommitCommittedAt: pullRequest.commits.nodes[0]?.commit.committedDate ?? null,
            githubUpdatedAt: pullRequest.updatedAt,
            closedAt: pullRequest.closedAt,
            mergedAt: pullRequest.mergedAt,
            commitsTotalCount: pullRequest.commits.totalCount,
            commentsTotalCount: pullRequest.comments.totalCount,
            unresolvedThreadCount: entry.unresolvedThreadCount,
            lastSyncedAt: args.now,
            updatedAt: args.now,
          }).onConflictDoUpdate({
            target: pullRequests.githubPullRequestId,
            set: {
              githubRepositoryId: args.repository.githubRepositoryId,
              number: pullRequest.number,
              title: pullRequest.title,
              url: pullRequest.url,
              authorLogin: pullRequest.author?.login ?? null,
              baseRefName: pullRequest.baseRefName,
              headRefName: pullRequest.headRefName,
              headRepositoryOwner: pullRequest.headRepository?.owner.login ?? null,
              headRepositoryName: pullRequest.headRepository?.name ?? null,
              isDraft: pullRequest.isDraft,
              state: pullRequest.state,
              reviewDecision: pullRequest.reviewDecision,
              mergeable: pullRequest.mergeable,
              statusCheckRollupState: pullRequest.statusCheckRollup?.state ?? null,
              latestCommitCommittedAt: pullRequest.commits.nodes[0]?.commit.committedDate ?? null,
              githubUpdatedAt: pullRequest.updatedAt,
              closedAt: pullRequest.closedAt,
              mergedAt: pullRequest.mergedAt,
              commitsTotalCount: pullRequest.commits.totalCount,
              commentsTotalCount: pullRequest.comments.totalCount,
              unresolvedThreadCount: entry.unresolvedThreadCount,
              lastSyncedAt: args.now,
              updatedAt: args.now,
            },
            where: lte(pullRequests.githubUpdatedAt, pullRequest.updatedAt),
          }).returning({ id: pullRequests.githubPullRequestId })
          if (accepted.length === 0) continue

          await tx.delete(pullRequestReviewRequests).where(eq(
            pullRequestReviewRequests.githubPullRequestId,
            pullRequest.id,
          ))
          const reviewRequests = normalizeReviewRequests(entry.reviewRequests)
          if (reviewRequests.length > 0) {
            await tx.insert(pullRequestReviewRequests).values(reviewRequests.map(request => ({
              githubPullRequestId: pullRequest.id,
              ...request,
              updatedAt: args.now,
            }))).onConflictDoNothing()
          }

          await tx.delete(pullRequestReviews).where(eq(
            pullRequestReviews.githubPullRequestId,
            pullRequest.id,
          ))
          if (entry.reviews.length > 0) {
            await tx.insert(pullRequestReviews).values(entry.reviews.map(review => ({
              githubReviewId: review.id,
              githubPullRequestId: pullRequest.id,
              authorLogin: review.author?.login ?? null,
              state: review.state,
              submittedAt: review.submittedAt,
              updatedAt: args.now,
            }))).onConflictDoNothing()
          }
        }

        for (const state of args.missingStates) {
          await tx.update(pullRequests).set({
            state: state.state,
            githubUpdatedAt: state.updatedAt,
            closedAt: state.closedAt,
            mergedAt: state.mergedAt,
            lastSyncedAt: args.now,
            updatedAt: args.now,
          }).where(and(
            eq(pullRequests.githubRepositoryId, args.repository.githubRepositoryId),
            eq(pullRequests.githubPullRequestId, state.id),
            lte(pullRequests.githubUpdatedAt, state.updatedAt),
          ))
        }

        await tx.update(repositories).set({
          dashboardReconciledAt: args.now,
          updatedAt: args.now,
        }).where(eq(repositories.githubRepositoryId, args.repository.githubRepositoryId))
      })
    },
  }
}

async function fetchOpenPullRequests(
  repository: AuthorizedRepository,
  auth: GitHubTokenAuth,
  fetchImpl: typeof fetch,
): Promise<ReconciledPullRequest[]> {
  const values: ReconciledPullRequest[] = []
  let cursor: string | null = null
  do {
    const parsed = OpenPullRequestsResponseSchema.parse(await githubGraphql({
      query: OPEN_PULL_REQUESTS_QUERY,
      variables: {
        owner: repository.owner,
        name: repository.name,
        cursor,
      },
      auth,
      fetchImpl,
    }))
    // A clean response with repository === null means the repo no longer resolves
    // (deleted/transferred); the schema makes pullRequests present whenever
    // repository is, so a null connection is exactly that terminal case.
    const connection = parsed.data.repository?.pullRequests
    if (!connection) throw new DashboardRepositoryGoneError()
    for (const pullRequest of connection.nodes) {
      const nested = await fetchRemainingNested(pullRequest, auth, fetchImpl)
      values.push({
        pullRequest,
        reviewRequests: nested.reviewRequests,
        reviews: nested.reviews,
        unresolvedThreadCount: nested.reviewThreads.filter(thread => !thread.isResolved).length,
      })
    }
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null
    if (connection.pageInfo.hasNextPage && cursor === null) throw new DashboardUpstreamError()
  } while (cursor !== null)
  return values
}

async function fetchRemainingNested(
  pullRequest: PullRequestNode,
  auth: GitHubTokenAuth,
  fetchImpl: typeof fetch,
) {
  const reviewRequests = [...pullRequest.reviewRequests.nodes]
  const reviews = [...pullRequest.reviews.nodes]
  const reviewThreads = [...pullRequest.reviewThreads.nodes]
  let requestsCursor = nextCursor(pullRequest.reviewRequests.pageInfo)
  let reviewsCursor = nextCursor(pullRequest.reviews.pageInfo)
  let threadsCursor = nextCursor(pullRequest.reviewThreads.pageInfo)

  while (requestsCursor !== null || reviewsCursor !== null || threadsCursor !== null) {
    const parsed = NestedPullRequestResponseSchema.parse(await githubGraphql({
      query: NESTED_PULL_REQUEST_QUERY,
      variables: {
        id: pullRequest.id,
        requestsCursor,
        reviewsCursor,
        threadsCursor,
      },
      auth,
      fetchImpl,
    }))
    const node = parsed.data.node
    if (!node) throw new DashboardUpstreamError()
    if (requestsCursor !== null) reviewRequests.push(...node.reviewRequests.nodes)
    if (reviewsCursor !== null) reviews.push(...node.reviews.nodes)
    if (threadsCursor !== null) reviewThreads.push(...node.reviewThreads.nodes)
    requestsCursor = requestsCursor === null ? null : nextCursor(node.reviewRequests.pageInfo)
    reviewsCursor = reviewsCursor === null ? null : nextCursor(node.reviews.pageInfo)
    threadsCursor = threadsCursor === null ? null : nextCursor(node.reviewThreads.pageInfo)
  }

  return { reviewRequests, reviews, reviewThreads }
}

async function fetchPullRequestStates(
  ids: string[],
  auth: GitHubTokenAuth,
  fetchImpl: typeof fetch,
): Promise<MissingPullRequestState[]> {
  const values: MissingPullRequestState[] = []
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const parsed = PullRequestStatesResponseSchema.parse(await githubGraphql({
      query: PULL_REQUEST_STATES_QUERY,
      variables: { ids: ids.slice(offset, offset + PAGE_SIZE) },
      auth,
      fetchImpl,
    }))
    values.push(...parsed.data.nodes.flatMap(node => node === null ? [] : [node]))
  }
  return values
}

function nextCursor(pageInfo: z.infer<typeof PageInfoSchema>): string | null {
  if (!pageInfo.hasNextPage) return null
  if (pageInfo.endCursor === null) throw new DashboardUpstreamError()
  return pageInfo.endCursor
}

function normalizeReviewRequests(nodes: ReviewRequestNode[]): Array<{
  reviewerKind: 'User' | 'Bot' | 'Mannequin' | 'Team'
  reviewerHandle: string
}> {
  return nodes.flatMap((node) => {
    const reviewer = node.requestedReviewer
    if (reviewer === null) return []
    const reviewerKind = reviewer.__typename === 'Team'
      ? 'Team'
      : reviewer.__typename === 'Bot'
        ? 'Bot'
        : reviewer.__typename === 'Mannequin'
          ? 'Mannequin'
          : reviewer.__typename === 'User'
            ? 'User'
            : null
    const reviewerHandle = reviewer.__typename === 'Team' ? reviewer.slug : reviewer.login
    return reviewerKind && reviewerHandle ? [{ reviewerKind, reviewerHandle }] : []
  })
}

async function githubJson(
  url: URL,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, { headers: githubHeaders(accessToken) })
  }
  catch {
    throw new DashboardUpstreamError()
  }
  if (!response.ok) throw githubResponseError(response)
  return response.json().catch(() => {
    throw new DashboardUpstreamError()
  })
}

async function githubGraphql(args: {
  query: string
  variables: Record<string, unknown>
  auth: GitHubTokenAuth
  fetchImpl: typeof fetch
}): Promise<unknown> {
  let response: Response
  try {
    response = await args.fetchImpl(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        ...githubHeaders(args.auth.token),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: args.query, variables: args.variables }),
    })
  }
  catch {
    throw new DashboardUpstreamError()
  }
  if (!response.ok) throw githubResponseError(response)
  const body: unknown = await response.json().catch(() => null)
  if (
    body === null
    || typeof body !== 'object'
    || ('errors' in body && Array.isArray(body.errors) && body.errors.length > 0)
  ) {
    throw new DashboardUpstreamError()
  }
  return body
}

function githubResponseError(response: Response): Error {
  if (response.status === 401) return new DashboardBadCredentialsError()
  if (
    response.status === 429
    || (
      response.status === 403
      && (
        response.headers.get('x-ratelimit-remaining') === '0'
        || response.headers.has('retry-after')
      )
    )
  ) {
    return new DashboardRateLimitedError()
  }
  return new DashboardUpstreamError()
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'prq',
    'x-github-api-version': '2022-11-28',
  }
}

const OPEN_PULL_REQUESTS_QUERY = `
  query DashboardOpenPullRequests($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 100, after: $cursor, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          id number title url author { login } baseRefName headRefName
          headRepository { name owner { login } }
          isDraft state reviewDecision mergeable statusCheckRollup { state }
          updatedAt closedAt mergedAt
          commits(last: 1) { totalCount nodes { commit { committedDate } } }
          comments { totalCount }
          reviewRequests(first: 100) {
            nodes {
              requestedReviewer {
                __typename
                ... on User { login }
                ... on Bot { login }
                ... on Mannequin { login }
                ... on Team { slug }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
          reviews(first: 100) {
            nodes { id author { login } state submittedAt }
            pageInfo { hasNextPage endCursor }
          }
          reviewThreads(first: 100) {
            nodes { isResolved }
            pageInfo { hasNextPage endCursor }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

const NESTED_PULL_REQUEST_QUERY = `
  query DashboardPullRequestNested(
    $id: ID!,
    $requestsCursor: String,
    $reviewsCursor: String,
    $threadsCursor: String
  ) {
    node(id: $id) {
      ... on PullRequest {
        reviewRequests(first: 100, after: $requestsCursor) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login }
              ... on Bot { login }
              ... on Mannequin { login }
              ... on Team { slug }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
        reviews(first: 100, after: $reviewsCursor) {
          nodes { id author { login } state submittedAt }
          pageInfo { hasNextPage endCursor }
        }
        reviewThreads(first: 100, after: $threadsCursor) {
          nodes { isResolved }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`

const PULL_REQUEST_STATES_QUERY = `
  query DashboardPullRequestStates($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on PullRequest { id state updatedAt closedAt mergedAt }
    }
  }
`
