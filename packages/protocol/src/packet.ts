/**
 * BitChat binary packet format (BitFoundation/BinaryProtocol.swift).
 *
 * Header, all big-endian:
 *   version(1) type(1) ttl(1) timestamp(8) flags(1) payloadLength(2 for v1, 4 for v2)
 * Then:
 *   senderID(8) [recipientID(8)] [routeCount(1) + hops(8 each), v2 only]
 *   [originalSize(2|4) if compressed] payload [signature(64)]
 */
import { compress, decompress, shouldCompress } from "./compression.js";
import {
  MAX_DEFLATE_RATIO,
  MAX_FRAMED_FILE_BYTES,
  RECIPIENT_ID_SIZE,
  SENDER_ID_SIZE,
  SIGNATURE_SIZE,
  V1_HEADER_SIZE,
  V2_HEADER_SIZE,
  maxPayloadBytes,
} from "./limits.js";
import { optimalBlockSize, pad, unpad } from "./padding.js";
import { concatBytes, fixedSize } from "./bytes.js";

export const Flags = {
  hasRecipient: 0x01,
  hasSignature: 0x02,
  isCompressed: 0x04,
  hasRoute: 0x08,
  isRSR: 0x10,
} as const;

export interface Packet {
  version: 1 | 2;
  type: number;
  ttl: number;
  /** Milliseconds since the Unix epoch. */
  timestamp: bigint;
  senderID: Uint8Array;
  recipientID?: Uint8Array;
  payload: Uint8Array;
  signature?: Uint8Array;
  /** Source route hops (v2 only). */
  route?: Uint8Array[];
  isRSR?: boolean;
}

/** Recipient ID meaning "everyone". */
export const BROADCAST_ID = new Uint8Array(8).fill(0xff);

function headerSize(version: number): number | null {
  return version === 1 ? V1_HEADER_SIZE : version === 2 ? V2_HEADER_SIZE : null;
}

class Writer {
  private parts: Uint8Array[] = [];
  u8(v: number) { this.parts.push(Uint8Array.of(v & 0xff)); }
  u16(v: number) { this.u8(v >>> 8); this.u8(v); }
  u32(v: number) { this.u16(v >>> 16); this.u16(v); }
  u64(v: bigint) { for (let s = 56n; s >= 0n; s -= 8n) this.u8(Number((v >> s) & 0xffn)); }
  bytes(b: Uint8Array) { this.parts.push(b); }
  finish(): Uint8Array { return concatBytes(...this.parts); }
}

export function encodePacket(packet: Packet, options: { padding?: boolean } = {}): Uint8Array | null {
  const { version } = packet;
  if (version !== 1 && version !== 2) return null;
  const lengthFieldBytes = version === 2 ? 4 : 2;

  let payload = packet.payload;
  let originalSize: number | null = null;
  if (shouldCompress(payload)) {
    const maxRepresentable = version === 2 ? 0xffffffff : 0xffff;
    const compressed = payload.length <= maxRepresentable ? compress(payload) : null;
    if (compressed) {
      originalSize = payload.length;
      payload = compressed;
    }
  }

  const rawRoute = version >= 2 ? (packet.route ?? []) : [];
  if (rawRoute.some((hop) => hop.length === 0)) return null;
  const route = rawRoute.map((hop) => fixedSize(hop, SENDER_ID_SIZE));
  if (route.length > 255) return null;

  // payloadLength excludes the route but includes the original-size field.
  const payloadDataSize = payload.length + (originalSize !== null ? lengthFieldBytes : 0);
  if (version === 1 && payloadDataSize > 0xffff) return null;

  let flags = 0;
  if (packet.recipientID) flags |= Flags.hasRecipient;
  if (packet.signature) flags |= Flags.hasSignature;
  if (originalSize !== null) flags |= Flags.isCompressed;
  if (route.length > 0) flags |= Flags.hasRoute;
  if (packet.isRSR) flags |= Flags.isRSR;

  const w = new Writer();
  w.u8(version);
  w.u8(packet.type);
  w.u8(packet.ttl);
  w.u64(packet.timestamp);
  w.u8(flags);
  if (version === 2) w.u32(payloadDataSize);
  else w.u16(payloadDataSize);
  w.bytes(fixedSize(packet.senderID, SENDER_ID_SIZE));
  if (packet.recipientID) w.bytes(fixedSize(packet.recipientID, RECIPIENT_ID_SIZE));
  if (route.length > 0) {
    w.u8(route.length);
    for (const hop of route) w.bytes(hop);
  }
  if (originalSize !== null) {
    if (version === 2) w.u32(originalSize);
    else w.u16(originalSize);
  }
  w.bytes(payload);
  if (packet.signature) w.bytes(packet.signature.subarray(0, SIGNATURE_SIZE));

  const data = w.finish();
  return options.padding === false ? data : pad(data, optimalBlockSize(data.length));
}

