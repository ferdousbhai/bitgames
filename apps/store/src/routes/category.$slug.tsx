import { createFileRoute, notFound } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { CategoryBar } from '#/components/CategoryBar'
import { Empty, GameGrid, Loading } from '#/components/GameShelf'
import { TOGETHER, findCategory } from '#/lib/categories'
import { gamesCollection } from '#/lib/collections'

export const Route = createFileRoute('/category/$slug')({
  loader: async ({ params }) => {
    const category = findCategory(params.slug)
    if (!category) throw notFound()
    await gamesCollection.preload()
    return category
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? 'Games'} · BitGames` }] }),
  component: CategoryPage,
  pendingComponent: Loading,
})

function CategoryPage() {
  const category = Route.useLoaderData()
  const { data: games } = useLiveQuery({
    query: (q) =>
      q
        .from({ g: gamesCollection })
        .where(({ g }) => (category.slug === TOGETHER.slug ? eq(g.together, true) : eq(g.category, category.slug)))
        .orderBy(({ g }) => g.plays, 'desc'),
  })

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
