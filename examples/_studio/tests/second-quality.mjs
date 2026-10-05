// Verify child-created outcomes, conservation, actual local models, and iPad modal focus.
// --webkit runs in WebKit; --studios runs only the original games' studio dialogs.
import assert from 'node:assert/strict'
import {
  assertRendererRests, engineFromArgs, loadLearningGame, origin, receivesCentreTouch, runChecks, startBrowser, touch, untilPasses, waitForTurn,
} from './harness.mjs'

const engine = engineFromArgs()
const studiosOnly = process.argv.includes('--studios')
const session = await startBrowser({
  engine,
  out: `${engine}-second-quality${studiosOnly ? '-studios' : ''}`,
  context: { deviceScaleFactor: 1, reducedMotion: 'reduce' },
})
const { page, out } = session
page.setDefaultTimeout(15000)

/** Tap a control after proving it is at least 44px and uncovered. */
async function tap(target) {
  const locator = typeof target === 'string' ? page.locator(target) : target
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  assert.ok(box && box.width >= 44 && box.height >= 44)
  await touch(page, locator)
}
const action = (text) => tap(page.locator('#actions button').filter({ hasText: text }))
const note = (index) => tap(page.locator('.world-action').nth(index))
const composition = () => page.evaluate(() => {
  const { song, playing, composing } = window.__learning.api.board.userData.composition
  return { song, playing, composing }
})
const solved = () => page.evaluate(() => window.__learning.state.solved)
const waitPlaybackEnd = () => page.waitForFunction(() => !window.__learning.api.board.userData.composition.playing)

async function open(id) {
  await loadLearningGame(page, id, `&renderScale=${engine === 'webkit' ? 0.6 : 1}`)
  if (['sound-wave-lab', 'birdsong-tuner'].includes(id)) await tap('[data-level="1"]')
  await tap('#play')
}

/** In both orientations, every enabled dialog button is 48px, on screen and uncovered. */
async function modalBounds(id) {
  for (const size of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size)
    // The dialog relays out a frame after the rotation.
    await untilPasses(async () => {
      const buttons = page.locator(`#${id} button:visible`)
      for (let i = 0; i < await buttons.count(); i++) {
        const button = buttons.nth(i)
        if (await button.isDisabled()) continue
        await button.scrollIntoViewIfNeeded()
        const box = await button.boundingBox()
        assert.ok(box.width >= 48 && box.height >= 48, `${id}: 48px controls`)
        assert.ok(box.x >= 0 && box.x + box.width <= size.width)
        assert.ok(await receivesCentreTouch(button), `${id}: ${await button.textContent()} centre hit`)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    })
  }
  await page.setViewportSize({ width: 768, height: 1024 })
}

async function checkSnowflakeStudio(pass) {
  await open('snowflake-studio')
  await action('Make my own snowflake')
  await tap('[aria-label="Snowflake arm 3 branch 1"]')
  const snow = await page.evaluate(() => {
    const root = window.__learning.api.board.getObjectByName('snowflake')
    const arms = root.children.filter((o) => o.name.startsWith('snowflake-arm-'))
    return {
      free: root.userData.free,
      motif: root.userData.motif,
      angles: arms.map((o) => o.rotation.y),
      colours: arms.map((o) => o.children.filter((o) => o.isMesh).map((o) => o.material.color.getHexString())),
    }
  })
  assert.equal(snow.free, true)
  assert.equal(snow.motif[0], true)
  assert.equal(snow.angles.length, 6)
  snow.angles.forEach((angle, i) => assert.ok(Math.abs(angle - i * Math.PI / 3) < 0.00001))
  snow.colours.forEach((colours) => assert.deepEqual(colours, snow.colours[0]))
  assert.equal(snow.colours[0][1], snow.colours[0][2])
  await action('Admire')
  assert.equal(await solved(), false)
  await page.screenshot({ path: `${out}/sixfold-snowflake.png` })
  pass('A branch touch makes six equally rotated, reflected arms; free creation is ungraded.')
}

async function checkMelodyComposer(pass, id) {
  await open(id)
  const echo = await page.evaluate(() => window.__learning.state.challenge.mode === 'echo')
  if (echo) await waitForTurn(page)
  const word = echo ? 'song' : 'melody'
  await action(`Compose my ${word}`)
  for (const i of [2, 0, 2]) await note(i)
  assert.deepEqual((await composition()).song, [2, 0, 2])
  await action('Undo sound')
  assert.deepEqual((await composition()).song, [2, 0])

  await action(`Play my ${word}`)
  assert.equal((await composition()).playing, true)
  assert.equal(await page.locator('.world-action:disabled').count(), await page.locator('.world-action').count())
  await waitPlaybackEnd()
  assert.equal(await solved(), false)

  await action(`Clear my ${word}`)
  assert.deepEqual((await composition()).song, [])
  // A composition is capped at twelve notes.
  for (let n = 0; n < 13; n++) await note(n % 3)
  assert.equal((await composition()).song.length, 12)
  await action(`Clear my ${word}`)
  await action(`Compose my ${word}`)
  assert.equal((await composition()).composing, false)
  pass(`${id}: child composition, undo, bounded playback, clear and lesson return.`)
}

