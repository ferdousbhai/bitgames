// The originals play without reading or a voice: no instruction words on screen and no speech, from title into play.
import assert from 'node:assert/strict'
import { originalIds } from '../catalogue.mjs'
import { engineFromArgs, origin, originalStartButton, runChecks, startBrowser, tapCentre } from './harness.mjs'

const engine = engineFromArgs()
const session = await startBrowser({ engine, out: `${engine}-original-quality`, context: { deviceScaleFactor: 1 } })
const { page, out } = session

await page.addInitScript(() => {
  window.__spoken = []
  if ('speechSynthesis' in window) speechSynthesis.speak = (words) => window.__spoken.push(words.text)
})

/** Visible words of two or more letters, outside a game's logo. */
const visibleWords = () => page.evaluate(() => {
  const words = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node; (node = walker.nextNode());) {
    const el = node.parentElement
    if (!el || el.closest('[data-logo], .logo, h1, script, style, noscript')) continue
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (!r.width || !r.height || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue
    words.push(...(node.textContent.match(/\p{L}{2,}/gu) || []))
  }
  return words
})

await runChecks(session, async (pass) => {
  const ids = process.env.EXAMPLES_IDS?.split(",") || originalIds
  for (const id of ids) {
    await page.goto(`${origin}/${id}/?debug`)
    const start = page.locator(originalStartButton(id))
    await start.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    assert.deepEqual(await visibleWords(), [], `${id}: title screen shows words`)
    await tapCentre(page, start)
    await page.waitForTimeout(2500)
    for (const [x, y] of [[384, 512], [200, 700], [560, 400]]) {
      await page.touchscreen.tap(x, y)
      await page.waitForTimeout(400)
    }
    await page.screenshot({ path: `${out}/${id}-play.png` })
    assert.deepEqual(await visibleWords(), [], `${id}: play shows words`)
    assert.deepEqual(await page.evaluate(() => window.__spoken), [], `${id}: the game speaks`)
    pass(`${id}: title and play have no words and no voice.`)
  }
})
