import { env } from 'cloudflare:workers'
import { randomToken, sha256Hex } from './crypto'

export function newCredentials() {
  return { key: 'bg_' + randomToken(32), recoveryCode: 'bgr_' + randomToken(32) }
}
export async function createCreator() {
  const credentials = newCredentials()
  await env.DB.prepare('INSERT INTO creators (id, key_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), await sha256Hex(credentials.key), await sha256Hex(credentials.recoveryCode), Date.now()).run()
  return credentials
}
/** The creator behind a current creator key or recovery code. Recovery codes work only on the /make page, never MCP. */
async function creatorFor(credential: string) {
  if (!/^(bg_|bgr_)[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error('Use your current creator key or recovery code.')
  const hash = await sha256Hex(credential)
  const row = await env.DB.prepare('SELECT id, key_hash, recovery_hash FROM creators WHERE (key_hash = ? AND revoked = 0) OR recovery_hash = ?')
    .bind(hash, hash).first<{ id: string; key_hash: string; recovery_hash: string | null }>()
  if (!row) throw new Error('That key or recovery code is no longer valid.')
  return row
}
/** A creator's games with their private links, so a lost agent message never loses a link. */
export async function creatorGames(credential: string) {
  const { id } = await creatorFor(credential)
  const { results } = await env.DB.prepare(`SELECT id, title, emoji, status, live, preview_token, play_version, live_version, review_note
    FROM games WHERE creator_id = ? ORDER BY updated_at DESC`).bind(id)
    .all<{ id: string; title: string; emoji: string; status: string; live: number; preview_token: string; play_version: string | null; live_version: string | null; review_note: string | null }>()
  return results.map(game => ({
    id: game.id, title: game.title, emoji: game.emoji, status: game.status, listed: Boolean(game.live),
    playable: Boolean(game.play_version ?? game.live_version), reviewNote: game.review_note,
    linkPath: `/try/${game.preview_token}`,
  }))
}
export async function manageCredentials(credential: string, action: 'rotate' | 'revoke') {
  const row = await creatorFor(credential)
  if (action === 'revoke') {
    const result = await env.DB.prepare('UPDATE creators SET revoked = 1 WHERE id = ? AND key_hash = ? AND recovery_hash IS ?')
      .bind(row.id, row.key_hash, row.recovery_hash).run()
    if (result.meta.changes !== 1) throw new Error('The credentials changed. Try again with the latest credentials.')
    return { revoked: true as const }
  }
  const credentials = newCredentials()
  const result = await env.DB.prepare('UPDATE creators SET key_hash = ?, recovery_hash = ?, revoked = 0 WHERE id = ? AND key_hash = ? AND recovery_hash IS ?')
    .bind(await sha256Hex(credentials.key), await sha256Hex(credentials.recoveryCode), row.id, row.key_hash, row.recovery_hash).run()
  if (result.meta.changes !== 1) throw new Error('The credentials changed. Try again with the latest credentials.')
  return { revoked: false as const, ...credentials }
}
export async function authenticate(request: Request): Promise<string | null> {
  const match = /^Bearer\s+(bg_[A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') ?? '')
  if (!match) return null
  return (await env.DB.prepare('SELECT id FROM creators WHERE key_hash = ? AND revoked = 0').bind(await sha256Hex(match[1]!)).first<{ id: string }>())?.id ?? null
}
