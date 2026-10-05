// Original-game learning additions: actual input, counting outcomes, and modal isolation.
import assert from 'node:assert/strict'
import { engineFromArgs, origin, originalStartButton, runChecks, startBrowser, touch } from './harness.mjs'

const engine = engineFromArgs()
const session = await startBrowser({ engine, out: `${engine}-original-quality`, context: { deviceScaleFactor: 1 } })
const { page } = session

async function open(id, ready) {
  await page.goto(`${origin}/${id}/?debug`)
  await page.waitForFunction(ready, null, { timeout: 40000 })
}
const tap = (selector) => touch(page, selector)
const mission = () => page.evaluate(() => {
  const { option, progress, complete } = window.__adventure.mission
  return { ...option, progress, complete }
})

/** Every visible button in a dialog is at least 44px and inside the portrait viewport. */
async function assertTouchableInViewport(selector) {
  const boxes = await page.locator(selector).evaluateAll((nodes) => nodes
    .filter((n) => n.getBoundingClientRect().width)
    .map((n) => {
      const { width, height, x, y, right, bottom } = n.getBoundingClientRect()
      return { text: n.textContent, width, height, x, y, right, bottom }
    }))
  for (const box of boxes) {
    assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box))
    assert.ok(box.x >= 0 && box.y >= 0 && box.right <= 768 && box.bottom <= 1024, JSON.stringify(box))
  }
}

