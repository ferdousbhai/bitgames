/**
 * Deploys example games to the Cloudflare account `cf` is logged in to, the
 * same way any creator deploys a BitGames game, and records each new version
 * URL in its game.json (which `pnpm --dir apps/store seed` lists in the store).
 *
 *   node examples/publish.mjs crash-racers bunny-hop
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const examples = fileURLToPath(new URL('.', import.meta.url))

for (const id of process.argv.slice(2)) {
  const dir = join(examples, id)
  const output = execFileSync('pnpm', ['run', 'deploy'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const version = /Current Version ID: ([0-9a-f-]{36})/.exec(output)?.[1]
  const worker = /https:\/\/([a-z0-9-]+)\.([a-z0-9-]+)\.workers\.dev/.exec(output)
  if (!version || !worker) throw new Error(`${id}: could not find the version in the deploy output:\n${output}`)
  const url = `https://${version.slice(0, 8)}-${worker[1]}.${worker[2]}.workers.dev/`
  const file = join(dir, 'game.json')
  const game = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({ ...game, url }, null, 2) + '\n')
  console.log(`${id}: ${url}`)
}
