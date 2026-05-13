import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { pat } from './routes/pat'
import { prs } from './routes/prs'
import { user } from './routes/user'

const app = new Hono()
app.use('/api/*', csrf())
app.get('/health', c => c.json({ ok: true }))
app.route('/api', prs)
app.route('/api', pat)
app.route('/api', user)

serve({ fetch: app.fetch, port: 3001 }, ({ port }) => {
  console.log(`prq api listening on :${port}`)
})
