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
