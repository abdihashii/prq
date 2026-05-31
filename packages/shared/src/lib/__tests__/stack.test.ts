import { describe, expect, it } from 'vitest'
import { DashboardResponseSchema } from '../../schemas/dashboard'
import type { Bucket } from '../../types/bucket'
import type { PullRequest } from '../../types/pullRequest'
import { inferDashboardStacks } from '../stack'

const DEFAULT_REPO = { owner: 'acme', name: 'repo' }

function buckets(overrides: Partial<Record<Bucket, PullRequest[]>> = {}): Record<Bucket, PullRequest[]> {
  return {
    review: [],
    attention: [],
    ready: [],
    waiting: [],
    drafts: [],
    ...overrides,
  }
}

function pr(id: string, overrides: Partial<PullRequest> = {}): PullRequest {
  const repository = overrides.repository ?? DEFAULT_REPO
  const number = overrides.number ?? 1

  return {
    id,
    number,
    title: `PR ${id}`,
    url: `https://github.com/${repository.owner}/${repository.name}/pull/${number}`,
    repository,
    author: { login: 'haji' },
    baseRefName: 'main',
    headRefName: `feature/${id}`,
    isDraft: false,
    updatedAt: '2026-05-01T00:00:00.000Z',
    reviewDecision: 'REVIEW_REQUIRED',
    mergeable: 'UNKNOWN',
    statusCheckRollup: null,
    latestCommit: null,
    commitsTotalCount: 1,
    commentsTotalCount: 0,
    requestedReviewers: [],
    bucket: 'waiting',
    viewerHasReviewed: false,
    viewerLatestReviewSubmittedAt: null,
    viewerIsRequestedReviewer: false,
    needsRereview: false,
    newCommentsSincePush: 0,
    unresolvedThreadCount: 0,
    unresolvedThreadAuthors: [],
    ...overrides,
  }
}

