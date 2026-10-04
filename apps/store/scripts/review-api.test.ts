import { it } from 'node:test'
import assert from 'node:assert/strict'
import { testStore, urls, info } from './test-store.ts'

function request(body: unknown, key = 'test-admin-key') {
  return new Request('https://bitgames.store/api/review', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

it('review API requires an admin key, rate-limits requests and validates bounded JSON operations', async () => {
  const s = await testStore()
  try {
    const call = s.api.handleReviewApi
    assert.equal((await call(request({ action: 'queue' }, 'wrong-key'))).status, 401)
    assert.equal((await call(request({ action: 'queue' }, s.credentials.key))).status, 401)
    assert.equal((await call(new Request('https://bitgames.store/api/review'))).status, 405)
    assert.equal((await call(new Request('https://bitgames.store/api/review', { method: 'POST', headers: { authorization: 'Bearer test-admin-key' }, body: '{}' }))).status, 415)
    assert.equal((await call(request({ action: 'reject', gameId: s.game.id }))).status, 400)
    assert.equal((await call(request({ action: 'queue', unknown: true }))).status, 400)
    assert.equal((await call(request({ action: 'queue', offset: -1 }))).status, 400)
    const tooBig = await call(request({ action: 'queue', padding: 'a'.repeat(8192) }))
    assert.equal(tooBig.status, 400)
    assert.match((await tooBig.json() as { error: string }).error, /too large/)
    const malformed = new Request('https://bitgames.store/api/review', { method: 'POST', headers: { authorization: 'Bearer test-admin-key', 'content-type': 'application/json' }, body: '{' })
    assert.equal((await call(malformed)).status, 400)
    s.env.REVIEW_LIMITER.limit = async () => ({ success: false })
    assert.equal((await call(request({ action: 'queue' }))).status, 429)
  } finally { s.close() }
})

it('review API pins metadata, playback and verified source to the inspected version', async () => {
  const s = await testStore()
  try {
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const inspected = await s.api.handleReviewApi(request({ action: 'inspect', gameId: s.game.id }))
    assert.equal(inspected.status, 200)
    const snapshot = await inspected.json() as { submissionId: string; revision: string; info: typeof info; files: string[]; playUrl: string }
    assert.equal(snapshot.submissionId, first.versionId)
    assert.equal(snapshot.info.title, info.title)
    assert.deepEqual(snapshot.files, ['index.html', 'main.js'])
    assert.match(snapshot.playUrl, new RegExp(`submission=${first.versionId}$`))
    await s.api.updateInfo(s.creatorId, s.game.id, { title: 'Replacement title' })
    const replacement = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    const file = await s.api.handleReviewApi(request({ action: 'file', gameId: s.game.id, versionId: first.versionId, path: 'index.html' }))
    assert.equal(file.status, 200)
    assert.match((await file.json() as { file: { text: string } }).file.text, /Version 0/)
    const stale = await s.api.handleReviewApi(request({ action: 'approve', gameId: s.game.id, submissionId: snapshot.submissionId, revision: snapshot.revision }))
    assert.equal(stale.status, 409)
    assert.equal((await s.api.findForReview(s.game.id))?.live, 0)
    assert.equal((await s.api.findForReview(s.game.id))?.review_version, replacement.versionId)
    s.files[0]!['main.js'] = 'changed()'
    assert.equal((await s.api.handleReviewApi(request({ action: 'file', gameId: s.game.id, versionId: first.versionId, path: 'main.js' }))).status, 409)
    assert.equal((await s.api.handleReviewApi(request({ action: 'file', gameId: 'wrong-game', versionId: first.versionId, path: 'index.html' }))).status, 409)
    assert.equal((await s.api.handleReviewApi(request({ action: 'status', gameId: 'wrong-game', versionId: first.versionId }))).status, 409)
    assert.equal((await s.api.handleReviewApi(request({ action: 'file', gameId: s.game.id, versionId: first.versionId, path: '../secret.js' }))).status, 409)
  } finally { s.close() }
})

it('review API supports approval, listed inspection, rejection and stale-safe takedowns', async () => {
  const s = await testStore()
  try {
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const snapshot = await s.api.inspectForReview(s.game.id, 'https://bitgames.store')
    assert.equal((await s.api.handleReviewApi(request({ action: 'approve', gameId: s.game.id, submissionId: snapshot.submissionId, revision: snapshot.revision }))).status, 200)
    const listed = await s.api.handleReviewApi(request({ action: 'inspect', gameId: s.game.id, target: 'listed' }))
    assert.equal(listed.status, 200)
    const publicSnapshot = await listed.json() as { revision: string; versionId: string; info: typeof info; submissionId?: string }
    assert.equal(publicSnapshot.submissionId, undefined)
    assert.equal(publicSnapshot.versionId, snapshot.submissionId)
    await s.api.updateInfo(s.creatorId, s.game.id, { title: 'Pending new title' })
    const replacement = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    const waiting = await s.api.inspectForReview(s.game.id, 'https://bitgames.store')
    assert.equal(waiting.info.title, 'Pending new title')
    assert.equal((await s.api.inspectForReview(s.game.id, 'https://bitgames.store', 'listed')).info.title, info.title)
    assert.equal((await s.api.handleReviewApi(request({ action: 'take-down', gameId: s.game.id, revision: publicSnapshot.revision, note: 'Fix the controls' }))).status, 409)
    assert.equal((await s.api.handleReviewApi(request({ action: 'reject', gameId: s.game.id, submissionId: replacement.versionId, revision: waiting.revision, note: 'Enlarge the buttons' }))).status, 200)
    const current = (await s.api.findForReview(s.game.id))!
    assert.equal(current.live, 1)
    assert.equal(current.review_note, 'Enlarge the buttons')
    assert.equal((await s.api.handleReviewApi(request({ action: 'take-down', gameId: s.game.id, revision: current.revision, note: 'Fix the listed game controls' }))).status, 200)
    assert.equal((await s.api.findForReview(s.game.id))?.live, 0)
    assert.ok(await s.api.findPreviewGame(s.game.previewToken))
  } finally { s.close() }
})

it('review API paginates waiting and listed queues and reads large verified source in chunks', async () => {
  const s = await testStore()
  try {
    s.files[0]!['main.js'] = 'x'.repeat(65_000)
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    for (let i = 0; i < 51; i++) {
      s.db.prepare(`INSERT INTO games (id, title, tagline, how_to_play, emoji, color, category, status, live, preview_token, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'review', 0, ?, ?, ?)`).run(`queue-${i}`, info.title, info.tagline, info.howToPlay, info.emoji, info.color, info.category, crypto.randomUUID(), i, i)
    }
    const page = await s.api.handleReviewApi(request({ action: 'queue', scope: 'waiting' }))
    const firstPage = await page.json() as { games: { id: string }[]; nextOffset: number }
    assert.equal(firstPage.games.length, 50)
    assert.equal(firstPage.nextOffset, 50)
    const lastPage = await (await s.api.handleReviewApi(request({ action: 'queue', scope: 'waiting', offset: firstPage.nextOffset }))).json() as { games: { id: string }[]; nextOffset: null }
    assert.equal(lastPage.games.length, 2)
    assert.equal(lastPage.nextOffset, null)
    assert.equal(new Set([...firstPage.games, ...lastPage.games].map(g => g.id)).size, 52)
    assert.deepEqual((await (await s.api.handleReviewApi(request({ action: 'queue', scope: 'listed' }))).json() as { games: unknown[] }).games, [])
    const file = { action: 'file', gameId: s.game.id, versionId: first.versionId, path: 'main.js' }
    const firstChunk = await (await s.api.handleReviewApi(request(file))).json() as { file: { text: string; nextOffset: number } }
    assert.equal(firstChunk.file.text.length, 64_000)
    const lastChunk = await (await s.api.handleReviewApi(request({ ...file, offset: firstChunk.file.nextOffset }))).json() as { file: { text: string; nextOffset: null } }
    assert.equal(lastChunk.file.text.length, 1000)
    assert.equal(lastChunk.file.nextOffset, null)
  } finally { s.close() }
})
