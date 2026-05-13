import type { BucketedResponse, TrackedRepos } from '@prq/shared'
import { ApiErrorSchema, BucketedResponseSchema } from '@prq/shared'
import { ApiError } from '@/lib/api-error'

export async function fetchPullRequests(trackedRepos: TrackedRepos): Promise<BucketedResponse> {
  const params = new URLSearchParams()
  if (trackedRepos.length > 0) params.set('repos', trackedRepos.join(','))
  const qs = params.toString()
  const url = qs ? `/api/prs?${qs}` : '/api/prs'

  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return BucketedResponseSchema.parse(data)
}
