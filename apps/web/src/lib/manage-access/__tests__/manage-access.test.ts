import type { Installation } from '@prq/shared'
import { describe, expect, it } from 'vitest'
import { manageAccessTargets } from '../manage-access'

describe('manageAccessTargets', () => {
  it('returns the install-new fallback when there are no installations', () => {
    expect(manageAccessTargets([])).toEqual([
      { label: 'Install prq on GitHub', url: '/api/auth/github/install' },
    ])
  })

  it('deep-links a personal (User) installation to account settings', () => {
    const installations: Installation[] = [
      { installationId: '42', accountLogin: 'octocat', accountType: 'User' },
    ]
    expect(manageAccessTargets(installations)).toEqual([
      {
        label: 'Manage access for octocat',
        url: 'https://github.com/settings/installations/42',
      },
    ])
  })

  it('deep-links an organization installation to the org settings shape', () => {
    const installations: Installation[] = [
      { installationId: '7', accountLogin: 'acme', accountType: 'Organization' },
    ]
    expect(manageAccessTargets(installations)).toEqual([
      {
        label: 'Manage access for acme',
        url: 'https://github.com/organizations/acme/settings/installations/7',
      },
    ])
  })

  it('maps one target per installation, preserving order', () => {
    const installations: Installation[] = [
      { installationId: '1', accountLogin: 'octocat', accountType: 'User' },
      { installationId: '2', accountLogin: 'acme', accountType: 'Organization' },
    ]
    const targets = manageAccessTargets(installations)
    expect(targets).toHaveLength(2)
    expect(targets[0].url).toBe('https://github.com/settings/installations/1')
    expect(targets[1].url).toBe(
      'https://github.com/organizations/acme/settings/installations/2',
    )
  })
})
