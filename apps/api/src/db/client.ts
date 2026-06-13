import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import { resolveDatabaseConfig, type DatabaseConfig } from './config'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

export interface DatabaseClient {
  db: Database
  sql: Sql
  close: () => Promise<void>
}

let cachedDatabase: DatabaseClient | null = null

export function createDatabase(config: DatabaseConfig = resolveDatabaseConfig()): DatabaseClient {
  const sql = postgres(config.url, {
    max: config.maxConnections,
    ssl: config.ssl,
    prepare: false,
  })
  const db = drizzle(sql, { schema })

  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  }
}

export function getDatabase(): DatabaseClient {
  cachedDatabase ??= createDatabase()
  return cachedDatabase
}

export async function closeDatabase(): Promise<void> {
  const database = cachedDatabase
  cachedDatabase = null
  await database?.close()
}
