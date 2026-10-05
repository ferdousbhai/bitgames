// Lifecycle and real gestures that a solution-only playthrough cannot cover.
import assert from 'node:assert/strict'
import {
  actionButton, assertRendererRests, loadLearningGame, runChecks, startBrowser, tapCentre, touchStroke, worldTarget,
} from './harness.mjs'

const session = await startBrowser({ out: 'navigation', context: { deviceScaleFactor: 2, reducedMotion: 'reduce' } })
const { page, context } = session

async function open(id) {
  await loadLearningGame(page, id)
  await page.locator('#play').tap()
}
const screen = () => page.evaluate(() => window.__learning.state.screen)

await runChecks(session, async (pass) => {
  await open('orchard-baskets')
  await actionButton(page, 'Done').tap()
  assert.equal(await page.evaluate(() => window.__learning.state.solved), false)
  assert.ok(await page.locator('#feedback').textContent())
  await tapCentre(page, worldTarget(page, 0))
  await actionButton(page, 'Reset').tap()
  assert.equal(await page.locator('.world-action[aria-pressed=true]').count(), 0)
  pass('A wrong answer encourages retry; Reset clears the selection.')

  await assertRendererRests(page, () => window.__learning.metrics().frame)
  const after = await page.evaluate(() => window.__learning.metrics())
  assert.ok(after.triangles < 150000)
  assert.ok(after.calls < 350)
  pass(`Idle rendering stops (${after.calls} draw calls and ${after.triangles} triangles on interaction).`)

  await page.locator('#home').tap()
  await page.locator('[data-level="2"]').tap()
  await page.reload()
  await page.waitForFunction(() => window.__learning && !document.getElementById('play').disabled)
  assert.equal(await page.locator('[data-level="2"]').getAttribute('aria-pressed'), 'true')
  pass('Difficulty survives reload.')

  await open('frog-choir')
  await page.locator('#home').tap()
  await page.waitForTimeout(3500)
  assert.equal(await screen(), 'menu')
  assert.equal(await page.locator('.flash').count(), 0)
  assert.equal(await page.evaluate(() => window.__learning.api.audio.voices.size), 0)
  pass('Leaving an audio demonstration cancels its pending callbacks.')

  await open('picnic-pairs')
  const mismatch = await page.evaluate(() => {
    const cards = window.__learning.state.challenge.cards
    return [0, cards.findIndex((c) => c.pair !== cards[0].pair)]
  })
  for (const index of mismatch) await tapCentre(page, worldTarget(page, index))
  await page.locator('#home').tap()
  await page.waitForTimeout(1300)
  assert.equal(await screen(), 'menu')
  pass('Leaving mismatched memory cards cancels their delayed flip.')

  // Trusted touch input exercises pointer capture starting on the actual
  // overlaid target, then follows the projected trail.
  await open('snail-spiral')
  const dots = await page.locator('.world-action').evaluateAll((nodes) => nodes.map((n) => {
    const r = n.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }))
  await touchStroke(await context.newCDPSession(page), dots)
  await page.waitForFunction(() => window.__learning.state.solved)
  pass('A held pointer gesture can complete the spiral trail.')

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.waitForFunction(() => {
    const { scrollWidth, scrollHeight } = document.documentElement
    return scrollWidth <= innerWidth && scrollHeight <= innerHeight
  })
  pass('An orientation change after success keeps controls within the visible viewport.')

  // A reviewed sandbox can deny storage. Optional persistence must not prevent play.
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError') } })
  })
  await open('dino-egg-nest')
  assert.equal(await screen(), 'play')
  pass('Denied localStorage does not block play.')
})
