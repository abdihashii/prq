import { describe, expect, it } from 'vitest'
import {
  assertCronConfig,
  assertRequiredConfig,
  LOCAL_GITHUB_CALLBACK_URL,
  LOCAL_WEB_URL,
  missingGitHubAppAuthConfig,
  missingGitHubAppMutationConfig,
  resolveGitHubAppAuthConfig,
  resolveGitHubAppMutationConfig,
  resolveGitHubWebhookSecret,
  resolveRequestConfig,
} from '../config'

describe('resolveGitHubAppAuthConfig', () => {
  it('uses safe local URLs by default without requiring secrets at import time', () => {
    expect(resolveGitHubAppAuthConfig({})).toEqual({
      clientId: '',
      clientSecret: '',
      callbackUrl: `${LOCAL_GITHUB_CALLBACK_URL}`,
      webUrl: `${LOCAL_WEB_URL}/`,
    })
  })

  it('trims explicit GitHub App config', () => {
    expect(resolveGitHubAppAuthConfig({
      PRQ_GITHUB_CLIENT_ID: ' client-1 ',
      PRQ_GITHUB_CLIENT_SECRET: ' secret-1 ',
      PRQ_GITHUB_CALLBACK_URL: ' https://api.example.com/api/auth/github/callback ',
      PRQ_WEB_URL: ' https://app.example.com ',
      PRQ_GITHUB_APP_SLUG: ' prq-dev ',
    })).toEqual({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      callbackUrl: 'https://api.example.com/api/auth/github/callback',
      webUrl: 'https://app.example.com/',
      appSlug: 'prq-dev',
    })
  })

  it('reports missing required GitHub App OAuth credentials', () => {
    expect(missingGitHubAppAuthConfig(resolveGitHubAppAuthConfig({}))).toEqual([
      'PRQ_GITHUB_CLIENT_ID',
      'PRQ_GITHUB_CLIENT_SECRET',
    ])
  })

  it('rejects invalid callback and web URLs', () => {
    expect(() => resolveGitHubAppAuthConfig({
      PRQ_GITHUB_CALLBACK_URL: 'not a url',
    })).toThrow('PRQ_GITHUB_CALLBACK_URL must be a valid URL')

    expect(() => resolveGitHubAppAuthConfig({
      PRQ_WEB_URL: 'ftp://example.com',
    })).toThrow('PRQ_WEB_URL must use http:// or https://')
  })
})

describe('resolveGitHubWebhookSecret', () => {
  it('is optional at import time and trims explicit config', () => {
    expect(resolveGitHubWebhookSecret({})).toBe('')
    expect(resolveGitHubWebhookSecret({ PRQ_GITHUB_WEBHOOK_SECRET: ' secret-1 ' }))
      .toBe('secret-1')
  })
})

describe('resolveGitHubAppMutationConfig', () => {
  it('normalizes encoded private-key newlines without requiring mutation config at import time', () => {
    expect(resolveGitHubAppMutationConfig({})).toEqual({ clientId: '', privateKey: '' })
    expect(resolveGitHubAppMutationConfig({
      PRQ_GITHUB_CLIENT_ID: ' client-1 ',
      PRQ_GITHUB_PRIVATE_KEY: ' line-1\\nline-2 ',
    })).toEqual({
      clientId: 'client-1',
      privateKey: 'line-1\nline-2',
    })
  })

  it('reports missing GitHub App mutation credentials', () => {
    expect(missingGitHubAppMutationConfig(resolveGitHubAppMutationConfig({}))).toEqual([
      'PRQ_GITHUB_CLIENT_ID',
      'PRQ_GITHUB_PRIVATE_KEY',
    ])
  })
})

describe('resolveRequestConfig', () => {
  it('aggregates auth, mutation, and webhook config from one env source', () => {
    expect(resolveRequestConfig({
      PRQ_GITHUB_CLIENT_ID: 'client-1',
      PRQ_GITHUB_CLIENT_SECRET: 'secret-1',
      PRQ_GITHUB_PRIVATE_KEY: 'key-1',
      PRQ_GITHUB_WEBHOOK_SECRET: 'whsec-1',
    })).toEqual({
      authConfig: {
        clientId: 'client-1',
        clientSecret: 'secret-1',
        callbackUrl: LOCAL_GITHUB_CALLBACK_URL,
        webUrl: `${LOCAL_WEB_URL}/`,
      },
      mutationConfig: { clientId: 'client-1', privateKey: 'key-1' },
      webhookSecret: 'whsec-1',
    })
  })
})

describe('assertRequiredConfig', () => {
  const complete = resolveRequestConfig({
    PRQ_GITHUB_CLIENT_ID: 'client-1',
    PRQ_GITHUB_CLIENT_SECRET: 'secret-1',
    PRQ_GITHUB_PRIVATE_KEY: 'key-1',
    PRQ_GITHUB_WEBHOOK_SECRET: 'whsec-1',
  })

  it('passes when config is complete in production', () => {
    expect(() => assertRequiredConfig(complete, { production: true })).not.toThrow()
  })

  it('requires only the client ID outside production', () => {
    expect(() => assertRequiredConfig(resolveRequestConfig({}), { production: false }))
      .toThrow('PRQ_GITHUB_CLIENT_ID')
    expect(() => assertRequiredConfig(
      resolveRequestConfig({ PRQ_GITHUB_CLIENT_ID: 'client-1' }),
      { production: false },
    )).not.toThrow()
  })

  it('names every missing production secret at once', () => {
    let message = ''
    try {
      assertRequiredConfig(
        resolveRequestConfig({ PRQ_GITHUB_CLIENT_ID: 'client-1' }),
        { production: true },
      )
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('PRQ_GITHUB_CLIENT_SECRET')
    expect(message).toContain('PRQ_GITHUB_WEBHOOK_SECRET')
    expect(message).toContain('PRQ_GITHUB_PRIVATE_KEY')
  })
})

describe('assertCronConfig', () => {
  it('requires only the client ID outside production', () => {
    expect(() => assertCronConfig(resolveRequestConfig({}), { production: false }))
      .toThrow('PRQ_GITHUB_CLIENT_ID')
    expect(() => assertCronConfig(
      resolveRequestConfig({ PRQ_GITHUB_CLIENT_ID: 'client-1' }),
      { production: false },
    )).not.toThrow()
  })

  it('requires the App mutation creds in production but not the OAuth/webhook secrets', () => {
    // The cron uses only the mutation config; a missing client/webhook secret must not
    // block it, even though assertRequiredConfig would require them.
    const mutationOnly = resolveRequestConfig({
      PRQ_GITHUB_CLIENT_ID: 'client-1',
      PRQ_GITHUB_PRIVATE_KEY: 'key-1',
    })
    expect(() => assertCronConfig(mutationOnly, { production: true })).not.toThrow()

    let message = ''
    try {
      assertCronConfig(
        resolveRequestConfig({ PRQ_GITHUB_CLIENT_ID: 'client-1' }),
        { production: true },
      )
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('PRQ_GITHUB_PRIVATE_KEY')
    expect(message).not.toContain('PRQ_GITHUB_CLIENT_SECRET')
    expect(message).not.toContain('PRQ_GITHUB_WEBHOOK_SECRET')
  })
})
