/**
 * Publishes a local game folder to BitGames through its MCP server, the way
 * an agent would: text files with write_file, binary files with
 * get_upload_url + curl. Only changed files are sent.
 *
 *   BG_URL=http://localhost:3030 BG_KEY=bg_... node creator-games/sync.mjs creator-games/crash-racers <gameId>
 */
import { Client } from '../apps/store/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { StreamableHTTPClientTransport } from '../apps/store/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const [dir, gameId] = process.argv.slice(2)
const BASE = process.env.BG_URL ?? 'http://localhost:3030'
const TEXT = new Set(['html', 'js', 'mjs', 'css', 'json', 'txt', 'gltf'])
const SKIP = new Set(['blender', 'node_modules', '.sync-cache.json'])

const files = (d) =>
  readdirSync(d).flatMap((name) => {
    if (SKIP.has(name) || name.startsWith('.')) return []
    const full = join(d, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })

const cacheFile = join(dir, `.sync-cache.${gameId}.json`)
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}
const client = new Client({ name: 'bitgames-sync', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(BASE + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + process.env.BG_KEY } } }))
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args })
  const text = r.content.map((c) => c.text).join('\n')
  if (r.isError) throw new Error(`${name} ${args.path ?? ''}: ${text}`)
  return text
}

let sent = 0
for (const file of files(dir)) {
  const path = relative(dir, file)
  const data = readFileSync(file)
  const hash = createHash('sha256').update(data).digest('hex')
  if (cache[path] === hash) continue
  const ext = path.split('.').pop()
  if (TEXT.has(ext)) {
    const out = await call('write_file', { gameId, path, content: data.toString('utf8') })
    if (out.includes('Warning')) console.log(out)
  } else {
    const url = (await call('get_upload_url', { gameId, path })).match(/'(https?:[^']+)'/)[1]
    execFileSync('curl', ['-fsS', '-T', file, url], { stdio: ['ignore', 'ignore', 'inherit'] })
  }
  cache[path] = hash
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1))
  console.log(`sent ${path} (${data.length} bytes)`)
  sent++
}
console.log(sent ? `synced ${sent} file(s)` : 'nothing changed')
await client.close()
