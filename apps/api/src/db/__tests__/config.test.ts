import { describe, expect, it } from 'vitest'
import {
  LOCAL_DATABASE_URL,
  resolveDatabaseConfig,
  TEST_DATABASE_URL,
  toDrizzlePostgresCredentials,
} from '../config'

describe('resolveDatabaseConfig', () => {
  it('uses the local database URL by default', () => {
    expect(resolveDatabaseConfig({}).url).toBe(LOCAL_DATABASE_URL)
  })

  it('uses the test database URL when NODE_ENV=test', () => {
    expect(resolveDatabaseConfig({ NODE_ENV: 'test' })).toMatchObject({
      url: TEST_DATABASE_URL,
      maxConnections: 1,
      ssl: false,
    })
  })

  it('uses an explicit DATABASE_URL when provided', () => {
    expect(resolveDatabaseConfig({
      DATABASE_URL: ' postgresql://user:pass@example.com:5432/prq ',
      NODE_ENV: 'test',
    })).toMatchObject({
      url: 'postgresql://user:pass@example.com:5432/prq',
    })
  })

  it('requires DATABASE_URL in production', () => {
    expect(() => resolveDatabaseConfig({ NODE_ENV: 'production' }))
      .toThrow('DATABASE_URL is required when NODE_ENV=production')
  })

  it('defaults production SSL to require when a production URL is present', () => {
    expect(resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user:pass@example.com/prq',
      NODE_ENV: 'production',
    }).ssl).toBe('require')
  })

  it('parses explicit SSL and connection-pool settings', () => {
    expect(resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user:pass@example.com/prq',
      NODE_ENV: 'development',
      PRQ_DATABASE_MAX_CONNECTIONS: '7',
      PRQ_DATABASE_SSL: 'prefer',
    })).toMatchObject({
      maxConnections: 7,
      ssl: 'prefer',
    })
  })

  it('rejects invalid database URLs', () => {
    expect(() => resolveDatabaseConfig({
      DATABASE_URL: 'https://example.com/prq',
      NODE_ENV: 'development',
    })).toThrow('DATABASE_URL must use the postgres:// or postgresql:// protocol')
  })

  it('rejects database URLs without a database name', () => {
    expect(() => resolveDatabaseConfig({
      DATABASE_URL: 'postgres://example.com',
      NODE_ENV: 'development',
    })).toThrow('DATABASE_URL must include a database name')
  })

  it('rejects invalid connection-pool sizes', () => {
    expect(() => resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user:pass@example.com/prq',
      PRQ_DATABASE_MAX_CONNECTIONS: '0',
    })).toThrow('PRQ_DATABASE_MAX_CONNECTIONS must be a positive integer')
  })
})

describe('toDrizzlePostgresCredentials', () => {
  it('converts local config to host credentials without SSL', () => {
    expect(toDrizzlePostgresCredentials(resolveDatabaseConfig({}))).toEqual({
      host: 'localhost',
      port: 5432,
      user: 'prq',
      password: 'prq',
      database: 'prq_dev',
    })
  })

  it('passes production default SSL to Drizzle Kit host credentials', () => {
    expect(toDrizzlePostgresCredentials(resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user:pass@example.com/prq',
      NODE_ENV: 'production',
    }))).toEqual({
      host: 'example.com',
      user: 'user',
      password: 'pass',
      database: 'prq',
      ssl: 'require',
    })
  })

  it('maps explicit SSL modes for Drizzle Kit', () => {
    expect(toDrizzlePostgresCredentials(resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user:pass@example.com/prq',
      PRQ_DATABASE_SSL: 'verify-full',
    })).ssl).toBe('verify-full')
  })

  it('omits SSL for explicit false values', () => {
    expect(toDrizzlePostgresCredentials(resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user:pass@example.com/prq',
      NODE_ENV: 'production',
      PRQ_DATABASE_SSL: 'false',
    }))).not.toHaveProperty('ssl')
  })

  it('decodes URL username, password, and database components', () => {
    expect(toDrizzlePostgresCredentials(resolveDatabaseConfig({
      DATABASE_URL: 'postgres://user%40example.com:p%23ss@example.com:6543/prq%20prod',
    }))).toEqual({
      host: 'example.com',
      port: 6543,
      user: 'user@example.com',
      password: 'p#ss',
      database: 'prq prod',
    })
  })
})
