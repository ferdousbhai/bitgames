/**
 * Publishes the starter games in ./games: upserts each manifest into D1 and
 * uploads its files to R2 under games/<id>/.
 *
 *   node scripts/seed.ts --local    # local dev state in .wrangler/
 *   node scripts/seed.ts --remote   # the deployed database and bucket
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, relative } from 'node:path'

const target = process.argv.includes('--remote') ? '--remote' : '--local'
const root = new URL('..', import.meta.url).pathname
const gamesDir = join(root, 'games')
const BUCKET = 'bitgames-games'
const DATABASE = 'bitgames'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
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

const sql = (value: string | number | boolean) =>
  typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(Number(value))

function wrangler(args: string[]) {
  execFileSync('pnpm', ['exec', 'wrangler', ...args], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

const ids = readdirSync(gamesDir).filter((name) => statSync(join(gamesDir, name)).isDirectory()).sort()
const now = Date.now()
const statements: string[] = []

ids.forEach((dir, index) => {
  const manifest: Manifest = JSON.parse(readFileSync(join(gamesDir, dir, 'manifest.json'), 'utf8'))
  if (manifest.id !== dir) throw new Error(`games/${dir}/manifest.json has id "${manifest.id}"`)
  const createdAt = now - index * 60_000
  statements.push(
    `INSERT INTO games (id, title, tagline, how_to_play, emoji, color, category, together, entry, status, featured, created_at, updated_at)
     VALUES (${[manifest.id, manifest.title, manifest.tagline, manifest.howToPlay, manifest.emoji, manifest.color, manifest.category, manifest.together, manifest.entry ?? 'index.html', 'public', manifest.featured, createdAt, now].map(sql).join(', ')})
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, tagline = excluded.tagline, how_to_play = excluded.how_to_play,
       emoji = excluded.emoji, color = excluded.color, category = excluded.category, together = excluded.together,
       entry = excluded.entry, status = excluded.status, featured = excluded.featured, updated_at = excluded.updated_at;`,
  )

  for (const file of files(join(gamesDir, dir))) {
    const path = relative(join(gamesDir, dir), file)
    if (path === 'manifest.json') continue
    const contentType = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream'
    wrangler(['r2', 'object', 'put', `${BUCKET}/games/${dir}/${path}`, '--file', file, '--content-type', contentType, target])
    console.log(`  uploaded games/${dir}/${path}`)
  }
})

const sqlFile = join(mkdtempSync(join(tmpdir(), 'bitgames-seed-')), 'seed.sql')
writeFileSync(sqlFile, statements.join('\n'))
wrangler(['d1', 'execute', DATABASE, target, '--file', sqlFile, '--yes'])
console.log(`seeded ${ids.length} games (${target.slice(2)})`)
