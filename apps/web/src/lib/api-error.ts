import type { ApiErrorPayload } from '@prq/shared'

export class ApiError extends Error {
  readonly code: ApiErrorPayload['code']
  readonly resetAt?: string

  constructor(payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiError'
    this.code = payload.code
    this.resetAt = payload.resetAt
  }
}
