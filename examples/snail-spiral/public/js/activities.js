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
// Letters and numbers have several strokes; dragging must lift between them.
function trace(c, g, a) {
  const strokeStarts = c.strokeStarts || [0]
  const pads = []
  let step = 0
  let needsLift = false

  const marker = new THREE.Group()
  marker.add(a.model(c.hero, 0.55))
  marker.position.set(c.points[0][0], 0.25, c.points[0][1])
  a.board.add(marker)

  // One ink line per stroke, revealed as the child reaches each dot.
  const ink = strokeStarts.map((start, i) => {
    const end = strokeStarts[i + 1] || c.points.length
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((end - start) * 3), 3))
    c.points.slice(start, end).forEach(([x, z], j) => geometry.attributes.position.setXYZ(j, x, 0.26, z))
    geometry.setDrawRange(0, 0)
    a.board.add(a.line(geometry, g.accent))
    return { start, end, geometry }
  })

  function setCurrent(pad, current) {
    pad.button.classList.toggle('current', current)
    pad.button.classList.toggle('visual', !current)
    pad.button.tabIndex = current ? 0 : -1
  }

  function advance(index, dragging = false) {
    if (index !== step || step >= c.points.length || (dragging && needsLift)) return
    const [x, z] = c.points[step]
    const origin = marker.position.clone()
    const destination = new THREE.Vector3(x, 0.25, z)
    a.animate(0.12, (t) => marker.position.lerpVectors(origin, destination, t), marker)
    // Face along the stroke, except when jumping to the start of a new one.
    if (step > 0 && !strokeStarts.includes(step)) {
      const [px, pz] = c.points[step - 1]
      marker.rotation.y = Math.atan2(x - px, z - pz)
    }
    pads[step].select(true)
    setCurrent(pads[step], false)
    step++
    for (const stroke of ink) stroke.geometry.setDrawRange(0, Math.max(0, Math.min(step, stroke.end) - stroke.start))
    a.audio.note(300 + step * 12, 0.08)
    a.invalidate()

    if (step === c.points.length) {
      const strokeNote = strokeStarts.length > 1 ? 'Each stroke has its own beginning.' : ''
      a.success(c.glyph ? `You drew ${c.glyph}. ${strokeNote}` : 'Your friend followed the whole trail!')
      return
    }
    if (strokeStarts.includes(step)) {
      needsLift = dragging
      a.hint(`Lift your finger. Start stroke ${strokeStarts.indexOf(step) + 1} at the glowing dot.`)
    }
    setCurrent(pads[step], true)
  }

  c.points.forEach(([x, z], i) => {
    const pad = a.tile({ x, z, size: 0.19, depth: 0.19, thin: true, colour: '#fff8d8', label: '', onTap: () => advance(i) })
    pad.button.setAttribute('aria-label', `Trace dot ${i + 1}`)
    setCurrent(pad, i === 0)
    pads.push(pad)
  })

  const clearLift = () => {
    needsLift = false
  }
  a.onTrace(
    (p) => {
      if (!p || step >= c.points.length) return
      const [x, z] = c.points[step]
      if (Math.hypot(p.x - x, p.z - z) < 0.55) advance(step, true)
    },
    { onStart: clearLift, onEnd: clearLift },
  )
  a.action('Next glowing dot', () => advance(step))
}
