import { R, DUCK_R, ROUND_TIME, PARTY_TIME, ARENAS, POWERS, POWER_IDS, ITEMS, BUBBLE_COLOURS, TEN, goalSlots, slotTakes, fitsNow, freeBondFits, splitOf, wayKey, angleDiff } from './config.js'

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

export const newStats = () => ({ bubbles: 0, stars: 0, gifts: 0, bonks: 0, splashes: 0, dashes: 0, flights: 0, nopes: 0, chosen: 0, splits: 0 })

/** What a pickup puts in the jar: its colour, TEN for a raft, or null for stars and gifts. */
export const tokenOf = (it) => (it.k === 'ten' ? TEN : it.k === 'bubble' ? (Number.isInteger(it.c) ? it.c : -1) : null)
const NOPE_PUSH = 2.2 // how far a bubble the jar can't take bobs away from the duck
export const STAGE_PAUSE = 3 // seconds between a trip's goals: the full jar is admired, then the next goal
const STUCK_FREE = 40 // a stuck bubble nobody bumped floats free on its own after this long
/**
 * A child chose a bubble when their duck was steering at it (the closest to the stick's line) for at
 * least this long before touching it. Only chosen bubbles count for the next level: a bubble that didn't
 * fit is a miss only if it was chosen, and a random paddle that happens to sweep one up is not a careful catch.
 */
const AIM_HOLD = 0.5

export class Sim {
  constructor({ arena, entries, mode = 'lively', trip = null }) {
    // Pond helpers ('calm'): no clock; the round is a trip of goals and ends when the jar holds the last one.
    this.calm = mode === 'calm' && Array.isArray(trip) && trip.length > 0
    this.trip = this.calm ? trip : []
    this.goal = null
    this.slots = []
    this.open = []
    this.target = 0
    this.jar = [] // the token of each bubble (or raft) the team has put in the jar, in order
    this.between = null // sim time the jar filled, while the team admires it before the next goal
    this.stage = -1
    if (this.calm) this.setStage(0)
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
        id: e.id, bot: !!e.bot, i, x, z, vx: 0, vz: 0, h: 0, spin: 0, sv: 0, ix: 0, iz: 0,
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
    return !this.calm && this.time >= ROUND_TIME - PARTY_TIME
  }

  /** Is this a bubble (or raft) the jar sorts, rather than a gift? */
  sorts(it) {
    return this.calm && (it.k === 'bubble' || it.k === 'ten')
  }

  /**
   * The trip's next goal. A carried place-value step keeps the jar and adds spaces (10 more, 2 more);
   * any other goal starts with an empty jar. `slots` says what each space wants; `open` keeps the empty ones.
   */
  setStage(s, authority = false) {
    this.stage = s
    this.goal = this.trip[s]
    this.slots = goalSlots(this.goal)
    this.target = this.slots.length
    // The ways to make this number already made on this trip (a free bond must find a new one).
    this.used = this.trip.slice(0, s).filter((g) => g.kind === 'bond' && g.parts).map((g) => wayKey(g.parts[0][1], g.parts[1]?.[1] ?? 0))
    if (!this.goal.carry) this.jar = []
    let kept = this.jar
    // After a crossing, the full bundle of ten single bubbles is one more raft on the shelf (a ten is ten ones).
    const prev = this.trip[s - 1]
    if (this.goal.carry && prev?.regroup) {
      const singles = kept.filter((t) => t !== TEN)
      kept = [...kept.filter((t) => t === TEN), TEN, ...singles.slice(10)]
    }
    this.jar = []
    this.open = this.slots.slice()
    for (const t of kept) this.fill(t)
    this.dryT = 0
    this.spared = 0
    // Crossing a ten: only a single bubble or two float by, fewer than the step needs, so breaking a raft
    // into ten ones is how to finish. Bubbles from a raft the child already broke stay theirs to use.
    this.scarce = this.goal.regroup ? Math.min(1 + Math.floor(Math.random() * 2), this.target - this.jar.length - 1) : null
    if (this.scarce != null && authority) {
      let keep = this.scarce
      for (const it of [...this.items.values()]) {
        if (it.k !== 'bubble' || it.split != null) continue
        if (keep > 0) keep--
        else {
          this.items.delete(it.id)
          this.emit({ k: 'fade', item: it.id })
        }
      }
      this.spared = this.scarce - keep
    }
  }

