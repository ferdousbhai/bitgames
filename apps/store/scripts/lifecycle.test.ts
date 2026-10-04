import assert from 'node:assert/strict'
import { it } from 'node:test'
import { testStore, urls } from './test-store.ts'

it('pins review reads and rejects decisions after a replacement or metadata edit', async () => {
  const s = await testStore()
  try {
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const inspected = (await s.api.findForReview(s.game.id))!
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    assert.match((await s.api.readReviewFile(s.game.id, first.versionId!, 'index.html')).text, /Version 0/)
    const pinned = await s.api.findPreviewGame(s.game.previewToken, first.versionId)
    assert.equal(pinned?.url, s.api.versionBase(first.versionId!))
    await assert.rejects(s.api.decide(s.game.id, 'approve', null, inspected.revision, first.versionId), /changed/)
    await assert.rejects(s.api.decide(s.game.id, 'reject', 'Please fix it', inspected.revision, first.versionId), /changed/)
    assert.equal((await s.api.findForReview(s.game.id))?.live, 0)
    const current = (await s.api.findForReview(s.game.id))!
    await s.api.updateInfo(s.creatorId, s.game.id, { title: 'Changed Title' })
    await assert.rejects(s.api.decide(s.game.id, 'approve', null, current.revision, current.review_version!), /changed/)
    assert.equal((await s.api.findForReview(s.game.id))?.status, 'draft')
  } finally { s.close() }
})

it('a replacement arriving during approval cannot be approved accidentally', async () => {
  const s = await testStore()
  try {
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const inspected = (await s.api.findForReview(s.game.id))!
    s.onFetch(async url => {
      if (url === urls[0] + 'index.html') {
        s.onFetch(undefined)
        await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
      }
    })
    await assert.rejects(s.api.decide(s.game.id, 'approve', null, inspected.revision, first.versionId), /changed/)
    assert.equal((await s.api.findForReview(s.game.id))?.live, 0)
    const replacement = (await s.api.findForReview(s.game.id))!
    assert.notEqual(replacement.review_version, first.versionId)
    await s.api.decide(s.game.id, 'approve', null, replacement.revision, replacement.review_version!)
    assert.equal((await s.api.findForReview(s.game.id))?.live_version, replacement.review_version)
  } finally { s.close() }
})

it('check-only has no side effects; history supports restore, withdrawal, rejection and deletion', async () => {
  const s = await testStore()
  try {
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0], checkOnly: true })
    assert.equal((await s.api.versionHistory(s.creatorId, s.game.id)).versions.length, 0)
    assert.equal((await s.api.ownedGame(s.creatorId, s.game.id)).status, 'draft')
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    let current = (await s.api.findForReview(s.game.id))!
    await s.api.decide(s.game.id, 'approve', null, current.revision, first.versionId)
    const second = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    current = (await s.api.findForReview(s.game.id))!
    await s.api.decide(s.game.id, 'reject', 'Fix the controls', current.revision, second.versionId)
    assert.equal((await s.api.findForReview(s.game.id))?.live_version, first.versionId)
    const restored = await s.api.shipVersion(s.creatorId, s.game.id, { versionId: first.versionId })
    assert.equal(restored.url, urls[0])
    await assert.rejects(s.api.withdrawVersion(s.creatorId, s.game.id, second.versionId!), /changed/)
    await s.api.withdrawVersion(s.creatorId, s.game.id, restored.versionId!)
    assert.equal((await s.api.findPreviewGame(s.game.previewToken))?.url, s.api.versionBase(restored.versionId!))
    assert.equal((await s.api.versionHistory(s.creatorId, s.game.id)).versions.length, 3)
    await assert.rejects(s.api.ownedGame('someone-else', s.game.id), /own/)
    await s.api.deleteGame(s.creatorId, s.game.id)
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM game_versions').get()?.n, 0)
  } finally { s.close() }
})

