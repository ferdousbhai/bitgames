import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CATEGORIES } from '#/lib/categories'
import { previewUrl } from './games-store'
import { isGameId } from './limits'
import { type ReviewGame, decide, findForReview, listForReview, listWaitingFiles, readWaitingFile } from './review'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** Review mistakes (wrong id, game changed meanwhile) come back as tool errors the agent can read. */
async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: await fn() }] }
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
  }
}

const INSTRUCTIONS = `You are reviewing games for BitGames, a game store for children of about 4 to 8.
Every game already plays at its creator's own link. Reviewing only decides whether it is listed in the store, where other families can find it.
For each waiting game: read_submission, read its code with read_submission_file, play it at its play link, then approve_submission or send_back_submission with a short, kind note that says what to fix.`

const gameId = z.string().refine(isGameId, 'Not a game id.').describe('The game id, e.g. "bunny-hop".')

const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug

function describe(game: ReviewGame, origin: string) {
  return [
    `- ${game.id}: ${game.emoji} "${game.title}" (${categoryName(game.category)}${game.together ? ', play together' : ''})`,
    `  ${game.status === 'review' ? (game.live ? 'UPDATE to a game already in the store' : 'NEW, not in the store yet') : 'in the store'}`,
    `  tagline: ${game.tagline}`,
    `  how to play: ${game.how_to_play}`,
    game.pending_info ? `  new details waiting with this version: ${game.pending_info}` : null,
    game.status === 'review' ? `  play the waiting version: ${previewUrl(origin, game.preview_token)}` : `  store page: ${origin}/game/${game.id}`,
    game.review_url && game.status === 'review' ? `  version: ${game.review_url}` : null,
    game.live && game.status === 'review' ? `  version in the store now: ${game.live_url}` : null,
    game.creator_id === null ? '  made by BitGames' : null,
    `  last changed: ${new Date(game.updated_at).toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Tools for the store's reviewer (authenticated with ADMIN_KEY), so a local agent can do the reviewing. */
export function createReviewMcpServer(origin: string) {
  const server = new McpServer({ name: 'bitgames-review', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_submissions',
    {
      title: 'List games waiting for review',
      description: 'Lists the games waiting to be listed in the store, oldest first. With includeListed, also lists the games already in the store (to take one down).',
      inputSchema: { includeListed: z.boolean().optional().describe('Also list the games already in the store.') },
      annotations: { readOnlyHint: true },
    },
    ({ includeListed }) =>
      run(async () => {
        const games = await listForReview()
        const waiting = games.filter((g) => g.status === 'review')
        const listed = games.filter((g) => g.live && g.status !== 'review')
        return [
          waiting.length ? `Waiting for review (${waiting.length}):\n${waiting.map((g) => describe(g, origin)).join('\n')}` : 'Nothing is waiting for review.',
          includeListed ? `\nIn the store (${listed.length}):\n${listed.map((g) => describe(g, origin)).join('\n')}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      }),
  )

  server.registerTool(
    'read_submission',
    {
      title: 'Look at a waiting game',
      description: "A waiting game's details, the link to play it, and every file of the shipped version (checked to be exactly what was shipped).",
      inputSchema: { gameId },
      annotations: { readOnlyHint: true },
    },
    ({ gameId: id }) =>
      run(async () => {
        const game = await findForReview(id)
        if (!game) throw new Error(`There is no game "${id}".`)
        const { url, paths } = await listWaitingFiles(id)
        return [
          describe(game, origin),
          game.review_note ? `  earlier review note: ${game.review_note}` : null,
          '',
          `Files (read text files with read_submission_file; open others at ${url}<path>):`,
          ...paths.map((p) => `  ${p}`),
        ]
          .filter((line) => line !== null)
          .join('\n')
      }),
  )

  server.registerTool(
    'read_submission_file',
    {
      title: 'Read a file of a waiting game',
      description: 'Returns one text file (html, js, css, json...) of the waiting version, checked against its bitgames.json.',
      inputSchema: { gameId, path: z.string().describe('A path from read_submission, e.g. "index.html" or "js/main.js".') },
      annotations: { readOnlyHint: true },
    },
    ({ gameId: id, path }) => run(() => readWaitingFile(id, path)),
  )

  server.registerTool(
    'approve_submission',
    {
      title: 'List a game in the store',
      description: 'Approves the waiting version: it is checked once more, then the store lists exactly that version (and any new details). For an update, it replaces the version in the store.',
      inputSchema: { gameId },
    },
    ({ gameId: id }) =>
      run(async () => {
        await decide(id, 'approve', null)
        return `"${id}" is in the store: ${origin}/game/${id}`
      }),
  )

  server.registerTool(
    'send_back_submission',
    {
      title: 'Turn down a waiting game',
      description: "Doesn't list the waiting version. The creator's agent sees the note, so say kindly and concretely what to fix. The game still plays at its creator's link, and an update leaves the version already in the store.",
      inputSchema: { gameId, note: z.string().min(5).max(500).describe('What to fix, e.g. "The bees chase and sting the player, which can scare young children. Make them friendly."') },
    },
    ({ gameId: id, note }) =>
      run(async () => {
        await decide(id, 'reject', note.trim())
        return `Sent "${id}" back with your note.`
      }),
  )

  server.registerTool(
    'take_down_game',
    {
      title: 'Take a game out of the store',
      description: "Removes a listed game from the store. It still plays at its creator's link; the creator sees the note and can ship a fixed version.",
      inputSchema: { gameId, note: z.string().min(5).max(500).describe('Why, and what to fix.') },
      annotations: { destructiveHint: true },
    },
    ({ gameId: id, note }) =>
      run(async () => {
        await decide(id, 'unpublish', note.trim())
        return `Took "${id}" out of the store.`
      }),
  )

  return server
}
