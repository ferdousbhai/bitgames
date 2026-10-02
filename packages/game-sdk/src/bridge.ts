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
  | { bridge: typeof BRIDGE; type: "joined"; peer: string }
  | { bridge: typeof BRIDGE; type: "left"; peer: string }
  | { bridge: typeof BRIDGE; type: "signal"; from: string; data: SignalData }
  | { bridge: typeof BRIDGE; type: "closed"; reason: string };

export function isBridgeMessage<T extends { bridge: string }>(data: unknown): data is T {
  return typeof data === "object" && data !== null && (data as { bridge?: unknown }).bridge === BRIDGE;
}
