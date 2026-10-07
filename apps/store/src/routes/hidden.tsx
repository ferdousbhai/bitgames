import { createFileRoute, Link } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { Empty, Loading } from '#/components/GameShelf'
import { gamesCollection } from '#/lib/collections'
import { useGamePreferences, updateGamePreference } from '#/lib/use-game-preferences'

export const Route = createFileRoute('/hidden')({
  loader: () => gamesCollection.preload(),
  head: () => ({ meta: [{ title: 'Hidden games · BitGames' }] }),
  component: Hidden,
  pendingComponent: Loading,
})

function Hidden() {
  const { hidden } = useGamePreferences()
  const { data } = useLiveQuery({ query: (q) => q.from({ g: gamesCollection }) })
  const games = data.filter((game) => hidden.includes(game.id))
  return <>
    <h1 className="mt-6 text-4xl font-bold">🙈 Hidden games</h1>
    <p className="mt-2 mb-5 text-lg text-ink-soft">These games stay out of browsing, search and recommendations in this browser. Restore one to show it again.</p>
    {games.length ? <ul className="grid gap-3 sm:grid-cols-2">{games.map((game) => <li key={game.id} className="flex items-center justify-between gap-3 rounded-3xl border-4 border-white bg-cloud p-4">
      <span className="text-xl font-bold">{game.emoji} {game.title}</span>
      <button type="button" aria-label={`Restore ${game.title}`} className="min-h-11 rounded-full bg-white px-4 py-2 font-semibold" onClick={() => updateGamePreference(game.id, 'restore')}>Restore</button>
    </li>)}</ul> : <Empty emoji="🐵">No hidden games.</Empty>}
    <Link to="/favorites" className="mt-8 inline-block rounded-full bg-cloud px-5 py-3 font-semibold">❤️ Favorites</Link>
  </>
}
