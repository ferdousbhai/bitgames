import { env } from 'cloudflare:workers'
import { CATEGORIES } from '#/lib/categories'
import { randomToken, sha256Hex } from './crypto'
import {
  CONTENT_TYPES,
  MAX_FILES_PER_GAME,
  MAX_GAMES_PER_CREATOR,
  MAX_GAME_BYTES,
  MAX_TEXT_FILE_BYTES,
  TEXT_EXTENSIONS,
  UPLOAD_URL_TTL_MS,
  checkPath,
  extensionOf,
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
  status: GameStatus
  review_note: string | null
  preview_token: string
  updated_at: number
}

const EDITABLE: GameStatus[] = ['draft', 'rejected']

export function previewUrl(origin: string, token: string) {
  return `${origin}/preview/${token}/index.html`
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
    'SELECT id, title, status, review_note, preview_token, updated_at FROM games WHERE id = ? AND creator_id = ?',
  )
    .bind(gameId, creatorId)
    .first<OwnedGameRow>()
  if (!game) throw new CreatorError(`You have no game with id "${gameId}". Use list_my_games to see your games.`)
  return game
}

async function editableGame(creatorId: string, gameId: string) {
  const game = await ownedGame(creatorId, gameId)
  if (!EDITABLE.includes(game.status)) {
    throw new CreatorError(
      game.status === 'review'
        ? 'This game is waiting for review, so it cannot change. Use reopen_game to take it back and edit it.'
        : 'This game is published, so it cannot change. Use reopen_game to take it offline and edit it.',
    )
  }
  return game
}

async function touch(gameId: string) {
  await env.DB.prepare('UPDATE games SET updated_at = ? WHERE id = ?').bind(Date.now(), gameId).run()
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
      return { id, previewToken }
    }
  }
  throw new CreatorError('Could not find a free id for that title. Try a different title.')
}

export async function updateInfo(creatorId: string, gameId: string, info: Partial<GameInfo>) {
  validateInfo(info)
  await editableGame(creatorId, gameId)
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
}

export async function listOwned(creatorId: string) {
  const { results } = await env.DB.prepare(
    'SELECT id, title, status, review_note, preview_token, updated_at FROM games WHERE creator_id = ? ORDER BY updated_at DESC',
  )
    .bind(creatorId)
    .all<OwnedGameRow>()
  return results
}

export async function listFiles(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  const prefix = objectKey(gameId, '')
  const listed = await env.GAMES.list({ prefix, limit: 1000 })
  return listed.objects.map((o) => ({ path: o.key.slice(prefix.length), bytes: o.size }))
}

/** Returns an error message when adding `bytes` at `path` would break a per-game limit. */
export async function checkGameQuota(gameId: string, path: string, bytes: number): Promise<string | null> {
  const prefix = objectKey(gameId, '')
  const listed = await env.GAMES.list({ prefix, limit: 1000 })
  const others = listed.objects.filter((o) => o.key !== prefix + path)
  if (others.length + 1 > MAX_FILES_PER_GAME) return `A game can have at most ${MAX_FILES_PER_GAME} files.`
  const total = others.reduce((sum, o) => sum + o.size, 0) + bytes
  if (total > MAX_GAME_BYTES) {
    return `This would make the game ${(total / 1024 / 1024).toFixed(1)} MB. A game can be at most ${MAX_GAME_BYTES / 1024 / 1024} MB.`
  }
  return null
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
  await touch(gameId)
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
  await touch(gameId)
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

export async function reopenGame(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  await env.DB.prepare(`UPDATE games SET status = 'draft', updated_at = ? WHERE id = ?`).bind(Date.now(), gameId).run()
}

export async function deleteGame(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  const prefix = objectKey(gameId, '')
  let cursor: string | undefined
  do {
    const listed = await env.GAMES.list({ prefix, cursor, limit: 1000 })
    if (listed.objects.length) await env.GAMES.delete(listed.objects.map((o) => o.key))
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
  await env.DB.prepare('DELETE FROM games WHERE id = ? AND creator_id = ?').bind(gameId, creatorId).run()
}
