import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { GameFrame } from '#/components/GameFrame'
import { PlayScreen, enterFullscreen } from '#/components/PlayScreen'
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
  const [fullscreen, setFullscreen] = useState(false)
  // Query parameters on the preview page (e.g. ?debug) are passed to the game for testing.
  const src = game.url ? game.url + game.entry + window.location.search : null
  return (
    <>
      <p className="mt-2 rounded-2xl bg-sun/30 px-4 py-2 text-center font-semibold">
        {game.live
          ? `🌍 This game is in the store. This link plays its newest version${game.status === 'review' ? ', which is waiting for a grown-up to review it for the store' : ''}.`
          : `🔗 This game's own link: anyone who has it can play. ${game.status === 'review' ? 'A grown-up will review it for the store, so other families can find it too.' : 'It is not in the store.'}`}
      </p>
      <h1 className="mb-3 mt-4 flex items-center gap-3 text-3xl font-bold">
        <span aria-hidden>{game.emoji}</span>
        {game.title}
      </h1>
      {src ? (
        <>
          <GameFrame
            gameId={game.id}
            title={game.title}
            src={src}
            className="aspect-video w-full overflow-hidden rounded-[32px] border-4 border-white bg-ink"
          />
          <button
            type="button"
            onClick={() => {
              enterFullscreen()
              setFullscreen(true)
            }}
            className="mt-3 rounded-full bg-cloud px-5 py-2 text-lg font-semibold"
          >
            ⛶ Try it full screen
          </button>
          {fullscreen && <PlayScreen gameId={game.id} title={game.title} src={src} onClose={() => setFullscreen(false)} />}
        </>
      ) : (
        <p className="rounded-[32px] border-4 border-white bg-cloud p-8 text-center text-xl">
          Nothing to play yet: deploy the game and ship its version with ship_version. 🛠️
        </p>
      )}
      <p className="mt-3 text-lg text-ink-soft">🕹️ {game.howToPlay}</p>
    </>
  )
}
