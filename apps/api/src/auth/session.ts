import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  githubAppAuthConfig,
  isProductionEnv,
  missingGitHubAppAuthConfig,
  type GitHubAppAuthConfig,
} from '../config'
import { getDatabase, type Database } from '../db'
import { defaultFetch } from '../fetch'
import { githubInstallations, githubSessions, githubUsers } from '../db/schema'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_USER_INSTALLATIONS_URL = 'https://api.github.com/user/installations'

const SESSION_COOKIE = 'prq_session'
const OAUTH_STATE_COOKIE = 'prq_oauth_state'
const OAUTH_VERIFIER_COOKIE = 'prq_oauth_verifier'

const API_COOKIE_PATH = '/api'
const OAUTH_COOKIE_PATH = '/api/auth/github'
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60

const GitHubIdSchema = z.union([z.string(), z.number().int()]).transform(String)
const GitHubViewerSchema = z.object({
  id: GitHubIdSchema,
  login: z.string().min(1),
})
const GitHubAccountTypeSchema = z.enum(['User', 'Organization'])
const RawGitHubInstallationSchema = z.object({
  id: GitHubIdSchema,
  account: z.object({
    id: GitHubIdSchema,
    login: z.string().min(1),
    type: GitHubAccountTypeSchema,
  }),
  suspended_at: z.string().nullable().optional(),
})
const GitHubInstallationsResponseSchema = z.object({
  installations: z.array(RawGitHubInstallationSchema),
})
const GitHubTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
})
const GitHubTokenErrorSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
})

type GitHubAccountType = z.infer<typeof GitHubAccountTypeSchema>

export interface GitHubUserRecord {
  githubId: string
  login: string
}

export interface GitHubInstallationRecord {
  githubInstallationId: string
  accountGithubId: string
  accountLogin: string
  accountType: GitHubAccountType
  active: boolean
  suspendedAt: Date | null
}

export interface StoredAuthSession {
  sessionIdHash: string
  githubUserId: string
  githubUserLogin: string
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  expiresAt: Date
}

export type NewAuthSession = Omit<StoredAuthSession, 'githubUserLogin'>

export interface RefreshedAuthSessionTokens {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt?: Date | null
  expiresAt: Date
}

export interface AuthStore {
  upsertUser: (user: GitHubUserRecord, now: Date) => Promise<void>
  createSession: (session: NewAuthSession, now: Date) => Promise<void>
  findSession: (sessionIdHash: string) => Promise<StoredAuthSession | null>
  updateSessionTokens: (
    sessionIdHash: string,
    tokens: RefreshedAuthSessionTokens,
    now: Date,
  ) => Promise<void>
  deleteSession: (sessionIdHash: string) => Promise<void>
  upsertInstallations: (installations: GitHubInstallationRecord[], now: Date) => Promise<void>
}

export interface AuthDependencies {
  config?: GitHubAppAuthConfig
  store?: AuthStore
  /** Whether auth cookies are set with the Secure flag. Defaults to production. */
  cookieSecure?: boolean
  fetch?: typeof fetch
  now?: () => Date
  createState?: () => string
  createVerifier?: () => string
  createSessionId?: () => string
}

export interface AuthenticatedPrincipal extends AuthenticatedViewer {
  accessToken: string
}

export interface AuthenticatedViewer {
  githubId: string
  login: string
}

interface TokenSet {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt?: Date | null
  expiresAt: Date
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class GitHubAppAuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubAppAuthConfigError'
  }
}

export class GitHubAppAuthFlowError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'GitHubAppAuthFlowError'
  }
}

export function beginGitHubAppSignIn(
  c: Context,
  deps: AuthDependencies = {},
): Response {
  const config = requireGitHubAppConfig(deps.config ?? githubAppAuthConfig)
  const state = deps.createState?.() ?? randomOpaqueValue()
  const verifier = deps.createVerifier?.() ?? randomPkceVerifier()
  const challenge = createPkceChallenge(verifier)
  const secure = resolveCookieSecure(deps)

  setOAuthCookie(c, OAUTH_STATE_COOKIE, state, secure)
  setOAuthCookie(c, OAUTH_VERIFIER_COOKIE, verifier, secure)

  const url = new URL(GITHUB_AUTHORIZE_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.callbackUrl)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return c.redirect(url.toString(), 302)
}

