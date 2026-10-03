/**
 * The store's public address. Games run on their creators' own Cloudflare
 * accounts and load the shared three.js and multiplayer SDK from here by
 * absolute URL, so this must stay stable once games are published.
 */
export const PUBLIC_ORIGIN = 'https://bitgames.store'

export const VENDOR_BASE = `${PUBLIC_ORIGIN}/vendor`

/**
 * What a game may load, enforced by the browser through the game frame's `csp`
 * attribute (the game's server opts in with Allow-CSP-From): its own files,
 * and the shared libraries under /vendor/. Nothing else, so what a reviewer
 * plays is everything the game can ever run or show.
 */
export function gameCsp(gameOrigin: string, storeOrigin: string): string {
  const vendor = [...new Set([`${PUBLIC_ORIGIN}/vendor/`, `${storeOrigin}/vendor/`])].join(' ')
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
