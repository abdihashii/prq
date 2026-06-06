import { describe, expect, it } from 'vitest'
import {
  LOCAL_GITHUB_CALLBACK_URL,
  LOCAL_WEB_URL,
  missingGitHubAppAuthConfig,
  resolveGitHubAppAuthConfig,
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