  /** Crossing a ten with no single bubbles left on the water (stuck ones count): a raft must become ten ones. */
  dryOnes() {
    if (!this.calm || !this.goal?.regroup || this.between != null || this.open.includes('ten') || !this.open.includes('any')) return false
    for (const it of this.items.values()) if (it.k === 'bubble') return false
    return true
  }

  /**
   * How many new single bubbles may float by on a crossing step: a scarce few. A team that has had none
   * for 30 s (after the voice's question and its hint) gets one more every 6 s, so nobody is stuck for long.
   */
  onesLeft() {
    if (this.scarce == null) return Infinity
    return this.scarce + Math.floor(Math.max(0, this.dryT - 30) / 6) - this.spared
  }

  /** Does the jar have a space for this now? A full colour, a raft once the tens are full, or a single bubble before them, does not fit. */
  counts(it) {
    if (!this.sorts(it) || this.between != null) return false
    if (this.goal.free) return freeBondFits(this.goal.n, this.jar, tokenOf(it), this.used)
    return fitsNow(this.goal, this.open, tokenOf(it))
  }

  /** Puts a token in the jar's first open space that takes it. */
  fill(token) {
    this.jar.push(token)
    const i = this.open.findIndex((w) => w != null && slotTakes(w, token))
    if (i >= 0) this.open[i] = null
    this.seal()
  }

  /** A full free bond becomes the children's own way: its colours and amounts, in the order they came. */
  seal() {
    const g = this.goal
    if (!g?.free || this.jar.length < this.target) return
    const parts = splitOf(this.jar)
    if (parts.length === 2) g.parts = parts
  }

  /**
   * Which bubble each child's duck is steering at: the one nearest the stick's line, ahead of it. Kept
   * while the duck coasts, and while it closes in (when the angle to it opens up).
   */
  aimAll() {
    for (const d of this.ducks) {
      if (d.bot || d.fly) continue
      const cur = d.aim && this.items.get(d.aim.id)
      if (cur && Math.hypot(cur.x - d.x, cur.z - d.z) < this.radius(d) + ITEMS[cur.k].radius + 1.2) continue
      const len = Math.hypot(d.ix, d.iz)
      if (len < 0.3) continue
      const ux = d.ix / len
      const uz = d.iz / len
      let best = null
      let bestA = Infinity
      for (const it of this.items.values()) {
        if (!this.sorts(it) || it.stuck != null) continue
        const dx = it.x - d.x
        const dz = it.z - d.z
        const along = dx * ux + dz * uz
        if (along < 0.3) continue
        const across = Math.abs(dx * uz - dz * ux)
        if (across > Math.max(0.9, along * 0.3)) continue
        const a = Math.atan2(across, along)
        if (a < bestA) {
          bestA = a
          best = it
        }
      }
      if (best?.id !== d.aim?.id) d.aim = best ? { id: best.id, t: this.time } : null
    }
  }

  /** Was this duck steering at this bubble long enough to have chosen it? (Catching a raft's bubbles after breaking it counts too.) */
  chose(d, it, catching = false) {
    return !d.bot && ((d.aim?.id === it.id && this.time - d.aim.t >= AIM_HOLD) || (catching && it.split === d.id))
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
    // A stuck bubble rides on its lily pad, mama duck or paper boat until a bump knocks it into the water.
    for (const it of this.items.values()) {
      const o = it.stuck != null && this.obstacles[it.stuck]
      if (!o) continue
      it.x = +o.x.toFixed(2)
      it.z = +o.z.toFixed(2)
    }
    if (!authority) return
    if (this.calm) this.aimAll()
    if (this.calm && this.dryOnes()) this.dryT += dt
    this.pickups()
    this.spawning(dt)
    if (this.arena.rain) this.rain(dt)
    if (this.over) return
    if (!this.calm) {
      if (this.time >= ROUND_TIME) this.end()
    } else if (this.jar.length >= this.target) {
      if (this.stage >= this.trip.length - 1) this.end()
      else if (this.between == null) {
        this.between = this.time
        this.emit({ k: 'full', s: this.stage })
      } else if (this.time - this.between > STAGE_PAUSE) {
        this.between = null
        this.setStage(this.stage + 1, true)
        this.emit({ k: 'stage', s: this.stage })
        this.stick()
      }
    }
  }

