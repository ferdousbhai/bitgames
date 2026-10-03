import { deflateSync, inflateSync } from "fflate";

// BitChat uses Apple's COMPRESSION_ZLIB, which is raw DEFLATE (RFC 1951) with no zlib header.
export const COMPRESSION_THRESHOLD = 100;

export function shouldCompress(data: Uint8Array): boolean {
  if (data.length < COMPRESSION_THRESHOLD) return false;
  // Many distinct byte values usually means the data is already compressed.
  const unique = new Set(data.subarray(0, 256)).size;
  const sampleSize = Math.min(data.length, 256);
  return unique / sampleSize < 0.9;
}

/** Returns null when compression would not shrink the data. */
export function compress(data: Uint8Array): Uint8Array | null {
  if (data.length < COMPRESSION_THRESHOLD) return null;
  const out = deflateSync(data);
  return out.length > 0 && out.length < data.length ? out : null;
}

export function decompress(data: Uint8Array, originalSize: number): Uint8Array | null {
  try {
    const out = inflateSync(data, { out: new Uint8Array(originalSize) });
    return out.length === originalSize ? out : null;
  } catch {
    return null;
  }
}
