import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { graphql } from '@octokit/graphql'
import { env } from '../env.js'

const here = dirname(fileURLToPath(import.meta.url))
const QUERY = readFileSync(join(here, '../queries/getPullRequests.graphql'), 'utf8')

const gh = graphql.defaults({
  headers: { authorization: `token ${env.GITHUB_PAT}` },
})

export async function fetchPullRequests(): Promise<unknown> {
  return gh(QUERY)
}