  end() {
    this.over = true
    this.emit({ k: 'end' })
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
          if (authority) {
            this.emit({ k: 'thud', o: o.i, id: d.id, s: +rel.toFixed(1) })
            for (const it of this.items.values()) if (it.stuck === o.i) this.free(it, d)
          }
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
      // In Pond helpers a splash-out is just fun: nobody scores from it and the team loses nothing.
      if (by && by !== d && !this.calm) {
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
      if (it.stuck != null || (this.between != null && this.sorts(it))) continue
      for (const d of this.ducks) {
        if (d.fly) continue
        const fits = this.counts(it)
        if (this.sorts(it) && (d.leave || (!fits && d.bot))) continue
        const reach = this.radius(d) + ITEMS[it.k].radius
        if ((d.x - it.x) ** 2 + (d.z - it.z) ** 2 > reach * reach) continue
        if (this.sorts(it) && !fits) {
          // Ones wanted and a child dashes into a raft: it breaks into ten single bubbles (a ten is ten ones).
          if (this.splits(it, d)) {
            this.split(it, d)
            break
          }
          // The jar has no space for this one: it bobs gently away and stays on the water. Only a duck
          // steering at it chose it; one brushing past on the way to another just nudges it aside.
          this.nope(it, d, this.chose(d, it))
          break
        }
        this.items.delete(it.id)
        const e = { k: 'got', item: it.id, kind: it.k, id: d.id, x: it.x, z: it.z }
        if (this.sorts(it)) {
          // Into the shared jar, in the first space that wants it.
          e.c = tokenOf(it)
          this.fill(e.c)
          d.score += 1
          d.stats.bubbles++
          e.ok = 1
          e.n = this.jar.length
          e.s = this.stage
          if (this.chose(d, it, true)) {
            d.stats.chosen++
            e.aim = 1
          }
        } else if (it.k === 'bubble') {
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

  /** A bubble the jar can't take bobs away from the duck that touched it, so a careful paddler is quicker than a busy one. */
  nope(it, d, chose = true) {
    if (this.time - (it.nopeT ?? -9) < 0.8) return
    it.nopeT = this.time
    // Away from the duck and out of its path (sideways to the way it is paddling), so it doesn't bump again.
    let dx = it.x - d.x
    let dz = it.z - d.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    const sp = Math.hypot(d.vx, d.vz)
    if (sp > 0.5) {
      const vx = d.vx / sp
      const vz = d.vz / sp
      const along = dx * vx + dz * vz
      let px = dx - along * vx
      let pz = dz - along * vz
      const pl = Math.hypot(px, pz)
      if (pl < 0.2) {
        px = -vz
        pz = vx
      } else {
        px /= pl
        pz /= pl
      }
      dx = px * 0.85 + dx * 0.3
      dz = pz * 0.85 + dz * 0.3
      const l2 = Math.hypot(dx, dz) || 1
      dx /= l2
      dz /= l2
    }
    let x = it.x + dx * NOPE_PUSH
    let z = it.z + dz * NOPE_PUSH
    const dist = Math.hypot(x, z)
    const lim = R - 1.6
    if (dist > lim) {
      x = (x / dist) * lim
      z = (z / dist) * lim
    }
    for (const o of this.obstacles) {
      const ox = x - o.x
      const oz = z - o.z
      const od = Math.hypot(ox, oz) || 1
      if (od < o.r + 0.9) {
        x = o.x + (ox / od) * (o.r + 0.9)
        z = o.z + (oz / od) * (o.r + 0.9)
      }
    }
    it.x = +x.toFixed(2)
    it.z = +z.toFixed(2)
    // A child's careful choosing is what counts: each bubble that didn't fit counts once per duck.
    it.noped ??= new Set()
    if (chose && !it.noped.has(d.id)) {
      it.noped.add(d.id)
      d.stats.nopes++
    }
    this.emit({ k: 'nope', item: it.id, kind: it.k, id: d.id, x: it.x, z: it.z, c: tokenOf(it), ...(chose ? {} : { q: 1 }) })
  }

  /** Can a dash break this raft? Only a child's, only once the tens are in and single bubbles are wanted. */
  splits(it, d) {
    return it.k === 'ten' && !d.bot && d.dashT > 0 && this.goal.kind === 'place' && !this.open.includes('ten') && this.open.includes('any')
  }

  /** A raft breaks into its ten bubbles, in a ring where it was. */
  split(it, d) {
    this.items.delete(it.id)
    d.stats.splits++
    this.emit({ k: 'split', item: it.id, id: d.id, x: it.x, z: it.z })
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      let x = it.x + Math.cos(a) * 1.5
      let z = it.z + Math.sin(a) * 1.5
      const dist = Math.hypot(x, z)
      if (dist > R - 1.2) {
        x = (x / dist) * (R - 1.2)
        z = (z / dist) * (R - 1.2)
      }
      // Breaking the raft was the choice: its bubbles count as chosen for the duck that broke it.
      this.addItem('bubble', { x, z }).split = d.id
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
      for (let i = 0; i < (this.calm ? this.pondSize() : 7); i++) this.calm ? this.calmSpawn(false) : this.addItem('bubble')
      if (this.calm) this.stick()
    }
    const t = this.timers
    for (const k of Object.keys(t)) t[k] -= dt
    const party = this.party
    if (t.bubble <= 0) {
      // The last seconds bring a gentle bubble shower (calm pass: was every 0.18 s, up to 22).
      // Pond helpers: an unhurried trickle, so each bubble in the jar can be seen and counted.
      t.bubble = this.calm ? 3 : party ? 0.35 : 0.55
      if (this.calm && this.between != null) t.bubble = 1 // the team is admiring the full jar: the pond waits too
      else if (this.calm) {
        this.calmSpawn(true)
        // Fewer than two bubbles the jar wants, or a thin pond: the next one comes sooner, so nobody waits long.
        let wanted = 0
        let floating = 0
        for (const it of this.items.values()) {
          if (this.counts(it)) wanted++
          if (this.sorts(it) && it.stuck == null) floating++
        }
        if (wanted < 2 || floating < this.pondSize() - 1) t.bubble = 0.8
      }
      else if (this.count('bubble') < (party ? 16 : 11)) this.addItem('bubble')
    }
    if (t.star <= 0 && !this.calm) {
      t.star = party ? 3 : 6 + Math.random() * 3
      if (this.count('star') < 2) this.addItem('star')
    }
    if (t.gift <= 0) {
      t.gift = 9 + Math.random() * 4
      if (this.count('gift') < 1) this.addItem('gift')
    }
    for (const it of this.items.values()) if (it.stuck != null && this.time - it.born > STUCK_FREE) this.free(it, null)
  }

  /** How many bubbles (and rafts) Pond helpers keeps on the water: place value floats rafts beside singles. */
  pondSize() {
    return this.goal?.kind === 'place' ? 7 : 6
  }

  /**
   * Pond helpers keeps a steady mix on the water: some the jar wants now and some it doesn't, so choosing
   * is the game. Place value keeps about three ten rafts beside four single bubbles the whole trip (tens
   * first, then ones), so grabbing whatever is nearest bounces often. When the pond is full, the oldest
   * one nobody needs drifts away to make room.
   */
  calmSpawn(makeRoom) {
    const floating = [...this.items.values()].filter((it) => this.sorts(it) && it.stuck == null)
    const place = this.goal.kind === 'place'
    const rafts = floating.filter((it) => it.k === 'ten').length
    // Crossing a ten with the single bubbles used up: only rafts float (three, with no churn) until one is broken.
    if (place && !this.open.includes('ten') && this.onesLeft() <= 0) {
      if (rafts < 3) this.addItem('ten', this.nearKid())
      return
    }
    if (floating.length >= this.pondSize()) {
      const old = makeRoom && floating.find((it) => !this.counts(it))
      if (!old) return
      this.items.delete(old.id)
      this.emit({ k: 'fade', item: old.id })
      floating.splice(floating.indexOf(old), 1)
    }
    if (place) {
      const rafts = floating.filter((it) => it.k === 'ten').length
      const ones = floating.length - rafts
      const tensNow = this.open.includes('ten')
      let k = tensNow && rafts < 2 ? 'ten' : !tensNow && ones < (this.goal.regroup ? 2 : 3) ? 'bubble' : rafts < 3 && rafts <= ones - 1 ? 'ten' : 'bubble'
      if (k === 'bubble' && !tensNow && this.onesLeft() <= 0) k = 'ten'
      if (k === 'bubble' && this.scarce != null) this.spared++
      // One the jar can't take now floats up near a child's duck, so grabbing the nearest bounces and
      // looking first (a raft or a single bubble?) is quicker.
      const fits = fitsNow(this.goal, this.open, k === 'ten' ? TEN : -1)
      this.addItem(k, fits ? undefined : this.nearKid())
    } else this.addItem('bubble')
  }

  /**
   * A place near a child's duck, off to one side of where it is paddling (never in its path, so a careful
   * paddler heading for a bubble that fits glides past), clear of the rim and the obstacles (or none, for anywhere).
   */
  nearKid() {
    const kids = this.ducks.filter((d) => !d.bot && !d.fly)
    const d = kids[Math.floor(Math.random() * kids.length)]
    if (!d) return undefined
    const sp = Math.hypot(d.vx, d.vz)
    const ahead = sp > 0.5 ? Math.atan2(d.vz, d.vx) : Math.random() * Math.PI * 2
    for (let tries = 0; tries < 8; tries++) {
      const a = ahead + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.9)
      const r = 2.6 + Math.random() * 1.4
      const x = d.x + Math.cos(a) * r
      const z = d.z + Math.sin(a) * r
      if (Math.hypot(x, z) > R - 1.6) continue
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1)) continue
      if ([...this.items.values()].some((it) => Math.hypot(it.x - x, it.z - z) < 1.2)) continue
      return { x, z }
    }
    return undefined
  }