async function checkRhythmComposer(pass, id) {
  await open(id)
  await waitForTurn(page)
  await action('Compose my rhythm')
  await note(1)
  await note(3)
  assert.equal((await composition()).song.filter(Boolean).length, 2)
  await action('Play my rhythm')
  await waitPlaybackEnd()
  assert.equal(await solved(), false)
  await action('Clear my rhythm')
  assert.equal((await composition()).song.some(Boolean), false)
  pass(`${id}: freely placed beats and rests play without grading and can be cleared.`)
}

async function checkCakeStudio(pass) {
  const status = () => page.locator('#birthday-studio .studio-status').textContent()
  const studio = () => page.evaluate(() => window.cakeStack.recipeStudio.state)
  const flavour = (name) => tap(page.getByRole('button', { name, exact: true }))
  /** Put each slice on a plate, cycling through `friends` plates. */
  async function share(slices, friends) {
    for (let i = 1; i <= slices; i++) {
      await tap(`[aria-label="Slice ${i}"]`)
      await tap(`[aria-label="Friend ${(i - 1) % friends + 1} plate"]`)
    }
    await tap('#share-check')
  }

  await page.goto(`${origin}/cake-stack/?debug`)
  await page.waitForFunction(() => window.cakeStack?.game.state === 'title')
  await tap('#recipe-open')
  await modalBounds('birthday-studio')
  await flavour('🍓 strawberry')
  await tap('#recipe-check')
  assert.ok((await status()).includes('Compare'))
  await tap('#recipe-undo')
  for (const name of ['🍦 vanilla', '🍓 strawberry', '🍦 vanilla']) await flavour(name)
  await tap('#recipe-check')
  assert.ok((await status()).includes('matches'))
  assert.deepEqual((await studio()).layers, ['vanilla', 'strawberry', 'vanilla'])
  await page.screenshot({ path: `${out}/cake-recipe.png` })

  await tap('#share-tab')
  await share(4, 1)
  assert.ok((await status()).includes('same number'))
  await tap('#share-undo')
  assert.equal((await studio()).owners.filter((o) => o !== null).length, 3)
  await tap('#share-reset')
  await share(4, 2)
  assert.ok((await status()).includes('one half'))
  await page.screenshot({ path: `${out}/cake-halves.png` })
  await tap('#share-size')
  await share(6, 3)
  assert.ok((await status()).includes('one third'))
  await modalBounds('birthday-studio')

  await assertRendererRests(page, () => window.cakeStack.recipeStudio.state.draws)
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.cakeStack.game.state), 'title')
  assert.equal(await page.locator('#birthday-studio').isVisible(), false)
  pass('Cake recipes reject wrong orders; sharing rejects unequal plates, conserves slices, demonstrates halves/thirds and rests between touches.')
}

async function checkPaintStudio(pass) {
  const status = () => page.locator('#colour-studio .studio-status').textContent()
  const studio = () => page.evaluate(() => window.__paint.colourStudio.state)
  const addDrop = (colour) => tap(`[aria-label="Add ${colour} drop"]`)

  await page.goto(`${origin}/paint-splash/?debug`)
  await page.waitForFunction(() => window.__paint?.game.state === 'menu')
  await tap('#colour-open')
  await page.waitForFunction(() => window.__paint.colourStudio.state.assetReady)
  await addDrop('red')
  await addDrop('yellow')
  assert.ok((await status()).includes('Orange'))
  await tap('#paint-compare')
  const { saved } = await studio()
  await tap('[aria-label="Paint square 1"]')
  assert.equal((await studio()).picture[0], saved.hex)
  await addDrop('blue')
  await tap('#paint-undo')
  assert.deepEqual((await studio()).drops, [1, 1, 0])
  await tap('#paint-clear')
  assert.deepEqual((await studio()).drops, [0, 0, 0])
  assert.equal((await studio()).picture[0], saved.hex)
  await addDrop('yellow')
  await addDrop('blue')
  assert.ok((await status()).includes('Green'))
  assert.deepEqual((await studio()).saved, saved)
  await page.screenshot({ path: `${out}/paint-comparison.png` })
  await modalBounds('colour-studio')

  await assertRendererRests(page, () => window.__paint.colourStudio.state.draws)
  await tap('#paint-picture-clear')
  assert.equal((await studio()).picture.every((c) => c === '#fff9eb'), true)
  // Enter inside the open studio must not start the game; Escape closes only the studio.
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(() => window.__paint.game.state), 'menu')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.__paint.game.state), 'menu')
  assert.equal(await page.locator('#colour-studio').isVisible(), false)
  pass('Blender paint toys load; ratios, undo, saved colour comparison and mosaic persist independently; modal controls work in both orientations and rendering rests.')
}

await runChecks(session, async (pass) => {
  if (!studiosOnly) {
    await checkSnowflakeStudio(pass)
    for (const id of ['frog-choir', 'crystal-cave-echo', 'robot-dance-code', 'sleepy-owl-lullaby', 'sound-wave-lab', 'birdsong-tuner']) {
      await checkMelodyComposer(pass, id)
    }
    for (const id of ['drum-beat-builder', 'rain-drop-rhythm']) await checkRhythmComposer(pass, id)
  }
  await checkCakeStudio(pass)
  await checkPaintStudio(pass)
})
