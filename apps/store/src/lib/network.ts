/**
 * Internet addresses for finding family games on the same network. Shared by
 * the page (which learns its public addresses from STUN) and the Worker (which
 * checks them). Pure functions, so the tests can run them under Node.
 */

/** The most public addresses a device may name besides the one it connects from. */
export const MAX_ADDRESSES = 4

/** An IPv4 address as four numbers, or null. */
function ipv4(ip: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null
  const parts = ip.split('.').map(Number)
  return parts.every((n) => n <= 255) ? parts : null
}

/** An IPv6 address as eight 16-bit groups, or null. */
function ipv6(ip: string): number[] | null {
  if (!ip.includes(':') || ip.split('::').length > 2) return null
  const [head = '', tail = ''] = ip.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const full = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left
  if (full.length !== 8 || !full.every((part) => /^[0-9a-f]{1,4}$/.test(part))) return null
  return full.map((part) => parseInt(part, 16))
}

/**
 * The part of an address shared by every device behind one home connection:
 * a whole IPv4 address (homes share one through NAT), or an IPv6 /64.
 */
export function networkPrefix(ip: string): string | null {
  const v4 = ipv4(ip)
  if (v4) return v4.join('.')
  const v6 = ipv6(ip)
  if (!v6) return null
  return v6.slice(0, 4).map((group) => group.toString(16)).join(':') + '::/64'
}

/**
 * True for an address on the public internet. Private, loopback, link-local,
 * carrier NAT, documentation and multicast ranges can't name a home network.
 */
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4(ip)
  if (v4) {
    const [a, b, c] = v4 as [number, number, number, number]
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    if (a === 198 && b === 51 && c === 100) return false
    if (a === 203 && b === 0 && c === 113) return false
    return true
  }
  const v6 = ipv6(ip)
  if (!v6) return false
  // Global unicast is 2000::/3; 2001:db8::/32 is for documentation.
  if (v6[0]! >> 13 !== 1) return false
  return !(v6[0] === 0x2001 && v6[1] === 0x0db8)
}

/** The distinct public addresses in a list, at most MAX_ADDRESSES of them. */
export function publicAddresses(ips: Iterable<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ip of ips) {
    const prefix = networkPrefix(ip)
    if (!prefix || !isPublicAddress(ip) || seen.has(prefix)) continue
    seen.add(prefix)
    out.push(ip)
    if (out.length === MAX_ADDRESSES) break
  }
  return out
}
