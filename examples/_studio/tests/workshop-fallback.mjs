// An optional workshop asset must not strand the child on an interrupted download.
import assert from 'node:assert/strict'
import { origin, runChecks, startBrowser } from './harness.mjs'

const session = await startBrowser()
const { page } = session
const model = '**/models/colour-kit.glb'
const studio = () => page.evaluate(() => window.__paint.colourStudio.state)
const button = (name) => page.getByRole('button', { name, exact: true })

await runChecks(session, async (pass) => {
  await page.route(model, (route) => route.abort())
  await page.goto(`${origin}/paint-splash/?debug`)
  await page.waitForFunction(() => window.__paint?.game.state === 'menu')
  await page.locator('#colour-open').tap()
  await page.waitForFunction(() => window.__paint.colourStudio.state.assetError)
  await button('Add red drop').tap()
  await button('Add blue drop').tap()
  assert.ok((await page.locator('#colour-studio .studio-status').textContent()).includes('Purple'))
  await button('Paint square 1').tap()
  assert.notEqual((await studio()).picture[0], '#fff9eb')

  await page.unroute(model)
  await page.locator('#paint-assets-retry').tap()
  await page.waitForFunction(() => window.__paint.colourStudio.state.assetReady)
  assert.deepEqual((await studio()).drops, [1, 0, 1])
  assert.equal(await page.locator('#paint-assets-retry').isVisible(), false)

  await page.locator('#paint-clear').tap()
  for (let i = 0; i < 12; i++) await button('Add yellow drop').tap()
  assert.deepEqual((await studio()).drops, [0, 12, 0])
  assert.equal(await button('Add yellow drop').isDisabled(), true)
  await page.locator('#paint-undo').tap()
  assert.equal(await button('Add yellow drop').isDisabled(), false)
  pass('Interrupted toy download preserves mixing and painting; retry preserves the recipe; the twelve-drop cap and Undo work.')
})
