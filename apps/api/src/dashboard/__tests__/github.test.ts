import { describe, expect, it, vi } from 'vitest'
import {
  DashboardBadCredentialsError,
  DashboardRateLimitedError,
} from '../errors'
import {
  createGitHubDashboardAuthorization,
  createGitHubDashboardReconciler,
  type DashboardAuthorizationStore,
  type DashboardReconciliationStore,
} from '../github'

const NOW = new Date('2026-06-08T12:00:00.000Z')
const PRINCIPAL = { githubId: 'U_viewer', login: 'haji', accessToken: 'secret-token' }

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function installation(id: number) {
  return {
    id,
    account: { id: 7000 + id, login: `org-${id}`, type: 'Organization' },
    suspended_at: null,
  }
}

function repository(id: number) {
  return {
    node_id: `R_${id}`,
    name: `repo-${id}`,
    full_name: `org/repo-${id}`,
    owner: { login: 'org' },
    default_branch: 'main',
    private: true,
    archived: false,
  }
}

function store(overrides: Partial<DashboardAuthorizationStore> = {}): DashboardAuthorizationStore {
  return {
    replaceSnapshot: vi.fn(async () => []),
    loadAuthorizedScope: vi.fn(async () => ({ refreshedAt: null, repositories: [] })),
    ...overrides,
  }
}

describe('GitHub dashboard authorization refresh', () => {
  it('fully paginates installations before replacing the snapshot', async () => {
    const authorizationStore = store()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/user/installations') {
        const page = Number(url.searchParams.get('page'))
        return jsonResponse({
          total_count: 101,
          installations: page === 1
            ? Array.from({ length: 100 }, (_, index) => installation(index + 1))
            : [installation(101)],
        })
      }
      if (url.pathname.includes('/repositories')) {
        return jsonResponse({ total_count: 0, repositories: [] })
      }
      return jsonResponse({}, 500)
    })

    await createGitHubDashboardAuthorization({
      store: authorizationStore,
      fetch: fetchMock,
    }).refresh(PRINCIPAL, NOW)

    expect(authorizationStore.replaceSnapshot).toHaveBeenCalledOnce()
    expect(vi.mocked(authorizationStore.replaceSnapshot).mock.calls[0]?.[0].installations)
      .toHaveLength(101)
  })

  it('fully paginates repositories and replaces the exact snapshot once', async () => {
    const authorizationStore = store()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/user/installations') {
        return jsonResponse({ total_count: 1, installations: [installation(42)] })
      }
      const page = Number(url.searchParams.get('page'))
      return jsonResponse({
        total_count: 101,
        repositories: page === 1
          ? Array.from({ length: 100 }, (_, index) => repository(index + 1))
          : [repository(101)],
      })
    })

    await createGitHubDashboardAuthorization({
      store: authorizationStore,
      fetch: fetchMock,
    }).refresh(PRINCIPAL, NOW)

    const snapshot = vi.mocked(authorizationStore.replaceSnapshot).mock.calls[0]?.[0]
    expect(snapshot?.githubUserId).toBe('U_viewer')
    expect(snapshot?.repositories).toHaveLength(101)
    expect(snapshot?.repositories[100]).toMatchObject({
      githubRepositoryId: 'R_101',
      githubInstallationId: '42',
      private: true,
    })
  })

  it('leaves the previous snapshot untouched when any authorization page fails', async () => {
    const authorizationStore = store()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/user/installations') {
        return jsonResponse({ total_count: 1, installations: [installation(42)] })
      }
      return jsonResponse({ message: 'upstream failed' }, 502)
    })

    await expect(createGitHubDashboardAuthorization({
      store: authorizationStore,
      fetch: fetchMock,
    }).refresh(PRINCIPAL, NOW)).rejects.toThrow()

    expect(authorizationStore.replaceSnapshot).not.toHaveBeenCalled()
  })

  it('classifies rejected credentials and authorization rate limits', async () => {
    const authorizationStore = store()
    const unauthorized = createGitHubDashboardAuthorization({
      store: authorizationStore,
      fetch: vi.fn(async () => jsonResponse({}, 401)),
    })
    await expect(unauthorized.refresh(PRINCIPAL, NOW))
      .rejects.toBeInstanceOf(DashboardBadCredentialsError)

    const rateLimited = createGitHubDashboardAuthorization({
      store: authorizationStore,
      fetch: vi.fn(async () => jsonResponse({}, 403, { 'x-ratelimit-remaining': '0' })),
    })
    await expect(rateLimited.refresh(PRINCIPAL, NOW))
      .rejects.toBeInstanceOf(DashboardRateLimitedError)
    expect(authorizationStore.replaceSnapshot).not.toHaveBeenCalled()
  })
})

