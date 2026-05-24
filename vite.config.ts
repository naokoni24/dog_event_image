import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3456,
    strictPort: true,
    // ローカル開発時の /api リクエストを本番Vercelに転送
    proxy: {
      '/api': {
        target: 'https://dog-event-app.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
