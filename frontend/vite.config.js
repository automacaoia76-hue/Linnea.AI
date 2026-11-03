import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Tudo que o front chamar em /api vai para o backend (FastAPI na porta 8000)
    // ws: true deixa passar também o WebSocket da conversa por voz (/api/voz)
    proxy: {
      '/api': { target: 'http://localhost:8000', ws: true },
    },
  },
})
