import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestGitHubWebhook } from '../../github/webhook'
import { webhooks } from '../webhooks'

vi.mock('../../github/webhook', () => ({
  ingestGitHubWebhook: vi.fn(),
}))

const mockedIngest = vi.mocked(ingestGitHubWebhook)
const makeApp = () => new Hono().route('/api', webhooks)

beforeEach(() => {
  mockedIngest.mockReset()
  mockedIngest.mockResolvedValue(undefined)
})

describe('POST /api/webhooks/github', () => {
  it('passes the raw request to the ingestion facade and returns 204', async () => {
    const res = await makeApp().request('/api/webhooks/github', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.status).toBe(204)
    expect(mockedIngest).toHaveBeenCalledOnce()
    expect(mockedIngest.mock.calls[0]?.[0]).toBeInstanceOf(Request)
  })

  it('maps malformed requests, bad signatures, and internal failures', async () => {
    for (const [status, expectedStatus, code] of [
      [400, 400, 'BAD_REQUEST'],
      [401, 401, 'BAD_SIGNATURE'],
      [undefined, 500, 'INTERNAL_ERROR'],
    ] as const) {
      mockedIngest.mockRejectedValueOnce(Object.assign(new Error('failure'), { status }))
      const res = await makeApp().request('/api/webhooks/github', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      expect(res.status).toBe(expectedStatus)
      expect((await res.json()).error.code).toBe(code)
    }
  })

  it('rejects bodies over 25 MB before ingestion', async () => {
    const res = await makeApp().request('/api/webhooks/github', {
      method: 'POST',
      headers: {
        'content-length': String(25 * 1024 * 1024 + 1),
        'content-type': 'application/json',
      },
      body: '{}',
    })

    expect(res.status).toBe(413)
    expect(mockedIngest).not.toHaveBeenCalled()
  })
})
