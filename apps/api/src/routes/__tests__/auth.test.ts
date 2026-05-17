import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pollDeviceCode, startDeviceCode } from '../../github/device-flow'
import { getViewer } from '../../github/get-viewer'
import { auth } from '../auth'

vi.mock('../../github/device-flow', () => ({
  startDeviceCode: vi.fn(),
  pollDeviceCode: vi.fn(),
}))
vi.mock('../../github/get-viewer', () => ({
  getViewer: vi.fn(),
}))

const mockedStart = vi.mocked(startDeviceCode)
const mockedPoll = vi.mocked(pollDeviceCode)
const mockedGetViewer = vi.mocked(getViewer)

const makeApp = () => new Hono().route('/api', auth)

beforeEach(() => {
  mockedStart.mockReset()
  mockedPoll.mockReset()
  mockedGetViewer.mockReset()
})

describe('POST /api/auth/device/start', () => {
  it('returns the device flow start payload from GitHub', async () => {
    mockedStart.mockResolvedValue({
      deviceCode: 'dev-code-xyz',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      interval: 5,
      expiresIn: 900,
    })

    const res = await makeApp().request('/api/auth/device/start', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      deviceCode: 'dev-code-xyz',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      interval: 5,
      expiresIn: 900,
    })
  })

  it('GitHub failure → 502 UPSTREAM_ERROR', async () => {
    mockedStart.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

    const res = await makeApp().request('/api/auth/device/start', { method: 'POST' })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('UPSTREAM_ERROR')
  })
})

describe('POST /api/auth/device/poll', () => {
  const post = (body: unknown) =>
    makeApp().request('/api/auth/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('pending → { status: "pending" } and no cookies', async () => {
    mockedPoll.mockResolvedValue({ kind: 'pending' })

    const res = await post({ deviceCode: 'dev-code' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'pending' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('slow_down → { status: "slow_down", interval }', async () => {
    mockedPoll.mockResolvedValue({ kind: 'slow_down', interval: 10 })

    const res = await post({ deviceCode: 'dev-code' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'slow_down', interval: 10 })
  })

  it('expired → { status: "expired" }', async () => {
    mockedPoll.mockResolvedValue({ kind: 'expired' })

    const res = await post({ deviceCode: 'dev-code' })
    expect(await res.json()).toEqual({ status: 'expired' })
  })

  it('denied → { status: "denied" }', async () => {
    mockedPoll.mockResolvedValue({ kind: 'denied' })

    const res = await post({ deviceCode: 'dev-code' })
    expect(await res.json()).toEqual({ status: 'denied' })
  })

  it('success → sets the access cookie and returns { status, login }', async () => {
    mockedPoll.mockResolvedValue({ kind: 'success', accessToken: 'access-1' })
    mockedGetViewer.mockResolvedValue({ login: 'haji' })

    const res = await post({ deviceCode: 'dev-code' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'success', login: 'haji' })

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_access_token=access-1')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api')

    expect(mockedGetViewer).toHaveBeenCalledWith('access-1')
  })

  it('non-JSON body → 400 BAD_REQUEST', async () => {
    const res = await makeApp().request('/api/auth/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
    expect(mockedPoll).not.toHaveBeenCalled()
  })

  it('missing deviceCode → 400 BAD_REQUEST', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect(mockedPoll).not.toHaveBeenCalled()
  })

  it('body > 1KB → 413 without polling', async () => {
    const big = 'x'.repeat(2048)
    const res = await post({ deviceCode: big })
    expect(res.status).toBe(413)
    expect(mockedPoll).not.toHaveBeenCalled()
  })

  it('pollDeviceCode throws → 502 UPSTREAM_ERROR', async () => {
    mockedPoll.mockRejectedValue(Object.assign(new Error('boom'), { status: 502 }))

    const res = await post({ deviceCode: 'dev-code' })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('UPSTREAM_ERROR')
  })
})

describe('DELETE /api/auth/session', () => {
  it('returns 204 and clears the session cookie', async () => {
    const res = await makeApp().request('/api/auth/session', { method: 'DELETE' })
    expect(res.status).toBe(204)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_access_token=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/api')
  })
})
