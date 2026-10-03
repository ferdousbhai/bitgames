import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CATEGORIES } from '#/lib/categories'
import {
  CreatorError,
  createGame,
  createUploadUrl,
  deleteFile,
  deleteGame,
  listFiles,
  listOwned,
  previewUrl,
  readTextFile,
  reopenGame,
  submitForReview,
  updateInfo,
  writeTextFile,
} from './games-store'
import { GUIDE, INSTRUCTIONS } from './guide'
import { MAX_FILE_BYTES } from './limits'

/**
 * Outside URLs the code would actually try to load: imports, fetch, src/href,
 * CSS url() and import-map entries. URLs in comments or plain text are fine.
 */
function loadedUrls(content: string): string[] {
  const patterns = [
    /\bfrom\s*['"](https?:\/\/[^'"]+)/g,
    /\bimport\s*\(?\s*['"](https?:\/\/[^'"]+)/g,
    /\bfetch\s*\(\s*['"`](https?:\/\/[^'"`]+)/g,
    /\b(?:src|href)\s*=\s*['"](https?:\/\/[^'"]+)/g,
    /url\(\s*['"]?(https?:\/\/[^'")]+)/g,
    /"[\w@/.-]+"\s*:\s*"(https?:\/\/[^"]+)"/g,
    /\.loadAsync\s*\(\s*['"`](https?:\/\/[^'"`]+)/g,
  ]
  const found = new Set<string>()
  for (const re of patterns) for (const m of content.matchAll(re)) found.add(m[1]!)
  return [...found].slice(0, 5)
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })

/** Turns creator mistakes into tool errors the agent can read and fix; anything else is a real failure. */
async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return ok(await fn())
  } catch (error) {
    if (error instanceof CreatorError) return { content: [{ type: 'text', text: error.message }], isError: true }
    throw error
  }
}

const gameId = z.string().describe('The game id returned by create_game, e.g. "bunny-hop".')
const filePath = z.string().describe('Path inside the game folder, e.g. "index.html", "js/main.js" or "models/bunny.glb".')

const info = {
  title: z.string().min(2).max(40).describe('Short, fun name a child can read, e.g. "Bunny Hop".'),
  tagline: z.string().min(5).max(90).describe('One simple sentence, e.g. "Help the bunny hop over logs!"'),
  howToPlay: z.string().min(5).max(200).describe('One or two short sentences explaining the controls.'),
  emoji: z.string().min(1).max(16).describe('One emoji for the game tile, e.g. "🐰".'),
  color: z.string().describe('Tile colour as hex, e.g. "#8ac926". Bright, cheerful colours work best.'),
  category: z.enum(CATEGORIES.map((c) => c.slug) as [string, ...string[]]).describe('Which shelf the game appears on.'),
  together: z.boolean().describe('True only if two or more people can play at the same time.'),
}

const STATUS_HELP: Record<string, string> = {
  draft: 'draft (only you can see it; the preview link pauses after 7 days without changes)',
  review: 'waiting for an adult to review it',
  public: 'published for everyone',
  rejected: 'not approved; see the note, fix it and submit again',
}

/** A fresh server per request: the endpoint is stateless and each call is authenticated on its own. */
export function createMcpServer(creatorId: string, origin: string) {
  const server = new McpServer({ name: 'bitgames', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'get_guide',
    {
      title: 'Read the game-making guide',
      description: 'The rules for BitGames games (young children are the players), the three.js setup, the sandbox, and how to bring in Blender models. Read this before building.',
      annotations: { readOnlyHint: true },
    },
    async () => ok(GUIDE),
  )

  server.registerTool(
    'create_game',
    {
      title: 'Create a game',
      description: 'Creates a new draft game with a working starter index.html, and returns its id and private preview URL.',
      inputSchema: info,
    },
    (args) =>
      run(async () => {
        const game = await createGame(creatorId, args)
        return [
          `Created draft game "${game.id}".`,
          `Preview: ${previewUrl(origin, game.previewToken)}`,
          'Next: read index.html with read_file, rewrite it with write_file, and add models with get_upload_url.',
        ].join('\n')
      }),
  )

  server.registerTool(
    'update_game_info',
    {
      title: 'Change game details',
      description: 'Changes the title, tagline, how-to-play text, emoji, colour, category or together flag of a draft game.',
      inputSchema: { gameId, ...Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.optional()])) },
    },
    ({ gameId: id, ...changes }) =>
      run(async () => {
        await updateInfo(creatorId, id, changes)
        return `Updated "${id}".`
      }),
  )

  server.registerTool(
    'list_my_games',
    {
      title: 'List my games',
      description: 'Lists your games with their status, preview URL and any review note.',
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const games = await listOwned(creatorId)
        if (games.length === 0) return 'You have no games yet. Use create_game to start one.'
        return games
          .map((g) =>
            [
              `- ${g.id}: "${g.title}" (${STATUS_HELP[g.status] ?? g.status})`,
              `  preview: ${previewUrl(origin, g.preview_token)}`,
              g.status === 'public' ? `  public page: ${origin}/game/${g.id}` : null,
              g.review_note ? `  review note: ${g.review_note}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n')
      }),
  )

  server.registerTool(
    'list_files',
    {
      title: 'List game files',
      description: 'Lists the files in a game and their sizes.',
      inputSchema: { gameId },
      annotations: { readOnlyHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        const files = await listFiles(creatorId, id)
        return files.length ? files.map((f) => `${f.path}  ${f.bytes} bytes`).join('\n') : 'No files yet.'
      }),
  )

  server.registerTool(
    'read_file',
    {
      title: 'Read a game file',
      description: 'Returns the contents of a text file (.html .js .css .json) in a game.',
      inputSchema: { gameId, path: filePath },
      annotations: { readOnlyHint: true },
    },
    ({ gameId: id, path }) => run(() => readTextFile(creatorId, id, path)),
  )

  server.registerTool(
    'write_file',
    {
      title: 'Write a game file',
      description: 'Creates or replaces a text file (.html .js .css .json, up to 1 MB) in a draft game. Binary files go through get_upload_url.',
      inputSchema: { gameId, path: filePath, content: z.string().describe('The full file contents.') },
    },
    ({ gameId: id, path, content }) =>
      run(async () => {
        const bytes = await writeTextFile(creatorId, id, path, content)
        const external = loadedUrls(content)
        return external.length
          ? `Wrote ${path} (${bytes} bytes).\nWarning: games can't load anything from other websites, so these URLs will be blocked: ${external.join(', ')}. Use the /vendor/ three.js from the guide, and put other files in the game itself.`
          : `Wrote ${path} (${bytes} bytes).`
      }),
  )

  server.registerTool(
    'get_upload_url',
    {
      title: 'Get an upload link',
      description: `Returns a one-time link, valid for 15 minutes, for uploading one binary file (a Blender .glb model, image or sound, up to ${MAX_FILE_BYTES / 1024 / 1024} MB) into a draft game. Upload it with: curl -fsS -T <local file> <url>`,
      inputSchema: { gameId, path: filePath },
    },
    ({ gameId: id, path }) =>
      run(async () => {
        const url = await createUploadUrl(creatorId, id, path, origin)
        return `Upload with:\ncurl -fsS -T <path to your local file> '${url}'\nThe link works once and expires in 15 minutes.`
      }),
  )

  server.registerTool(
    'delete_file',
    {
      title: 'Delete a game file',
      description: 'Deletes one file from a draft game.',
      inputSchema: { gameId, path: filePath },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id, path }) =>
      run(async () => {
        await deleteFile(creatorId, id, path)
        return `Deleted ${path}.`
      }),
  )

  server.registerTool(
    'submit_for_review',
    {
      title: 'Submit for review',
      description: 'Sends a finished game to an adult reviewer. Once approved it appears in the store. The game cannot change while it waits.',
      inputSchema: { gameId },
    },
    ({ gameId: id }) =>
      run(async () => {
        await submitForReview(creatorId, id)
        return `"${id}" is waiting for review. Check list_my_games later for the result.`
      }),
  )

  server.registerTool(
    'reopen_game',
    {
      title: 'Reopen a game for editing',
      description: 'Moves a game that is waiting for review or published back to draft so it can be edited. A published game is taken out of the store until it is approved again.',
      inputSchema: { gameId },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        await reopenGame(creatorId, id)
        return `"${id}" is a draft again.`
      }),
  )

  server.registerTool(
    'delete_game',
    {
      title: 'Delete a game',
      description: 'Permanently deletes one of your games and all its files.',
      inputSchema: { gameId },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        await deleteGame(creatorId, id)
        return `Deleted "${id}".`
      }),
  )

  return server
}
