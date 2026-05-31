import { defineConfig } from 'drizzle-kit'
import { resolveDatabaseConfig, toDrizzlePostgresCredentials } from './src/db/config'

const databaseConfig = resolveDatabaseConfig()

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: toDrizzlePostgresCredentials(databaseConfig),
})
