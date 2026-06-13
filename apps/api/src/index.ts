import { serve } from '@hono/node-server'
import { createApp } from './app'
import { assertRequiredConfig, isProductionEnv, resolveRequestConfig } from './config'
import { startAutoRetargetWorker } from './github/auto-retarget'

try {
  assertRequiredConfig(resolveRequestConfig(), { production: isProductionEnv() })
}
catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const app = createApp()

startAutoRetargetWorker()

serve({ fetch: app.fetch, port: 3001 }, ({ port }) => {
  console.log(`prq api listening on :${port}`)
})
