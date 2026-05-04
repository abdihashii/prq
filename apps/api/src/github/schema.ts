import { z } from 'zod'

const ActorLogin = z.object({ login: z.string() })

const RawCommit = z.object({
  commit: z.object({
    committedDate: z.iso.datetime(),
  }),
})

const RawReview = z.object({
  state: z.enum(['PENDING', 'COMMENTED', 'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']),
  submittedAt: z.iso.datetime().nullable(),
  author: ActorLogin.nullable(),
})

const RawRequestedReviewer = z.discriminatedUnion('__typename', [
  z.object({ __typename: z.literal('User'), login: z.string() }),
  z.object({ __typename: z.literal('Bot'), login: z.string() }),
  z.object({ __typename: z.literal('Mannequin'), login: z.string() }),
  z.object({ __typename: z.literal('Team'), slug: z.string() }),
])

const RawReviewRequest = z.object({
  requestedReviewer: RawRequestedReviewer.nullable(),
})

const RawComment = z.object({
  createdAt: z.iso.datetime(),
  author: ActorLogin.nullable(),
})

const RawReviewThread = z.object({
  isResolved: z.boolean(),
  comments: z.object({
    nodes: z.array(RawComment.nullable()).nullable(),
  }),
})

export const RawPullRequestSchema = z.object({
  __typename: z.literal('PullRequest'),
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.url(),
  isDraft: z.boolean(),
  baseRefName: z.string(),
  updatedAt: z.iso.datetime(),
  reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
  repository: z.object({
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  author: ActorLogin.nullable(),
  statusCheckRollup: z
    .object({
      state: z.enum(['SUCCESS', 'PENDING', 'FAILURE', 'ERROR', 'EXPECTED']),
    })
    .nullable(),
  commits: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(RawCommit.nullable()).nullable(),
  }),
  reviews: z
    .object({
      nodes: z.array(RawReview.nullable()).nullable(),
    })
    .nullable(),
  reviewRequests: z
    .object({
      nodes: z.array(RawReviewRequest.nullable()).nullable(),
    })
    .nullable(),
  comments: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(RawComment.nullable()).nullable(),
  }),
  reviewThreads: z.object({
    nodes: z.array(RawReviewThread.nullable()).nullable(),
  }),
})

const SearchNode = z.discriminatedUnion('__typename', [
  RawPullRequestSchema,
  z.object({ __typename: z.literal('App') }),
  z.object({ __typename: z.literal('Discussion') }),
  z.object({ __typename: z.literal('Issue') }),
  z.object({ __typename: z.literal('MarketplaceListing') }),
  z.object({ __typename: z.literal('Organization') }),
  z.object({ __typename: z.literal('Repository') }),
  z.object({ __typename: z.literal('User') }),
])

const SearchResult = z.object({
  nodes: z.array(SearchNode.nullable()).nullable(),
})

export const RawResponseSchema = z.object({
  viewer: z.object({ login: z.string() }),
  rateLimit: z
    .object({
      cost: z.number().int().nonnegative(),
      remaining: z.number().int().nonnegative(),
      resetAt: z.iso.datetime(),
    })
    .nullable(),
  authored: SearchResult,
  reviewRequested: SearchResult,
  reviewedBy: SearchResult,
})

export type RawPullRequest = z.infer<typeof RawPullRequestSchema>
export type RawResponse = z.infer<typeof RawResponseSchema>
