import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { recheckLive } from './server/games-store'
import { isGameId } from './server/limits'
import { allowedByIp } from './server/rate-limit'
import { serveGameAsset } from './server/game-assets'

import { nearbyRoomName } from './server/nearby'
import { GATE_HEADER } from './server/room'

export { GameRoom } from './server/room'

/**
 * Room codes are three animals, sent as three indexes into the parent page's
 * animal list; "near" is the room for devices on the same internet connection.
 */
const ROOM_PATH = /^\/rooms\/([a-z0-9-]{1,64})\/(\d{1,2}-\d{1,2}-\d{1,2}|near)$/

/**
 * Multiplayer signaling: /rooms/<gameId>/<code>?peer=<id> upgrades to a
 * WebSocket on the GameRoom for that game and code. Only pages served by
 * this site may connect, so other sites can't use it as a free relay.
 */
async function handleRoom(request: Request, gameId: string, code: string): Promise<Response> {
  const url = new URL(request.url)
  if (request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 })
  if (!isGameId(gameId)) return new Response('Not found', { status: 404 })
  // Local development has no cf-connecting-ip; every local device is one network there.
  const ip = request.headers.get('cf-connecting-ip') ?? (url.hostname === 'localhost' ? '127.0.0.1' : '')
  if (!(await allowedByIp(env.ROOM_LIMITER, ip || 'unknown'))) {
    return new Response('Too many rooms', { status: 429 })
  }
  const name = code === 'near' ? await nearbyRoomName(gameId, ip) : `${gameId}/${code}`
  if (!name) return new Response('Network not recognised', { status: 422 })
  // Only the Worker decides whether a room is gated; a client can't set this.
  const headers = new Headers(request.headers)
  headers.set(GATE_HEADER, code === 'near' ? '1' : '0')
  const room = env.ROOMS.get(env.ROOMS.idFromName(name))
  return room.fetch(new Request(request, { headers }))
}

const entry = createServerEntry({
  fetch(request) {
    const match = ROOM_PATH.exec(new URL(request.url).pathname)
    if (match) return handleRoom(request, match[1]!, match[2]!)
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
