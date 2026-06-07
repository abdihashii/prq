import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthenticatedViewer } from '../../auth/session'
import { prs } from '../prs'

const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }))

vi.mock('../../auth/session', async importOriginal => ({
  ...await importOriginal<typeof import('../../auth/session')>(),
  getAuthenticatedViewer: vi.fn(),
}))
vi.mock('../../dashboard/dashboard', () => ({
  createDashboardService: () => ({ getDashboard }),
}))

const mockedViewer = vi.mocked(getAuthenticatedViewer)

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

const makeApp = () => new Hono().route('/api', prs)

beforeEach(() => {
  mockedViewer.mockReset()
  mockedViewer.mockResolvedValue({ githubId: 'U_haji', login: 'haji' })
  getDashboard.mockReset()
  getDashboard.mockResolvedValue(response)
})

describe('GET /api/prs', () => {
  it('authenticates the stored viewer and delegates the parsed repo allowlist', async () => {
    const res = await makeApp().request('/api/prs?repos=garbage,vercel%2Fnext.js')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(response)
    expect(getDashboard).toHaveBeenCalledWith({
      viewer: { githubId: 'U_haji', login: 'haji' },
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
    mockedViewer.mockRejectedValue(new UnauthorizedError('missing'))

    const res = await makeApp().request('/api/prs')

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_CREDENTIALS' } })
    expect(getDashboard).not.toHaveBeenCalled()
  })

  it('maps unexpected dashboard failures without leaking details', async () => {
    getDashboard.mockRejectedValue(new Error('database connection details'))

    const res = await makeApp().request('/api/prs')

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: { code: 'UPSTREAM_ERROR', message: 'Failed to load dashboard' },
    })
  })
})
