import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
app.get('/health', c => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3001 }, ({ port }) => {
  console.log(`prq api listening on :${port}`)
})
