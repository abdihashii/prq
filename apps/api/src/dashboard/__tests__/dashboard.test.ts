import { describe, expect, it, vi } from 'vitest'
import { DashboardBadCredentialsError, DashboardUpstreamError } from '../errors'
import type { Installation } from '@prq/shared'
import {
  computeGithubSyncedAt,
  createDashboardFacade,
  createDashboardService,
  type AuthorizedRepository,
  type DashboardAuthorization,
  type DashboardReconciler,
  type DashboardStore,
  type StoredPullRequest,
} from '../dashboard'

const NOW = new Date('2026-06-07T12:00:00.000Z')
const VIEWER = { githubId: 'U_viewer', login: 'Haji' }
const PRINCIPAL = { ...VIEWER, accessToken: 'secret-token' }

function storedPullRequest(overrides: Partial<StoredPullRequest> = {}): StoredPullRequest {
  return {
    id: 'PR_one',
    number: 1,
    title: 'Stored PR',
    url: 'https://github.com/acme/rocket/pull/1',
    repository: { owner: 'acme', name: 'rocket' },
    headRepository: { owner: 'acme', name: 'rocket' },
    authorLogin: 'haji',
    baseRefName: 'main',
    headRefName: 'feature/one',
    isDraft: false,
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    reviewDecision: null,
    mergeable: 'UNKNOWN' as const,
    statusCheckRollupState: null,
    latestCommitCommittedAt: null,
    commitsTotalCount: 2,
    commentsTotalCount: 3,
    unresolvedThreadCount: 4,
    requestedReviewers: [],
    viewerReviewSubmittedAt: [],
    autoRetargetPreviousBaseRefName: null,
    ...overrides,
  }
}

function serviceWithState(state: {
  ownedRepositories?: Array<{ owner: string, name: string, dashboardReconciledAt?: Date | null }>
  installations?: Installation[]
  pullRequests?: ReturnType<typeof storedPullRequest>[]
}) {
  const store: DashboardStore = {
    load: async () => ({
      ownedRepositories: (state.ownedRepositories ?? []).map(repo => ({
        ...repo,
        dashboardReconciledAt: repo.dashboardReconciledAt ?? null,
      })),
      installations: state.installations ?? [],
      pullRequests: state.pullRequests ?? [],
    }),
  }
  return createDashboardService({ store, now: () => NOW })
}