export async function completeGitHubAppCallback(
  c: Context,
  deps: AuthDependencies = {},
): Promise<Response> {
  const config = requireGitHubAppConfig(deps.config ?? githubAppAuthConfig)
  const now = currentTime(deps)
  const fetchImpl = deps.fetch ?? defaultFetch
  const store = resolveStore(deps)
  const stateCookie = getCookie(c, OAUTH_STATE_COOKIE)
  const verifier = getCookie(c, OAUTH_VERIFIER_COOKIE)

  clearOAuthCookies(c)

  const returnedState = c.req.query('state')
  const code = c.req.query('code')
  if (c.req.query('error')) {
    throw new GitHubAppAuthFlowError('GitHub authorization was not completed', 'github_error')
  }
  if (!code || !returnedState || !stateCookie || !verifier || returnedState !== stateCookie) {
    throw new GitHubAppAuthFlowError('Invalid GitHub authorization callback', 'invalid_state')
  }

  const tokenSet = await exchangeCodeForToken({
    code,
    verifier,
    config,
    fetchImpl,
    now,
  })
  const user = await fetchGitHubViewer(tokenSet.accessToken, fetchImpl)
  verifyUserAllowed(user, config.allowedUserIds)
  const installations = await fetchGitHubUserInstallations(tokenSet.accessToken, fetchImpl)
  verifyCallbackInstallation(c.req.query('installation_id'), installations)

  await store.upsertUser(user, now)
  await store.upsertInstallations(installations, now)

  const sessionId = deps.createSessionId?.() ?? randomOpaqueValue()
  await store.createSession({
    sessionIdHash: hashSessionId(sessionId),
    githubUserId: user.githubId,
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken ?? null,
    accessTokenExpiresAt: tokenSet.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokenSet.refreshTokenExpiresAt ?? null,
    expiresAt: tokenSet.expiresAt,
  }, now)

  setDatabaseSessionCookie(c, sessionId, tokenSet.expiresAt, now, resolveCookieSecure(deps))

  return c.redirect(buildWebRedirect(config.webUrl), 302)
}

export function redirectToGitHubAppInstall(
  c: Context,
  deps: AuthDependencies = {},
): Response {
  const config = deps.config ?? githubAppAuthConfig
  if (!config.appSlug) {
    throw new GitHubAppAuthConfigError('PRQ_GITHUB_APP_SLUG is required for install redirects')
  }

  return c.redirect(
    `https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new`,
    302,
  )
}

export function redirectToGitHubAppAuthError(
  c: Context,
  code: string,
  deps: AuthDependencies = {},
): Response {
  const config = deps.config ?? githubAppAuthConfig
  return c.redirect(buildWebRedirect(config.webUrl, { auth: code }), 302)
}

export async function completeGitHubAppSetup(
  c: Context,
  deps: AuthDependencies = {},
): Promise<Response> {
  const config = deps.config ?? githubAppAuthConfig
  const installationId = c.req.query('installation_id')
  if (!installationId) {
    return c.redirect(buildWebRedirect(config.webUrl, { auth: 'installation_missing' }), 302)
  }

  try {
    const resolved = await resolveAuthToken(c, deps)
    const installations = await syncInstallationsForAccessToken(
      resolved.accessToken,
      currentTime(deps),
      deps,
    )
    if (!installations.some(installation =>
      installation.githubInstallationId === installationId
    )) {
      return c.redirect(buildWebRedirect(config.webUrl, { auth: 'installation_unverified' }), 302)
    }

    return c.redirect(buildWebRedirect(config.webUrl, { installation: 'connected' }), 302)
  }
  catch (err) {
    if (err instanceof UnauthorizedError) {
      return beginGitHubAppSignIn(c, deps)
    }
    throw err
  }
}

export async function clearCurrentAuthSession(
  c: Context,
  deps: AuthDependencies = {},
): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE)
  try {
    if (sessionId) {
      await resolveStore(deps).deleteSession(hashSessionId(sessionId))
    }
  }
  catch (err) {
    console.error('failed to delete auth session:', err)
  }
  finally {
    clearDatabaseSessionCookie(c)
    clearOAuthCookies(c)
  }
}

