import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { recheckLive } from './server/games-store'
import { isGameId } from './server/limits'
import { allowedByIp } from './server/rate-limit'
import { serveGameAsset } from './server/game-assets'

import { chosenAddress, nearbyKey } from './server/nearby'
import { CODE_HEADER, GATE_HEADER } from './server/room'

export { GameRoom } from './server/room'
import type { Nearby } from './server/nearby-room'
export { Nearby } from './server/nearby-room'

/**
 * Room codes are three animals, sent as three indexes into the parent page's
 * animal list. A device joining from the nearby list names the listing instead.
 */
const ROOM_PATH = /^\/rooms\/([a-z0-9-]{1,64})\/(\d{1,2}-\d{1,2}-\d{1,2}|listed\/[0-9a-f]{32})$/
const NEARBY_PATH = /^\/nearby\/([a-z0-9-]{1,64})$/

/** Only pages served by this site may connect, so other sites can't use these as a free relay. */
function sameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin
}

/** The address the request came from. Local development has none; every local device is one network there. */
function requestIp(request: Request): string {
  const url = new URL(request.url)
  const local = url.hostname === 'localhost'
  // Tests on localhost can pretend to come from another network.
  if (local && url.searchParams.get('devip')) return url.searchParams.get('devip')!
  return request.headers.get('cf-connecting-ip') ?? (local ? '127.0.0.1' : '')
}

/**
 * The Nearby list a request is about: the network of the caller's own address,
 * or of one of its public addresses from STUN (?addr=). A caller can name any
 * public address, but a list only shows a host's animal, and joining from it
 * still needs the host's tap.
 */
async function nearbyFor(request: Request, gameId: string) {
  const address = chosenAddress(requestIp(request), new URL(request.url).searchParams.get('addr'))
  const name = address && (await nearbyKey(gameId, address))
  // The binding names the class by string, so its RPC methods aren't inferred.
  const lists = env.NEARBY as DurableObjectNamespace<Nearby>
  return name ? lists.get(lists.idFromName(name)) : null
}

/**
 * Multiplayer signaling: /rooms/<gameId>/<code>?peer=<id> upgrades to a
 * WebSocket on the GameRoom for that game and code, letting the device straight
 * in. /rooms/<gameId>/listed/<listing>?addr=... finds the room behind a nearby
 * listing, and the host must let the device in.
 */
async function handleRoom(request: Request, gameId: string, target: string): Promise<Response> {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
  if (!isGameId(gameId)) return new Response('Not found', { status: 404 })
  if (!(await allowedByIp(env.ROOM_LIMITER, requestIp(request) || 'unknown'))) {
    return new Response('Too many rooms', { status: 429 })
  }
  const listed = target.startsWith('listed/')
  let code = target
  if (listed) {
    const nearby = await nearbyFor(request, gameId)
    const found = nearby && (await nearby.codeFor(target.slice('listed/'.length)))
    if (!found) return new Response('That game has ended', { status: 404 })
    code = found
  }
  // Only the Worker decides whether a join is gated; a client can't set this.
  const headers = new Headers(request.headers)
  headers.set(GATE_HEADER, listed ? '1' : '0')
  headers.set(CODE_HEADER, code)
  const room = env.ROOMS.get(env.ROOMS.idFromName(`${gameId}/${code}`))
  return room.fetch(new Request(request, { headers }))
}

/** /nearby/<gameId>?addr=<public address> upgrades to a WebSocket on that network's list of family games. */
async function handleNearby(request: Request, gameId: string): Promise<Response> {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
  if (!isGameId(gameId)) return new Response('Not found', { status: 404 })
  if (!(await allowedByIp(env.NEARBY_LIMITER, requestIp(request) || 'unknown'))) {
    return new Response('Too many requests', { status: 429 })
  }
  const nearby = await nearbyFor(request, gameId)
  if (!nearby) return new Response('Network not recognised', { status: 422 })
  return nearby.fetch(request)
}

const entry = createServerEntry({
  fetch(request) {
    const { pathname } = new URL(request.url)
    const room = ROOM_PATH.exec(pathname)
    if (room) return handleRoom(request, room[1]!, room[2]!)
    const nearby = NEARBY_PATH.exec(pathname)
    if (nearby) return handleNearby(request, nearby[1]!)
    return handler.fetch(request)
  },
})

export default {
  ...entry,
  fetch(request: Request, _env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith('/game-assets/')) return serveGameAsset(request, ctx)
    return entry.fetch(request)
  },
  /** Every few minutes: re-check one published game's files (see recheckLive). */
  scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(recheckLive())
  },
}
