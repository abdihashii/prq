import { githubWebhookSecret } from '../config'
import { createAutoRetargetService } from './auto-retarget'
import type { AutoRetargetService, MergedParentRetarget } from './auto-retarget'
import {
  describeDelivery,
  normalizeWebhook,
  parseWebhookJson,
  readWebhookHeaders,
  verifyWebhookSignature,
} from './webhook/protocol'
import { createDrizzleWebhookStore } from './webhook/store'
import type { WebhookStore } from './webhook/types'
import type { WebhookDelivery, WebhookSyncPlan } from './webhook/types'

interface WebhookDependencies {
  secret?: string
  store?: WebhookStore
  autoRetarget?: AutoRetargetService
  now?: () => Date
}

/**
 * Authenticates and synchronously ingests one GitHub App webhook delivery.
 * Valid JSON deliveries are reserved before supported-payload validation;
 * state changes and the processed transition are atomic and redeliveries are
 * idempotent.
 */
export async function ingestGitHubWebhook(
  request: Request,
  dependencies: WebhookDependencies = {},
): Promise<void> {
  const headers = readWebhookHeaders(request)
  const body = new Uint8Array(await request.arrayBuffer())
  verifyWebhookSignature(body, headers.signature, dependencies.secret ?? githubWebhookSecret)
  const payload = parseWebhookJson(body)
  const delivery = describeDelivery(headers.deliveryId, headers.event, payload)
  const store = dependencies.store ?? createDrizzleWebhookStore()
  const now = dependencies.now?.() ?? new Date()

  await store.reserveDelivery(delivery)

  let syncPlan: WebhookSyncPlan
  try {
    syncPlan = normalizeWebhook(delivery)
    await store.applyDelivery(delivery.deliveryId, syncPlan, now)
  }
  catch (error) {
    try {
      await store.markDeliveryFailed(delivery.deliveryId, error, now)
    }
    catch (markError) {
      console.error('failed to mark GitHub webhook delivery failed:', markError)
    }
    throw error
  }

  const retarget = mergedParentRetarget(delivery, syncPlan)
  if (retarget !== null) {
    await (dependencies.autoRetarget ?? createAutoRetargetService()).retargetMergedParent(retarget)
  }
}

function mergedParentRetarget(
  delivery: WebhookDelivery,
  syncPlan: WebhookSyncPlan,
): MergedParentRetarget | null {
  const request = syncPlan.autoRetargetRequests[0]
  if (!request) return null
  return {
    deliveryId: delivery.deliveryId,
    ...request,
  }
}
