import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createGitHubRetargetClient, GitHubRetargetError } from '../auto-retarget/github'
import type { AutoRetargetTarget } from '../auto-retarget/types'

const NOW = new Date('2026-06-09T12:00:00.000Z')
const PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const TARGET: AutoRetargetTarget = {
  attemptId: 1,
  githubInstallationId: '42',
  repositoryOwner: 'acme',
  repositoryName: 'rocket',
  childPullRequestId: 'PR_child',
  childNumber: 2,
  previousBaseRefName: 'feature/parent',
  nextBaseRefName: 'main',
}

describe('GitHub auto-retarget client', () => {
  it('uses a repository-scoped write token to inspect and retarget a pull request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'installation-token' }))
      .mockResolvedValueOnce(jsonResponse(pullRequest('feature/parent')))
      .mockResolvedValueOnce(jsonResponse({ token: 'installation-token' }))
      .mockResolvedValueOnce(jsonResponse(pullRequest('main')))
    const client = createGitHubRetargetClient({
      config: { clientId: 'Iv1.client', privateKey: PRIVATE_KEY },
      fetch: fetchMock,
      now: () => NOW,
    })

    await expect(client.inspect(TARGET)).resolves.toMatchObject({
      state: 'OPEN',
      baseRefName: 'feature/parent',
    })
    await expect(client.retarget(TARGET)).resolves.toMatchObject({
      state: 'OPEN',
      baseRefName: 'main',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/app/installations/42/access_tokens',
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      repositories: ['rocket'],
      permissions: { pull_requests: 'write' },
    })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' })
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ base: 'main' }),
    })
  })

  it('fails clearly for missing mutation config and GitHub errors', async () => {
    await expect(createGitHubRetargetClient({
      config: { clientId: '', privateKey: '' },
    }).inspect(TARGET)).rejects.toThrow('PRQ_GITHUB_CLIENT_ID, PRQ_GITHUB_PRIVATE_KEY')

    const client = createGitHubRetargetClient({
      config: { clientId: 'Iv1.client', privateKey: PRIVATE_KEY },
      fetch: vi.fn().mockResolvedValue(jsonResponse({ message: 'installation suspended' }, 403)),
      now: () => NOW,
    })
    await expect(client.inspect(TARGET)).rejects.toEqual(
      new GitHubRetargetError('installation suspended', 403),
    )
  })

  it('rejects malformed GitHub responses', async () => {
    const client = createGitHubRetargetClient({
      config: { clientId: 'Iv1.client', privateKey: PRIVATE_KEY },
      fetch: vi.fn()
        .mockResolvedValueOnce(jsonResponse({ token: 'installation-token' }))
        .mockResolvedValueOnce(jsonResponse({ state: 'open' })),
      now: () => NOW,
    })

    await expect(client.inspect(TARGET)).rejects.toThrow('malformed pull request')
  })
})

function pullRequest(baseRefName: string) {
  return {
    state: 'open',
    merged_at: null,
    base: { ref: baseRefName },
    updated_at: '2026-06-09T12:00:00Z',
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