export async function getAuthenticatedViewer(
  c: Context,
  deps: AuthDependencies = {},
): Promise<AuthenticatedViewer> {
  const { accessToken: _accessToken, ...viewer } = await getAuthenticatedPrincipal(c, deps)
  return viewer
}

export async function getAuthenticatedPrincipal(
  c: Context,
  deps: AuthDependencies = {},
): Promise<AuthenticatedPrincipal> {
  return resolveAuthToken(c, deps)
}

export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex')
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function sessionExpiresAt(
  tokenExpiries: {
    accessTokenExpiresAt?: Date | null
    refreshTokenExpiresAt?: Date | null
  },
  now: Date,
): Date {
  const candidates = [addSeconds(now, SESSION_MAX_AGE_SECONDS)]

  if (tokenExpiries.refreshTokenExpiresAt) {
    candidates.push(tokenExpiries.refreshTokenExpiresAt)
  }
  else if (tokenExpiries.accessTokenExpiresAt) {
    candidates.push(tokenExpiries.accessTokenExpiresAt)
  }

  return minDate(candidates)
}

export function createDrizzleAuthStore(db: Database = getDatabase().db): AuthStore {
  return {
    async upsertUser(user, now) {
      await db.insert(githubUsers).values({
        githubId: user.githubId,
        login: user.login,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: githubUsers.githubId,
        set: {
          login: user.login,
          updatedAt: now,
        },
      })
    },
    async createSession(session, now) {
      await db.insert(githubSessions).values({
        sessionIdHash: session.sessionIdHash,
        githubUserId: session.githubUserId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
        refreshTokenExpiresAt: session.refreshTokenExpiresAt,
        expiresAt: session.expiresAt,
        updatedAt: now,
      })
    },
    async findSession(sessionIdHash) {
      const [session] = await db
        .select({
          sessionIdHash: githubSessions.sessionIdHash,
          githubUserId: githubSessions.githubUserId,
          githubUserLogin: githubUsers.login,
          accessToken: githubSessions.accessToken,
          refreshToken: githubSessions.refreshToken,
          accessTokenExpiresAt: githubSessions.accessTokenExpiresAt,
          refreshTokenExpiresAt: githubSessions.refreshTokenExpiresAt,
          expiresAt: githubSessions.expiresAt,
        })
        .from(githubSessions)
        .innerJoin(githubUsers, eq(githubSessions.githubUserId, githubUsers.githubId))
        .where(eq(githubSessions.sessionIdHash, sessionIdHash))
        .limit(1)

      return session ?? null
    },
    async updateSessionTokens(sessionIdHash, tokens, now) {
      await db.update(githubSessions)
        .set({
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken !== undefined ? { refreshToken: tokens.refreshToken } : {}),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          ...(tokens.refreshTokenExpiresAt !== undefined
            ? { refreshTokenExpiresAt: tokens.refreshTokenExpiresAt }
            : {}),
          expiresAt: tokens.expiresAt,
          updatedAt: now,
        })
        .where(eq(githubSessions.sessionIdHash, sessionIdHash))
    },
    async deleteSession(sessionIdHash) {
      await db.delete(githubSessions).where(eq(githubSessions.sessionIdHash, sessionIdHash))
    },
    async upsertInstallations(installations, now) {
      for (const installation of installations) {
        await db.insert(githubInstallations).values({
          githubInstallationId: installation.githubInstallationId,
          accountGithubId: installation.accountGithubId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          active: installation.active,
          suspendedAt: installation.suspendedAt,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: githubInstallations.githubInstallationId,
          set: {
            accountGithubId: installation.accountGithubId,
            accountLogin: installation.accountLogin,
            accountType: installation.accountType,
            active: installation.active,
            suspendedAt: installation.suspendedAt,
            updatedAt: now,
          },
        })
      }
    },
  }
}

function requireGitHubAppConfig(config: GitHubAppAuthConfig): GitHubAppAuthConfig {
  const missing = missingGitHubAppAuthConfig(config)
  if (missing.length > 0) {
    throw new GitHubAppAuthConfigError(
      `GitHub App auth is missing required config: ${missing.join(', ')}`,
    )
  }

  return config
}

