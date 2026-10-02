import { env } from 'cloudflare:workers'
import { CONTENT_TYPES, checkPath, extensionOf, objectKey } from './limits'

/**
 * Every game response is sandboxed: the page gets an opaque origin, so it
 * can't read the store's cookies or storage even when opened directly.
 * Games may load code only from their own files and pinned npm packages on
 * jsDelivr, and can't send data anywhere else.
 */
const SANDBOX_CSP = [
  'sandbox allow-scripts allow-pointer-lock',
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net/npm/",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://cdn.jsdelivr.net/npm/",
  "worker-src 'self' blob:",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ')

const notFound = () => new Response('Not found', { status: 404 })

/** Serves one file of a game from R2. The caller has already checked who may see it. */
export async function serveGameFile(gameId: string, path: string, request: Request, cacheSeconds: number) {
  if (checkPath(path)) return notFound()
  const object = await env.GAMES.get(objectKey(gameId, path), { onlyIf: request.headers })
  if (!object) return notFound()

  const headers = new Headers({
    'content-type': CONTENT_TYPES[extensionOf(path)]!,
    'content-security-policy': SANDBOX_CSP,
    // Module scripts and fetches from the sandbox's opaque origin are CORS requests.
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': `public, max-age=${cacheSeconds}`,
    etag: object.httpEtag,
  })
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  return new Response(object.body, { headers })
}
