import { MessageType, randomBytes, toHex, type Packet } from "@bitgames/protocol";
import { WebRTCTransport, WebSocketSignaling, type Channel } from "@bitgames/webrtc";

// Lab-only packet types, outside BitChat's range.
const BULK = 0x60;
const BULK_DONE = 0x61;

const BULK_TOTAL_BYTES = 5 * 1024 * 1024;
const BULK_PACKET_BYTES = 15_000;
const WINDOW = 400;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roomInput = $<HTMLInputElement>("room");
const signalInput = $<HTMLInputElement>("signal");
const joinButton = $<HTMLButtonElement>("join");
const resetButton = $<HTMLButtonElement>("reset");
const bulkButton = $<HTMLButtonElement>("bulk");
const rateInput = $<HTMLInputElement>("rate");
const statusEl = $("status");
const peersEl = $("peers");
const logEl = $("log");

const params = new URLSearchParams(location.search);
roomInput.value = params.get("room") ?? "lab";
signalInput.value = params.get("signal") ?? `ws://${location.hostname}:8788`;

function log(line: string) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `${time}  ${line}\n${logEl.textContent ?? ""}`;
}

interface ChannelStats {
  sent: number;
  received: number;
  rtts: number[];
}

interface PeerStats {
  reliable: ChannelStats;
  fast: ChannelStats;
  path?: string;
  iceRtt?: number;
  throughput?: string;
  bulkReceived: number;
}

const stats = new Map<string, PeerStats>();
const pending = new Map<string, number>(); // `${peer}:${channel}:${seq}` -> send time
let seq = 0;
let transport: WebRTCTransport | null = null;
let pingTimer: number | undefined;
let bulkStart = 0;

function freshStats(): PeerStats {
  const ch = (): ChannelStats => ({ sent: 0, received: 0, rtts: [] });
  return { reliable: ch(), fast: ch(), bulkReceived: 0 };
}

function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function jitter(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  let sum = 0;
  for (let i = 1; i < values.length; i++) sum += Math.abs(values[i]! - values[i - 1]!);
  return sum / (values.length - 1);
}

function ms(v: number | undefined): string {
  return v === undefined ? "–" : `${v.toFixed(1)} ms`;
}

function latencyClass(v: number | undefined): string {
  if (v === undefined) return "";
  return v < 30 ? "good" : v < 80 ? "warn" : "bad";
}

