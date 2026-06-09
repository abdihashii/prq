import { ApiErrorSchema } from '@prq/shared'
import { ApiError } from '@/lib/api-error'

export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/session', { method: 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
}
