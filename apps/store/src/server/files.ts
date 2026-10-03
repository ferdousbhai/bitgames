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

/** Every 404 under /play and /preview: with CORS, so a game sees a plain 404 rather than a CORS error. */
export const gameNotFound = () => new Response('Not found', { status: 404, headers: { 'access-control-allow-origin': '*' } })

interface ServeOptions {
  /** The URL folder the game is served from, e.g. "/play/<id>/". */
  basePath: string
  /** Serve the reviewed live copy instead of the draft. */
  live?: boolean
  cache: string
  noindex?: boolean
}

/** Serves one file of a game from R2. The caller has already checked who may see it. */
export async function serveGameFile(gameId: string, path: string, request: Request, { basePath, live, cache, noindex }: ServeOptions) {
  if (checkPath(path)) return gameNotFound()
  const { origin } = new URL(request.url)
  const object = await env.GAMES.get(live ? liveKey(gameId, path) : objectKey(gameId, path), { onlyIf: request.headers })
  if (!object) return gameNotFound()

  const headers = new Headers({
    'content-type': CONTENT_TYPES[extensionOf(path)]!,
    'content-security-policy': sandboxCsp(origin + basePath, `${origin}/vendor/`),
    // Module scripts and fetches from the sandbox's opaque origin are CORS requests.
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': cache,
    etag: object.httpEtag,
  })
  if (noindex) headers.set('x-robots-tag', 'noindex')
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  return new Response(object.body, { headers })
}
