import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv, RequestContext } from '../../request-context'
import { auth } from '../auth'

const makeApp = () => {
  const app = new Hono<AppEnv>()
  app.use('/api/*', async (c, next) => {
    c.set('ctx', { authDeps: {} } as unknown as RequestContext)
    await next()
  })
  return app.route('/api', auth)
}

describe('legacy device-flow routes', () => {
  it('are removed', async () => {
    expect((await makeApp().request('/api/auth/device/start', { method: 'POST' })).status).toBe(404)
    expect((await makeApp().request('/api/auth/device/poll', { method: 'POST' })).status).toBe(404)
  })
})

describe('DELETE /api/auth/session', () => {
  it('returns 204 and clears the database session cookie', async () => {
    const res = await makeApp().request('/api/auth/session', { method: 'DELETE' })

    expect(res.status).toBe(204)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_session=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/api')
    expect(cookie).not.toContain('prq_access_token=')
  })
})
