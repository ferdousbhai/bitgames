import { createFileRoute } from '@tanstack/react-router'
import { gameNotFound, serveGameFile } from '#/server/files'
import { isPreviewToken } from '#/server/limits'
import { findPreviewGame } from '#/server/preview-lookup'

/**
 * Private preview of a game in any state, for its creator and reviewers.
 * The unguessable token in the path is the only credential, so relative
 * URLs inside the game (./models/x.glb) keep working.
 */
export const Route = createFileRoute('/preview/$token/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const game = isPreviewToken(params.token) ? await findPreviewGame(params.token) : null
        if (!game) return gameNotFound()
        return serveGameFile(game.id, params._splat || 'index.html', request, {
          basePath: `/preview/${params.token}/`,
          cache: 'no-store',
          noindex: true,
        })
      },
    },
  },
})
