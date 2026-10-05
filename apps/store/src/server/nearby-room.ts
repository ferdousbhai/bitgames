import { PEER_ID, roomSize } from '@bitgames/game-sdk/bridge'
import { DurableObject } from 'cloudflare:workers'
import { ANIMAL_COUNT, codeFor, type Hosted, isRoomCode, listingId, openListings } from './nearby'

/**
 * The family games open on one network, for one game. Every device on the
 * "Play together" screen holds a WebSocket here and hears the list live; a
 * device that starts a game says so on its socket, and its listing lasts as
 * long as that socket (or until its room is full).
 *
 * Listings never carry the room code: joining from the list goes through the
 * Worker, which looks the code up here (codeFor) and makes the host let the
 * device in, since strangers can share a public address.
 *
 * Uses the hibernation API; each hosting socket keeps its listing as an
 * attachment, so nothing is written to storage.
 *
 * Client -> list: {t:"host", peer, code, animal, max} | {t:"players", players} | {t:"unhost"} | "ping"
 * List -> client: {t:"list", games: Listing[]} on connect and whenever it changes | "pong"
 */
const MAX_SOCKETS = 64
const MAX_HOSTS = 16
const MAX_MESSAGE_BYTES = 1024

export class Nearby extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alives are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Too busy', { status: 429 })
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.send(this.listMessage())
    return new Response(null, { status: 101, webSocket: client })
  }

  /** For the Worker: the room code behind an open listing, or null. */
  async codeFor(id: string): Promise<string | null> {
    return codeFor(this.hosted(), id)
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return
    let msg: { t?: unknown; peer?: unknown; code?: unknown; animal?: unknown; max?: unknown; players?: unknown }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    const mine = this.listingOf(ws)
    if (msg.t === 'host') {
      const { peer, code, animal } = msg
      if (typeof peer !== 'string' || !PEER_ID.test(peer) || !isRoomCode(code)) return
      if (typeof animal !== 'number' || !Number.isInteger(animal) || animal < 0 || animal >= ANIMAL_COUNT) return
      const others = this.hosted(ws)
      // A device on two of its addresses can reach this list twice; it stays one listing, with one code.
      const same = others.find((h) => h.peer === peer)
      if (same && same.code !== code) return
      if (!same && new Set(others.map((h) => h.peer)).size >= MAX_HOSTS) return
      const entry: Hosted = {
        id: await listingId(peer),
        peer,
        code,
        animal,
        players: same?.players ?? 1,
        max: roomSize(Number(msg.max)),
        created: same?.created ?? Date.now(),
      }
      ws.serializeAttachment(entry)
    } else if (msg.t === 'players' && mine && typeof msg.players === 'number' && Number.isInteger(msg.players)) {
      ws.serializeAttachment({ ...mine, players: Math.max(1, msg.players) } satisfies Hosted)
    } else if (msg.t === 'unhost' && mine) {
      ws.serializeAttachment(null)
    } else {
      return
    }
    this.broadcast()
  }

  async webSocketClose(ws: WebSocket) {
    this.left(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.left(ws)
  }

  private left(ws: WebSocket) {
    // A closing socket can still be listed until this handler returns.
    if (this.listingOf(ws)) this.broadcast(ws)
  }

  private listingOf(ws: WebSocket): Hosted | null {
    return (ws.deserializeAttachment() as Hosted | null) ?? null
  }

  private hosted(except?: WebSocket): Hosted[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except)
      .map((ws) => this.listingOf(ws))
      .filter((h): h is Hosted => h !== null)
  }

  private listMessage(except?: WebSocket): string {
    return JSON.stringify({ t: 'list', games: openListings(this.hosted(except)) })
  }

  private broadcast(except?: WebSocket) {
    const text = this.listMessage(except)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue
      try {
        ws.send(text)
      } catch {
        // Already closing; its own close event tidies up.
      }
    }
  }
}
