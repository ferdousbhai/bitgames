import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { CATEGORIES } from '#/lib/categories'
import { CreatorError, createGame, deleteGame, listOwned, previewUrl, shipVersion, updateInfo, withdrawVersion } from './games-store'
import { GUIDE, INSTRUCTIONS, STARTER_GAME } from './guide'
import { MAX_GAME_BYTES, mb } from './limits'
import { starterProject, workerName } from './starter'

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }

const ok = (text: string, structuredContent?: Record<string, unknown>): ToolResult => ({ content: [{ type: 'text', text }], structuredContent })

/**
 * Turns creator mistakes into tool errors the agent can read and fix; anything else is a real failure.
 * `fn` returns the text for the agent, or text plus machine-readable `structured` data.
 */
async function run(fn: () => Promise<string | { text: string; structured: Record<string, unknown> }>): Promise<ToolResult> {
  try {
    const result = await fn()
    return typeof result === 'string' ? ok(result) : ok(result.text, result.structured)
  } catch (error) {
    if (error instanceof CreatorError) return { content: [{ type: 'text', text: error.message }], isError: true }
    throw error
  }
}

const gameId = z.string().describe('The game id returned by create_game, e.g. "bunny-hop".')

const info = {
  title: z.string().min(2).max(40).describe('Short, fun name a child can read, e.g. "Bunny Hop".'),
  tagline: z.string().min(5).max(90).describe('One simple sentence, e.g. "Help the bunny hop over logs!"'),
  howToPlay: z.string().min(5).max(200).describe('One or two short sentences explaining the controls.'),
  emoji: z.string().min(1).max(16).describe('One emoji for the game tile, e.g. "🐰".'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex colour like "#ff6b9d"').describe('Tile colour as hex, e.g. "#8ac926". Bright, cheerful colours work best.'),
  category: z.enum(CATEGORIES.map((c) => c.slug) as [string, ...string[]]).describe('Which shelf the game appears on.'),
  together: z.boolean().describe('True only if two or more people can play at the same time.'),
}

const STATUS_HELP: Record<string, string> = {
  draft: 'nothing waiting to be listed',
  review: 'the latest version is waiting for an adult to review it for the store',
  public: 'the store lists the latest version',
  rejected: 'not listed in the store or taken down; see the note, fix it and ship a new version',
}

/** A fresh server per request: the endpoint is stateless and each call is authenticated on its own. */
export function createMcpServer(creatorId: string, origin: string) {
  const server = new McpServer({ name: 'bitgames', version: '2.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'get_guide',
    {
      title: 'Read the game-making guide',
      description: 'The rules for BitGames games (young children are the players), how games are deployed to your own Cloudflare account, three.js, multiplayer and Blender models. Read this before building.',
      annotations: { readOnlyHint: true },
    },
    async () => ok(GUIDE),
  )

  server.registerTool(
    'create_game',
    {
      title: 'Create a game',
      description: "Registers a new game in BitGames and returns its id and the game's own link. The game itself is deployed to your own Cloudflare account (see get_starter_project).",
      inputSchema: info,
    },
    (args) =>
      run(async () => {
        const game = await createGame(creatorId, args)
        return [
          `Created game "${game.id}".`,
          `Play it here once a version is shipped: ${previewUrl(origin, game.previewToken)}`,
          'Next: get_starter_project, build the game in public/, deploy it with `pnpm run deploy` (or npm), then ship_version with the version preview URL.',
        ].join('\n')
      }),
  )

  server.registerTool(
    'get_starter_project',
    {
      title: 'Get the starter project',
      description: 'Returns the files of a deployable game project: Cloudflare config, the manifest script, public/_headers and a working starter public/index.html. Write them into an empty folder.',
      inputSchema: { gameId },
      outputSchema: { files: z.record(z.string(), z.string()).describe('Path inside the project folder -> file contents.') },
      annotations: { readOnlyHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        const files = { ...starterProject(id), 'public/index.html': STARTER_GAME }
        const text = [
          `Write these files into an empty folder for "${id}", then install and deploy:`,
          '  npm install && npm run deploy',
          `It deploys the Worker "${workerName(id)}" to the Cloudflare account \`cf\` is logged in to (run \`npx cf auth login\` first if needed).`,
          'Ship the version preview URL: https://<first 8 characters of the "Current Version ID">-<worker>.<account>.workers.dev/',
          '',
          ...Object.entries(files).map(([path, content]) => `--- ${path}\n${content}`),
        ].join('\n')
        return { text, structured: { files } }
      }),
  )

  server.registerTool(
    'ship_version',
    {
      title: 'Ship a version',
      description: `Checks a deployed version of the game and ships it: it plays right away at the game's own link (from list_my_games), which the creator can share with anyone. It also asks for the game to be listed in the store so other families can find it; an adult reviews that, and once approved that exact version is what the store shows (a listed game keeps its current store version until then). Pass the version preview URL from the deploy. Every file listed in bitgames.json is downloaded and checked (at most ${mb(MAX_GAME_BYTES)}). Shipping again replaces the version at the link and the one waiting for review.`,
      inputSchema: { gameId, url: z.string().describe('The version preview URL, e.g. "https://1a2b3c4d-bitgames-bunny-hop.alice.workers.dev/".') },
      outputSchema: { url: z.string(), files: z.number(), bytes: z.number() },
    },
    ({ gameId: id, url }) =>
      run(async () => {
        if (!(await env.SUBMIT_LIMITER.limit({ key: creatorId })).success) throw new CreatorError('Too many submissions. Wait a minute.')
        const version = await shipVersion(creatorId, id, url)
        return {
          text: [
            `Shipped "${id}" (${version.files} files, ${mb(version.bytes)}). Play it now: ${previewUrl(origin, version.previewToken)}`,
            'Anyone with that link can play it, together too. It is also waiting for an adult to review it for the store, so other families can find it; check list_my_games later for the result.',
          ].join('\n'),
          structured: { url: version.url, files: version.files, bytes: version.bytes },
        }
      }),
  )

  server.registerTool(
    'withdraw_version',
    {
      title: 'Withdraw from review',
      description: "Stops asking for the latest version to be listed in the store. It still plays at the game's own link.",
      inputSchema: { gameId },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        await withdrawVersion(creatorId, id)
        return `"${id}" is no longer waiting to be listed. It still plays at its link.`
      }),
  )

  server.registerTool(
    'update_game_info',
    {
      title: 'Change game details',
      description: 'Changes the title, tagline, how-to-play text, emoji, colour, category or together flag. For a game in the store, the change is reviewed with the next shipped version.',
      inputSchema: { gameId, ...Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.optional()])) },
    },
    ({ gameId: id, ...changes }) =>
      run(async () => {
        const result = await updateInfo(creatorId, id, changes)
        return result === 'pending' ? `Saved. "${id}" is in the store, so the new details show there once a version is approved (ship_version).` : `Updated "${id}".`
      }),
  )

  server.registerTool(
    'list_my_games',
    {
      title: 'List my games',
      description: "Lists your games with their link, whether they're in the store, versions and any review note.",
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const games = await listOwned(creatorId)
        if (games.length === 0) return 'You have no games yet. Use create_game to start one.'
        return games
          .map((g) =>
            [
              `- ${g.id}: "${g.title}" — ${g.live ? 'in the store' : 'not in the store'}; ${STATUS_HELP[g.status] ?? g.status}`,
              `  play link: ${previewUrl(origin, g.preview_token)}${g.play_url ? '' : ' (ship a version first)'}`,
              g.play_url ? `  shipped version: ${g.play_url}` : null,
              g.live_url ? `  version in the store: ${g.live_url}` : null,
              g.review_url ? `  version waiting for review: ${g.review_url}` : null,
              g.live ? `  public page: ${origin}/game/${g.id}` : null,
              g.review_note ? `  review note: ${g.review_note}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n')
      }),
  )

  server.registerTool(
    'delete_game',
    {
      title: 'Delete a game',
      description: 'Removes one of your games from BitGames. Its Worker on your Cloudflare account is not touched; delete that yourself if you want.',
      inputSchema: { gameId },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        await deleteGame(creatorId, id)
        return `Deleted "${id}" from BitGames.`
      }),
  )

  return server
}
