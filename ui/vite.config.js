import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Strip crossorigin attributes — Brave shields block them on localhost
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
      }
    }
  ],
  build: { outDir: '../app/static' },
  server: { proxy: { '/api': 'http://localhost:3365' } }
})
