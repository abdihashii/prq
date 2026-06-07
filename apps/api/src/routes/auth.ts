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

export const auth = new Hono()

auth.get('/auth/github/start', (c) => {
  try {
    return beginGitHubAppSignIn(c)
  }
  catch (err) {
    return mapGitHubAppStartError(c, err)
  }
})

auth.get('/auth/github/callback', async (c) => {
  try {
    return await completeGitHubAppCallback(c)
  }
  catch (err) {
    return mapGitHubAppCallbackError(c, err)
  }
})

auth.get('/auth/github/install', (c) => {
  try {
    return redirectToGitHubAppInstall(c)
  }
  catch (err) {
    return mapGitHubAppStartError(c, err)
  }
})

auth.get('/auth/github/setup', async (c) => {
  try {
    return await completeGitHubAppSetup(c)
  }
  catch (err) {
    return mapGitHubAppCallbackError(c, err)
  }
})

auth.delete('/auth/session', async (c) => {
  await clearCurrentAuthSession(c)
  return c.body(null, 204)
})

function mapGitHubAppStartError(c: Context, err: unknown) {
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

function mapGitHubAppCallbackError(c: Context, err: unknown) {
  if (err instanceof GitHubAppAuthFlowError) {
    return redirectToGitHubAppAuthError(c, err.code)
  }
  if (err instanceof GitHubAppAuthConfigError) {
    console.error('github app auth config error:', err)
    return redirectToGitHubAppAuthError(c, 'github_app_not_configured')
  }

  console.error('github app auth callback handler error:', err)
  return redirectToGitHubAppAuthError(c, 'github_auth_failed')
}
