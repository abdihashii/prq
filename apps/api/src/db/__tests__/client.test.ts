import { afterEach, describe, expect, it } from 'vitest'
import { closeDatabase, createDatabase, getDatabase } from '../client'

afterEach(async () => {
  await closeDatabase()
})

describe('database client boundary', () => {
  it('constructs a typed Drizzle client without issuing a query', async () => {
    const client = createDatabase({
      url: 'postgres://user:pass@localhost:5432/prq_test',
      ssl: false,
      maxConnections: 1,
    })

    expect(client.db).toBeDefined()
    expect(typeof client.sql).toBe('function')
    expect(typeof client.close).toBe('function')

    await client.close()
  })

  it('caches and closes the default database client behind one module boundary', async () => {
    const first = getDatabase()
    const second = getDatabase()

    expect(second).toBe(first)

    await closeDatabase()

    const third = getDatabase()
    expect(third).not.toBe(first)
  })
})
