/** PKCS#7-style padding to fixed block sizes (BitFoundation/MessagePadding.swift). */
export const BLOCK_SIZES = [256, 512, 1024, 2048] as const;

export function pad(data: Uint8Array, targetSize: number): Uint8Array {
  if (data.length >= targetSize) return data;
  const needed = targetSize - data.length;
  // A single byte marks the pad length, so at most 255 bytes of padding.
  if (needed > 255) return data;
  const out = new Uint8Array(targetSize);
  out.set(data);
  out.fill(needed, data.length);
  return out;
}

/** Returns `data` itself (same reference) when no valid padding is found. */
export function unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0) return data;
  const last = data[data.length - 1]!;
  if (last === 0 || last > data.length) return data;
  const start = data.length - last;
  for (let i = start; i < data.length; i++) if (data[i] !== last) return data;
  return data.subarray(0, start);
}

export function optimalBlockSize(dataSize: number): number {
  // Leave room for a 16-byte AEAD tag.
  const total = dataSize + 16;
  for (const block of BLOCK_SIZES) if (total <= block) return block;
  return dataSize;
}
