import { z } from 'zod'

export const TokenHealthResponseSchema = z.object({
  login: z.string(),
})

export const DeviceFlowStartResponseSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.url(),
  interval: z.number().int().positive(),
  expiresIn: z.number().int().positive(),
})

export const DeviceFlowPollRequestSchema = z.object({
  deviceCode: z.string().min(1),
})

export const DeviceFlowPollResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('slow_down'), interval: z.number().int().positive() }),
  z.object({ status: z.literal('expired') }),
  z.object({ status: z.literal('denied') }),
  z.object({ status: z.literal('success'), login: z.string().min(1) }),
])