  /**
   * One bubble the jar wants starts stuck on a lily pad, the mama duck or a paper boat: a bonk or a dash
   * into it knocks it into the water. Bumping is how the team frees it (or it floats free after a while).
   */
  stick() {
    if (!this.calm || !this.obstacles.length) return
    for (const it of this.items.values()) if (it.stuck != null) return
    const o = this.obstacles[Math.floor(Math.random() * this.obstacles.length)]
    const k = this.goal.kind === 'place' && this.open.includes('ten') ? 'ten' : 'bubble'
    // On a crossing step the stuck one is one of the scarce single bubbles.
    if (k === 'bubble' && this.scarce != null) this.spared++
    this.addItem(k, { x: o.x, z: o.z }, o.i)
  }

  /** A bump knocked a stuck bubble off: it drops into the water beside the obstacle, to one side of the duck. */
  free(it, d) {
    const o = this.obstacles[it.stuck]
    delete it.stuck
    let nx = d ? d.x - o.x : 1
    let nz = d ? d.z - o.z : 0
    const len = Math.hypot(nx, nz) || 1
    const side = Math.random() < 0.5 ? -1 : 1
    // Sideways from the bump, so it lands where the duck can see it and turn to it.
    let x = o.x + ((nx / len) * 0.4 + (-nz / len) * side) * (o.r + 1.3)
    let z = o.z + ((nz / len) * 0.4 + (nx / len) * side) * (o.r + 1.3)
    const dist = Math.hypot(x, z)
    if (dist > R - 1.6) {
      x = (x / dist) * (R - 1.6)
      z = (z / dist) * (R - 1.6)
    }
    it.x = +x.toFixed(2)
    it.z = +z.toFixed(2)
    it.born = this.time
    this.emit({ k: 'free', item: it.id, id: d?.id ?? null, x: it.x, z: it.z, o: o.i })
  }

