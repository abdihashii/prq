import type { z } from 'zod'
import type { TrackableRepoSchema } from '../schemas/trackableRepo'

export type TrackableRepo = z.infer<typeof TrackableRepoSchema>
