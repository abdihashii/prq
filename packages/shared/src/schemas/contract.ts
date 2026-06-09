import { z } from 'zod'

export const RateLimitSchema = z.object({
  cost: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.iso.datetime(),
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
