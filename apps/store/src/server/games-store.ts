import { env } from 'cloudflare:workers'
import { CATEGORIES } from '#/lib/categories'
import { randomToken, sha256Hex } from './crypto'
import {
  CONTENT_TYPES,
  MAX_CREATOR_BYTES,
  MAX_FILES_PER_GAME,
  MAX_GAMES_PER_CREATOR,
  MAX_GAME_BYTES,
  MAX_TEXT_FILE_BYTES,
  TEXT_EXTENSIONS,
  UPLOAD_URL_TTL_MS,
  checkPath,
  extensionOf,
  liveKey,
  objectKey,
} from './limits'
import { STARTER_GAME } from './guide'

/** Thrown for anything the creator can fix; the message is shown to their agent. */
export class CreatorError extends Error {}

export type GameStatus = 'draft' | 'review' | 'public' | 'rejected'

export interface GameInfo {
  title: string
  tagline: string
  howToPlay: string
  emoji: string
  color: string
  category: string
  together: boolean
}

interface OwnedGameRow {
  id: string
  title: string
  live: number
  status: GameStatus
  review_note: string | null
  preview_token: string
  updated_at: number
}

// A published game's draft stays editable: the live copy keeps playing until the changes are approved.
const EDITABLE: GameStatus[] = ['draft', 'rejected', 'public']

/** The creator's private play page: the game inside BitGames, so "play together" works too. */
export function previewUrl(origin: string, token: string) {
  return `${origin}/try/${token}`
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'game'
  )
}

export function validateInfo(info: Partial<GameInfo>) {
  if (info.category !== undefined && !CATEGORIES.some((c) => c.slug === info.category)) {
    throw new CreatorError(`category must be one of: ${CATEGORIES.map((c) => c.slug).join(', ')}`)
  }
  if (info.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(info.color)) {
    throw new CreatorError('color must be a hex colour like "#ff6b9d"')
  }
}

async function ownedGame(creatorId: string, gameId: string) {
  const game = await env.DB.prepare(
    'SELECT id, title, live, status, review_note, preview_token, updated_at FROM games WHERE id = ? AND creator_id = ?',
  )
    .bind(gameId, creatorId)
    .first<OwnedGameRow>()
  if (!game) throw new CreatorError(`You have no game with id "${gameId}". Use list_my_games to see your games.`)
  return game
}

async function editableGame(creatorId: string, gameId: string) {
  const game = await ownedGame(creatorId, gameId)
  if (!EDITABLE.includes(game.status)) {
    throw new CreatorError('This game is waiting for review, so it cannot change. Use reopen_game to take it back and edit it.')
  }
  return game
}

export async function createGame(creatorId: string, info: GameInfo) {
  validateInfo(info)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE creator_id = ?')
    .bind(creatorId)
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_GAMES_PER_CREATOR) {
    throw new CreatorError(`You can have at most ${MAX_GAMES_PER_CREATOR} games. Delete one with delete_game first.`)
  }

  const now = Date.now()
  const previewToken = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const base = slugify(info.title)
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = attempt === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`
    const result = await env.DB.prepare(
      `INSERT INTO games (id, creator_id, title, tagline, how_to_play, emoji, color, category, together,
                          status, preview_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
      .bind(id, creatorId, info.title, info.tagline, info.howToPlay, info.emoji, info.color, info.category,
        info.together ? 1 : 0, previewToken, now, now)
      .run()
    if (result.meta.changes === 1) {
      await env.GAMES.put(objectKey(id, 'index.html'), STARTER_GAME, {
        httpMetadata: { contentType: CONTENT_TYPES.html },
      })
      await recordGameBytes(id)
      return { id, previewToken }
    }
  }
  throw new CreatorError('Could not find a free id for that title. Try a different title.')
}

