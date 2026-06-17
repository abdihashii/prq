import { createDrizzleAuthStore, type AuthDependencies } from './auth/session'
import { type GitHubAppMutationConfig, type RequestConfig } from './config'
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
import { createDatabase, validateDatabaseUrl, type Database, type DatabaseClient } from './db'
import {
  createAutoRetargetService,
  createAutoRetargetWorker,
  type AutoRetargetWorker,
} from './github/auto-retarget'
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
  PRQ_GITHUB_ALLOWED_USER_IDS?: string
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
 * Build the per-request context from already-resolved config and a database handle.
 * The single place that wires config and DB into the auth, dashboard, and webhook
 * dependency bundles. Config is resolved once by the caller (the fetch middleware,
 * which also gates on it) and passed in, so a request reads its env only once.
 *
 * @param input.config - Resolved request config (auth, mutation, webhook secret).
 * @param input.production - Whether this is production (drives Secure cookies).
 * @param input.db - The database handle for this request's lifetime.
 * @returns Ready-bound auth deps, dashboard facade, webhook deps, and cookie policy.
 */
export function createRequestContext(input: {
  config: RequestConfig
  production: boolean
  db: Database
}): RequestContext {
  const { config, production, db } = input
  const { authConfig, mutationConfig, webhookSecret } = config
  const cookiePolicy: CookiePolicy = { secure: production }

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
    autoRetarget: createAutoRetargetService(
      createAutoRetargetDeps({ db, mutationConfig }),
    ),
  }

  return { authDeps, dashboard, webhookDeps, cookiePolicy }
}

// Workers cap concurrent external connections; Hyperdrive pools upstream, so the
// per-isolate client stays small.
const WORKER_MAX_CONNECTIONS = 5

/**
 * Open a per-request/-invocation database client over the Hyperdrive binding. Hides
 * the connection string and Worker driver tuning (no SSL, small pool, Hyperdrive
 * caches prepared statements so type fetches are skipped). Caller owns close().
 *
 * @param env - Worker bindings carrying the Hyperdrive handle.
 * @returns A database client; call close() when the request/invocation ends.
 */
export function createWorkerDb(env: WorkerBindings): DatabaseClient {
  const url = env.HYPERDRIVE.connectionString
  validateDatabaseUrl(url)
  return createDatabase(
    {
      url,
      ssl: false,
      maxConnections: WORKER_MAX_CONNECTIONS,
    },
    { fetchTypes: false },
  )
}

// The auto-retarget store + GitHub client wiring, shared by the per-request webhook
// path (wrapped in a service) and the cron handler (wrapped in a worker), so the
// construction lives in one place.
function createAutoRetargetDeps(input: {
  db: Database
  mutationConfig: GitHubAppMutationConfig
}) {
  return {
    store: createDrizzleAutoRetargetStore(input.db),
    github: createGitHubRetargetClient({ config: input.mutationConfig }),
  }
}

/**
 * Build the auto-retarget worker for the Cron Trigger from resolved mutation config and
 * a database handle. Mirrors createRequestContext, keeping store and GitHub-client wiring
 * out of the Worker entry point. Returns the worker with runOnce(), not the per-event
 * service that createRequestContext exposes.
 *
 * @param input.mutationConfig - Resolved GitHub App mutation config (client id + key).
 * @param input.db - The database handle for this invocation's lifetime.
 * @returns An auto-retarget worker ready to runOnce().
 */
export function createAutoRetargetCronWorker(input: {
  mutationConfig: GitHubAppMutationConfig
  db: Database
}): AutoRetargetWorker {
  return createAutoRetargetWorker(createAutoRetargetDeps(input))
}
