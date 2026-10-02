/** Size and shape limits for creator-made games. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_TEXT_FILE_BYTES = 1024 * 1024
export const MAX_GAME_BYTES = 50 * 1024 * 1024
export const MAX_FILES_PER_GAME = 200
export const MAX_GAMES_PER_CREATOR = 30
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000

/** The content type is always chosen by extension, never by the uploader. */
export const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
}

export const TEXT_EXTENSIONS = new Set(['html', 'js', 'mjs', 'css', 'json', 'txt', 'gltf'])

const GAME_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const FILE_PATH = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/){0,4}[A-Za-z0-9_-][A-Za-z0-9._-]*\.[a-z0-9]+$/

export function isGameId(id: string): boolean {
  return GAME_ID.test(id)
}

export function extensionOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase()
}

/** Returns an error message, or null when the path is acceptable. */
export function checkPath(path: string): string | null {
  if (!FILE_PATH.test(path) || path.includes('..') || path.length > 200) {
    return 'Paths look like "index.html", "models/bunny.glb" or "sounds/pop.mp3": letters, numbers, dashes and dots, up to 5 folders deep.'
  }
  if (!(extensionOf(path) in CONTENT_TYPES)) {
    return `Files of type .${extensionOf(path)} are not allowed. Allowed: ${Object.keys(CONTENT_TYPES).map((e) => '.' + e).join(' ')}`
  }
  if (path === 'manifest.json') return 'manifest.json is reserved. Use update_game_info to change the game details.'
  return null
}

export function objectKey(gameId: string, path: string): string {
  return `games/${gameId}/${path}`
}
