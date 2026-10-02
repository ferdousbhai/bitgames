import { BasicIndex, createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { addLike, listGames, recordPlay } from '#/server/games'
import { gameSchema } from './types'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
})

export const gamesCollection = createCollection(
  queryCollectionOptions({
    id: 'games',
    queryKey: ['games'],
    queryFn: () => listGames(),
    queryClient,
    schema: gameSchema,
    getKey: (game) => game.id,
    // Index the fields the shelves sort and filter on, so ordered, limited queries stay incremental.
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    // Likes and plays are counters: send the increment and write back the
    // server's count, skipping a full refetch of the catalog.
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (m) => {
          const id = String(m.key)
          if ('likes' in m.changes) {
            const likes = await addLike({ data: { id } })
            if (likes !== null) gamesCollection.utils.writeUpdate({ id, likes })
          } else if ('plays' in m.changes) {
            const plays = await recordPlay({ data: { id } })
            if (plays !== null) gamesCollection.utils.writeUpdate({ id, plays })
          }
        }),
      )
      return { refetch: false }
    },
  }),
)

export function likeGame(id: string) {
  gamesCollection.update(id, (draft) => {
    draft.likes += 1
  })
}

export function countPlay(id: string) {
  gamesCollection.update(id, (draft) => {
    draft.plays += 1
  })
}
