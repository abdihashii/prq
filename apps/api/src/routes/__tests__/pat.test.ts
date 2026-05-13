import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getViewer } from '../../github/get-viewer'
import { pat } from '../pat'

vi.mock('../../github/get-viewer', () => ({
  getViewer: vi.fn(),
}))

const mockedGetViewer = vi.mocked(getViewer)

const makeApp = () => new Hono().route('/api', pat)

beforeEach(() => {
  mockedGetViewer.mockReset()
})

describe('POST /api/pat', () => {
  it('valid PAT → 200 { login } and sets prq_pat cookie with expected flags', async () => {
    mockedGetViewer.mockResolvedValue({ login: 'haji' })

    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pat: 'valid-pat' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ login: 'haji' })

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_pat=valid-pat')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api')
    expect(cookie).toContain('Max-Age=34560000')

    expect(mockedGetViewer).toHaveBeenCalledWith('valid-pat')
  })

  it('GitHub 401 → 401 BAD_CREDENTIALS, no cookie set', async () => {
    mockedGetViewer.mockRejectedValue(Object.assign(new Error('rejected'), { status: 401 }))

    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pat: 'bad-pat' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_CREDENTIALS')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('GitHub 500 → 502 UPSTREAM_ERROR, no cookie set', async () => {
    mockedGetViewer.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pat: 'any-pat' }),
    })

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('UPSTREAM_ERROR')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('empty body → 400 BAD_REQUEST', async () => {
    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(mockedGetViewer).not.toHaveBeenCalled()
  })

  it('empty pat string → 400 BAD_REQUEST', async () => {
    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pat: '' }),
    })

    expect(res.status).toBe(400)
    expect(mockedGetViewer).not.toHaveBeenCalled()
  })

  it('non-JSON body → 400 BAD_REQUEST', async () => {
    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })

    expect(res.status).toBe(400)
    expect(mockedGetViewer).not.toHaveBeenCalled()
  })

  it('body exceeding 1KB → 413 without calling getViewer', async () => {
    const bigPat = 'x'.repeat(2048)
    const res = await makeApp().request('/api/pat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pat: bigPat }),
    })

    expect(res.status).toBe(413)
    expect(mockedGetViewer).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/pat', () => {
  it('returns 204 and emits a Set-Cookie clearing prq_pat', async () => {
    const res = await makeApp().request('/api/pat', { method: 'DELETE' })

    expect(res.status).toBe(204)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_pat=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/api')
  })
})
