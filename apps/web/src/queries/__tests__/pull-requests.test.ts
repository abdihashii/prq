import type { DashboardResponse } from '@prq/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { fetchPullRequests } from '../pull-requests'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const validDashboardResponse: DashboardResponse = {
  buckets: { review: [], attention: [], ready: [], waiting: [], drafts: [] },
  viewerLogin: 'octocat',
  syncedAt: '2026-05-03T12:00:00.000Z',
  githubSyncedAt: '2026-05-03T12:00:00.000Z',
  rateLimit: { cost: 5, remaining: 4995, resetAt: '2026-05-03T13:00:00.000Z' },
  trackableRepos: [],
  installations: [],
}

describe('fetchPullRequests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with parsed DashboardResponse on 200 + valid body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, validDashboardResponse)))

    const result = await fetchPullRequests(null)

    expect(result).toEqual(validDashboardResponse)
  })

  it('fetches /api/prs without query string when reposParam is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validDashboardResponse))
    vi.stubGlobal('fetch', fetchMock)

    await fetchPullRequests(null)

    expect(fetchMock).toHaveBeenCalledWith('/api/prs')
  })

  it('appends ?repos= with the encoded param string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validDashboardResponse))
    vi.stubGlobal('fetch', fetchMock)

    await fetchPullRequests('vercel/next.js,facebook/react')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/prs?repos=vercel%2Fnext.js%2Cfacebook%2Freact',
    )
  })

  it('appends an empty ?repos= when reposParam is an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validDashboardResponse))
    vi.stubGlobal('fetch', fetchMock)

    await fetchPullRequests('')

    expect(fetchMock).toHaveBeenCalledWith('/api/prs?repos=')
  })

  it('throws ApiError with code BAD_CREDENTIALS on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { error: { code: 'BAD_CREDENTIALS', message: 'Session was rejected' } }),
      ),
    )

    await expect(fetchPullRequests(null)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'BAD_CREDENTIALS',
      message: 'Session was rejected',
    })
  })

  it('throws ApiError with code RATE_LIMITED and resetAt on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(429, {
          error: {
            code: 'RATE_LIMITED',
            message: 'GitHub API rate limit reached',
            resetAt: '2026-05-03T13:00:00.000Z',
          },
        }),
      ),
    )

    const error = await fetchPullRequests(null).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.resetAt).toBe('2026-05-03T13:00:00.000Z')
  })

  it('throws ApiError with code UPSTREAM_ERROR on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, { error: { code: 'UPSTREAM_ERROR', message: 'Database unavailable' } }),
      ),
    )

    await expect(fetchPullRequests(null)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'UPSTREAM_ERROR',
    })
  })

  it('throws generic Error with HTTP status when error body does not match schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' })))

    await expect(fetchPullRequests(null)).rejects.toThrow('HTTP 500')
  })
})
