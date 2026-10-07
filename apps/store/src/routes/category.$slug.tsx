import { createFileRoute, notFound } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { CategoryBar } from '#/components/CategoryBar'
import { Empty, GameGrid, Loading } from '#/components/GameShelf'
import { TOGETHER, findCategory } from '#/lib/categories'
import { useGamePreferences } from '#/lib/use-game-preferences'
import { gamesCollection } from '#/lib/collections'
import { shareMeta } from '#/lib/share'

export const Route = createFileRoute('/category/$slug')({
  loader: async ({ params }) => {
    const category = findCategory(params.slug)
    if (!category) throw notFound()
    // Games load in the browser; the server only needs the category for the page's title and preview.
    if (typeof window !== 'undefined') await gamesCollection.preload()
    return category
  },
  ssr: 'data-only',
  head: ({ loaderData }) => {
    const together = loaderData?.slug === TOGETHER.slug
    const name = loaderData?.name ?? 'Games'
    return {
      meta: shareMeta({
        title: `${together ? name : `${name} games`} · BitGames`,
        description: together
          ? 'Games to play side by side on two screens. Bright, simple games for kids. No ads, just play.'
          : `Bright, simple ${name.toLowerCase()} games for kids. No ads, just play.`,
      }),
    }
  },
  component: CategoryPage,
  pendingComponent: Loading,
})

function CategoryPage() {
  const category = Route.useLoaderData()
  const { hidden } = useGamePreferences()
  const { data: allGames } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => (category.slug === TOGETHER.slug ? eq(g.together, true) : eq(g.category, category.slug)))
        .orderBy(({ g }) => g.plays, 'desc'),
  })

  const games = allGames.filter((game) => !hidden.includes(game.id))

  return (
    <>
      <CategoryBar />
      <h1 className="mb-5 mt-6 flex items-center gap-3 text-4xl font-bold">
        <span aria-hidden className="text-5xl">{category.emoji}</span>
        {category.name}
      </h1>
      {games.length > 0 ? (
        <GameGrid games={games} />
      ) : (
        <Empty emoji="🐣">No games here yet. Maybe you could make one!</Empty>
      )}
    </>
  )
}
