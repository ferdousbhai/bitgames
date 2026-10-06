// Trusted gestures and visible causal outcomes beyond answer-button playthroughs.
import assert from 'node:assert/strict'
import {
  actionButton, centreOf, loadLearningGame, origin, runChecks, startBrowser, tapCentre, touchStroke, worldTarget,
} from './harness.mjs'

const session = await startBrowser({ out: 'quality-gestures', context: { deviceScaleFactor: 2 } })
const { page, context, out } = session
const cdp = await context.newCDPSession(page)

async function open(id) {
  await loadLearningGame(page, id)
  await page.locator('#play').tap()
}
const screenPoint = (point) => page.evaluate((p) => window.__learning.api.screenPoint(p), point)
/** The fields these checks read from a named object on the 3D board. */
const boardObject = (name) => page.evaluate((name) => {
  const o = window.__learning.api.board.getObjectByName(name)
  return { x: o.position.x, visible: o.visible, count: o.userData.count, hour: o.userData.hour, minute: o.userData.minute }
}, name)
const readout = () => page.locator('#actions .readout').textContent()
const pressedCount = () => page.locator('.world-action[aria-pressed=true]').count()
const targetCentre = async (index) => centreOf(await worldTarget(page, index).boundingBox())
const isSolved = () => page.evaluate(() => window.__learning.state.solved)
const waitSolved = () => page.waitForFunction(() => window.__learning.state.solved)

/** Carry a held finger from one point to another in twelve steps. */
async function drag(from, to, end = 'touchEnd') {
  const steps = Array.from({ length: 13 }, (_, i) => ({ x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }))
  await touchStroke(cdp, steps, end)
  await page.waitForTimeout(300)
}

