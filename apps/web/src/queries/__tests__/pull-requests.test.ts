import type { BucketedResponse } from '@prq/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { fetchPullRequests } from '../pull-requests'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const validBucketedResponse: BucketedResponse = {
  buckets: { review: [], attention: [], ready: [], waiting: [], drafts: [] },
  viewerLogin: 'octocat',
  syncedAt: '2026-05-03T12:00:00.000Z',
  rateLimit: { cost: 5, remaining: 4995, resetAt: '2026-05-03T13:00:00.000Z' },
  trackableRepos: [],
}

describe('fetchPullRequests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with parsed BucketedResponse on 200 + valid body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, validBucketedResponse)))

    const result = await fetchPullRequests([])

    expect(result).toEqual(validBucketedResponse)
  })

  it('fetches /api/prs without query string when trackedRepos is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validBucketedResponse))
    vi.stubGlobal('fetch', fetchMock)

    await fetchPullRequests([])

    expect(fetchMock).toHaveBeenCalledWith('/api/prs')
  })

  it('appends ?repos= with comma-joined slugs when trackedRepos is non-empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, validBucketedResponse))
    vi.stubGlobal('fetch', fetchMock)

    await fetchPullRequests(['vercel/next.js', 'facebook/react'])

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/prs?repos=vercel%2Fnext.js%2Cfacebook%2Freact',
    )
  })

  it('throws ApiError with code BAD_CREDENTIALS on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { error: { code: 'BAD_CREDENTIALS', message: 'GitHub PAT was rejected' } }),
      ),
    )

    await expect(fetchPullRequests([])).rejects.toMatchObject({
      name: 'ApiError',
      code: 'BAD_CREDENTIALS',
      message: 'GitHub PAT was rejected',
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

    const error = await fetchPullRequests([]).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.resetAt).toBe('2026-05-03T13:00:00.000Z')
  })

  it('throws ApiError with code UPSTREAM_ERROR on 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(502, { error: { code: 'UPSTREAM_ERROR', message: 'GraphQL boom' } }),
      ),
    )

    await expect(fetchPullRequests([])).rejects.toMatchObject({
      name: 'ApiError',
      code: 'UPSTREAM_ERROR',
    })
  })

  it('throws generic Error with HTTP status when error body does not match schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { unexpected: 'shape' })))

    await expect(fetchPullRequests([])).rejects.toThrow('HTTP 500')
  })
})
