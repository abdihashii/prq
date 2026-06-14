export const LOCAL_DATABASE_URL = 'postgres://prq:prq@localhost:5432/prq_dev'
export const TEST_DATABASE_URL = 'postgres://prq:prq@localhost:5432/prq_test'

try {
  process.loadEnvFile()
}
catch {
  // No .env file at CWD. DB scripts and tests can still use safe defaults.
}

export type DatabaseSslMode = false | true | 'allow' | 'prefer' | 'require' | 'verify-full'

export interface DatabaseConfig {
  url: string
  ssl: DatabaseSslMode
  maxConnections: number
}

export interface DrizzlePostgresCredentials {
  host: string
  port?: number
  user?: string
  password?: string
  database: string
  ssl?: Exclude<DatabaseSslMode, false>
}

type Env = Record<string, string | undefined>

export function resolveDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const nodeEnv = env['NODE_ENV']?.trim() || 'development'
  const explicitUrl = emptyToUndefined(env['DATABASE_URL'])

  if (nodeEnv === 'production' && explicitUrl === undefined) {
    throw new Error('DATABASE_URL is required when NODE_ENV=production')
  }

  const url = explicitUrl ?? (nodeEnv === 'test' ? TEST_DATABASE_URL : LOCAL_DATABASE_URL)
  validateDatabaseUrl(url)

  return {
    url,
    ssl: resolveSslMode(env['PRQ_DATABASE_SSL'], nodeEnv),
    maxConnections: resolveMaxConnections(env['PRQ_DATABASE_MAX_CONNECTIONS'], nodeEnv),
  }
}

export function toDrizzlePostgresCredentials(
  config: DatabaseConfig,
): DrizzlePostgresCredentials {
  const parsed = parseDatabaseUrl(config.url)
  const database = decodeUrlPart(parsed.pathname.slice(1))

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL must include a host')
  }
  if (!database) {
    throw new Error('DATABASE_URL must include a database name')
  }

  const credentials: DrizzlePostgresCredentials = {
    host: parsed.hostname,
    database,
  }

  if (parsed.port) credentials.port = Number(parsed.port)
  if (parsed.username) credentials.user = decodeUrlPart(parsed.username)
  if (parsed.password) credentials.password = decodeUrlPart(parsed.password)
  if (config.ssl !== false) credentials.ssl = config.ssl

  return credentials
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseDatabaseUrl(url: string): URL {
  try {
    return new URL(url)
  }
  catch {
    throw new Error('DATABASE_URL must be a valid Postgres connection URL')
  }
}

/**
 * Assert that a Postgres connection URL is well-formed: parseable, postgres(ql)://
 * protocol, with a host and database name. Throws with a specific message on the
 * first violation. Used by the env resolver and the Worker's Hyperdrive path, which
 * builds its config outside resolveDatabaseConfig.
 *
 * @param url - The connection URL to validate.
 */
export function validateDatabaseUrl(url: string): void {
  const parsed = parseDatabaseUrl(url)

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol')
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL must include a host')
  }
  if (!decodeUrlPart(parsed.pathname.slice(1))) {
    throw new Error('DATABASE_URL must include a database name')
  }
}

function decodeUrlPart(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    throw new Error('DATABASE_URL contains invalid percent-encoding')
  }
}

function resolveSslMode(value: string | undefined, nodeEnv: string): DatabaseSslMode {
  const normalized = emptyToUndefined(value)?.toLowerCase()
  if (normalized === undefined) return nodeEnv === 'production' ? 'require' : false

  switch (normalized) {
    case '0':
    case 'disable':
    case 'false':
      return false
    case '1':
    case 'require':
    case 'true':
      return 'require'
    case 'allow':
    case 'prefer':
    case 'verify-full':
      return normalized
    default:
      throw new Error(
        'PRQ_DATABASE_SSL must be one of disable, allow, prefer, require, verify-full, true, false, 1, or 0',
      )
  }
}

function resolveMaxConnections(value: string | undefined, nodeEnv: string): number {
  const normalized = emptyToUndefined(value)
  if (normalized === undefined) return nodeEnv === 'test' ? 1 : 10

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('PRQ_DATABASE_MAX_CONNECTIONS must be a positive integer')
  }

  return parsed
}
