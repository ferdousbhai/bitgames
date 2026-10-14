import { env } from 'cloudflare:workers'
import { versionBase } from '../lib/site'
import { findVersion } from './game-assets'
import type { GameInfo } from './games-store'

/**
 * The game behind a private link, whether or not it is in the store. A pinned
 * submission is playable even if a newer version has been shipped.
 */
export async function findPreviewGame(token: string, submissionId?: string) {
  const game = await env.DB.prepare(`SELECT id, title, tagline, emoji, how_to_play AS howToPlay, entry, status, play_version, live_version, live FROM games WHERE preview_token = ?`)
    .bind(token).first<{ id: string; title: string; tagline: string; emoji: string; howToPlay: string; entry: string; status: string; play_version: string | null; live_version: string | null; live: number }>()
  if (!game) return null
  const versionId = submissionId ?? game.play_version ?? game.live_version
  if (!versionId) return { ...game, url: null, cover: null }
  const version = await findVersion(versionId, game.id)
  const info = JSON.parse(version.info_json) as GameInfo
  const url = versionBase(versionId)
  return { ...game, title: info.title, tagline: info.tagline, emoji: info.emoji, howToPlay: info.howToPlay, url, cover: version.cover ? url + version.cover : null }
}
