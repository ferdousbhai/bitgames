// Shared setup for the browser checks. Start `pnpm examples:serve` first.
import { chromium, webkit } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

export const origin = process.env.EXAMPLES_ORIGIN || 'http://localhost:4173'

/** `--webkit` on the command line switches a check from Chromium to WebKit. */
export const engineFromArgs = () => (process.argv.includes('--webkit') ? 'webkit' : 'chromium')

const angle = process.env.EXAMPLES_CHROMIUM_ANGLE || 'vulkan'
const chromiumArgs = ['--no-sandbox', `--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist']
if (angle === 'swiftshader') chromiumArgs.push('--enable-unsafe-swiftshader')

/**
 * Launch a touch-enabled iPad mini page that records uncaught page errors.
 * `out` names a folder under /tmp/bitgames-playtest for screenshots and reports.
 */
export async function startBrowser({ engine = 'chromium', out, extraArgs = [], context: contextOptions = {} } = {}) {
  const browser = await { chromium, webkit }[engine].launch({
    headless: true,
    ...(engine === 'chromium' ? {
      ...(process.env.EXAMPLES_CHROMIUM_EXECUTABLE ? { executablePath: process.env.EXAMPLES_CHROMIUM_EXECUTABLE } : {}),
      args: [...chromiumArgs, ...extraArgs],
    } : {}),
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
 * Resize the viewport, then wait two frames. A page sees a resize only at its next frame, where the
 * games settle their controls; measuring before then can read the old layout.
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
