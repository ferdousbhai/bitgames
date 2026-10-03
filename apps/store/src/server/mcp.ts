import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { CATEGORIES } from '#/lib/categories'
import { CreatorError, createGame, deleteGame, listOwned, previewUrl, submitVersion, updateInfo, withdrawVersion } from './games-store'
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
  draft: 'nothing waiting for review',
  review: 'a version is waiting for an adult to review it',
  public: 'the store has the latest version',
  rejected: 'not approved or taken down; see the note, fix it and submit a new version',
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
      description: 'Registers a new game in the BitGames catalog and returns its id and private preview URL. The game itself is deployed to your own Cloudflare account (see get_starter_project).',
      inputSchema: info,
    },
    (args) =>
      run(async () => {
        const game = await createGame(creatorId, args)
        return [
          `Created game "${game.id}".`,
          `Preview (once a version is submitted): ${previewUrl(origin, game.previewToken)}`,
          'Next: get_starter_project, build the game in public/, deploy it with `pnpm run deploy` (or npm), then submit_version with the version preview URL.',
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
          'Submit the version preview URL: https://<first 8 characters of the "Current Version ID">-<worker>.<account>.workers.dev/',
          '',
          ...Object.entries(files).map(([path, content]) => `--- ${path}\n${content}`),
        ].join('\n')
        return { text, structured: { files } }
      }),
  )

  server.registerTool(
    'submit_version',
    {
      title: 'Submit a version for review',
      description: `Checks a deployed version of the game and sends it to an adult reviewer. Pass the version preview URL from the deploy. Every file listed in bitgames.json is downloaded and checked (at most ${mb(MAX_GAME_BYTES)}). Once approved, that exact version appears in the store; a published game keeps its current version until then. Submitting again replaces the version waiting for review.`,
      inputSchema: { gameId, url: z.string().describe('The version preview URL, e.g. "https://1a2b3c4d-bitgames-bunny-hop.alice.workers.dev/".') },
      outputSchema: { url: z.string(), files: z.number(), bytes: z.number() },
    },
    ({ gameId: id, url }) =>
      run(async () => {
        if (!(await env.SUBMIT_LIMITER.limit({ key: creatorId })).success) throw new CreatorError('Too many submissions. Wait a minute.')
        const version = await submitVersion(creatorId, id, url)
        return {
          text: `"${id}" is waiting for review: ${version.url} (${version.files} files, ${mb(version.bytes)}). Try it at the preview URL from list_my_games; check list_my_games later for the result.`,
          structured: { url: version.url, files: version.files, bytes: version.bytes },
        }
      }),
  )

  server.registerTool(
    'withdraw_version',
    {
      title: 'Withdraw from review',
      description: 'Takes the version waiting for review back out of the queue.',
      inputSchema: { gameId },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        await withdrawVersion(creatorId, id)
        return `Withdrew the version of "${id}" that was waiting for review.`
      }),
  )

  server.registerTool(
    'update_game_info',
    {
      title: 'Change game details',
      description: 'Changes the title, tagline, how-to-play text, emoji, colour, category or together flag. For a game in the store, the change is reviewed with the next submitted version.',
      inputSchema: { gameId, ...Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.optional()])) },
    },
    ({ gameId: id, ...changes }) =>
      run(async () => {
        const result = await updateInfo(creatorId, id, changes)
        return result === 'pending' ? `Saved. "${id}" is in the store, so the new details show once a version is approved (submit_version).` : `Updated "${id}".`
      }),
  )

  server.registerTool(
    'list_my_games',
    {
      title: 'List my games',
      description: 'Lists your games with their status, preview URL, versions and any review note.',
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
              `  preview: ${previewUrl(origin, g.preview_token)}`,
              g.live_url ? `  live version: ${g.live_url}` : null,
              g.review_url ? `  version in review: ${g.review_url}` : null,
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
