export class DashboardBadCredentialsError extends Error {
  constructor() {
    super('GitHub credentials were rejected')
    this.name = 'DashboardBadCredentialsError'
  }
}

export class DashboardRateLimitedError extends Error {
  constructor() {
    super('GitHub rate limit exceeded')
    this.name = 'DashboardRateLimitedError'
  }
}

export class DashboardUpstreamError extends Error {
  constructor() {
    super('GitHub dashboard synchronization failed')
    this.name = 'DashboardUpstreamError'
  }
}

/**
 * GitHub returned a clean response with `repository: null`: the repo no longer
 * resolves under that owner/name (deleted, transferred, renamed, or removed from
 * the App's selection). A terminal state, not a transient failure, so the
 * reconciler retires the row rather than retrying it forever.
 */
export class DashboardRepositoryGoneError extends Error {
  constructor() {
    super('GitHub repository no longer exists')
    this.name = 'DashboardRepositoryGoneError'
  }
}
