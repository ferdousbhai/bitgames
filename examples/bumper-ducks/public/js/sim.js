import { R, DUCK_R, ROUND_TIME, PARTY_TIME, ARENAS, POWERS, POWER_IDS, ITEMS, angleDiff } from './config.js'

/**
 * The bumper-boat world, with no drawing in it: ducks are circles on the
 * water that paddle, bonk, bounce off the rim and fly out with a splash.
 *
 * The device that runs the round (`authority`) decides everything that
 * scores: pickups, powers, splash-outs and the clock, and reports each as
 * an event. Everyone else runs the same physics so their own duck answers
 * at once, and is nudged toward the authority's snapshots.
 */

const ACCEL = 15
const DRAG = 1.7 // per second; top speed is about ACCEL / DRAG
const DASH = 9.5
const DASH_COOLDOWN = 1.4
const BOOST = 2.6 // extra bounce in every bonk
const SPLASH_SPEED = 9.5 // hitting the rim this fast sends you flying (paddling alone tops out near 8.8)
export const FLY_TIME = 1.35
const HIT_MEMORY = 2.5 // seconds a bonk counts toward a splash bonus

export const newStats = () => ({ bubbles: 0, stars: 0, gifts: 0, bonks: 0, splashes: 0, dashes: 0, flights: 0 })

export class Sim {
  constructor({ arena, entries }) {
    this.arenaId = arena
    this.arena = ARENAS[arena]
    this.time = 0
    this.over = false
    this.n = entries.length
    this.ducks = entries.map((e, i) => {
      const a = Math.PI / 2 + (i * Math.PI * 2) / Math.max(4, entries.length)
      const x = Math.cos(a) * R * 0.66
      const z = Math.sin(a) * R * 0.66
      // Everyone starts facing the camera, so each child sees their duck's face (and hat) at the countdown.
      return {
        id: e.id, i, x, z, vx: 0, vz: 0, h: 0, spin: 0, sv: 0, ix: 0, iz: 0,
        dashCd: 0, dashT: 0, power: null, powerT: 0, scale: 1, fly: null, score: 0,
        stats: newStats(), lastHit: null, lastHitT: -99,
      }
    })
    this.byId = new Map(this.ducks.map((d) => [d.id, d]))
    this.items = new Map()
    this.nextItem = 1
    this.obstacles = this.arena.obstacles.map((o, i) => ({ ...o, i, vx: 0, vz: 0, mass: o.mass ?? 1, hitT: -9 }))
    this.events = []
    this.pairT = new Map()
    this.timers = { bubble: 0, star: 7, gift: 4.5, drop: 2.5 }
    this.started = false
  }

  emit(e) {
    this.events.push(e)
  }

  get party() {
    return this.time >= ROUND_TIME - PARTY_TIME
  }

  radius(d) {
    return DUCK_R * d.scale
  }

  mass(d) {
    return d.power === 'giant' ? 4 : d.power === 'shield' ? 2.5 : 1
  }

  /** A dash: a burst of speed where the duck is steering (or facing). */
  dash(d) {
    if (!d || d.fly || d.dashCd > 0) return false
    let dx = d.ix
    let dz = d.iz
    const len = Math.hypot(dx, dz)
    if (len < 0.2) {
      dx = Math.sin(d.h)
      dz = Math.cos(d.h)
    } else {
      dx /= len
      dz /= len
    }
    const k = d.power === 'speedy' ? 1.3 : 1
    d.vx += dx * DASH * k
    d.vz += dz * DASH * k
    d.h = Math.atan2(dx, dz)
    d.dashCd = DASH_COOLDOWN
    d.dashT = 0.4
    d.stats.dashes++
    return true
  }

  step(dt, authority) {
    this.time += dt
    for (const d of this.ducks) this.moveDuck(d, dt, authority)
    this.moveObstacles(dt)
    this.collideDucks(authority)
    this.collideObstacles(authority)
    for (const d of this.ducks) this.rim(d, authority)
    if (!authority) return
    this.pickups()
    this.spawning(dt)
    if (this.arena.rain) this.rain(dt)
    if (!this.over && this.time >= ROUND_TIME) {
      this.over = true
      this.emit({ k: 'end' })
    }
  }

