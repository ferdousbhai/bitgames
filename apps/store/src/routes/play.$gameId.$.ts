import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { serveGameFile } from '#/server/files'
import { isGameId } from '#/server/limits'

/** The reviewed (live) copy of published games. Drafts are only reachable through /preview. */
export const Route = createFileRoute('/play/$gameId/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!isGameId(params.gameId)) return new Response('Not found', { status: 404 })
        const game = await env.DB.prepare(`SELECT 1 AS ok FROM games WHERE id = ? AND live = 1`)
          .bind(params.gameId)
          .first()
        if (!game) return new Response('Not found', { status: 404 })
        return serveGameFile(params.gameId, params._splat || 'index.html', request, `/play/${params.gameId}/`, 300, true)
      },
    },
  },
})
