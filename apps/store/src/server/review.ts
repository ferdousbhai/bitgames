import { env } from 'cloudflare:workers'
import { approveVersion, unpublish } from './games-store'
import { CreatorError } from './errors'
import { findVersion, readVersionFile, versionBase } from './game-assets'

export interface ReviewGame {
  id: string
  title: string
  tagline: string
  how_to_play: string
  emoji: string
  color: string
  category: string
  together: number
  status: string
  live: number
  pending_info: string | null
  review_note: string | null
  review_url: string | null
  live_url: string | null
  preview_token: string
  entry: string
  creator_id: string | null
  updated_at: number
  review_version: string | null
  live_version: string | null
  revision: string
}
const COLUMNS = `id, title, tagline, how_to_play, emoji, color, category, together, entry, status, live, pending_info,
  review_note, review_url, live_url, preview_token, creator_id, updated_at, review_version, live_version, revision`
export async function listForReview(offset = 0, limit = 200, scope: 'all' | 'waiting' | 'listed' = 'all') {
  const filter = scope === 'waiting' ? "status = 'review'" : scope === 'listed' ? 'live = 1' : "status = 'review' OR live = 1"
  return (await env.DB.prepare(`SELECT ${COLUMNS} FROM games WHERE ${filter}
    ORDER BY CASE status WHEN 'review' THEN 0 ELSE 1 END, updated_at, id LIMIT ? OFFSET ?`).bind(limit, offset).all<ReviewGame>()).results
}
export function findForReview(id: string) { return env.DB.prepare(`SELECT ${COLUMNS} FROM games WHERE id = ?`).bind(id).first<ReviewGame>() }
/** Read a decision receipt even when rejection removed the game from the queue. */
export async function reviewStatus(id: string, versionId?: string) {
  const game = await findForReview(id)
  if (!game) throw new CreatorError('There is no game with that id.')
  const version = versionId ? await findVersion(versionId, id) : undefined
  return {
    gameId: id, status: game.status, listed: Boolean(game.live), revision: game.revision,
    submissionId: game.status === 'review' ? game.review_version : null,
    liveVersion: game.live ? game.live_version : null, reviewNote: game.review_note,
    ...(version ? { version: { id: version.id, decision: version.decision, reviewNote: version.review_note } } : {}),
  }
}
export type Decision = 'approve' | 'reject' | 'unpublish'
export async function decide(id: string, decision: Decision, note: string | null, revision: string, submissionId?: string) {
  if (decision === 'unpublish') return unpublish(id, note, revision)
  if (!submissionId) throw new CreatorError('Read the submission first and supply its submissionId.')
  if (decision === 'approve') return approveVersion(id, submissionId, revision)
  const newRevision = crypto.randomUUID()
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE games SET status = 'rejected', review_note = ?, review_version = NULL, review_url = NULL,
      review_manifest = NULL, review_cover = NULL, updated_at = ?, revision = ? WHERE id = ? AND status = 'review' AND review_version = ? AND revision = ?`)
      .bind(note, Date.now(), newRevision, id, submissionId, revision),
    env.DB.prepare("UPDATE game_versions SET decision = 'rejected', review_note = ? WHERE id = ? AND EXISTS (SELECT 1 FROM games WHERE id = ? AND revision = ?)").bind(note, submissionId, id, newRevision),
  ])
  if (results[0]!.meta.changes !== 1) throw new CreatorError('The submission changed. Read it again before deciding.')
}
export async function inspectForReview(id: string, origin: string, target: 'submission' | 'listed' = 'submission') {
  const game = await findForReview(id)
  if (!game) throw new CreatorError('There is no game with that id.')
  const versionId = target === 'submission' ? game.status === 'review' && game.review_version : game.live && game.live_version
  if (!versionId) throw new CreatorError(target === 'submission' ? 'This game has no waiting submission.' : 'This game is not listed.')
  const version = await findVersion(versionId, id)
  const playback = (id: string) => ({ versionId: id, playUrl: `${origin}/try/${game.preview_token}?submission=${id}`, playbackBase: origin + versionBase(id) })
  return {
    gameId: id, target, revision: game.revision, ...playback(versionId),
    ...(target === 'submission' ? { submissionId: versionId } : {}),
    info: JSON.parse(version.info_json) as Record<string, unknown>,
    files: Object.keys((JSON.parse(version.manifest_json) as { files: Record<string, string> }).files).sort(),
    reviewNote: game.review_note,
    listedVersion: game.live && game.live_version ? playback(game.live_version) : null,
  }
}
const TEXT_FILE = /\.(html|js|mjs|css|json|txt|md|glsl|vert|frag|svg)$/
export async function readReviewFile(id: string, versionId: string, path: string, offset = 0, length = 64_000) {
  if (!TEXT_FILE.test(path)) throw new CreatorError('This is a binary file. Inspect it using the supplied playback base URL.')
  const text = new TextDecoder().decode(await readVersionFile(await findVersion(versionId, id), path))
  return { text: text.slice(offset, offset + length), offset, totalCharacters: text.length, nextOffset: offset + length < text.length ? offset + length : null }
}
