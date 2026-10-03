/**
 * Publishes a local game folder to BitGames through its MCP server, the way
 * an agent would: text files with write_file, binary files with
 * get_upload_url + curl, and files deleted locally with delete_file.
 * A local cache of size + modification time skips unchanged files.
 *
 *   BG_URL=http://localhost:3030 BG_KEY=bg_... node creator-games/sync.mjs creator-games/crash-racers <gameId>
 */
import { Client } from '../apps/store/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { StreamableHTTPClientTransport } from '../apps/store/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { TEXT_EXTENSIONS, extensionOf } from '../apps/store/src/server/limits.ts'

const [dir, gameId] = process.argv.slice(2)
const BASE = process.env.BG_URL ?? 'http://localhost:3030'
const SKIP = new Set(['blender', 'node_modules'])
const CONCURRENCY = 4

const localFiles = (d) =>
  readdirSync(d).flatMap((name) => {
    if (SKIP.has(name) || name.startsWith('.')) return []
    const full = join(d, name)
    return statSync(full).isDirectory() ? localFiles(full) : [full]
  })

const cacheFile = join(dir, `.sync-cache.${gameId}.json`)
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}
const client = new Client({ name: 'bitgames-sync', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(BASE + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + process.env.BG_KEY } } }))
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args })
  if (r.isError) throw new Error(`${name} ${args.path ?? ''}: ${r.content.map((c) => c.text).join('\n')}`)
  return r
}

async function send(file, path) {
  if (TEXT_EXTENSIONS.has(extensionOf(path))) {
    const { structuredContent } = await call('write_file', { gameId, path, content: readFileSync(file, 'utf8') })
    if (structuredContent.blockedUrls.length) console.log(`${path} loads blocked URLs: ${structuredContent.blockedUrls.join(', ')}`)
  } else {
    const { structuredContent } = await call('get_upload_url', { gameId, path })
    await promisify(execFile)('curl', ['-fsS', '-T', file, structuredContent.url])
  }
}

const files = localFiles(dir).map((file) => {
  const { size, mtimeMs } = statSync(file)
  return { file, path: relative(dir, file), stamp: `${size}:${mtimeMs}` }
})
const changed = files.filter((f) => cache[f.path] !== f.stamp)

/** Runs `fn` over `items` with at most CONCURRENCY in flight. */
async function inPool(items, fn) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
}

try {
  await inPool(changed, async ({ file, path, stamp }) => {
    await send(file, path)
    cache[path] = stamp
    console.log(`sent ${path}`)
  })
} finally {
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1))
}

// Files removed locally are removed from the game too.
const local = new Set(files.map((f) => f.path))
const { structuredContent } = await call('list_files', { gameId })
await inPool(structuredContent.files.filter((f) => !local.has(f.path)), async ({ path }) => {
  await call('delete_file', { gameId, path })
  delete cache[path]
  console.log(`deleted ${path}`)
})
writeFileSync(cacheFile, JSON.stringify(cache, null, 1))
console.log(changed.length ? `synced ${changed.length} file(s)` : 'nothing changed')
await client.close()
