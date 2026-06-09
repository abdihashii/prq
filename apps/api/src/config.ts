try {
  process.loadEnvFile()
}
catch {
  // No .env file at CWD. Fine for tests/CI; the startup gate in index.ts
  // will catch the missing env var when it's actually required.
}

export const LOCAL_WEB_URL = 'http://localhost:5173'
export const LOCAL_GITHUB_CALLBACK_URL = 'http://localhost:3001/api/auth/github/callback'

export interface GitHubAppAuthConfig {
  clientId: string
  clientSecret: string
  callbackUrl: string
  webUrl: string
  appSlug?: string
}

export interface GitHubAppMutationConfig {
  clientId: string
  privateKey: string
}

type Env = Record<string, string | undefined>

export function resolveGitHubWebhookSecret(env: Env = process.env): string {
  return emptyToUndefined(env['PRQ_GITHUB_WEBHOOK_SECRET']) ?? ''
}

export function resolveGitHubAppAuthConfig(env: Env = process.env): GitHubAppAuthConfig {
  const clientId = emptyToUndefined(env['PRQ_GITHUB_CLIENT_ID']) ?? ''
  const clientSecret = emptyToUndefined(env['PRQ_GITHUB_CLIENT_SECRET']) ?? ''
  const callbackUrl = resolveHttpUrl(
    env['PRQ_GITHUB_CALLBACK_URL'],
    LOCAL_GITHUB_CALLBACK_URL,
    'PRQ_GITHUB_CALLBACK_URL',
  )
  const webUrl = resolveHttpUrl(env['PRQ_WEB_URL'], LOCAL_WEB_URL, 'PRQ_WEB_URL')
  const appSlug = emptyToUndefined(env['PRQ_GITHUB_APP_SLUG'])

  return {
    clientId,
    clientSecret,
    callbackUrl,
    webUrl,
    ...(appSlug ? { appSlug } : {}),
  }
}

export function missingGitHubAppAuthConfig(config: GitHubAppAuthConfig): string[] {
  const missing: string[] = []
  if (!config.clientId) missing.push('PRQ_GITHUB_CLIENT_ID')
  if (!config.clientSecret) missing.push('PRQ_GITHUB_CLIENT_SECRET')
  return missing
}

export function resolveGitHubAppMutationConfig(env: Env = process.env): GitHubAppMutationConfig {
  return {
    clientId: emptyToUndefined(env['PRQ_GITHUB_CLIENT_ID']) ?? '',
    privateKey: normalizePrivateKey(emptyToUndefined(env['PRQ_GITHUB_PRIVATE_KEY']) ?? ''),
  }
}

export function missingGitHubAppMutationConfig(config: GitHubAppMutationConfig): string[] {
  const missing: string[] = []
  if (!config.clientId) missing.push('PRQ_GITHUB_CLIENT_ID')
  if (!config.privateKey) missing.push('PRQ_GITHUB_PRIVATE_KEY')
  return missing
}

export const githubAppAuthConfig = resolveGitHubAppAuthConfig()
export const githubAppMutationConfig = resolveGitHubAppMutationConfig()
export const githubWebhookSecret = resolveGitHubWebhookSecret()

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === '' ? undefined : trimmed
}

function normalizePrivateKey(value: string): string {
  return value.replaceAll('\\n', '\n')
}

function resolveHttpUrl(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  const resolved = emptyToUndefined(value) ?? fallback
  let parsed: URL
  try {
    parsed = new URL(resolved)
  }
  catch {
    throw new Error(`${name} must be a valid URL`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http:// or https://`)
  }

  parsed.hash = ''
  return parsed.toString()
}
