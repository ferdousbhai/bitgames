/**
 * Messages between a game (sandboxed iframe) and the BitGames page around it.
 * The page owns the signaling connection; the game owns its WebRTC peers.
 */
import type { SignalData } from "@bitgames/webrtc";

export const BRIDGE = "bitgames-room-1";

export type GameToPage =
  | { bridge: typeof BRIDGE; type: "hello" }
  | { bridge: typeof BRIDGE; type: "open"; maxPlayers: number }
  | { bridge: typeof BRIDGE; type: "signal"; to: string; data: SignalData }
  | { bridge: typeof BRIDGE; type: "leave" };

export type PageToGame =
  | { bridge: typeof BRIDGE; type: "hello" }
  | { bridge: typeof BRIDGE; type: "ready"; selfId: string; isHost: boolean; code: string }
  | { bridge: typeof BRIDGE; type: "solo" }
  | { bridge: typeof BRIDGE; type: "peers"; peers: string[] }
  | { bridge: typeof BRIDGE; type: "left"; peer: string }
  | { bridge: typeof BRIDGE; type: "signal"; from: string; data: SignalData };

/** A bridge message as written by the sender, before the `bridge` tag is added. */
export type Unbridged<T> = T extends { type: infer K } ? Omit<T, "bridge"> & { type: K } : never;

/** Peer IDs are 8 random bytes in hex, matching BitChat's 8-byte sender IDs. */
export const PEER_ID = /^[0-9a-f]{16}$/;

export function newPeerId(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The most players a room can hold, whatever a game asks for. */
export const MAX_ROOM_PLAYERS = 8;

export function isBridgeMessage<T extends { bridge: string }>(data: unknown): data is T {
  return typeof data === "object" && data !== null && (data as { bridge?: unknown }).bridge === BRIDGE;
}
