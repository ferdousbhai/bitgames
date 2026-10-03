import { env } from 'cloudflare:workers'
import { randomHex, sha256Hex } from './crypto'
import { MAX_FILES_PER_GAME, MAX_GAMES_PER_CREATOR, MAX_GAME_BYTES, MAX_MANIFEST_BYTES, isFilePath, mb, parseVersionUrl } from './limits'
import { MANIFEST_FILE } from './starter'

/** Thrown for anything the creator can fix; the message is shown to their agent. */
export class CreatorError extends Error {}

/**
 * The state of the creator's latest submission:
 * - draft: nothing waiting (never submitted, withdrawn, or details changed since)
 * - review: a version is waiting for an adult reviewer
 * - public: the store has the latest version
 * - rejected: sent back, or taken down; see review_note
 * Whether a game is in the store at all is the separate `live` flag.
 */
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
  live_url: string | null
  review_url: string | null
  updated_at: number
}

const OWNED_COLUMNS = 'id, title, live, status, review_note, preview_token, pending_info, live_url, review_url, updated_at'

const COVER_FILES = ['cover.webp', 'cover.jpg', 'cover.png']

/** The creator's private play page: their submitted version inside BitGames, so "play together" works too. */
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

async function ownedGame(creatorId: string, gameId: string) {
  const game = await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE id = ? AND creator_id = ?`)
    .bind(gameId, creatorId)
    .first<OwnedGameRow>()
  if (!game) throw new CreatorError(`You have no game with id "${gameId}". Use list_my_games to see your games.`)
  return game
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
  const base = slugify(info.title)
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = attempt === 0 ? base : `${base}-${randomHex(3)}`
    const result = await env.DB.prepare(
      `INSERT INTO games (id, creator_id, title, tagline, how_to_play, emoji, color, category, together,
                          status, preview_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
      .bind(id, creatorId, info.title, info.tagline, info.howToPlay, info.emoji, info.color, info.category,
        info.together ? 1 : 0, previewToken, now, now)
      .run()
    if (result.meta.changes === 1) return { id, previewToken }
  }
  throw new CreatorError('Could not find a free id for that title. Try a different title.')
}

/**
 * Changes a game's details. Children keep seeing a live game's reviewed
 * details until the changes are approved along with the next version.
 */
