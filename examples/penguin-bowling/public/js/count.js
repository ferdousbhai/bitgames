import * as THREE from 'three'
import { canvasTexture } from './effects.js'
import { PIN_H } from './lane.js'

/**
 * Counting the pins left standing, built into every roll.
 *
 * In the scene: the child taps each pin still standing and it gets the next number,
 * with a soft ring under it (the game counts along if the child waits).
 * On screen: a pictured number bond, fallen + standing = 10, as two groups of pins.
 * Before a second roll the rings stay on the ice so the child can see where the
 * pins are. When they sit off to one side, the child says where; a right answer
 * lays a footprint trail (a Spot) down the lane in line with them, and the
 * child walks the penguin onto it.
 */

const ringTex = canvasTexture(128, 128, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.75, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

const numberTex = new Map()
function numberTexture(n) {
  if (!numberTex.has(n)) {
    numberTex.set(n, canvasTexture(128, 128, (g, s) => {
      g.fillStyle = '#fffbe8'
      g.strokeStyle = '#2b4a8a'
      g.lineWidth = 8
      g.beginPath()
      g.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#2b4a8a'
      g.font = `900 ${n >= 10 ? 58 : 72}px ui-rounded, system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(n), s / 2, s / 2 + 4)
    }))
  }
  return numberTex.get(n)
}

/** Seconds between one counted pin and the next when the game counts along. */
const STEP = 0.7
const ringGeometry = new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2)
const ringWhite = new THREE.Color('#fff3b0')

/**
 * Which way a pin is from the middle of the rack, as the penguin sees it. The rack's columns are
 * 0.27 apart: the head pin's column is the middle and the outer columns are the sides. A pin near
 * the first column either side (or a middle pin that drifted) is `between`: it counts for the
 * middle and for its side, so a pin that looks centred is never only "on the right".
 */
export function zoneOf(x) {
  const ax = Math.abs(x)
  if (ax < 0.12) return { side: 'middle', between: false }
  return { side: x < 0 ? 'left' : 'right', between: ax < 0.4 }
}

export class Counter {
  constructor(scene) {
    this.marks = Array.from({ length: 10 }, () => {
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, toneMapped: false, color: '#ffe066' }),
      )
      ring.renderOrder = 3
      ring.visible = false
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }))
      label.scale.setScalar(0.36)
      label.renderOrder = 4
      label.visible = false
      scene.add(ring, label)
      return { ring, label, on: 0, want: 0 }
    })
    this.queue = []
    this.n = 0
    this.t = 0
    this.autoAt = Infinity
    this.done = true
  }

  /**
   * Get ready to count `standing` pins ([{i, x, z, color, row}]). Nothing lights until the
   * child taps a pin (tap), the game counts along (countRest) or shows them all (showAll).
   * onStep(q, last, how) runs for every pin counted, where `how` is 'tap' (the child counted it),
   * 'auto' (the game counted along) or 'all' (lit together); onDone once the last one is counted.
   */
  begin(standing, { onStep, onDone } = {}) {
    this.clear()
    this.queue = standing.map((p) => ({ ...p, lit: false }))
    this.n = 0
    this.t = 0
    this.done = false
    this.onStep = onStep
    this.onDone = onDone
  }

  /** The pins not counted yet. */
  get left() {
    return this.queue.filter((q) => !q.lit)
  }

  /** The child counts pin `i`: it gets the next number. Returns false for a pin already counted. */
  tap(i) {
    const q = this.queue.find((q) => q.i === i && !q.lit)
    if (this.done || !q) return false
    this.step(q, 'tap')
    return true
  }

  /**
   * Count the rest along with the child, one pin every STEP, starting `delay` seconds from now.
   * With `all`, the rest light together instead (a child who waits needn't sit through a slow count).
   */
  countRest(delay = STEP, { all = false } = {}) {
    if (this.done) return
    this.autoAt = this.t + delay
    this.autoAll = all
  }

  /** Light every pin left at once (the child already knew how many). */
  showAll() {
    for (const q of this.left) this.step(q, 'all')
  }

  step(q, how) {
    q.lit = true
    q.n = ++this.n
    this.light(q)
    const last = this.n === this.queue.length
    this.onStep?.(q, last, how)
    if (last) {
      this.done = true
      this.autoAt = Infinity
      this.onDone?.()
    }
  }

  update(dt, t) {
    this.t += dt
    if (!this.done && this.t >= this.autoAt && this.autoAll) this.showAll()
    else if (!this.done && this.t >= this.autoAt) {
      const q = this.left[0]
      this.autoAt = this.t + STEP
      if (q) this.step(q, 'auto')
    }
    // Rings and numbers ease in, then hold still: nothing pulses while the child counts or aims.
    for (const m of this.marks) {
      m.on += (m.want - m.on) * Math.min(1, dt * 6)
      const show = m.on > 0.02
      m.ring.visible = show
      m.label.visible = show && m.withLabel
      if (!show) continue
      m.ring.material.opacity = m.on * (m.dim ? 0.8 : 0.95)
      m.ring.scale.setScalar(0.6 + 0.4 * m.on)
      m.label.material.opacity = m.on
      m.label.scale.setScalar(0.3 * (0.5 + 0.5 * m.on))
    }
  }

  light(q) {
    const m = this.marks[q.n - 1]
    m.ring.position.set(q.x, 0.02, q.z)
    m.ring.material.color.set(q.color ?? '#ffe066').lerp(ringWhite, 0.45)
    m.label.material.map = numberTexture(q.n)
    m.label.material.needsUpdate = true
    // Back rows float a little higher, and front numbers draw on top, so clustered pins stay readable.
    m.label.position.set(q.x, PIN_H + 0.24 + (q.row ?? 0) * 0.06, q.z)
    m.label.renderOrder = 10 - (q.row ?? 0)
    m.withLabel = true
    m.dim = false
    m.want = 1
  }

  /** The numbers over the counted pins hide (`false`) while the child says how many, then come back. */
  labels(on) {
    for (const m of this.marks) if (m.want) m.withLabel = on
  }

  /** Before the second roll: soft rings stay under the pins left, without the numbers. */
  keepRings() {
    for (const m of this.marks) {
      m.withLabel = false
      m.dim = true
    }
  }

  clear() {
    this.done = true
    this.autoAt = Infinity
    this.autoAll = false
    this.queue = []
    for (const m of this.marks) {
      m.want = 0
      m.on = 0
      m.ring.visible = false
      m.label.visible = false
    }
  }

  fade() {
    for (const m of this.marks) m.want = 0
  }
}

const FOOT_STEPS = 9
const trailTex = canvasTexture(128, 1024, (g, w, h) => {
  // A trail of penguin footprints, toes pointing down the lane, fading towards the pins.
  const step = h / FOOT_STEPS
  for (let k = 0; k < FOOT_STEPS; k++) {
    const cx = w * (k % 2 ? 0.66 : 0.34)
    const cy = h - step * (k + 0.5)
    g.fillStyle = `rgba(255,255,255,${0.95 - k * 0.07})`
    g.beginPath()
    g.ellipse(cx, cy + step * 0.12, w * 0.12, step * 0.2, 0, 0, Math.PI * 2)
    g.fill()
    for (const a of [-0.5, 0, 0.5]) {
      g.beginPath()
      g.ellipse(cx + Math.sin(a) * w * 0.15, cy - step * 0.14 - Math.cos(a) * step * 0.06, w * 0.05, step * 0.1, a, 0, Math.PI * 2)
      g.fill()
    }
  }
})

/**
 * A trail of footprints down the lane, in line with the pins the child found:
 * "slide along here". It turns from yellow to green once the penguin stands in line,
 * and the aim dots then run along it.
 */
export class Spot {
  constructor(scene, z0, z1) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, z0 - z1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false, toneMapped: false, color: '#ffca3a', opacity: 0 }),
    )
    this.mesh.position.set(0, 0.025, (z0 + z1) / 2)
    this.z0 = z0
    this.len = z0 - z1
    this.mesh.renderOrder = 2
    this.mesh.visible = false
    // A plan's number at the end of the short trail, so "stand here for 8" reads at a glance.
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false, opacity: 0 }))
    this.label.scale.setScalar(0.42)
    this.label.renderOrder = 4
    this.label.visible = false
    scene.add(this.mesh, this.label)
    this.x = null
    this.on = 0
  }
  /**
   * Lay the trail at lane position x. `short` keeps only the first prints by the penguin:
   * where to stand, but not the line to slide along (the older children's spare).
   */
  show(x, { short = false, label = null } = {}) {
    this.x = x
    this.short = short
    this.mesh.position.x = x
    const k = short ? 0.4 : 1
    this.mesh.scale.z = k
    // The short prints are a little wider, so they still show beside the penguin from behind.
    this.mesh.scale.x = short ? 1.35 : 1
    this.mesh.position.z = this.z0 - (this.len * k) / 2
    this.mesh.material.map.repeat.y = k
    this.withLabel = label !== null
    if (this.withLabel) {
      this.label.material.map = numberTexture(label)
      this.label.material.needsUpdate = true
      this.label.position.set(x, 0.32, this.z0 - this.len * k - 0.2)
    }
  }

  hide() {
    this.x = null
  }

  /** Eases in and out; turns from warm yellow to green while the penguin stands on it. */
  update(dt, penguinX) {
    const here = this.x !== null && Math.abs(penguinX - this.x) < 0.06
    this.on += ((this.x === null ? 0 : 1) - this.on) * Math.min(1, dt * 5)
    this.mesh.visible = this.on > 0.02
    this.mesh.material.opacity = this.on * (this.short ? 1 : 0.85)
    this.mesh.material.color.set(here ? '#7bd88f' : this.short ? '#ffb238' : '#ffca3a')
    this.label.visible = this.mesh.visible && this.withLabel
    this.label.material.opacity = this.on
    return here
  }
}

/** A puff of cloud: solid in the middle, soft at the edge. */
const cloudTex = canvasTexture(64, 64, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.95)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

/**
 * Tier 3: a soft snow cloud settles over the pin deck while the child works out the missing part of
 * the bond, so the answer comes from the bond (7 + ? = 10), not from counting the lane again.
 * It lifts as soon as the child answers.
 */
export class Mist {
  constructor(scene, z0, z1, half) {
    this.puffs = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: '#f4fbff', transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0 }))
        s.renderOrder = 5
        s.visible = false
        const x = (c / 4 - 0.5) * 2 * half * 0.9
        const z = z0 + ((z1 - z0) * r) / 3
        s.position.set(x, 0.5 + r * 0.2, z)
        s.userData = { x, size: 1.6 + ((r + c) % 2) * 0.3, phase: r * 1.7 + c }
        scene.add(s)
        this.puffs.push(s)
      }
    }
    this.on = 0
    this.want = 0
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)')
  }

  /** Settle the cloud; `onReady` runs once it hides the pins (a question waits for it, so it is never asked through a thin cloud). */
  show(onReady) {
    this.want = 1
    this.onReady = onReady
  }

  hide() {
    this.want = 0
    this.onReady = null
  }

  update(dt, t) {
    this.on += (this.want - this.on) * Math.min(1, dt * (this.want ? 5 : 4))
    if (this.onReady && this.on > 0.9) {
      const ready = this.onReady
      this.onReady = null
      ready()
    }
    const drift = this.reduced.matches ? 0 : 1
    for (const s of this.puffs) {
      s.visible = this.on > 0.02
      if (!s.visible) continue
      const u = s.userData
      s.material.opacity = this.on
      s.position.x = u.x + Math.sin(t * 0.3 + u.phase) * 0.06 * drift
      s.scale.setScalar(u.size * (0.7 + 0.3 * this.on))
    }
  }
}
