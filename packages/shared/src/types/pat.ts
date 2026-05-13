import type { z } from 'zod'
import type { PatSubmitSchema, TokenHealthResponseSchema } from '../schemas/pat'

export type PatSubmit = z.infer<typeof PatSubmitSchema>
export type TokenHealthResponse = z.infer<typeof TokenHealthResponseSchema>