export async function updateInfo(creatorId: string, gameId: string, info: Partial<GameInfo>) {
  const game = await ownedGame(creatorId, gameId)
  const now = Date.now()
  if (game.live) {
    const pending = JSON.stringify({ ...(game.pending_info ? JSON.parse(game.pending_info) : {}), ...info })
    await env.DB.prepare(
      `UPDATE games SET pending_info = ?, status = CASE WHEN status = 'public' THEN 'draft' ELSE status END, updated_at = ? WHERE id = ?`,
    )
      .bind(pending, now, gameId)
      .run()
    return 'pending'
  }
  const { sets, values } = infoSets(info)
  if (sets.length) await env.DB.prepare(`UPDATE games SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...values, now, gameId).run()
  return 'applied'
}

export async function listOwned(creatorId: string) {
  const { results } = await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE creator_id = ? ORDER BY updated_at DESC`)
    .bind(creatorId)
    .all<OwnedGameRow>()
  return results
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function inPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

interface CheckedVersion {
  url: string
  immutable: boolean
  /** SHA-256 of the version's bitgames.json. */
  manifest: string
  cover: string | null
  files: number
  bytes: number
}

/**
 * Fetches a deployed version and checks it is a BitGames game that serves
 * exactly the files its bitgames.json lists: every file is downloaded and
 * hashed. Throws a CreatorError explaining what to fix.
 */
export async function checkVersion(url: string): Promise<CheckedVersion> {
  const version = parseVersionUrl(url)
  if (!version) {
    throw new CreatorError(
      'Submit the version preview URL that `cf deploy` gives each deploy: https://<version>-<worker>.<account>.workers.dev/ (the first 8 characters of the "Current Version ID"). Check that previewUrls is true in cloudflare.config.ts.',
    )
  }
  const get = async (path: string) => {
    let response: Response
    try {
      // Static assets redirect within the site, e.g. /index.html to /.
      response = await fetch(version.base + path, { cf: { cacheTtl: 0 } })
    } catch {
      throw new CreatorError(`Could not reach ${version.base}${path}.`)
    }
    if (!response.url.startsWith(version.base)) throw new CreatorError(`${version.base}${path} redirects to another site.`)
    if (response.status !== 200) throw new CreatorError(`${version.base}${path} answered ${response.status}; it should be a file of the game.`)
    return response
  }

  const manifestText = await (await get(MANIFEST_FILE)).text()
  if (manifestText.length > MAX_MANIFEST_BYTES) throw new CreatorError(`${MANIFEST_FILE} is too big.`)
  let files: Record<string, string>
  try {
    files = (JSON.parse(manifestText) as { files: Record<string, string> }).files
    if (typeof files !== 'object' || files === null) throw new Error()
  } catch {
    throw new CreatorError(`${MANIFEST_FILE} must look like {"files": {"index.html": "<sha256>", ...}}. Run \`node bitgames.mjs\` before deploying.`)
  }
  const entries = Object.entries(files)
  if (!files['index.html']) throw new CreatorError(`The game needs an index.html in public/, listed in ${MANIFEST_FILE}.`)
  if (entries.length > MAX_FILES_PER_GAME) throw new CreatorError(`A game can have at most ${MAX_FILES_PER_GAME} files; this one lists ${entries.length}.`)
  for (const [path, hash] of entries) {
    if (!isFilePath(path) || !/^[0-9a-f]{64}$/.test(hash)) throw new CreatorError(`${MANIFEST_FILE} has an invalid entry: ${path}.`)
  }

  let bytes = 0
  await inPool(entries, 6, async ([path, hash]) => {
    const response = await get(path)
    if (path === 'index.html') {
      if (!response.headers.has('allow-csp-from')) {
        throw new CreatorError('index.html is served without the Allow-CSP-From header, so BitGames cannot play it. Use the public/_headers file from get_starter_project.')
      }
      if (response.headers.get('access-control-allow-origin') !== '*') {
        throw new CreatorError('The game is served without Access-Control-Allow-Origin: *. Use the public/_headers file from get_starter_project.')
      }
    }
    const body = await response.arrayBuffer()
    bytes += body.byteLength
    if (bytes > MAX_GAME_BYTES) throw new CreatorError(`A game can be at most ${mb(MAX_GAME_BYTES)}.`)
    if ((await sha256Hex(body)) !== hash) {
      throw new CreatorError(`${path} doesn't match ${MANIFEST_FILE}. Run \`node bitgames.mjs\` and deploy again (the deploy script does both).`)
    }
  })

  return {
    url: version.base,
    immutable: version.immutable,
    manifest: await sha256Hex(manifestText),
    cover: COVER_FILES.find((name) => name in files) ?? null,
    files: entries.length,
    bytes,
  }
}

/** Checks a deployed version and puts it in the review queue (replacing any version already waiting). */
export async function submitVersion(creatorId: string, gameId: string, url: string) {
  await ownedGame(creatorId, gameId)
  const version = await checkVersion(url)
  await env.DB.prepare(
    `UPDATE games SET review_url = ?, review_manifest = ?, review_cover = ?, status = 'review', review_note = NULL, updated_at = ?
      WHERE id = ?`,
  )
    .bind(version.url, version.manifest, version.cover, Date.now(), gameId)
    .run()
  return version
}

/** Withdraws the version waiting for review. */
export async function withdrawVersion(creatorId: string, gameId: string) {
  const game = await ownedGame(creatorId, gameId)
  if (game.status !== 'review') throw new CreatorError('Nothing of this game is waiting for review.')
  await env.DB.prepare(`UPDATE games SET status = 'draft', review_url = NULL, review_manifest = NULL, review_cover = NULL, updated_at = ? WHERE id = ?`)
    .bind(Date.now(), gameId)
    .run()
}

export async function deleteGame(creatorId: string, gameId: string) {
  await ownedGame(creatorId, gameId)
  await env.DB.prepare('DELETE FROM games WHERE id = ? AND creator_id = ?').bind(gameId, creatorId).run()
}

/**
 * Approval: checks the submitted version again (it must still serve the files
 * that were submitted), pins it as the live version and applies any pending details.
 */
export async function approveVersion(gameId: string) {
  const row = await env.DB.prepare('SELECT review_url, review_manifest, pending_info FROM games WHERE id = ?')
    .bind(gameId)
    .first<{ review_url: string | null; review_manifest: string | null; pending_info: string | null }>()
  if (!row?.review_url) throw new Error('That game has no version waiting.')
  const version = await checkVersion(row.review_url)
  if (version.manifest !== row.review_manifest) throw new Error('The submitted version changed since it was submitted. Send it back.')
  const { sets, values } = infoSets(row.pending_info ? JSON.parse(row.pending_info) : {})
  const now = Date.now()
  await env.DB.prepare(
    `UPDATE games SET live = 1, status = 'public', live_url = review_url, live_manifest = review_manifest, cover = review_cover,
            review_url = NULL, review_manifest = NULL, review_cover = NULL, review_note = NULL, pending_info = NULL,
            verified_at = ?, updated_at = ?${sets.length ? ', ' + sets.join(', ') : ''}
      WHERE id = ?`,
  )
    .bind(now, now, ...values, gameId)
    .run()
}

/** Takes a game out of the store. The creator can submit a new version. */
export async function unpublish(gameId: string, note: string | null) {
  await env.DB.prepare(`UPDATE games SET live = 0, status = 'rejected', review_note = ?, updated_at = ? WHERE id = ?`)
    .bind(note, Date.now(), gameId)
    .run()
}

/**
 * Scheduled: re-checks the live game checked longest ago. Only versions whose
 * URL could be an alias (see parseVersionUrl) can change, and a game whose
 * files changed is taken down. Unreachable versions are left for the next run.
 */
export async function recheckLive() {
  // live_url is "https://<version>-...": its 9th character is the version's first.
  const game = await env.DB.prepare(
    `SELECT id, live_url, live_manifest FROM games
      WHERE live = 1 AND live_url IS NOT NULL AND substr(live_url, 9, 1) NOT BETWEEN '0' AND '9'
      ORDER BY verified_at LIMIT 1`,
  ).first<{ id: string; live_url: string; live_manifest: string }>()
  if (!game) return
  let changed: boolean
  try {
    changed = (await checkVersion(game.live_url)).manifest !== game.live_manifest
  } catch (error) {
    // A file that no longer matches is a change; a network failure is not.
    changed = error instanceof CreatorError && !error.message.startsWith('Could not reach')
  }
  if (changed) {
    await unpublish(game.id, 'The files of the approved version changed, so the game was taken out of the store. Deploy and submit a new version.')
  }
  await env.DB.prepare('UPDATE games SET verified_at = ? WHERE id = ?').bind(Date.now(), game.id).run()
}
