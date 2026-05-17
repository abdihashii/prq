import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getViewer } from '../../github/get-viewer'
import { user } from '../user'

vi.mock('../../github/get-viewer', () => ({
  getViewer: vi.fn(),
}))

const mockedGetViewer = vi.mocked(getViewer)

const makeApp = () => new Hono().route('/api', user)

const WITH_SESSION = {
  headers: { cookie: 'prq_access_token=test-access' },
}

beforeEach(() => {
  mockedGetViewer.mockReset()
})

describe('GET /api/user', () => {
  it('valid session + getViewer succeeds → 200 { login }', async () => {
    mockedGetViewer.mockResolvedValue({ login: 'haji' })

    const res = await makeApp().request('/api/user', WITH_SESSION)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ login: 'haji' })
    expect(mockedGetViewer).toHaveBeenCalledWith('test-access')
  })

  it('no cookie → 401 BAD_CREDENTIALS without hitting GitHub', async () => {
    const res = await makeApp().request('/api/user')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_CREDENTIALS')
    expect(mockedGetViewer).not.toHaveBeenCalled()
  })

  it('GitHub 401 → 401 BAD_CREDENTIALS and clears the cookie', async () => {
    mockedGetViewer.mockRejectedValue(Object.assign(new Error('rejected'), { status: 401 }))

    const res = await makeApp().request('/api/user', WITH_SESSION)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_CREDENTIALS')

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_access_token=')
    expect(cookie).toContain('Max-Age=0')
  })

  it('GitHub 500 → 502 UPSTREAM_ERROR', async () => {
    mockedGetViewer.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

    const res = await makeApp().request('/api/user', WITH_SESSION)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('UPSTREAM_ERROR')
  })
})
