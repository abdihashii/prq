import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  // cloudflare() binds the build to the Workers runtime; viteEnvironment 'ssr' is the
  // environment TanStack Start emits the server entry into, even in SPA mode (it serves
  // the prerendered shell + edge-static client assets). Deploys via apps/web/wrangler.jsonc.
  // Excluded under vitest: the plugin rejects vitest's injected ssr `resolve.external`,
  // and tests don't need the Workers build anyway.
  plugins: [
    ...(process.env.VITEST ? [] : [cloudflare({ viteEnvironment: { name: 'ssr' } })]),
    devtools(),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})

export default config
