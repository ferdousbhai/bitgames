import * as THREE from 'three'
import { canvasTexture } from './effects.js'
import { PIN_H } from './lane.js'

/**
 * Counting the pins left standing, built into every roll.
 *
 * In the scene: a soft ring lights under each standing pin, one at a time,
 * with its number floating above it ("1, 2, 3 still standing").
 * On screen: a pictured number bond, fallen + standing = 10, as two groups of pins.
 * Before a second roll the rings stay on the ice so the child can see where the
 * pins are, and a three-way picture choice (left, middle, right) asks where they are.
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

/** Which way a pin is from the middle of the lane, as the penguin sees it. */
export const sideOf = (x) => (x < -0.2 ? 'left' : x > 0.2 ? 'right' : 'middle')

export class Counter {
  constructor(scene, { say }) {
    this.say = say
    this.marks = Array.from({ length: 10 }, () => {
      const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2),
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
    this.t = 0
    this.done = true
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)')
  }

  /** Start counting `standing` pins ([{x, z, color, i}]) after `delay` seconds. */
  start(standing, delay, onDone) {
    this.clear()
    this.queue = standing.map((p, k) => ({ ...p, n: k + 1, at: delay + k * 0.7 }))
    this.total = standing.length
    this.t = 0
    this.done = false
    this.onDone = onDone
    this.onStep = null
    this.endAt = delay + standing.length * 0.7 + 0.3
  }

  /** How long the whole count takes, in seconds, for `n` pins after `delay`. */
  static duration(n, delay) {
    return delay + n * 0.7 + 0.3
  }

  update(dt, t) {
    if (!this.done) {
      this.t += dt
      for (const q of this.queue) {
        if (q.lit || this.t < q.at) continue
        q.lit = true
        this.light(q)
        this.onStep?.(q)
        const last = q.n === this.total
        this.say(last ? `${q.n} still standing` : String(q.n))
      }
      if (this.t >= this.endAt) {
        this.done = true
        this.onDone?.()
      }
    }
    // Rings ease in and breathe very slightly; numbers ease in.
    const still = this.reduced.matches
    for (const m of this.marks) {
      m.on += (m.want - m.on) * Math.min(1, dt * 6)
      const show = m.on > 0.02
      m.ring.visible = show
      m.label.visible = show && m.withLabel
      if (!show) continue
      const breathe = still ? 1 : 1 + Math.sin(t * 2 + m.phase) * 0.05
      m.ring.material.opacity = m.on * (m.dim ? 0.8 : 0.95)
      m.ring.scale.setScalar(breathe * (0.6 + 0.4 * m.on))
      m.label.material.opacity = m.on
      m.label.scale.setScalar(0.3 * (0.5 + 0.5 * m.on))
    }
  }

  light(q) {
    const m = this.marks[q.n - 1]
    m.ring.position.set(q.x, 0.02, q.z)
    m.ring.material.color.set(q.color ?? '#ffe066').lerp(new THREE.Color('#fff3b0'), 0.45)
    m.label.material.map = numberTexture(q.n)
    m.label.material.needsUpdate = true
    // Back rows float a little higher, and front numbers draw on top, so clustered pins stay readable.
    m.label.position.set(q.x, PIN_H + 0.24 + (q.row ?? 0) * 0.06, q.z)
    m.label.renderOrder = 10 - (q.row ?? 0)
    m.withLabel = true
    m.dim = false
    m.phase = q.n
    m.want = 1
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
