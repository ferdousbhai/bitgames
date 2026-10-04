import { env } from 'cloudflare:workers'
import { randomHex } from './crypto'
import { MAX_GAMES_PER_CREATOR } from './limits'
import { CreatorError, UnreachableError } from './errors'
import { checkVersion } from './versions'
import { findVersion, versionBase, type StoredVersion } from './game-assets'

export { CreatorError } from './errors'
export { checkVersion } from './versions'
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
const INFO_COLUMNS: Record<keyof GameInfo, string> = {
  title: 'title', tagline: 'tagline', howToPlay: 'how_to_play', emoji: 'emoji', color: 'color', category: 'category', together: 'together',
}
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
export interface OwnedGameRow {
  id: string
  creator_id: string | null
  title: string
  tagline: string
  how_to_play: string
  emoji: string
  color: string
  category: string
  together: number
  live: number
  status: GameStatus
  review_note: string | null
  preview_token: string
  pending_info: string | null
  live_url: string | null
  review_url: string | null
  play_url: string | null
  play_version: string | null
  review_version: string | null
  live_version: string | null
  revision: string
  updated_at: number
}
const OWNED_COLUMNS = `id, creator_id, title, tagline, how_to_play, emoji, color, category, together, live, status,
  review_note, preview_token, pending_info, live_url, review_url, play_url, play_version, review_version, live_version, revision, updated_at`
