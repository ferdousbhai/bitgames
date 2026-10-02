/** Wire message types, matching BitChat's `MessageType` (BitFoundation/MessageType.swift). */
export const MessageType = {
  announce: 0x01,
  message: 0x02,
  leave: 0x03,
  courierEnvelope: 0x04,
  noiseHandshake: 0x10,
  noiseEncrypted: 0x11,
  fragment: 0x20,
  requestSync: 0x21,
  fileTransfer: 0x22,
  boardPost: 0x23,
  prekeyBundle: 0x24,
  groupMessage: 0x25,
  ping: 0x26,
  pong: 0x27,
  nostrCarrier: 0x28,
  voiceFrame: 0x29,
  announceV2: 0x2c,
} as const;

export type MessageTypeName = keyof typeof MessageType;
