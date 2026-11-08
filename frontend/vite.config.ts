import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { seoHeadPlugin } from './plugins/seoHead.ts'

export default defineConfig(({ mode }) => {
  // Both workspaces share one env file at the repo root. Vite exposes only
  // VITE_* values to the bundle, so the API secrets in that file stay server-side.
  const env = loadEnv(mode, '..', 'VITE_')
  // Public address of the web app, used for the canonical link and the social
  // preview image in the generated head. Left empty, those stay relative and
  // the app rewrites them to the origin the browser is on.
  const siteUrl = (env.VITE_SITE_URL ?? '').trim().replace(/\/$/, '')

  return {
    envDir: '..',
    plugins: [react(), seoHeadPlugin({ siteUrl })],
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
  }
})
