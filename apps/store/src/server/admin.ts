import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { safeEqual } from './crypto'
import { allowedByIp } from './rate-limit'
import { approveVersion, unpublish } from './games-store'
import { isGameId } from './limits'

async function requireAdmin(adminKey: string) {
  // Rate-limit guesses per IP before comparing.
  if (!(await allowedByIp(env.ADMIN_LIMITER))) throw new Error('Too many attempts. Wait a minute.')
  if (!env.ADMIN_KEY || !(await safeEqual(adminKey, env.ADMIN_KEY))) throw new Error('Wrong admin key.')
}

const auth = z.object({ adminKey: z.string().min(1).max(200) })

export interface AdminGame {
  id: string
  title: string
  tagline: string
  how_to_play: string
  emoji: string
  category: string
  status: string
  live: number
  pending_info: string | null
  review_note: string | null
  review_url: string | null
  live_url: string | null
  entry: string
  creator_id: string | null
  updated_at: number
}

export const listForAdmin = createServerFn({ method: 'POST' })
  .validator(auth)
  .handler(async ({ data }) => {
    await requireAdmin(data.adminKey)
    const { results } = await env.DB.prepare(
      `SELECT id, title, tagline, how_to_play, emoji, category, entry, status, live, pending_info, review_note, review_url, live_url, creator_id, updated_at
         FROM games
        WHERE status = 'review' OR live = 1
        ORDER BY CASE status WHEN 'review' THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 200`,
    ).all<AdminGame>()
    return results
  })

export const reviewGame = createServerFn({ method: 'POST' })
  .validator(
    auth.extend({
      id: z.string().refine(isGameId),
      decision: z.enum(['approve', 'reject', 'unpublish']),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.adminKey)
    const game = await env.DB.prepare('SELECT status, live FROM games WHERE id = ?').bind(data.id).first<{ status: string; live: number }>()
    const note = data.note?.trim() || null
    if (data.decision === 'unpublish') {
      if (!game?.live) throw new Error('That game is not in the store.')
      return unpublish(data.id, note)
    }
    if (game?.status !== 'review') throw new Error('That game changed in the meantime. Reload the list.')
    if (data.decision === 'approve') return approveVersion(data.id)
    // Sending back an update leaves the live version in the store.
    await env.DB.prepare(
      `UPDATE games SET status = 'rejected', review_note = ?, review_url = NULL, review_manifest = NULL, review_cover = NULL, updated_at = ? WHERE id = ?`,
    )
      .bind(note, Date.now(), data.id)
      .run()
  })
