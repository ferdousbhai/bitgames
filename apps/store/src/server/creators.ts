import { env } from 'cloudflare:workers'
import { randomToken, sha256Hex } from './crypto'

const KEY_PREFIX = 'bg_'

export async function createCreator(): Promise<string> {
  const key = KEY_PREFIX + randomToken(32)
  await env.DB.prepare('INSERT INTO creators (id, key_hash, created_at) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), await sha256Hex(key), Date.now())
    .run()
  return key
}

/** Resolves a bearer creator key to its creator ID, or null when missing, unknown or revoked. */
export async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(bg_[A-Za-z0-9_-]{20,100})$/.exec(header)
  if (!match) return null
  const row = await env.DB.prepare('SELECT id FROM creators WHERE key_hash = ? AND revoked = 0')
    .bind(await sha256Hex(match[1]!))
    .first<{ id: string }>()
  return row?.id ?? null
}
