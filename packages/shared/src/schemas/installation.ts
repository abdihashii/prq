import { z } from 'zod'

export const InstallationSchema = z.object({
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.enum(['User', 'Organization']),
})