  addItem(k, at, stuck = null) {
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
    const it = { id: this.nextItem++, k, x: +x.toFixed(2), z: +z.toFixed(2), born: this.time }
    if (this.calm && k === 'bubble') it.c = this.bubbleColour()
    if (stuck != null) it.stuck = stuck
    this.items.set(it.id, it)
    const e = { k: 'item', item: it.id, kind: k, x: it.x, z: it.z }
    if (it.c != null) e.c = it.c
    if (stuck != null) e.s = stuck
    this.emit(e)
    return it
  }

  /** Colour goals keep two or so of the colours still wanted on the water; the rest are other colours. */
  bubbleColour() {
    const n = BUBBLE_COLOURS.length
    // A free bond wants whichever colours can still finish a new way (any colour, before the first).
    const wanted = this.goal?.free
      ? [...Array(n).keys()].filter((c) => freeBondFits(this.goal.n, this.jar, c, this.used))
      : [...new Set(this.open.filter((w) => Number.isInteger(w)))]
    if (!wanted.length || wanted.length === n) return Math.floor(Math.random() * n)
    let have = 0
    for (const it of this.items.values()) if (it.k === 'bubble' && wanted.includes(it.c)) have++
    if (have < 2 || Math.random() < 0.3) return wanted[Math.floor(Math.random() * wanted.length)]
    const others = [...Array(n).keys()].filter((c) => !wanted.includes(c))
    return others.length ? others[Math.floor(Math.random() * others.length)] : wanted[0]
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
        this.items.set(e.item, { id: e.item, k: e.kind, x: e.x, z: e.z, ...(Number.isInteger(e.c) ? { c: e.c } : {}), ...(Number.isInteger(e.s) && this.obstacles[e.s] ? { stuck: e.s } : {}) })
        this.nextItem = Math.max(this.nextItem, e.item + 1)
        break
      case 'got':
        this.items.delete(e.item)
        // The jar follows the authority's count; a missed event is filled in by the next item sync.
        if (this.calm && e.ok && (e.s ?? this.stage) === this.stage && Number.isInteger(e.n) && e.n > this.jar.length && e.n <= this.target) {
          while (this.jar.length < e.n - 1) this.fill(-1)
          this.fill(Number.isInteger(e.c) ? e.c : -1)
        }
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
      case 'nope': {
        const it = this.items.get(e.item)
        if (it && Number.isFinite(e.x) && Number.isFinite(e.z)) {
          it.x = e.x
          it.z = e.z
        }
        break
      }
      case 'fade':
      case 'split':
        this.items.delete(e.item)
        break
      case 'free': {
        const it = this.items.get(e.item)
        if (it && Number.isFinite(e.x) && Number.isFinite(e.z)) {
          delete it.stuck
          it.x = e.x
          it.z = e.z
        }
        break
      }
      case 'full':
        if (this.calm) this.between = this.time
        break
      case 'stage':
        if (this.calm && Number.isInteger(e.s)) this.goTo(e.s)
        break
      case 'drop':
        this.splashPush(e.x, e.z)
        break
      case 'powerEnd':
        if (d && d.power === e.p) d.power = null
        break
    }
  }

  /** Moves on to the authority's stage of the trip (a device that missed a 'stage' event catches up). */
  goTo(s) {
    if (!Number.isInteger(s) || s <= this.stage || s >= this.trip.length) return false
    while (this.stage < s) this.setStage(this.stage + 1)
    this.between = null
    return true
  }

  /** The item list, so a device that missed something catches up: [id, kind, x, z, colour, stuck on]. */
  itemList() {
    return [...this.items.values()].map((it) => {
      const row = [it.id, it.k, it.x, it.z]
      if (it.c != null || it.stuck != null) row.push(it.c ?? null)
      if (it.stuck != null) row.push(it.stuck)
      return row
    })
  }

  /** Takes the authority's jar (colours in order), so every device shows the same frames. */
  syncJar(list) {
    if (!this.calm || !Array.isArray(list) || list.length > this.target) return false
    if (list.length < this.jar.length) return false
    const before = this.jar.join()
    const tokens = list.map((c) => (c === TEN || (Number.isInteger(c) && c >= 0 && c < BUBBLE_COLOURS.length) ? c : -1))
    this.jar = []
    this.open = this.slots.slice()
    for (const t of tokens) this.fill(t)
    return this.jar.join() !== before
  }

  syncItems(list) {
    if (!Array.isArray(list)) return { added: [], removed: [] }
    const keep = new Set()
    const added = []
    for (const row of list) {
      if (!Array.isArray(row)) continue
      const [id, k, x, z, c, s] = row
      if (!ITEMS[k]) continue
      keep.add(id)
      const known = this.items.get(id)
      const stuck = Number.isInteger(s) && this.obstacles[s] ? s : null
      if (known) {
        if (stuck == null) delete known.stuck
        else known.stuck = stuck
        // A bubble that bobbed away while its event was lost moves to where it is now.
        if (Number.isFinite(x) && Number.isFinite(z)) {
          known.x = x
          known.z = z
        }
      } else {
        const it = { id, k, x, z }
        if (Number.isInteger(c)) it.c = c
        if (stuck != null) it.stuck = stuck
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
