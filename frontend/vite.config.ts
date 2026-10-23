import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Both workspaces share one env file at the repo root. Vite exposes only
  // VITE_* values to the bundle, so the API secrets in that file stay server-side.
  envDir: '..',
  plugins: [react()],
  server: {
    port: 5181,
    host: true,
    // Same-origin in development, like nginx in production. The API port must
    // match PORT in the root .env (4006 by default).
    proxy: {
      '/api': {
        target: 'http://localhost:4006',
        changeOrigin: true,
      },
    },
  },
})
