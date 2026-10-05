// Shared setup for the browser checks. Start `pnpm examples:serve` first.
import { chromium, webkit } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

export const origin = process.env.EXAMPLES_ORIGIN || 'http://localhost:4173'

/** `--webkit` on the command line switches a check from Chromium to WebKit. */
export const engineFromArgs = () => (process.argv.includes('--webkit') ? 'webkit' : 'chromium')

const chromiumArgs = ['--no-sandbox', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist']

/**
 * Launch a touch-enabled iPad mini page that records uncaught page errors.
 * `out` names a folder under /tmp/bitgames-playtest for screenshots and reports.
 */
export async function startBrowser({ engine = 'chromium', out, extraArgs = [], context: contextOptions = {} } = {}) {
  const browser = await { chromium, webkit }[engine].launch({
    headless: true,
    ...(engine === 'chromium' ? { args: [...chromiumArgs, ...extraArgs] } : {}),
  })
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    ...contextOptions,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const dir = out && `/tmp/bitgames-playtest/${out}`
  if (dir) mkdirSync(dir, { recursive: true })
  return { browser, context, page, errors, out: dir }
}

/**
 * Run a list of checks in one browser session. `body(pass)` calls `pass(text)`
 * after each verified behaviour. Page errors fail the run; a failure saves a
 * screenshot, and the passed behaviours are written to report.json.
 */
export async function runChecks({ browser, page, errors, out }, body) {
  const results = []
  const pass = (text) => {
    results.push(text)
    console.log('PASS', text)
  }
  try {
    await body(pass)
    assert.deepEqual(errors, [])
    if (out) writeFileSync(`${out}/report.json`, JSON.stringify(results, null, 2))
  } catch (error) {
    if (out) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
    console.error(page.url(), error)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

/** Load a generated learning game and wait until its Play button is ready. */
export async function loadLearningGame(page, id, query = '') {
  await page.goto(`${origin}/${id}/?debug${query}`)
  await page.waitForFunction(() => window.__learning && !document.getElementById('play').disabled)
}

/**
 * Retry an async assertion until it passes, for layouts and animations that settle
 * over a few frames (rotation, entrance animations). After `ms` the last failure is thrown.
 */
export async function untilPasses(check, ms = 5000) {
  const deadline = Date.now() + ms
  for (;;) {
    try {
      return await check()
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

/**
 * The renderer must stop drawing once nothing changes. `drawCount` runs in the page;
 * wait until it holds steady, then prove it stays still while the child thinks.
 */
export async function assertRendererRests(page, drawCount) {
  let previous = -1
  let stable = 0
  for (let i = 0; i < 50 && stable < 4; i++) {
    await page.waitForTimeout(200)
    const draws = await page.evaluate(drawCount)
    stable = draws === previous ? stable + 1 : 0
    previous = draws
  }
  assert.equal(stable, 4, 'The renderer must stop drawing once nothing changes.')
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(drawCount), previous, 'The renderer must rest while the child thinks.')
}

/**
 * Resize the viewport, then wait two frames. A page sees a resize only at its next frame, where the
 * learning games move their buttons onto the re-projected pieces (ResizeObserver); measuring before
 * then reads the old layout, and a tap at that point lands beside its target.
 */
export async function rotate(page, size) {
  await page.setViewportSize(size)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

export const centreOf = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** True when a touch at the button's centre would land on the button itself. */
export const receivesCentreTouch = (locator) =>
  locator.evaluate((button) => {
    const r = button.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button
  })

/** A real touchscreen tap at the centre of an element. */
export async function tapCentre(page, locator) {
  const box = await locator.boundingBox()
  assert.ok(box)
  const { x, y } = centreOf(box)
  await page.touchscreen.tap(x, y)
}

/** Like tapCentre, but first proves nothing covers the control. */
export async function touch(page, target) {
  const locator = typeof target === 'string' ? page.locator(target) : target
  assert.ok(await receivesCentreTouch(locator), `${await locator.textContent()} must receive its centre touch`)
  await tapCentre(page, locator)
}

/** The control that starts play from an original game's title screen. */
export function originalStartButton(id) {
  if (id === 'fish-pond') return '[data-place="lake"]'
  return ['bumper-ducks', 'crash-racers', 'paint-splash', 'star-catcher'].includes(id) ? '#go' : '#play'
}

/** Wait for an echo or rhythm demonstration to finish: it ends by handing the turn to the child. */
export const waitForTurn = (page) =>
  page.waitForFunction(() => document.querySelector('#actions .readout')?.textContent === 'Your turn')

export const actionButton = (page, text) => page.locator('#actions button').filter({ hasText: text }).first()
export const worldTarget = (page, index) => page.locator('.world-action').nth(index)

/**
 * A held finger stroke through screen points, sent as trusted touch events over CDP.
 * `end` is 'touchEnd', 'touchCancel', or null to keep the finger down.
 */
export async function touchStroke(cdp, points, end = 'touchEnd') {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] })
  for (const point of points) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] })
  }
  if (end) await cdp.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] })
}
