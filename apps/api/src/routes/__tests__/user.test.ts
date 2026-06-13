import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthenticatedViewer, UnauthorizedError } from '../../auth/session'
import type { AppEnv, RequestContext } from '../../request-context'
import { user } from '../user'

vi.mock('../../auth/session', async importOriginal => ({
  ...await importOriginal<typeof import('../../auth/session')>(),
  getAuthenticatedViewer: vi.fn(),
}))

const mockedViewer = vi.mocked(getAuthenticatedViewer)
const makeApp = () => {
  const app = new Hono<AppEnv>()
  app.use('/api/*', async (c, next) => {
    c.set('ctx', { authDeps: {} } as unknown as RequestContext)
    await next()
  })
  return app.route('/api', user)
}

beforeEach(() => {
  mockedViewer.mockReset()
})

describe('GET /api/user', () => {
  it('returns login from the stored database session', async () => {
    mockedViewer.mockResolvedValue({ githubId: 'U_haji', login: 'haji' })

    const res = await makeApp().request('/api/user')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ login: 'haji' })
  })

  it('maps unavailable sessions to 401 BAD_CREDENTIALS', async () => {
    mockedViewer.mockRejectedValue(new UnauthorizedError('missing'))

    const res = await makeApp().request('/api/user')

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_CREDENTIALS' } })
  })

  it('maps unexpected stored-user failures without leaking details', async () => {
    mockedViewer.mockRejectedValue(new Error('database details'))

    const res = await makeApp().request('/api/user')

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: { code: 'UPSTREAM_ERROR', message: 'Failed to load user' },
    })
  })
})