export async function updateInfo(creatorId: string, gameId: string, info: Partial<GameInfo>) {
  validateInfo(info)
  const game = await editableGame(creatorId, gameId)
  if (game.live) {
    // Children keep seeing the reviewed details until these are approved too.
    const row = await env.DB.prepare('SELECT pending_info FROM games WHERE id = ?').bind(gameId).first<{ pending_info: string | null }>()
    const pending = { ...(row?.pending_info ? JSON.parse(row.pending_info) : {}), ...info }
    await env.DB.prepare(`UPDATE games SET pending_info = ?, status = 'draft', updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(pending), Date.now(), gameId)
      .run()
    return 'pending'
  }
  const columns: Record<keyof GameInfo, string> = {
    title: 'title', tagline: 'tagline', howToPlay: 'how_to_play', emoji: 'emoji',
    color: 'color', category: 'category', together: 'together',
  }
  const sets: string[] = []
  const values: (string | number)[] = []
  for (const [key, column] of Object.entries(columns) as [keyof GameInfo, string][]) {
    const value = info[key]
    if (value === undefined) continue
    sets.push(`${column} = ?`)
    values.push(typeof value === 'boolean' ? Number(value) : value)
  }
  if (sets.length === 0) return
  await env.DB.prepare(`UPDATE games SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...values, Date.now(), gameId)
    .run()
  return 'applied'
}

export async function listOwned(creatorId: string) {
  const { results } = await env.DB.prepare(
    'SELECT id, title, live, status, review_note, preview_token, updated_at FROM games WHERE creator_id = ? ORDER BY updated_at DESC',
  )
    .bind(creatorId)
    .all<OwnedGameRow>()
  return results
}

export async function listFiles(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  return listGameObjects(gameId)
}

async function listGameObjects(gameId: string) {
  const prefix = objectKey(gameId, '')
  const listed = await env.GAMES.list({ prefix, limit: 1000 })
  return listed.objects.map((o) => ({ path: o.key.slice(prefix.length), bytes: o.size }))
}

/**
 * Returns an error message when putting `bytes` at `path` would break the
 * per-game file and size limits or the creator's total storage cap.
 */
export async function checkGameQuota(gameId: string, path: string, bytes: number): Promise<string | null> {
  const others = (await listGameObjects(gameId)).filter((o) => o.path !== path)
  if (others.length + 1 > MAX_FILES_PER_GAME) return `A game can have at most ${MAX_FILES_PER_GAME} files.`
  const gameTotal = others.reduce((sum, o) => sum + o.bytes, 0) + bytes
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  if (gameTotal > MAX_GAME_BYTES) {
    return `This would make the game ${mb(gameTotal)} MB. A game can be at most ${MAX_GAME_BYTES / 1024 / 1024} MB.`
  }
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(bytes), 0) AS other FROM games
      WHERE creator_id = (SELECT creator_id FROM games WHERE id = ?) AND id != ?`,
  )
    .bind(gameId, gameId)
    .first<{ other: number }>()
  const creatorTotal = (row?.other ?? 0) + gameTotal
  if (creatorTotal > MAX_CREATOR_BYTES) {
    return `This would bring all your games to ${mb(creatorTotal)} MB. Each creator can store up to ${MAX_CREATOR_BYTES / 1024 / 1024} MB; delete files or games you don't need.`
  }
  return null
}

export const COVER_FILES = ['cover.webp', 'cover.jpg', 'cover.png']

/** Recomputes a game's stored size after its draft changes; a changed published game needs review again. */
export async function recordGameBytes(gameId: string) {
  const total = (await listGameObjects(gameId)).reduce((sum, o) => sum + o.bytes, 0)
  await env.DB.prepare(
    `UPDATE games SET bytes = ?, updated_at = ?, status = CASE WHEN status = 'public' THEN 'draft' ELSE status END WHERE id = ?`,
  )
    .bind(total, Date.now(), gameId)
    .run()
}

