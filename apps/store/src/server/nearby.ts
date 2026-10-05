/**
 * Finding family games nearby: devices that reach BitGames through the same
 * home internet connection share a public IPv4 address, or an IPv6 /64, so
 * each game has one Nearby list per network. A device may reach us over IPv4
 * while its sibling uses IPv6, so every device joins the list for each of its
 * addresses: the one it connects from, plus the public ones its browser
 * learned from STUN. Only a hash of the network names a list; addresses are
 * never stored.
 */
import { isPublicAddress, networkPrefix } from '../lib/network.ts'

export { networkPrefix }

/** The Nearby list name for a game on a network, or null when the address can't be read. */
export async function nearbyKey(gameId: string, ip: string): Promise<string | null> {
  const prefix = networkPrefix(ip)
  if (!prefix) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bitgames-nearby:${gameId}:${prefix}`))
  return `${gameId}/nearby/${hex(digest)}`
}

/**
 * The address a Nearby request is about: the caller's own (trusted, from the
 * network) unless it names one of its STUN addresses, which must be public.
 * Returns null for an address that is malformed or private.
 */
export function chosenAddress(requestIp: string, claimed: string | null): string | null {
  if (claimed === null || claimed === '') return requestIp || null
  return isPublicAddress(claimed) ? claimed : null
}

/** A family game as other devices on the network see it: never its room code. */
export interface Listing {
  /** Stable across lists for the same host, so a device on two lists shows it once. */
  id: string
  /** Index of the host device's animal. */
  animal: number
  players: number
  max: number
  created: number
}

/** What a hosting device registered: its listing plus the code only the Worker reads. */
export interface Hosted extends Listing {
  peer: string
  code: string
}

/** Room codes are three animal indexes, each below this. */
export const ANIMAL_COUNT = 12
const CODE = /^(\d{1,2})-(\d{1,2})-(\d{1,2})$/

export function isRoomCode(code: unknown): code is string {
  const match = typeof code === 'string' ? CODE.exec(code) : null
  return !!match && match.slice(1).every((n) => Number(n) < ANIMAL_COUNT)
}

/** The listing id for a host: a hash of its peer ID, which itself stays private. */
export async function listingId(peer: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bitgames-listing:${peer}`)))
}

/** Open games, oldest first, once each; full rooms are left out. */
export function openListings(hosted: Iterable<Hosted>, limit = 12): Listing[] {
  const byId = new Map<string, Listing>()
  for (const { id, animal, players, max, created } of hosted) {
    if (players >= max || byId.has(id)) continue
    byId.set(id, { id, animal, players, max, created })
  }
  return [...byId.values()].sort((a, b) => a.created - b.created).slice(0, limit)
}

/** The room code behind an open listing, or null. */
export function codeFor(hosted: Iterable<Hosted>, id: string): string | null {
  for (const entry of hosted) if (entry.id === id && entry.players < entry.max) return entry.code
  return null
}

/** Merges the lists a device hears from each of its networks into one. */
export function mergeListings(lists: Iterable<Listing[]>): Listing[] {
  return openListings([...lists].flat().map((l) => ({ ...l, peer: '', code: '' })), Infinity)
}

function hex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
