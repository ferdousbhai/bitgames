import { Link, createFileRoute } from '@tanstack/react-router'
import { useGamePreferences } from '#/lib/use-game-preferences'
import { GameActions } from '#/components/GameActions'
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
  const { favorites, hidden } = useGamePreferences()
  const { data: featured } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => eq(g.featured, true))
        .orderBy(({ g }) => g.createdAt, 'desc'),
  })
  const { data: newest } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).orderBy(({ g }) => g.createdAt, 'desc'),
  })
  const { data: popular } = useLiveQuery({
    query: (q) => q.from({ g: gamesCollection }).orderBy(({ g }) => g.plays, 'desc'),
  })
  const { data: together } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => eq(g.together, true))
        .orderBy(({ g }) => g.plays, 'desc'),
  })

  const visible = (games: Game[]) => games.filter((game) => !hidden.includes(game.id))
  const hero = visible(featured)[0] ?? visible(newest)[0]
  return (
    <>
      <CategoryBar />
      {hero && <Hero game={hero} />}
      <GameShelf title="Favorites" emoji="❤️" games={visible(newest).filter((game) => favorites.includes(game.id))} />
      <GameShelf title="New games" emoji="✨" games={visible(newest).slice(0, 12)} />
      <GameShelf title="Everyone loves these" emoji="🔥" games={visible(popular).slice(0, 12)} />
      <GameShelf title="Play together" emoji="👫" games={visible(together).slice(0, 12)} />
      <ForGrownUps />
    </>
  )
}

/**
 * A quiet note for parents. Every point here must stay true of the code:
 * check the store before changing a claim (see the review flow, game CSP and
 * the absence of accounts, analytics and cookies for players).
 */
const GROWN_UP_POINTS = [
  {
    emoji: '🚫',
    title: 'No ads, no buying',
    text: 'Nothing to buy and no ads. Games can’t link out to other websites.',
  },
  {
    emoji: '🔒',
    title: 'No accounts, no tracking',
    text: 'Kids don’t sign up or type their name. No analytics, no tracking cookies. Likes, favorites and hidden games are remembered in this browser only.',
  },
  {
    emoji: '✅',
    title: 'Checked before it’s listed',
    text: 'Every game is played and checked before it appears here: gentle, easy to play, no chat and no scary bits.',
  },
  {
    emoji: '📱',
    title: 'Right in the browser',
    text: 'Nothing to install. On an iPad, tap Share then Add to Home Screen. To play together, share the three-animal code.',
  },
]

function ForGrownUps() {
  return (
    <section aria-labelledby="grown-ups" className="mt-14 rounded-[28px] border-4 border-white bg-white/60 p-5 sm:p-7">
      <h2 id="grown-ups" className="flex items-center gap-2 text-xl font-bold text-ink-soft sm:text-2xl">
        <span aria-hidden>👋</span>
        For grown-ups
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {GROWN_UP_POINTS.map((point) => (
          <li key={point.title} className="flex gap-3">
            <span aria-hidden className="text-2xl leading-7">{point.emoji}</span>
            <div>
              <h3 className="text-lg font-semibold">{point.title}</h3>
              <p className="mt-0.5 text-base leading-snug text-ink-soft">{point.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
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
          <div className="mt-4"><GameActions game={game} /></div>
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
