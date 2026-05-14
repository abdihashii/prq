import type { TokenHealthResponse } from '@prq/shared'
import { ApiErrorSchema, TokenHealthResponseSchema } from '@prq/shared'
import { ApiError } from '@/lib/api-error'

export async function submitPat(pat: string): Promise<TokenHealthResponse> {
  const response = await fetch('/api/pat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pat }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return TokenHealthResponseSchema.parse(data)
}

export async function deletePat(): Promise<void> {
  const response = await fetch('/api/pat', { method: 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
}
