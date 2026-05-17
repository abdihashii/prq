import type { DeviceFlowPollResponse, DeviceFlowStartResponse } from '@prq/shared'
import {
  ApiErrorSchema,
  DeviceFlowPollResponseSchema,
  DeviceFlowStartResponseSchema,
} from '@prq/shared'
import { ApiError } from '@/lib/api-error'

export async function startDeviceFlow(): Promise<DeviceFlowStartResponse> {
  const response = await fetch('/api/auth/device/start', { method: 'POST' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return DeviceFlowStartResponseSchema.parse(data)
}

export async function pollDeviceFlow(deviceCode: string): Promise<DeviceFlowPollResponse> {
  const response = await fetch('/api/auth/device/poll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  return DeviceFlowPollResponseSchema.parse(data)
}

export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/session', { method: 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) throw new ApiError(parsed.data.error)
    throw new Error(`HTTP ${response.status}`)
  }
}
