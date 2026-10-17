import { R, ITEMS } from './config.js'

/**
 * A friendly robot paddler: heads for the best nearby bubble, star or gift,
 * sometimes goes for a playful bonk, and keeps away from the rim. Not too
 * clever, so children win plenty.
 */
const BOOST = 1.2 // how much harder keen robots paddle (see `keen` in Bot.update)

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
   * `lead` is how far this robot is ahead of the best child. Robots play honestly, just a little slower than
   * a child, and one in front eases off (more so in the bubble shower).
   * `napping`: every child has stopped paddling, so the robots float and wait for them.
   * `match`: the best child's recent catch rate against a careful child's (0.25 to 1.3): robots paddle slower against a slow child and harder against a strong one.
   */
  update(sim, dt, lead = 0, napping = false, match = 1) {
    const d = this.duck
    this.lead = lead
    // Against a strong child (match near or above 1) the robots get keener: they mostly collect, think
    // faster and wander less, so a skilled child gets a real race now and then.
    const keen = Math.min(1, Math.max(0, (match - 0.8) / 0.3))
    this.keen = keen
    // (A keen robot reaches as far as a child does, and further against a really fast child: see Sim.pickups.)
    d.keen = keen + Math.max(0, match - 1.1) * 2
    // Against a slow child (low `match`) a robot starts easing off a few bubbles before it draws level.
    const slack = Math.max(0, 1 - match) * 7
    const easy = Math.min(1, Math.max(0, sim.party ? (lead + 2 + slack) / 4 : (lead + 1 + slack) / 5))
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
      // (Against a slow child the robots also stop for a float more often.)
      const bonkP = 0.25 - keen * 0.17
      this.mood = r < bonkP ? 'bonk' : r < bonkP + 0.17 + easy * 0.3 + Math.max(0, 1 - match) * 0.35 - keen * 0.15 ? 'rest' : 'collect'
      this.moodT = this.mood === 'bonk' ? 2.5 + Math.random() * 2 : this.mood === 'rest' ? 0.8 + Math.random() * 1.2 : 4 + Math.random() * 4
    }
    if (this.mood === 'rest') {
      // A little float and a look around.
      d.ix *= 0.9
      d.iz *= 0.9
      return
    }
    if (this.think <= 0) {
      this.think = (0.25 + (1 - this.skill) * 0.5) * (1 - keen * 0.6)
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
    tx += Math.cos(this.wander * 1.7) * 0.8 * (1 - keen * 0.8)
    tz += Math.sin(this.wander * 1.3) * 0.8 * (1 - keen * 0.8)
    // Stay off the rim unless chasing someone there.
    const dist = Math.hypot(d.x, d.z)
    if (dist > R - 3) {
      const k = (dist - (R - 3)) * 1.4
      tx -= (d.x / dist) * k
      tz -= (d.z / dist) * k
    }
    const len = Math.hypot(tx, tz) || 1
    // `match`: how quickly the best child is really catching (0.25 to 1.3), so a slow child meets slow robots.
    // (Keen robots, against a strong child, paddle a good deal harder.)
    const pace = this.skill * (match < 1 ? match : 1) * (1 + keen * BOOST) * (1 - easy * 0.7) * (t?.duck ? 1 : Math.min(1, 0.5 + len / 4))
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
    // Well ahead of the children, a robot leaves the bubbles right by a child's duck for them.
    const kids = this.lead > 3 ? sim.ducks.filter((o) => !o.bot) : []
    for (const it of sim.items.values()) {
      // The giant bubble is the children's surprise to burst.
      if (it.k === 'big') continue
      if (kids.some((o) => Math.hypot(it.x - o.x, it.z - o.z) < 3.5)) continue
      const dist = Math.hypot(it.x - d.x, it.z - d.z)
      const value = it.k === 'gift' ? 3 : ITEMS[it.k].points
      // A little randomness so the robots don't all pick the same bubble.
      // (A keen robot goes for what's close, like a quick child does.)
      const k = this.keen ?? 0
      const score = value * (3 - k * 2) - dist * (1 + k) + Math.random() * 2 * (1 - k)
      if (score > bestScore) {
        bestScore = score
        best = it
      }
    }
    return best ? { item: best.id } : null
  }
}
