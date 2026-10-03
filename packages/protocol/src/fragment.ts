/**
 * Splitting packets that exceed the link MTU, and reassembling them
 * (BLEOutboundFragmentPlanner.swift, BLEFragmentAssemblyBuffer.swift).
 *
 * Fragment payload: fragmentID(8) index(2) total(2) originalType(1) chunk
 */
import { concatBytes, randomBytes, toHex } from "./bytes.js";
import { maxFrameBytes } from "./limits.js";
import { MessageType } from "./messageType.js";
import { type Packet, decodePacket, encodePacket, isBroadcast } from "./packet.js";

const FRAGMENT_HEADER_SIZE = 13;
const MIN_CHUNK_SIZE = 64;
const MAX_FRAGMENTS = 10_000;

export interface FragmentOptions {
  chunkSize: number;
  padding?: boolean;
  fragmentID?: Uint8Array;
}

export function fragmentPacket(packet: Packet, options: FragmentOptions): Packet[] {
  const full = encodePacket(packet, { padding: options.padding ?? true });
  if (!full) return [];
  const chunkSize = Math.max(MIN_CHUNK_SIZE, options.chunkSize);
  const fragmentID = options.fragmentID ?? randomBytes(8);
  if (fragmentID.length !== 8) throw new Error("fragmentID must be 8 bytes");

  const total = Math.ceil(full.length / chunkSize);
  if (total > MAX_FRAGMENTS) return [];

  const fragments: Packet[] = [];
  for (let index = 0; index < total; index++) {
    const chunk = full.subarray(index * chunkSize, (index + 1) * chunkSize);
    const header = new Uint8Array(FRAGMENT_HEADER_SIZE);
    header.set(fragmentID);
    const view = new DataView(header.buffer);
    view.setUint16(8, index);
    view.setUint16(10, total);
    header[12] = packet.type;

    const fragment: Packet = {
      version: packet.route?.length ? 2 : 1,
      type: MessageType.fragment,
      ttl: packet.ttl,
      timestamp: packet.timestamp,
      senderID: packet.senderID,
      payload: concatBytes(header, chunk),
    };
    if (packet.recipientID) fragment.recipientID = packet.recipientID;
    if (packet.route) fragment.route = packet.route;
    if (packet.isRSR) fragment.isRSR = true;
    fragments.push(fragment);
  }
  return fragments;
}

export interface FragmentHeader {
  key: string;
  index: number;
  total: number;
  originalType: number;
  data: Uint8Array;
  isBroadcast: boolean;
}

export function parseFragmentHeader(packet: Packet): FragmentHeader | null {
  const p = packet.payload;
  if (packet.type !== MessageType.fragment || p.length < FRAGMENT_HEADER_SIZE) return null;
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const index = view.getUint16(8);
  const total = view.getUint16(10);
  if (total === 0 || total > MAX_FRAGMENTS || index >= total) return null;
  return {
    key: `${toHex(packet.senderID)}:${toHex(p.subarray(0, 8))}`,
    index,
    total,
    originalType: p[12]!,
    data: p.subarray(FRAGMENT_HEADER_SIZE),
    isBroadcast: isBroadcast(packet.recipientID),
  };
}

interface Assembly {
  total: number;
  startedAt: number;
  size: number;
  chunks: Map<number, Uint8Array>;
}

export interface FragmentAssemblerOptions {
  maxInFlight?: number;
  /** Drop assemblies older than this, in milliseconds. */
  timeoutMs?: number;
}

export class FragmentAssembler {
  private assemblies = new Map<string, Assembly>();
  private readonly maxInFlight: number;
  private readonly timeoutMs: number;

  constructor(options: FragmentAssemblerOptions = {}) {
    this.maxInFlight = options.maxInFlight ?? 128;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  get inFlight(): number {
    return this.assemblies.size;
  }

  /**
   * Adds a fragment. Returns the reassembled packet once every fragment has
   * arrived, or null while it is still incomplete or if it was rejected.
   */
  add(fragment: Packet, now = Date.now()): Packet | null {
    const header = parseFragmentHeader(fragment);
    if (!header) return null;
    this.expire(now);

    let assembly = this.assemblies.get(header.key);
    if (!assembly) {
      if (this.assemblies.size >= this.maxInFlight) this.evictOldest();
      assembly = { total: header.total, startedAt: now, size: 0, chunks: new Map() };
      this.assemblies.set(header.key, assembly);
    }
    if (assembly.total !== header.total) return null;

    const replaced = assembly.chunks.get(header.index)?.length ?? 0;
    const projected = assembly.size - replaced + header.data.length;
    if (projected > maxFrameBytes(header.originalType)) {
      this.assemblies.delete(header.key);
      return null;
    }
    assembly.chunks.set(header.index, header.data);
    assembly.size = projected;
    if (assembly.chunks.size < assembly.total) return null;

    this.assemblies.delete(header.key);
    const parts: Uint8Array[] = [];
    for (let i = 0; i < assembly.total; i++) parts.push(assembly.chunks.get(i)!);
    const packet = decodePacket(concatBytes(...parts));
    // Fragments must not be able to smuggle a different packet type.
    if (!packet || packet.type !== header.originalType) return null;
    // Reassembled packets are delivered locally, not relayed again.
    packet.ttl = 0;
    return packet;
  }

  expire(now = Date.now()): void {
    for (const [key, a] of this.assemblies) {
      if (now - a.startedAt > this.timeoutMs) this.assemblies.delete(key);
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, a] of this.assemblies) {
      if (a.startedAt < oldest) {
        oldest = a.startedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.assemblies.delete(oldestKey);
  }
}
