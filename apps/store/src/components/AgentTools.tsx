import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { CATEGORIES, TOGETHER } from '#/lib/categories'
import { gamesCollection, hasLiked, likeGame } from '#/lib/collections'
import { currentGamePreferences, updateGamePreference } from '#/lib/use-game-preferences'
import { registerTools, tool } from '#/lib/webmcp'

const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug)
const PAGES = ['home', 'search', 'category', 'favorites', 'hidden'] as const

/** Look up a listed game, or fail with a message the agent can act on. */
async function listedGame(id: string) {
  await gamesCollection.preload()
  const game = gamesCollection.get(id)
  if (!game) throw new Error(`No listed game with id "${id}". Call list_games for ids.`)
  return game
}

/**
 * WebMCP tools for browser agents, registered while the store is open. They use
 * the same games collection, router and saved preferences as the page, so what
 * an agent does shows on screen. Nothing here can reach creator or admin actions.
 */
export function AgentTools() {
  const router = useRouter()
  useEffect(() => {
    const controller = new AbortController()
    registerTools(
      [
        tool<{ query?: string; category?: string; together?: boolean; includeHidden?: boolean }>({
          name: 'list_games',
          title: 'List games',
          description:
            'List the games in the BitGames store with how to play, play counts and this browser’s favorite/hidden/liked state. Optionally filter by a word in the title or tagline, a category, or play-together games. Hidden games are left out unless includeHidden is true.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Word to find in the title or tagline.' },
              category: { type: 'string', enum: CATEGORY_SLUGS },
              together: { type: 'boolean', description: 'Only games two or more people can play at once.' },
              includeHidden: { type: 'boolean' },
            },
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async ({ query, category, together, includeHidden }) => {
            await gamesCollection.preload()
            const { favorites, hidden } = currentGamePreferences()
            const term = query?.trim().toLowerCase()
            const games = gamesCollection.toArray
              .filter((g) => includeHidden || !hidden.includes(g.id))
              .filter((g) => !category || g.category === category)
              .filter((g) => !together || g.together)
              .filter((g) => !term || g.title.toLowerCase().includes(term) || g.tagline.toLowerCase().includes(term))
              .sort((a, b) => b.plays - a.plays)
            return {
              games: games.map((g) => ({
                id: g.id,
                title: g.title,
                tagline: g.tagline,
                howToPlay: g.howToPlay,
                category: g.category,
                together: g.together,
                plays: g.plays,
                likes: g.likes,
                favorite: favorites.includes(g.id),
                hidden: hidden.includes(g.id),
                liked: hasLiked(g.id),
                page: `/game/${g.id}`,
              })),
            }
          },
        }),
        tool<{ id: string; play?: boolean }>({
          name: 'open_game',
          title: 'Open a game',
          description: 'Open a game’s page. With play=true the game starts on screen (it needs a person to play it: games are visual and touch driven).',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Game id from list_games.' }, play: { type: 'boolean' } },
            required: ['id'],
          },
          execute: async ({ id, play }) => {
            const game = await listedGame(id)
            if (currentGamePreferences().hidden.includes(id)) throw new Error(`${game.title} is hidden. Restore it with set_game_preference first.`)
            await router.navigate({ to: '/game/$id', params: { id }, search: play ? { play: true } : {} })
            return { opened: `/game/${id}`, title: game.title, playing: play === true }
          },
        }),
        tool<{ page: (typeof PAGES)[number]; query?: string; category?: string }>({
          name: 'show_page',
          title: 'Show a store page',
          description: `Navigate the store: home, search (with query), category (with one of ${[...CATEGORY_SLUGS, TOGETHER.slug].join(', ')}), favorites, or hidden games.`,
          inputSchema: {
            type: 'object',
            properties: {
              page: { type: 'string', enum: PAGES },
              query: { type: 'string' },
              category: { type: 'string', enum: [...CATEGORY_SLUGS, TOGETHER.slug] },
            },
            required: ['page'],
          },
          execute: async ({ page, query, category }) => {
            if (page === 'search') await router.navigate({ to: '/search', search: { q: query ?? '' } })
            else if (page === 'category') {
              if (!category) throw new Error('category is required for the category page.')
              await router.navigate({ to: '/category/$slug', params: { slug: category } })
            } else await router.navigate({ to: page === 'home' ? '/' : page === 'favorites' ? '/favorites' : '/hidden' })
            return { url: router.state.location.href }
          },
        }),
        tool<{ id: string; action: 'favorite' | 'hide' | 'restore' }>({
          name: 'set_game_preference',
          title: 'Favorite, hide or restore a game',
          description:
            'Change this browser’s choices for a game: "favorite" toggles it in Favorites, "hide" removes it from every shelf, "restore" brings back a hidden game. Saved only in this browser.',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' }, action: { type: 'string', enum: ['favorite', 'hide', 'restore'] } },
            required: ['id', 'action'],
          },
          execute: async ({ id, action }) => {
            await listedGame(id)
            updateGamePreference(id, action)
            const { favorites, hidden } = currentGamePreferences()
            return { id, favorite: favorites.includes(id), hidden: hidden.includes(id) }
          },
        }),
        tool<{ id: string }>({
          name: 'like_game',
          title: 'Love a game',
          description: 'Add this browser’s public “I love it” to a game (once per game). Only do this when the player asked to.',
          inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          annotations: { consequentialHint: true },
          execute: async ({ id }) => {
            const game = await listedGame(id)
            if (hasLiked(id)) return { id, alreadyLiked: true, likes: game.likes }
            likeGame(id)
            return { id, liked: true, likes: game.likes + 1 }
          },
        }),
      ],
      controller.signal,
    )
    return () => controller.abort()
  }, [router])
  return null
}