describe('database dashboard projection', () => {
  it('returns a valid empty dashboard without treating missing state as an error', async () => {
    const dashboard = await serviceWithState({}).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: new Set(),
    })

    expect(dashboard).toEqual({
      viewerLogin: 'Haji',
      buckets: { review: [], attention: [], ready: [], waiting: [], drafts: [] },
      syncedAt: NOW.toISOString(),
      githubSyncedAt: null,
      rateLimit: { cost: 0, remaining: 0, resetAt: NOW.toISOString() },
      trackableRepos: [],
      installations: [],
    })
  })

  it('treats a null allowlist as All mode and surfaces every relevant PR', async () => {
    const dashboard = await serviceWithState({
      pullRequests: [
        storedPullRequest(),
        storedPullRequest({
          id: 'PR_other',
          repository: { owner: 'platform', name: 'control-plane' },
          headRepository: { owner: 'platform', name: 'control-plane' },
        }),
      ],
    }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: null,
    })

    expect(dashboard.buckets.waiting).toHaveLength(2)
  })

  it('passes install scope through to the response', async () => {
    const installations: Installation[] = [
      { installationId: 'I_personal', accountLogin: 'haji', accountType: 'User' },
      { installationId: 'I_org', accountLogin: 'acme', accountType: 'Organization' },
    ]
    const dashboard = await serviceWithState({ installations }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: null,
    })

    expect(dashboard.installations).toEqual(installations)
  })

  it('serves old stored rows with conservative defaults and no freshness cutoff', async () => {
    const dashboard = await serviceWithState({
      pullRequests: [storedPullRequest()],
    }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(dashboard.buckets.waiting).toHaveLength(1)
    const item = dashboard.buckets.waiting[0]
    expect(item?.kind).toBe('pr')
    if (item?.kind !== 'pr') throw new Error('expected flat PR')
    expect(item.pr).toMatchObject({
      updatedAt: '2020-01-01T00:00:00.000Z',
      newCommentsSincePush: 0,
      unresolvedThreadCount: 4,
      unresolvedThreadAuthors: [],
      statusCheckRollup: null,
      latestCommit: null,
    })
  })

  it('classifies viewer review requests and rereviews case-insensitively', async () => {
    const dashboard = await serviceWithState({
      pullRequests: [
        storedPullRequest({
          id: 'PR_requested',
          authorLogin: 'teammate',
          requestedReviewers: [{ kind: 'User' as const, handle: 'HAJI' }],
        }),
        storedPullRequest({
          id: 'PR_rereview',
          authorLogin: 'teammate',
          requestedReviewers: [],
          latestCommitCommittedAt: new Date('2026-06-07T11:00:00.000Z'),
          viewerReviewSubmittedAt: [new Date('2026-06-07T10:00:00.000Z')],
        }),
        storedPullRequest({
          id: 'PR_reviewed_done',
          authorLogin: 'teammate',
          requestedReviewers: [],
          latestCommitCommittedAt: new Date('2026-06-07T09:00:00.000Z'),
          viewerReviewSubmittedAt: [new Date('2026-06-07T10:00:00.000Z')],
        }),
      ],
    }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(dashboard.buckets.review.map(item =>
      item.kind === 'pr' ? item.pr.id : item.root.pr.id,
    )).toEqual(['PR_requested', 'PR_rereview'])
    expect(dashboard.trackableRepos).toEqual([{ owner: 'acme', name: 'rocket', prCount: 2 }])
  })

  it('builds trackable repos before filtering and keeps owned repositories with no PRs', async () => {
    const dashboard = await serviceWithState({
      ownedRepositories: [{ owner: 'haji', name: 'dotfiles' }],
      pullRequests: [
        storedPullRequest(),
        storedPullRequest({
          id: 'PR_other',
          repository: { owner: 'platform', name: 'control-plane' },
          headRepository: { owner: 'platform', name: 'control-plane' },
        }),
      ],
    }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: new Set(['platform/control-plane']),
    })

    expect(dashboard.buckets.waiting).toHaveLength(1)
    expect(dashboard.trackableRepos).toEqual([
      { owner: 'acme', name: 'rocket', prCount: 1 },
      { owner: 'haji', name: 'dotfiles', prCount: 0 },
      { owner: 'platform', name: 'control-plane', prCount: 1 },
    ])
  })

  it('preserves deterministic input order through nested stack inference', async () => {
    const dashboard = await serviceWithState({
      pullRequests: [
        storedPullRequest({
          id: 'PR_parent',
          headRefName: 'feature/parent',
          updatedAt: new Date('2026-06-07T11:00:00.000Z'),
        }),
        storedPullRequest({
          id: 'PR_child',
          baseRefName: 'feature/parent',
          headRefName: 'feature/child',
          updatedAt: new Date('2026-06-07T10:00:00.000Z'),
        }),
        storedPullRequest({
          id: 'PR_solo',
          headRefName: 'feature/solo',
          updatedAt: new Date('2026-06-07T09:00:00.000Z'),
        }),
      ],
    }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(dashboard.buckets.waiting).toMatchObject([
      {
        kind: 'stack',
        root: {
          pr: { id: 'PR_parent' },
          children: [{ pr: { id: 'PR_child' }, children: [] }],
        },
      },
      { kind: 'pr', pr: { id: 'PR_solo' } },
    ])
  })

  it('projects successful retarget history onto flat and stacked pull requests', async () => {
    const dashboard = await serviceWithState({
      pullRequests: [
        storedPullRequest({
          id: 'PR_parent',
          headRefName: 'feature/parent',
        }),
        storedPullRequest({
          id: 'PR_child',
          baseRefName: 'feature/parent',
          headRefName: 'feature/child',
          autoRetargetPreviousBaseRefName: 'feature/older-parent',
        }),
        storedPullRequest({
          id: 'PR_flat',
          autoRetargetPreviousBaseRefName: 'feature/flat-parent',
        }),
      ],
    }).getDashboard({
      viewer: VIEWER,
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(dashboard.buckets.waiting).toMatchObject([
      {
        kind: 'stack',
        root: {
          children: [{
            pr: {
              id: 'PR_child',
              autoRetarget: { previousBaseRefName: 'feature/older-parent' },
            },
          }],
        },
      },
      {
        kind: 'pr',
        pr: {
          id: 'PR_flat',
          autoRetarget: { previousBaseRefName: 'feature/flat-parent' },
        },
      },
    ])
  })
})

describe('dashboard facade', () => {
  const repository = (
    dashboardReconciledAt: Date | null,
    overrides: Partial<AuthorizedRepository> = {},
  ): AuthorizedRepository => ({
    githubRepositoryId: 'R_one',
    githubInstallationId: 'I_one',
    owner: 'acme',
    name: 'rocket',
    dashboardReconciledAt,
    ...overrides,
  })

  function facade(args: {
    repositories: AuthorizedRepository[]
    reconciler?: DashboardReconciler
    authorization?: DashboardAuthorization
    logError?: (message: string, error: unknown) => void
  }) {
    const store: DashboardStore = {
      load: vi.fn(async () => ({ ownedRepositories: [], installations: [], pullRequests: [] })),
    }
    return {
      store,
      facade: createDashboardFacade({
        store,
        authorization: args.authorization ?? {
          refresh: vi.fn(async () => args.repositories),
        },
        reconciler: args.reconciler ?? { reconcile: vi.fn(async () => {}) },
        now: () => NOW,
        logError: args.logError,
      }),
    }
  }

  it('requires missing initial reconciliation before projection', async () => {
    const store: DashboardStore = {
      load: vi.fn(async () => ({ ownedRepositories: [], installations: [], pullRequests: [] })),
    }
    const reconciler: DashboardReconciler = {
      reconcile: vi.fn(async () => {
        throw new Error('GitHub unavailable')
      }),
    }
    const dashboard = createDashboardFacade({
      store,
      authorization: { refresh: vi.fn(async () => [repository(null)]) },
      reconciler,
      now: () => NOW,
    })

    await expect(dashboard.getDashboard({
      principal: PRINCIPAL,
      repositoryAllowlist: new Set(),
    })).rejects.toBeInstanceOf(DashboardUpstreamError)
    expect(store.load).not.toHaveBeenCalled()
  })

  it('populates a fresh authorized repository before projecting it', async () => {
    const state = {
      ownedRepositories: [] as Array<{
        owner: string
        name: string
        dashboardReconciledAt: Date | null
      }>,
      installations: [] as Installation[],
      pullRequests: [] as StoredPullRequest[],
    }
    const dashboard = createDashboardFacade({
      store: { load: vi.fn(async () => state) },
      authorization: { refresh: vi.fn(async () => [repository(null)]) },
      reconciler: {
        reconcile: vi.fn(async () => {
          state.ownedRepositories.push({ owner: 'acme', name: 'rocket', dashboardReconciledAt: NOW })
          state.pullRequests.push(storedPullRequest())
        }),
      },
      now: () => NOW,
    })

    const response = await dashboard.getDashboard({
      principal: PRINCIPAL,
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(response.buckets.waiting).toMatchObject([
      { kind: 'pr', pr: { id: 'PR_one' } },
    ])
  })

  it('serves prior authorized state when stale reconciliation fails', async () => {
    const logError = vi.fn()
    const { facade: dashboard, store } = facade({
      repositories: [repository(new Date('2026-06-07T10:00:00.000Z'))],
      reconciler: {
        reconcile: vi.fn(async () => {
          throw new DashboardUpstreamError()
        }),
      },
      logError,
    })

    await expect(dashboard.getDashboard({
      principal: PRINCIPAL,
      repositoryAllowlist: new Set(),
    })).resolves.toMatchObject({ viewerLogin: 'Haji' })
    expect(store.load).toHaveBeenCalledOnce()
    expect(logError).toHaveBeenCalledOnce()
  })

  it('does not reconcile repositories refreshed within the last hour', async () => {
    const reconciler: DashboardReconciler = { reconcile: vi.fn(async () => {}) }
    const { facade: dashboard } = facade({
      repositories: [repository(new Date('2026-06-07T11:30:00.000Z'))],
      reconciler,
    })

    await dashboard.getDashboard({ principal: PRINCIPAL, repositoryAllowlist: new Set() })

    expect(reconciler.reconcile).not.toHaveBeenCalled()
  })

  it('bounds repository reconciliation concurrency at four', async () => {
    let active = 0
    let maximum = 0
    const reconciler: DashboardReconciler = {
      reconcile: vi.fn(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
      }),
    }
    const { facade: dashboard } = facade({
      repositories: Array.from({ length: 6 }, (_, index) => repository(null, {
        githubRepositoryId: `R_${index}`,
        owner: `org-${index}`,
      })),
      reconciler,
    })

    await dashboard.getDashboard({ principal: PRINCIPAL, repositoryAllowlist: new Set() })

    expect(reconciler.reconcile).toHaveBeenCalledTimes(6)
    expect(maximum).toBe(4)
  })

  it('propagates rejected credentials even when prior state exists', async () => {
    const { facade: dashboard } = facade({
      repositories: [repository(new Date('2026-06-07T10:00:00.000Z'))],
      reconciler: {
        reconcile: vi.fn(async () => {
          throw new DashboardBadCredentialsError()
        }),
      },
    })

    await expect(dashboard.getDashboard({
      principal: PRINCIPAL,
      repositoryAllowlist: new Set(),
    })).rejects.toBeInstanceOf(DashboardBadCredentialsError)
  })

  it('fails closed when authorization refresh fails', async () => {
    const { facade: dashboard, store } = facade({
      repositories: [],
      authorization: {
        refresh: vi.fn(async () => {
          throw new DashboardUpstreamError()
        }),
      },
    })

    await expect(dashboard.getDashboard({
      principal: PRINCIPAL,
      repositoryAllowlist: new Set(),
    })).rejects.toBeInstanceOf(DashboardUpstreamError)
    expect(store.load).not.toHaveBeenCalled()
  })
})

describe('computeGithubSyncedAt', () => {
  it('returns null when there are no viewed repos', () => {
    expect(computeGithubSyncedAt([])).toBeNull()
  })

  it('returns null when any viewed repo has never been reconciled', () => {
    expect(computeGithubSyncedAt([
      { dashboardReconciledAt: new Date('2026-06-07T12:00:00.000Z') },
      { dashboardReconciledAt: null },
    ])).toBeNull()
  })

  it('returns the oldest reconcile time (the worst-case staleness floor)', () => {
    expect(computeGithubSyncedAt([
      { dashboardReconciledAt: new Date('2026-06-07T12:00:00.000Z') },
      { dashboardReconciledAt: new Date('2026-06-07T11:30:00.000Z') },
      { dashboardReconciledAt: new Date('2026-06-07T12:45:00.000Z') },
    ])).toBe('2026-06-07T11:30:00.000Z')
  })

  it('returns the single repo time when only one is viewed', () => {
    expect(computeGithubSyncedAt([
      { dashboardReconciledAt: new Date('2026-06-07T09:15:00.000Z') },
    ])).toBe('2026-06-07T09:15:00.000Z')
  })
})
