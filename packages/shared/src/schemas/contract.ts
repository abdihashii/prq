import { z } from 'zod'
import { PullRequestSchema } from './pullRequest.js'

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
})

export const ApiErrorCodeSchema = z.enum(['BAD_CREDENTIALS', 'RATE_LIMITED', 'UPSTREAM_ERROR'])

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    resetAt: z.iso.datetime().optional(),
  }),
})
