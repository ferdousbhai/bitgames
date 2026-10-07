/** Real touch playthroughs, including iPad WebKit. Start examples:serve first.
 * pnpm examples:playtest                     # all 88 new games in WebKit
 * pnpm examples:playtest -- --browser chromium --limit 26
 * pnpm examples:playtest -- --originals      # boot original twelve, both orientations
 * Other options: --mini (iPad mini viewport), --activities (one game per mode),
 * --smoke (load only), --ids a,b, --offset N, --level N, --run NAME.
 * Screenshots and JSON report are local artifacts under /tmp/bitgames-playtest.
 */
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { games } from '../catalogue.mjs'
import {
  actionButton, origin, originalStartButton, rotate, startBrowser, tapCentre, untilPasses, waitForTurn, worldTarget,
} from './harness.mjs'
import { findRoute } from './route.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const browserName = option('--browser', 'webkit')
const limit = Number(option('--limit', '1000'))
const offset = Number(option('--offset', '0'))
const originalsOnly = args.includes('--originals')
const activities = args.includes('--activities')
const mini = args.includes('--mini')
const smoke = args.includes('--smoke')
const portraitSize = mini ? { width: 768, height: 1024 } : { width: 834, height: 1194 }
const landscapeSize = { width: portraitSize.height, height: portraitSize.width }
const runName = option('--run', '')
const runId = [browserName, originalsOnly && 'originals', activities && 'activities', mini && 'mini', smoke && 'smoke', runName]
  .filter(Boolean).join('-')

const examples = fileURLToPath(new URL('../..', import.meta.url))
const originals = readdirSync(examples)
  .filter((id) => existsSync(`${examples}/${id}/game.json`) && !games.some((g) => g.id === id))
  .map((id) => JSON.parse(readFileSync(`${examples}/${id}/game.json`)))
const selectedIds = option('--ids', '').split(',').filter(Boolean)
let designs = originalsOnly ? originals : games
if (selectedIds.length) designs = designs.filter((g) => selectedIds.includes(g.id))
else if (activities && !originalsOnly) designs = [...new Map(games.map((g) => [g.mode, g])).values()]

const session = await startBrowser({
  engine: browserName,
  out: runId,
  extraArgs: ['--autoplay-policy=no-user-gesture-required'],
  context: { viewport: portraitSize, deviceScaleFactor: browserName === 'webkit' ? 1 : 2, locale: 'en-US', reducedMotion: 'reduce' },
})
const { browser, page, out } = session
page.setDefaultTimeout(15000)
let network = []
page.on('response', (r) => {
  if (r.status() >= 400) network.push(`${r.status()} ${r.url()}`)
})
const report = []

const tapTarget = (index) => tapCentre(page, worldTarget(page, index))
const tapAction = (label) => actionButton(page, label).tap()
async function tapValue(value) {
  const index = await page.evaluate((v) => window.__learning.targets.findIndex(({ button }) =>
    !button.classList.contains('visual') && (button.textContent.trim() === String(v) || button.getAttribute('aria-label') === String(v))), value)
  assert.ok(index >= 0, `No target ${value}`)
  await tapTarget(index)
}
const repeat = async (times, step) => {
  for (let i = 0; i < times; i++) await step(i)
}
const arrows = { '0,-1': '↑', '1,0': '→', '0,1': '↓', '-1,0': '←' }

