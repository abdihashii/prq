import type { z } from 'zod'
import type { BucketSchema } from '../schemas/bucket'

export type Bucket = z.infer<typeof BucketSchema>
