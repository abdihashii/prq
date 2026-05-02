import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    ignores: ['apps/**', 'packages/**', 'node_modules/**', 'dist/**', '.pnpm-store/**'],
  },
]