function render() {
  if (stats.size === 0) {
    peersEl.innerHTML = `<tr><td colspan="10" style="text-align:left;color:var(--muted)">No peers yet. Open this page on another device with room "${roomInput.value}".</td></tr>`;
    return;
  }
  peersEl.innerHTML = "";
  for (const [peer, s] of stats) {
    const r50 = percentile(s.reliable.rtts, 50);
    const r95 = percentile(s.reliable.rtts, 95);
    const f50 = percentile(s.fast.rtts, 50);
    const f95 = percentile(s.fast.rtts, 95);
    // Pings still in flight are not counted as lost.
    const inFlight = [...pending.keys()].filter((k) => k.startsWith(`${peer}:fast:`)).length;
    const settled = s.fast.sent - inFlight;
    const loss = settled > 0 ? (1 - s.fast.received / settled) * 100 : undefined;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${peer.slice(0, 8)}</td>
      <td>${s.path ?? "–"}</td>
      <td>${ms(s.iceRtt)}</td>
      <td class="${latencyClass(r50)}">${ms(r50)}</td>
      <td class="${latencyClass(r95)}">${ms(r95)}</td>
      <td class="${latencyClass(f50)}">${ms(f50)}</td>
      <td class="${latencyClass(f95)}">${ms(f95)}</td>
      <td>${loss === undefined ? "–" : `${Math.max(0, loss).toFixed(1)}%`}</td>
      <td>${ms(jitter(s.fast.rtts.slice(-WINDOW)))}</td>
      <td>${s.throughput ?? "–"}</td>`;
    peersEl.appendChild(row);
  }
}

function sendPings() {
  if (!transport) return;
  for (const peer of transport.connectedPeers) {
    const s = stats.get(peer);
    if (!s) continue;
    for (const channel of ["reliable", "fast"] as const) {
      const n = seq++;
      const payload = new Uint8Array(4);
      new DataView(payload.buffer).setUint32(0, n);
      pending.set(`${peer}:${channel}:${n}`, performance.now());
      s[channel].sent++;
      transport.send(transport.makePacket(MessageType.ping, payload, peer), { to: peer, channel });
    }
  }
  // Pings unanswered after 2 s count as lost.
  const cutoff = performance.now() - 2000;
  for (const [key, sentAt] of pending) if (sentAt < cutoff) pending.delete(key);
}

function restartPings() {
  clearInterval(pingTimer);
  const hz = Math.min(120, Math.max(1, Number(rateInput.value) || 20));
  pingTimer = window.setInterval(sendPings, 1000 / hz);
}

function onPacket(packet: Packet, from: string, channel: Channel) {
  const t = transport!;
  const s = stats.get(from);
  if (!s) return;
  switch (packet.type) {
    case MessageType.ping:
      t.send(t.makePacket(MessageType.pong, packet.payload, from), { to: from, channel });
      break;
    case MessageType.pong: {
      const n = new DataView(packet.payload.buffer, packet.payload.byteOffset).getUint32(0);
      const key = `${from}:${channel}:${n}`;
      const sentAt = pending.get(key);
      if (sentAt === undefined) return;
      pending.delete(key);
      const cs = s[channel];
      cs.received++;
      cs.rtts.push(performance.now() - sentAt);
      if (cs.rtts.length > WINDOW) cs.rtts.shift();
      break;
    }
    case BULK:
      s.bulkReceived += packet.payload.length;
      if (s.bulkReceived >= BULK_TOTAL_BYTES) {
        s.bulkReceived = 0;
        t.send(t.makePacket(BULK_DONE, new Uint8Array(0), from), { to: from });
      }
      break;
    case BULK_DONE: {
      const seconds = (performance.now() - bulkStart) / 1000;
      const mbps = (BULK_TOTAL_BYTES * 8) / seconds / 1e6;
      s.throughput = `${mbps.toFixed(1)} Mbit/s`;
      log(`throughput to ${from.slice(0, 8)}: ${mbps.toFixed(1)} Mbit/s (${seconds.toFixed(2)} s for 5 MB)`);
      bulkButton.disabled = false;
      break;
    }
  }
}

async function runBulk() {
  const t = transport;
  const peer = t?.connectedPeers[0];
  if (!t || !peer) return;
  bulkButton.disabled = true;
  log(`sending 5 MB to ${peer.slice(0, 8)} on the reliable channel…`);
  bulkStart = performance.now();
  // Random bytes so compression can't flatter the result.
  const chunk = randomBytes(BULK_PACKET_BYTES);
  for (let sent = 0; sent < BULK_TOTAL_BYTES; sent += BULK_PACKET_BYTES) {
    const size = Math.min(BULK_PACKET_BYTES, BULK_TOTAL_BYTES - sent);
    t.send(t.makePacket(BULK, chunk.subarray(0, size), peer), { to: peer });
    await t.drained(peer);
  }
}

async function refreshPaths() {
  if (!transport) return;
  for (const [peer, s] of stats) {
    const info = await transport.connectionInfo(peer);
    if (!info) continue;
    if (info.local) s.path = info.local === info.remote ? info.local : `${info.local} → ${info.remote}`;
    if (info.rttMs !== undefined) s.iceRtt = info.rttMs;
  }
}

async function join() {
  joinButton.disabled = true;
  const selfID = toHex(randomBytes(8));
  const signaling = new WebSocketSignaling(signalInput.value, roomInput.value, selfID);
  signaling.on("error", (message) => {
    statusEl.textContent = `Signaling: ${message}`;
    log(`signaling error: ${message}`);
  });
  transport = new WebRTCTransport(signaling);
  transport.on("peerConnected", (peer) => {
    stats.set(peer, freshStats());
    log(`connected to ${peer.slice(0, 8)}`);
    bulkButton.disabled = false;
    render();
  });
  transport.on("peerDisconnected", (peer) => {
    stats.delete(peer);
    log(`disconnected from ${peer.slice(0, 8)}`);
    bulkButton.disabled = stats.size === 0;
    render();
  });
  transport.on("packet", onPacket);

  try {
    await signaling.connect();
  } catch (e) {
    statusEl.textContent = (e as Error).message;
    joinButton.disabled = false;
    return;
  }
  statusEl.textContent = `Joined room "${roomInput.value}" as ${selfID.slice(0, 8)}`;
  history.replaceState(null, "", `?room=${encodeURIComponent(roomInput.value)}`);
  resetButton.disabled = false;
  restartPings();
  setInterval(render, 500);
  setInterval(() => void refreshPaths(), 2000);
  render();
}

joinButton.onclick = () => void join();
bulkButton.onclick = () => void runBulk();
rateInput.onchange = () => transport && restartPings();
resetButton.onclick = () => {
  for (const peer of stats.keys()) stats.set(peer, freshStats());
  pending.clear();
  render();
};
