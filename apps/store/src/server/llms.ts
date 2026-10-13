import { CATEGORIES, TOGETHER } from '#/lib/categories'
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '#/lib/share'
import type { Game } from '#/lib/types'
import { listedGames } from './games-store'
import { GUIDE } from './guide'

/**
 * /llms.txt (https://llmstxt.org) and /llms-full.txt, built on each request from
 * the listed games and the creator guide the MCP serves, so they never drift.
 */

const gameLine = (game: Game) => `- [${game.title}](${absoluteUrl(`/game/${game.id}`)}): ${game.tagline}${game.together ? ' (play together)' : ''}`

function summary(games: Game[]): string {
  return `# ${SITE_NAME}

> ${SITE_DESCRIPTION} A store of gentle browser games for children of about 4 to 8, with no accounts, ads or purchases. Every listed game is reviewed by an adult. Creators build games with their own AI agents and ship them through the creator MCP server.

Players need no account. Pages render in the browser; in-page WebMCP tools (list_games, open_game, show_page, set_game_preference, like_game) let browser agents browse and start games. Games play at /game/<id>?play=true in a sandboxed frame.

## Store

- [Home](${absoluteUrl('/')}): Featured, newest, popular and play-together shelves
- [Search](${absoluteUrl('/search?q=')}): Find games by title or tagline with ?q=
${[...CATEGORIES, TOGETHER].map((c) => `- [${c.name}](${absoluteUrl(`/category/${c.slug}`)}): ${c.emoji} Games in this category`).join('\n')}

## Games

${games.length ? games.map(gameLine).join('\n') : '- No games are listed right now.'}

## For creators and agents

- [Get a creator key](${absoluteUrl('/make')}): A grown-up passes a human check and gets a creator key plus MCP setup for Claude Code, Codex or any Streamable HTTP client
- [Creator MCP server](${absoluteUrl('/mcp')}): Streamable HTTP, stateless, \`Authorization: Bearer bg_...\`. Tools: get_context, save_game, publish_game, withdraw_submission, delete_game
- [Creator guide](${absoluteUrl('/llms-full.txt')}): How to build, deploy and publish a game (the same guide get_context returns), plus every listed game's instructions

## Optional

- [Source code](https://github.com/ferdousbhai/bitgames): The store, the multiplayer SDK and the twelve original example games
`
}

export async function llmsTxt(): Promise<string> {
  return summary(await listedGames())
}

export async function llmsFullTxt(): Promise<string> {
  const games = await listedGames()
  const howToPlay = games.map((game) => `### ${game.emoji} ${game.title}\n\n${absoluteUrl(`/game/${game.id}`)} · ${game.category}${game.together ? ' · play together' : ''}\n\n${game.tagline}\n\nHow to play: ${game.howToPlay}`)
  return `${summary(games)}
## How to play each game

${howToPlay.join('\n\n') || 'No games are listed right now.'}

${GUIDE.replace(/^#/gm, '##')}`
}

export const textResponse = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=600' } })
