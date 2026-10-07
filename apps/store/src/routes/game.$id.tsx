import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { PlayScreen } from '#/components/PlayScreen'
import { GameShelf, Loading } from '#/components/GameShelf'
import { playLink } from '#/components/GameTile'
import { findCategory } from '#/lib/categories'
import { countPlay, gamesCollection, likeGame } from '#/lib/collections'
import { shareMeta } from '#/lib/share'
import type { Game } from '#/lib/types'
import { toy } from '#/lib/ui'
import { getGameShare } from '#/server/games'

/**
 * The game's share details. On the server (the first request for a page, which
 * is all a link preview reads) they come straight from the database; in the
 * browser, from the games collection the page uses anyway.
 */
const loadGameShare = createIsomorphicFn()
  .server((id: string) => getGameShare({ data: { id } }))
  .client(async (id: string) => {
    await gamesCollection.preload()
    const game = gamesCollection.get(id)
    return game ? { title: game.title, tagline: game.tagline, cover: game.cover } : null
  })

export const Route = createFileRoute('/game/$id')({
  // ?play=true: the game is on screen. Tapping a game anywhere goes straight here.
  validateSearch: z.object({ play: z.boolean().optional().catch(undefined) }),
  // The loader and head run on the server so shared links get the game's own preview; the page renders in the browser.
  ssr: 'data-only',
  loader: async ({ params }) => {
    const game = await loadGameShare(params.id)
    if (!game) throw notFound()
    return game
  },
  // Shared links always point at the game page itself, never straight into ?play=true.
  head: ({ loaderData }) => ({
    meta: shareMeta({
      title: `${loaderData?.title ?? 'Game'} · BitGames`,
      description: loaderData?.tagline,
      image: loaderData?.cover ?? undefined,
    }),
  }),
  component: GamePage,
  pendingComponent: Loading,
})

function GamePage() {
  const { id } = Route.useParams()
  const { data } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).where(({ g }) => eq(g.id, id)),
  })
  // Straight from the collection too, so switching games never flashes "loading" (and drops out of fullscreen) for a frame.
  const game = data[0] ?? gamesCollection.get(id)
  const category = findCategory(game?.category ?? '')
  // Not keyed by this game, so switching games keeps these queries; the current game is dropped below.
  const { data: sameKind } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => eq(g.category, category?.slug ?? ''))
        .orderBy(({ g }) => g.plays, 'desc')
        .limit(13),
  })
  const { data: popularAll } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).orderBy(({ g }) => g.plays, 'desc').limit(13),
  })
  const { data: newestAll } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).orderBy(({ g }) => g.createdAt, 'desc').limit(13),
  })

  const { play } = Route.useSearch()
  const navigate = Route.useNavigate()
  // The game frame needs the browser, so it only opens once the page is running there.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const playing = mounted && play === true && game !== undefined
  useEffect(() => {
    if (playing) countPlay(id)
  }, [playing, id])

  if (!game) return <Loading />
  const others = (games: Game[]) => games.filter((g) => g.id !== id).slice(0, 12)
  const more = others(sameKind)
  // Empty shelves don't show.
  const shelves = [
    { title: `More ${category?.name ?? ''} games`, emoji: category?.emoji ?? '🎲', games: more },
    { title: 'Everyone loves these', emoji: '🔥', games: others(popularAll).filter((g) => !more.some((m) => m.id === g.id)) },
    { title: 'New games', emoji: '✨', games: others(newestAll) },
  ]
  return (
    <>
      <PlayCover game={game} />
      {playing && (
        <PlayScreen
          gameId={game.id}
          title={game.title}
          emoji={game.emoji}
          src={game.url + game.entry}
          menu={shelves.map((shelf) => <GameShelf key={shelf.title} {...shelf} replace />)}
          onStop={() => void navigate({ search: {}, replace: true })}
        />
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <h1 className="flex items-center gap-3 text-4xl font-bold">
            <span aria-hidden>{game.emoji}</span>
            {game.title}
          </h1>
          <p className="mt-2 text-xl text-ink-soft">{game.tagline}</p>
          <div className="mt-5 rounded-[28px] border-4 border-white bg-cloud p-5">
            <h2 className="text-xl font-bold">🕹️ How to play</h2>
            <p className="mt-1 text-lg">{game.howToPlay}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-3 lg:flex-col">
          <LikeButton game={game} />
          <span className="rounded-full bg-cloud px-5 py-3 text-lg font-semibold text-ink-soft">
            🎮 {game.plays.toLocaleString()} plays
          </span>
          {game.together && (
            <span className="rounded-full bg-cloud px-5 py-3 text-lg font-semibold text-ink-soft">
              👫 Play together
            </span>
          )}
        </div>
      </div>
      {/* While playing, the same shelves are in the game's "what next?" sheet instead. */}
      {!playing && shelves.map((shelf) => <GameShelf key={shelf.title} {...shelf} />)}
    </>
  )
}

/** The game's cover with a big Play button, for coming back to after stopping. */
function PlayCover({ game }: { game: Game }) {
  return (
    <Link
      {...playLink(game.id)}
      replace
      // On a landscape iPad a full-width 16:9 cover would push everything else off the screen.
      className="group mx-auto flex aspect-video w-full max-h-[60dvh] flex-col items-center justify-center gap-4 overflow-hidden rounded-[32px] border-4 border-white text-white shadow-[0_10px_0_rgba(43,45,66,0.15)]"
      style={{
        background: game.cover
          ? `radial-gradient(circle, transparent 30%, rgba(43,45,66,0.55)), center / cover no-repeat url("${game.cover}"), ${game.color}`
          : `radial-gradient(circle at 50% 40%, ${game.color}, color-mix(in oklab, ${game.color} 50%, #2b2d42))`,
      }}
    >
      {!game.cover && <span aria-hidden className="float text-8xl drop-shadow-2xl sm:text-9xl">{game.emoji}</span>}
      <span className="toy rounded-full px-10 py-4 text-3xl font-bold text-ink" style={toy('var(--color-sun)')}>
        ▶ Play
      </span>
    </Link>
  )
}

function readLiked(id: string): boolean {
  try {
    return localStorage.getItem(`liked:${id}`) === '1'
  } catch {
    return false
  }
}

function LikeButton({ game }: { game: Game }) {
  const [liked, setLiked] = useState(false)
  const [popping, setPopping] = useState(false)
  useEffect(() => setLiked(readLiked(game.id)), [game.id])

  return (
    <button
      type="button"
      disabled={liked}
      onClick={() => {
        likeGame(game.id)
        setLiked(true)
        setPopping(true)
        try {
          localStorage.setItem(`liked:${game.id}`, '1')
        } catch {}
      }}
      className="toy flex items-center gap-2 rounded-full px-5 py-3 text-lg font-semibold text-white disabled:cursor-default"
      style={toy(liked ? 'var(--color-berry)' : 'var(--color-grape)')}
      aria-pressed={liked}
    >
      <span aria-hidden className={popping ? 'pop' : ''} onAnimationEnd={() => setPopping(false)}>
        {liked ? '💖' : '🤍'}
      </span>
      {liked ? 'You love it!' : 'I love it'} · {game.likes.toLocaleString()}
    </button>
  )
}
