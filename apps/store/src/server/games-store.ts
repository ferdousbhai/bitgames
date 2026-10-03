import { env } from 'cloudflare:workers'
import { randomHex, randomToken, sha256Hex } from './crypto'
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
  mb,
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

/** GameInfo field -> games column. */
const INFO_COLUMNS: Record<keyof GameInfo, string> = {
  title: 'title', tagline: 'tagline', howToPlay: 'how_to_play', emoji: 'emoji',
  color: 'color', category: 'category', together: 'together',
}

/** `col = ?` assignments and their values for the fields present in `info`. */
function infoSets(info: Partial<GameInfo>) {
  const sets: string[] = []
  const values: (string | number)[] = []
  for (const [key, column] of Object.entries(INFO_COLUMNS) as [keyof GameInfo, string][]) {
    const value = info[key]
    if (value === undefined) continue
    sets.push(`${column} = ?`)
    values.push(typeof value === 'boolean' ? Number(value) : value)
  }
  return { sets, values }
}

interface OwnedGameRow {
  id: string
  title: string
  live: number
  status: GameStatus
  review_note: string | null
  preview_token: string
  pending_info: string | null
  updated_at: number
}

const OWNED_COLUMNS = 'id, title, live, status, review_note, preview_token, pending_info, updated_at'

/** A published game's draft stays editable: the live copy keeps playing until the changes are approved. */
export const isEditable = (status: string) => status !== 'review'

const COVER_FILES = ['cover.webp', 'cover.jpg', 'cover.png']

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

function assertPath(path: string) {
  const error = checkPath(path)
  if (error) throw new CreatorError(error)
}

async function ownedGame(creatorId: string, gameId: string) {
  const game = await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE id = ? AND creator_id = ?`)
    .bind(gameId, creatorId)
    .first<OwnedGameRow>()
  if (!game) throw new CreatorError(`You have no game with id "${gameId}". Use list_my_games to see your games.`)
  return game
}

async function editableGame(creatorId: string, gameId: string) {
  const game = await ownedGame(creatorId, gameId)
  if (!isEditable(game.status)) {
    throw new CreatorError('This game is waiting for review, so it cannot change. Use reopen_game to take it back and edit it.')
  }
  return game
}

/**
 * The one place a draft change is recorded: bumps updated_at, optionally
 * adjusts the draft's size or details, and sends a published game's draft back
 * to "changed". Sizes change by a difference, applied atomically, so parallel
 * writes can't overwrite each other's totals.
 */
export async function markDraftChanged(
  gameId: string,
  { addBytes, pendingInfo, info }: { addBytes?: number; pendingInfo?: string; info?: Partial<GameInfo> } = {},
) {
  const sets = [`updated_at = ?`, `status = CASE WHEN status = 'public' THEN 'draft' ELSE status END`]
  const values: (string | number)[] = [Date.now()]
  if (info) {
    const changes = infoSets(info)
    sets.push(...changes.sets)
    values.push(...changes.values)
  }
  if (addBytes) {
    sets.push('bytes = MAX(0, bytes + ?)')
    values.push(addBytes)
  }
  if (pendingInfo !== undefined) {
    sets.push('pending_info = ?')
    values.push(pendingInfo)
  }
  await env.DB.prepare(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`).bind(...values, gameId).run()
}

