import type { z } from 'zod'
import type { BucketedResponseSchema, RateLimitSchema } from '../schemas/contract.js'

export type BucketedResponse = z.infer<typeof BucketedResponseSchema>
export type RateLimit = z.infer<typeof RateLimitSchema>
