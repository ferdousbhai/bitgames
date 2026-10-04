import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { runReviewCli } from './review.mjs'
import { testStore, urls } from './test-store.ts'

it('review CLI completes the authenticated queue, inspection, file and decision workflow', async () => {
  const s = await testStore()
  try {
    const version = await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    let calls = 0
    async function cli(...args) {
      let stdout = '', stderr = ''
      const code = await runReviewCli(args, {
        env: { BITGAMES_ADMIN_KEY: s.env.ADMIN_KEY },
        fetch: async (url, init) => {
          calls++
          assert.equal(String(url), 'https://bitgames.store/api/review')
          assert.equal(init.redirect, 'error')
          return s.api.handleReviewApi(new Request(url, init))
        },
        stdout: text => { stdout += text }, stderr: text => { stderr += text },
      })
      return { code, data: JSON.parse(stdout || stderr) }
    }
    assert.equal((await cli('queue', '--scope', 'waiting')).data.games[0].id, s.game.id)
    const snapshot = (await cli('inspect', s.game.id)).data
    assert.equal(snapshot.submissionId, version.versionId)
    assert.equal((await cli('file', s.game.id, 'index.html', '--version', snapshot.versionId)).data.file.nextOffset, null)
    assert.equal((await cli('approve', s.game.id, '--submission', snapshot.submissionId, '--revision', snapshot.revision)).code, 0)
    const listed = (await cli('inspect', s.game.id, '--listed')).data
    assert.equal(listed.versionId, snapshot.versionId)
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    const waiting = (await cli('inspect', s.game.id)).data
    const before = calls
    const stale = await cli('approve', s.game.id, '--submission', snapshot.submissionId, '--revision', snapshot.revision)
    assert.equal(stale.code, 1)
    assert.equal(stale.data.status, 409)
    assert.equal(calls, before + 1, 'failed decisions must not be retried')
    assert.equal((await cli('reject', s.game.id, '--submission', waiting.submissionId, '--revision', waiting.revision, '--note', 'Enlarge the controls')).code, 0)
    const current = (await cli('inspect', s.game.id, '--listed')).data
    assert.equal((await cli('take-down', s.game.id, '--revision', current.revision, '--note', 'Fix the listed game')).code, 0)
    assert.equal((await s.api.findForReview(s.game.id)).live, 0)
    assert.ok(await s.api.findPreviewGame(s.game.previewToken))
  } finally { s.close() }
})

it('review CLI validates commands, origin and credentials before making a request', async () => {
  let requests = 0
  async function run(args, env = { BITGAMES_ADMIN_KEY: 'secret-key' }) {
    let stdout = '', stderr = ''
    const code = await runReviewCli(args, { env, fetch: async () => { requests++; throw new Error('unexpected request') }, stdout: text => { stdout += text }, stderr: text => { stderr += text } })
    assert.equal(requests, 0)
    return { code, stdout, stderr }
  }
  assert.equal((await run(['--help'], {})).code, 0)
  assert.match((await run(['--help'], {})).stdout, /--submission/)
  assert.equal((await run(['queue'], {})).code, 1)
  for (const args of [['unknown'], ['approve', 'test-game'], ['file', 'test-game', 'index.html'], ['queue', '--offset', '-1'], ['queue', '--listed'], ['inspect', 'test-game', 'extra']]) {
    assert.equal((await run(args)).code, 1)
  }
  for (const origin of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?key=secret', 'file:///tmp/review']) {
    assert.equal((await run(['queue'], { BITGAMES_ADMIN_KEY: 'secret-key', BITGAMES_ORIGIN: origin })).code, 1)
  }
})

it('review CLI confirms committed decisions after a lost response without repeating writes', async () => {
  const s = await testStore()
  try {
    const writes = []
    async function cli(...args) {
      let output = ''
      const code = await runReviewCli(args, {
        env: { BITGAMES_ADMIN_KEY: s.env.ADMIN_KEY },
        fetch: async (url, init) => {
          const action = JSON.parse(init.body).action
          const response = await s.api.handleReviewApi(new Request(url, init))
          if (['approve', 'reject', 'take-down'].includes(action)) {
            writes.push(action)
            assert.equal(response.status, 200)
            throw new Error('Connection lost after the server committed')
          }
          return response
        },
        stdout: text => { output += text }, stderr: text => { output += text },
      })
      return { code, data: JSON.parse(output) }
    }
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[0] })
    const first = (await cli('inspect', s.game.id)).data
    assert.equal((await cli('approve', s.game.id, '--submission', first.submissionId, '--revision', first.revision)).code, 1)
    const approved = await cli('status', s.game.id, '--version', first.submissionId)
    assert.equal(approved.code, 0)
    assert.equal(approved.data.version.decision, 'approved')
    assert.equal(approved.data.listed, true)
    await s.api.shipVersion(s.creatorId, s.game.id, { url: urls[1] })
    const second = (await cli('inspect', s.game.id)).data
    assert.equal((await cli('reject', s.game.id, '--submission', second.submissionId, '--revision', second.revision, '--note', 'Fix the controls')).code, 1)
    const rejected = (await cli('status', s.game.id, '--version', second.submissionId)).data
    assert.equal(rejected.version.decision, 'rejected')
    assert.equal(rejected.version.reviewNote, 'Fix the controls')
    assert.equal(rejected.submissionId, null)
    assert.equal(rejected.listed, true)
    assert.equal((await cli('take-down', s.game.id, '--revision', rejected.revision, '--note', 'Fix the listed game')).code, 1)
    const removed = (await cli('status', s.game.id)).data
    assert.equal(removed.listed, false)
    assert.equal(removed.reviewNote, 'Fix the listed game')
    assert.deepEqual(writes, ['approve', 'reject', 'take-down'])
    assert.deepEqual((await cli('queue')).data.games, [])
    const receipt = (await cli('status', s.game.id, '--version', second.submissionId)).data
    assert.equal(receipt.version.decision, 'rejected')
  } finally { s.close() }
})

it('review CLI refuses redirects so admin credentials cannot reach another endpoint', async () => {
  let redirectedRequests = 0
  const target = createServer((_request, response) => { redirectedRequests++; response.end('{}') })
  const source = createServer((_request, response) => {
    response.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/steal` })
    response.end()
  })
  try {
    await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
    await new Promise(resolve => source.listen(0, '127.0.0.1', resolve))
    let output = ''
    const code = await runReviewCli(['queue'], {
      env: { BITGAMES_ADMIN_KEY: 'secret-key', BITGAMES_ORIGIN: `http://127.0.0.1:${source.address().port}` },
      stdout: text => { output += text }, stderr: text => { output += text },
    })
    assert.equal(code, 1)
    assert.equal(redirectedRequests, 0)
    assert.ok(!output.includes('secret-key'))
  } finally {
    await Promise.all([new Promise(resolve => source.close(resolve)), new Promise(resolve => target.close(resolve))])
  }
})
