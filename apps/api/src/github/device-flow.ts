import { z } from 'zod'
import { type DeviceFlowStartResponse, DeviceFlowStartResponseSchema } from '@prq/shared'

const SCOPE = 'repo read:user read:org'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'

const RawStartResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
})

const RawTokenSuccessSchema = z.object({
  access_token: z.string().min(1),
})

const RawTokenErrorSchema = z.object({
  error: z.string().min(1),
  interval: z.number().int().positive().optional(),
})

export type PollResult =
  | { kind: 'pending' }
  | { kind: 'slow_down', interval: number }
  | { kind: 'expired' }
  | { kind: 'denied' }
  | { kind: 'success', accessToken: string }

const SLOW_DOWN_FALLBACK_INTERVAL_SECONDS = 10

/**
 * Initiates the OAuth Device Flow with GitHub.
 *
 * @param clientId - OAuth App client_id (from PRQ_GITHUB_CLIENT_ID env var).
 * @returns The user code + verification URL the human visits, plus the
 *   device code the api polls with, and the interval/expiry GitHub returned.
 */
export async function startDeviceCode(clientId: string): Promise<DeviceFlowStartResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: SCOPE }),
  })
  if (!res.ok) {
    throw Object.assign(new Error(`GitHub /login/device/code returned ${res.status}`), {
      status: res.status,
    })
  }
  const raw = RawStartResponseSchema.parse(await res.json())
  return DeviceFlowStartResponseSchema.parse({
    deviceCode: raw.device_code,
    userCode: raw.user_code,
    verificationUri: raw.verification_uri,
    interval: raw.interval,
    expiresIn: raw.expires_in,
  })
}

/**
 * Polls GitHub's token endpoint with a device_code from a prior
 * startDeviceCode call. Maps GitHub's `error` field to the discriminated
 * union shape the api returns to web.
 *
 * @param clientId - OAuth App client_id.
 * @param deviceCode - The opaque code returned by startDeviceCode.
 */
export async function pollDeviceCode(
  clientId: string,
  deviceCode: string,
): Promise<PollResult> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const json: unknown = await res.json()

  const success = RawTokenSuccessSchema.safeParse(json)
  if (success.success) {
    return { kind: 'success', accessToken: success.data.access_token }
  }

  const errorParse = RawTokenErrorSchema.safeParse(json)
  if (!errorParse.success) {
    throw new Error('Unexpected GitHub token response')
  }
  switch (errorParse.data.error) {
    case 'authorization_pending':
      return { kind: 'pending' }
    case 'slow_down':
      return {
        kind: 'slow_down',
        interval: errorParse.data.interval ?? SLOW_DOWN_FALLBACK_INTERVAL_SECONDS,
      }
    case 'expired_token':
      return { kind: 'expired' }
    case 'access_denied':
      return { kind: 'denied' }
    default:
      throw Object.assign(
        new Error(`GitHub returned unexpected device-flow error: ${errorParse.data.error}`),
        { status: 502 },
      )
  }
}
