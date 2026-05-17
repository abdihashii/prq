import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

const ACCESS_TOKEN_COOKIE = 'prq_access_token'
// New OAuth Apps issue long-lived access tokens (GitHub retired the
// expiration toggle), so the cookie just outlives a reasonable session.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export function setSessionCookie(c: Context, accessToken: string): void {
  setCookie(c, ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: process.env['NODE_ENV'] === 'production',
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: '/api' })
}

function is401(err: unknown): boolean {
  return Boolean(
    err
    && typeof err === 'object'
    && 'status' in err
    && (err as { status: unknown }).status === 401,
  )
}

/**
 * Invokes `fn` with the current GitHub access token. If GitHub returns 401
 * (token revoked from GitHub's UI), clears the cookie and throws
 * UnauthorizedError so callers can map it to a BAD_CREDENTIALS response and
 * the web sign-in path triggers.
 *
 * @param c - Hono request context (used for cookie I/O).
 * @param fn - The GitHub-calling work, parameterized by access token.
 */
export async function withAuth<T>(
  c: Context,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const accessToken = getCookie(c, ACCESS_TOKEN_COOKIE)
  if (!accessToken) {
    throw new UnauthorizedError('Missing session cookie')
  }

  try {
    return await fn(accessToken)
  }
  catch (err) {
    if (is401(err)) {
      clearSessionCookie(c)
      throw new UnauthorizedError('Access token rejected')
    }
    throw err
  }
}
