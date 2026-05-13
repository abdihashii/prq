import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getViewer } from '../../github/get-viewer'
import { user } from '../user'

vi.mock('../../github/get-viewer', () => ({
  getViewer: vi.fn(),
}))

const mockedGetViewer = vi.mocked(getViewer)

const makeApp = () => new Hono().route('/api', user)

const WITH_COOKIE = { headers: { cookie: 'prq_pat=test-pat' } }

beforeEach(() => {
  mockedGetViewer.mockReset()
})

describe('GET /api/user', () => {
  it('cookie present + getViewer succeeds → 200 { login }', async () => {
    mockedGetViewer.mockResolvedValue({ login: 'haji' })

    const res = await makeApp().request('/api/user', WITH_COOKIE)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ login: 'haji' })
    expect(mockedGetViewer).toHaveBeenCalledWith('test-pat')
  })

  it('no cookie → 401 BAD_CREDENTIALS without hitting GitHub', async () => {
    const res = await makeApp().request('/api/user')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_CREDENTIALS')
    expect(mockedGetViewer).not.toHaveBeenCalled()
  })

  it('GitHub 401 → 401 BAD_CREDENTIALS', async () => {
    mockedGetViewer.mockRejectedValue(Object.assign(new Error('rejected'), { status: 401 }))

    const res = await makeApp().request('/api/user', WITH_COOKIE)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_CREDENTIALS')
  })

  it('GitHub 500 → 502 UPSTREAM_ERROR', async () => {
    mockedGetViewer.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

    const res = await makeApp().request('/api/user', WITH_COOKIE)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('UPSTREAM_ERROR')
  })
})
