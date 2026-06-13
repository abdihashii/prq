import { createDrizzleAuthStore, type AuthDependencies } from './auth/session'
import { isProductionEnv, resolveRequestConfig } from './config'
import {
  createDashboardFacade,
  createDrizzleDashboardStore,
  type DashboardFacade,
} from './dashboard/dashboard'
import {
  createDrizzleDashboardAuthorizationStore,
  createDrizzleDashboardReconciliationStore,
  createGitHubDashboardAuthorization,
  createGitHubDashboardReconciler,
} from './dashboard/github'
import type { Database } from './db'
import { createAutoRetargetService } from './github/auto-retarget'
import { createGitHubRetargetClient } from './github/auto-retarget/github'
import { createDrizzleAutoRetargetStore } from './github/auto-retarget/store'
import type { WebhookDependencies } from './github/webhook'
import { createDrizzleWebhookStore } from './github/webhook/store'

/** Cloudflare Worker bindings: the Hyperdrive handle plus config vars and secrets. */
export interface WorkerBindings {
  HYPERDRIVE: { connectionString: string }
  PRQ_GITHUB_CLIENT_ID?: string
  PRQ_GITHUB_CLIENT_SECRET?: string
  PRQ_GITHUB_PRIVATE_KEY?: string
  PRQ_GITHUB_WEBHOOK_SECRET?: string
  PRQ_GITHUB_CALLBACK_URL?: string
  PRQ_WEB_URL?: string
  PRQ_GITHUB_APP_SLUG?: string
  NODE_ENV?: string
}

export interface CookiePolicy {
  secure: boolean
}

/**
 * Everything a single request needs, assembled once from the environment. Hides
 * postgres.js, Drizzle, store construction, and config resolution behind ready-bound
 * capabilities, so handlers depend only on this surface.
 */
export interface RequestContext {
  authDeps: AuthDependencies
  dashboard: DashboardFacade
  webhookDeps: WebhookDependencies
  cookiePolicy: CookiePolicy
}

/** Hono environment: typed Worker bindings plus the per-request context on c.var. */
export interface AppEnv {
  Bindings: WorkerBindings
  Variables: { ctx: RequestContext }
}

/**
 * Build the per-request context from a resolved environment and database handle.
 * The single place that wires config and DB into the auth, dashboard, and webhook
 * dependency bundles; shared by the fetch middleware and the cron handler.
 *
 * @param input.env - String env vars/secrets (c.env on Workers, process.env on Node).
 * @param input.db - The database handle for this request's lifetime.
 * @returns Ready-bound auth deps, dashboard facade, webhook deps, and cookie policy.
 */
export function createRequestContext(input: {
  env: Record<string, string | undefined>
  db: Database
}): RequestContext {
  const { env, db } = input
  const { authConfig, mutationConfig, webhookSecret } = resolveRequestConfig(env)
  const cookiePolicy: CookiePolicy = { secure: isProductionEnv(env) }

  const authDeps: AuthDependencies = {
    config: authConfig,
    store: createDrizzleAuthStore(db),
    cookieSecure: cookiePolicy.secure,
  }

  const dashboard = createDashboardFacade({
    store: createDrizzleDashboardStore(db),
    authorization: createGitHubDashboardAuthorization({
      store: createDrizzleDashboardAuthorizationStore(db),
    }),
    reconciler: createGitHubDashboardReconciler({
      store: createDrizzleDashboardReconciliationStore(db),
    }),
  })

  const webhookDeps: WebhookDependencies = {
    secret: webhookSecret,
    store: createDrizzleWebhookStore(db),
    autoRetarget: createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(db),
      github: createGitHubRetargetClient({ config: mutationConfig }),
    }),
  }

  return { authDeps, dashboard, webhookDeps, cookiePolicy }
}
