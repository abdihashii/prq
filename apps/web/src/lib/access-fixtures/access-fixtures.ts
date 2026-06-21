import type { Installation, TrackableRepo } from '@prq/shared'

export const INSTALLATION_USER: Installation = {
  installationId: '42',
  accountLogin: 'octocat',
  accountType: 'User',
}

export const INSTALLATION_ORG: Installation = {
  installationId: '7',
  accountLogin: 'acme',
  accountType: 'Organization',
}

export const INSTALLATIONS_MULTI: Installation[] = [INSTALLATION_USER, INSTALLATION_ORG]

export const TRACKABLE_REPOS: TrackableRepo[] = [
  { owner: 'acme', name: 'web', prCount: 7 },
  { owner: 'acme', name: 'api', prCount: 3 },
  { owner: 'acme', name: 'mobile', prCount: 1 },
  { owner: 'octocat', name: 'dotfiles', prCount: 0 },
  { owner: 'octocat', name: 'playground', prCount: 2 },
]

export const TRACKABLE_REPOS_MANY: TrackableRepo[] = Array.from({ length: 24 }, (_, i) => ({
  owner: 'acme',
  name: `service-${String(i + 1).padStart(2, '0')}`,
  prCount: (i * 3) % 5,
}))
