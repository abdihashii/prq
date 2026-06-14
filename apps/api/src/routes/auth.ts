import { type Context, Hono } from 'hono'
import {
  beginGitHubAppSignIn,
  clearCurrentAuthSession,
  completeGitHubAppCallback,
  completeGitHubAppSetup,
  GitHubAppAuthConfigError,
  GitHubAppAuthFlowError,
  redirectToGitHubAppAuthError,
  redirectToGitHubAppInstall,
} from '../auth/session'
import type { AppEnv } from '../request-context'

export const auth = new Hono<AppEnv>()

auth.get('/auth/github/start', (c) => {
  try {
    return beginGitHubAppSignIn(c, c.var.ctx.authDeps)
  }
  catch (err) {
    return mapGitHubAppStartError(c, err)
  }
})

auth.get('/auth/github/callback', async (c) => {
  try {
    return await completeGitHubAppCallback(c, c.var.ctx.authDeps)
  }
  catch (err) {
    return mapGitHubAppCallbackError(c, err)
  }
})

auth.get('/auth/github/install', (c) => {
  try {
    return redirectToGitHubAppInstall(c, c.var.ctx.authDeps)
  }
  catch (err) {
    return mapGitHubAppStartError(c, err)
  }
})

auth.get('/auth/github/setup', async (c) => {
  try {
    return await completeGitHubAppSetup(c, c.var.ctx.authDeps)
  }
  catch (err) {
    return mapGitHubAppCallbackError(c, err)
  }
})

auth.delete('/auth/session', async (c) => {
  await clearCurrentAuthSession(c, c.var.ctx.authDeps)
  return c.body(null, 204)
})

function mapGitHubAppStartError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof GitHubAppAuthConfigError) {
    return c.json(
      { error: { code: 'UPSTREAM_ERROR', message: err.message } },
      500,
    )
  }

  console.error('github app auth start handler error:', err)
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to start GitHub App sign-in' } },
    502,
  )
}

function mapGitHubAppCallbackError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof GitHubAppAuthFlowError) {
    return redirectToGitHubAppAuthError(c, err.code, c.var.ctx.authDeps)
  }
  if (err instanceof GitHubAppAuthConfigError) {
    console.error('github app auth config error:', err)
    return redirectToGitHubAppAuthError(c, 'github_app_not_configured', c.var.ctx.authDeps)
  }

  console.error('github app auth callback handler error:', err)
  return redirectToGitHubAppAuthError(c, 'github_auth_failed', c.var.ctx.authDeps)
}
