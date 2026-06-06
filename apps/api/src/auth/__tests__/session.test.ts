import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { GitHubAppAuthConfig } from '../../config'
import {
  type AuthStore,
  beginGitHubAppSignIn,
  completeGitHubAppCallback,
  createPkceChallenge,
  hashSessionId,
  sessionExpiresAt,
  withAuth,
} from '../session'

const NOW = new Date('2026-05-31T12:00:00.000Z')
const CONFIG: GitHubAppAuthConfig = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  callbackUrl: 'http://localhost:3001/api/auth/github/callback',
  webUrl: 'http://localhost:5173/',
}

function makeStore(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    upsertUser: vi.fn(async () => {}),
    createSession: vi.fn(async () => {}),
    findSession: vi.fn(async () => null),
    updateSessionTokens: vi.fn(async () => {}),
    deleteSession: vi.fn(async () => {}),
    upsertInstallations: vi.fn(async () => {}),
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('GitHub App OAuth helpers', () => {
  it('builds the GitHub authorize redirect and stores state/verifier cookies', async () => {
    const app = new Hono()
    app.get('/start', c => beginGitHubAppSignIn(c, {
      config: CONFIG,
      createState: () => 'state-1',
      createVerifier: () => 'verifier-1',
    }))

    const res = await app.request('/start')
    expect(res.status).toBe(302)

    const location = new URL(res.headers.get('location') ?? '')
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('client-1')
    expect(location.searchParams.get('redirect_uri')).toBe(CONFIG.callbackUrl)
    expect(location.searchParams.get('state')).toBe('state-1')
    expect(location.searchParams.get('code_challenge')).toBe(createPkceChallenge('verifier-1'))
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_oauth_state=state-1')
    expect(cookie).toContain('prq_oauth_verifier=verifier-1')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/api/auth/github')
  })

  it('chooses the shortest usable session expiry', () => {
    expect(sessionExpiresAt({
      accessTokenExpiresAt: new Date('2026-05-31T20:00:00.000Z'),
      refreshTokenExpiresAt: new Date('2026-12-01T12:00:00.000Z'),
    }, NOW)).toEqual(new Date('2026-06-30T12:00:00.000Z'))

    expect(sessionExpiresAt({
      accessTokenExpiresAt: new Date('2026-05-31T20:00:00.000Z'),
      refreshTokenExpiresAt: null,
    }, NOW)).toEqual(new Date('2026-05-31T20:00:00.000Z'))
  })
})

describe('completeGitHubAppCallback', () => {
  it('exchanges the code, persists user/session/installations, and redirects to web', async () => {
    const store = makeStore()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        return jsonResponse({
          access_token: 'access-1',
          expires_in: 8 * 60 * 60,
          refresh_token: 'refresh-1',
          refresh_token_expires_in: 180 * 24 * 60 * 60,
        })
      }
      if (url === 'https://api.github.com/user') {
        return jsonResponse({ id: 1001, login: 'haji' })
      }
      if (url === 'https://api.github.com/user/installations') {
        return jsonResponse({
          installations: [
            {
              id: 42,
              account: { id: 7, login: 'acme', type: 'Organization' },
              suspended_at: null,
            },
          ],
        })
      }
      return jsonResponse({ error: 'unexpected url' }, 500)
    })

    const app = new Hono()
    app.get('/callback', c => completeGitHubAppCallback(c, {
      config: CONFIG,
      store,
      fetch: fetchMock,
      now: () => NOW,
      createSessionId: () => 'session-plain',
    }))

    const res = await app.request('/callback?code=code-1&state=state-1&installation_id=42', {
      headers: {
        cookie:
          'prq_oauth_state=state-1; prq_oauth_verifier=verifier-1; prq_access_token=legacy-1',
      },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(CONFIG.webUrl)
    expect(store.upsertUser).toHaveBeenCalledWith({ githubId: '1001', login: 'haji' }, NOW)
    expect(store.upsertInstallations).toHaveBeenCalledWith([
      {
        githubInstallationId: '42',
        accountGithubId: '7',
        accountLogin: 'acme',
        accountType: 'Organization',
        active: true,
        suspendedAt: null,
      },
    ], NOW)
    expect(store.createSession).toHaveBeenCalledWith({
      sessionIdHash: hashSessionId('session-plain'),
      githubUserId: '1001',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      accessTokenExpiresAt: new Date('2026-05-31T20:00:00.000Z'),
      refreshTokenExpiresAt: new Date('2026-11-27T12:00:00.000Z'),
      expiresAt: new Date('2026-06-30T12:00:00.000Z'),
    }, NOW)

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_session=session-plain')
    expect(cookie).toContain('prq_access_token=')
    expect(cookie).toContain('Max-Age=0')
  })

  it('rejects a callback installation id the user token cannot access', async () => {
    const store = makeStore()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        return jsonResponse({ access_token: 'access-1' })
      }
      if (url === 'https://api.github.com/user') {
        return jsonResponse({ id: 1001, login: 'haji' })
      }
      if (url === 'https://api.github.com/user/installations') {
        return jsonResponse({
          installations: [
            { id: 42, account: { id: 7, login: 'acme', type: 'Organization' } },
          ],
        })
      }
      return jsonResponse({ error: 'unexpected url' }, 500)
    })

    const app = new Hono()
    app.get('/callback', async (c) => {
      try {
        await completeGitHubAppCallback(c, {
          config: CONFIG,
          store,
          fetch: fetchMock,
          now: () => NOW,
          createSessionId: () => 'session-plain',
        })
        return c.text('unexpected', 500)
      }
      catch (err) {
        return c.json({
          name: err instanceof Error ? err.name : 'unknown',
          code: err && typeof err === 'object' && 'code' in err
            ? (err as { code: string }).code
            : null,
        }, 400)
      }
    })

    const res = await app.request('/callback?code=code-1&state=state-1&installation_id=99', {
      headers: { cookie: 'prq_oauth_state=state-1; prq_oauth_verifier=verifier-1' },
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'GitHubAppAuthFlowError',
      code: 'installation_unverified',
    })
    expect(store.createSession).not.toHaveBeenCalled()
  })
})

