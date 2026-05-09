import { ApiError } from '#/lib/api-error.js'

export function getRefetchInterval(
  error: unknown,
  defaultMs: number,
  now: Date = new Date(),
): number {
  if (error instanceof ApiError && error.code === 'RATE_LIMITED' && error.resetAt) {
    const delta = new Date(error.resetAt).getTime() - now.getTime()
    if (delta > 0) return delta
  }
  return defaultMs
}
