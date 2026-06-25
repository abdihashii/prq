import { z } from 'zod'
import { githubAppMutationConfig, type GitHubAppMutationConfig } from '../../config'
import { defaultFetch } from '../../fetch'
import { createInstallationToken } from '../installation-token'
import type {
  AutoRetargetTarget,
  GitHubRetargetClient,
  RemotePullRequest,
} from './types'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'

const PullRequestSchema = z.object({
  state: z.enum(['open', 'closed']),
  merged_at: z.string().datetime({ offset: true }).nullable(),
  base: z.object({ ref: z.string().min(1) }),
  updated_at: z.string().datetime({ offset: true }).transform(value => new Date(value)),
})

export class GitHubRetargetError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GitHubRetargetError'
  }
}

export function createGitHubRetargetClient(dependencies: {
  config?: GitHubAppMutationConfig
  fetch?: typeof fetch
  now?: () => Date
} = {}): GitHubRetargetClient {
  const config = dependencies.config ?? githubAppMutationConfig
  const fetchImpl = dependencies.fetch ?? defaultFetch
  const now = dependencies.now ?? (() => new Date())

  return {
    inspect: target => pullRequestRequest(target, 'GET', config, fetchImpl, now()),
    retarget: target => pullRequestRequest(target, 'PATCH', config, fetchImpl, now()),
  }
}

async function pullRequestRequest(
  target: AutoRetargetTarget,
  method: 'GET' | 'PATCH',
  config: GitHubAppMutationConfig,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<RemotePullRequest> {
  const token = await createInstallationToken({
    installationId: target.githubInstallationId,
    config,
    repositories: [target.repositoryName],
    permissions: { pull_requests: 'write' },
    fetch: fetchImpl,
    now: () => now,
  })
  const path = `/repos/${encodeURIComponent(target.repositoryOwner)}`
    + `/${encodeURIComponent(target.repositoryName)}/pulls/${target.childNumber}`
  const response = await githubRequest(`${GITHUB_API_URL}${path}`, {
    method,
    headers: githubHeaders(token),
    ...(method === 'PATCH'
      ? {
          body: JSON.stringify({ base: target.nextBaseRefName }),
          headers: { ...githubHeaders(token), 'content-type': 'application/json' },
        }
      : {}),
  }, fetchImpl)
  const parsed = PullRequestSchema.safeParse(response)
  if (!parsed.success) throw new GitHubRetargetError('GitHub returned a malformed pull request')

  return {
    state: parsed.data.merged_at !== null ? 'MERGED' : parsed.data.state.toUpperCase() as 'OPEN' | 'CLOSED',
    baseRefName: parsed.data.base.ref,
    githubUpdatedAt: parsed.data.updated_at,
  }
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
    throw new GitHubRetargetError('GitHub retarget request failed')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = z.object({ message: z.string() }).safeParse(body)
    throw new GitHubRetargetError(
      message.success ? message.data.message : 'GitHub retarget request failed',
      response.status,
    )
  }
  return body
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': GITHUB_API_VERSION,
  }
}