describe('GitHub dashboard reconciliation', () => {
  it('fully paginates open PRs and nested review state before one persistence call', async () => {
    const reconciliationStore: DashboardReconciliationStore = {
      findOpenPullRequestIds: vi.fn(async () => ['PR_open', 'PR_closed', 'PR_merged']),
      persist: vi.fn(async () => {}),
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string
        variables: Record<string, unknown>
      }
      if (request.query.includes('DashboardOpenPullRequests')) {
        return jsonResponse({
          data: {
            repository: {
              pullRequests: request.variables['cursor'] === null
                ? {
                    nodes: [graphqlPullRequest()],
                    pageInfo: { hasNextPage: true, endCursor: 'pr-page-2' },
                  }
                : {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
            },
          },
        })
      }
      if (request.query.includes('DashboardPullRequestNested')) {
        return jsonResponse({
          data: {
            node: {
              reviewRequests: {
                nodes: [{
                  requestedReviewer: { __typename: 'Team', slug: 'platform', login: null },
                }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              reviews: {
                nodes: [{
                  id: 'REV_2',
                  author: { login: 'haji' },
                  state: 'COMMENTED',
                  submittedAt: '2026-06-08T10:30:00.000Z',
                }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              reviewThreads: {
                nodes: [{ isResolved: false }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      return jsonResponse({
        data: {
          nodes: [
            {
              id: 'PR_closed',
              state: 'CLOSED',
              updatedAt: '2026-06-08T11:00:00.000Z',
              closedAt: '2026-06-08T11:00:00.000Z',
              mergedAt: null,
            },
            {
              id: 'PR_merged',
              state: 'MERGED',
              updatedAt: '2026-06-08T11:30:00.000Z',
              closedAt: '2026-06-08T11:30:00.000Z',
              mergedAt: '2026-06-08T11:30:00.000Z',
            },
          ],
        },
      })
    })

    await createGitHubDashboardReconciler({
      store: reconciliationStore,
      fetch: fetchMock,
    }).reconcile({
      githubRepositoryId: 'R_one',
      githubInstallationId: 'I_one',
      owner: 'acme',
      name: 'rocket',
      dashboardReconciledAt: null,
    }, PRINCIPAL, NOW)

    expect(reconciliationStore.persist).toHaveBeenCalledOnce()
    const persisted = vi.mocked(reconciliationStore.persist).mock.calls[0]?.[0]
    expect(persisted?.pullRequests).toHaveLength(1)
    expect(persisted?.pullRequests[0]).toMatchObject({
      unresolvedThreadCount: 1,
      reviewRequests: [
        { requestedReviewer: { __typename: 'User', login: 'haji' } },
        { requestedReviewer: { __typename: 'Team', slug: 'platform' } },
      ],
      reviews: [{ id: 'REV_1' }, { id: 'REV_2' }],
    })
    expect(persisted?.missingStates.map(state => state.state)).toEqual(['CLOSED', 'MERGED'])
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not persist or advance reconciliation state after a failed fetch', async () => {
    const reconciliationStore: DashboardReconciliationStore = {
      findOpenPullRequestIds: vi.fn(async () => []),
      persist: vi.fn(async () => {}),
    }

    await expect(createGitHubDashboardReconciler({
      store: reconciliationStore,
      fetch: vi.fn(async () => jsonResponse({ message: 'failed' }, 502)),
    }).reconcile({
      githubRepositoryId: 'R_one',
      githubInstallationId: 'I_one',
      owner: 'acme',
      name: 'rocket',
      dashboardReconciledAt: null,
    }, PRINCIPAL, NOW)).rejects.toThrow()

    expect(reconciliationStore.persist).not.toHaveBeenCalled()
  })
})

function graphqlPullRequest() {
  return {
    id: 'PR_open',
    number: 1,
    title: 'Reconciled PR',
    url: 'https://github.com/acme/rocket/pull/1',
    author: { login: 'teammate' },
    baseRefName: 'main',
    headRefName: 'feature/one',
    headRepository: { name: 'rocket', owner: { login: 'acme' } },
    isDraft: false,
    state: 'OPEN',
    reviewDecision: 'REVIEW_REQUIRED',
    mergeable: 'MERGEABLE',
    statusCheckRollup: { state: 'SUCCESS' },
    updatedAt: '2026-06-08T11:45:00.000Z',
    closedAt: null,
    mergedAt: null,
    commits: {
      totalCount: 3,
      nodes: [{ commit: { committedDate: '2026-06-08T11:30:00.000Z' } }],
    },
    comments: { totalCount: 4 },
    reviewRequests: {
      nodes: [{
        requestedReviewer: { __typename: 'User', login: 'haji', slug: null },
      }],
      pageInfo: { hasNextPage: true, endCursor: 'requests-2' },
    },
    reviews: {
      nodes: [{
        id: 'REV_1',
        author: { login: 'teammate' },
        state: 'APPROVED',
        submittedAt: '2026-06-08T10:00:00.000Z',
      }],
      pageInfo: { hasNextPage: true, endCursor: 'reviews-2' },
    },
    reviewThreads: {
      nodes: [{ isResolved: true }],
      pageInfo: { hasNextPage: true, endCursor: 'threads-2' },
    },
  }
}
