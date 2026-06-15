import type { z } from 'zod'
import type { InstallationSchema } from '../schemas/installation'

export type Installation = z.infer<typeof InstallationSchema>
