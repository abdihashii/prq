import { describe, expect, it } from 'vitest'
import {
  createDashboardService,
  type DashboardStore,
  type StoredPullRequest,
} from '../dashboard'

const NOW = new Date('2026-06-07T12:00:00.000Z')
const VIEWER = { githubId: 'U_viewer', login: 'Haji' }

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
    ...overrides,
  }
}

function serviceWithState(state: {
  ownedRepositories?: Array<{ owner: string, name: string }>
  pullRequests?: ReturnType<typeof storedPullRequest>[]
}) {
  const store: DashboardStore = {
    load: async () => ({
      ownedRepositories: state.ownedRepositories ?? [],
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
      rateLimit: { cost: 0, remaining: 0, resetAt: NOW.toISOString() },
      trackableRepos: [],
    })
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
})
