export function randomToken(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))
}

// Workers-only extension; the DOM lib in tsconfig shadows the Workers SubtleCrypto type.
const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean }

/** Constant-time comparison: hash both sides so lengths match, then use timingSafeEqual. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all(
    [a, b].map((v) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))),
  )
  return subtle.timingSafeEqual(ha!, hb!)
}
