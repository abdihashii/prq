import { githubWebhookSecret } from '../config'
import {
  describeDelivery,
  normalizeWebhook,
  parseWebhookJson,
  readWebhookHeaders,
  verifyWebhookSignature,
} from './webhook/protocol'
import { createDrizzleWebhookStore } from './webhook/store'
import type { WebhookStore } from './webhook/types'

interface WebhookDependencies {
  secret?: string
  store?: WebhookStore
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

  try {
    const syncPlan = normalizeWebhook(delivery)
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
}
