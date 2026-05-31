import { z } from 'zod'
import { BucketSchema } from './bucket'

export const RequestedReviewerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('User'), handle: z.string() }),
  z.object({ kind: z.literal('Bot'), handle: z.string() }),
  z.object({ kind: z.literal('Mannequin'), handle: z.string() }),
  z.object({ kind: z.literal('Team'), handle: z.string() }),
])

export const PullRequestSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.url(),
  repository: z.object({
    owner: z.string(),
    name: z.string(),
  }),
  headRepository: z.object({
    owner: z.string(),
    name: z.string(),
  }).nullable(),
  author: z.object({ login: z.string() }).nullable(),
  baseRefName: z.string(),
  headRefName: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.iso.datetime(),
  reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
  statusCheckRollup: z
    .object({
      state: z.enum(['SUCCESS', 'PENDING', 'FAILURE', 'ERROR', 'EXPECTED']),
    })
    .nullable(),
  latestCommit: z.object({ committedDate: z.iso.datetime() }).nullable(),
  commitsTotalCount: z.number().int().nonnegative(),
  commentsTotalCount: z.number().int().nonnegative(),
  requestedReviewers: z.array(RequestedReviewerSchema),

  bucket: BucketSchema,
  viewerHasReviewed: z.boolean(),
  viewerLatestReviewSubmittedAt: z.iso.datetime().nullable(),
  viewerIsRequestedReviewer: z.boolean(),
  needsRereview: z.boolean(),
  newCommentsSincePush: z.number().int().nonnegative(),
  unresolvedThreadCount: z.number().int().nonnegative(),
  unresolvedThreadAuthors: z.array(z.string()),
})
