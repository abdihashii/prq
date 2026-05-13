import { z } from 'zod'
import { PullRequestSchema } from './pullRequest'
import { TrackableRepoSchema } from './trackableRepo'

export const RateLimitSchema = z.object({
  cost: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.iso.datetime(),
})

export const BucketedResponseSchema = z.object({
  buckets: z.object({
    review: z.array(PullRequestSchema),
    attention: z.array(PullRequestSchema),
    ready: z.array(PullRequestSchema),
    waiting: z.array(PullRequestSchema),
    drafts: z.array(PullRequestSchema),
  }),
  viewerLogin: z.string(),
  syncedAt: z.iso.datetime(),
  rateLimit: RateLimitSchema,
  trackableRepos: z.array(TrackableRepoSchema),
})

export const ApiErrorCodeSchema = z.enum([
  'BAD_CREDENTIALS',
  'BAD_REQUEST',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
])

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    resetAt: z.iso.datetime().optional(),
  }),
})