/** Solve one round of a learning game through touch alone. Target indices follow each activity's layout. */
async function solve(c) {
  switch (c.mode) {
    case 'collect': {
      // The distractor, when present, sits at index 1.
      let count = 0
      for (let i = 0; count < c.target; i++) {
        if (c.distractor && i === 1) continue
        await tapTarget(i)
        count++
      }
      await tapAction('Done')
      break
    }
    case 'match':
      await tapTarget(c.tiles.indexOf(c.target))
      break
    case 'pattern':
    case 'rhyme':
    case 'choice':
      await tapValue(c.target)
      break
    case 'sort':
      for (let i = 0; i < c.items.length; i++) {
        await tapTarget(c.bins.length + i)
        await tapValue(c.items[i][1])
      }
      break
    case 'order':
      for (const stage of c.stages) await tapValue(stage)
      break
    case 'compare':
      await tapTarget(c.values.indexOf(c.target) + (c.variant === 'depth' ? 1 : 0))
      break
    case 'memory': {
      const pairs = Map.groupBy(c.cards.map((card, i) => [card.pair, i]), ([pair]) => pair)
      for (const [[, x], [, y]] of pairs.values()) {
        // Taps are ignored while the previous pair settles, so repeat until the card turns over.
        await untilPasses(async () => {
          await tapTarget(x)
          assert.equal(await worldTarget(page, x).getAttribute('aria-pressed'), 'true')
        })
        await tapTarget(y)
      }
      break
    }
    case 'echo':
      await waitForTurn(page)
      for (const index of c.sequence) await tapTarget(index)
      break
    case 'path': {
      const route = findRoute(c)
      assert.ok(route)
      for (const step of route) await tapAction(arrows[step.join(',')])
      await tapAction('Go')
      break
    }
    case 'trace':
      await repeat(c.points.length, () => tapAction('Next glowing dot'))
      break
    case 'arithmetic': {
      const answers = c.tiles.length
      if (c.operation === 'multiply') {
        for (let i = 0; i < c.a; i++) await repeat(c.b, () => tapTarget(answers + i))
      } else {
        const moves = c.operation === 'add' ? c.a + c.b : c.operation === 'subtract' ? c.b : c.a
        const recipients = c.operation === 'divide' ? c.b : 1
        for (let i = 0; i < moves; i++) {
          await tapTarget(answers + recipients + i)
          if (c.operation === 'divide') await tapTarget(answers + i % c.b)
        }
      }
      await tapValue(c.target)
      break
    }
    case 'balance':
      await repeat(c.target - c.base, () => tapAction('+ 1'))
      await tapAction('Check balance')
      break
    case 'mix':
      for (const colour of c.ingredients) await tapValue(colour)
      await tapAction('Stir mixture')
      break
    case 'fraction':
      await repeat(c.numerator, tapTarget)
      await tapAction('Check share')
      break
    case 'clock':
      await repeat(c.hour % 12, () => tapAction('Hour +'))
      await repeat(c.minute / 15, () => tapAction('Minute +'))
      await tapAction('Check time')
      break
    case 'mirror':
      if (c.snowflake) {
        for (let i = 0; i < c.rings; i++) if (c.pattern[i]) await tapValue(`Snowflake arm 1 branch ${i + 1}`)
        await tapAction('Check snowflake')
        break
      }
      // Each cell has a pattern and a mirror target; tap the mirror of every pattern cell.
      for (let y = 0; y < c.size; y++) {
        for (let x = 0; x < c.size; x++) {
          if (c.pattern[y * c.size + (c.size - 1 - x)]) await tapTarget((y * c.size + x) * 2 + 1)
        }
      }
      await tapAction('Check mirror')
      break
    case 'rotate':
      if (c.tangram) {
        for (let i = 0; i < 7; i++) {
          await tapTarget(i * 2)
          await repeat((4 - c.turns[i]) % 4, () => tapAction('Turn right'))
          await tapAction('Try matching outline')
        }
        break
      }
      await repeat((c.target - c.initial + 4) % 4, () => tapAction('Turn right'))
      await tapAction('Check fit')
      break
    case 'measure':
      await repeat(c.target, () => tapAction('Add a unit'))
      await tapAction('Check length')
      break
    case 'spell':
      for (const letter of c.word) await tapValue(letter.toLowerCase())
      break
    case 'experiment':
      await tapAction(c.target ? 'Yes' : 'No')
      await tapAction('Test it')
      break
    case 'pitch':
      await repeat(c.notes.length, tapTarget)
      await tapAction(`Choose ${c.target + 1}`)
      break
    case 'rhythm':
      await waitForTurn(page)
      for (let i = 0; i < c.pattern.length; i++) if (c.pattern[i]) await tapTarget(i + 1)
      await tapAction('Play my rhythm')
      break
    case 'build':
      for (let i = 0; i < c.heights.length; i++) await repeat(c.heights[i], () => tapTarget(c.heights.length + i))
      await tapAction('Check blueprint')
      break
    case 'tenframe':
      await repeat(c.target, tapTarget)
      await tapAction('Check nest')
      break
    default:
      throw new Error(`Untested ${c.mode}`)
  }
  await page.waitForFunction(() => window.__learning.state.solved)
}

/**
 * No page overflow, and every visible button is 44px, on screen and touchable.
 * Layout settles a frame or more after a rotation or an entrance animation, so the check retries briefly.
 */
