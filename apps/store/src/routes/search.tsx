import { createFileRoute } from '@tanstack/react-router'
import { ilike, or, useLiveQuery } from '@tanstack/react-db'
import { z } from 'zod'
import { Empty, GameGrid, Loading } from '#/components/GameShelf'
import { useGamePreferences } from '#/lib/use-game-preferences'
import { gamesCollection } from '#/lib/collections'

export const Route = createFileRoute('/search')({
  validateSearch: z.object({ q: z.string().catch('') }),
  loader: () => gamesCollection.preload(),
  head: () => ({ meta: [{ title: 'Find a game · BitGames' }] }),
  component: SearchPage,
  pendingComponent: Loading,
})

function SearchPage() {
  const { q } = Route.useSearch()
  const term = q.trim()
  const pattern = `%${term.replace(/[%_]/g, '')}%`
  const { hidden } = useGamePreferences()
  const { data: allGames } = useLiveQuery({
    query: (query) =>
      query
        .from({ g: gamesCollection })
        .where(({ g }) => or(ilike(g.title, pattern), ilike(g.tagline, pattern)))
        .orderBy(({ g }) => g.plays, 'desc'),
  })

  const games = allGames.filter((game) => !hidden.includes(game.id))

  return (
    <>
      <h1 className="mb-5 mt-6 text-3xl font-bold">
        {term ? <>Games for “{term}”</> : 'All games'}
      </h1>
      {games.length > 0 ? (
        <GameGrid games={games} />
      ) : (
        <Empty emoji="🔎">No games called “{term}” yet. Try another word!</Empty>
      )}
    </>
  )
}
