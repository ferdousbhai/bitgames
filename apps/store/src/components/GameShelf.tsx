import type { Game } from '#/lib/types'
import { GameTile } from './GameTile'

/** A titled grid of game tiles. */
export function GameShelf({ title, emoji, games }: { title: string; emoji: string; games: Game[] }) {
  if (games.length === 0) return null
  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
        <span aria-hidden>{emoji}</span>
        {title}
      </h2>
      <GameGrid games={games} />
    </section>
  )
}

export function GameGrid({ games }: { games: Game[] }) {
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
