/**
 * BitGames multiplayer for games. Served to games as /vendor/bitgames/multiplayer-1.js.
 *
 *   import { joinRoom } from '/vendor/bitgames/multiplayer-1.js'
 *   const room = await joinRoom({ maxPlayers: 4 })
 *   room.on('message', (msg, from) => { ... })
 *   room.send({ x: 1 })                  // everyone, reliable
 *   room.send({ x: 1 }, { fast: true })  // everyone, may drop (positions)
 *
 * The page around the game shows the "play together" lobby and relays
 * connection setup; game data then flows directly between devices over
 * WebRTC, wrapped in BitChat packets.
 */
import { WebRTCTransport, type Signaling, type SignalData, type SignalingEvents } from "@bitgames/webrtc";
import { BRIDGE, isBridgeMessage, type GameToPage, type PageToGame } from "./bridge.js";

/** BitChat packet type for game messages (outside BitChat's own range). */
const GAME_MESSAGE = 0x70;
const HELLO_TIMEOUT_MS = 1500;

type Distribute<T> = T extends { type: infer K } ? Omit<T, "bridge"> & { type: K } : never;

function post(message: Distribute<GameToPage>) {
  window.parent.postMessage({ bridge: BRIDGE, ...message }, "*");
}

/** Messages from the page, but only from our own parent window. */
function onPage(handler: (message: PageToGame) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent || !isBridgeMessage<PageToGame>(event.data)) return;
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

class BridgeSignaling implements Signaling {
  private handlers: Partial<SignalingEvents> = {};
  private stop: () => void;

  constructor(readonly selfID: string) {
    this.stop = onPage((m) => {
      if (m.type === "peers") this.handlers.peers?.(m.peers);
      else if (m.type === "joined") this.handlers.joined?.(m.peer);
      else if (m.type === "left") this.handlers.left?.(m.peer);
      else if (m.type === "signal") this.handlers.signal?.(m.from, m.data);
      else if (m.type === "closed") this.handlers.error?.(m.reason);
    });
  }

  on<K extends keyof SignalingEvents>(event: K, handler: SignalingEvents[K]): void {
    this.handlers[event] = handler;
  }

  send(to: string, data: SignalData): void {
    post({ type: "signal", to, data });
  }

  close(): void {
    this.stop();
    post({ type: "leave" });
  }
}

type RoomEvents = {
  join: (peer: string) => void;
  leave: (peer: string) => void;
  message: (message: unknown, from: string) => void;
};

export interface SendOptions {
  /** Send to one player only. */
  to?: string;
  /** Unordered and may be dropped. Use for frequent updates like positions. */
  fast?: boolean;
}

export class Room {
  private listeners: { [K in keyof RoomEvents]: Set<RoomEvents[K]> } = { join: new Set(), leave: new Set(), message: new Set() };
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(
    /** This device's player ID. */
    readonly selfId: string,
    /** True for the device that started the room; a good place to run shared game logic. */
    readonly isHost: boolean,
    /** The room code shown to players, e.g. "🐶🐸🦊". Empty when playing alone. */
    readonly code: string,
    private readonly transport: WebRTCTransport | null,
  ) {
    transport?.on("peerConnected", (peer) => this.listeners.join.forEach((fn) => fn(peer)));
    transport?.on("peerDisconnected", (peer) => this.listeners.leave.forEach((fn) => fn(peer)));
    transport?.on("packet", (packet, from) => {
      if (packet.type !== GAME_MESSAGE) return;
      let message: unknown;
      try {
        message = JSON.parse(this.decoder.decode(packet.payload));
      } catch {
        return;
      }
      this.listeners.message.forEach((fn) => fn(message, from));
    });
  }

  /** True when there is nobody else to play with. */
  get solo(): boolean {
    return this.transport === null;
  }

  /** IDs of the other players currently connected. */
  get peers(): string[] {
    return this.transport?.connectedPeers ?? [];
  }

  on<K extends keyof RoomEvents>(event: K, listener: RoomEvents[K]): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  /** Sends any JSON-serialisable value to every other player, or to `options.to`. */
  send(message: unknown, options: SendOptions = {}): void {
    if (!this.transport) return;
    const payload = this.encoder.encode(JSON.stringify(message));
    const packet = this.transport.makePacket(GAME_MESSAGE, payload, options.to);
    this.transport.send(packet, { to: options.to, channel: options.fast ? "fast" : "reliable" });
  }

  leave(): void {
    this.transport?.close();
  }
}

/** Resolves once the page answers our hello, or false when there is no BitGames page around us. */
function pageAvailable(): Promise<boolean> {
  if (window.parent === window) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, HELLO_TIMEOUT_MS);
    const stop = onPage((m) => {
      if (m.type !== "hello") return;
      clearTimeout(timer);
      stop();
      resolve(true);
    });
    post({ type: "hello" });
  });
}

/**
 * Asks the page to show the "play together" lobby. Resolves when the player
 * has started or joined a room, or chosen to play alone (then `room.solo` is true).
 */
export async function joinRoom(options: { maxPlayers?: number } = {}): Promise<Room> {
  if (!(await pageAvailable())) {
    console.warn("[bitgames] Multiplayer only works when the game is opened from BitGames; playing alone.");
    return new Room("solo", true, "", null);
  }
  return new Promise((resolve) => {
    const stop = onPage((m) => {
      if (m.type === "solo") {
        stop();
        resolve(new Room("solo", true, "", null));
      } else if (m.type === "ready") {
        stop();
        // Created before the page forwards the peer list, so no event is missed.
        const transport = new WebRTCTransport(new BridgeSignaling(m.selfId));
        resolve(new Room(m.selfId, m.isHost, m.code, transport));
      }
    });
    post({ type: "open", maxPlayers: Math.min(8, Math.max(2, options.maxPlayers ?? 4)) });
  });
}