async function deletePrefix(prefix: string) {
  let cursor: string | undefined
  do {
    const listed = await env.GAMES.list({ prefix, cursor, limit: 1000 })
    if (listed.objects.length) await env.GAMES.delete(listed.objects.map((o) => o.key))
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
}

/**
 * Approval: copies the draft files over the live copy, removes live files the
 * draft no longer has, applies any pending details and puts the game in the store.
 */
export async function publishDraft(gameId: string) {
  const draft = await listGameObjects(gameId)
  for (const { path } of draft) {
    const object = await env.GAMES.get(objectKey(gameId, path))
    if (!object) continue
    // Buffered: R2 needs a known length, and files are capped at 10 MB.
    await env.GAMES.put(liveKey(gameId, path), await object.arrayBuffer(), { httpMetadata: object.httpMetadata })
  }
  const keep = new Set(draft.map((o) => liveKey(gameId, o.path)))
  const live = await env.GAMES.list({ prefix: liveKey(gameId, ''), limit: 1000 })
  const stale = live.objects.map((o) => o.key).filter((k) => !keep.has(k))
  if (stale.length) await env.GAMES.delete(stale)

  const cover = COVER_FILES.find((name) => draft.some((o) => o.path === name)) ?? null
  const row = await env.DB.prepare('SELECT pending_info FROM games WHERE id = ?').bind(gameId).first<{ pending_info: string | null }>()
  const pending: Partial<GameInfo> = row?.pending_info ? JSON.parse(row.pending_info) : {}
  const columns: Record<keyof GameInfo, string> = {
    title: 'title', tagline: 'tagline', howToPlay: 'how_to_play', emoji: 'emoji',
    color: 'color', category: 'category', together: 'together',
  }
  const sets = ['live = 1', `status = 'public'`, 'review_note = NULL', 'pending_info = NULL', 'cover = ?', 'updated_at = ?']
  const values: (string | number | null)[] = [cover, Date.now()]
  for (const [key, column] of Object.entries(columns) as [keyof GameInfo, string][]) {
    if (pending[key] === undefined) continue
    sets.push(`${column} = ?`)
    values.push(typeof pending[key] === 'boolean' ? Number(pending[key]) : (pending[key] as string))
  }
  await env.DB.prepare(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`).bind(...values, gameId).run()
}

/** Takes a game out of the store: the live copy goes, the draft stays with the creator. */
export async function unpublish(gameId: string, note: string | null) {
  await deletePrefix(liveKey(gameId, ''))
  await env.DB.prepare(`UPDATE games SET live = 0, status = 'rejected', review_note = ?, updated_at = ? WHERE id = ?`)
    .bind(note, Date.now(), gameId)
    .run()
}

export async function writeTextFile(creatorId: string, gameId: string, path: string, content: string) {
  const pathError = checkPath(path)
  if (pathError) throw new CreatorError(pathError)
  if (!TEXT_EXTENSIONS.has(extensionOf(path))) {
    throw new CreatorError(`.${extensionOf(path)} is a binary file. Upload it with get_upload_url instead.`)
  }
  const bytes = new TextEncoder().encode(content)
  if (bytes.length > MAX_TEXT_FILE_BYTES) {
    throw new CreatorError(`Text files can be at most ${MAX_TEXT_FILE_BYTES / 1024} KB. Split the code into modules.`)
  }
  await editableGame(creatorId, gameId)
  const quotaError = await checkGameQuota(gameId, path, bytes.length)
  if (quotaError) throw new CreatorError(quotaError)
  await env.GAMES.put(objectKey(gameId, path), bytes, {
    httpMetadata: { contentType: CONTENT_TYPES[extensionOf(path)] },
  })
  await recordGameBytes(gameId)
  return bytes.length
}

export async function readTextFile(creatorId: string, gameId: string, path: string) {
  const pathError = checkPath(path)
  if (pathError) throw new CreatorError(pathError)
  if (!TEXT_EXTENSIONS.has(extensionOf(path))) throw new CreatorError('Only text files can be read back.')
  await ownedGame(creatorId, gameId)
  const object = await env.GAMES.get(objectKey(gameId, path))
  if (!object) throw new CreatorError(`There is no file "${path}". Use list_files to see the files.`)
  return object.text()
}

export async function deleteFile(creatorId: string, gameId: string, path: string) {
  const pathError = checkPath(path)
  if (pathError) throw new CreatorError(pathError)
  await editableGame(creatorId, gameId)
  await env.GAMES.delete(objectKey(gameId, path))
  await recordGameBytes(gameId)
}

export async function createUploadUrl(creatorId: string, gameId: string, path: string, origin: string) {
  const pathError = checkPath(path)
  if (pathError) throw new CreatorError(pathError)
  await editableGame(creatorId, gameId)
  const token = randomToken(32)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM uploads WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO uploads (token_hash, game_id, path, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256Hex(token),
      gameId,
      path,
      Date.now() + UPLOAD_URL_TTL_MS,
    ),
  ])
  return `${origin}/upload/${token}`
}

export async function submitForReview(creatorId: string, gameId: string) {
  await editableGame(creatorId, gameId)
  const index = await env.GAMES.head(objectKey(gameId, 'index.html'))
  if (!index) throw new CreatorError('The game needs an index.html before it can be submitted.')
  await env.DB.prepare(`UPDATE games SET status = 'review', review_note = NULL, updated_at = ? WHERE id = ?`)
    .bind(Date.now(), gameId)
    .run()
}

/** Withdraws a game from the review queue so it can be edited again. */
export async function reopenGame(creatorId: string, gameId: string) {
  const game = await ownedGame(creatorId, gameId)
  if (game.status !== 'review') throw new CreatorError('This game is not waiting for review; you can already edit it.')
  await env.DB.prepare(`UPDATE games SET status = 'draft', updated_at = ? WHERE id = ?`).bind(Date.now(), gameId).run()
}

export async function deleteGame(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  await deletePrefix(objectKey(gameId, ''))
  await deletePrefix(liveKey(gameId, ''))
  await env.DB.prepare('DELETE FROM games WHERE id = ? AND creator_id = ?').bind(gameId, creatorId).run()
}
