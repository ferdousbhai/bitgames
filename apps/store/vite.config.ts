import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/**
 * In production, public/_headers lets sandboxed games (opaque origin) load
 * /vendor/ modules. The dev server ignores _headers, so add the same CORS
 * header there, for /vendor/ only.
 */
function vendorCors(): Plugin {
  return {
    name: 'bitgames-vendor-cors',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/vendor/')) res.setHeader('Access-Control-Allow-Origin', '*')
        next()
      })
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    vendorCors(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
