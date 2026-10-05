/**
 * "Play together" without a code: devices that reach BitGames through the same
 * home internet connection share a public IPv4 address, or an IPv6 /64 prefix,
 * so they meet in one room per game and network. Only a hash of the address
 * names the room; the address itself is never stored.
 */
export function networkPrefix(ip: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip
  if (!ip.includes(':')) return null
  const [head = '', tail = ''] = ip.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left
  if (full.length !== 8 || !full.every((part) => /^[0-9a-f]{1,4}$/.test(part))) return null
  return full.slice(0, 4).map((part) => part.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}

/** The room name for a game on a network, or null when the address can't be read. */
export async function nearbyRoomName(gameId: string, ip: string): Promise<string | null> {
  const prefix = networkPrefix(ip)
  if (!prefix) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bitgames-nearby:${gameId}:${prefix}`))
  const hex = [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${gameId}/near/${hex}`
}
