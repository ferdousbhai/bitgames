import assert from 'node:assert/strict'
import { it } from 'node:test'
import { gameFrameDocument } from '../src/lib/game-frame.ts'

it('the wrapper pins navigation and escapes debug parameters without broadening its policy', () => {
  const base = 'https://bitgames.store/game-assets/12345678-1234-1234-1234-123456789abc/'
  const document = gameFrameDocument(base + 'index.html?debug=%22%3E%3Cscript%3E&level=2', 'https://bitgames.store')
  assert.ok(document.includes(`frame-src ${base};`))
  assert.ok(document.includes('&amp;level=2'))
  assert.ok(!document.includes('<script>&'))
  assert.throws(() => gameFrameDocument('https://creator.example/game.html', 'https://bitgames.store'), /Invalid game playback URL/)
  assert.throws(() => gameFrameDocument('/admin', 'https://bitgames.store'), /Invalid game playback URL/)
})
