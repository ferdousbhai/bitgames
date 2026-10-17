// Screen-specific palm, resting-hand and focused-key regressions; no fabricated end state.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { originalIds } from '../catalogue.mjs'
import { engineFromArgs, origin, originalStartButton, startBrowser, tapCentre } from './harness.mjs'

const engine = engineFromArgs()
const session = await startBrowser({ engine, context: { deviceScaleFactor: 1 } })
const { page, browser, errors } = session
const out = `${process.env.TMPDIR || '/tmp'}/bitgames-playtest/${engine}-mash`
mkdirSync(out, { recursive: true })
await page.addInitScript(() => {
  window.__mashSpeechCalls = 0
  if (window.speechSynthesis) speechSynthesis.speak = () => window.__mashSpeechCalls++
})
const report = []
const saveReport = () => writeFileSync(`${out}/report.json`, JSON.stringify({ screens: report, pageErrors: errors }, null, 2))
const endSelectors = { 'bunny-hop': '#results', 'bumper-ducks': '#results', 'cake-stack': '#card', 'crash-racers': '#results', 'dragon-glide': '#results', 'memory-match': '#win', 'paint-splash': '#results', 'penguin-bowling': '#results', 'rocket-garage': '#reward', 'star-catcher': '#finale' }
// Reachability: taps and the listed hooks, bounded at 150 s (Star Catcher: 300 s).
// Existing hooks only accelerate time,
// invoke existing gameplay actions or choose real cards; never assign state/DOM.
// Balloon Pop and Fish Pond are endless: no end/results/card exists in main.js.
// Bunny: ordinary running/hops. Ducks: endRound(). Paint: end(). Crash: endRace().
// Dragon: sim() and real fly-on taps. Cake: tray/done/party taps.
// Memory: debug camera/card positions -> real matching taps.
// Penguin: normal slide taps, then existing __pb.throwPenguin() + frame(1/30).
// Rocket: launch tap, then rg.step(). Star: debug item projection + real taps.
// Failed Bunny result cases replay via the existing ?biome=3 entry point.
const settings = () => page.evaluate(() => ({
  saved: Object.fromEntries(Object.keys(localStorage).filter(k => /mute|sound|music|audio/i.test(k)).map(k => [k, localStorage.getItem(k)])),
  // Include hidden controls: advancing to play must not hide an accidental mute.
  controls: [...document.querySelectorAll('button')].filter(b => /🔊|🔇|🎵/.test(b.textContent)).map(b => [b.id, b.textContent.trim(), b.classList.contains('off'), b.getAttribute('aria-pressed')]),
}))
const visible = selector => page.locator(selector).isVisible().catch(() => false)
// These helper-wrapped controls have neither a hold class nor a leave/settings emoji.
const extraHoldIds = { 'bunny-hop': ['pace'], 'star-catcher': ['again'] }
const holdButtons = (id, screen) => page.locator('button').evaluateAll((bs, {extra, screen}) => bs.filter(b => {
  const r = b.getBoundingClientRect(), s = getComputedStyle(b)
  if (screen === 'results' && /▶|🔁|🗺/.test(b.textContent)) return false
  return r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none' && ( /hold/i.test(`${b.className} ${b.title} ${b.getAttribute('aria-label')}`) || (b.id && /🏠|🔊|🎵|🅿|✅|🗺/.test(b.textContent)) || extra.includes(b.id))
}).map(b => ({ id: b.id, label: b.textContent.trim(), index: [...document.querySelectorAll('button')].indexOf(b) })), {extra: extraHoldIds[id] || [], screen})
let cdp
const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
async function load(id, screen, restoring = false) {
  await page.goto(`${origin}/${id}/?debug${restoring && id === 'bunny-hop' && screen === 'results' ? '&biome=3' : ''}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator(originalStartButton(id)).waitFor({ state: 'visible', timeout: 40000 })
  if (screen !== 'menu') {
    await tapCentre(page, page.locator(originalStartButton(id)))
    await page.waitForTimeout(2500)
    if (screen === 'results') return await reachEnd(id, restoring)
  }
}
async function reachEnd(id, restoring) {
  const selector = endSelectors[id]
  assert.ok(selector, 'No end/results/card screen: endless play (not fabricated)')
  const timeout = id === 'star-catcher' ? 300000 : 150000
  const deadline = Date.now() + timeout
  const began = Date.now()
  let hook = restoring && id === 'bunny-hop' ? 'existing ?biome=3 + normal taps' : 'normal taps'
  while (Date.now() < deadline) {
    if (await visible(selector)) {
      await page.waitForTimeout(2500) // test after payoff guards have armed
      console.log('REACHED', id, hook)
      return hook
    }
    if (id === 'memory-match') {
      const points = await page.evaluate(() => {
        const d = window.__memory
        if (d?.game.state !== 'play' || d.game.busy) return []
        const cards = d.game.cards.filter(c => c.state === 'down')
        if (!cards.length) return []
        const first = cards[0], pair = cards.find(c => c !== first && c.animal === first.animal)
        return [first, pair].filter(Boolean).map(c => { const p = c.group.position.clone(); p.project(d.camera); return [(p.x + 1) * innerWidth / 2, (1 - p.y) * innerHeight / 2] })
      })
      for (const [x,y] of points) { await page.touchscreen.tap(x,y); await page.waitForTimeout(600) }
      hook = 'debug card projection + real taps'
    } else if (id === 'penguin-bowling' && (restoring || Date.now() - began > 20000)) {
      await page.evaluate(() => {
        const d = window.__pb
        if (d.game.state === 'aim') d.throwPenguin({ angle: 0, power: 0.75, hook: 0 })
        for (let i = 0; i < 30; i++) d.frame(1/30)
      })
      hook = 'normal slides + existing __pb.throwPenguin()/frame(1/30)'
    } else if (id === 'star-catcher' && (restoring || Date.now() - began > 20000)) {
      // catchItem() alone does not recycle the item; keep the full pickup path
      // by aiming real touches at visible, live stars nearest to Kitty.
      const at = await page.evaluate(() => {
        const d = window.__game
        if (d.game.phase !== 'build') return null
        const kitty = d.toScreen(d.rocket.root.position)
        return d.items.filter(i => i.kind !== 'rock' && i.kind !== 'spark' && !i.fading && !i.bounced && i.obj.visible)
          .map(i => d.toScreen(i.obj.position))
          .filter(p => p.x > 20 && p.x < innerWidth - 20 && p.y > 180 && p.y < innerHeight - 20)
          .sort((a,b) => Math.hypot(a.x-kitty.x,a.y-kitty.y) - Math.hypot(b.x-kitty.x,b.y-kitty.y))[0] || null
      })
      if (at && at.x > 0 && at.x < 768 && at.y > 0 && at.y < 1024) await page.touchscreen.tap(at.x, at.y)
      hook = 'debug item projection + real taps'
    } else {
      for (const s of ['#fly-on', '#done', '#launch', ...(id === 'penguin-bowling' ? ['#go'] : [])]) {
        if (await visible(s)) {
          const box = await page.locator(s).boundingBox()
          // Animation can hide a progression button between visibility and measurement.
          if (box && !(await visible(selector))) await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2)
        }
      }
      await page.touchscreen.tap(384, 650)
    }
    if (Date.now() - began > (restoring ? 0 : 20000)) {
      const used = await page.evaluate(id => {
        if (id === 'bumper-ducks' && window.__ducks?.game.state === 'play') { window.__ducks.endRound(); return 'existing __ducks.endRound()' }
        if (id === 'paint-splash' && window.__paint?.game.state === 'play') { window.__paint.end(); return 'existing __paint.end()' }
        if (id === 'crash-racers' && window.__crash?.game.state === 'race') { window.__crash.endRace(); return 'existing __crash.endRace()' }
        if (id === 'dragon-glide' && window.sim) { window.sim(10); return 'existing sim(10) + fly-on taps' }
        if (id === 'rocket-garage' && window.rg) { window.rg.step(10); return 'existing rg.step(10) + launch tap' }
        return null
      }, id)
      if (used) hook = used
    }
    await page.waitForTimeout(id === 'star-catcher' ? 100 : 350)
  }
  throw new Error(`Results not reached in ${timeout/1000} s via ${hook}; ${await page.evaluate(() => (window.game || window.__game?.game || window.cakeStack?.game || window.rg?.game || window.__pb?.game || window.__memory?.game)?.state)}`)
}
async function checkScreen(id, screen) {
  console.log('CHECK', id, screen)
  const errorStart = errors.length
  const row = { id, screen, status: 'PASS', failures: [] }
  report.push(row)
  if (screen === 'results' && ['balloon-pop', 'fish-pond'].includes(id)) {
    row.status = 'N/A'
    row.reason = id === 'fish-pond' ? 'Endless play; the 3.8 s catch presentation advances automatically, with no end card.' : 'Endless play; no end/results/card screen exists.'
    console.log('SCREEN', JSON.stringify(row))
    saveReport()
    return
  }
  try {
    row.reachedBy = await load(id, screen)
    const buttons = await holdButtons(id, screen)
    row.buttons = buttons.map(b => b.id || b.label)
    const safe = async (before, navigation = false) => {
      if (screen !== 'menu' && !navigation) assert.equal(await visible(originalStartButton(id)), false, 'exited play to menu/title')
      assert.deepEqual(await settings(), before, 'changed sound setting (saved or control state)')
      assert.equal(await page.locator('button:visible').evaluateAll(bs => bs.some(b => b.textContent.includes('🔇'))), false, '🔇 visible')
    }
    await safe(await settings())
    for (const b of buttons) for (const sequence of (process.env.EXAMPLES_SEQUENCES === 'keyboard' ? [] : ['palm80', 'palm150', 'palm300', 'rest1500', 'quickEnter', 'quickSpace', 'heldEnter', 'heldSpace'])) {
      const before = await settings()
      try {
        const target = b.id ? page.locator(`[id=${JSON.stringify(b.id)}]`) : page.locator('button').nth(b.index)
        const box = await target.boundingBox()
        assert.ok(box, 'hold button missing')
        const x = box.x + box.width / 2, y = box.y + box.height / 2
        const rest = sequence.startsWith('rest')
        // Resolve resting positions before putting a finger down: layout reads must
        // never accidentally turn a palm setup into a long single-finger hold.
        const background = rest ? await page.evaluate(() => {
          const spots = []
          for (const y of [0.4, 0.5, 0.7, 0.8]) for (const x of [0.3, 0.5, 0.7]) {
            const px = innerWidth*x, py = innerHeight*y
            if (!document.elementFromPoint(px,py)?.closest('button')) spots.push([px,py])
          }
          return spots.slice(0,2)
        }) : []
        if (rest) assert.equal(background.length,2,'need two resting fingers away from buttons')
        const p = [{ x,y,id:0 }]
        await touch('touchStart', p)
        if (sequence.startsWith('palm') || rest) {
          p.push({x: rest ? background[0][0] : x+12,y: rest ? background[0][1] : y+6,id:1})
          await touch('touchStart', p)
          p.push({x: rest ? background[1][0] : x-10,y: rest ? background[1][1] : y+10,id:2})
          await touch('touchStart', p)
          await page.waitForTimeout(Number(sequence.match(/\d+/)[0]))
          await safe(before) // also sample while fingers are down
          await touch('touchEnd', [])
        } else {
          // Preserve the focus left by a real short touch; never call focus().
          await page.waitForTimeout(60)
          await touch('touchEnd', [])
          await safe(before).catch(error => { throw new Error(`short tap only: ${error.message}`) })
          const key = sequence.endsWith('Enter') ? 'Enter' : 'Space'
          row.focus ||= {}
          row.focus[b.id || b.label] = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
          let firstFailure
          const sample = async phase => { try { await safe(before) } catch(error) { firstFailure ||= new Error(`${phase}: ${error.message}`) } }
          if (sequence.startsWith('quick')) {
            for (let i=0;i<5;i++) { await page.keyboard.press(key, {delay:30}); await sample(`quick press ${i+1}`); await page.waitForTimeout(40) }
          } else {
            const event = {key:key === 'Space' ? ' ' : 'Enter',code:key,windowsVirtualKeyCode:key === 'Space' ? 32 : 13,text:key === 'Space' ? ' ' : '\r'}
            await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',...event})
            const until = Date.now()+1500
            while(Date.now()<until) { await sample('held keydown / auto-repeat'); await page.waitForTimeout(50); await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',...event,autoRepeat:true}) }
            await page.keyboard.up(key)
            await sample('after keyup')
          }
          if(firstFailure) throw firstFailure
        }
        await page.waitForTimeout(150)
        await safe(before)
        // Starting or advancing play is allowed, but each sequence needs its original screen.
        const advanced = screen === 'menu' ? !(await visible(originalStartButton(id))) : screen === 'results' && !(await visible(endSelectors[id]))
        if (advanced) {
          (row.allowed ||= []).push(`${b.id || b.label} ${sequence}: → play / next round`)
          await load(id, screen, true)
        }
      } catch(error) {
        row.failures.push(`${b.id || b.label} ${sequence}: ${error.message}`)
        console.error('FAIL', id, screen, row.failures.at(-1))
        await touch('touchEnd', []).catch(()=>{})
        await page.keyboard.up('Enter'); await page.keyboard.up('Space')
        await page.screenshot({path:`${out}/${id}-${screen}-failure.jpg`,type:'jpeg',quality:60}).catch(()=>{})
        await load(id,screen,true)
      }
    }
    {
      const before = await settings()
      // Leave real short-tap focus on a settings/home control before the mixed keys.
      if (buttons.length) {
        const b = buttons[0]
        await tapCentre(page, b.id ? page.locator(`[id=${JSON.stringify(b.id)}]`) : page.locator('button').nth(b.index))
        await safe(before)
      }
      for (const key of ['Escape','m','M','Backspace',...'abcdefghijklmnopqrstuvwxyz','Enter','Space']) {
        await page.keyboard.press(key)
        await page.waitForTimeout(400) // let a title/menu transition become visible before attributing it
        try {
          if (screen !== 'play' && ['Escape', 'm', 'M'].includes(key)) {
            // Grown-ups may leave results with Escape or toggle an unsaved mute
            // with M outside play. Neither exception applies to taps/Enter/Space.
            const after = await settings()
            assert.deepEqual(after.saved, before.saved, 'persisted sound setting')
            if (key === 'Escape') await safe(before, true)
            else if (screen === 'results') assert.equal(await visible(originalStartButton(id)), false, 'M exited results to menu/title')
            const leftResults = screen === 'results' && !(await visible(endSelectors[id]))
            if (leftResults || JSON.stringify(after) !== JSON.stringify(before)) {
              (row.allowed ||= []).push(`keyboard ${key}: ${leftResults ? '→ title/menu' : 'unsaved mute toggle'}`)
              // Keep later keys on their intended screen with the original sound
              // state, so an allowed shortcut cannot mask a later regression.
              await load(id, screen, true)
              await safe(before)
            }
          } else await safe(before)
        } catch(error) { throw new Error(`keyboard ${key}: ${error.message}`) }
      }
    }
    if (screen === 'play') {
      const before = await settings()
      for(let i=0;i<150;i++) { const corners=[[30,30],[738,30],[30,994],[738,994]]; const [x,y]=i%5===0 ? corners[(i/5)%4] : [Math.random()*768,Math.random()*1024]; await page.touchscreen.tap(x,y); await page.waitForTimeout(200) }
      for(const key of ['Escape','m','M','Backspace',...'abcdefghijklmnopqrstuvwxyz','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']) await page.keyboard.press(key)
      await safe(before)
    }
    if (screen === 'results' && process.env.EXAMPLES_SEQUENCES !== 'keyboard') {
      await load(id, screen, true)
      const navigation = await page.locator('button:visible').evaluateAll(bs => bs.filter(b => /▶|🔁|🗺/.test(b.textContent)).map(b => b.id))
      for (const button of navigation) {
        const before = await settings()
        const target = page.locator(`[id=${JSON.stringify(button)}]`)
        const isMap = (await target.textContent()).includes('🗺')
        await tapCentre(page, target)
        await page.waitForTimeout(150)
        await safe(before, isMap).catch(error => { throw new Error(`${button} deliberate navigation tap: ${error.message}`) })
        ;(row.allowed ||= []).push(`${button} deliberate tap: forward navigation allowed`)
        await load(id, screen, true)
      }
    }
    assert.equal(await page.evaluate(()=>window.__mashSpeechCalls),0,'speech called')
  } catch(error) {
    row.failures.push(error.message)
    row.diagnostic = await page.evaluate(() => ({ visibleScreens: [...document.querySelectorAll('.screen, .overlay, #loading, #title, #menu')].filter(e => e.getBoundingClientRect().width && getComputedStyle(e).visibility !== 'hidden').map(e => e.id), state: (window.game || window.cakeStack?.game || window.__pb?.game || window.rg?.game || window.__game?.game)?.state })).catch(() => null)
    await page.screenshot({path:`${out}/${id}-${screen}-unavailable.jpg`,type:'jpeg',quality:60}).catch(()=>{})
  }
  if(errors.length > errorStart) row.failures.push(...errors.slice(errorStart).map(e => `page error: ${e}`))
  if(row.failures.length) {row.status='FAIL';process.exitCode=1}
  console.log('SCREEN', JSON.stringify(row))
  saveReport()
}
try {
  cdp = await page.context().newCDPSession(page)
  const system = await browser.newBrowserCDPSession()
  console.log('GPU', JSON.stringify((await system.send('SystemInfo.getInfo')).gpu.devices))
  await system.detach()
  const screens = process.env.EXAMPLES_SCREENS?.split(',') || ['menu', 'play', 'results']
  assert.ok(screens.every(screen => ['menu', 'play', 'results'].includes(screen)), 'Unknown EXAMPLES_SCREENS value')
  for (const id of process.env.EXAMPLES_IDS?.split(',') || originalIds) {
    for (const screen of screens) await checkScreen(id, screen)
    console.log('GAME', JSON.stringify({id, status: report.some(row => row.id === id && row.status === 'FAIL') ? 'FAIL' : 'PASS'}))
  }
  if(errors.length) { console.error('PAGE ERRORS',errors);process.exitCode=1 }
} finally { await browser.close() }
