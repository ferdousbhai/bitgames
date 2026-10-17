// A real-tap playtest: cast at a swimmer, reel it in on the bite, tickle the catch, and find it in the book.
// Also checks that nothing on screen is words to read (the logo aside) and that nothing is spoken aloud.
//
//   EXAMPLES_ORIGIN=http://localhost:4213 node examples/fish-pond/tests/play.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin = process.env.EXAMPLES_ORIGIN ?? 'http://localhost:4213'
const browser = await chromium.launch({ args: ['--use-angle=gl'], ...(process.env.EXAMPLES_CHROMIUM_EXECUTABLE ? { executablePath: process.env.EXAMPLES_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true })
await context.addInitScript(() => {
  window.__speaks = 0
  if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__speaks++
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const tap = async (selector) => {
  const b = await page.locator(selector).first().boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
}
const phase = (p, timeout = 20000) => page.waitForFunction((p) => window.fishPond.game.phase === p, p, { timeout })
/** Visible text with two or more letters in a row, outside the logo. */
const words = () =>
  page.evaluate(() => {
    const out = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const el = walk.currentNode.parentElement
      if (el.closest('.logo, .hidden') || !el.getBoundingClientRect().width) continue
      if (/[A-Za-z]{2,}/.test(walk.currentNode.textContent)) out.push(walk.currentNode.textContent.trim())
    }
    return out
  })

try {
  await page.goto(`${origin}/fish-pond/?debug`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.fishPond?.game.state === 'title', null, { timeout: 40000 })
  assert.deepEqual(await words(), [], 'title has no words')
  await tap('[data-place="lake"]')
  await page.waitForFunction(() => window.fishPond.game.state === 'play')

  // Tap a swimmer: it is the one that bites
  const aim = await page.evaluate(() => {
    const f = window.fishPond
    const s = f.creatures.swimmers.find((s) => s.mode === 'wander' && !s.spawned)
    const p = s.pos.clone().project(f.camera)
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, id: s.id }
  })
  await page.touchscreen.tap(aim.x, aim.y)
  await phase('bite')
  assert.equal(await page.locator('#bang').evaluate((el) => el.classList.contains('hidden')), false, 'the ! shows on a bite')
  await page.touchscreen.tap(384, 900)
  assert.equal(await page.evaluate(() => window.fishPond.game.phase), 'catch')
  await phase('show', 5000)
  const caught = await page.evaluate(() => window.fishPond.fish.show.pick.id)
  assert.equal(caught, aim.id, 'the swimmer tapped is the one caught')
  assert.equal(await page.locator('#new-star').evaluate((el) => el.classList.contains('show')), true, 'a first catch gets the star')

  // A tap on the catch tickles it and keeps it on stage a little longer
  const stage = await page.evaluate(() => {
    const f = window.fishPond
    const v = f.camera.position.clone()
    f.camera.children[0].getWorldPosition(v).project(f.camera)
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
  })
  await page.touchscreen.tap(stage.x, stage.y)
  assert.equal(await page.evaluate(() => window.fishPond.fish.show.tickles), 1)
  assert.equal(await page.evaluate(() => window.fishPond.game.phase), 'show')
  await phase('idle', 12000)
  assert.equal(await page.evaluate((id) => window.fishPond.game.book[id], caught), 1, 'the catch is in the book')
  assert.deepEqual(await words(), [], 'play has no words')

  await tap('#book-btn')
  await page.waitForFunction(() => window.fishPond.book.open)
  assert.equal(await page.locator('.tile.got').count(), 1)
  assert.deepEqual(await words(), [], 'the book has no words')
  assert.equal(await page.evaluate(() => window.__speaks), 0, 'nothing is spoken')
  assert.deepEqual(errors, [])
  console.log(`ok   cast at ${aim.id}, reeled, tickled and booked it; no words, no voice`)
} finally {
  await browser.close()
}
