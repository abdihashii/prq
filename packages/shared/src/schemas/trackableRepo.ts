import { z } from 'zod'

export const TrackableRepoSchema = z.object({
  owner: z.string(),
  name: z.string(),
  prCount: z.number().int().nonnegative(),
})
