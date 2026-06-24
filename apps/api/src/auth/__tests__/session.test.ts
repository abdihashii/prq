import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { GitHubAppAuthConfig } from '../../config'
import {
  type AuthStore,
  beginGitHubAppSignIn,
  completeGitHubAppCallback,
  completeGitHubAppSetup,
  createPkceChallenge,
  getAuthenticatedViewer,
  hashSessionId,
  sessionExpiresAt,
} from '../session'

const NOW = new Date('2026-05-31T12:00:00.000Z')
const CONFIG: GitHubAppAuthConfig = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  callbackUrl: 'http://localhost:3001/api/auth/github/callback',
  webUrl: 'http://localhost:5173/',
  allowedUserIds: ['1001'],
}

function makeStore(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    upsertUser: vi.fn(async () => {}),
    createSession: vi.fn(async () => {}),
    findSession: vi.fn(async () => null),
    updateSessionTokens: vi.fn(async () => {}),
    deleteSession: vi.fn(async () => {}),
    upsertInstallations: vi.fn(async () => {}),
    markAuthorizedScopeStale: vi.fn(async () => {}),
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
        cookie: 'prq_oauth_state=state-1; prq_oauth_verifier=verifier-1',
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

  async function runCallbackWithAllowedUserIds(
    allowedUserIds: readonly string[],
  ): Promise<{ res: Response, store: AuthStore }> {
    const store = makeStore()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        return jsonResponse({ access_token: 'access-1' })
      }
      if (url === 'https://api.github.com/user') {
        return jsonResponse({ id: 1001, login: 'haji' })
      }
      return jsonResponse({ error: 'unexpected url' }, 500)
    })

    const app = new Hono()
    app.get('/callback', async (c) => {
      try {
        await completeGitHubAppCallback(c, {
          config: { ...CONFIG, allowedUserIds },
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

    const res = await app.request('/callback?code=code-1&state=state-1', {
      headers: { cookie: 'prq_oauth_state=state-1; prq_oauth_verifier=verifier-1' },
    })
    return { res, store }
  }

  it('rejects a user whose id is not on the allowlist', async () => {
    const { res, store } = await runCallbackWithAllowedUserIds(['9999'])

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'GitHubAppAuthFlowError',
      code: 'user_not_allowed',
    })
    expect(store.upsertUser).not.toHaveBeenCalled()
    expect(store.createSession).not.toHaveBeenCalled()
  })

  it('denies every user when the allowlist is empty (fail-closed)', async () => {
    const { res, store } = await runCallbackWithAllowedUserIds([])

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'GitHubAppAuthFlowError',
      code: 'user_not_allowed',
    })
    expect(store.createSession).not.toHaveBeenCalled()
  })
})

