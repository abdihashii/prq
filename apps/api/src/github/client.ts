import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { graphql } from '@octokit/graphql'

const here = dirname(fileURLToPath(import.meta.url))
const QUERY = readFileSync(join(here, '../queries/getPullRequests.graphql'), 'utf8')

export async function fetchPullRequests(pat: string): Promise<unknown> {
  const gh = graphql.defaults({
    headers: { authorization: `Bearer ${pat}` },
  })
  return gh(QUERY)
}
