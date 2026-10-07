import { Link, createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { CategoryBar } from '#/components/CategoryBar'
import { GameShelf, Loading } from '#/components/GameShelf'
import { playLink } from '#/components/GameTile'
import { gamesCollection } from '#/lib/collections'
import type { Game } from '#/lib/types'
import { toy } from '#/lib/ui'

export const Route = createFileRoute('/')({
  loader: () => gamesCollection.preload(),
  component: Home,
  pendingComponent: Loading,
})

function Home() {
  const { data: featured } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => eq(g.featured, true))
        .orderBy(({ g }) => g.createdAt, 'desc')
        .limit(1),
  })
  const { data: newest } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).orderBy(({ g }) => g.createdAt, 'desc').limit(12),
  })
  const { data: popular } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).orderBy(({ g }) => g.plays, 'desc').limit(12),
  })
  const { data: together } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => eq(g.together, true))
        .orderBy(({ g }) => g.plays, 'desc')
        .limit(12),
  })

  const hero = featured[0] ?? newest[0]
  return (
    <>
      <CategoryBar />
      {hero && <Hero game={hero} />}
      <GameShelf title="New games" emoji="✨" games={newest} />
      <GameShelf title="Everyone loves these" emoji="🔥" games={popular} />
      <GameShelf title="Play together" emoji="👫" games={together} />
    </>
  )
}

function Hero({ game }: { game: Game }) {
  return (
    <section
      className="relative mt-4 overflow-hidden rounded-[36px] border-4 border-white p-6 text-white shadow-[0_10px_0_rgba(43,45,66,0.12)] sm:p-10"
      style={{
        background: game.cover
          ? `linear-gradient(90deg, color-mix(in oklab, ${game.color} 85%, transparent) 25%, transparent 75%), center / cover no-repeat url("${game.cover}"), ${game.color}`
          : `linear-gradient(120deg, ${game.color}, color-mix(in oklab, ${game.color} 60%, #6c63ff))`,
      }}
    >
      <span aria-hidden className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/10" />
      <span aria-hidden className="absolute right-1/3 top-4 h-16 w-16 rounded-full bg-white/10" />
      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-lg font-semibold uppercase tracking-wide text-white/85">Game of the day</p>
          <h1 className="mt-1 text-4xl font-bold drop-shadow sm:text-6xl">{game.title}</h1>
          <p className="mt-2 max-w-md text-xl text-white/90">{game.tagline}</p>
          <Link
            {...playLink(game.id)}
            className="toy mt-6 inline-flex items-center gap-2 rounded-full px-8 py-4 text-2xl font-bold text-ink"
            style={toy('var(--color-sun)')}
          >
            ▶ Play now
          </Link>
        </div>
        {!game.cover && (
          <span aria-hidden className="float text-[9rem] leading-none drop-shadow-2xl sm:text-[12rem]">
            {game.emoji}
          </span>
        )}
      </div>
    </section>
  )
}
