import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'

/**
 * Serves a game's files from R2. Games are untrusted code, so every response
 * carries a CSP sandbox: the page gets an opaque origin and can't read the
 * store's cookies or storage even if opened directly. Files need CORS
 * headers because module scripts and fetches from an opaque origin are CORS requests.
 *
 * TODO: before opening uploads to the public, serve games from a separate
 * domain as well.
 */
const SANDBOX_CSP = [
  'sandbox allow-scripts allow-pointer-lock',
  "default-src 'self' https://cdn.jsdelivr.net",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "frame-ancestors 'self'",
].join('; ')

const ID = /^[a-z0-9-]{1,64}$/
const PATH = /^[\w./-]{1,256}$/

export const Route = createFileRoute('/play/$gameId/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = params._splat || 'index.html'
        if (!ID.test(params.gameId) || !PATH.test(path) || path.includes('..')) {
          return new Response('Not found', { status: 404 })
        }

        const object = await env.GAMES.get(`games/${params.gameId}/${path}`, {
          onlyIf: request.headers,
        })
        if (!object) return new Response('Not found', { status: 404 })

        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        headers.set('content-security-policy', SANDBOX_CSP)
        headers.set('access-control-allow-origin', '*')
        headers.set('x-content-type-options', 'nosniff')
        headers.set('cache-control', 'public, max-age=60')
        if (!('body' in object)) return new Response(null, { status: 304, headers })
        return new Response(object.body, { headers })
      },
    },
  },
})
