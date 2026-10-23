import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    host: true,
    // Same-origin in development, like nginx in production. The API port must
    // match PORT in backend/.env (both .env.example files use 4006).
    proxy: {
      '/api': {
        target: 'http://localhost:4006',
        changeOrigin: true,
      },
    },
  },
})
