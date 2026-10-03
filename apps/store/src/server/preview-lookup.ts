import { env } from 'cloudflare:workers'

interface PreviewGame {
  id: string
  title: string
  emoji: string
  howToPlay: string
  entry: string
  status: string
  /** 1 when the store lists the game. */
  live: number
  /** The latest shipped version; null before anything is shipped. */
  url: string | null
}

/** The game behind a preview token. */
export function findPreviewGame(token: string) {
  return env.DB.prepare(
    `SELECT id, title, emoji, how_to_play AS howToPlay, entry, status, COALESCE(play_url, live_url) AS url, live
       FROM games WHERE preview_token = ?`,
  )
    .bind(token)
    .first<PreviewGame>()
}
