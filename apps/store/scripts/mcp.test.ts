import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { testStore, info, urls } from './test-store.ts'

it('exposes five creator tools and completes the structured publishing workflow over MCP', async () => {
  const s = await testStore()
  try {
    async function call(server: McpServer, method: string, params: Record<string, unknown> = {}) {
      const response = await s.api.serveMcp(server, new Request('https://bitgames.store/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }))
      assert.equal(response.status, 200)
      return (await response.json()) as { result: { tools: { name: string }[]; structuredContent: Record<string, unknown>; isError?: boolean }; error?: unknown }
    }
    const creator = () => s.api.createMcpServer(s.creatorId, 'https://bitgames.store')
    assert.ok(!(await call(creator(), 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).error)
    assert.deepEqual((await call(creator(), 'tools/list')).result.tools.map(t => t.name), ['get_context', 'save_game', 'publish_game', 'withdraw_submission', 'delete_game'])
    const created = await call(creator(), 'tools/call', { name: 'save_game', arguments: { info: { ...info, title: 'Another Game' } } })
    assert.equal(created.result.isError, undefined)
    const game = created.result.structuredContent.game as { gameId: string; playUrl: string }
    assert.ok(game.playUrl.includes('/try/'))
    const context = await call(creator(), 'tools/call', { name: 'get_context', arguments: { gameId: game.gameId, includeStarter: true } })
    assert.ok(context.result.structuredContent.guide)
    assert.ok((context.result.structuredContent.starter as Record<string, string>)['public/index.html'])
    const compact = await call(creator(), 'tools/call', { name: 'get_context', arguments: { gameId: game.gameId, includeGuide: false } })
    assert.equal(compact.result.structuredContent.guide, undefined)
    assert.equal(compact.result.structuredContent.starter, undefined)
    assert.deepEqual(compact.result.structuredContent.versions, [])
    assert.equal(compact.result.structuredContent.nextHistoryCursor, null)
    assert.equal((await call(creator(), 'tools/call', { name: 'get_context', arguments: { includeStarter: true } })).result.isError, true)
    const denied = await call(creator(), 'tools/call', { name: 'get_context', arguments: { gameId: 'not-owned' } })
    assert.equal(denied.result.isError, true)
    const invalid = await call(creator(), 'tools/call', { name: 'publish_game', arguments: { gameId: game.gameId } })
    assert.equal(invalid.result.isError, true)
    const checked = await call(creator(), 'tools/call', { name: 'publish_game', arguments: { gameId: game.gameId, url: urls[0], checkOnly: true } })
    assert.equal(checked.result.structuredContent.checked, true)
    const published = await call(creator(), 'tools/call', { name: 'publish_game', arguments: { gameId: game.gameId, url: urls[0] } })
    assert.equal(published.result.structuredContent.playUrl, game.playUrl)
    assert.equal((await s.api.findForReview(game.gameId))?.review_version, published.result.structuredContent.versionId)
  } finally { s.close() }
})
