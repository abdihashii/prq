import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { getRuntimeKey } from 'hono/adapter'
import postgres, { type Sql } from 'postgres'
import { resolveDatabaseConfig, type DatabaseConfig } from './config'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

export interface DatabaseClient {
  db: Database
  sql: Sql
  close: () => Promise<void>
}

export interface PostgresDriverOptions {
  /** Fetch array/custom type OIDs on connect. Disable on Hyperdrive to save a round-trip. */
  fetchTypes?: boolean
}

let cachedDatabase: DatabaseClient | null = null

export function createDatabase(
  config: DatabaseConfig = resolveDatabaseConfig(),
  options: PostgresDriverOptions = {},
): DatabaseClient {
  const sql = postgres(config.url, {
    max: config.maxConnections,
    ssl: config.ssl,
    ...(options.fetchTypes !== undefined ? { fetch_types: options.fetchTypes } : {}),
  })
  const db = drizzle(sql, { schema })

  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  }
}

export function getDatabase(): DatabaseClient {
  // The Node singleton resolves its config from process.env (DATABASE_URL). On
  // Workers there is no DATABASE_URL binding, so this would throw a cryptic
  // "DATABASE_URL is required" far from the real cause. Every store factory that
  // defaults to this funnels through here, so guard the invariant once: on Workers
  // a per-request db (createWorkerDb) must be injected instead.
  if (getRuntimeKey() === 'workerd') {
    throw new Error(
      'getDatabase() is the Node singleton and has no database binding on Workers. '
      + 'Inject a per-request db (createWorkerDb) into the store instead.',
    )
  }
  cachedDatabase ??= createDatabase()
  return cachedDatabase
}

export async function closeDatabase(): Promise<void> {
  const database = cachedDatabase
  cachedDatabase = null
  await database?.close()
}