export async function createGame(creatorId: string, info: GameInfo) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE creator_id = ?')
    .bind(creatorId)
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_GAMES_PER_CREATOR) {
    throw new CreatorError(`You can have at most ${MAX_GAMES_PER_CREATOR} games. Delete one with delete_game first.`)
  }

  const now = Date.now()
  const previewToken = randomHex(16)
  const starter = new TextEncoder().encode(STARTER_GAME)
  const base = slugify(info.title)
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = attempt === 0 ? base : `${base}-${randomHex(3)}`
    const result = await env.DB.prepare(
      `INSERT INTO games (id, creator_id, title, tagline, how_to_play, emoji, color, category, together,
                          status, preview_token, bytes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
      .bind(id, creatorId, info.title, info.tagline, info.howToPlay, info.emoji, info.color, info.category,
        info.together ? 1 : 0, previewToken, starter.length, now, now)
      .run()
    if (result.meta.changes === 1) {
      await env.GAMES.put(objectKey(id, 'index.html'), starter, { httpMetadata: { contentType: CONTENT_TYPES.html } })
      return { id, previewToken }
    }
  }
  throw new CreatorError('Could not find a free id for that title. Try a different title.')
}

export async function updateInfo(creatorId: string, gameId: string, info: Partial<GameInfo>) {
  const game = await editableGame(creatorId, gameId)
  if (game.live) {
    // Children keep seeing the reviewed details until these are approved too.
    const pending = { ...(game.pending_info ? JSON.parse(game.pending_info) : {}), ...info }
    await markDraftChanged(gameId, { pendingInfo: JSON.stringify(pending) })
    return 'pending'
  }
  await markDraftChanged(gameId, { info })
  return 'applied'
}

export async function listOwned(creatorId: string) {
  const { results } = await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE creator_id = ? ORDER BY updated_at DESC`)
    .bind(creatorId)
    .all<OwnedGameRow>()
  return results
}

export async function listFiles(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  return listObjects(objectKey(gameId, ''))
}

