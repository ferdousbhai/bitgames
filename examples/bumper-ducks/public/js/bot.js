import { R, ITEMS } from './config.js'

/**
 * A friendly robot paddler: heads for the best nearby bubble, star or gift,
 * sometimes goes for a playful bonk, and keeps away from the rim. Not too
 * clever, so children win plenty.
 */
export class Bot {
  constructor(duck, skill = 0.75, seed = 1) {
    this.duck = duck
    this.skill = skill
    this.think = 0
    this.target = null
    this.wander = seed
    this.mood = 'collect'
    this.moodT = 2 + seed
  }

  /**
   * `lead` is how far this robot is ahead of the best child; robots in front ease off so children win plenty.
   * `napping`: every child has stopped paddling, so the robots float and wait for them.
   */
  update(sim, dt, lead = 0, napping = false) {
    const d = this.duck
    // Gentler still in the bubble party at the end, where a quick robot could snatch the win.
    const easy = Math.min(1, Math.max(0, sim.party ? (lead + 1) / 4 : lead / 5))
    if (d.fly || napping) {
      d.ix *= 0.85
      d.iz *= 0.85
      if (d.fly) d.ix = d.iz = 0
      return
    }
    this.think -= dt
    this.moodT -= dt
    if (this.moodT <= 0) {
      // Mostly collecting, now and then a bonk chase (less often against children on giants or shields).
      const r = Math.random()
      this.mood = r < 0.25 ? 'bonk' : r < 0.42 + easy * 0.3 ? 'rest' : 'collect'
      this.moodT = this.mood === 'bonk' ? 2.5 + Math.random() * 2 : this.mood === 'rest' ? 0.8 + Math.random() * 1.2 : 4 + Math.random() * 4
    }
    if (this.mood === 'rest') {
      // A little float and a look around.
      d.ix *= 0.9
      d.iz *= 0.9
      return
    }
    if (this.think <= 0) {
      this.think = 0.25 + (1 - this.skill) * 0.5
      this.target = this.choose(sim)
    }
    let tx = 0
    let tz = 0
    const t = this.target
    if (t) {
      const pos = t.duck ? { x: t.duck.x + t.duck.vx * 0.3, z: t.duck.z + t.duck.vz * 0.3 } : sim.items.get(t.item) ?? null
      if (!pos) this.think = 0
      else {
        tx = pos.x - d.x
        tz = pos.z - d.z
      }
    }
    this.wander += dt * 0.7
    tx += Math.cos(this.wander * 1.7) * 0.8
    tz += Math.sin(this.wander * 1.3) * 0.8
    // Stay off the rim unless chasing someone there.
    const dist = Math.hypot(d.x, d.z)
    if (dist > R - 3) {
      const k = (dist - (R - 3)) * 1.4
      tx -= (d.x / dist) * k
      tz -= (d.z / dist) * k
    }
    const len = Math.hypot(tx, tz) || 1
    const pace = this.skill * (1 - easy * 0.7) * (t?.duck ? 1 : Math.min(1, 0.5 + len / 4))
    d.ix = (tx / len) * pace
    d.iz = (tz / len) * pace
    // Dash at a nearby duck, or at a star that's getting away.
    if (t?.duck && len < 4 && d.dashCd <= 0 && Math.random() < dt * 2.5 * this.skill) sim.dash(d)
    else if (t && !t.duck && !easy && len > 5 && d.dashCd <= 0 && Math.random() < dt * 0.4) sim.dash(d)
  }

  choose(sim) {
    const d = this.duck
    if (this.mood === 'bonk') {
      let best = null
      let bestD = 9
      for (const o of sim.ducks) {
        if (o === d || o.fly || o.power === 'shield' || o.power === 'giant') continue
        const dd = Math.hypot(o.x - d.x, o.z - d.z)
        if (dd < bestD) {
          bestD = dd
          best = o
        }
      }
      if (best) return { duck: best }
    }
    let best = null
    let bestScore = -Infinity
    for (const it of sim.items.values()) {
      const dist = Math.hypot(it.x - d.x, it.z - d.z)
      const value = it.k === 'gift' ? 3 : ITEMS[it.k].points
      // A little randomness so the robots don't all pick the same bubble.
      const score = value * 3 - dist + Math.random() * 2
      if (score > bestScore) {
        bestScore = score
        best = it
      }
    }
    return best ? { item: best.id } : null
  }
}
