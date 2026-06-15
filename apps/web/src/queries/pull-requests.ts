import type { DashboardResponse } from '@prq/shared'
import { ApiErrorSchema, DashboardResponseSchema } from '@prq/shared'
import { ApiError } from '@/lib/api-error'

export async function fetchPullRequests(reposParam: string | null): Promise<DashboardResponse> {
  const url = reposParam === null
    ? '/api/prs'
    : `/api/prs?repos=${encodeURIComponent(reposParam)}`

  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return DashboardResponseSchema.parse(data)
}