it('key rotation, revocation and recovery preserve ownership and invalidate old credentials', async () => {
  const s = await testStore()
  const request = (key: string) => new Request('https://bitgames.store/mcp', { headers: { authorization: `Bearer ${key}` } })
  try {
    const rotated = await s.api.manageCredentials(s.credentials.key, 'rotate')
    assert.equal(rotated.revoked, false)
    if (rotated.revoked) throw new Error('Rotation failed')
    assert.equal(await s.api.authenticate(request(s.credentials.key)), null)
    assert.equal(await s.api.authenticate(request(rotated.key)), s.creatorId)
    await assert.rejects(s.api.manageCredentials(s.credentials.recoveryCode, 'rotate'), /valid/)
    assert.equal(await s.api.authenticate(request(rotated.recoveryCode)), null)
    await s.api.manageCredentials(rotated.key, 'revoke')
    assert.equal(await s.api.authenticate(request(rotated.key)), null)
    const recovered = await s.api.manageCredentials(rotated.recoveryCode, 'rotate')
    if (recovered.revoked) throw new Error('Recovery failed')
    assert.equal(await s.api.authenticate(request(recovered.key)), s.creatorId)
    assert.equal((await s.api.listOwned(s.creatorId))[0]?.id, s.game.id)
    await assert.rejects(s.api.manageCredentials(rotated.recoveryCode, 'rotate'), /valid/)
  } finally { s.close() }
})

it('editing after takedown preserves pending fields and replaces the latest requested title', async () => {
  const s = await testStore()
  try {
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    let current = (await s.api.findForReview(s.game.id))!
    await s.api.decide(s.game.id, 'approve', null, current.revision, first.versionId)
    await s.api.updateInfo(s.creatorId, s.game.id, { title: 'Pending title', tagline: 'A pending tagline!' })
    current = (await s.api.findForReview(s.game.id))!
    await s.api.decide(s.game.id, 'unpublish', 'Fix the game controls', current.revision)
    await s.api.updateInfo(s.creatorId, s.game.id, { title: 'Fixed title' })
    const edited = await s.api.ownedGame(s.creatorId, s.game.id)
    assert.equal(s.api.gameInfo(edited).title, 'Fixed title')
    assert.equal(s.api.gameInfo(edited).tagline, 'A pending tagline!')
    assert.equal(edited.pending_info, null)
    const replacement = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    current = (await s.api.findForReview(s.game.id))!
    await s.api.decide(s.game.id, 'approve', null, current.revision, replacement.versionId)
    assert.equal((await s.api.ownedGame(s.creatorId, s.game.id)).title, 'Fixed title')
  } finally { s.close() }
})

it('history pagination reaches old versions even if a new shipment arrives between pages', async () => {
  const s = await testStore()
  try {
    const first = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    s.db.prepare('UPDATE game_versions SET created_at = ? WHERE id = ?').run(Date.now() - 1000, first.versionId!)
    const original = s.db.prepare('SELECT * FROM game_versions WHERE id = ?').get(first.versionId!)!
    for (let i = 0; i < 105; i++) {
      s.db.prepare(`INSERT INTO game_versions (id, game_id, upstream_url, manifest_hash, manifest_json, info_json, file_count, bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), s.game.id, String(original.upstream_url), String(original.manifest_hash), String(original.manifest_json), String(original.info_json), Number(original.file_count), Number(original.bytes), Number(original.created_at) + 100 + i)
    }
    const page = await s.api.versionHistory(s.creatorId, s.game.id)
    assert.equal(page.versions.length, 100)
    assert.ok(page.nextHistoryCursor)
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    const older = await s.api.versionHistory(s.creatorId, s.game.id, page.nextHistoryCursor!)
    assert.equal(older.versions.length, 6)
    assert.equal(older.nextHistoryCursor, null)
    assert.equal(older.versions.at(-1)?.id, first.versionId)
    assert.equal(new Set([...page.versions, ...older.versions].map(v => v.id)).size, 106)
    const otherGame = await s.api.createGame(s.creatorId, { ...s.api.gameInfo(await s.api.ownedGame(s.creatorId, s.game.id)), title: 'Other Game' })
    await assert.rejects(s.api.versionHistory(s.creatorId, otherGame.id, page.nextHistoryCursor!), /belong/)
  } finally { s.close() }
})