const layoutCheck = (label) => untilPasses(async () => {
  const result = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect()
      return r.width && r.height && !b.closest('[hidden]') && !b.classList.contains('visual')
    })
    const rect = (b) => b.getBoundingClientRect()
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      small: buttons
        .filter((b) => rect(b).width < 43.9 || rect(b).height < 43.9)
        .map((b) => ({ label: b.textContent, w: rect(b).width, h: rect(b).height })),
      blocked: buttons
        .filter((b) => {
          if (b.disabled) return false
          const r = rect(b)
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') !== b
        })
        .map((b) => b.textContent),
      outside: buttons
        .filter((b) => {
          const r = rect(b)
          return r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5
        })
        .map((b) => b.textContent),
    }
  })
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: horizontal overflow`)
  assert.ok(result.scrollHeight <= result.height + 1, `${label}: vertical overflow ${result.scrollHeight}/${result.height}`)
  assert.deepEqual(result.small, [], `${label}: touch targets below 44 CSS pixels`)
  assert.deepEqual(result.outside, [], `${label}: controls outside viewport`)
  assert.deepEqual(result.blocked, [], `${label}: controls cannot receive touch`)
  return result
})

/** Rotate, check the settled layout, and optionally take a screenshot. */
async function checkOrientation(size, label, screenshot) {
  await rotate(page, size)
  const layout = await layoutCheck(label)
  if (screenshot) await page.screenshot({ path: `${out}/${screenshot}.png` })
  return layout
}

/** Original games: menu and active play are laid out in both orientations. */
async function checkOriginal(g) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading')
    return !loading || getComputedStyle(loading).display === 'none' || loading.classList.contains('hidden')
  }, null, { timeout: 30000 }).catch(() => {})
  const loading = await page.locator('#loading').isVisible().catch(() => false)
  assert.equal(loading, false, `${g.id}: original game did not load`)
  const portrait = await checkOrientation(portraitSize, `${g.id} original menu portrait`, `${g.id}-original-portrait`)
  const landscape = await checkOrientation(landscapeSize, `${g.id} original menu landscape`, `${g.id}-original-landscape`)

  await tapCentre(page, page.locator(originalStartButton(g.id)))
  await page.waitForFunction(() => {
    const hud = document.querySelector('#hud,#topbar')
    return hud && !hud.classList.contains('hidden')
  }, null, { timeout: 30000 })
  const playLandscape = await checkOrientation(landscapeSize, `${g.id} original play landscape`, `${g.id}-play-landscape`)
  const playPortrait = await checkOrientation(portraitSize, `${g.id} original play portrait`, `${g.id}-play-portrait`)
  assertClean(`${g.id}: original`)
  report.push({ id: g.id, loading, portrait, landscape, playPortrait, playLandscape, errors: [...session.errors], network: [...network] })
  console.log(`BOOT + PLAY ${g.id} ready ${session.errors.length} errors`)
}

const screenshotModes = new Set()

/** New games: play five rounds at one level, finish, and return to the menu. */
async function checkLearningGame(g, i, started) {
  const level = option('--level', i % 3)
  await page.waitForFunction(() => window.__learning && document.getElementById('play') && !document.getElementById('play').disabled, null, { timeout: 30000 })
  await layoutCheck(`${g.id} menu portrait`)
  await page.locator(`[data-level="${level}"]`).tap()
  await page.locator('#play').tap()
  const portrait = await layoutCheck(`${g.id} play portrait`)
  // One pair of screenshots per activity type.
  const firstOfMode = !screenshotModes.has(g.mode)
  screenshotModes.add(g.mode)
  const landscape = await checkOrientation(landscapeSize, `${g.id} play landscape`, firstOfMode && `${g.mode}-landscape`)
  if (firstOfMode) await checkOrientation(portraitSize, `${g.id} play portrait again`, `${g.mode}-portrait`)
  if (!smoke) {
    for (let round = 0; round < 5; round++) {
      const c = await page.evaluate(() => structuredClone(window.__learning.state.challenge))
      assert.equal(c.round, round)
      await solve(c)
      await tapAction(round === 4 ? 'Finish adventure' : 'Next adventure')
    }
    await page.waitForFunction(() => window.__learning.state.screen === 'win')
    await layoutCheck(`${g.id} win`)
    // Saved progress and menu exit must work after a complete adventure.
    await page.locator('#win-home').tap()
    assert.equal(await page.evaluate(() => window.__learning.state.screen), 'menu')
  }
  assertClean(`${g.id}:`)
  const entry = { id: g.id, mode: g.mode, level: Number(level), rounds: smoke ? 0 : 5, portrait, landscape, ms: Date.now() - started, browser: browserName }
  report.push(entry)
  console.log(`PASS ${i + 1}/${Math.min(designs.length, limit)} ${g.id} · ${entry.rounds} rounds · ${entry.ms}ms`)
}

function assertClean(label) {
  assert.deepEqual(session.errors, [], `${label} runtime errors`)
  assert.deepEqual(network, [], `${label} missing assets`)
}

const writeReport = () => writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2))
try {
  for (const [i, g] of designs.slice(offset, offset + limit).entries()) {
    session.errors.length = 0
    network = []
    const started = Date.now()
    await page.setViewportSize(portraitSize)
    const renderScale = process.env.EXAMPLES_RENDER_SCALE || (browserName === 'webkit' ? '0.6' : '')
    await page.goto(`${origin}/${g.id}/?debug${renderScale ? `&renderScale=${encodeURIComponent(renderScale)}` : ''}`, { waitUntil: 'domcontentloaded' })
    if (originalsOnly) await checkOriginal(g)
    else await checkLearningGame(g, i, started)
    writeReport()
  }
} catch (error) {
  await page.screenshot({ path: `${out}/failure-${browserName}.png` }).catch(() => {})
  console.error('FAIL', page.url(), error)
  process.exitCode = 1
} finally {
  await browser.close()
  writeReport()
  console.log(`Completed ${report.length} games; screenshots and report: ${out}`)
}