export function previewUrl(origin: string, token: string) { return `${origin}/try/${token}` }
export async function ownedGame(creatorId: string, gameId: string) {
  const game = await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE id = ? AND creator_id = ?`).bind(gameId, creatorId).first<OwnedGameRow>()
  if (!game) throw new CreatorError('You do not own that game. Read get_context to see your games.')
  return game
}
export function gameInfo(game: OwnedGameRow): GameInfo {
  return { title: game.title, tagline: game.tagline, howToPlay: game.how_to_play, emoji: game.emoji, color: game.color, category: game.category, together: Boolean(game.together), ...(game.pending_info ? JSON.parse(game.pending_info) : {}) }
}
function changed() { return new CreatorError('The game changed during this request. Read get_context and try again.') }
function requireChange(result: D1Result) { if (result.meta.changes !== 1) throw changed() }
function slugify(title: string) {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39).replace(/-+$/, '') || 'game'
}
export async function createGame(creatorId: string, info: GameInfo) {
  const now = Date.now()
  const previewToken = randomHex(16)
  const base = slugify(info.title)
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE creator_id = ?').bind(creatorId).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_GAMES_PER_CREATOR) throw new CreatorError(`You can have at most ${MAX_GAMES_PER_CREATOR} games.`)
    const id = attempt === 0 ? base : `${base}-${randomHex(3)}`
    const result = await env.DB.prepare(`INSERT INTO games (id, creator_id, title, tagline, how_to_play, emoji, color, category, together, status, preview_token, created_at, updated_at, revision)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM games WHERE creator_id = ?) < ? ON CONFLICT (id) DO NOTHING`)
      .bind(id, creatorId, info.title, info.tagline, info.howToPlay, info.emoji, info.color, info.category, Number(info.together), previewToken, now, now, crypto.randomUUID(), creatorId, MAX_GAMES_PER_CREATOR).run()
    if (result.meta.changes === 1) return { id, previewToken }
  }
  throw new CreatorError('Could not register this title. Try a different title.')
}
/** Editing metadata invalidates any waiting review, including its previously inspected metadata. */
export async function updateInfo(creatorId: string, gameId: string, info: Partial<GameInfo>) {
  const game = await ownedGame(creatorId, gameId)
  if (!infoSets(info).sets.length) return
  // A takedown can leave edits pending from when the game was listed. Apply
  // those edits before the latest changes, so stale pending values cannot win.
  const { sets, values } = infoSets(!game.live && game.pending_info ? { ...gameInfo(game), ...info } : info)
  const pending = JSON.stringify({ ...(game.pending_info ? JSON.parse(game.pending_info) : {}), ...info })
  const update = game.live ? 'pending_info = ?' : `${sets.join(', ')}, pending_info = NULL`
  const result = await env.DB.prepare(`UPDATE games SET ${update}, status = 'draft', review_version = NULL, review_url = NULL, review_manifest = NULL, review_cover = NULL, revision = ?, updated_at = ? WHERE id = ? AND creator_id = ? AND revision = ?`)
    .bind(...(game.live ? [pending] : values), crypto.randomUUID(), Date.now(), gameId, creatorId, game.revision).run()
  requireChange(result)
  if (game.review_version) await env.DB.prepare("UPDATE game_versions SET decision = 'withdrawn' WHERE id = ? AND decision = 'pending'").bind(game.review_version).run()
}
export async function listOwned(creatorId: string) {
  return (await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE creator_id = ? ORDER BY updated_at DESC`).bind(creatorId).all<OwnedGameRow>()).results
}
export async function versionHistory(creatorId: string, gameId: string, beforeVersionId?: string) {
  await ownedGame(creatorId, gameId)
  const before = beforeVersionId ? await findVersion(beforeVersionId, gameId) : undefined
  const predicate = before ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : ''
  const params = before ? [gameId, before.created_at, before.created_at, before.id] : [gameId]
  const { results } = await env.DB.prepare(`SELECT id, upstream_url, file_count, bytes, created_at, decision, review_note
    FROM game_versions WHERE game_id = ?${predicate} ORDER BY created_at DESC, id DESC LIMIT 101`)
    .bind(...params).all<Pick<StoredVersion, 'id' | 'upstream_url' | 'file_count' | 'bytes' | 'created_at' | 'decision' | 'review_note'>>()
  const versions = results.slice(0, 100)
  return { versions, nextHistoryCursor: results.length > 100 ? versions.at(-1)!.id : null }
}
/** Republish an old version by its id, or validate a deployment without changing the game. */
export async function shipVersion(creatorId: string, gameId: string, source: { url?: string; versionId?: string; checkOnly?: boolean }) {
  const game = await ownedGame(creatorId, gameId)
  const old = source.versionId ? await findVersion(source.versionId, gameId) : undefined
  const version = await checkVersion(old?.upstream_url ?? source.url!)
  if (old && version.manifest !== old.manifest_hash) throw new CreatorError('The previous deployment changed; it cannot be restored. Deploy the original files again.')
  if (source.checkOnly) return { ...version, checked: true }
  const id = crypto.randomUUID()
  const now = Date.now()
  const revision = crypto.randomUUID()
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO game_versions (id, game_id, upstream_url, manifest_hash, manifest_json, info_json, cover, file_count, bytes, created_at)
      SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM games WHERE id = ? AND creator_id = ? AND revision = ?`)
      .bind(id, version.url, version.manifest, version.manifestJson, JSON.stringify(gameInfo(game)), version.cover, version.files, version.bytes, now, gameId, creatorId, game.revision),
    env.DB.prepare(`UPDATE games SET play_version = ?, review_version = ?, play_url = ?, review_url = ?, review_manifest = ?, review_cover = ?, status = 'review', review_note = NULL, revision = ?, updated_at = ? WHERE id = ? AND creator_id = ? AND revision = ?`)
      .bind(id, id, version.url, version.url, version.manifest, version.cover, revision, now, gameId, creatorId, game.revision),
  ])
  requireChange(results[1]!)
  if (game.review_version) await env.DB.prepare("UPDATE game_versions SET decision = 'withdrawn' WHERE id = ? AND decision = 'pending'").bind(game.review_version).run()
  return { checked: false, versionId: id, url: version.url, files: version.files, bytes: version.bytes, previewToken: game.preview_token }
}
export async function withdrawVersion(creatorId: string, gameId: string, submissionId: string) {
  const game = await ownedGame(creatorId, gameId)
  if (game.status !== 'review' || game.review_version !== submissionId) throw changed()
  requireChange(await env.DB.prepare(`UPDATE games SET status = 'draft', review_version = NULL, review_url = NULL, review_manifest = NULL, review_cover = NULL, revision = ?, updated_at = ? WHERE id = ? AND creator_id = ? AND revision = ?`)
    .bind(crypto.randomUUID(), Date.now(), gameId, creatorId, game.revision).run())
  await env.DB.prepare("UPDATE game_versions SET decision = 'withdrawn' WHERE id = ? AND decision = 'pending'").bind(game.review_version).run()
}
export async function deleteGame(creatorId: string, gameId: string) {
  const game = await ownedGame(creatorId, gameId)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM game_versions WHERE game_id = ? AND EXISTS (SELECT 1 FROM games WHERE id = ? AND creator_id = ? AND revision = ?)').bind(gameId, gameId, creatorId, game.revision),
    env.DB.prepare('DELETE FROM games WHERE id = ? AND creator_id = ? AND revision = ?').bind(gameId, creatorId, game.revision),
  ]).then(results => requireChange(results[1]!))
}
/** Approval compares both the inspected shipment and the exact metadata revision. */
export async function approveVersion(gameId: string, submissionId: string, revision: string) {
  const game = await env.DB.prepare(`SELECT ${OWNED_COLUMNS} FROM games WHERE id = ? AND status = 'review' AND review_version = ? AND revision = ?`).bind(gameId, submissionId, revision).first<OwnedGameRow>()
  if (!game) throw changed()
  const stored = await findVersion(submissionId, gameId)
  const version = await checkVersion(stored.upstream_url)
  if (version.manifest !== stored.manifest_hash) throw new CreatorError('The submitted deployment changed. Send it back.')
  const { sets, values } = infoSets(JSON.parse(stored.info_json))
  const newRevision = crypto.randomUUID()
  const now = Date.now()
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE games SET live = 1, status = 'public', live_version = ?, live_url = ?, live_manifest = ?, cover = ?, review_version = NULL, review_url = NULL, review_manifest = NULL, review_cover = NULL, review_note = NULL, pending_info = NULL, verified_at = ?, updated_at = ?, revision = ?, ${sets.join(', ')} WHERE id = ? AND status = 'review' AND review_version = ? AND revision = ?`)
      .bind(submissionId, stored.upstream_url, stored.manifest_hash, stored.cover, now, now, newRevision, ...values, gameId, submissionId, revision),
    env.DB.prepare("UPDATE game_versions SET decision = 'approved', review_note = NULL WHERE id = ? AND EXISTS (SELECT 1 FROM games WHERE id = ? AND revision = ?)").bind(submissionId, gameId, newRevision),
  ])
  requireChange(results[0]!)
}
export async function unpublish(gameId: string, note: string | null, revision: string) {
  requireChange(await env.DB.prepare("UPDATE games SET live = 0, status = CASE WHEN status = 'review' THEN status ELSE 'rejected' END, review_note = ?, updated_at = ?, revision = ? WHERE id = ? AND live = 1 AND revision = ?")
    .bind(note, Date.now(), crypto.randomUUID(), gameId, revision).run())
}
/** Check all deployments, including digit-prefixed versions with dynamic Worker code. */
export async function recheckLive() {
  const game = await env.DB.prepare('SELECT id, live_url, live_manifest, revision FROM games WHERE live = 1 AND live_url IS NOT NULL ORDER BY verified_at LIMIT 1').first<{ id: string; live_url: string; live_manifest: string; revision: string }>()
  if (!game) return
  try {
    if ((await checkVersion(game.live_url)).manifest !== game.live_manifest) throw new CreatorError('The deployment changed.')
  } catch (error) {
    if (error instanceof CreatorError && !(error instanceof UnreachableError)) await unpublish(game.id, 'The approved files changed. Deploy and publish a new version.', game.revision)
  }
  await env.DB.prepare('UPDATE games SET verified_at = ? WHERE id = ? AND live_url = ?').bind(Date.now(), game.id, game.live_url).run()
}
export async function describeOwned(game: OwnedGameRow, origin: string) {
  return { gameId: game.id, info: gameInfo(game), listed: Boolean(game.live), status: game.status, revision: game.revision, playUrl: previewUrl(origin, game.preview_token), storeUrl: game.live ? `${origin}/game/${game.id}` : null, reviewNote: game.review_note, playVersion: game.play_version, reviewVersion: game.review_version, liveVersion: game.live_version, playbackBase: game.play_version ? versionBase(game.play_version) : null }
}