/** Every object under a prefix (paged), with paths relative to the prefix. */
async function listObjects(prefix: string) {
  const out: { path: string; bytes: number; etag: string }[] = []
  let cursor: string | undefined
  do {
    const listed = await env.GAMES.list({ prefix, cursor, limit: 1000 })
    for (const o of listed.objects) out.push({ path: o.key.slice(prefix.length), bytes: o.size, etag: o.etag })
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
  return out
}

/**
 * Checks that putting `bytes` at `path` keeps the game and its creator within
 * their limits, and returns how much that grows the game (negative if it shrinks).
 */
export async function checkGameQuota(gameId: string, path: string, bytes: number): Promise<number> {
  const [objects, row] = await Promise.all([
    listObjects(objectKey(gameId, '')),
    env.DB.prepare(
      `SELECT COALESCE(SUM(bytes), 0) AS other FROM games
        WHERE creator_id = (SELECT creator_id FROM games WHERE id = ?) AND id != ?`,
    )
      .bind(gameId, gameId)
      .first<{ other: number }>(),
  ])
  const others = objects.filter((o) => o.path !== path)
  const previous = objects.find((o) => o.path === path)?.bytes ?? 0
  if (others.length + 1 > MAX_FILES_PER_GAME) throw new CreatorError(`A game can have at most ${MAX_FILES_PER_GAME} files.`)
  const gameTotal = others.reduce((sum, o) => sum + o.bytes, 0) + bytes
  if (gameTotal > MAX_GAME_BYTES) {
    throw new CreatorError(`This would make the game ${mb(gameTotal)}. A game can be at most ${mb(MAX_GAME_BYTES)}.`)
  }
  const creatorTotal = (row?.other ?? 0) + gameTotal
  if (creatorTotal > MAX_CREATOR_BYTES) {
    throw new CreatorError(
      `This would bring all your games to ${mb(creatorTotal)}. Each creator can store up to ${mb(MAX_CREATOR_BYTES)}; delete files or games you don't need.`,
    )
  }
  return bytes - previous
}

async function deletePrefix(prefix: string) {
  const keys = (await listObjects(prefix)).map((o) => prefix + o.path)
  for (let i = 0; i < keys.length; i += 1000) await env.GAMES.delete(keys.slice(i, i + 1000))
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function inPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Approval: copies the draft files over the live copy, removes live files the
 * draft no longer has, applies any pending details and puts the game in the store.
 */
export async function publishDraft(gameId: string) {
  const [draft, live, row] = await Promise.all([
    listObjects(objectKey(gameId, '')),
    listObjects(liveKey(gameId, '')),
    env.DB.prepare('SELECT pending_info FROM games WHERE id = ?').bind(gameId).first<{ pending_info: string | null }>(),
  ])
  // R2 etags are content hashes, so files the live copy already has are skipped.
  const liveEtags = new Map(live.map((o) => [o.path, o.etag]))
  const changed = draft.filter((o) => liveEtags.get(o.path) !== o.etag)
  await inPool(changed, 8, async ({ path }) => {
    const object = await env.GAMES.get(objectKey(gameId, path))
    // Buffered: R2 needs a known length, and files are capped at 10 MB.
    if (object) await env.GAMES.put(liveKey(gameId, path), await object.arrayBuffer(), { httpMetadata: object.httpMetadata })
  })
  const keep = new Set(draft.map((o) => o.path))
  const stale = live.filter((o) => !keep.has(o.path)).map((o) => liveKey(gameId, o.path))
  if (stale.length) await env.GAMES.delete(stale)

  const cover = COVER_FILES.find((name) => keep.has(name)) ?? null
  const { sets, values } = infoSets(row?.pending_info ? JSON.parse(row.pending_info) : {})
  await env.DB.prepare(
    `UPDATE games SET live = 1, status = 'public', review_note = NULL, pending_info = NULL, cover = ?, updated_at = ?
       ${sets.length ? ', ' + sets.join(', ') : ''} WHERE id = ?`,
  )
    .bind(cover, Date.now(), ...values, gameId)
    .run()
}

/** Takes a game out of the store: the live copy goes, the draft stays with the creator. */
export async function unpublish(gameId: string, note: string | null) {
  await deletePrefix(liveKey(gameId, ''))
  await env.DB.prepare(`UPDATE games SET live = 0, status = 'rejected', review_note = ?, updated_at = ? WHERE id = ?`)
    .bind(note, Date.now(), gameId)
    .run()
}

export async function writeTextFile(creatorId: string, gameId: string, path: string, content: string) {
  assertPath(path)
  if (!TEXT_EXTENSIONS.has(extensionOf(path))) {
    throw new CreatorError(`.${extensionOf(path)} is a binary file. Upload it with get_upload_url instead.`)
  }
  const bytes = new TextEncoder().encode(content)
  if (bytes.length > MAX_TEXT_FILE_BYTES) {
    throw new CreatorError(`Text files can be at most ${mb(MAX_TEXT_FILE_BYTES)}. Split the code into modules.`)
  }
  await editableGame(creatorId, gameId)
  const growth = await checkGameQuota(gameId, path, bytes.length)
  await env.GAMES.put(objectKey(gameId, path), bytes, { httpMetadata: { contentType: CONTENT_TYPES[extensionOf(path)] } })
  await markDraftChanged(gameId, { addBytes: growth })
  return bytes.length
}

export async function readTextFile(creatorId: string, gameId: string, path: string) {
  assertPath(path)
  if (!TEXT_EXTENSIONS.has(extensionOf(path))) throw new CreatorError('Only text files can be read back.')
  await ownedGame(creatorId, gameId)
  const object = await env.GAMES.get(objectKey(gameId, path))
  if (!object) throw new CreatorError(`There is no file "${path}". Use list_files to see the files.`)
  return object.text()
}

export async function deleteFile(creatorId: string, gameId: string, path: string) {
  assertPath(path)
  await editableGame(creatorId, gameId)
  const key = objectKey(gameId, path)
  const existing = await env.GAMES.head(key)
  await env.GAMES.delete(key)
  await markDraftChanged(gameId, { addBytes: -(existing?.size ?? 0) })
}

export async function createUploadUrl(creatorId: string, gameId: string, path: string, origin: string) {
  assertPath(path)
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
  await Promise.all([deletePrefix(objectKey(gameId, '')), deletePrefix(liveKey(gameId, ''))])
  await env.DB.prepare('DELETE FROM games WHERE id = ? AND creator_id = ?').bind(gameId, creatorId).run()
}
