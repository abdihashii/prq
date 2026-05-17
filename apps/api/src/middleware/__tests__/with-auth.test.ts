import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { UnauthorizedError, withAuth } from '../with-auth'

const WITH_SESSION = {
  headers: { cookie: 'prq_access_token=initial-access' },
}

const makeApp = (fn: (token: string) => Promise<unknown>) => {
  const app = new Hono()
  app.get('/probe', async (c) => {
    try {
      const value = await withAuth(c, fn)
      return c.json({ value })
    }
    catch (err) {
      if (err instanceof UnauthorizedError) {
        return c.json({ error: 'unauthorized', message: err.message }, 401)
      }
      if (err && typeof err === 'object' && 'status' in err) {
        return c.json({ status: (err as { status: number }).status }, 500)
      }
      throw err
    }
  })
  return app
}

describe('withAuth', () => {
  it('passes the access token to fn on the happy path', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const res = await makeApp(fn).request('/probe', WITH_SESSION)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: 'ok' })
    expect(fn).toHaveBeenCalledWith('initial-access')
  })

  it('throws UnauthorizedError when the access cookie is missing', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const res = await makeApp(fn).request('/probe')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.message).toBe('Missing session cookie')
    expect(fn).not.toHaveBeenCalled()
  })

  it('on 401, clears the cookie and throws UnauthorizedError', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('rejected'), { status: 401 }))

    const res = await makeApp(fn).request('/probe', WITH_SESSION)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.message).toBe('Access token rejected')

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_access_token=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/api')
  })

  it('rethrows non-401 errors without clearing the cookie', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

    const res = await makeApp(fn).request('/probe', WITH_SESSION)
    expect(res.status).toBe(500)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