await runChecks(session, async (pass) => {
  await open('firefly-lanterns')
  const lantern = await screenPoint({ x: 0, y: 0.9, z: -2.35 })
  await drag(await targetCentre(0), lantern)
  assert.equal(await pressedCount(), 1)
  assert.ok((await readout()).startsWith('1 /'))
  pass('A held touch carries a firefly into the lantern exactly once.')
  await drag(await targetCentre(1), lantern, 'touchCancel')
  assert.equal(await pressedCount(), 1)
  pass('Cancelling a drag returns the uncollected toy without changing the count.')

  await open('colour-cauldron')
  const recipe = await page.evaluate(() => window.__learning.state.challenge.ingredients)
  for (const colour of recipe) {
    const index = await page.evaluate((v) => window.__learning.targets.findIndex((t) => t.button.textContent === v), colour)
    await drag(await targetCentre(index), await screenPoint({ x: 0, y: 1.3, z: -0.5 }))
  }
  assert.ok((await readout()).includes(' + '), 'Both dragged paint bottles must have poured.')
  const stirCircle = await page.evaluate(() => Array.from({ length: 33 }, (_, i) => {
    const angle = i / 32 * Math.PI * 2
    return window.__learning.api.screenPoint({ x: Math.cos(angle) * 0.6, y: 1.3, z: -0.5 + Math.sin(angle) * 0.6 })
  }))
  await touchStroke(cdp, stirCircle)
  await waitSolved()
  pass('Two dragged bottles and a circular stirring gesture complete the paint recipe.')
  await page.screenshot({ path: `${out}/stirred-paint.png` })

  await open('letter-trails')
  // Step 4 of Little steps is big A: two slanted strokes from the top, then the crossbar.
  await page.evaluate(() => window.__learning.startRound(3))
  await page.waitForTimeout(300)
  const trail = await page.evaluate(() => {
    const c = window.__learning.state.challenge
    return { starts: c.strokeStarts, points: c.points.map(([x, z]) => window.__learning.api.screenPoint({ x, y: 0.25, z })) }
  })
  // Run every stroke into one without lifting: the letter must not complete.
  await touchStroke(cdp, trail.points, null)
  assert.equal(await isSolved(), false, 'Connecting all strokes without lifting must not complete A.')
  assert.equal(await page.locator('.world-action.reached').count(), trail.starts[1])
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  for (let i = 1; i < trail.starts.length; i++) {
    await touchStroke(cdp, trail.points.slice(trail.starts[i], trail.starts[i + 1] || trail.points.length))
  }
  await waitSolved()
  pass('Letter A requires three separate held strokes, with a finger lift between strokes.')

  await open('acorn-addition')
  const visibleAcorns = await page.evaluate(() => {
    let count = 0
    window.__learning.api.board.parent.traverse((o) => {
      if (o.name !== 'acorn' || !o.visible) return
      let visible = true
      for (let p = o.parent; p; p = p.parent) if (!p.visible) visible = false
      if (visible) count++
    })
    return count
  })
  const acorns = await page.evaluate(() => {
    const c = window.__learning.state.challenge
    return { answers: c.tiles.length, total: c.a + c.b }
  })
  assert.equal(visibleAcorns, acorns.total, 'Only the mathematical acorns may be visible.')
  assert.equal(await worldTarget(page, 0).isDisabled(), true)
  const recipientCount = async () => (await boardObject('quantity-recipient-0')).count
  await drag(await targetCentre(acorns.answers + 1), await screenPoint({ x: 0, y: 0.25, z: -1.25 }))
  assert.equal(await recipientCount(), 1)
  await actionButton(page, 'Undo move').tap()
  await page.waitForFunction(() => window.__learning.api.board.getObjectByName('quantity-recipient-0').userData.count === 0)
  assert.equal(await page.evaluate(() => window.__learning.api.board.children.filter((o) => o.name.startsWith('quantity-toy-')).length), acorns.total)
  await worldTarget(page, acorns.answers + 1).focus()
  await page.keyboard.press('Enter')
  assert.equal(await recipientCount(), 1)
  pass('Dragging, undoing, and keyboard activation conserve acorns and keep the answer locked until the story is ready.')

  await open('star-share')
  const sharing = await page.evaluate(() => window.__learning.state.challenge)
  const star = (i) => worldTarget(page, sharing.tiles.length + sharing.b + i)
  const explorer = (i) => worldTarget(page, sharing.tiles.length + i)
  for (let i = 0; i < sharing.a; i++) {
    await star(i).tap()
    await explorer(0).tap()
  }
  assert.equal(await worldTarget(page, 0).isDisabled(), true, 'An unequal share must not unlock the number answer.')
  for (let i = 0; i < sharing.a; i++) await actionButton(page, 'Undo move').tap()
  for (let i = 0; i < sharing.a; i++) {
    await star(i).tap()
    await explorer(i % sharing.b).tap()
  }
  assert.equal(await worldTarget(page, 0).isDisabled(), false)
  pass('Moving every star to one explorer does not count as fair sharing; equal shares unlock the answer.')

  // The beam swings for 0.4 s, so wait for the pans to reach each position.
  const waitForPans = (level) => page.waitForFunction((level) => {
    const [left, right] = ['balance-left', 'balance-right'].map((name) => window.__learning.api.board.getObjectByName(name).position.y)
    return level ? Math.abs(left - right) < 0.001 : left < right
  }, level)
  await open('bear-balance')
  await waitForPans(false)
  const weights = await page.evaluate(() => window.__learning.state.challenge)
  for (let i = weights.base; i < weights.target; i++) await actionButton(page, '+ 1').tap()
  await waitForPans(true)
  pass('The heavier pan sits lower; equal loads bring both pans to the same height.')

  const magnetObjectX = async () => (await boardObject('experiment-object')).x
  const predictYesAndTest = async () => {
    await actionButton(page, 'Yes').tap()
    await actionButton(page, 'Test it').tap()
    await waitSolved()
  }
  await open('magnet-discovery')
  await page.evaluate(() => window.__learning.startRound(2))
  const before = await magnetObjectX()
  assert.equal(await page.evaluate(() => window.__learning.state.challenge.target), false)
  await predictYesAndTest()
  assert.equal(await magnetObjectX(), before)
  assert.ok((await page.locator('#feedback').textContent()).includes('discovered'))
  pass('A wrong magnetic prediction still demonstrates the correct material behaviour.')
  await open('magnet-discovery')
  await predictYesAndTest()
  await page.waitForFunction(() => window.__learning.api.board.getObjectByName('experiment-object').position.x < 0.4)
  pass('The steel object moves towards the approaching magnet.')

  // The tank's water surface sits at y = 0.85; floaters settle across it, sinkers fall below it.
  for (const round of [0, 1]) {
    await open('float-boat-lab')
    await page.evaluate((round) => window.__learning.startRound(round), round)
    const floats = await page.evaluate(() => window.__learning.state.challenge.target)
    await predictYesAndTest()
    await page.waitForFunction((floats) => {
      const y = window.__learning.api.board.getObjectByName('experiment-object').position.y
      return floats ? Math.abs(y - 0.68) < 0.01 : y < 0.1
    }, floats)
  }
  pass('A floating toy rests at the water surface and a sinking one drops below it.')

  await open('cuckoo-clock-garden')
  await drag(await screenPoint({ x: 0, y: 0.35, z: -1.05 }), await screenPoint({ x: 1.05, y: 0.35, z: 0 }))
  assert.equal((await boardObject('clock-hour-hand')).hour, 3)
  assert.equal((await boardObject('clock-minute-hand')).minute, 0)
  pass('Dragging the short clock hand sets the hour while preserving the minute hand.')

  await open('tangram-turntable')
  const turn = await page.evaluate(() => window.__learning.state.challenge.turns[0])
  for (let i = 0; i < (4 - turn) % 4; i++) await actionButton(page, 'Turn right').tap()
  await drag(await targetCentre(0), await screenPoint({ x: 1.55, y: 0.25, z: -1.0666666667 }))
  assert.equal((await boardObject('tangram-piece-0')).visible, true)
  assert.ok((await readout()).includes('1 / 7'))
  pass('A turned tangram triangle can be carried by held touch into its matching outline.')

  await page.goto(`${origin}/rocket-garage/?debug`)
  await page.waitForFunction(() => window.rg?.game.state === 'title')
  await tapCentre(page, page.locator('#play'))
  await page.locator('#experiment').tap()
  await page.locator('#workshop-save').tap()
  await page.locator('#workshop-close').tap()
  await page.locator('[data-slot="booster"]').tap()
  await page.locator('#items [data-id="small"]').tap()
  await page.locator('#experiment').tap()
  await page.locator('[data-predict="b"]').tap()
  await page.locator('#workshop-test').tap()
  await page.waitForFunction(() => document.getElementById('workshop-feedback').textContent.includes('Your prediction matched'))
  assert.ok((await page.locator('#workshop-rule').textContent()).includes('One change: booster'))
  await page.screenshot({ path: `${out}/rocket-comparison.png` })
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.rg.game.state), 'garage')
  pass('Rocket A/B testing uses one changed part and Escape stays in the garage.')
})
