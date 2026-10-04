import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import type { Game } from '#/lib/types'
import { versionBase } from '#/lib/site'
import { isGameId } from './limits'
import { allowedByIp } from './rate-limit'

interface GameRow {
  id: string
  title: string
  tagline: string
  how_to_play: string
  emoji: string
  color: string
  category: string
  together: number
  entry: string
  featured: number
  plays: number
  likes: number
  created_at: number
  cover: string | null
  live_version: string
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    howToPlay: row.how_to_play,
    emoji: row.emoji,
    color: row.color,
    category: row.category,
    together: row.together === 1,
    entry: row.entry,
    featured: row.featured === 1,
    plays: row.plays,
    likes: row.likes,
    createdAt: row.created_at,
    url: versionBase(row.live_version),
    cover: row.cover ? versionBase(row.live_version) + row.cover : null,
  }
}

export const listGames = createServerFn({ method: 'GET' }).handler(async () => {
  const { results } = await env.DB.prepare(
    `SELECT id, title, tagline, how_to_play, emoji, color, category, together, entry,
            featured, plays, likes, created_at, cover, live_version
       FROM games WHERE live = 1 AND live_version IS NOT NULL ORDER BY created_at DESC LIMIT 500`,
  ).all<GameRow>()
  return results.map(toGame)
})

const gameId = z.object({ id: z.string().refine(isGameId) })

/** Increments a counter and returns its new value, or null if the game isn't public or the caller is rate-limited. */
async function increment(id: string, column: 'plays' | 'likes') {
  if (!(await allowedByIp(env.LIKE_LIMITER))) return null
  const row = await env.DB.prepare(
    `UPDATE games SET ${column} = ${column} + 1 WHERE id = ? AND live = 1 RETURNING ${column} AS value`,
  )
    .bind(id)
    .first<{ value: number }>()
  return row?.value ?? null
}

export const recordPlay = createServerFn({ method: 'POST' })
  .validator(gameId)
  .handler(({ data }) => increment(data.id, 'plays'))

export const addLike = createServerFn({ method: 'POST' })
  .validator(gameId)
  .handler(({ data }) => increment(data.id, 'likes'))
