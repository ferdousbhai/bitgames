import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/**
 * Production serves public/_headers with the static assets (e.g. CORS so
 * sandboxed games can load /vendor/ modules). The dev server ignores that
 * file, so apply the same rules here. Supports "/path/*" and exact paths.
 */
function staticHeaders(): Plugin {
  const rules: { prefix: string; exact: boolean; headers: [string, string][] }[] = []
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const path = line.trim()
      rules.push({ prefix: path.replace(/\*$/, ''), exact: !path.endsWith('*'), headers: [] })
    } else {
      const [name, ...value] = line.trim().split(':')
      rules.at(-1)?.headers.push([name!, value.join(':').trim()])
    }
  }
  return {
    name: 'bitgames-static-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        for (const rule of rules) {
          if (rule.exact ? path === rule.prefix : path.startsWith(rule.prefix)) for (const [k, v] of rule.headers) res.setHeader(k, v)
        }
        next()
      })
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    staticHeaders(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
