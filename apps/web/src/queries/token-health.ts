import type { TokenHealthResponse } from '@prq/shared'
import { ApiErrorSchema, TokenHealthResponseSchema } from '@prq/shared'
import { ApiError } from '@/lib/api-error'

export async function fetchTokenHealth(): Promise<TokenHealthResponse> {
  const response = await fetch('/api/user')
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return TokenHealthResponseSchema.parse(data)
}
