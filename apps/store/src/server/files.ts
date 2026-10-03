import { env } from 'cloudflare:workers'
import { CONTENT_TYPES, checkPath, extensionOf, liveKey, objectKey } from './limits'

/**
 * Every game response is sandboxed: the page gets an opaque origin, so it
 * can't read the store's cookies or storage even when opened directly.
 *
 * A game may load only its own files (under `base`) and the three.js copy
 * BitGames hosts under /vendor/. It can't load code or data from anywhere
 * else, not even another game's folder or a draft preview. That way, what a
 * reviewer plays is everything the game can ever run or show.
 */
function sandboxCsp(base: string, vendor: string) {
  return [
    'sandbox allow-scripts allow-pointer-lock',
    "default-src 'none'",
    `script-src ${base} ${vendor} 'unsafe-inline'`,
    `style-src ${base} 'unsafe-inline'`,
    `img-src ${base} data: blob:`,
    `media-src ${base} data: blob:`,
    `font-src ${base} data:`,
    `connect-src ${base} ${vendor} data: blob:`,
    `worker-src ${base} blob:`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ')
}

// CORS on 404s too, so a missing optional file shows up in the game as a plain 404, not a CORS error.
const notFound = () => new Response('Not found', { status: 404, headers: { 'access-control-allow-origin': '*' } })

/**
 * Serves one file of a game from R2. The caller has already checked who may
 * see it. `basePath` is the URL folder the game is served from, e.g. "/play/<id>/".
 */
export async function serveGameFile(gameId: string, path: string, request: Request, basePath: string, cacheSeconds: number, live = false) {
  if (checkPath(path)) return notFound()
  const { origin } = new URL(request.url)
  const object = await env.GAMES.get(live ? liveKey(gameId, path) : objectKey(gameId, path), { onlyIf: request.headers })
  if (!object) return notFound()

  const headers = new Headers({
    'content-type': CONTENT_TYPES[extensionOf(path)]!,
    'content-security-policy': sandboxCsp(origin + basePath, `${origin}/vendor/`),
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
