import { createFileRoute } from '@tanstack/react-router'
import { gameNotFound, serveGameFile } from '#/server/files'
import { isGameId } from '#/server/limits'

/**
 * The reviewed (live) copy of published games. Files only exist under live/
 * while a game is published, so R2 alone decides what is served; drafts are
 * only reachable through /preview.
 */
export const Route = createFileRoute('/play/$gameId/$')({
  server: {
    handlers: {
      GET: ({ params, request }) => {
        if (!isGameId(params.gameId)) return gameNotFound()
        return serveGameFile(params.gameId, params._splat || 'index.html', request, {
          basePath: `/play/${params.gameId}/`,
          live: true,
          cache: 'public, max-age=300',
        })
      },
    },
  },
})
