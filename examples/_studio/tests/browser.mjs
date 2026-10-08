// Trusted original-game startup and layout checks; generated games were retired.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { originalIds } from '../catalogue.mjs';
import { origin, originalStartButton, rotate, startBrowser, tapCentre, untilPasses } from './harness.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const browserName = option('--browser', 'webkit');
const portraitSize = args.includes('--mini') ? {width:768,height:1024} : {width:834,height:1194};
const landscapeSize = {width:portraitSize.height,height:portraitSize.width};
const selectedIds = option('--ids', '').split(',').filter(Boolean);
if (selectedIds.some(id => !originalIds.includes(id))) throw new Error('Only curated original games can be tested.');
const designs = (selectedIds.length ? selectedIds : originalIds).map(id => JSON.parse(readFileSync(new URL(`../../${id}/game.json`, import.meta.url))));
const session = await startBrowser({engine:browserName,out:`${browserName}-originals-${option('--run','smoke')}`,context:{viewport:portraitSize,deviceScaleFactor:1}});
const {browser,page,out} = session;
let network = [];
page.on('response',r=>{if(r.status()>=400)network.push(`${r.status()} ${r.url()}`)});
const report = [];
const assertClean = label => { assert.deepEqual(session.errors,[],label);assert.deepEqual(network,[],label); };
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


try {
  for (const g of designs.slice(Number(option('--offset',0)), Number(option('--offset',0))+Number(option('--limit',1000)))) {
    session.errors.length=0;network=[];
    await page.goto(`${origin}/${g.id}/?debug`, {waitUntil:'domcontentloaded'});
    await checkOriginal(g);
    writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  }
} catch (error) {
  console.error(error);process.exitCode=1;
  await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});
} finally {
  await browser.close();
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
}
