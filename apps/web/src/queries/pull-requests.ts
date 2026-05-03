import { ApiErrorSchema, BucketedResponseSchema, type BucketedResponse } from '@prq/shared'
import { ApiError } from '#/lib/api-error.js'

export async function fetchPullRequests(): Promise<BucketedResponse> {
  const response = await fetch('/api/prs')
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return BucketedResponseSchema.parse(data)
}