describe('inferDashboardStacks', () => {
  it('keeps flat PRs as individual dashboard items', () => {
    const first = pr('first')
    const second = pr('second')

    const result = inferDashboardStacks(buckets({ waiting: [first, second] }))

    expect(result.waiting).toEqual([
      { kind: 'pr', pr: first },
      { kind: 'pr', pr: second },
    ])
  })

  it('groups a simple parent/child stack', () => {
    const parent = pr('parent', { headRefName: 'feature/parent' })
    const child = pr('child', {
      baseRefName: 'feature/parent',
      headRefName: 'feature/child',
    })

    const result = inferDashboardStacks(buckets({ waiting: [parent, child] }))

    expect(result.waiting).toEqual([
      {
        kind: 'stack',
        root: {
          pr: parent,
          children: [{ pr: child, children: [] }],
        },
      },
    ])
  })

  it('groups nested stacks', () => {
    const bottom = pr('bottom', { headRefName: 'feature/bottom' })
    const middle = pr('middle', {
      baseRefName: 'feature/bottom',
      headRefName: 'feature/middle',
    })
    const top = pr('top', {
      baseRefName: 'feature/middle',
      headRefName: 'feature/top',
    })

    const result = inferDashboardStacks(buckets({ waiting: [bottom, middle, top] }))

    expect(result.waiting).toEqual([
      {
        kind: 'stack',
        root: {
          pr: bottom,
          children: [
            {
              pr: middle,
              children: [{ pr: top, children: [] }],
            },
          ],
        },
      },
    ])
  })

  it('groups multiple independent stacks in the same bucket', () => {
    const firstParent = pr('first-parent', { headRefName: 'feature/first-parent' })
    const firstChild = pr('first-child', {
      baseRefName: 'feature/first-parent',
      headRefName: 'feature/first-child',
    })
    const secondParent = pr('second-parent', { headRefName: 'feature/second-parent' })
    const secondChild = pr('second-child', {
      baseRefName: 'feature/second-parent',
      headRefName: 'feature/second-child',
    })
    const solo = pr('solo')

    const result = inferDashboardStacks(
      buckets({ waiting: [firstParent, firstChild, secondParent, secondChild, solo] }),
    )

    expect(result.waiting).toEqual([
      {
        kind: 'stack',
        root: { pr: firstParent, children: [{ pr: firstChild, children: [] }] },
      },
      {
        kind: 'stack',
        root: { pr: secondParent, children: [{ pr: secondChild, children: [] }] },
      },
      { kind: 'pr', pr: solo },
    ])
  })

  it('groups review stacks owned by someone else', () => {
    const parent = pr('review-parent', {
      author: { login: 'teammate' },
      bucket: 'review',
      headRefName: 'feature/review-parent',
      viewerIsRequestedReviewer: true,
    })
    const child = pr('review-child', {
      author: { login: 'teammate' },
      bucket: 'review',
      baseRefName: 'feature/review-parent',
      headRefName: 'feature/review-child',
      viewerIsRequestedReviewer: true,
    })

    const result = inferDashboardStacks(buckets({ review: [parent, child] }))

    expect(result.review).toEqual([
      {
        kind: 'stack',
        root: { pr: parent, children: [{ pr: child, children: [] }] },
      },
    ])
  })

  it('keeps orphan children flat when the parent branch is missing', () => {
    const child = pr('child', {
      baseRefName: 'feature/missing-parent',
      headRefName: 'feature/child',
    })

    const result = inferDashboardStacks(buckets({ waiting: [child] }))

    expect(result.waiting).toEqual([{ kind: 'pr', pr: child }])
  })

  it('does not infer parent links across buckets', () => {
    const parent = pr('parent', {
      bucket: 'ready',
      headRefName: 'feature/parent',
    })
    const child = pr('child', {
      bucket: 'waiting',
      baseRefName: 'feature/parent',
      headRefName: 'feature/child',
    })

    const result = inferDashboardStacks(buckets({ ready: [parent], waiting: [child] }))

    expect(result.ready).toEqual([{ kind: 'pr', pr: parent }])
    expect(result.waiting).toEqual([{ kind: 'pr', pr: child }])
  })

  it('uses deterministic input ordering for top-level items and siblings', () => {
    const solo = pr('solo')
    const secondChild = pr('second-child', {
      baseRefName: 'feature/parent',
      headRefName: 'feature/second-child',
    })
    const parent = pr('parent', { headRefName: 'feature/parent' })
    const firstChild = pr('first-child', {
      baseRefName: 'feature/parent',
      headRefName: 'feature/first-child',
    })

    const result = inferDashboardStacks(
      buckets({ waiting: [solo, secondChild, parent, firstChild] }),
    )

    expect(result.waiting).toEqual([
      { kind: 'pr', pr: solo },
      {
        kind: 'stack',
        root: {
          pr: parent,
          children: [
            { pr: secondChild, children: [] },
            { pr: firstChild, children: [] },
          ],
        },
      },
    ])
  })

  it('keeps children flat when more than one PR has the matching parent head branch', () => {
    const firstParent = pr('first-parent', { headRefName: 'feature/shared' })
    const secondParent = pr('second-parent', { headRefName: 'feature/shared' })
    const child = pr('child', {
      baseRefName: 'feature/shared',
      headRefName: 'feature/child',
    })

    const result = inferDashboardStacks(
      buckets({ waiting: [firstParent, secondParent, child] }),
    )

    expect(result.waiting).toEqual([
      { kind: 'pr', pr: firstParent },
      { kind: 'pr', pr: secondParent },
      { kind: 'pr', pr: child },
    ])
  })

  it('keeps cyclic branch relationships flat', () => {
    const first = pr('first', {
      baseRefName: 'feature/second',
      headRefName: 'feature/first',
    })
    const second = pr('second', {
      baseRefName: 'feature/first',
      headRefName: 'feature/second',
    })

    const result = inferDashboardStacks(buckets({ waiting: [first, second] }))

    expect(result.waiting).toEqual([
      { kind: 'pr', pr: first },
      { kind: 'pr', pr: second },
    ])
  })

  it('validates the stack-aware dashboard response schema', () => {
    const parent = pr('parent', { headRefName: 'feature/parent' })
    const child = pr('child', {
      baseRefName: 'feature/parent',
      headRefName: 'feature/child',
    })
    const dashboardBuckets = inferDashboardStacks(buckets({ waiting: [parent, child] }))
    const response = {
      buckets: dashboardBuckets,
      viewerLogin: 'haji',
      syncedAt: '2026-05-01T00:00:00.000Z',
      rateLimit: {
        cost: 1,
        remaining: 4999,
        resetAt: '2026-05-01T01:00:00.000Z',
      },
      trackableRepos: [],
    }

    expect(DashboardResponseSchema.parse(response)).toEqual(response)
  })
})
