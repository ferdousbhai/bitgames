import { PEER_ID, roomSize } from '@bitgames/game-sdk/bridge'
import { DurableObject } from 'cloudflare:workers'

/**
 * One multiplayer room: introduces the devices in it to each other by
 * relaying WebRTC offers, answers and ICE candidates. Game traffic itself
 * flows peer to peer and never passes through here.
 *
 * Uses the hibernation API: each socket is tagged with its peer ID and keeps
 * whether it has been let in as an attachment, so the object can sleep
 * between messages without losing who is connected.
 *
 * Rooms found by network (GATE_HEADER set by the Worker) are gated: the first
 * device in is the host, and anyone arriving later waits until the host's
 * device lets them in, since strangers can share a public address.
 *
 * Client -> room: {t:"signal", to, data} | {t:"admit", peer} | {t:"deny", peer}
 * Room -> client: {t:"peers", peers} once in (empty for the host), or
 *                 {t:"waiting"} while the host decides ({t:"denied"} if not);
 *                 then {t:"joined", peer} | {t:"left", peer} | {t:"signal", from, data},
 *                 and for the host {t:"knock", peer} | {t:"gone", peer} about waiting devices.
 */
const MAX_MESSAGE_BYTES = 64 * 1024
/** How many devices may wait at the door at once. */
const MAX_WAITING = 3
/** Set by the Worker, never by the client: "1" when this room is found by network. */
export const GATE_HEADER = 'x-bitgames-gate'

interface Seat {
  /** Let into the room; waiting devices can't signal or be signalled. */
  in: boolean
  /** When the device was let in, which decides who answers knocks. */
  since: number
}

export class GameRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    const url = new URL(request.url)
    const peer = url.searchParams.get('peer') ?? ''
    if (!PEER_ID.test(peer)) return new Response('Invalid peer ID', { status: 400 })
    // The game says how many players it supports; never more than the platform limit.
    const max = roomSize(Number(url.searchParams.get('max')))

    const existing = this.ctx.getWebSockets()
    const inside = this.inside()
    if (inside.length >= max) return new Response('Room full', { status: 409 })
    if (this.ctx.getWebSockets(peer).length > 0) return new Response('Peer ID in use', { status: 409 })
    const gated = request.headers.get(GATE_HEADER) === '1' && inside.length > 0
    if (gated && existing.length - inside.length >= MAX_WAITING) return new Response('Too many waiting', { status: 409 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [peer])
    if (gated) {
      server.serializeAttachment({ in: false, since: 0 } satisfies Seat)
      server.send(JSON.stringify({ t: 'waiting' }))
      const host = this.host()
      if (host) this.broadcast({ t: 'knock', peer }, [host])
    } else {
      this.seat(server, peer, inside)
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES || !this.isIn(ws)) return
    let msg: { t?: unknown; to?: unknown; peer?: unknown; data?: unknown }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (msg.t === 'signal' && typeof msg.to === 'string') {
      this.broadcast({ t: 'signal', from: this.peerOf(ws), data: msg.data }, this.ctx.getWebSockets(msg.to).filter((s) => this.isIn(s)))
    } else if ((msg.t === 'admit' || msg.t === 'deny') && typeof msg.peer === 'string' && ws === this.host()) {
      const waiting = this.ctx.getWebSockets(msg.peer).find((s) => !this.isIn(s))
      if (!waiting) return
      if (msg.t === 'deny') {
        // Said as a message too: some proxies drop close codes.
        waiting.send(JSON.stringify({ t: 'denied' }))
        waiting.close(4003, 'Not this time')
      }
      else this.seat(waiting, msg.peer, this.inside())
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.leave(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws)
  }

  /** Lets a device in: it learns who is here, and they learn about it. */
  private seat(ws: WebSocket, peer: string, inside: WebSocket[]) {
    ws.serializeAttachment({ in: true, since: Date.now() } satisfies Seat)
    ws.send(JSON.stringify({ t: 'peers', peers: inside.map((s) => this.peerOf(s)) }))
    this.broadcast({ t: 'joined', peer }, inside)
  }

  private leave(ws: WebSocket) {
    const peer = this.peerOf(ws)
    if (!this.isIn(ws)) {
      const host = this.host()
      if (host) this.broadcast({ t: 'gone', peer }, [host])
      return
    }
    const wasHost = ws === this.host()
    const others = this.inside().filter((other) => other !== ws)
    this.broadcast({ t: 'left', peer }, others)
    const waiting = this.ctx.getWebSockets().filter((s) => s !== ws && !this.isIn(s))
    const next = this.host(ws)
    if (!next) {
      // Nobody left to open the door: the first one waiting has the room to themselves.
      const first = waiting.shift()
      if (first) {
        this.seat(first, this.peerOf(first), [])
        for (const other of waiting) this.broadcast({ t: 'knock', peer: this.peerOf(other) }, [first])
      }
    } else if (wasHost) {
      // The next host hears about anyone still waiting at the door.
      for (const other of waiting) this.broadcast({ t: 'knock', peer: this.peerOf(other) }, [next])
    }
  }

  private isIn(ws: WebSocket): boolean {
    // Sockets from before rooms were gated have no attachment and were always in.
    return (ws.deserializeAttachment() as Seat | null)?.in ?? true
  }

  private inside(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => this.isIn(ws))
  }

  /** The device that has been in longest answers knocks. */
  private host(except?: WebSocket): WebSocket | undefined {
    const since = (ws: WebSocket) => (ws.deserializeAttachment() as Seat | null)?.since ?? 0
    return this.inside()
      .filter((ws) => ws !== except)
      .sort((a, b) => since(a) - since(b))[0]
  }

  private peerOf(ws: WebSocket): string {
    return this.ctx.getTags(ws)[0] ?? ''
  }

  private broadcast(message: unknown, sockets: WebSocket[]) {
    const text = JSON.stringify(message)
    for (const ws of sockets) ws.send(text)
  }
}
