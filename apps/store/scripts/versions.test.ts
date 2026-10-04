import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createHash } from 'node:crypto'
import { testStore, urls, hash } from './test-store.ts'

it('playback rejects unknown paths, changed bytes and upstream request variations', async () => {
  const s = await testStore()
  try {
    const shipped = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const base = 'https://bitgames.store' + s.api.versionBase(shipped.versionId!)
    const page = await s.api.serveGameAsset(new Request(base + 'index.html?debug'))
    assert.equal(page.status, 200)
    assert.equal(await page.text(), s.files[0]!['index.html'])
    assert.ok(page.headers.get('content-security-policy')?.includes(base))
    assert.ok(!page.headers.get('content-security-policy')?.includes(urls[0]!))
    assert.equal(page.headers.get('access-control-allow-origin'), '*')
    assert.equal((await s.api.serveGameAsset(new Request(base + 'secret.js'))).status, 404)
    s.files[0]!['main.js'] = 'console.log("changed")'
    assert.equal((await s.api.serveGameAsset(new Request(base + 'main.js'))).status, 502)
    assert.equal((await s.api.serveGameAsset(new Request(base + 'main.js', { method: 'POST' }))).status, 405)
  } finally { s.close() }
})

it('download cancels oversized streams and refuses external redirects before following them', async () => {
  const s = await testStore()
  try {
    let cancelled = false
    let pulls = 0
    globalThis.fetch = async () => new Response(new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(8)) }, cancel() { cancelled = true } }))
    await assert.rejects(s.api.download(urls[0]!, 'large.bin', 10), /download limit/)
    assert.equal(cancelled, true)
    assert.ok(pulls <= 3)
    let requests = 0
    globalThis.fetch = async () => { requests++; return new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/game.js' } }) }
    await assert.rejects(s.api.download(urls[0]!, 'main.js', 100), /another site/)
    assert.equal(requests, 1)
  } finally { s.close() }
})

it('validation rejects invalid and oversized manifests', async () => {
  const s = await testStore()
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ files: { 'index.html': hash('ok'), '../secret.js': hash('bad') } }))
    await assert.rejects(s.api.checkVersion(urls[0]!), /valid file paths/)
    globalThis.fetch = async () => new Response('x'.repeat(65 * 1024))
    await assert.rejects(s.api.checkVersion(urls[0]!), /download limit/)
  } finally { s.close() }
})

it('aggregate file limits stop downloading once the game budget is exhausted', async () => {
  const s = await testStore()
  try {
    const chunk = new Uint8Array(64 * 1024)
    const digest = createHash('sha256')
    for (let i = 0; i < 400; i++) digest.update(chunk)
    const expected = digest.digest('hex')
    const files = { 'index.html': expected, 'a.bin': expected, 'b.bin': expected }
    let downloads = 0
    globalThis.fetch = async input => {
      if (String(input).endsWith('bitgames.json')) return new Response(JSON.stringify({ files }))
      downloads++
      let chunks = 0
      return new Response(new ReadableStream({ pull(controller) { if (chunks++ < 400) controller.enqueue(chunk); else controller.close() } }), { headers: { 'content-length': String(25 * 1024 * 1024) } })
    }
    await assert.rejects(s.api.checkVersion(urls[0]!), /download limit/)
    assert.equal(downloads, 3)
  } finally { s.close() }
})

it('a stalled fetch is cancelled by the deadline', async (t) => {
  const s = await testStore()
  try {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let cancelled = false
    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { cancelled = true; reject(new Error('Aborted')) }, { once: true })
    })
    const pending = s.api.download(urls[0]!, 'stalled.bin', 100)
    t.mock.timers.tick(20_000)
    await assert.rejects(pending, /within 20 seconds/)
    assert.equal(cancelled, true)
  } finally { t.mock.timers.reset(); s.close() }
})

it('cached verified bodies receive current sandbox policy and unknown paths never hit the cache', async () => {
  const s = await testStore()
  const previousCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  try {
    const shipped = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const base = 'https://bitgames.store' + s.api.versionBase(shipped.versionId!)
    let cacheReads = 0
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { async open() { return { async match() { cacheReads++; return new Response(s.files[0]!['index.html'], { headers: { 'content-security-policy': "default-src *", 'content-type': 'text/html' } }) } } } } })
    globalThis.fetch = async () => { throw new Error('A cache hit should not fetch upstream') }
    const response = await s.api.serveGameAsset(new Request(base + 'index.html'))
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('content-security-policy')?.includes(base))
    assert.ok(response.headers.get('content-security-policy')?.includes('sandbox allow-scripts'))
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.equal((await s.api.serveGameAsset(new Request(base + 'secret.js'))).status, 404)
    assert.equal(cacheReads, 1)
  } finally {
    if (previousCaches) Object.defineProperty(globalThis, 'caches', previousCaches)
    else Reflect.deleteProperty(globalThis, 'caches')
    s.close()
  }
})
