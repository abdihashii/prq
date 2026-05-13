import { TokenHealthResponseSchema } from '@prq/shared'

export async function getViewer(pat: string): Promise<{ login: string }> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `token ${pat}`,
      'user-agent': 'prq',
      accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) {
    throw Object.assign(new Error(`GitHub /user returned ${res.status}`), {
      status: res.status,
    })
  }

  const body = await res.json()
  return TokenHealthResponseSchema.parse(body)
}