describe('withAuth', () => {
  it('refreshes an expiring DB-backed session before invoking the caller', async () => {
    const store = makeStore({
      findSession: vi.fn(async () => ({
        sessionIdHash: hashSessionId('session-plain'),
        githubUserId: '1001',
        accessToken: 'old-access',
        refreshToken: 'refresh-1',
        accessTokenExpiresAt: new Date('2026-05-31T12:00:30.000Z'),
        refreshTokenExpiresAt: new Date('2026-12-01T12:00:00.000Z'),
        expiresAt: new Date('2026-06-30T12:00:00.000Z'),
      })),
    })
    const fetchMock = vi.fn(async () => jsonResponse({
      access_token: 'new-access',
      expires_in: 8 * 60 * 60,
      refresh_token: 'refresh-2',
      refresh_token_expires_in: 180 * 24 * 60 * 60,
    }))
    const fn = vi.fn(async () => 'ok')

    const app = new Hono()
    app.get('/probe', async (c) => {
      const value = await withAuth(c, fn, {
        config: CONFIG,
        store,
        fetch: fetchMock,
        now: () => NOW,
      })
      return c.json({ value })
    })

    const res = await app.request('/probe', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: 'ok' })
    expect(fn).toHaveBeenCalledWith('new-access')
    expect(store.updateSessionTokens).toHaveBeenCalledWith(hashSessionId('session-plain'), {
      accessToken: 'new-access',
      refreshToken: 'refresh-2',
      accessTokenExpiresAt: new Date('2026-05-31T20:00:00.000Z'),
      refreshTokenExpiresAt: new Date('2026-11-27T12:00:00.000Z'),
      expiresAt: new Date('2026-06-30T12:00:00.000Z'),
    }, NOW)

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('prq_session=session-plain')
  })
})
