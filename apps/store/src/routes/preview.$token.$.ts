import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { serveGameFile } from '#/server/files'
import { DRAFT_PREVIEW_TTL_MS } from '#/server/limits'

/**
 * Private preview of a game in any state, for its creator and reviewers.
 * The unguessable token in the path is the only credential, so relative
 * URLs inside the game (./models/x.glb) keep working. Drafts stop
 * previewing a week after their last change, so a draft can't be used as
 * long-lived file hosting; any edit makes the link work again.
 */
export const Route = createFileRoute('/preview/$token/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[a-f0-9]{32}$/.test(params.token)) return new Response('Not found', { status: 404 })
        const game = await env.DB.prepare(
          `SELECT id FROM games
            WHERE preview_token = ? AND (status IN ('review', 'public') OR updated_at > ?)`,
        )
          .bind(params.token, Date.now() - DRAFT_PREVIEW_TTL_MS)
          .first<{ id: string }>()
        if (!game) return new Response('Not found', { status: 404 })
        const response = await serveGameFile(game.id, params._splat || 'index.html', request, `/preview/${params.token}/`, 0)
        response.headers.set('cache-control', 'no-store')
        response.headers.set('x-robots-tag', 'noindex')
        return response
      },
    },
  },
})
