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
import { BLOCK_SIZES, optimalBlockSize, pad, unpad } from "./padding.js";
import { bytesEqual, fixedSize } from "./bytes.js";

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

export function isBroadcast(recipientID: Uint8Array | undefined): boolean {
  return !recipientID || bytesEqual(recipientID, BROADCAST_ID);
}

function headerSize(version: number): number | null {
  return version === 1 ? V1_HEADER_SIZE : version === 2 ? V2_HEADER_SIZE : null;
}

export function encodePacket(packet: Packet, options: { padding?: boolean } = {}): Uint8Array | null {
  const { version } = packet;
  if (version !== 1 && version !== 2) return null;
  const lengthFieldBytes = version === 2 ? 4 : 2;

  const rawRoute = version >= 2 ? (packet.route ?? []) : [];
  if (rawRoute.some((hop) => hop.length === 0)) return null;
  const route = rawRoute.map((hop) => fixedSize(hop, SENDER_ID_SIZE));
  if (route.length > 255) return null;
  const signature = packet.signature?.subarray(0, SIGNATURE_SIZE);
  // Everything in the frame except the payload (and its original-size field).
  const overhead = headerSize(version)! + SENDER_ID_SIZE + (packet.recipientID ? RECIPIENT_ID_SIZE : 0) +
    (route.length ? 1 + route.length * SENDER_ID_SIZE : 0) + (signature?.length ?? 0);

  let payload = packet.payload;
  let originalSize: number | null = null;
  // Small frames are padded to the smallest block anyway, so compressing them saves nothing.
  const fitsSmallestBlock = optimalBlockSize(overhead + payload.length) === BLOCK_SIZES[0];
  if (!fitsSmallestBlock && shouldCompress(payload)) {
    const maxRepresentable = version === 2 ? 0xffffffff : 0xffff;
    const compressed = payload.length <= maxRepresentable ? compress(payload) : null;
    if (compressed) {
      originalSize = payload.length;
      payload = compressed;
    }
  }

  // payloadLength excludes the route but includes the original-size field.
  const payloadDataSize = payload.length + (originalSize !== null ? lengthFieldBytes : 0);
  if (version === 1 && payloadDataSize > 0xffff) return null;

  let flags = 0;
  if (packet.recipientID) flags |= Flags.hasRecipient;
  if (packet.signature) flags |= Flags.hasSignature;
  if (originalSize !== null) flags |= Flags.isCompressed;
  if (route.length > 0) flags |= Flags.hasRoute;
  if (packet.isRSR) flags |= Flags.isRSR;

  const data = new Uint8Array(overhead + payloadDataSize);
  const view = new DataView(data.buffer);
  let o = 0;
  const put = (bytes: Uint8Array) => {
    data.set(bytes, o);
    o += bytes.length;
  };
  const putLength = (n: number) => {
    if (version === 2) view.setUint32(o, n);
    else view.setUint16(o, n);
    o += version === 2 ? 4 : 2;
  };
  view.setUint8(o++, version);
  view.setUint8(o++, packet.type);
  view.setUint8(o++, packet.ttl);
  view.setBigUint64(o, packet.timestamp);
  o += 8;
  view.setUint8(o++, flags);
  putLength(payloadDataSize);
  put(fixedSize(packet.senderID, SENDER_ID_SIZE));
  if (packet.recipientID) put(fixedSize(packet.recipientID, RECIPIENT_ID_SIZE));
  if (route.length > 0) {
    view.setUint8(o++, route.length);
    for (const hop of route) put(hop);
  }
  if (originalSize !== null) putLength(originalSize);
  put(payload);
  if (signature) put(signature);

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
