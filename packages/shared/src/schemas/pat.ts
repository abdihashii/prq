import { z } from 'zod'

export const PatSubmitSchema = z.object({
  pat: z.string().min(1),
})

export const TokenHealthResponseSchema = z.object({
  login: z.string(),
})