async function resolveAuthToken(
  c: Context,
  deps: AuthDependencies = {},
): Promise<AuthenticatedPrincipal> {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) throw new UnauthorizedError('Missing session cookie')
  return resolveDatabaseAuthToken(c, sessionId, deps)
}

async function resolveDatabaseAuthToken(
  c: Context,
  sessionId: string,
  deps: AuthDependencies,
): Promise<AuthenticatedPrincipal> {
  const now = currentTime(deps)
  const store = resolveStore(deps)
  const sessionIdHash = hashSessionId(sessionId)
  const session = await store.findSession(sessionIdHash)

  if (!session) {
    clearDatabaseSessionCookie(c)
    throw new UnauthorizedError('Session not found')
  }

  if (isAtOrBefore(session.expiresAt, now)) {
    await store.deleteSession(sessionIdHash)
    clearDatabaseSessionCookie(c)
    throw new UnauthorizedError('Session expired')
  }

  if (!shouldRefreshAccessToken(session, now)) {
    return {
      accessToken: session.accessToken,
      githubId: session.githubUserId,
      login: session.githubUserLogin,
    }
  }

  if (!session.refreshToken || isAtOrBefore(session.refreshTokenExpiresAt, now)) {
    await store.deleteSession(sessionIdHash)
    clearDatabaseSessionCookie(c)
    throw new UnauthorizedError('Session token expired')
  }

  let refreshed: TokenSet
  try {
    refreshed = await refreshGitHubAppToken({
      refreshToken: session.refreshToken,
      config: requireGitHubAppConfig(deps.config ?? githubAppAuthConfig),
      fetchImpl: deps.fetch ?? defaultFetch,
      now,
    })
  }
  catch (error) {
    if (!isRejectedTokenError(error)) throw error
    await store.deleteSession(sessionIdHash)
    clearDatabaseSessionCookie(c)
    throw new UnauthorizedError('Session token rejected')
  }
  await store.updateSessionTokens(sessionIdHash, refreshed, now)
  setDatabaseSessionCookie(c, sessionId, refreshed.expiresAt, now, resolveCookieSecure(deps))

  return {
    accessToken: refreshed.accessToken,
    githubId: session.githubUserId,
    login: session.githubUserLogin,
  }
}

function isRejectedTokenError(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('status' in error)) return false
  return error.status === 400 || error.status === 401
}

async function syncInstallationsForAccessToken(
  accessToken: string,
  now: Date,
  deps: AuthDependencies,
): Promise<GitHubInstallationRecord[]> {
  const installations = await fetchGitHubUserInstallations(accessToken, deps.fetch ?? defaultFetch)
  await resolveStore(deps).upsertInstallations(installations, now)
  return installations
}

function resolveStore(deps: AuthDependencies): AuthStore {
  return deps.store ?? createDrizzleAuthStore()
}

async function exchangeCodeForToken(args: {
  code: string
  verifier: string
  config: GitHubAppAuthConfig
  fetchImpl: typeof fetch
  now: Date
}): Promise<TokenSet> {
  const response = await args.fetchImpl(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
      code: args.code,
      redirect_uri: args.config.callbackUrl,
      code_verifier: args.verifier,
    }),
  })

  return parseTokenResponse(response, args.now, 'GitHub OAuth code exchange failed')
}

async function refreshGitHubAppToken(args: {
  refreshToken: string
  config: GitHubAppAuthConfig
  fetchImpl: typeof fetch
  now: Date
}): Promise<TokenSet> {
  const response = await args.fetchImpl(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
    }),
  })

  return parseTokenResponse(response, args.now, 'GitHub token refresh failed')
}

async function parseTokenResponse(
  response: Response,
  now: Date,
  fallbackMessage: string,
): Promise<TokenSet> {
  const body: unknown = await response.json().catch(() => null)
  const token = GitHubTokenResponseSchema.safeParse(body)
  if (!response.ok || !token.success) {
    const parsedError = GitHubTokenErrorSchema.safeParse(body)
    const message = parsedError.success
      ? parsedError.data.error_description ?? parsedError.data.error
      : fallbackMessage
    throw Object.assign(new Error(message), { status: response.ok ? 502 : response.status })
  }

  const accessTokenExpiresAt = token.data.expires_in
    ? addSeconds(now, token.data.expires_in)
    : null
  const refreshTokenExpiresAt = token.data.refresh_token_expires_in
    ? addSeconds(now, token.data.refresh_token_expires_in)
    : null

  return {
    accessToken: token.data.access_token,
    ...(token.data.refresh_token ? { refreshToken: token.data.refresh_token } : {}),
    accessTokenExpiresAt,
    ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}),
    expiresAt: sessionExpiresAt({ accessTokenExpiresAt, refreshTokenExpiresAt }, now),
  }
}

