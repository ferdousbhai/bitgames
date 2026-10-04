/** Limits for creator-made games, which run on their creators' own Cloudflare accounts. */
export const MAX_GAMES_PER_CREATOR = 30
/** Each file is fetched and hashed when a version is checked, within one Worker request's subrequest budget. */
export const MAX_FILES_PER_GAME = 40
export const MAX_GAME_BYTES = 50 * 1024 * 1024
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 64 * 1024

const GAME_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const FILE_PATH = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/){0,4}[A-Za-z0-9_-][A-Za-z0-9._-]*\.[a-z0-9]+$/

/**
 * A Worker version preview URL: <first 8 hex of the version id>-<worker>.<account>.workers.dev.
 * Aliased preview URLs can look the same and be redeployed. URL shape alone
 * does not prove static hosting: the gateway verifies recorded file hashes,
 * and recheckLive revalidates every listed deployment.
 */
const VERSION_HOST = /^([0-9a-f]{8})-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.workers\.dev$/

export const mb = (bytes: number) => `${+(bytes / 1024 / 1024).toFixed(1)} MB`

export function isGameId(id: string): boolean {
  return GAME_ID.test(id)
}

/** Preview tokens are 16 random bytes in hex. */
export function isPreviewToken(token: string): boolean {
  return /^[a-f0-9]{32}$/.test(token)
}

export function isFilePath(path: string): boolean {
  return FILE_PATH.test(path) && !path.includes('..') && path.length <= 200
}

/** The normalised version URL ("https://<host>/"), or null if `url` isn't a Worker version preview URL. */
export function parseVersionUrl(url: string): { base: string; immutable: boolean } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return null
  const match = VERSION_HOST.exec(parsed.hostname)
  if (!match) return null
  // Aliases must start with a letter, so a version prefix starting with a digit can only be a real version.
  return { base: `https://${parsed.hostname}/`, immutable: /^[0-9]/.test(match[1]!) }
}
