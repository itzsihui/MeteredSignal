import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const landingDir = path.resolve(rootDir, '../../landing')
const landingIndex = path.join(landingDir, 'index.html')
const landingAssets = path.join(landingDir, 'assets')

function sendFile(res: Connect.ServerResponse, filePath: string, type: string) {
  res.statusCode = 200
  res.setHeader('Content-Type', type)
  fs.createReadStream(filePath).pipe(res)
}

/** Marketing landing at / + /landing; React demo at /demo. */
function landingPagePlugin(): Plugin {
  return {
    name: 'meteredsignal-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''

        if (url.startsWith('/landing/assets/')) {
          const rel = url.slice('/landing/assets/'.length)
          const file = path.normalize(path.join(landingAssets, rel))
          if (!file.startsWith(landingAssets) || !fs.existsSync(file)) return next()
          const ext = path.extname(file).toLowerCase()
          const type =
            ext === '.mp4' ? 'video/mp4' :
            ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
            ext === '.png' ? 'image/png' :
            'application/octet-stream'
          return sendFile(res, file, type)
        }

        if (url === '/' || url === '/landing' || url === '/landing/') {
          if (!fs.existsSync(landingIndex)) return next()
          return sendFile(res, landingIndex, 'text/html; charset=utf-8')
        }

        // Document requests for the demo SPA
        if (url === '/demo' || url === '/demo/') {
          req.url = '/index.html'
          return next()
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), landingPagePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
