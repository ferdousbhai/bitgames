/**
 * The store's public address. Games run on their creators' own Cloudflare
 * accounts and load the shared three.js and multiplayer SDK from here by
 * absolute URL, so this must stay stable once games are published.
 */
export const PUBLIC_ORIGIN = 'https://bitgames.store'

export const VENDOR_BASE = `${PUBLIC_ORIGIN}/vendor`

// Older reviewed games import the store's original Worker address. It serves
// the same trusted libraries; never add creator-supplied origins to this list.
const LEGACY_VENDOR_BASE = 'https://bitgames-store.ferdousbd.workers.dev/vendor/'

/**
 * What a game may load. Playback uses the exact /game-assets/<version>/ prefix
 * in gateway response headers. A separate wrapper constrains navigation. The gateway
 * verifies files; the browser blocks requests outside that prefix and trusted vendor libraries.
 */
export function gameCsp(gameOrigin: string, storeOrigin: string): string {
  const vendor = [...new Set([`${PUBLIC_ORIGIN}/vendor/`, `${storeOrigin}/vendor/`, LEGACY_VENDOR_BASE])].join(' ')
  return [
    "default-src 'none'",
    `script-src ${gameOrigin} ${vendor} 'unsafe-inline'`,
    `style-src ${gameOrigin} 'unsafe-inline'`,
    `img-src ${gameOrigin} data: blob:`,
    `media-src ${gameOrigin} data: blob:`,
    `font-src ${gameOrigin} data:`,
    `connect-src ${gameOrigin} ${vendor} data: blob:`,
    `worker-src ${gameOrigin} blob:`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/**
 * Direct-preview policy supplied by the starter on the creator's own deployment.
 * BitGames ignores upstream headers and supplies its own path-restricted CSP,
 * including for browsers that ignore the iframe csp attribute.
 */
export const GAME_CSP_HEADER = gameCsp("'self'", PUBLIC_ORIGIN)

/** Browser-safe, immutable playback path for one shipment. */
export const versionBase = (id: string) => `/game-assets/${id}/`