  moveDuck(d, dt, authority) {
    d.dashCd = Math.max(0, d.dashCd - dt)
    d.dashT = Math.max(0, d.dashT - dt)
    if (d.power) {
      d.powerT -= dt
      if (d.powerT <= 0 && authority) {
        this.emit({ k: 'powerEnd', id: d.id, p: d.power })
        d.power = null
      }
    }
    d.scale += ((d.power === 'giant' ? 1.55 : 1) - d.scale) * Math.min(1, dt * 5)
    // Spinning after a bonk winds down, then settles back facing forwards.
    d.spin += d.sv * dt
    d.sv *= Math.exp(-2.2 * dt)
    if (Math.abs(d.sv) < 1.5) d.spin += angleDiff(d.spin, Math.round(d.spin / (Math.PI * 2)) * Math.PI * 2) * Math.min(1, dt * 3)
    if (d.fly) {
      const f = d.fly
      f.t += dt
      const k = Math.min(1, f.t / FLY_TIME)
      const e = k * k * (3 - 2 * k)
      const bulge = Math.sin(Math.PI * k) * 2.2
      d.x = f.fx + (f.tx - f.fx) * e + f.nx * bulge
      d.z = f.fz + (f.tz - f.fz) * e + f.nz * bulge
      d.sv = 9
      if (k >= 1) {
        d.fly = null
        d.vx = (f.tx - f.fx) * 0.25
        d.vz = (f.tz - f.fz) * 0.25
        d.sv = 4
        if (authority) this.emit({ k: 'land', id: d.id, x: +d.x.toFixed(2), z: +d.z.toFixed(2) })
      }
      return
    }
    let ix = d.ix
    let iz = d.iz
    const len = Math.hypot(ix, iz)
    if (len > 1) {
      ix /= len
      iz /= len
    }
    const accel = ACCEL * (d.power === 'speedy' ? 1.65 : d.power === 'giant' ? 0.95 : 1)
    d.vx += ix * accel * dt
    d.vz += iz * accel * dt
    const drag = Math.exp(-DRAG * dt)
    d.vx *= drag
    d.vz *= drag
    d.x += d.vx * dt
    d.z += d.vz * dt
    // Face where we're going (or where the stick points when nearly still).
    const sp = Math.hypot(d.vx, d.vz)
    const want = sp > 0.6 ? Math.atan2(d.vx, d.vz) : len > 0.3 ? Math.atan2(ix, iz) : d.h
    d.h += angleDiff(d.h, want) * Math.min(1, dt * 7)
  }

