import { MAX_ROOM_PLAYERS, PEER_ID } from '@bitgames/game-sdk/bridge'
import { DurableObject } from 'cloudflare:workers'

/**
 * One multiplayer room: introduces the devices in it to each other by
 * relaying WebRTC offers, answers and ICE candidates. Game traffic itself
 * flows peer to peer and never passes through here.
 *
 * Uses the hibernation API: each socket is tagged with its peer ID, so the
 * object can sleep between messages without losing who is connected.
 *
 * Client -> room: {t:"signal", to, data}
 * Room -> client: {t:"peers", peers} on connect, then {t:"joined", peer} |
 *                 {t:"left", peer} | {t:"signal", from, data}
 */
const MAX_MESSAGE_BYTES = 64 * 1024

export class GameRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    const url = new URL(request.url)
    const peer = url.searchParams.get('peer') ?? ''
    if (!PEER_ID.test(peer)) return new Response('Invalid peer ID', { status: 400 })
    // The game says how many players it supports; never more than the platform limit.
    const max = Math.min(MAX_ROOM_PLAYERS, Math.max(2, Number(url.searchParams.get('max')) || MAX_ROOM_PLAYERS))

    const existing = this.ctx.getWebSockets()
    if (existing.length >= max) return new Response('Room full', { status: 409 })
    if (this.ctx.getWebSockets(peer).length > 0) return new Response('Peer ID in use', { status: 409 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [peer])
    const others = existing.map((ws) => this.ctx.getTags(ws)[0]).filter((id): id is string => !!id)
    server.send(JSON.stringify({ t: 'peers', peers: others }))
    this.broadcast({ t: 'joined', peer }, existing)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return
    let msg: { t?: unknown; to?: unknown; data?: unknown }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (msg.t !== 'signal' || typeof msg.to !== 'string') return
    this.broadcast({ t: 'signal', from: this.ctx.getTags(ws)[0], data: msg.data }, this.ctx.getWebSockets(msg.to))
  }

  async webSocketClose(ws: WebSocket) {
    this.leave(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws)
  }

  private leave(ws: WebSocket) {
    this.broadcast({ t: 'left', peer: this.ctx.getTags(ws)[0] }, this.ctx.getWebSockets().filter((other) => other !== ws))
  }

  private broadcast(message: unknown, sockets: WebSocket[]) {
    const text = JSON.stringify(message)
    for (const ws of sockets) ws.send(text)
  }
}
