import { env } from 'cloudflare:workers'

interface PreviewGame {
  id: string
  title: string
  emoji: string
  howToPlay: string
  entry: string
  status: string
  /** The version waiting for review, else the live one; null before anything is submitted. */
  url: string | null
}

/** The game behind a preview token. */
export function findPreviewGame(token: string) {
  return env.DB.prepare(
    `SELECT id, title, emoji, how_to_play AS howToPlay, entry, status, COALESCE(review_url, live_url) AS url
       FROM games WHERE preview_token = ?`,
  )
    .bind(token)
    .first<PreviewGame>()
}
