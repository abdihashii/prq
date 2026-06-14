import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCurrentAuthSession, getAuthenticatedPrincipal } from '../../auth/session'
import type { AppEnv, RequestContext } from '../../request-context'
import { prs } from '../prs'

const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }))

vi.mock('../../auth/session', async importOriginal => ({
  ...await importOriginal<typeof import('../../auth/session')>(),
  clearCurrentAuthSession: vi.fn(),
  getAuthenticatedPrincipal: vi.fn(),
}))

const mockedPrincipal = vi.mocked(getAuthenticatedPrincipal)
const mockedClearSession = vi.mocked(clearCurrentAuthSession)

const response = {
  buckets: { review: [], attention: [], ready: [], waiting: [], drafts: [] },
  viewerLogin: 'haji',
  syncedAt: '2026-06-07T12:00:00.000Z',
  rateLimit: {
    cost: 0,
    remaining: 0,
    resetAt: '2026-06-07T12:00:00.000Z',
  },
  trackableRepos: [],
}

const makeApp = () => {
  const app = new Hono<AppEnv>()
  app.use('/api/*', async (c, next) => {
    c.set('ctx', { dashboard: { getDashboard }, authDeps: {} } as unknown as RequestContext)
    await next()
  })
  return app.route('/api', prs)
}

beforeEach(() => {
  mockedPrincipal.mockReset()
  mockedPrincipal.mockResolvedValue({
    githubId: 'U_haji',
    login: 'haji',
    accessToken: 'secret-token',
  })
  mockedClearSession.mockReset()
  mockedClearSession.mockResolvedValue()
  getDashboard.mockReset()
  getDashboard.mockResolvedValue(response)
})

describe('GET /api/prs', () => {
  it('authenticates the principal and delegates the parsed repo allowlist', async () => {
    const res = await makeApp().request('/api/prs?repos=garbage,vercel%2Fnext.js')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(response)
    expect(getDashboard).toHaveBeenCalledWith({
      principal: { githubId: 'U_haji', login: 'haji', accessToken: 'secret-token' },
      repositoryAllowlist: new Set(['vercel/next.js']),
    })
  })

  it('accepts a double-encoded slash and silently drops malformed percent escapes', async () => {
    await makeApp().request('/api/prs?repos=vercel%252Fnext.js')
    expect(getDashboard).toHaveBeenLastCalledWith(expect.objectContaining({
      repositoryAllowlist: new Set(['vercel/next.js']),
    }))

    await makeApp().request('/api/prs?repos=foo%25')
    expect(getDashboard).toHaveBeenLastCalledWith(expect.objectContaining({
      repositoryAllowlist: new Set(),
    }))
  })

  it('returns 401 BAD_CREDENTIALS when the database session is unavailable', async () => {
    const { UnauthorizedError } = await import('../../auth/session')
    mockedPrincipal.mockRejectedValue(new UnauthorizedError('missing'))

    const res = await makeApp().request('/api/prs')

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_CREDENTIALS' } })
    expect(getDashboard).not.toHaveBeenCalled()
  })

  it('invalidates rejected GitHub credentials and clears the session cookie', async () => {
    const { DashboardBadCredentialsError } = await import('../../dashboard/errors')
    getDashboard.mockRejectedValue(new DashboardBadCredentialsError())

    const res = await makeApp().request('/api/prs')

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_CREDENTIALS' } })
    expect(mockedClearSession).toHaveBeenCalledOnce()
  })

  it('maps GitHub rate limits without leaking details', async () => {
    const { DashboardRateLimitedError } = await import('../../dashboard/errors')
    getDashboard.mockRejectedValue(new DashboardRateLimitedError())

    const res = await makeApp().request('/api/prs')

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'GitHub rate limit exceeded' },
    })
  })

  it('maps unexpected dashboard failures without leaking details', async () => {
    getDashboard.mockRejectedValue(new Error('database connection details'))

    const res = await makeApp().request('/api/prs')

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: { code: 'UPSTREAM_ERROR', message: 'Failed to load dashboard' },
    })
  })
})
