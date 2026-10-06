import * as THREE from 'three'
import { pathResult } from './challenges.js'
import { runExperience } from './experiences.js'
import { runQuantity } from './quantities.js'
import { runSpatial } from './spatial.js'
import { runDiscovery } from './discovery.js'
import { runPlaylab } from './playlab.js'
import { runStory } from './stories.js'

// Each activity owns its interaction, demonstration, feedback, and success rule.
// All controls are native buttons over the same 3D objects, supporting touch,
// keyboard, screen readers, and browser automation without duplicate hit tests.
export function runActivity(c, g, a) {
  const handled = runExperience(c, g, a) || runQuantity(c, g, a) || runSpatial(c, g, a) || runDiscovery(c, g, a) || runPlaylab(c, g, a) || runStory(c, g, a)
  if (handled) return
  if (c.mode === 'path') path(c, g, a)
  else if (c.mode === 'trace') trace(c, g, a)
  else throw new Error(`No interaction for ${c.mode}`)
  a.action('↶ Reset', () => a.reset())
}

const MAX_STEPS = 30
const STEP_MS = 240
const arrows = [
  ['↑', [0, -1]],
  ['→', [1, 0]],
  ['↓', [0, 1]],
  ['←', [-1, 0]],
]

// The child plans a route with arrow buttons, then watches the hero walk it.
function path(c, g, a) {
  const { tile, action, audio } = a
  const plan = []
  const spacing = 1.28
  let playing = false
  const centre = (x, y) => [(x - (c.size - 1) / 2) * spacing, (y - (c.size - 1) / 2) * spacing]

  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const blocked = c.obstacles.some((p) => p[0] === x && p[1] === y)
      const isGoal = x === c.goal[0] && y === c.goal[1]
      const [wx, wz] = centre(x, y)
      const model = blocked ? c.obstacleItem : isGoal ? c.goalItem : undefined
      tile({ x: wx, z: wz, size: 1.08, depth: 1.08, colour: blocked ? '#b2b3c5' : '#edf3df', model, visual: true })
    }
  }
  const [startX, startZ] = centre(...c.start)
  const hero = tile({ x: startX, z: startZ, model: c.hero, size: 0.8, depth: 0.8, colour: g.accent, visual: true })

  // The planned route is drawn as a line, with room for every possible step.
  const routeGeometry = new THREE.BufferGeometry()
  routeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((MAX_STEPS + 1) * 3), 3))
  routeGeometry.setDrawRange(0, 0)
  a.board.add(a.line(routeGeometry, '#ffbd72'))
  const status = a.readout('Your route:')

  function draw() {
    let [x, y] = c.start
    const points = [centre(x, y)]
    for (const [dx, dy] of plan) {
      x += dx
      y += dy
      points.push(centre(x, y))
    }
    const positions = routeGeometry.attributes.position
    points.forEach(([wx, wz], i) => positions.setXYZ(i, wx, 0.24, wz))
    positions.needsUpdate = true
    routeGeometry.setDrawRange(0, points.length)
    a.invalidate()
    const symbols = plan.map(([dx, dy]) => arrows.find(([, delta]) => delta[0] === dx && delta[1] === dy)[0])
    status.textContent = `Route: ${symbols.join(' ') || 'choose arrows'}`
  }

  for (const [symbol, delta] of arrows) {
    action(symbol, () => {
      if (playing || plan.length >= MAX_STEPS) return
      plan.push(delta)
      audio.note(330)
      draw()
    })
  }
  action('⌫ Undo', () => {
    if (playing) return
    plan.pop()
    draw()
  })

  function celebrateGoal() {
    const holder = new THREE.Group()
    holder.add(a.model(c.goalItem, 1.2))
    const [x, z] = centre(...c.goal)
    holder.position.set(x, 0.3, z)
    a.board.add(holder)
    // The robot's rocket lifts off; other rewards bob up.
    const rise = g.hero === 'robot' ? 1.8 : 0.3
    a.animate(1.2, (t) => {
      holder.position.y = 0.3 + t * rise
      holder.scale.setScalar(1 + t * 0.25)
    })
  }

  action(
    'Go →',
    () => {
      if (playing) return
      playing = true
      const result = pathResult(c, plan)
      result.visited.forEach((p, i) =>
        a.later(() => {
          hero.move(...centre(...p))
          hero.hop()
          audio.note(262 + i * 20)
        }, i * STEP_MS),
      )
      a.later(() => {
        playing = false
        if (result.ok) {
          celebrateGoal()
          a.success(g.hero === 'bee' ? 'The bee delivered pollen. New flowers can grow!' : 'Your route brought your friend safely to the destination!')
        } else {
          a.feedback(result.reason)
          hero.move(startX, startZ)
        }
      }, result.visited.length * STEP_MS + 100)
    },
    { primary: true },
  )
}

