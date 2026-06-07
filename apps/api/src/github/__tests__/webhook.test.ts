import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ingestGitHubWebhook } from '../webhook'
import {
  describeDelivery,
  normalizeWebhook,
  verifyWebhookSignature,
} from '../webhook/protocol'
import type { WebhookStore, WebhookSyncPlan } from '../webhook/types'

const SECRET = 'webhook-secret'
const NOW = new Date('2026-06-06T12:00:00.000Z')

describe('ingestGitHubWebhook', () => {
  it('matches GitHub documentation signature vectors', () => {
    expect(() => verifyWebhookSignature(
      Buffer.from('Hello, World!'),
      'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
      'It\'s a Secret to Everybody',
    )).not.toThrow()
  })

  it('verifies the untouched unicode bytes before reserving and applying', async () => {
    const store = fakeStore()
    const body = JSON.stringify({ zen: 'Keep it logically awesome \u2603' })

    await ingestGitHubWebhook(signedRequest(body, 'ping'), {
      secret: SECRET,
      store,
      now: () => NOW,
    })

    expect(store.reserveDelivery).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: 'delivery-1',
      event: 'ping',
      payload: { zen: 'Keep it logically awesome \u2603' },
    }))
    expect(store.applyDelivery).toHaveBeenCalledWith('delivery-1', emptyPlan(), NOW)
  })

  it('rejects missing, malformed, and mismatched signatures before storage', async () => {
    const store = fakeStore()
    const missing = signedRequest('{}', 'ping', { 'x-hub-signature-256': '' })
    const malformed = signedRequest('{}', 'ping', { 'x-hub-signature-256': 'sha256=nope' })
    const invalid = signedRequest('{}', 'ping', {
      'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
    })

    await expect(ingestGitHubWebhook(missing, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    await expect(ingestGitHubWebhook(malformed, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    await expect(ingestGitHubWebhook(invalid, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 401 })
    expect(store.reserveDelivery).not.toHaveBeenCalled()
  })

  it('requires delivery, event, JSON content type, valid JSON, and configured secret', async () => {
    const store = fakeStore()
    const missingDelivery = signedRequest('{}', 'ping', { 'x-github-delivery': '' })
    const missingEvent = signedRequest('{}', 'ping', { 'x-github-event': '' })
    const wrongType = signedRequest('{}', 'ping', { 'content-type': 'text/plain' })
    const invalidJson = signedRequest('{', 'ping')

    await expect(ingestGitHubWebhook(missingDelivery, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    await expect(ingestGitHubWebhook(missingEvent, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    await expect(ingestGitHubWebhook(wrongType, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    await expect(ingestGitHubWebhook(invalidJson, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    await expect(ingestGitHubWebhook(signedRequest('{}', 'ping'), { secret: '', store }))
      .rejects.toMatchObject({ status: 500 })
    expect(store.reserveDelivery).not.toHaveBeenCalled()
  })

  it('reserves valid JSON before supported-payload validation and marks failure', async () => {
    const store = fakeStore()
    const request = signedRequest(JSON.stringify({ action: 'opened' }), 'pull_request')

    await expect(ingestGitHubWebhook(request, { secret: SECRET, store, now: () => NOW }))
      .rejects.toMatchObject({ status: 400 })

    expect(store.reserveDelivery).toHaveBeenCalledOnce()
    expect(store.applyDelivery).not.toHaveBeenCalled()
    expect(store.markDeliveryFailed).toHaveBeenCalledWith(
      'delivery-1',
      expect.objectContaining({ status: 400 }),
      NOW,
    )
  })

  it('does not hide a supported action when another envelope field is malformed', async () => {
    const store = fakeStore()
    const request = signedRequest(JSON.stringify({
      action: 'opened',
      repository: {},
    }), 'pull_request')

    await expect(ingestGitHubWebhook(request, { secret: SECRET, store }))
      .rejects.toMatchObject({ status: 400 })
    expect(store.reserveDelivery).toHaveBeenCalledOnce()
    expect(store.markDeliveryFailed).toHaveBeenCalledOnce()
  })

  it('turns unsupported events and actions into successful empty plans', async () => {
    for (const [event, payload] of [
      ['check_run', { action: 'completed' }],
      ['pull_request', { action: 'unknown_future_action' }],
    ] as const) {
      const store = fakeStore()
      await ingestGitHubWebhook(signedRequest(JSON.stringify(payload), event), {
        secret: SECRET,
        store,
      })
      expect(store.applyDelivery).toHaveBeenCalledWith('delivery-1', emptyPlan(), expect.any(Date))
    }
  })

  it('rejects known action-based events with no action after reservation', async () => {
    const store = fakeStore()
    await expect(ingestGitHubWebhook(signedRequest('{}', 'pull_request'), {
      secret: SECRET,
      store,
    })).rejects.toMatchObject({ status: 400 })
    expect(store.reserveDelivery).toHaveBeenCalledOnce()
    expect(store.markDeliveryFailed).toHaveBeenCalledOnce()
  })

  it('marks apply failures without hiding the original failure', async () => {
    const store = fakeStore()
    const original = new Error('state write failed')
    vi.mocked(store.applyDelivery).mockRejectedValue(original)
    vi.mocked(store.markDeliveryFailed).mockRejectedValue(new Error('mark failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(ingestGitHubWebhook(signedRequest('{}', 'ping'), {
      secret: SECRET,
      store,
      now: () => NOW,
    })).rejects.toBe(original)

    expect(store.markDeliveryFailed).toHaveBeenCalledWith('delivery-1', original, NOW)
    consoleError.mockRestore()
  })
})

describe('GitHub webhook projections', () => {
  it('projects installation lifecycle and derives a simple installation account from a repo', () => {
    const payload = {
      action: 'created',
      installation: {
        id: 42,
        suspended_at: null,
      },
      repositories: [repositoryFixture()],
    }

    expect(normalizeWebhook(describeDelivery('d', 'installation', payload))).toMatchObject({
      installations: [{
        githubInstallationId: '42',
        accountGithubId: '7',
        accountLogin: 'acme',
        accountType: 'Organization',
        active: true,
        suspendedAt: null,
      }],
      repositories: [{ githubRepositoryId: 'R_repo', githubInstallationId: '42' }],
      attachedRepositories: [{ githubRepositoryId: 'R_repo', githubInstallationId: '42' }],
    })
  })

  it('projects repository additions and removals without deleting repository history', () => {
    const added = {
      action: 'added',
      installation: installationFixture(),
      repositories_added: [repositoryFixture()],
      repositories_removed: [],
    }
    const removed = {
      action: 'removed',
      installation: installationFixture(),
      repositories_added: [],
      repositories_removed: [repositoryFixture()],
    }

    expect(normalizeWebhook(describeDelivery('d1', 'installation_repositories', added)))
      .toMatchObject({
        repositories: [{ githubRepositoryId: 'R_repo', githubInstallationId: '42' }],
        attachedRepositories: [{ githubRepositoryId: 'R_repo', githubInstallationId: '42' }],
        detachedRepositoryIds: [],
        deletedRepositoryIds: [],
      })
    expect(normalizeWebhook(describeDelivery('d2', 'installation_repositories', removed)))
      .toMatchObject({
        repositories: [],
        detachedRepositoryIds: ['R_repo'],
        deletedRepositoryIds: [],
      })
  })

  it('marks installation deletion and suspension inactive without deleting repository state', () => {
    for (const [action, suspendedAt] of [
      ['deleted', null],
      ['suspend', '2026-06-06T10:00:00Z'],
    ] as const) {
      const plan = normalizeWebhook(describeDelivery(`d-${action}`, 'installation', {
        action,
        installation: {
          ...installationFixture(),
          suspended_at: suspendedAt,
        },
        repositories: [repositoryFixture()],
      }))
      expect(plan).toMatchObject({
        installations: [{ active: false }],
        detachedRepositoryIds: [],
        deletedRepositoryIds: [],
      })
      expect(plan.repositories).toEqual([])
    }
  })

  it('projects account-less installation deletion as an ID-only lifecycle update', () => {
    const plan = normalizeWebhook(describeDelivery('d-deleted', 'installation', {
      action: 'deleted',
      installation: {
        id: 42,
        account: null,
        suspended_at: null,
      },
    }))

    expect(plan.installations).toEqual([{
      githubInstallationId: '42',
      active: false,
      suspendedAt: null,
    }])
  })

  it('projects a PR snapshot and complete user/team review requests from node IDs', () => {
    const payload = pullRequestPayload()
    const plan = normalizeWebhook(describeDelivery('d', 'pull_request', payload))

    expect(plan.repositories[0]).toMatchObject({
      githubRepositoryId: 'R_repo',
      owner: 'acme',
      name: 'rocket',
    })
    expect(plan.pullRequests[0]).toEqual({
      pullRequest: expect.objectContaining({
        githubPullRequestId: 'PR_one',
        githubRepositoryId: 'R_repo',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        githubUpdatedAt: new Date('2026-06-06T11:00:00Z'),
      }),
      reviewRequests: [
        { reviewerKind: 'User', reviewerHandle: 'octo' },
        { reviewerKind: 'Bot', reviewerHandle: 'ci-bot' },
        { reviewerKind: 'Team', reviewerHandle: 'platform' },
      ],
    })
  })

  it('filters deleted or unidentifiable review-request principals', () => {
    const base = pullRequestPayload()
    const payload = {
      ...base,
      pull_request: {
        ...base.pull_request,
        requested_reviewers: [
          null,
          { deleted: true },
          { deleted: true, login: 'deleted-user', type: 'User' },
          { login: 'octo', type: 'User' },
          { slug: 'platform' },
        ],
        requested_teams: [
          null,
          { deleted: true, name: 'deleted-team' },
          { deleted: true, slug: 'deleted-security' },
          { slug: 'security' },
        ],
      },
    }

    const plan = normalizeWebhook(describeDelivery('d', 'pull_request', payload))
    expect(plan.pullRequests[0]?.reviewRequests).toEqual([
      { reviewerKind: 'User', reviewerHandle: 'octo' },
      { reviewerKind: 'Team', reviewerHandle: 'platform' },
      { reviewerKind: 'Team', reviewerHandle: 'security' },
    ])
  })

  it('projects submitted, edited, and dismissed review snapshots', () => {
    for (const [action, state, expected] of [
      ['submitted', 'approved', 'APPROVED'],
      ['edited', 'commented', 'COMMENTED'],
      ['dismissed', 'dismissed', 'DISMISSED'],
    ] as const) {
      const payload = {
        ...pullRequestPayload(),
        action,
        review: {
          node_id: 'PRR_review',
          user: { login: 'reviewer' },
          state,
          submitted_at: '2026-06-06T11:30:00Z',
        },
      }
      expect(normalizeWebhook(describeDelivery(`d-${action}`, 'pull_request_review', payload)))
        .toMatchObject({
          reviews: [{
            githubReviewId: 'PRR_review',
            githubPullRequestId: 'PR_one',
            authorLogin: 'reviewer',
            state: expected,
            submittedAt: new Date('2026-06-06T11:30:00Z'),
          }],
        })
    }
  })

  it('uses repository/deleted as the only repository deletion plan', () => {
    const deleted = {
      action: 'deleted',
      installation: installationFixture(),
      repository: repositoryFixture(),
    }
    const edited = { ...deleted, action: 'edited' }

    const deletedPlan = normalizeWebhook(describeDelivery('d1', 'repository', deleted))
    expect(deletedPlan).toMatchObject({
      installations: [{ githubInstallationId: '42' }],
      repositories: [],
      deletedRepositoryIds: ['R_repo'],
    })
    expect(deletedPlan.installations[0]).not.toHaveProperty('active')
    expect(normalizeWebhook(describeDelivery('d2', 'repository', edited)))
      .toMatchObject({ repositories: [{ githubRepositoryId: 'R_repo' }], deletedRepositoryIds: [] })
  })
})

function fakeStore(): WebhookStore {
  return {
    reserveDelivery: vi.fn().mockResolvedValue(undefined),
    applyDelivery: vi.fn().mockResolvedValue('processed'),
    markDeliveryFailed: vi.fn().mockResolvedValue(undefined),
  }
}

function signedRequest(
  body: string,
  event: string,
  headerOverrides: Record<string, string> = {},
): Request {
  const signature = createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex')
  const headers = new Headers({
    'content-type': 'application/json',
    'x-github-delivery': 'delivery-1',
    'x-github-event': event,
    'x-hub-signature-256': `sha256=${signature}`,
  })
  for (const [name, value] of Object.entries(headerOverrides)) {
    if (value) headers.set(name, value)
    else headers.delete(name)
  }
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers,
    body,
  })
}

function emptyPlan(): WebhookSyncPlan {
  return {
    installations: [],
    repositories: [],
    attachedRepositories: [],
    detachedRepositoryIds: [],
    deletedRepositoryIds: [],
    pullRequests: [],
    reviews: [],
  }
}

function installationFixture() {
  return {
    id: 42,
    account: { id: 7, login: 'acme', type: 'Organization' },
    suspended_at: null,
  }
}

function repositoryFixture() {
  return {
    node_id: 'R_repo',
    name: 'rocket',
    full_name: 'acme/rocket',
    owner: { id: 7, login: 'acme', type: 'Organization' },
    default_branch: 'main',
    private: true,
    archived: false,
  }
}

function pullRequestPayload() {
  return {
    action: 'review_requested',
    installation: installationFixture(),
    repository: repositoryFixture(),
    pull_request: {
      node_id: 'PR_one',
      number: 12,
      title: 'Ship it',
      html_url: 'https://github.com/acme/rocket/pull/12',
      user: { login: 'author' },
      base: { ref: 'main' },
      head: { ref: 'feature', repo: { name: 'rocket', owner: { login: 'acme' } } },
      draft: false,
      state: 'open',
      merged: false,
      mergeable: true,
      updated_at: '2026-06-06T11:00:00Z',
      closed_at: null,
      merged_at: null,
      commits: 3,
      comments: 4,
      requested_reviewers: [
        { login: 'octo', type: 'User' },
        { login: 'ci-bot', type: 'Bot' },
      ],
      requested_teams: [{ slug: 'platform' }],
    },
  }
}
