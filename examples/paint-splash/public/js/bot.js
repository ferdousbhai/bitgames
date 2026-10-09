import { HALF_D, HALF_W } from './paint.js'
import { COLLIDE_AHEAD, COLLIDE_R } from './painter.js'
import { clamp } from './util.js'

/**
 * Friendly computer painters for empty seats. They look for bare ground to
 * paint (and sometimes a friend's colour, where the paints mix), go for pickups now and then, roll
 * round obstacles and do the odd happy swirl. A little slower than a child.
 */
export class Bot {
  constructor(painter, seed = 1) {
    this.p = painter
    this.goal = null
    this.retarget = 0
    this.swirl = 0
    this.swirlDir = seed % 2 ? 1 : -1
    this.stuck = 0
    this.lastX = painter.x
    this.lastZ = painter.z
    this.rnd = Math.random
  }

  update(dt, { paint, items, obstacles, painters }) {
    const p = this.p
    this.retarget -= dt
    if (this.swirl > 0) {
      // A swirl: roll round in a circle for a moment.
      this.swirl -= dt
      const a = p.yaw + this.swirlDir * 1.4
      p.controls = { x: Math.sin(a), z: Math.cos(a) }
      this.avoid(p.controls, obstacles, painters)
      return
    }
    const reached = this.goal && Math.hypot(this.goal.x - p.x, this.goal.z - p.z) < 1.4
    if (!this.goal || reached || this.retarget <= 0 || (this.goal.item && !items.has(this.goal.item))) {
      this.pick(paint, items, obstacles)
      if (!this.goal) this.goal = { x: 0, z: 0 }
    }
    // Wedged against something: pick somewhere else.
    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ)
    this.lastX = p.x
    this.lastZ = p.z
    this.stuck = moved < dt * 0.6 ? this.stuck + dt : 0
    if (this.stuck > 1) {
      this.stuck = 0
      this.goal = { x: clamp(p.x + (this.rnd() - 0.5) * 12, -HALF_W + 2, HALF_W - 2), z: clamp(p.z + (this.rnd() - 0.5) * 10, -HALF_D + 2, HALF_D - 2) }
      this.retarget = 1.5
    }
    const dx = this.goal.x - p.x, dz = this.goal.z - p.z
    const d = Math.hypot(dx, dz) || 1
    // A gentle wiggle so bot trails look hand-painted, not ruler-straight.
    const wob = Math.sin(performance.now() / 600 + p.seat) * 0.35
    const c = Math.cos(wob), s = Math.sin(wob)
    const want = { x: (dx * c - dz * s) / d, z: (dx * s + dz * c) / d }
    this.avoid(want, obstacles, painters)
    p.controls = want
  }

  pick(paint, items, obstacles) {
    const p = this.p
    this.retarget = 2 + this.rnd() * 2
    // Now and then: a swirl.
    if (this.rnd() < 0.12) {
      this.swirl = 1.6 + this.rnd()
      this.swirlDir = this.rnd() < 0.5 ? 1 : -1
      return
    }
    // Something fun close by?
    let best = null, bestScore = -Infinity
    for (const it of items.values()) {
      const d = Math.hypot(it.x - p.x, it.z - p.z)
      if (d > 10 || this.rnd() < 0.35) continue
      const score = (it.kind === 'water' ? 2 : 8) - d * 0.5
      if (score > bestScore) {
        bestScore = score
        best = { x: it.x, z: it.z, item: it.id }
      }
    }
    if (best && bestScore > 2) {
      this.goal = best
      return
    }
    // Otherwise the best of a few random spots: bare ground, then others' paint, not too far.
    for (let k = 0; k < 14; k++) {
      const x = -HALF_W + 2 + this.rnd() * (2 * HALF_W - 4)
      const z = -HALF_D + 2 + this.rnd() * (2 * HALF_D - 4)
      if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.5)) continue
      let score = 0
      for (const [ox, oz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
        // Bare ground first; a friend's different colour is fine too (that is where colours mix).
        const mix = paint.mixAt(x + ox, z + oz)
        if (mix === 0) score += 3
        else if (mix > 0 && mix !== p.paint) score += 1.2
      }
      score -= Math.hypot(x - p.x, z - p.z) * 0.25
      score += this.rnd() * 2
      if (score > bestScore) {
        bestScore = score
        best = { x, z }
      }
    }
    this.goal = best ?? { x: 0, z: 0 }
  }

  /** Bends `want` away from walls, obstacles and other painters just ahead. */
  avoid(want, obstacles, painters) {
    const p = this.p
    const cx = p.x + Math.sin(p.yaw) * COLLIDE_AHEAD, cz = p.z + Math.cos(p.yaw) * COLLIDE_AHEAD
    const push = (ox, oz, r, strength) => {
      const dx = cx - ox, dz = cz - oz
      const d = Math.hypot(dx, dz)
      const range = r + COLLIDE_R + 1.6
      if (d > range || d < 1e-3) return
      const k = ((range - d) / range) * strength
      want.x += (dx / d) * k
      want.z += (dz / d) * k
    }
    for (const o of obstacles) push(o.x, o.z, o.r, 2.2)
    for (const other of painters) if (other !== p) push(other.x, other.z, COLLIDE_R, 1.2)
    const margin = 2.2
    if (cx < -HALF_W + margin) want.x += (-HALF_W + margin - cx) * 0.8
    if (cx > HALF_W - margin) want.x -= (cx - (HALF_W - margin)) * 0.8
    if (cz < -HALF_D + margin) want.z += (-HALF_D + margin - cz) * 0.8
    if (cz > HALF_D - margin) want.z -= (cz - (HALF_D - margin)) * 0.8
    const len = Math.hypot(want.x, want.z) || 1
    want.x /= len
    want.z /= len
  }
}
