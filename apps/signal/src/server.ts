/**
 * Minimal WebRTC signaling relay. Peers join a room by code; the server
 * forwards offers, answers and ICE candidates between them and never sees
 * game traffic, which flows peer to peer over data channels.
 *
 * Client -> server: {t:"join", room, peer} | {t:"signal", to, data}
 * Server -> client: {t:"peers", peers} | {t:"joined", peer} | {t:"left", peer}
 *                   | {t:"signal", from, data} | {t:"error", message}
 */
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8788);
const MAX_ROOM_SIZE = 16;
const MAX_MESSAGE_BYTES = 64 * 1024;
const PEER_ID = /^[0-9a-f]{16}$/;
const ROOM = /^[\w-]{1,64}$/;

interface Client {
  socket: WebSocket;
  room: string;
  peer: string;
}

const rooms = new Map<string, Map<string, Client>>();

function send(socket: WebSocket, message: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function leave(client: Client) {
  const room = rooms.get(client.room);
  if (!room || room.get(client.peer) !== client) return;
  room.delete(client.peer);
  if (room.size === 0) rooms.delete(client.room);
  for (const other of room.values()) send(other.socket, { t: "left", peer: client.peer });
}

const server = new WebSocketServer({ port: PORT, maxPayload: MAX_MESSAGE_BYTES });

server.on("connection", (socket) => {
  let client: Client | null = null;

  socket.on("message", (raw) => {
    let msg: { t?: unknown; room?: unknown; peer?: unknown; to?: unknown; data?: unknown };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(socket, { t: "error", message: "invalid JSON" });
    }

    if (msg.t === "join") {
      if (client) return send(socket, { t: "error", message: "already joined" });
      if (typeof msg.room !== "string" || !ROOM.test(msg.room)) return send(socket, { t: "error", message: "invalid room" });
      if (typeof msg.peer !== "string" || !PEER_ID.test(msg.peer)) return send(socket, { t: "error", message: "invalid peer" });
      const room = rooms.get(msg.room) ?? new Map<string, Client>();
      if (room.has(msg.peer)) return send(socket, { t: "error", message: "peer ID in use" });
      if (room.size >= MAX_ROOM_SIZE) return send(socket, { t: "error", message: "room full" });

      send(socket, { t: "peers", peers: [...room.keys()] });
      for (const other of room.values()) send(other.socket, { t: "joined", peer: msg.peer });
      client = { socket, room: msg.room, peer: msg.peer };
      room.set(msg.peer, client);
      rooms.set(msg.room, room);
      return;
    }

    if (msg.t === "signal" && client && typeof msg.to === "string") {
      const target = rooms.get(client.room)?.get(msg.to);
      if (target) send(target.socket, { t: "signal", from: client.peer, data: msg.data });
    }
  });

  socket.on("close", () => {
    if (client) leave(client);
  });
});

console.log(`signaling server listening on ws://0.0.0.0:${PORT}`);