export function decodePacket(data: Uint8Array): Packet | null {
  const packet = decodeCore(data);
  if (packet) return packet;
  const unpadded = unpad(data);
  return unpadded === data ? null : decodeCore(unpadded);
}

function decodeCore(raw: Uint8Array): Packet | null {
  if (raw.length < V1_HEADER_SIZE + SENDER_ID_SIZE) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let offset = 0;
  const has = (n: number) => offset + n <= raw.length;
  const read8 = () => (has(1) ? view.getUint8(offset++) : null);
  const read16 = () => {
    if (!has(2)) return null;
    const v = view.getUint16(offset);
    offset += 2;
    return v;
  };
  const read32 = () => {
    if (!has(4)) return null;
    const v = view.getUint32(offset);
    offset += 4;
    return v;
  };
  const readBytes = (n: number) => {
    if (!has(n)) return null;
    const v = raw.slice(offset, offset + n);
    offset += n;
    return v;
  };

  const version = read8();
  if (version !== 1 && version !== 2) return null;
  const lengthFieldBytes = version === 2 ? 4 : 2;
  if (raw.length < headerSize(version)! + SENDER_ID_SIZE) return null;

  const type = read8()!;
  const ttl = read8()!;
  const timestamp = view.getBigUint64(offset);
  offset += 8;
  const flags = read8()!;
  const hasRoute = version >= 2 && (flags & Flags.hasRoute) !== 0;

  const payloadLength = version === 2 ? read32() : read16();
  if (payloadLength === null || payloadLength > MAX_FRAMED_FILE_BYTES) return null;

  const senderID = readBytes(SENDER_ID_SIZE);
  if (!senderID) return null;

  let recipientID: Uint8Array | undefined;
  if (flags & Flags.hasRecipient) {
    recipientID = readBytes(RECIPIENT_ID_SIZE) ?? undefined;
    if (!recipientID) return null;
  }

  let route: Uint8Array[] | undefined;
  if (hasRoute) {
    const count = read8();
    if (count === null) return null;
    if (count > 0) {
      route = [];
      for (let i = 0; i < count; i++) {
        const hop = readBytes(SENDER_ID_SIZE);
        if (!hop) return null;
        route.push(hop);
      }
    }
  }

  // Cap the decoded payload per type, compressed or not, before allocating.
  const maxPayload = maxPayloadBytes(type);
  let payload: Uint8Array;
  if (flags & Flags.isCompressed) {
    if (payloadLength < lengthFieldBytes) return null;
    const originalSize = version === 2 ? read32() : read16();
    if (originalSize === null || originalSize > maxPayload) return null;
    const compressedSize = payloadLength - lengthFieldBytes;
    if (compressedSize <= 0) return null;
    const compressed = readBytes(compressedSize);
    if (!compressed) return null;
    if (originalSize > compressedSize * MAX_DEFLATE_RATIO) return null;
    const decompressed = decompress(compressed, originalSize);
    if (!decompressed) return null;
    payload = decompressed;
  } else {
    if (payloadLength > maxPayload) return null;
    const p = readBytes(payloadLength);
    if (!p) return null;
    payload = p;
  }

  let signature: Uint8Array | undefined;
  if (flags & Flags.hasSignature) {
    signature = readBytes(SIGNATURE_SIZE) ?? undefined;
    if (!signature) return null;
  }

  const packet: Packet = { version, type, ttl, timestamp, senderID, payload };
  if (recipientID) packet.recipientID = recipientID;
  if (signature) packet.signature = signature;
  if (route) packet.route = route;
  if (flags & Flags.isRSR) packet.isRSR = true;
  return packet;
}

/**
 * Bytes covered by a packet signature: the padded encoding with no signature, TTL 0
 * and RSR cleared, since relays change TTL and RSR in transit.
 */
export function signingBytes(packet: Packet): Uint8Array | null {
  const { signature: _signature, ...rest } = packet;
  return encodePacket({ ...rest, ttl: 0, isRSR: false });
}
