import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { DRAFT_PREVIEW_TTL_MS } from './limits'

/** The game behind a preview token, with the same expiry rule as /preview/<token>/. */
export const getPreview = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) }))
  .handler(async ({ data }) => {
    return env.DB.prepare(
      `SELECT id, title, emoji, how_to_play AS howToPlay, entry, status FROM games
        WHERE preview_token = ? AND (status = 'review' OR live = 1 OR updated_at > ?)`,
    )
      .bind(data.token, Date.now() - DRAFT_PREVIEW_TTL_MS)
      .first<{ id: string; title: string; emoji: string; howToPlay: string; entry: string; status: string }>()
  })
