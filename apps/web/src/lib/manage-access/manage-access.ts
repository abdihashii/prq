import type { Installation } from '@prq/shared'

/** Relative API route that redirects a viewer into the GitHub App install flow. */
const INSTALL_NEW_PATH = '/api/auth/github/install'

export interface ManageAccessTarget {
  /** Human-readable, action-complete link text (no URL rules leak to callers). */
  label: string
  /** Destination URL: a GitHub settings deep-link, or the install-new fallback. */
  url: string
}

/**
 * Build the "manage repository access" links for a viewer's installations.
 *
 * Each installation maps to its GitHub settings deep-link, with distinct URL
 * shapes for personal (`User`) vs organization accounts. Zero installations is
 * a defined value, not an error: it returns a single fallback target into the
 * install-new flow so a viewer can always widen access.
 *
 * @param installations - The viewer's active installations.
 * @returns One target per installation, or a single install-new fallback target
 *   when there are none. Order mirrors `installations`.
 *
 * @example
 * manageAccessTargets([])
 * // => [{ label: 'Install prq on GitHub', url: '/api/auth/github/install' }]
 *
 * @example
 * manageAccessTargets([
 *   { installationId: '42', accountLogin: 'octocat', accountType: 'User' },
 * ])
 * // => [{ label: 'Manage access for octocat',
 * //      url: 'https://github.com/settings/installations/42' }]
 *
 * @example
 * manageAccessTargets([
 *   { installationId: '7', accountLogin: 'acme', accountType: 'Organization' },
 * ])
 * // => [{ label: 'Manage access for acme',
 * //      url: 'https://github.com/organizations/acme/settings/installations/7' }]
 */
export function manageAccessTargets(installations: Installation[]): ManageAccessTarget[] {
  if (installations.length === 0) {
    return [{ label: 'Install prq on GitHub', url: INSTALL_NEW_PATH }]
  }
  return installations.map(installation => ({
    label: `Manage access for ${installation.accountLogin}`,
    url: installationSettingsUrl(installation),
  }))
}

/** Build the GitHub settings deep-link for a single installation. */
function installationSettingsUrl(installation: Installation): string {
  if (installation.accountType === 'Organization') {
    return `https://github.com/organizations/${installation.accountLogin}/settings/installations/${installation.installationId}`
  }
  return `https://github.com/settings/installations/${installation.installationId}`
}