describe('getAuthenticatedViewer', () => {
  it('refreshes an expiring DB-backed session before returning the viewer', async () => {
    const store = makeStore({
      findSession: vi.fn(async () => ({
        sessionIdHash: hashSessionId('session-plain'),
        githubUserId: '1001',
        githubUserLogin: 'haji',
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
    const app = new Hono()
    app.get('/probe', async (c) => {
      const viewer = await getAuthenticatedViewer(c, {
        config: CONFIG,
        store,
        fetch: fetchMock,
        now: () => NOW,
      })
      return c.json({ viewer })
    })

    const res = await app.request('/probe', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ viewer: { githubId: '1001', login: 'haji' } })
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

  it('invalidates an expiring session when GitHub rejects its refresh token', async () => {
    const store = makeStore({
      findSession: vi.fn(async () => ({
        sessionIdHash: hashSessionId('session-plain'),
        githubUserId: '1001',
        githubUserLogin: 'haji',
        accessToken: 'old-access',
        refreshToken: 'rejected-refresh',
        accessTokenExpiresAt: new Date('2026-05-31T12:00:30.000Z'),
        refreshTokenExpiresAt: new Date('2026-12-01T12:00:00.000Z'),
        expiresAt: new Date('2026-06-30T12:00:00.000Z'),
      })),
    })
    const app = new Hono()
    app.get('/viewer', async (c) => {
      try {
        return c.json(await getAuthenticatedViewer(c, {
          config: CONFIG,
          store,
          fetch: vi.fn(async () => jsonResponse({ error: 'bad_refresh_token' }, 400)),
          now: () => NOW,
        }))
      }
      catch (error) {
        return c.json({ name: error instanceof Error ? error.name : 'unknown' }, 401)
      }
    })

    const res = await app.request('/viewer', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ name: 'UnauthorizedError' })
    expect(store.deleteSession).toHaveBeenCalledWith(hashSessionId('session-plain'))
    expect(res.headers.get('set-cookie')).toContain('prq_session=')
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('resolves stored viewer identity without a GitHub request', async () => {
    const store = makeStore({
      findSession: vi.fn(async () => ({
        sessionIdHash: hashSessionId('session-plain'),
        githubUserId: '1001',
        githubUserLogin: 'haji',
        accessToken: 'access-1',
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        expiresAt: new Date('2026-06-30T12:00:00.000Z'),
      })),
    })
    const fetchMock = vi.fn()
    const app = new Hono()
    app.get('/viewer', async (c) => c.json(await getAuthenticatedViewer(c, {
      store,
      fetch: fetchMock,
      now: () => NOW,
    })))

    const res = await app.request('/viewer', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(await res.json()).toEqual({ githubId: '1001', login: 'haji' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects the removed legacy access-token cookie', async () => {
    const app = new Hono()
    app.get('/viewer', async (c) => {
      try {
        return c.json(await getAuthenticatedViewer(c, { store: makeStore() }))
      }
      catch (error) {
        return c.json({ name: error instanceof Error ? error.name : 'unknown' }, 401)
      }
    })

    const res = await app.request('/viewer', {
      headers: { cookie: 'prq_access_token=legacy-access' },
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ name: 'UnauthorizedError' })
  })
})

describe('completeGitHubAppSetup', () => {
  it('invalidates the user scope after verifying the install', async () => {
    const store = makeStore({
      findSession: vi.fn(async () => ({
        sessionIdHash: hashSessionId('session-plain'),
        githubUserId: '1001',
        githubUserLogin: 'haji',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        accessTokenExpiresAt: new Date('2026-05-31T20:00:00.000Z'),
        refreshTokenExpiresAt: new Date('2026-12-01T12:00:00.000Z'),
        expiresAt: new Date('2026-06-30T12:00:00.000Z'),
      })),
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://api.github.com/user/installations') {
        return jsonResponse({
          installations: [
            { id: 42, account: { id: 7, login: 'acme', type: 'Organization' } },
          ],
        })
      }
      return jsonResponse({ error: 'unexpected url' }, 500)
    })

    const app = new Hono()
    app.get('/setup', c => completeGitHubAppSetup(c, {
      config: CONFIG,
      store,
      fetch: fetchMock,
      now: () => NOW,
    }))

    const res = await app.request('/setup?installation_id=42', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('installation=connected')
    expect(store.markAuthorizedScopeStale).toHaveBeenCalledWith('1001')
  })

  it('does not invalidate scope when the install cannot be verified', async () => {
    const store = makeStore({
      findSession: vi.fn(async () => ({
        sessionIdHash: hashSessionId('session-plain'),
        githubUserId: '1001',
        githubUserLogin: 'haji',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        accessTokenExpiresAt: new Date('2026-05-31T20:00:00.000Z'),
        refreshTokenExpiresAt: new Date('2026-12-01T12:00:00.000Z'),
        expiresAt: new Date('2026-06-30T12:00:00.000Z'),
      })),
    })
    const fetchMock = vi.fn(async () => jsonResponse({ installations: [] }))

    const app = new Hono()
    app.get('/setup', c => completeGitHubAppSetup(c, {
      config: CONFIG,
      store,
      fetch: fetchMock,
      now: () => NOW,
    }))

    const res = await app.request('/setup?installation_id=42', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('installation_unverified')
    expect(store.markAuthorizedScopeStale).not.toHaveBeenCalled()
  })
})
