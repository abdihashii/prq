// @vitest-environment jsdom

import type { DashboardResponse } from '@prq/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeSettings } from '@/lib/settings-storage/settings-storage'
import { useDashboard } from '../use-dashboard'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const validDashboardResponse: DashboardResponse = {
  buckets: { review: [], attention: [], ready: [], waiting: [], drafts: [] },
  viewerLogin: 'haji',
  syncedAt: '2026-05-03T12:00:00.000Z',
  rateLimit: { cost: 5, remaining: 4995, resetAt: '2026-05-03T13:00:00.000Z' },
  trackableRepos: [],
  installations: [],
}

/** Route fetch by URL so we can assert exactly which /api/prs variants fired. */
function stubFetch(handlers: {
  user?: () => Response
  prs?: (url: string) => Response
}) {
  const calls: string[] = []
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push(url)
    if (url === '/api/user') {
      return Promise.resolve(handlers.user?.() ?? jsonResponse(200, { login: 'haji' }))
    }
    if (url.startsWith('/api/prs')) {
      return Promise.resolve(handlers.prs?.(url) ?? jsonResponse(200, validDashboardResponse))
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, prsCalls: () => calls.filter(u => u.startsWith('/api/prs')) }
}

const makeWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('useDashboard cold load', () => {
  it('returning Custom-mode viewer fires /api/prs exactly once, correctly scoped', async () => {
    writeSettings('haji', { pollingMs: 30_000, tracking: { mode: 'custom', repos: ['a/b'] } })
    const { prsCalls } = stubFetch({})

    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.state).toBe('ready'))

    expect(prsCalls()).toEqual(['/api/prs?repos=a%2Fb'])
    expect(prsCalls()).not.toContain('/api/prs')
  })

  it('does not fire /api/prs until /api/user resolves, then does (no deadlock)', async () => {
    writeSettings('haji', { pollingMs: 30_000, tracking: { mode: 'custom', repos: ['a/b'] } })
    let resolveUser: (r: Response) => void = () => {}
    const userGate = new Promise<Response>((resolve) => {
      resolveUser = resolve
    })
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      calls.push(url)
      if (url === '/api/user') return userGate
      return Promise.resolve(jsonResponse(200, validDashboardResponse))
    }))

    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() })

    // While /api/user is pending, the gate holds the crawl.
    await waitFor(() => expect(result.current.state).toBe('loading'))
    expect(calls.filter(u => u.startsWith('/api/prs'))).toEqual([])

    resolveUser(jsonResponse(200, { login: 'haji' }))

    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(calls.filter(u => u.startsWith('/api/prs'))).toEqual(['/api/prs?repos=a%2Fb'])
  })

  it('BAD_CREDENTIALS on /api/user is fatal: signed-out, no /api/prs', async () => {
    writeSettings('haji', { pollingMs: 30_000, tracking: { mode: 'custom', repos: ['a/b'] } })
    const { prsCalls } = stubFetch({
      user: () => jsonResponse(401, { error: { code: 'BAD_CREDENTIALS', message: 'no session' } }),
    })

    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.state).toBe('signed-out'))
    expect(prsCalls()).toEqual([])
  })

  it('non-auth /api/user error surfaces a retryable banner, not an indefinite skeleton', async () => {
    writeSettings('haji', { pollingMs: 30_000, tracking: { mode: 'custom', repos: ['a/b'] } })
    const { prsCalls } = stubFetch({
      user: () => jsonResponse(500, { error: { code: 'UPSTREAM_ERROR', message: 'db down' } }),
    })

    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.state).toBe('loading')
    expect(prsCalls()).toEqual([])
  })

  it('unseeded viewer fires one bare /api/prs (All-mode path unchanged)', async () => {
    // no stored settings -> tracking null -> effective All -> bare /api/prs
    const { prsCalls } = stubFetch({})

    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(prsCalls()).toEqual(['/api/prs'])
  })
})
