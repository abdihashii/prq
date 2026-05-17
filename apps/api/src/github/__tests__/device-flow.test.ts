import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollDeviceCode, startDeviceCode } from '../device-flow'

afterEach(() => {
  vi.unstubAllGlobals()
})

const stubFetch = (impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('startDeviceCode', () => {
  it('parses and renames snake_case fields from GitHub', async () => {
    stubFetch(async () =>
      okJson({
        device_code: 'dev-1',
        user_code: 'WXYZ-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      }),
    )

    const out = await startDeviceCode('client-id-123')
    expect(out).toEqual({
      deviceCode: 'dev-1',
      userCode: 'WXYZ-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: 5,
    })
  })

  it('sends client_id and scope in the request body', async () => {
    let captured: RequestInit | undefined
    stubFetch(async (_, init) => {
      captured = init
      return okJson({
        device_code: 'd',
        user_code: 'U-1',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      })
    })

    await startDeviceCode('client-xyz')
    const body = JSON.parse(captured?.body as string)
    expect(body.client_id).toBe('client-xyz')
    expect(body.scope).toBe('repo read:user read:org')
  })

  it('non-200 → throws with status', async () => {
    stubFetch(async () => new Response('boom', { status: 500 }))

    await expect(startDeviceCode('client')).rejects.toMatchObject({ status: 500 })
  })
})

describe('pollDeviceCode', () => {
  it('success response → { kind: "success", accessToken }', async () => {
    stubFetch(async () =>
      okJson({
        access_token: 'access-1',
        token_type: 'bearer',
        scope: 'repo read:user',
      }),
    )

    const out = await pollDeviceCode('client', 'dev-code')
    expect(out).toEqual({ kind: 'success', accessToken: 'access-1' })
  })

  it('authorization_pending → { kind: "pending" }', async () => {
    stubFetch(async () => okJson({ error: 'authorization_pending' }))

    expect(await pollDeviceCode('c', 'd')).toEqual({ kind: 'pending' })
  })

  it('slow_down with interval → { kind: "slow_down", interval }', async () => {
    stubFetch(async () => okJson({ error: 'slow_down', interval: 12 }))

    expect(await pollDeviceCode('c', 'd')).toEqual({ kind: 'slow_down', interval: 12 })
  })

  it('slow_down without interval → falls back to default interval', async () => {
    stubFetch(async () => okJson({ error: 'slow_down' }))

    expect(await pollDeviceCode('c', 'd')).toEqual({ kind: 'slow_down', interval: 10 })
  })

  it('expired_token → { kind: "expired" }', async () => {
    stubFetch(async () => okJson({ error: 'expired_token' }))

    expect(await pollDeviceCode('c', 'd')).toEqual({ kind: 'expired' })
  })

  it('access_denied → { kind: "denied" }', async () => {
    stubFetch(async () => okJson({ error: 'access_denied' }))

    expect(await pollDeviceCode('c', 'd')).toEqual({ kind: 'denied' })
  })

  it('unknown error code → throws', async () => {
    stubFetch(async () => okJson({ error: 'incorrect_device_code' }))

    await expect(pollDeviceCode('c', 'd')).rejects.toThrow(/incorrect_device_code/)
  })
})
