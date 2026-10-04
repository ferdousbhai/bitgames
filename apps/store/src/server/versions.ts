import { createHash } from 'node:crypto'
import { CreatorError, UnreachableError } from './errors.ts'
import { MAX_FILES_PER_GAME, MAX_GAME_BYTES, MAX_MANIFEST_BYTES, MAX_FILE_BYTES, isFilePath, mb, parseVersionUrl } from './limits.ts'
import { MANIFEST_FILE } from './starter.ts'

const FETCH_TIMEOUT_MS = 20_000
const COVER_FILES = ['cover.webp', 'cover.jpg', 'cover.png']

/** Redirects are checked before following them; credentials are never forwarded. */
export async function download(base: string, path: string, limit: number, capture = false) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    let url = base + path
    let response!: Response
    for (let redirects = 0; ; redirects++) {
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, cf: { cacheTtl: 0 } })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || redirects >= 3) throw new CreatorError(`${path} has too many redirects.`)
      const next = new URL(location, url)
      if (next.origin !== new URL(base).origin || next.username || next.password) throw new CreatorError(`${path} redirects to another site.`)
      url = next.href
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel()
      throw new UnreachableError(`${path} answered ${response.status}. A new deployment may need a minute to become available.`)
    }
    const length = Number(response.headers.get('content-length'))
    if (length > limit) {
      await response.body.cancel()
      throw new CreatorError(`${path} exceeds its ${mb(limit)} download limit.`)
    }
    reader = response.body.getReader()
    const hash = createHash('sha256')
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) throw new CreatorError(`${path} exceeds its ${mb(limit)} download limit.`)
      hash.update(chunk.value)
      if (capture) chunks.push(chunk.value)
    }
    let body: Uint8Array<ArrayBuffer> | undefined
    if (capture) {
      body = new Uint8Array(bytes)
      let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    }
    return { bytes, hash: hash.digest('hex'), body, headers: response.headers }
  } catch (error) {
    if (error instanceof CreatorError) throw error
    throw new UnreachableError(`Could not download ${path} within ${FETCH_TIMEOUT_MS / 1000} seconds. Try again after checking the deployment.`)
  } finally {
    controller.abort()
    await reader?.cancel().catch(() => {})
    clearTimeout(timer)
  }
}

export interface CheckedVersion {
  url: string
  manifest: string
  manifestJson: string
  paths: Record<string, string>
  cover: string | null
  files: number
  bytes: number
}

/** Checks all declared bytes. Playback separately enforces this exact file list. */
export async function checkVersion(url: string): Promise<CheckedVersion> {
  const version = parseVersionUrl(url)
  if (!version) throw new CreatorError('Use the Cloudflare version URL: https://<8 hex characters>-<worker>.<account>.workers.dev/. Enable previewUrls in the starter config.')
  const manifest = await download(version.base, MANIFEST_FILE, MAX_MANIFEST_BYTES, true)
  const manifestJson = new TextDecoder().decode(manifest.body)
  let paths: Record<string, string>
  try {
    const parsed: unknown = JSON.parse(manifestJson)
    if (!parsed || typeof parsed !== 'object' || !('files' in parsed)) throw new Error()
    const files = parsed.files
    if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error()
    paths = Object.fromEntries(Object.entries(files).map(([path, hash]) => {
      if (!isFilePath(path) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new Error()
      return [path, hash]
    }))
  } catch {
    throw new CreatorError(`${MANIFEST_FILE} must contain valid file paths and SHA-256 hashes. Run node bitgames.mjs and deploy again.`)
  }
  if (!Object.hasOwn(paths, 'index.html')) throw new CreatorError('Include public/index.html in the manifest.')
  if (Object.keys(paths).length > MAX_FILES_PER_GAME) throw new CreatorError(`A game can have at most ${MAX_FILES_PER_GAME} files.`)
  let bytes = 0
  // Sequential streaming bounds memory and avoids continuing a failed pool of downloads.
  for (const [path, hash] of Object.entries(paths)) {
    const file = await download(version.base, path, Math.min(MAX_FILE_BYTES, MAX_GAME_BYTES - bytes))
    if (file.hash !== hash) throw new CreatorError(`${path} does not match ${MANIFEST_FILE}. Regenerate the manifest and deploy again.`)
    bytes += file.bytes
  }
  return { url: version.base, manifest: manifest.hash, manifestJson, paths, cover: COVER_FILES.find(path => Object.hasOwn(paths, path)) ?? null, files: Object.keys(paths).length, bytes }
}
