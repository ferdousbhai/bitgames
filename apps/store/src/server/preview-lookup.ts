import { env } from 'cloudflare:workers'
import { DRAFT_PREVIEW_TTL_MS } from './limits'

interface PreviewGame {
  id: string
  title: string
  emoji: string
  howToPlay: string
  entry: string
  status: string
}

/**
 * The game behind a preview token. Unreviewed drafts stop previewing a week
 * after their last change, so a draft can't be used as long-lived file
 * hosting. Drafts under review, or identical to the reviewed live copy
 * (status 'public'), always preview.
 */
export function findPreviewGame(token: string) {
  return env.DB.prepare(
    `SELECT id, title, emoji, how_to_play AS howToPlay, entry, status FROM games
      WHERE preview_token = ? AND (status IN ('review', 'public') OR updated_at > ?)`,
  )
    .bind(token, Date.now() - DRAFT_PREVIEW_TTL_MS)
    .first<PreviewGame>()
}