  moveObstacles(dt) {
    for (const o of this.obstacles) {
      if (o.fixed) continue
      // A gentle swirl carries the paper boats around the puddle.
      const d = Math.hypot(o.x, o.z) || 1
      const tx = (-o.z / d) * 0.9
      const tz = (o.x / d) * 0.9
      o.vx += (tx - o.vx) * dt * 0.4
      o.vz += (tz - o.vz) * dt * 0.4
      o.vx *= Math.exp(-0.6 * dt)
      o.vz *= Math.exp(-0.6 * dt)
      o.x += o.vx * dt
      o.z += o.vz * dt
      const lim = R - o.r - 0.3
      if (d > lim) {
        const nx = o.x / d
        const nz = o.z / d
        o.x = nx * lim
        o.z = nz * lim
        const vr = o.vx * nx + o.vz * nz
        if (vr > 0) {
          o.vx -= 1.6 * vr * nx
          o.vz -= 1.6 * vr * nz
        }
      }
    }
    // Boats bump each other too.
    const dyn = this.obstacles.filter((o) => !o.fixed)
    for (let i = 0; i < dyn.length; i++)
      for (let j = i + 1; j < dyn.length; j++) {
        const a = dyn[i]
        const b = dyn[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const dist = Math.hypot(dx, dz)
        const min = a.r + b.r
        if (dist >= min || dist < 1e-4) continue
        const nx = dx / dist
        const nz = dz / dist
        const push = (min - dist) / 2
        a.x -= nx * push
        a.z -= nz * push
        b.x += nx * push
        b.z += nz * push
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
        if (rel > 0) {
          a.vx -= rel * nx
          a.vz -= rel * nz
          b.vx += rel * nx
          b.vz += rel * nz
        }
      }
  }

  collideDucks(authority) {
    const ds = this.ducks
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i]
        const b = ds[j]
        if (a.fly || b.fly) continue
        const ra = this.radius(a)
        const rb = this.radius(b)
        let dx = b.x - a.x
        let dz = b.z - a.z
        let dist = Math.hypot(dx, dz)
        if (dist >= ra + rb) continue
        if (dist < 1e-4) {
          dx = 1
          dz = 0
          dist = 1e-4
        }
        const nx = dx / dist
        const nz = dz / dist
        const ma = this.mass(a)
        const mb = this.mass(b)
        const overlap = ra + rb - dist
        a.x -= nx * overlap * (mb / (ma + mb))
        a.z -= nz * overlap * (mb / (ma + mb))
        b.x += nx * overlap * (ma / (ma + mb))
        b.z += nz * overlap * (ma / (ma + mb))
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
        if (rel <= 0) continue
        // Bouncy: an elastic bounce plus a little extra boing.
        const j1 = (2 * rel) / (1 / ma + 1 / mb)
        const extra = BOOST + rel * 0.3
        const ka = (extra * mb) / (ma + mb) + (b.power === 'shield' ? 6 : 0)
        const kb = (extra * ma) / (ma + mb) + (a.power === 'shield' ? 6 : 0)
        a.vx -= (j1 / ma) * nx + ka * nx
        a.vz -= (j1 / ma) * nz + ka * nz
        b.vx += (j1 / mb) * nx + kb * nx
        b.vz += (j1 / mb) * nz + kb * nz
        const key = a.id < b.id ? a.id + b.id : b.id + a.id
        const last = this.pairT.get(key) ?? -9
        if (rel > 1.6 && this.time - last > 0.3) {
          this.pairT.set(key, this.time)
          const side = Math.sign((a.vx - b.vx) * nz - (a.vz - b.vz) * nx) || 1
          a.sv += side * Math.min(14, rel * 1.3) * (mb / (ma + mb)) * 1.5
          b.sv -= side * Math.min(14, rel * 1.3) * (ma / (ma + mb)) * 1.5
          if (authority) {
            // Who bonked whom: whoever was paddling (or dashing) into the other harder.
            const pa = this.prevApproach(a, nx, nz)
            const pb = this.prevApproach(b, -nx, -nz)
            const hitter = pa >= pb ? a : b
            const victim = hitter === a ? b : a
            hitter.stats.bonks++
            victim.lastHit = hitter.id
            victim.lastHitT = this.time
            this.emit({ k: 'bonk', a: hitter.id, b: victim.id, x: +((a.x + b.x) / 2).toFixed(2), z: +((a.z + b.z) / 2).toFixed(2), s: +rel.toFixed(1) })
          }
        }
      }
    }
  }

  /** How hard a duck was paddling toward the other (its own speed along the normal). */
  prevApproach(d, nx, nz) {
    return Math.max(0, d.ix * nx + d.iz * nz) * 2 + (d.dashT > 0 ? 5 : 0) + (d.power === 'giant' ? 2 : 0)
  }

  collideObstacles(authority) {
    for (const o of this.obstacles) {
      for (const d of this.ducks) {
        if (d.fly) continue
        const rd = this.radius(d)
        const dx = d.x - o.x
        const dz = d.z - o.z
        const dist = Math.hypot(dx, dz)
        if (dist >= rd + o.r || dist < 1e-4) continue
        const nx = dx / dist
        const nz = dz / dist
        const md = this.mass(d)
        const mo = o.fixed ? Infinity : o.mass
        const share = o.fixed ? 1 : mo / (md + mo)
        const overlap = rd + o.r - dist
        d.x += nx * overlap * share
        d.z += nz * overlap * share
        if (!o.fixed) {
          o.x -= nx * overlap * (1 - share)
          o.z -= nz * overlap * (1 - share)
        }
        const rel = (o.vx - d.vx) * nx + (o.vz - d.vz) * nz
        if (rel <= 0) continue
        if (o.fixed) {
          d.vx += nx * (rel * 2 + 2.2)
          d.vz += nz * (rel * 2 + 2.2)
        } else {
          const j = (2 * rel) / (1 / md + 1 / mo)
          d.vx += (j / md) * nx + nx * 1.5
          d.vz += (j / md) * nz + nz * 1.5
          o.vx -= (j / mo) * nx + nx * 1.2
          o.vz -= (j / mo) * nz + nz * 1.2
        }
        if (rel > 1.8 && this.time - o.hitT > 0.4) {
          o.hitT = this.time
          d.sv += (Math.random() < 0.5 ? -1 : 1) * Math.min(10, rel)
          if (authority) this.emit({ k: 'thud', o: o.i, id: d.id, s: +rel.toFixed(1) })
        }
      }
    }
  }

  /** The rim: a soft bounce, or a big one that sends the duck flying out and back in. */
  rim(d, authority) {
    if (d.fly) return
    const dist = Math.hypot(d.x, d.z)
    const lim = R - this.radius(d) * 0.85
    if (dist <= lim) return
    const nx = d.x / dist
    const nz = d.z / dist
    const vr = d.vx * nx + d.vz * nz
    if (authority && vr > SPLASH_SPEED * (d.power === 'giant' ? 1.3 : d.power === 'speedy' ? 1.5 : 1)) {
      // Out over the edge... and boing, back into the water.
      const turn = (Math.random() - 0.5) * 1.2
      const back = R * (0.3 + Math.random() * 0.2)
      const ta = Math.atan2(nz, nx) + turn
      d.fly = { fx: d.x, fz: d.z, tx: Math.cos(ta) * back, tz: Math.sin(ta) * back, nx, nz, t: 0 }
      d.stats.flights++
      d.vx = 0
      d.vz = 0
      const by = d.lastHit && this.time - d.lastHitT < HIT_MEMORY ? this.byId.get(d.lastHit) : null
      if (by && by !== d) {
        by.stats.splashes++
        by.score += 2
      }
      d.lastHit = null
      this.emit({ k: 'fly', id: d.id, by: by?.id ?? null, f: [d.fly.fx, d.fly.fz, d.fly.tx, d.fly.tz, nx, nz].map((v) => +v.toFixed(2)) })
      return
    }
    d.x = nx * lim
    d.z = nz * lim
    if (vr > 0) {
      d.vx -= 1.55 * vr * nx
      d.vz -= 1.55 * vr * nz
      if (vr > 3 && authority) this.emit({ k: 'rim', id: d.id, x: +d.x.toFixed(2), z: +d.z.toFixed(2), s: +vr.toFixed(1) })
    }
  }

  pickups() {
    for (const it of this.items.values()) {
      for (const d of this.ducks) {
        if (d.fly) continue
        const reach = this.radius(d) + ITEMS[it.k].radius
        if ((d.x - it.x) ** 2 + (d.z - it.z) ** 2 > reach * reach) continue
        this.items.delete(it.id)
        const e = { k: 'got', item: it.id, kind: it.k, id: d.id, x: it.x, z: it.z }
        if (it.k === 'bubble') {
          d.score += 1
          d.stats.bubbles++
        } else if (it.k === 'star') {
          d.score += 3
          d.stats.stars++
        } else {
          const options = POWER_IDS.filter((p) => p !== d.power)
          d.power = options[Math.floor(Math.random() * options.length)]
          d.powerT = POWERS[d.power].time
          d.stats.gifts++
          e.p = d.power
        }
        this.emit(e)
        break
      }
    }
  }

  count(kind) {
    let n = 0
    for (const it of this.items.values()) if (it.k === kind) n++
    return n
  }

  spawning(dt) {
    if (!this.started) {
      // A handful of bubbles waiting on the water when the round starts.
      this.started = true
      for (let i = 0; i < 7; i++) this.addItem('bubble')
    }
    const t = this.timers
    for (const k of Object.keys(t)) t[k] -= dt
    const party = this.party
    if (t.bubble <= 0) {
      // The last seconds bring a gentle bubble shower (calm pass: was every 0.18 s, up to 22).
      t.bubble = party ? 0.35 : 0.55
      if (this.count('bubble') < (party ? 16 : 11)) this.addItem('bubble')
    }
    if (t.star <= 0) {
      t.star = party ? 3 : 6 + Math.random() * 3
      if (this.count('star') < 2) this.addItem('star')
    }
    if (t.gift <= 0) {
      t.gift = 9 + Math.random() * 4
      if (this.count('gift') < 1) this.addItem('gift')
    }
  }

  addItem(k, at) {
    let x = 0
    let z = 0
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * (R - 1.6)
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      if (at) break
      const clear =
        this.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 1) &&
        this.ducks.every((d) => Math.hypot(d.x - x, d.z - z) > 2.4) &&
        [...this.items.values()].every((it) => Math.hypot(it.x - x, it.z - z) > 1.2)
      if (clear) break
    }
    if (at) ({ x, z } = at)
    const it = { id: this.nextItem++, k, x: +x.toFixed(2), z: +z.toFixed(2) }
    this.items.set(it.id, it)
    this.emit({ k: 'item', item: it.id, kind: k, x: it.x, z: it.z })
    return it
  }

  /** Puddle: big raindrops plop down and push nearby boats away. */
  rain(dt) {
    if (this.timers.drop > 0) return
    this.timers.drop = 1.8 + Math.random() * 2
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * (R - 2)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    this.splashPush(x, z)
    this.emit({ k: 'drop', x: +x.toFixed(2), z: +z.toFixed(2) })
  }

  splashPush(x, z) {
    for (const d of this.ducks) {
      if (d.fly) continue
      const dx = d.x - x
      const dz = d.z - z
      const dist = Math.hypot(dx, dz)
      if (dist > 3.4 || dist < 1e-3) continue
      const k = 5 * (1 - dist / 3.4)
      d.vx += (dx / dist) * k
      d.vz += (dz / dist) * k
      d.sv += k * 0.8
    }
  }

  // --- Sharing with the other devices -----------------------------------------------

  snapshot() {
    return {
      tm: +this.time.toFixed(2),
      d: this.ducks.map((d) => [
        +d.x.toFixed(2), +d.z.toFixed(2), +d.vx.toFixed(2), +d.vz.toFixed(2), +d.h.toFixed(2), +d.sv.toFixed(1),
        +d.ix.toFixed(2), +d.iz.toFixed(2), d.score, d.power ? POWER_IDS.indexOf(d.power) : -1, +d.powerT.toFixed(1),
        d.fly ? +d.fly.t.toFixed(2) : -1,
      ]),
      o: this.obstacles.filter((o) => !o.fixed).map((o) => [+o.x.toFixed(2), +o.z.toFixed(2), +o.vx.toFixed(2), +o.vz.toFixed(2)]),
    }
  }

  /** Follow the authority's snapshot; `self` is the duck this device steers (it keeps its own input). */
  applySnapshot(s, self) {
    if (!s || !Array.isArray(s.d)) return
    if (typeof s.tm === 'number' && Math.abs(s.tm - this.time) > 0.25) this.time = s.tm
    s.d.forEach((row, i) => {
      const d = this.ducks[i]
      if (!d || !Array.isArray(row)) return
      const [x, z, vx, vz, h, sv, ix, iz, score, p, pt, fly] = row
      d.score = score
      d.power = p >= 0 ? POWER_IDS[p] : null
      d.powerT = pt
      if (fly >= 0) {
        if (d.fly) d.fly.t = fly
        return
      }
      if (d.fly) return // still finishing the flight locally; landing comes next
      const err = Math.hypot(x - d.x, z - d.z)
      const own = d === self
      const k = err > 3 ? 1 : own ? 0.2 : 0.5
      d.x += (x - d.x) * k
      d.z += (z - d.z) * k
      d.vx += (vx - d.vx) * (own ? 0.3 : 1)
      d.vz += (vz - d.vz) * (own ? 0.3 : 1)
      if (!own) {
        d.ix = ix
        d.iz = iz
        d.h += angleDiff(d.h, h) * 0.5
        if (Math.abs(sv) > Math.abs(d.sv)) d.sv = sv
      }
    })
    if (Array.isArray(s.o)) {
      const dyn = this.obstacles.filter((o) => !o.fixed)
      s.o.forEach((row, i) => {
        const o = dyn[i]
        if (!o || !Array.isArray(row)) return
        o.x += (row[0] - o.x) * 0.5
        o.z += (row[1] - o.z) * 0.5
        o.vx = row[2]
        o.vz = row[3]
      })
    }
  }

  /** Mirrors an authority event (from a snapshot-following device). */
  applyEvent(e) {
    const d = this.byId.get(e.id)
    switch (e.k) {
      case 'item':
        this.items.set(e.item, { id: e.item, k: e.kind, x: e.x, z: e.z })
        this.nextItem = Math.max(this.nextItem, e.item + 1)
        break
      case 'got':
        this.items.delete(e.item)
        if (d && e.p) {
          d.power = e.p
          d.powerT = POWERS[e.p]?.time ?? 0
        }
        break
      case 'fly':
        if (d && Array.isArray(e.f)) {
          const [fx, fz, tx, tz, nx, nz] = e.f
          d.fly = { fx, fz, tx, tz, nx, nz, t: 0 }
          d.vx = 0
          d.vz = 0
        }
        break
      case 'drop':
        this.splashPush(e.x, e.z)
        break
      case 'powerEnd':
        if (d && d.power === e.p) d.power = null
        break
    }
  }

  /** The item list, so a device that missed something catches up. */
  itemList() {
    return [...this.items.values()].map((it) => [it.id, it.k, it.x, it.z])
  }

  syncItems(list) {
    if (!Array.isArray(list)) return { added: [], removed: [] }
    const keep = new Set()
    const added = []
    for (const row of list) {
      if (!Array.isArray(row)) continue
      const [id, k, x, z] = row
      if (!ITEMS[k]) continue
      keep.add(id)
      if (!this.items.has(id)) {
        const it = { id, k, x, z }
        this.items.set(id, it)
        added.push(it)
      }
    }
    const removed = []
    for (const id of [...this.items.keys()])
      if (!keep.has(id)) {
        removed.push(this.items.get(id))
        this.items.delete(id)
      }
    return { added, removed }
  }
}
