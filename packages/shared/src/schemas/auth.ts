import { z } from 'zod'

export const TokenHealthResponseSchema = z.object({
  login: z.string(),
})
