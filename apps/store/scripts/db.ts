/**
 * Database and storage setup for the store.
 *
 *   node scripts/db.ts migrate            # local: needs `pnpm dev` running
 *   node scripts/db.ts seed               # local: publish the starter games in ./games
 *   node scripts/db.ts migrate --remote   # remote: needs `cf auth login`
 *   node scripts/db.ts seed --remote
 *
 * Local commands go through the dev server's local explorer API, because
 * `cf ... --local` commands don't exit yet. Remote commands use the cf CLI.
 * Migrations are tracked in the same d1_migrations table that cf and Wrangler use.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import config from '../cloudflare.config.ts'
import { CONTENT_TYPES, extensionOf, liveKey, objectKey } from '../src/server/limits.ts'

const DATABASE_ID = config.worker.env.DB.id!
const BUCKET = config.worker.env.GAMES.name!
const LOCAL_API = `${process.env.DEV_URL ?? 'http://localhost:3030'}/cdn-cgi/local/explorer/api`

const root = new URL('..', import.meta.url).pathname
const remote = process.argv.includes('--remote')
const command = process.argv[2]

function cf(args: string[]): string {
  return execFileSync('pnpm', ['exec', 'cf', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

async function localApi(path: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(LOCAL_API + path, init)
  } catch {
    throw new Error(`Can't reach the dev server at ${LOCAL_API}. Start it with \`pnpm dev\` first.`)
  }
  const body = (await response.json()) as { success: boolean; errors: unknown[]; result: unknown }
  if (!response.ok || !body.success) throw new Error(`${path}: ${JSON.stringify(body.errors)}`)
  return body.result
}

/** Runs SQL and returns the rows of the last statement. */
async function sql(query: string): Promise<Record<string, unknown>[]> {
  if (remote) {
    const out = JSON.parse(cf(['d1', 'query', DATABASE_ID, '--sql', query])) as { result?: { results: Record<string, unknown>[] }[] } | { results: Record<string, unknown>[] }[]
    const results = Array.isArray(out) ? out : (out.result ?? [])
    return results.at(-1)?.results ?? []
  }
  const result = (await localApi(`/d1/database/${DATABASE_ID}/raw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sql: query }),
  })) as { results: { columns: string[]; rows: unknown[][] } }[]
  const last = result.at(-1)?.results
  return (last?.rows ?? []).map((row) => Object.fromEntries(last!.columns.map((c, i) => [c, row[i]])))
}

async function putObject(key: string, file: string, contentType: string) {
  if (remote) {
    cf(['r2', 'objects', 'put', key, '--bucket-name', BUCKET, '--file', file, '--content-type', contentType])
    return
  }
  // The local explorer routes on the encoded key; slashes must be %2F.
  await localApi(`/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: readFileSync(file),
  })
}

async function migrate() {
  if (remote) {
    console.log(cf(['d1', 'migrations', 'apply', DATABASE_ID, '--dir', 'migrations']))
    return
  }
  await sql(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  const applied = new Set((await sql('SELECT name FROM d1_migrations')).map((r) => String(r.name)))
  const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) continue
    await sql(readFileSync(join(root, 'migrations', file), 'utf8'))
    await sql(`INSERT INTO d1_migrations (name) VALUES ('${file}')`)
    console.log(`applied ${file}`)
  }
  console.log('local database is up to date')
}

interface Manifest {
  id: string
  title: string
  tagline: string
  howToPlay: string
  emoji: string
  color: string
  category: string
  together: boolean
  featured: boolean
  entry?: string
}

const literal = (value: string | number | boolean) =>
  typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(Number(value))

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? filesIn(full) : [full]
  })
}

/** Publishes the starter games in ./games as BitGames-made, already-public games. */
async function seed() {
  const gamesDir = join(root, 'games')
  const ids = readdirSync(gamesDir).filter((name) => statSync(join(gamesDir, name)).isDirectory()).sort()
  const now = Date.now()
  for (const [index, dir] of ids.entries()) {
    const m: Manifest = JSON.parse(readFileSync(join(gamesDir, dir, 'manifest.json'), 'utf8'))
    if (m.id !== dir) throw new Error(`games/${dir}/manifest.json has id "${m.id}"`)
    for (const file of filesIn(join(gamesDir, dir))) {
      const path = relative(join(gamesDir, dir), file)
      if (path === 'manifest.json') continue
      // Built-in games are published straight away: draft and live copies are the same.
      const type = CONTENT_TYPES[extensionOf(path)] ?? 'application/octet-stream'
      for (const key of [objectKey(dir, path), liveKey(dir, path)]) await putObject(key, file, type)
    }
    const values = [m.id, m.title, m.tagline, m.howToPlay, m.emoji, m.color, m.category, m.together, m.entry ?? 'index.html', m.featured, now - index * 60_000, now]
    await sql(
      `INSERT INTO games (id, title, tagline, how_to_play, emoji, color, category, together, entry, featured, created_at, updated_at, status, live, preview_token)
       VALUES (${values.map(literal).join(', ')}, 'public', 1, lower(hex(randomblob(16))))
       ON CONFLICT (id) DO UPDATE SET title = excluded.title, tagline = excluded.tagline, how_to_play = excluded.how_to_play,
         emoji = excluded.emoji, color = excluded.color, category = excluded.category, together = excluded.together,
         entry = excluded.entry, featured = excluded.featured, updated_at = excluded.updated_at, live = 1, status = 'public'`,
    )
    console.log(`published ${m.id}`)
  }
  console.log(`seeded ${ids.length} games (${remote ? 'remote' : 'local'})`)
}

if (command === 'migrate') await migrate()
else if (command === 'seed') await seed()
else {
  console.error('usage: node scripts/db.ts <migrate|seed> [--remote]')
  process.exit(1)
}