await runChecks(session, async (pass) => {
  for (const id of ['balloon-pop', 'bumper-ducks', 'bunny-hop', 'cake-stack', 'crash-racers', 'dragon-glide', 'fish-pond', 'star-catcher']) {
    const choiceReady = () => window.__adventure && document.getElementById('adventure-choice')?.getBoundingClientRect().width > 0
    await open(id, choiceReady)
    await page.evaluate(() => localStorage.removeItem(`${location.pathname.split('/')[1]}:adventure`))
    // Advance to the first mission through the real native control.
    for (let attempt = 0; !(await mission()).goal; attempt++) {
      assert.ok(attempt < 4, `${id}: mission control must respond to touch`)
      await tap('#adventure-choice')
      await page.waitForTimeout(100)
    }
    const selected = (await mission()).label
    await page.reload()
    await page.waitForFunction(choiceReady, null, { timeout: 40000 })
    assert.equal((await mission()).label, selected)
    await tap(originalStartButton(id))
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 40000 })
    assert.equal(await page.locator('#adventure-goal').isVisible(), true)
    assert.equal((await mission()).progress, 0)
    assert.ok((await page.locator('#adventure-goal').textContent()).includes('0 /'))
    pass(`${id}: native mission choice persists and starts at zero.`)
  }

  // Moving the car onto each delivery marker, out of order first.
  await open('crash-racers', () => window.__adventure?.game.state === 'menu')
  await tap('#go')
  await page.waitForFunction(() => window.__adventure.game.raceOn)
  async function visit(index) {
    await page.evaluate((i) => {
      const { game, delivery } = window.__adventure
      const { body } = game.player
      body.position.x = delivery.points[i].x
      body.position.z = delivery.points[i].z
      body.velocity.set(0, 0, 0)
    }, index)
    await page.waitForTimeout(200)
  }
  await visit(2)
  assert.equal(await page.evaluate(() => window.__adventure.delivery.next), 0)
  for (let i = 0; i < 4; i++) {
    await visit(i)
    await page.waitForFunction((n) => window.__adventure.delivery.next === n, i + 1)
  }
  assert.equal((await mission()).complete, true)
  pass('Moving the car to actual marker positions verifies the four ordered deliveries.')

  await open('balloon-pop', () => window.__adventure?.game.state === 'title')
  while ((await mission()).label !== 'Count three balloons') await tap('#adventure-choice')
  await tap('#play')
  for (let i = 0; i < 3; i++) {
    // Wait for a live balloon near the middle of the screen and return its screen point.
    const found = await page.waitForFunction(() => {
      const { balloons, camera } = window.__adventure
      for (const b of balloons.list) {
        if (!b.alive) continue
        const p = b.group.position.clone()
        const shape = balloons.shapes[b.kind.model]
        if (shape) {
          p.x += shape.x * b.scale
          p.y += shape.y * b.scale
        }
        p.project(camera)
        if (Math.abs(p.x) < 0.85 && Math.abs(p.y) < 0.7) return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }
      }
      return null
    }, null, { timeout: 20000 })
    const point = await found.jsonValue()
    await page.touchscreen.tap(point.x, point.y)
    await page.waitForFunction((n) => window.__adventure.mission.progress === n, i + 1)
  }
  assert.equal((await mission()).complete, true)
  pass('Three directly touched balloons complete the raw-count mission.')

  await open('cake-stack', () => window.cakeStack?.game.state === 'title')
  while ((await mission()).target !== 3) await tap('#adventure-choice')
  await tap('#play')
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => window.cakeStack.mover?.appear >= 0.6 && !window.cakeStack.mover.dropping)
    await page.touchscreen.tap(380, 500)
    await page.waitForFunction((n) => window.__adventure.mission.progress === n, i + 1)
  }
  assert.equal(await page.evaluate(() => window.cakeStack.cake.layers.length), 3)
  assert.equal((await mission()).complete, true)
  pass('Actual cake drops count three placed layers.')

  await open('memory-match', () => window.__memory?.game.state === 'menu')
  await tap('#play')
  await page.waitForFunction(() => window.__memory.game.state === 'play')
  await tap('#peek')
  await page.waitForFunction(() => window.__memory.game.cards.filter((c) => c.state === 'open').length === 2)
  assert.deepEqual(await page.evaluate(() => [window.__memory.game.turns, window.__memory.game.matched]), [0, 0])
  await page.waitForFunction(() => !window.__memory.game.busy)
  assert.equal(await page.evaluate(() => window.__memory.game.cards.every((c) => c.state === 'down')), true)
  pass('The pair hint reveals two matching cards, returns them, and consumes no turn.')

  await open('paint-splash', () => window.__paint?.game.state === 'menu')
  await tap('#go')
  await page.waitForFunction(() => window.__paint.game.state === 'play')
  // Save four pictures; the gallery keeps the latest three.
  for (let i = 0; i < 4; i++) {
    await tap('#gallery-save')
    if (i < 3) await tap('#gallery-close')
  }
  await assertTouchableInViewport('#art-gallery button')
  assert.equal(await page.locator('#gallery-pictures img').count(), 3)
  assert.equal(await page.evaluate(() => window.__paint.gallery.count), 3)
  const colourCount = await page.locator('#gallery-pictures img').first().evaluate(async (img) => {
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 48
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, 48, 48)
    return new Set(ctx.getImageData(0, 0, 48, 48).data).size
  })
  assert.ok(colourCount > 40, 'Saved artwork must contain rendered scene pixels.')
  const painterPosition = () => page.evaluate(() => ({ x: window.__paint.game.me.x, z: window.__paint.game.me.z }))
  const before = await painterPosition()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.__paint.game.state), 'play')
  assert.equal(await page.locator('#art-gallery').isVisible(), false)
  const after = await painterPosition()
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.1)
  pass('The gallery keeps three nonblank scene pictures and isolates painting controls.')

  await open('penguin-bowling', () => window.__pb?.game.state === 'title')
  await tap('#play')
  await tap('#predict-pins')
  await assertTouchableInViewport('#pin-prediction button')
  const initial = Number(await page.locator('#pin-value').textContent())
  await tap('#pin-more')
  assert.equal(Number(await page.locator('#pin-value').textContent()), initial + 1)
  await tap('#pin-confirm')
  const guess = await page.evaluate(() => window.__pb.prediction.guess)
  await tap('#go')
  await page.waitForFunction(() => window.__pb.game.outcome, null, { timeout: 30000 })
  const result = await page.evaluate(() => ({
    before: window.__pb.game.standingBefore,
    knocked: window.__pb.game.outcome.knocked,
    standing: window.__pb.pins.countStanding(),
  }))
  assert.equal(result.knocked + result.standing, result.before)
  assert.ok((await page.locator('#pin-discovery').textContent()).includes(`I predicted ${guess}`))
  pass('The pin prediction compares with the actual physics outcome and conserves the pin count.')

  await page.waitForFunction(() => window.__pb.game.state === 'aim')
  await tap('#predict-pins')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.__pb.game.state), 'aim')
  pass('Escape closes the pin prediction while keeping the bowling game open.')
})
