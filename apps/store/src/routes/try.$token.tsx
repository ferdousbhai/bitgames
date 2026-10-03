import { createFileRoute, notFound } from '@tanstack/react-router'
import { GameFrame } from '#/components/GameFrame'
import { Loading } from '#/components/GameShelf'
import { isPreviewToken } from '#/server/limits'
import { getPreview } from '#/server/preview'

/** A creator's private preview inside the store page, so "play together" works while testing. */
export const Route = createFileRoute('/try/$token')({
  loader: async ({ params }) => {
    if (!isPreviewToken(params.token)) throw notFound()
    const game = await getPreview({ data: { token: params.token } })
    if (!game) throw notFound()
    return game
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `Preview: ${loaderData?.title ?? 'Game'} · BitGames` }, { name: 'robots', content: 'noindex' }],
  }),
  component: TryPage,
  pendingComponent: Loading,
})

function TryPage() {
  const game = Route.useLoaderData()
  const { token } = Route.useParams()
  return (
    <>
      <p className="mt-2 rounded-2xl bg-sun/30 px-4 py-2 text-center font-semibold">
        🔒 Private preview ({game.status}). Only people with this link can play it.
      </p>
      <h1 className="mb-3 mt-4 flex items-center gap-3 text-3xl font-bold">
        <span aria-hidden>{game.emoji}</span>
        {game.title}
      </h1>
      <GameFrame
        gameId={game.id}
        title={game.title}
        // Query parameters on the preview page (e.g. ?debug) are passed to the game for testing.
        src={`/preview/${token}/${game.entry}${typeof window === 'undefined' ? '' : window.location.search}`}
        className="aspect-video w-full overflow-hidden rounded-[32px] border-4 border-white bg-ink"
      />
      <p className="mt-3 text-lg text-ink-soft">🕹️ {game.howToPlay}</p>
    </>
  )
}
