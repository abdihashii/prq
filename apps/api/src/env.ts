import { z } from 'zod'

const EnvSchema = z.object({
  GITHUB_PAT: z
    .string()
    .min(1, 'GITHUB_PAT must be set; create a fine-grained PAT (Pull requests: Read + Metadata: Read) and put it in apps/api/.env'),
})

export const env = EnvSchema.parse({
  GITHUB_PAT: process.env['GITHUB_PAT'],
})
