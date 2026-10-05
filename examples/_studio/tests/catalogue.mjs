// Verify the preview's root URL as well as its filters and local art links.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { origin, runChecks, startBrowser } from './harness.mjs'

const games = JSON.parse(readFileSync(new URL('../../catalogue/games.json', import.meta.url)))
const session = await startBrowser()
const { page } = session
const cardCount = () => page.locator('#games a').count()

await runChecks(session, async (pass) => {
  await page.goto(origin)
  await page.waitForSelector('#games a')
  assert.equal(await cardCount(), 100)

  await page.locator('#search').fill('firefly')
  const matchesFirefly = (g) => `${g.title} ${g.tagline} ${g.learning || ''}`.toLowerCase().includes('firefly')
  assert.equal(await cardCount(), games.filter(matchesFirefly).length)
  await page.locator('#search').fill('')

  await page.locator('#age').selectOption('2')
  assert.equal(await cardCount(), games.filter((g) => !g.ages || (g.ages[0] <= 2 && g.ages[1] >= 2)).length)
  await page.locator('#age').selectOption('')

  await page.locator('#skill').selectOption('Reflection symmetry')
  assert.equal(await cardCount(), 1)
  await page.locator('#skill').selectOption('')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))

  for (const game of games) {
    const response = await page.request.get(`${origin}/${game.id}/cover.jpg`)
    assert.equal(response.status(), 200, game.id)
    assert.ok((await response.body()).length > 1000, game.id)
  }
  pass('100 catalogue cards, search/age/skill filters, tablet bounds, and 100 covers.')
})
