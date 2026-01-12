import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:3002',
      '/mcp': {
        target: 'http://127.0.0.1:3002',
        ws: true,
      },
    },
  },
})
