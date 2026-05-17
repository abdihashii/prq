import type { z } from 'zod'
import type {
  DeviceFlowPollRequestSchema,
  DeviceFlowPollResponseSchema,
  DeviceFlowStartResponseSchema,
  TokenHealthResponseSchema,
} from '../schemas/auth'

export type DeviceFlowStartResponse = z.infer<typeof DeviceFlowStartResponseSchema>
export type DeviceFlowPollRequest = z.infer<typeof DeviceFlowPollRequestSchema>
export type DeviceFlowPollResponse = z.infer<typeof DeviceFlowPollResponseSchema>
export type TokenHealthResponse = z.infer<typeof TokenHealthResponseSchema>
