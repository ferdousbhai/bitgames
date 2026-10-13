import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { versionBase } from '#/lib/site'
import { listedGames, type ListedGameRow } from './games-store'
import { isGameId } from './limits'
import { allowedByIp } from './rate-limit'

export const listGames = createServerFn({ method: 'GET' }).handler(() => listedGames())

const gameId = z.object({ id: z.string().refine(isGameId) })

/**
 * What a shared link to one listed game shows (title, tagline, cover). Game pages
 * otherwise render in the browser, so this lets the server put them in the HTML
 * for link previews. Null when the game isn't listed.
 */
export const getGameShare = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().max(100) }))
  .handler(async ({ data }) => {
    if (!isGameId(data.id)) return null
    const row = await env.DB.prepare(
      'SELECT title, tagline, cover, live_version FROM games WHERE id = ? AND live = 1 AND live_version IS NOT NULL',
    )
      .bind(data.id)
      .first<Pick<ListedGameRow, 'title' | 'tagline' | 'cover' | 'live_version'>>()
    if (!row) return null
    return { title: row.title, tagline: row.tagline, cover: row.cover ? versionBase(row.live_version) + row.cover : null }
  })

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
