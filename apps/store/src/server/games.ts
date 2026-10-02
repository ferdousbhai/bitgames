import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import type { Game } from '#/lib/types'

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
  }
}

export const listGames = createServerFn({ method: 'GET' }).handler(async () => {
  const { results } = await env.DB.prepare(
    `SELECT id, title, tagline, how_to_play, emoji, color, category, together, entry,
            featured, plays, likes, created_at
       FROM games WHERE status = 'public' ORDER BY created_at DESC LIMIT 500`,
  ).all<GameRow>()
  return results.map(toGame)
})

const gameId = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) })

/** Increments a counter and returns its new value, or null if the game isn't public. */
async function increment(id: string, column: 'plays' | 'likes') {
  const row = await env.DB.prepare(
    `UPDATE games SET ${column} = ${column} + 1 WHERE id = ? AND status = 'public' RETURNING ${column} AS value`,
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
