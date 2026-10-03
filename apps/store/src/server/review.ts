import { env } from 'cloudflare:workers'
import { sha256Hex } from './crypto'
import { approveVersion, unpublish } from './games-store'
import { MAX_MANIFEST_BYTES, isFilePath } from './limits'
import { MANIFEST_FILE } from './starter'

/**
 * Reviewing decides which shipped games are listed in the store. Games already
 * play at their creators' links; this is only about other families finding them.
 * Used by /admin and by the reviewer MCP endpoint (/mcp/review).
 */

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
}

const COLUMNS = `id, title, tagline, how_to_play, emoji, color, category, together, entry, status, live, pending_info,
                 review_note, review_url, live_url, preview_token, creator_id, updated_at`

/** Games waiting to be listed (oldest first, so nobody waits forever), then the listed ones. */
export async function listForReview() {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM games
      WHERE status = 'review' OR live = 1
      ORDER BY CASE status WHEN 'review' THEN 0 ELSE 1 END,
               CASE status WHEN 'review' THEN updated_at ELSE -updated_at END
      LIMIT 200`,
  ).all<ReviewGame>()
  return results
}

export function findForReview(id: string) {
  return env.DB.prepare(`SELECT ${COLUMNS} FROM games WHERE id = ?`).bind(id).first<ReviewGame>()
}

export type Decision = 'approve' | 'reject' | 'unpublish'

/** Lists the waiting version (approve), turns it down (reject) or takes a listed game out of the store (unpublish). */
export async function decide(id: string, decision: Decision, note: string | null) {
  const game = await env.DB.prepare('SELECT status, live FROM games WHERE id = ?').bind(id).first<{ status: string; live: number }>()
  if (!game) throw new Error(`There is no game "${id}".`)
  if (decision === 'unpublish') {
    if (!game.live) throw new Error('That game is not in the store.')
    return unpublish(id, note)
  }
  if (game.status !== 'review') throw new Error('That game has no version waiting for review (it may have changed in the meantime).')
  if (decision === 'approve') return approveVersion(id)
  // Turning down an update leaves the listed version in the store. Either way the game still plays at its link.
  await env.DB.prepare(
    `UPDATE games SET status = 'rejected', review_note = ?, review_url = NULL, review_manifest = NULL, review_cover = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(note, Date.now(), id)
    .run()
}

/** The files of the version waiting for review, read from bitgames.json after checking it is the one that was shipped. */
async function waitingManifest(id: string) {
  const row = await env.DB.prepare('SELECT review_url, review_manifest FROM games WHERE id = ?')
    .bind(id)
    .first<{ review_url: string | null; review_manifest: string | null }>()
  if (!row?.review_url || !row.review_manifest) throw new Error(`"${id}" has no version waiting for review.`)
  const response = await fetch(row.review_url + MANIFEST_FILE, { cf: { cacheTtl: 0 } })
  const text = await response.text()
  if (!response.ok || text.length > MAX_MANIFEST_BYTES || (await sha256Hex(text)) !== row.review_manifest) {
    throw new Error('The waiting version no longer serves the files that were shipped. Turn it down.')
  }
  return { url: row.review_url, files: (JSON.parse(text) as { files: Record<string, string> }).files }
}

export async function listWaitingFiles(id: string) {
  const { url, files } = await waitingManifest(id)
  return { url, paths: Object.keys(files).sort() }
}

/** Text files a reviewer reads; anything else (models, pictures, sounds) is described by path only. */
const TEXT_FILE = /\.(html|js|mjs|css|json|txt|md|glsl|vert|frag|svg)$/

/** One file of the waiting version as text, checked against bitgames.json so the reviewer reads exactly what was shipped. */
export async function readWaitingFile(id: string, path: string) {
  const { url, files } = await waitingManifest(id)
  const hash = files[path]
  if (!hash || !isFilePath(path)) throw new Error(`The waiting version has no file "${path}".`)
  if (!TEXT_FILE.test(path)) throw new Error(`"${path}" isn't a text file. Open ${url}${path} to look at it.`)
  const body = await (await fetch(url + path, { cf: { cacheTtl: 0 } })).arrayBuffer()
  if ((await sha256Hex(body)) !== hash) throw new Error(`${path} changed since the version was shipped. Turn it down.`)
  return new TextDecoder().decode(body)
}
