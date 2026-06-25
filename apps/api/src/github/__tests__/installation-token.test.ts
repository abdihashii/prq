import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createInstallationToken, InstallationTokenError } from '../installation-token'

const NOW = new Date('2026-06-24T12:00:00.000Z')
const PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const CONFIG = { clientId: 'Iv1.client', privateKey: PRIVATE_KEY }

describe('createInstallationToken', () => {
  it('mints an installation-wide token when no scope is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'installation-token' }))

    await expect(createInstallationToken({
      installationId: '42',
      config: CONFIG,
      fetch: fetchMock,
      now: () => NOW,
    })).resolves.toBe('installation-token')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/app/installations/42/access_tokens',
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({})
  })

  it('passes repository and permission scopes through to GitHub', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'installation-token' }))

    await createInstallationToken({
      installationId: '42',
      config: CONFIG,
      repositories: ['rocket'],
      permissions: { pull_requests: 'read', metadata: 'read' },
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      repositories: ['rocket'],
      permissions: { pull_requests: 'read', metadata: 'read' },
    })
  })

  it('fails clearly for missing config and GitHub errors', async () => {
    await expect(createInstallationToken({
      installationId: '42',
      config: { clientId: '', privateKey: '' },
    })).rejects.toThrow('PRQ_GITHUB_CLIENT_ID, PRQ_GITHUB_PRIVATE_KEY')

    await expect(createInstallationToken({
      installationId: '42',
      config: CONFIG,
      fetch: vi.fn().mockResolvedValue(jsonResponse({ message: 'installation suspended' }, 403)),
      now: () => NOW,
    })).rejects.toEqual(new InstallationTokenError('installation suspended', 403))
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