// The child follows glowing dots by dragging, tapping each dot, or pressing a button.
// A pale path shows the whole shape with arrows for its direction; letters and numbers
// number each stroke's start and need a lift between strokes. The hero shows the way first,
// and the ink follows the finger smoothly between dots.
function trace(c, g, a) {
  const strokeStarts = c.strokeStarts || [0]
  const points = c.points
  const count = points.length
  // Each stroke's smooth trail and the trail position of each of its dots.
  const trails = c.trails || [points]
  const marks = c.marks || [points.map((_, i) => i)]
  const isStart = (i) => strokeStarts.includes(i)
  const strokeOf = (i) => strokeStarts.filter((start) => start <= i).length - 1
  const markOf = (i) => marks[strokeOf(i)][i - strokeStarts[strokeOf(i)]]
  const pads = []
  let step = 0
  let needsLift = false
  let last = null
  let offPath = false
  let nudges = 0
  let saidOffPath = false
  let idleTimer = null
  let demoRun = 0
  let demoing = false

  const materials = {}
  const paint = (colour) => {
    if (!materials[colour]) {
      materials[colour] = a.material(colour)
      materials[colour].side = THREE.DoubleSide
    }
    return materials[colour]
  }
  const flat = (geometry, colour, y) => {
    const result = a.mesh(geometry, colour)
    result.material = paint(colour)
    result.castShadow = false
    result.position.y = y
    a.board.add(result)
    return result
  }
  const disc = (p, colour, y, width) => {
    const d = flat(new THREE.CircleGeometry(width / 2, 24).rotateX(-Math.PI / 2), colour, y)
    d.position.x = p[0]
    d.position.z = p[1]
    return d
  }
  const sharp = (p, q, r) => {
    const [ax, az, bx, bz] = [q[0] - p[0], q[1] - p[1], r[0] - q[0], r[1] - q[1]]
    return (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1) < 0.8
  }
  // A flat band along trail[from..to], drawn up to a trail position with setDrawRange.
  const band = (trail, from, to, colour, y, width) => {
    const position = []
    const index = []
    for (let k = from; k <= to; k++) {
      const before = trail[Math.max(from, k - 1)]
      const after = trail[Math.min(to, k + 1)]
      const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1
      const nx = (-(after[1] - before[1]) / length) * (width / 2)
      const nz = ((after[0] - before[0]) / length) * (width / 2)
      position.push(trail[k][0] + nx, 0, trail[k][1] + nz, trail[k][0] - nx, 0, trail[k][1] - nz)
      if (k < to) {
        const v = (k - from) * 2
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(position.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    geometry.setIndex(index)
    return flat(geometry, colour, y)
  }
  // A stroke's ribbon: bands split at sharp corners, with round ends and corners.
  // `show(d)` reveals it up to trail position d (-1 hides it).
  const ribbon = (trail, colour, y, width) => {
    const bands = []
    const caps = [[0, disc(trail[0], colour, y, width)]]
    let from = 0
    for (let k = 1; k < trail.length; k++) {
      if (k === trail.length - 1 || sharp(trail[k - 1], trail[k], trail[k + 1])) {
        bands.push([from, k, band(trail, from, k, colour, y, width)])
        caps.push([k, disc(trail[k], colour, y, width)])
        from = k
      }
    }
    const head = disc(trail[0], colour, y, width)
    const show = (d) => {
      for (const [start, end, mesh] of bands) {
        mesh.visible = d > start
        mesh.geometry.setDrawRange(0, Math.floor(Math.max(0, Math.min(d, end) - start)) * 6)
      }
      for (const [k, cap] of caps) cap.visible = d >= k
      const k = Math.floor(d)
      head.visible = d >= 0 && k < trail.length
      if (head.visible) head.position.set(trail[k][0], y, trail[k][1])
      a.invalidate()
    }
    show(-1)
    return { show }
  }

  if (c.trace === 'letter') {
    // Handwriting lines: the top line, a dashed middle line at the little letters' height, and the baseline.
    const lineColour = '#c3ab92'
    const rule = (x0, x1, z, width) => band([[x0, z], [x1, z]], 0, 1, lineColour, 0.012, width)
    rule(-3.4, 3.4, -3, 0.06)
    rule(-3.4, 3.4, 3, 0.06)
    for (let x = -3.4; x < 3.4; x += 0.5) rule(x, x + 0.28, -0.667, 0.05)
  }
  for (const trail of trails) ribbon(trail, '#fff4dc', 0.03, 0.5).show(Infinity)
  // Arrows along the path, about every 1.6 units, pointing the way to go.
  const chevron = new THREE.Shape([[0.17, 0], [-0.09, 0.15], [-0.02, 0], [-0.09, -0.15]].map(([x, y]) => new THREE.Vector2(x, y)))
  // Where the path runs back over itself (the stems of a, d, n, h, m), the two ways get their own
  // lanes, as on a worksheet: smaller arrows to either side of the middle, never mixed on one line.
  const headings = trails.flatMap((trail) => trail.slice(1).map(([x, z], k) => {
    const [px, pz] = trail[k]
    const length = Math.hypot(x - px, z - pz) || 1
    return [(x + px) / 2, (z + pz) / 2, (x - px) / length, (z - pz) / length]
  }))
  const retraced = (x, z, dx, dz) => headings.some(([hx, hz, hdx, hdz]) => Math.hypot(hx - x, hz - z) < 0.2 && hdx * dx + hdz * dz < -0.7)
  for (const trail of trails) {
    let travelled = 1.05
    for (let k = 1; k < trail.length; k++) {
      const [px, pz] = trail[k - 1]
      const [x, z] = trail[k]
      travelled += Math.hypot(x - px, z - pz)
      if (travelled < 1.6 || k > trail.length - 2) continue
      const mark = flat(new THREE.ShapeGeometry(chevron).rotateX(-Math.PI / 2), '#d9a87c', 0.05)
      const [dx, dz] = [trail[k + 1][0] - px, trail[k + 1][1] - pz]
      const length = Math.hypot(dx, dz) || 1
      const lane = retraced(x, z, dx / length, dz / length) ? 0.135 : 0
      // Each way keeps to its own side: left of the way it goes.
      mark.position.x = x + (dz / length) * lane
      mark.position.z = z - (dx / length) * lane
      if (lane) mark.scale.setScalar(0.75)
      mark.rotation.y = -Math.atan2(dz, dx)
      travelled = 0
    }
  }
  const ink = trails.map((trail) => ribbon(trail, g.accent, 0.06, 0.32))
  // The hero's glow when it shows the way.
  const glow = trails.map((trail) => ribbon(trail, '#ffe680', 0.07, 0.22))
  const hideGlow = () => glow.forEach((part) => part.show(-1))

  const marker = new THREE.Group()
  marker.add(a.model(c.hero, 0.55))
  marker.position.set(points[0][0], 0.25, points[0][1])
  a.board.add(marker)
  const home = () => (step ? points[step - 1] : points[0])
  const goHome = () => {
    const [hx, hz] = home()
    marker.position.set(hx, 0.25, hz)
    a.invalidate()
  }
  const face = (from, to) => {
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1e-6) marker.rotation.y = Math.atan2(to[0] - from[0], to[1] - from[1])
  }

  // Ink up to the last dot reached, plus `extra` (0 to 1) of the way to the next dot.
  function showInk(extra = 0) {
    trails.forEach((_, s) => {
      const first = strokeStarts[s]
      const lastDot = (strokeStarts[s + 1] || count) - 1
      if (step <= first) ink[s].show(-1)
      else if (step > lastDot) ink[s].show(Infinity)
      else {
        const reached = markOf(step - 1)
        ink[s].show(reached + extra * (markOf(step) - reached))
      }
    })
  }

  function setCurrent(pad, current) {
    pad.button.classList.toggle('current', current)
    pad.button.classList.toggle('visual', !current)
    pad.button.tabIndex = current ? 0 : -1
  }

  // Each stroke's number sits just beside its start dot, so the hero waiting on the dot stays
  // in sight: behind the stroke's first move when that is clear of the path, or else in the
  // clearest direction around the dot.
  const numberSide = (start, s) => {
    const [x, z] = points[start]
    const next = trails[s][Math.min(3, trails[s].length - 1)]
    const back = Math.atan2(z - next[1], x - next[0])
    const clearance = (angle) => {
      const [lx, lz] = [x + Math.cos(angle) * 0.7, z + Math.sin(angle) * 0.7]
      return Math.min(...trails.flat().map(([px, pz]) => Math.hypot(px - lx, pz - lz)))
    }
    let best = back
    if (clearance(back) < 0.5) {
      for (let k = 1; k < 16; k++) {
        const angle = back + (k * Math.PI) / 8
        if (clearance(angle) > clearance(best) + 0.01) best = angle
      }
    }
    return [Math.cos(best), Math.sin(best)]
  }
  // Number each stroke's start (letters and numbers). Where two strokes start at the same dot,
  // only the next one shows its number.
  function numberStarts() {
    if (!c.strokes) return
    const shown = []
    strokeStarts.forEach((start, s) => {
      const [x, z] = points[start]
      const show = start >= step && !shown.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.3)
      if (show) {
        shown.push([x, z])
        const [dx, dz] = numberSide(start, s)
        pads[start].button.classList.add('stroke-start')
        pads[start].button.style.setProperty('--side-x', dx.toFixed(3))
        pads[start].button.style.setProperty('--side-y', dz.toFixed(3))
      }
      pads[start].label(show ? String(s + 1) : '')
      pads[start].button.setAttribute('aria-label', `Trace dot ${start + 1}${show ? `, start of stroke ${s + 1}` : ''}`)
    })
  }

  // Where a finger is along the line from the last dot reached to the next one.
  function along(p) {
    const [ax, az] = points[step - 1]
    const [bx, bz] = points[step]
    const length2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1
    const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / length2))
    return { t, away: Math.hypot(p.x - (ax + (bx - ax) * t), p.z - (az + (bz - az) * t)) }
  }
  // How far a finger is from the path still to draw: the part being drawn, or the next dot.
  function distanceToPath(p) {
    if (step === 0 || isStart(step)) return Math.hypot(p.x - points[step][0], p.z - points[step][1])
    return along(p).away
  }

  function stopDemo() {
    demoRun++
    hideGlow()
    for (const pad of pads) pad.flash(false)
    if (demoing) goHome()
    demoing = false
  }

  // A child who stops hears what to do and sees the hero show the way again (twice at most).
  function waitForChild() {
    clearTimeout(idleTimer)
    if (nudges >= 2) return
    idleTimer = a.later(() => {
      if (step >= count) return
      nudges++
      const start = step === 0 ? (c.strokes ? 'start at number 1' : 'start at the glowing dot') : 'carry on from the glowing dot'
      a.hint(`Watch, then ${start} and follow the arrows.`)
      a.audio.speak(['Watch me.', `Then ${start}, and follow the arrows.`])
      demo(true)
    }, 15000)
  }

  function advance(index, dragging = false) {
    if (index !== step || step >= count || (dragging && needsLift)) return
    stopDemo()
    const [x, z] = points[step]
    const origin = marker.position.clone()
    const destination = new THREE.Vector3(x, 0.25, z)
    a.animate(0.12, (t) => marker.position.lerpVectors(origin, destination, t), marker)
    // Face along the stroke, except when jumping to the start of a new one.
    if (step > 0 && !isStart(step)) face(points[step - 1], points[step])
    pads[step].base.visible = false
    pads[step].button.classList.add('reached')
    pads[step].flash(false)
    setCurrent(pads[step], false)
    step++
    showInk()
    numberStarts()
    a.audio.note(300 + step * 12, 0.08)
    a.invalidate()
    waitForChild()

    if (step === count) {
      clearTimeout(idleTimer)
      a.hint(g.instructions)
      if (c.factSay) a.success(c.fact, c.factSay)
      else a.success(c.glyph ? `You drew ${c.glyph}.` : 'Your friend followed the whole trail!')
      return
    }
    // Once a new stroke has begun, the lift reminder gives way to the usual help.
    if (step > 1 && isStart(step - 1)) a.hint(g.instructions)
    if (isStart(step)) {
      needsLift = dragging
      const say = `Now start at number ${strokeOf(step) + 1}.`
      a.hint(dragging ? `Lift your finger. ${say}` : say)
      a.audio.speak(dragging ? ['Lift your finger.', say] : say)
    }
    setCurrent(pads[step], true)
  }

  // The hero traces the whole shape, stroke by stroke, leaving a glow, then waits at its place.
  function demo(again = false) {
    stopDemo()
    demoing = true
    const run = demoRun
    const drawStroke = (s) => {
      if (run !== demoRun) return
      if (s === trails.length) {
        a.later(() => {
          if (run !== demoRun) return
          hideGlow()
          demoing = false
          goHome()
          if (step < count) pads[step].flash(again)
        }, 700)
        return
      }
      const trail = trails[s]
      const [sx, sz] = trail[0]
      const origin = marker.position.clone()
      // Hop to the stroke's start, then glide along it at about eight dots a second.
      a.animate(0.3, (t) => {
        marker.position.lerpVectors(origin, new THREE.Vector3(sx, 0.25, sz), t)
        marker.position.y += Math.sin(t * Math.PI) * (s ? 0.8 : 0)
      }, marker)
      const seconds = Math.max(0.5, (trail.length - 1) * 0.026)
      a.later(() => {
        if (run !== demoRun) return
        a.animate(seconds, (t) => {
          const d = t * (trail.length - 1)
          const k = Math.min(trail.length - 1, Math.floor(d))
          glow[s].show(d)
          marker.position.set(trail[k][0], 0.25, trail[k][1])
          face(trail[Math.max(0, k - 1)], trail[Math.min(trail.length - 1, k + 1)])
        }, marker)
        a.later(() => drawStroke(s + 1), seconds * 1000 + 250)
      }, 320)
    }
    a.later(() => drawStroke(0), 150)
  }

  points.forEach(([x, z], i) => {
    const pad = a.tile({ x, z, size: 0.19, depth: 0.19, thin: true, colour: '#fff8d8', label: '', onTap: () => advance(i) })
    pad.button.setAttribute('aria-label', `Trace dot ${i + 1}`)
    setCurrent(pad, i === 0)
    pads.push(pad)
  })
  numberStarts()

  // A finger counts as on a dot within about 30 screen pixels (more on small screens), checked
  // along its whole movement so a quick stroke never skips a dot.
  const tolerance = () => {
    const unit = parseFloat(getComputedStyle(document.getElementById('targets')).getPropertyValue('--unit')) || 60
    return Math.max(0.7, 30 / unit)
  }
  const endDrag = () => {
    needsLift = false
    last = null
    if (step < count) {
      showInk()
      goHome()
      if (offPath) pads[step].flash(false)
    }
    offPath = false
  }
  a.onTrace(
    (p) => {
      if (!p || step >= count || needsLift) return
      const tol = tolerance()
      let from = last || p
      while (step < count && !needsLift) {
        const [x, z] = points[step]
        const dx = p.x - from.x
        const dz = p.z - from.z
        const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz || 1)))
        const q = { x: from.x + dx * t, z: from.z + dz * t }
        if (Math.hypot(q.x - x, q.z - z) > tol) break
        advance(step, true)
        from = q
      }
      last = p
      if (step >= count || needsLift) return
      // The ink and the hero follow the finger between dots.
      if (step > 0 && !isStart(step)) {
        const { t, away } = along(p)
        if (away < tol * 1.5) {
          showInk(t)
          const s = strokeOf(step)
          const k = Math.floor(markOf(step - 1) + t * (markOf(step) - markOf(step - 1)))
          marker.position.set(trails[s][k][0], 0.25, trails[s][k][1])
          a.invalidate()
        }
      }
      // Wandering off the path is never a mistake: the next dot glows and a gentle word helps.
      const away = distanceToPath(p) > Math.max(1.5, tol * 2.2)
      if (away && !offPath) {
        offPath = true
        pads[step].flash(true)
        a.hint('Come back to the glowing dot and follow the path.')
        if (!saidOffPath) a.audio.speak('Come back to the glowing dot.')
        saidOffPath = true
      } else if (!away && offPath) {
        offPath = false
        pads[step].flash(false)
      }
    },
    { onStart: () => { needsLift = false; last = null; stopDemo() }, onEnd: endDrag },
  )
  a.action('👀 Show me', () => {
    a.hint('Watch the way to go.')
    demo()
  })
  a.action('Next glowing dot', () => advance(step))
  // The hero shows the way once at the start, while the prompt is read.
  a.later(() => {
    if (step === 0) demo()
  }, 900)
  waitForChild()
}
