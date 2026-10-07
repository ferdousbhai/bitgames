import { createFileRoute, Link } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { Empty, GameGrid, Loading } from '#/components/GameShelf'
import { gamesCollection } from '#/lib/collections'
import { useGamePreferences } from '#/lib/use-game-preferences'

export const Route = createFileRoute('/favorites')({
  loader: () => gamesCollection.preload(),
  head: () => ({ meta: [{ title: 'Favorites · BitGames' }] }),
  component: Favorites,
  pendingComponent: Loading,
})

function Favorites() {
  const { favorites, hidden } = useGamePreferences()
  const { data } = useLiveQuery({ query: (q) => q.from({ g: gamesCollection }) })
  const games = data.filter((game) => favorites.includes(game.id) && !hidden.includes(game.id))
  return <>
    <h1 className="mt-6 text-4xl font-bold">❤️ Favorites</h1>
    <p className="mt-2 mb-5 text-lg text-ink-soft">Tap a heart to save a game here. Your choices are saved in this browser.</p>
    {games.length ? <GameGrid games={games} /> : <Empty emoji="❤️">Your favorite games will appear here. Tap a heart on a game to get started!</Empty>}
    <Link to="/hidden" className="mt-8 inline-block rounded-full bg-cloud px-5 py-3 font-semibold">🙈 Hidden games</Link>
  </>
}
