import { build } from 'esbuild'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'

export const info = { title: 'Test Game', tagline: 'Tap the happy toy!', howToPlay: 'Tap to play!', emoji: '⭐', color: '#abcdef', category: 'pop', together: false }
export const urls = ['https://12345678-bitgames-test.alice.workers.dev/', 'https://23456789-bitgames-test.alice.workers.dev/']
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

export async function testStore() {
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean }
  const previousEqual = subtle.timingSafeEqual
  subtle.timingSafeEqual = (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
  const dir = mkdtempSync(join(tmpdir(), 'bitgames-tests-'))
  const root = join(import.meta.dirname, '..')
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(join(root, 'migrations')).sort()) db.exec(readFileSync(join(root, 'migrations', file), 'utf8'))
  const DB = {
    prepare(sql: string) {
      let values: SQLInputValue[] = []
      const statement = {
        bind(...args: SQLInputValue[]) { values = args; return statement },
        async first() { return db.prepare(sql).get(...values) ?? null },
        async all() { return { results: db.prepare(sql).all(...values) } },
        async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } } },
      }
      return statement
    },
    async batch(statements: { run: () => Promise<{ meta: { changes: number } }> }[]) {
      db.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        db.exec('COMMIT')
        return results
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
  const env = { DB, ADMIN_KEY: 'test-admin-key', REVIEW_LIMITER: { async limit() { return { success: true } } }, SUBMIT_LIMITER: { async limit() { return { success: true } } } }
  Object.defineProperty(globalThis, '__bitgamesTestEnv', { configurable: true, value: env })
  await build({
    stdin: { contents: `export * from './src/server/games-store.ts'; export * from './src/server/review.ts'; export * from './src/server/mcp.ts'; export * from './src/server/mcp-http.ts'; export * from './src/server/review-api.ts'; export * from './src/server/game-assets.ts'; export * from './src/server/creators.ts'; export * from './src/server/preview-lookup.ts'; export * from './src/lib/site.ts'; export { download } from './src/server/versions.ts'`, resolveDir: root, sourcefile: 'test-entry.ts' },
    outfile: join(dir, 'store.mjs'), bundle: true, platform: 'node', format: 'esm', tsconfig: join(root, 'tsconfig.json'),
    plugins: [{ name: 'test-env', setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }))
      b.onResolve({ filter: /^@tanstack\/react-start\/server$/ }, () => ({ path: 'request', namespace: 'test' }))
      b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env' ? 'export const env = globalThis.__bitgamesTestEnv' : 'export function getRequestHeader() { throw new Error("Pass the request IP explicitly in standalone tests") }' }))
    } }],
  })
  type API = typeof import('../src/server/games-store.ts') & typeof import('../src/server/review.ts') & typeof import('../src/server/mcp.ts') & typeof import('../src/server/mcp-http.ts') & typeof import('../src/server/review-api.ts') & typeof import('../src/server/game-assets.ts') & typeof import('../src/server/creators.ts') & typeof import('../src/server/preview-lookup.ts') & typeof import('../src/lib/site.ts') & typeof import('../src/server/versions.ts')
  const api: API = await import(join(dir, 'store.mjs'))
  const previousFetch = globalThis.fetch
  const files = urls.map((_, i) => ({ 'index.html': `<html><script src="./main.js"></script>Version ${i}</html>`, 'main.js': `console.log(${i})` }))
  let onFetch: ((url: string) => Promise<void>) | undefined
  const fetcher: typeof fetch = async input => {
    const url = String(input)
    await onFetch?.(url)
    const i = urls.findIndex(base => url.startsWith(base))
    if (i < 0) throw new Error(`Unexpected network request: ${url}`)
    const path = url.slice(urls[i]!.length)
    if (path === 'bitgames.json') return new Response(JSON.stringify({ files: Object.fromEntries(Object.entries(files[i]!).map(([path, text]) => [path, hash(text)])) }))
    const body = Object.entries(files[i]!).find(([p]) => p === path)?.[1]
    return new Response(body, { status: body === undefined ? 404 : 200, headers: { 'content-security-policy': api.GAME_CSP_HEADER, 'allow-csp-from': '*', 'access-control-allow-origin': '*' } })
  }
  globalThis.fetch = fetcher
  const credentials = await api.createCreator()
  const creatorId = (await api.authenticate(new Request('https://bitgames.store/mcp', { headers: { authorization: `Bearer ${credentials.key}` } })))!
  const game = await api.createGame(creatorId, info)
  return { api, db, env, files, game, creatorId, credentials, fetcher, onFetch(fn: typeof onFetch) { onFetch = fn }, close() { globalThis.fetch = previousFetch; if (previousEqual) subtle.timingSafeEqual = previousEqual; else delete subtle.timingSafeEqual; db.close(); rmSync(dir, { recursive: true, force: true }) } }
}
