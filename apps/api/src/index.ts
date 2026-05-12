import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { prs } from './routes/prs'

const app = new Hono()
app.get('/health', c => c.json({ ok: true }))
app.route('/api', prs)

serve({ fetch: app.fetch, port: 3001 }, ({ port }) => {
  console.log(`prq api listening on :${port}`)
})
