import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy avoids needing a `cors` dependency on the backend for local dev.
    proxy: {
      '/health': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Dates render in the local zone; pin it so date assertions don't depend on the machine.
    env: { TZ: 'UTC' },
  },
})
