import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Split rarely-changing dependencies into their own chunks.
         *
         * These are needed for first render, so this doesn't reduce what a new
         * visitor downloads — it means a deploy that only touches app code
         * leaves the vendor chunks' hashes untouched, so returning users keep
         * them from cache instead of re-fetching ~120kB.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('motion') || id.includes('framer')) return 'vendor-motion'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) {
            return 'vendor-react'
          }
          return 'vendor'
        },
      },
    },
  },
})
