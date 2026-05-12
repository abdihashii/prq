import type { z } from 'zod'
import type { SeenRepoSchema } from '../schemas/seenRepo'

export type SeenRepo = z.infer<typeof SeenRepoSchema>
