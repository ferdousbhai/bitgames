import { it } from 'node:test'
import assert from 'node:assert/strict'
import { backfillVersions } from './backfill-versions.ts'
import { testStore, urls, hash, info } from './test-store.ts'

const manifestHash = (files: Record<string, string>) => hash(JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, hash(text)])) }))

it('migration preserves live and waiting metadata and is resumable', async () => {
  const s = await testStore()
  try {
    s.db.prepare(`UPDATE games SET live = 1, status = 'review', live_url = ?, live_manifest = ?,
      review_url = ?, review_manifest = ?, play_url = ?, pending_info = ? WHERE id = ?`)
      .run(urls[0]!, manifestHash(s.files[0]!), urls[1]!, manifestHash(s.files[1]!), urls[1]!, JSON.stringify({ title: 'Waiting title' }), s.game.id)
    const sql = async (query: string) => s.db.prepare(query).all()
    await backfillVersions(sql, () => {})
    const game = s.db.prepare('SELECT * FROM games WHERE id = ?').get(s.game.id)!
    for (const role of ['live', 'review', 'play']) {
      const version = s.db.prepare('SELECT * FROM game_versions WHERE id = ?').get(String(game[`${role}_version`]))!
      assert.equal(version.decision, role === 'live' ? 'approved' : 'pending')
      assert.equal(JSON.parse(String(version.info_json)).title, role === 'live' ? info.title : 'Waiting title')
    }
    s.onFetch(async () => { throw new Error('A resumed migration should skip existing records') })
    await backfillVersions(sql, () => {})
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM game_versions').get()?.n, 3)
  } finally { s.close() }
})

it('migration records rejected playback with its pending metadata and review note', async () => {
  const s = await testStore()
  try {
    s.db.prepare(`UPDATE games SET live = 1, status = 'rejected', live_url = ?, live_manifest = ?,
      play_url = ?, pending_info = ?, review_note = ? WHERE id = ?`)
      .run(urls[0]!, manifestHash(s.files[0]!), urls[1]!, JSON.stringify({ title: 'Rejected title' }), 'Fix the controls', s.game.id)
    await backfillVersions(async query => s.db.prepare(query).all(), () => {})
    const version = s.db.prepare('SELECT v.* FROM game_versions v JOIN games g ON g.play_version = v.id WHERE g.id = ?').get(s.game.id)!
    assert.equal(version.decision, 'rejected')
    assert.equal(version.review_note, 'Fix the controls')
    assert.equal(JSON.parse(String(version.info_json)).title, 'Rejected title')
  } finally { s.close() }
})

it('migration refuses missing or changed reviewed manifests', async () => {
  const s = await testStore()
  try {
    s.db.prepare("UPDATE games SET status = 'review', review_url = ? WHERE id = ?").run(urls[0]!, s.game.id)
    const sql = async (query: string) => s.db.prepare(query).all()
    await assert.rejects(backfillVersions(sql, () => {}), /no recorded manifest/)
    s.db.prepare('UPDATE games SET review_manifest = ? WHERE id = ?').run('0'.repeat(64), s.game.id)
    await assert.rejects(backfillVersions(sql, () => {}), /deployment changed/)
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM game_versions').get()?.n, 0)
  } finally { s.close() }
})

it('migration reports concurrent edits during validation and permits a safe retry', async () => {
  const s = await testStore()
  try {
    s.db.prepare('UPDATE games SET play_url = ? WHERE id = ?').run(urls[0]!, s.game.id)
    let edited = false
    s.onFetch(async () => {
      if (edited) return
      edited = true
      s.db.prepare('UPDATE games SET revision = ?, title = ? WHERE id = ?').run(crypto.randomUUID(), 'Changed title', s.game.id)
    })
    const sql = async (query: string) => s.db.prepare(query).all()
    await assert.rejects(backfillVersions(sql, () => {}), /changed during play migration/)
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM game_versions').get()?.n, 0)
    s.onFetch(undefined)
    await backfillVersions(sql, () => {})
    const version = s.db.prepare('SELECT * FROM game_versions').get()!
    assert.equal(JSON.parse(String(version.info_json)).title, 'Changed title')
    assert.equal(version.decision, 'withdrawn')
  } finally { s.close() }
})

it('migration removes an unattached record when the game changes before linking it', async () => {
  const s = await testStore()
  try {
    s.db.prepare('UPDATE games SET play_url = ? WHERE id = ?').run(urls[0]!, s.game.id)
    await assert.rejects(backfillVersions(async query => {
      const result = s.db.prepare(query).all()
      if (query.startsWith('INSERT INTO game_versions')) s.db.prepare('UPDATE games SET revision = ? WHERE id = ?').run(crypto.randomUUID(), s.game.id)
      return result
    }, () => {}), /changed during play migration/)
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM game_versions').get()?.n, 0)
    assert.equal(s.db.prepare('SELECT play_version FROM games WHERE id = ?').get(s.game.id)?.play_version, null)
  } finally { s.close() }
})
