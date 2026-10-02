import { MessageType } from "./messageType.js";

export const V1_HEADER_SIZE = 14;
export const V2_HEADER_SIZE = 16;
export const SENDER_ID_SIZE = 8;
export const RECIPIENT_ID_SIZE = 8;
export const SIGNATURE_SIZE = 64;

/** DEFLATE cannot expand more than this ratio; larger claims are rejected before allocating. */
export const MAX_DEFLATE_RATIO = 1032;

export const MAX_FILE_PAYLOAD_BYTES = 1024 * 1024;
export const MAX_FRAMED_FILE_BYTES =
  MAX_FILE_PAYLOAD_BYTES +
  18 + 0xffff * 2 +
  V2_HEADER_SIZE + SENDER_ID_SIZE + RECIPIENT_ID_SIZE + SIGNATURE_SIZE;

const FRAGMENT_BYTES = 1280;
const CONTROL_BYTES = 4 * 1024;
const REQUEST_SYNC_BYTES = 8 * 1024;
const ENVELOPE_BYTES = 64 * 1024;
const TWICE_V1_FRAME_BYTES = 128 * 1024;

const MAX_FRAME_OVERHEAD_BYTES =
  V2_HEADER_SIZE + SENDER_ID_SIZE + RECIPIENT_ID_SIZE +
  1 + 255 * SENDER_ID_SIZE +
  4 + SIGNATURE_SIZE + 255;

/** Largest decoded payload accepted for a packet type (BitFoundation/PacketPayloadLimits.swift). */
export function maxPayloadBytes(type: number): number {
  switch (type) {
    case MessageType.fileTransfer:
    case MessageType.noiseEncrypted:
      return MAX_FRAMED_FILE_BYTES;
    case MessageType.message:
    case MessageType.groupMessage:
      return TWICE_V1_FRAME_BYTES;
    case MessageType.courierEnvelope:
    case MessageType.nostrCarrier:
      return ENVELOPE_BYTES;
    case MessageType.requestSync:
      return REQUEST_SYNC_BYTES;
    case MessageType.fragment:
      return FRAGMENT_BYTES;
    case MessageType.announce:
    case MessageType.announceV2:
    case MessageType.leave:
    case MessageType.boardPost:
    case MessageType.prekeyBundle:
    case MessageType.voiceFrame:
    case MessageType.noiseHandshake:
    case MessageType.ping:
    case MessageType.pong:
      return CONTROL_BYTES;
    default:
      return TWICE_V1_FRAME_BYTES;
  }
}

/** Largest encoded frame, padding included, that can still decode as `type`. */
export function maxFrameBytes(type: number): number {
  return maxPayloadBytes(type) + MAX_FRAME_OVERHEAD_BYTES;
}
