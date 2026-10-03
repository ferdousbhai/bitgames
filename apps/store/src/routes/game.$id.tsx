import { createFileRoute, notFound } from '@tanstack/react-router'
import { and, eq, not, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useRef, useState } from 'react'
import { GameFrame } from '#/components/GameFrame'
import { GameShelf, Loading } from '#/components/GameShelf'
import { findCategory } from '#/lib/categories'
import { countPlay, gamesCollection, likeGame } from '#/lib/collections'
import type { Game } from '#/lib/types'

export const Route = createFileRoute('/game/$id')({
  loader: async ({ params }) => {
    await gamesCollection.preload()
    const game = gamesCollection.get(params.id)
    if (!game) throw notFound()
    return { title: game.title }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? 'Game'} · BitGames` }] }),
  component: GamePage,
  pendingComponent: Loading,
})

function GamePage() {
  const { id } = Route.useParams()
  const { data } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).where(({ g }) => eq(g.id, id)),
  })
  const game = data[0]
  const category = findCategory(game?.category ?? '')
  const { data: more } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => and(eq(g.category, category?.slug ?? ''), not(eq(g.id, id))))
        .orderBy(({ g }) => g.plays, 'desc')
        .limit(8),
  })
  const { data: popular } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => not(eq(g.id, id)))
        .orderBy(({ g }) => g.plays, 'desc')
        .limit(8),
  })

  if (!game) return <Loading />
  return (
    <>
      <Player key={game.id} game={game} />
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
        <div className="flex items-start gap-3 lg:flex-col">
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
      <GameShelf
        title={more.length > 0 ? `More ${category?.name ?? ''} games` : 'More games'}
        emoji={more.length > 0 ? (category?.emoji ?? '🎲') : '🎲'}
        games={more.length > 0 ? more : popular}
      />
    </>
  )
}

function Player({ game }: { game: Game }) {
  const [started, setStarted] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)

  function start() {
    setStarted(true)
    countPlay(game.id)
  }

  return (
    <div
      ref={frameRef}
      className="relative aspect-video w-full overflow-hidden rounded-[32px] border-4 border-white bg-ink shadow-[0_10px_0_rgba(43,45,66,0.15)] [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
    >
      {started ? (
        <>
          <GameFrame gameId={game.id} title={game.title} src={`/play/${game.id}/${game.entry}`} className="h-full w-full" />
          <button
            type="button"
            onClick={() => void frameRef.current?.requestFullscreen?.()}
            className="absolute bottom-3 right-3 rounded-2xl bg-black/40 px-3 py-2 text-2xl text-white backdrop-blur hover:bg-black/60"
            aria-label="Make it big"
            title="Make it big"
          >
            ⛶
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          className="group flex h-full w-full flex-col items-center justify-center gap-4 text-white"
          style={{
            background: game.cover
              ? `radial-gradient(circle, transparent 30%, rgba(43,45,66,0.55)), center / cover no-repeat url("${game.cover}")`
              : `radial-gradient(circle at 50% 40%, ${game.color}, color-mix(in oklab, ${game.color} 50%, #2b2d42))`,
          }}
        >
          {!game.cover && <span aria-hidden className="float text-8xl drop-shadow-2xl sm:text-9xl">{game.emoji}</span>}
          <span
            className="toy rounded-full px-10 py-4 text-3xl font-bold text-ink"
            style={{ '--toy-bg': 'var(--color-sun)' } as React.CSSProperties}
          >
            ▶ Play
          </span>
        </button>
      )}
    </div>
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
      style={{ '--toy-bg': liked ? 'var(--color-berry)' : 'var(--color-grape)' } as React.CSSProperties}
      aria-pressed={liked}
    >
      <span aria-hidden className={popping ? 'pop' : ''} onAnimationEnd={() => setPopping(false)}>
        {liked ? '💖' : '🤍'}
      </span>
      {liked ? 'You love it!' : 'I love it'} · {game.likes.toLocaleString()}
    </button>
  )
}
