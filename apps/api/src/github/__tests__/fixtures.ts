import type { RawPullRequest, RawResponse } from '../schema'

const baseRawPr: RawPullRequest = {
  __typename: 'PullRequest',
  id: 'PR_default',
  number: 1,
  title: 'Default PR',
  url: 'https://github.com/owner/repo/pull/1',
  isDraft: false,
  baseRefName: 'main',
  updatedAt: '2026-01-01T00:00:00Z',
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  repository: { name: 'repo', owner: { login: 'owner' } },
  author: { login: 'me' },
  statusCheckRollup: null,
  commits: { totalCount: 1, nodes: [{ commit: { committedDate: '2026-01-01T00:00:00Z' } }] },
  reviews: { nodes: [] },
  reviewRequests: { nodes: [] },
  comments: { totalCount: 0, nodes: [] },
  reviewThreads: { nodes: [] },
}

export function makeRawPr(overrides: Partial<RawPullRequest> = {}): RawPullRequest {
  return { ...baseRawPr, ...overrides }
}

export function makeRawResponse(
  opts: {
    viewerLogin?: string
    ownedRepos?: Array<{ owner: string, name: string }>
    authored?: RawPullRequest[]
    reviewRequested?: RawPullRequest[]
    reviewedBy?: RawPullRequest[]
  } = {},
): RawResponse {
  return {
    viewer: {
      login: opts.viewerLogin ?? 'me',
      repositories: {
        nodes: (opts.ownedRepos ?? []).map(r => ({
          name: r.name,
          owner: { login: r.owner },
        })),
      },
    },
    rateLimit: { cost: 1, remaining: 4999, resetAt: '2026-01-01T01:00:00Z' },
    authored: { nodes: opts.authored ?? [] },
    reviewRequested: { nodes: opts.reviewRequested ?? [] },
    reviewedBy: { nodes: opts.reviewedBy ?? [] },
  }
}
