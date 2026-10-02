/**
 * Full-mesh WebRTC transport carrying BitChat-format packets.
 *
 * Each remote peer gets one RTCPeerConnection with two pre-negotiated data channels:
 *   reliable: ordered and retransmitted, for game events, chat and state that must arrive
 *   fast:     unordered with no retransmits, for high-rate state such as positions
 *
 * Frames larger than MAX_MESSAGE_SIZE are split with the BitChat fragment format.
 * Every peer connects directly to every other, so there is no relaying and TTL is ignored.
 */
import {
  FragmentAssembler,
  MessageType,
  type Packet,
  bytesEqual,
  decodePacket,
  encodePacket,
  fragmentPacket,
  fromHex,
} from "@bitgames/protocol";
import type { SignalData, Signaling } from "./signaling.js";

export type Channel = "reliable" | "fast";

/** Stays under the 16 KiB message size every browser accepts. */
const MAX_MESSAGE_SIZE = 16_000;
/** BitChat caps a fragment payload at 1280 bytes, including its 13-byte header. */
const FRAGMENT_CHUNK_SIZE = 1_200;
const RELIABLE_ID = 0;
const FAST_ID = 1;
const DRAIN_THRESHOLD = 1024 * 1024;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

interface PeerLink {
  id: string;
  pc: RTCPeerConnection;
  reliable: RTCDataChannel;
  fast: RTCDataChannel;
  assembler: FragmentAssembler;
  pendingCandidates: RTCIceCandidateInit[];
  connected: boolean;
}

export interface TransportEvents {
  peerConnected(peer: string): void;
  peerDisconnected(peer: string): void;
  packet(packet: Packet, from: string, channel: Channel): void;
}

export class WebRTCTransport {
  private links = new Map<string, PeerLink>();
  private handlers: Partial<TransportEvents> = {};
  readonly selfID: string;
  private readonly selfBytes: Uint8Array;

  constructor(
    private readonly signaling: Signaling,
    private readonly iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS,
  ) {
    this.selfID = signaling.selfID;
    this.selfBytes = fromHex(this.selfID);
    // The newcomer initiates to everyone already in the room, which avoids offer glare.
    signaling.on("peers", (peers) => peers.forEach((p) => void this.initiate(p)));
    signaling.on("left", (peer) => this.drop(peer));
    signaling.on("signal", (from, data) => void this.onSignal(from, data));
  }

  on<K extends keyof TransportEvents>(event: K, handler: TransportEvents[K]): void {
    this.handlers[event] = handler;
  }

  get connectedPeers(): string[] {
    return [...this.links.values()].filter((l) => l.connected).map((l) => l.id);
  }

  /** Build a packet stamped with our sender ID and the current time. */
  makePacket(type: number, payload: Uint8Array, recipient?: string): Packet {
    const packet: Packet = {
      version: 1,
      type,
      ttl: 0,
      timestamp: BigInt(Date.now()),
      senderID: this.selfBytes,
      payload,
    };
    if (recipient) packet.recipientID = fromHex(recipient);
    return packet;
  }

  /** Sends to one peer, or to every connected peer when `to` is omitted. */
  send(packet: Packet, options: { to?: string; channel?: Channel } = {}): void {
    const channel = options.channel ?? "reliable";
    const frames = this.frames(packet);
    const targets = options.to ? [this.links.get(options.to)] : [...this.links.values()];
    for (const link of targets) {
      if (!link?.connected) continue;
      const dc = channel === "fast" ? link.fast : link.reliable;
      if (dc.readyState !== "open") continue;
      for (const frame of frames) dc.send(frame as Uint8Array<ArrayBuffer>);
    }
  }

  bufferedAmount(peer: string, channel: Channel = "reliable"): number {
    const link = this.links.get(peer);
    if (!link) return 0;
    return (channel === "fast" ? link.fast : link.reliable).bufferedAmount;
  }

  /** Resolves once the channel's send buffer has drained below the threshold. */
  drained(peer: string, channel: Channel = "reliable"): Promise<void> {
    const link = this.links.get(peer);
    if (!link) return Promise.resolve();
    const dc = channel === "fast" ? link.fast : link.reliable;
    if (dc.bufferedAmount <= DRAIN_THRESHOLD) return Promise.resolve();
    return new Promise((resolve) => {
      dc.addEventListener("bufferedamountlow", () => resolve(), { once: true });
    });
  }

