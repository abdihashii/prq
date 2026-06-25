import { sign } from 'node:crypto'
import { z } from 'zod'
import { missingGitHubAppMutationConfig, type GitHubAppMutationConfig } from '../config'
import { defaultFetch } from '../fetch'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'

const InstallationTokenSchema = z.object({ token: z.string().min(1) })

export class InstallationTokenError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'InstallationTokenError'
  }
}

/**
 * Mint a GitHub App installation access token from the App's private key. Shared by
 * auto-retarget (which scopes it to a single repo with write permission) and the
 * background dashboard reconcile (which mints it installation-wide with read scope).
 *
 * @param args.installationId - The GitHub App installation to mint a token for.
 * @param args.config - App mutation config (client id + private key) used to sign the JWT.
 * @param args.repositories - Repo names to scope the token to. Omit for installation-wide.
 * @param args.permissions - Permission overrides, e.g. { pull_requests: 'read' }. Omit for the
 *   installation's full granted set.
 * @param args.fetch - Fetch implementation (injectable for tests).
 * @param args.now - Clock for the JWT iat/exp (injectable for tests).
 * @returns The installation access token string.
 * @throws InstallationTokenError if config is missing, the key is invalid, or GitHub rejects/
 *   malforms the response.
 */
export async function createInstallationToken(args: {
  installationId: string
  config: GitHubAppMutationConfig
  repositories?: string[]
  permissions?: Record<string, string>
  fetch?: typeof fetch
  now?: () => Date
}): Promise<string> {
  const fetchImpl = args.fetch ?? defaultFetch
  const now = args.now ?? (() => new Date())

  const missing = missingGitHubAppMutationConfig(args.config)
  if (missing.length > 0) {
    throw new InstallationTokenError(`GitHub App mutation config is missing: ${missing.join(', ')}`)
  }

  const jwt = createAppJwt(args.config, now())
  const response = await githubRequest(
    `${GITHUB_API_URL}/app/installations/${encodeURIComponent(args.installationId)}/access_tokens`,
    {
      method: 'POST',
      headers: { ...githubHeaders(jwt), 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(args.repositories ? { repositories: args.repositories } : {}),
        ...(args.permissions ? { permissions: args.permissions } : {}),
      }),
    },
    fetchImpl,
  )
  const parsed = InstallationTokenSchema.safeParse(response)
  if (!parsed.success) throw new InstallationTokenError('GitHub returned a malformed installation token')
  return parsed.data.token
}

/**
 * Build a signed App JWT (RS256) used as the bearer when minting installation tokens.
 *
 * @param config - App mutation config carrying the client id (issuer) and private key.
 * @param now - Current time; iat is backdated 60s and exp set 9m ahead for clock skew.
 * @returns The compact-serialized JWT.
 * @throws InstallationTokenError if the private key cannot sign.
 */
function createAppJwt(config: GitHubAppMutationConfig, now: Date): string {
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' })
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const payload = base64UrlJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: config.clientId,
  })
  const unsigned = `${header}.${payload}`

  try {
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString('base64url')}`
  }
  catch {
    throw new InstallationTokenError('GitHub App private key is invalid')
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function githubRequest(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  }
  catch {
    throw new InstallationTokenError('GitHub installation token request failed')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = z.object({ message: z.string() }).safeParse(body)
    throw new InstallationTokenError(
      message.success
        ? message.data.message
        : `GitHub installation token request failed with status ${response.status}`,
      response.status,
    )
  }
  return body
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    // GitHub's REST API rejects requests without a User-Agent; the dashboard's
    // GraphQL path sends one too. Omitting it 403s the token mint.
    'user-agent': 'prq',
    'x-github-api-version': GITHUB_API_VERSION,
  }
}
