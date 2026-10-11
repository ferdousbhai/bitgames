// Colour truth: a colour riddle ("something orange") must match what the child sees.
// Loads the game, takes each catch's swimming materials (with the watery tint, as drawn in the water),
// weighs each colour by its surface area (eyes, cheeks and shine left out), names the main colour,
// and checks it against riddles.js HAS both ways: a colour it has must be its main colour, and for
// the swimmers a riddle can be answered with, a main colour Bear can ask for must be listed (or the
// child is told "no" when right).
//
//   EXAMPLES_ORIGIN=http://localhost:4213 node examples/fish-pond/tests/colours.mjs
import { chromium } from 'playwright'

const origin = process.env.EXAMPLES_ORIGIN ?? 'http://localhost:4213'
const browser = await chromium.launch({ args: ['--use-angle=gl'] })
const page = await browser.newPage({ viewport: { width: 834, height: 1194 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`${origin}/fish-pond/?debug`)
await page.waitForFunction(() => window.fishPond?.game.state === 'title', null, { timeout: 30000 })
const rows = await page.evaluate(async () => {
  const { HAS, TRAITS } = await import('./js/riddles.js')
  const { AMBIENT, CREATURES } = await import('./js/creatures.js')
  // Surprises from open water (treasure, toys, the boot) are always kept, so they are never told "no"
  const swimmers = new Set(Object.values(AMBIENT).flat())
  const THREE = await import('three')
  const f = window.fishPond
  const skip = /eye|pupil|shine|cheek|white|smile|mouth|lips|gem|claw_tip/i
  const name = ({ h, s, l }) => {
    if (s < 0.25 || l < 0.12 || l > 0.92) return 'grey'
    const d = h * 360
    if (l < 0.45 && d >= 15 && d < 60) return 'brown'
    if (d < 15 || d >= 340) return l > 0.75 ? 'pink' : 'red'
    if (d < 40) return 'orange'
    if (d < 66) return 'yellow'
    if (d < 170) return 'green'
    if (d < 255) return 'blue'
    if (d < 300) return 'purple'
    return 'pink'
  }
  const out = []
  for (const c of CREATURES) {
    const m = f.creatures.make(c.id)
    f.creatures.vivid(m.group, true)
    m.group.updateMatrixWorld(true)
    const score = {}
    m.group.traverse((o) => {
      if (!o.isMesh || skip.test(o.name) || skip.test(o.material.name ?? '')) return
      const g = o.geometry
      const p = g.attributes.position
      const idx = g.index
      const n = idx ? idx.count / 3 : p.count / 3
      const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3()
      let area = 0
      for (let i = 0; i < n; i++) {
        const [i0, i1, i2] = idx ? [idx.getX(i * 3), idx.getX(i * 3 + 1), idx.getX(i * 3 + 2)] : [i * 3, i * 3 + 1, i * 3 + 2]
        a.fromBufferAttribute(p, i0).applyMatrix4(o.matrixWorld)
        b.fromBufferAttribute(p, i1).applyMatrix4(o.matrixWorld)
        cc.fromBufferAttribute(p, i2).applyMatrix4(o.matrixWorld)
        area += b.clone().sub(a).cross(cc.clone().sub(a)).length() / 2
      }
      const hsl = o.material.color.getHSL({}, THREE.SRGBColorSpace)
      const k = name(hsl)
      score[k] = (score[k] ?? 0) + area
    })
    const total = Object.values(score).reduce((x, y) => x + y, 0)
    const main = Object.entries(score).sort((x, y) => y[1] - x[1])[0]?.[0]
    const colours = Object.keys(TRAITS).filter((t) => TRAITS[t].tier === 1 && ['orange', 'blue', 'yellow', 'red'].includes(t))
    const listed = (HAS[c.id] ?? []).filter((t) => colours.includes(t))
    out.push({ id: c.id, swims: swimmers.has(c.id), main, share: +((score[main] ?? 0) / total).toFixed(2), listed, askable: colours })
  }
  return out
})
let bad = 0
for (const r of rows) {
  const problems = []
  for (const col of r.listed) if (col !== r.main) problems.push(`listed ${col} but looks ${r.main}`)
  if (r.swims && r.askable.includes(r.main) && !r.listed.includes(r.main)) problems.push(`looks ${r.main} but HAS lacks it`)
  if (problems.length) bad++
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${r.id.padEnd(11)} ${r.main} (${Math.round(r.share * 100)}%)  HAS ${r.listed.join(',') || '-'}  ${problems.join('; ')}`)
}
await browser.close()
if (errors.length) console.log('page errors:', errors)
if (bad || errors.length) process.exit(1)
