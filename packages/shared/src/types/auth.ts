import type { z } from 'zod'
import type { TokenHealthResponseSchema } from '../schemas/auth'

export type TokenHealthResponse = z.infer<typeof TokenHealthResponseSchema>
