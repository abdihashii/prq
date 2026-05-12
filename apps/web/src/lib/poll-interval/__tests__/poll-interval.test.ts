import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { getRefetchInterval } from '../poll-interval'

const now = new Date('2026-05-03T12:00:00.000Z')
const DEFAULT = 30_000

describe('getRefetchInterval', () => {
  it('returns the default for non-rate-limited errors', () => {
    expect(getRefetchInterval(null, DEFAULT, now)).toBe(DEFAULT)
    expect(getRefetchInterval(new Error('HTTP 502'), DEFAULT, now)).toBe(DEFAULT)
    expect(
      getRefetchInterval(
        new ApiError({ code: 'BAD_CREDENTIALS', message: 'token rejected' }),
        DEFAULT,
        now,
      ),
    ).toBe(DEFAULT)
  })

  it('returns delta-to-resetAt for rate-limited errors with a future resetAt', () => {
    const resetAt = new Date(now.getTime() + 60_000).toISOString()
    expect(
      getRefetchInterval(
        new ApiError({ code: 'RATE_LIMITED', message: 'rate limited', resetAt }),
        DEFAULT,
        now,
      ),
    ).toBe(60_000)
  })

  it('returns the default for rate-limited errors with missing or past resetAt', () => {
    expect(
      getRefetchInterval(
        new ApiError({ code: 'RATE_LIMITED', message: 'rate limited' }),
        DEFAULT,
        now,
      ),
    ).toBe(DEFAULT)

    const past = new Date(now.getTime() - 1).toISOString()
    expect(
      getRefetchInterval(
        new ApiError({ code: 'RATE_LIMITED', message: 'rate limited', resetAt: past }),
        DEFAULT,
        now,
      ),
    ).toBe(DEFAULT)
  })
})
