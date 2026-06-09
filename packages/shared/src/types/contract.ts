import type { z } from 'zod'
import type {
  ApiErrorCodeSchema,
  ApiErrorSchema,
  RateLimitSchema,
} from '../schemas/contract'

export type RateLimit = z.infer<typeof RateLimitSchema>
export type ApiErrorPayload = z.infer<typeof ApiErrorSchema>['error']
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>
