import { env } from 'cloudflare:workers'
import { gameCsp, versionBase } from '../lib/site'
import { isFilePath, MAX_FILE_BYTES } from './limits'
import { CreatorError } from './errors'
import { download } from './versions'

export { versionBase } from '../lib/site'

export interface StoredVersion {
  id: string
  game_id: string
  upstream_url: string
  manifest_hash: string
  manifest_json: string
  info_json: string
  cover: string | null
  file_count: number
  bytes: number
  created_at: number
  decision: string
  review_note: string | null
}

export async function findVersion(id: string, gameId?: string) {
  const version = await env.DB.prepare('SELECT * FROM game_versions WHERE id = ?').bind(id).first<StoredVersion>()
  if (!version || (gameId && version.game_id !== gameId)) throw new CreatorError('That version does not belong to this game.')
  return version
}

export async function readVersionFile(version: StoredVersion, path: string) {
  const files = (JSON.parse(version.manifest_json) as { files: Record<string, string> }).files
  if (!isFilePath(path) || !Object.hasOwn(files, path)) throw new CreatorError('This file is not part of the shipped version.')
  const file = await download(version.upstream_url, path, Math.min(version.bytes, MAX_FILE_BYTES), true)
  if (file.hash !== files[path]) throw new CreatorError('The deployed file changed. BitGames will not serve content that differs from the shipped version.')
  return file.body!
}

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
  gif: 'image/gif', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', wasm: 'application/wasm',
}

/** Only declared, hash-verified bytes ever reach the browser. No upstream headers or cookies pass through. */
export async function serveGameAsset(request: Request, ctx?: Pick<ExecutionContext, 'waitUntil'>) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  const url = new URL(request.url)
  const match = /^\/game-assets\/([0-9a-f-]{36})\/(.*)$/.exec(url.pathname)
  if (!match) return new Response('Not found', { status: 404 })
  const path = match[2] || 'index.html'
  if (!isFilePath(path)) return new Response('Not found', { status: 404 })
  try {
    // Check existence before the cache so deleting a game also removes playback.
    const version = await findVersion(match[1]!)
    const files = (JSON.parse(version.manifest_json) as { files: Record<string, string> }).files
    if (!Object.hasOwn(files, path)) return new Response('Not found', { status: 404 })
    const cacheKey = new Request(`${url.origin}${versionBase(version.id)}${path}`)
    const cache = typeof caches === 'undefined' ? undefined : await caches.open('bitgames-verified-assets')
    let response = await cache?.match(cacheKey)
    if (!response) {
      const body = await readVersionFile(version, path)
      response = new Response(body, { headers: {
        'content-type': MIME[path.split('.').at(-1)!] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
        'etag': `"${files[path]}"`,
      } })
      if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, response.clone()))
    }
    // Policy comes from current server code even when the verified bytes are cached.
    const headers = new Headers(response.headers)
    headers.set('content-security-policy', `${gameCsp(url.origin + versionBase(version.id), url.origin)}; sandbox allow-scripts allow-pointer-lock`)
    headers.set('allow-csp-from', '*')
    headers.set('access-control-allow-origin', '*')
    headers.set('x-content-type-options', 'nosniff')
    headers.set('referrer-policy', 'no-referrer')
    if (request.method === 'HEAD') await response.body?.cancel()
    return new Response(request.method === 'HEAD' ? null : response.body, { headers })
  } catch (error) {
    if (error instanceof CreatorError) return new Response('This game file is unavailable or no longer matches its shipped version.', { status: 502, headers: { 'cache-control': 'no-store' } })
    throw error
  }
}
