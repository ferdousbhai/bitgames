/**
 * Database setup for the store's remote D1 database. Needs `cf auth login`.
 *
 *   node scripts/db.ts migrate   # apply migrations, then backfill version records
 *   node scripts/db.ts seed      # list the deployed games in ../../examples
 *
 * Migrations are tracked in the d1_migrations table.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import config from '../cloudflare.config.ts'
import { parseVersionUrl } from '../src/server/limits.ts'
import { checkVersion } from '../src/server/versions.ts'
import { backfillVersions, literal } from './backfill-versions.ts'

const DATABASE_ID = config.worker.env.DB.id!

const root = fileURLToPath(new URL('..', import.meta.url))
const command = process.argv[2]

function cf(args: string[]): string {
  return execFileSync('pnpm', ['exec', 'cf', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

/** Runs SQL and returns the rows of the last statement. */
async function sql(query: string): Promise<Record<string, unknown>[]> {
  const out = JSON.parse(cf(['d1', 'query', DATABASE_ID, '--sql', query])) as { result?: { results: Record<string, unknown>[] }[] } | { results: Record<string, unknown>[] }[]
  const results = Array.isArray(out) ? out : (out.result ?? [])
  return results.at(-1)?.results ?? []
}

async function migrate() {
  console.log(cf(['d1', 'migrations', 'apply', DATABASE_ID, '--dir', 'migrations']))
  await backfillVersions(sql)
}

interface ExampleGame {
  id: string
  title: string
  tagline: string
  howToPlay: string
  emoji: string
  color: string
  category: string
  together: boolean
  featured: boolean
  /** The deployed version to list, written by examples/publish.mjs. */
  url?: string
}

/**
 * Lists the games in ../../examples as BitGames-made, already-approved games,
 * pinned to the version each game.json names. Those versions run on our own
 * Cloudflare account, like any creator's game.
 */
async function seed() {
  const examples = join(root, '..', '..', 'examples')
  const ids = readdirSync(examples).filter((name) => existsSync(join(examples, name, 'game.json'))).sort()
  const now = Date.now()
  let seeded = 0
  for (const [index, dir] of ids.entries()) {
    const game: ExampleGame = JSON.parse(readFileSync(join(examples, dir, 'game.json'), 'utf8'))
    if (game.id !== dir) throw new Error(`examples/${dir}/game.json has id "${game.id}"`)
    if (!game.url || !parseVersionUrl(game.url)) {
      console.log(`skipped ${game.id}: deploy it first (node examples/publish.mjs ${game.id})`)
      continue
    }
    const checked = await checkVersion(game.url)
    const versionId = randomUUID()
    const info = { title: game.title, tagline: game.tagline, howToPlay: game.howToPlay, emoji: game.emoji, color: game.color, category: game.category, together: game.together }
    const values = [game.id, game.title, game.tagline, game.howToPlay, game.emoji, game.color, game.category, game.together, game.featured,
      now - index * 60_000, now, checked.url, checked.manifest, checked.cover]
    await sql(
      `INSERT INTO games (id, title, tagline, how_to_play, emoji, color, category, together, featured, created_at, updated_at,
                          live_url, live_manifest, cover, verified_at, status, live, preview_token, play_url, live_version, play_version, revision)
       VALUES (${values.map(literal).join(', ')}, ${now}, 'public', 1, lower(hex(randomblob(16))), ${literal(checked.url)}, ${literal(versionId)}, ${literal(versionId)}, ${literal(randomUUID())})
       ON CONFLICT (id) DO UPDATE SET title = excluded.title, tagline = excluded.tagline, how_to_play = excluded.how_to_play,
         emoji = excluded.emoji, color = excluded.color, category = excluded.category, together = excluded.together,
         featured = excluded.featured, updated_at = excluded.updated_at, live_url = excluded.live_url,
         live_manifest = excluded.live_manifest, cover = excluded.cover, verified_at = excluded.verified_at, live = 1, status = 'public',
         play_url = excluded.play_url, play_version = excluded.play_version, live_version = excluded.live_version,
         review_version = NULL, review_url = NULL, review_manifest = NULL, review_cover = NULL, review_note = NULL, pending_info = NULL, revision = excluded.revision;
       INSERT INTO game_versions (id, game_id, upstream_url, manifest_hash, manifest_json, info_json, cover, file_count, bytes, created_at, decision)
       VALUES (${[versionId, game.id, checked.url, checked.manifest, checked.manifestJson, JSON.stringify(info), checked.cover, checked.files, checked.bytes, now, 'approved'].map(literal).join(', ')})`
    )
    seeded++
    console.log(`listed ${game.id} at ${game.url}`)
  }
  console.log(`seeded ${seeded} games`)
}

if (command === 'migrate') await migrate()
else if (command === 'seed') await seed()
else {
  console.error('usage: node scripts/db.ts <migrate|seed>')
  process.exit(1)
}
