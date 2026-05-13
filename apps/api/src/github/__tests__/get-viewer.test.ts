import { afterEach, describe, expect, it, vi } from 'vitest'
import { getViewer } from '../get-viewer'

afterEach(() => {
  vi.unstubAllGlobals()
})

const stubFetch = (impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('getViewer', () => {
  it('200 → { login } on success', async () => {
    stubFetch(async () => new Response(JSON.stringify({ login: 'haji' }), { status: 200 }))

    const result = await getViewer('valid-pat')
    expect(result).toEqual({ login: 'haji' })
  })

  it('sends Authorization, User-Agent, and Accept headers', async () => {
    let captured: RequestInit | undefined
    stubFetch(async (_, init) => {
      captured = init
      return new Response(JSON.stringify({ login: 'haji' }), { status: 200 })
    })

    await getViewer('my-pat')
    const headers = captured?.headers as Record<string, string>
    expect(headers['authorization']).toBe('token my-pat')
    expect(headers['user-agent']).toBe('prq')
    expect(headers['accept']).toBe('application/vnd.github+json')
  })

  it('401 → throws error with status: 401', async () => {
    stubFetch(async () => new Response('Bad credentials', { status: 401 }))

    await expect(getViewer('bad-pat')).rejects.toMatchObject({ status: 401 })
  })

  it('500 → throws error with status: 500', async () => {
    stubFetch(async () => new Response('Server error', { status: 500 }))

    await expect(getViewer('any-pat')).rejects.toMatchObject({ status: 500 })
  })
})