async function fetchGitHubViewer(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<GitHubUserRecord> {
  const response = await fetchImpl(GITHUB_USER_URL, {
    headers: githubRestHeaders(accessToken),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`GitHub /user returned ${response.status}`), {
      status: response.status,
    })
  }

  const parsed = GitHubViewerSchema.parse(await response.json())
  return {
    githubId: parsed.id,
    login: parsed.login,
  }
}

async function fetchGitHubUserInstallations(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<GitHubInstallationRecord[]> {
  const response = await fetchImpl(GITHUB_USER_INSTALLATIONS_URL, {
    headers: githubRestHeaders(accessToken),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`GitHub /user/installations returned ${response.status}`), {
      status: response.status,
    })
  }

  const parsed = GitHubInstallationsResponseSchema.parse(await response.json())
  return parsed.installations.map(installation => ({
    githubInstallationId: installation.id,
    accountGithubId: installation.account.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    active: installation.suspended_at === null || installation.suspended_at === undefined,
    suspendedAt: parseNullableDate(installation.suspended_at),
  }))
}

function verifyCallbackInstallation(
  installationId: string | undefined,
  installations: GitHubInstallationRecord[],
): void {
  if (!installationId) return
  if (installations.some(installation => installation.githubInstallationId === installationId)) {
    return
  }

  throw new GitHubAppAuthFlowError(
    'GitHub callback referenced an installation this user cannot access',
    'installation_unverified',
  )
}

function verifyUserAllowed(
  user: GitHubUserRecord,
  allowedUserIds: readonly string[],
): void {
  if (allowedUserIds.includes(user.githubId)) return

  throw new GitHubAppAuthFlowError(
    'This GitHub account is not permitted to sign in',
    'user_not_allowed',
  )
}

function githubRestHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'prq',
    'x-github-api-version': '2022-11-28',
  }
}

function setDatabaseSessionCookie(
  c: Context,
  sessionId: string,
  expiresAt: Date,
  now: Date,
  secure: boolean,
): void {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: API_COOKIE_PATH,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
    secure,
  })
}

function clearDatabaseSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: API_COOKIE_PATH })
}

function setOAuthCookie(c: Context, name: string, value: string, secure: boolean): void {
  setCookie(c, name, value, {
    httpOnly: true,
    sameSite: 'Lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    secure,
  })
}

function clearOAuthCookies(c: Context): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH })
  deleteCookie(c, OAUTH_VERIFIER_COOKIE, { path: OAUTH_COOKIE_PATH })
}

function buildWebRedirect(
  webUrl: string,
  params: Record<string, string> = {},
): string {
  const url = new URL(webUrl)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function shouldRefreshAccessToken(session: StoredAuthSession, now: Date): boolean {
  if (!session.accessTokenExpiresAt) return false
  return session.accessTokenExpiresAt.getTime()
    <= now.getTime() + ACCESS_TOKEN_REFRESH_SKEW_SECONDS * 1000
}

function isAtOrBefore(value: Date | null, now: Date): boolean {
  return value === null || value.getTime() <= now.getTime()
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000)
}

function minDate(dates: Date[]): Date {
  return new Date(Math.min(...dates.map(date => date.getTime())))
}

function currentTime(deps: AuthDependencies): Date {
  return deps.now?.() ?? new Date()
}

function randomOpaqueValue(): string {
  return randomBytes(32).toString('base64url')
}

function randomPkceVerifier(): string {
  return randomOpaqueValue()
}

function parseNullableDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('GitHub installation suspended_at was not a valid date')
  }
  return date
}

function resolveCookieSecure(deps: AuthDependencies): boolean {
  return deps.cookieSecure ?? isProductionEnv()
}
