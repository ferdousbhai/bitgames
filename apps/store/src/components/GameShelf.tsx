import type { Game } from '#/lib/types'
import { useGamePreferences } from '#/lib/use-game-preferences'
import { GameTile } from './GameTile'

/** A titled row of game tiles that a finger swipes sideways, like a row of videos. */
export function GameShelf({ title, emoji, games, replace }: { title: string; emoji: string; games: Game[]; replace?: boolean }) {
  const { hidden } = useGamePreferences()
  games = games.filter((game) => !hidden.includes(game.id))
  if (games.length === 0) return null
  return (
    <section className="mt-8 sm:mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
        <span aria-hidden>{emoji}</span>
        {title}
      </h2>
      <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-4 sm:gap-5">
        {games.map((game) => (
          <li key={game.id} className="w-[42vw] shrink-0 snap-start sm:w-60 lg:w-72">
            <GameTile game={game} replace={replace} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function GameGrid({ games }: { games: Game[] }) {
  const { hidden } = useGamePreferences()
  games = games.filter((game) => !hidden.includes(game.id))
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {games.map((game) => (
        <li key={game.id}>
          <GameTile game={game} />
        </li>
      ))}
    </ul>
  )
}

export function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-2xl font-semibold text-ink-soft">
      <span aria-hidden className="float text-6xl">🎮</span>
      Getting the games ready…
    </div>
  )
}

export function Empty({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[28px] border-4 border-dashed border-white bg-white/50 px-6 py-16 text-center text-xl text-ink-soft">
      <span aria-hidden className="text-6xl">{emoji}</span>
      {children}
    </div>
  )
}
