import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  plugins: [devtools(), tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
})

export default config