  /** Reports the selected ICE candidate pair, e.g. to tell LAN ("host") from relayed paths. */
  async connectionInfo(peer: string): Promise<{ local?: string; remote?: string; rttMs?: number } | null> {
    const link = this.links.get(peer);
    if (!link) return null;
    const stats = await link.pc.getStats();
    let pair: RTCIceCandidatePairStats | undefined;
    stats.forEach((s) => {
      if (s.type === "candidate-pair" && (s as RTCIceCandidatePairStats).nominated && s.state === "succeeded") {
        pair = s as RTCIceCandidatePairStats;
      }
    });
    if (!pair) return {};
    const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
    const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined;
    return {
      local: local?.candidateType,
      remote: remote?.candidateType,
      rttMs: pair.currentRoundTripTime !== undefined ? pair.currentRoundTripTime * 1000 : undefined,
    };
  }

  close(): void {
    for (const peer of [...this.links.keys()]) this.drop(peer);
    this.signaling.close();
  }

  private frames(packet: Packet): Uint8Array[] {
    const encoded = encodePacket(packet);
    if (!encoded) throw new Error("packet could not be encoded");
    if (encoded.length <= MAX_MESSAGE_SIZE) return [encoded];
    return fragmentPacket(packet, { chunkSize: FRAGMENT_CHUNK_SIZE }).map((f) => encodePacket(f)!);
  }

  private link(peer: string): PeerLink {
    const existing = this.links.get(peer);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const reliable = pc.createDataChannel("reliable", { negotiated: true, id: RELIABLE_ID, ordered: true });
    const fast = pc.createDataChannel("fast", { negotiated: true, id: FAST_ID, ordered: false, maxRetransmits: 0 });
    const link: PeerLink = {
      id: peer,
      pc,
      reliable,
      fast,
      assembler: new FragmentAssembler(),
      pendingCandidates: [],
      connected: false,
    };
    this.links.set(peer, link);

    for (const [dc, name] of [[reliable, "reliable"], [fast, "fast"]] as const) {
      dc.binaryType = "arraybuffer";
      dc.bufferedAmountLowThreshold = DRAIN_THRESHOLD;
      dc.onmessage = (e) => this.receive(link, new Uint8Array(e.data as ArrayBuffer), name);
    }
    reliable.onopen = () => {
      link.connected = true;
      this.handlers.peerConnected?.(peer);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling.send(peer, { kind: "candidate", candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.drop(peer);
    };
    return link;
  }

  private async initiate(peer: string): Promise<void> {
    const { pc } = this.link(peer);
    await pc.setLocalDescription(await pc.createOffer());
    this.signaling.send(peer, { kind: "offer", sdp: pc.localDescription!.sdp });
  }

  private async onSignal(from: string, data: SignalData): Promise<void> {
    const link = this.link(from);
    const { pc } = link;
    if (data.kind === "candidate") {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else link.pendingCandidates.push(data.candidate);
      return;
    }
    await pc.setRemoteDescription({ type: data.kind, sdp: data.sdp });
    for (const c of link.pendingCandidates.splice(0)) await pc.addIceCandidate(c);
    if (data.kind === "offer") {
      await pc.setLocalDescription(await pc.createAnswer());
      this.signaling.send(from, { kind: "answer", sdp: pc.localDescription!.sdp });
    }
  }

  private receive(link: PeerLink, bytes: Uint8Array, channel: Channel): void {
    let packet = decodePacket(bytes);
    if (!packet) return;
    // Direct links only: a packet must come from the peer that sent it.
    if (!bytesEqual(packet.senderID, fromHex(link.id))) return;
    if (packet.recipientID && !bytesEqual(packet.recipientID, this.selfBytes) && !isBroadcast(packet.recipientID)) return;
    if (packet.type === MessageType.fragment) {
      packet = link.assembler.add(packet);
      if (!packet) return;
    }
    this.handlers.packet?.(packet, link.id, channel);
  }

  private drop(peer: string): void {
    const link = this.links.get(peer);
    if (!link) return;
    this.links.delete(peer);
    link.pc.close();
    if (link.connected) this.handlers.peerDisconnected?.(peer);
  }
}

function isBroadcast(id: Uint8Array): boolean {
  return id.every((b) => b === 0xff);
}
