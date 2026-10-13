import { clamp, damp, wrap } from './util.js'

/** Easy mode: metres ahead of the last child before a bot starts to ease off (so a child at the back still races among cars). */
const EASY_EASE = 40

/**
 * Computer drivers. Racing, they chase a point a little way down the road,
 * slow for bends and line up for ramps. Smashing, they hunt the nearest car.
 * Either way, a bot that gets wedged backs out and tries again.
 */
export class Bot {
  constructor(car, track, skill = 0.8, seed = 1) {
    this.car = car
    this.track = track
    this.skill = skill
    this.lane = ((seed % 5) - 2) * 0.6
    this.stuck = 0
    this.reverse = 0
    /** Sideways shift to steer round other cars (see dodge). */
    this.offset = 0
  }

  /**
   * Sets the car's controls for this physics step.
   * @param proj where the car is on the road (from the race's progress tracking)
   * @param prey in Smash mode, the car to chase (or null to race)
   * @param lead metres this bot is ahead of the last human (negative: behind).
   *   Bots ease off when well ahead and push when far behind, so a race stays
   *   a race: a slip costs a child a place or two, never the whole race.
   * @param child in Easy mode, the child's car: a bot passes a child who has
   *   stopped slowly, along the far edge (see politeness).
   */
  update(dt, proj, prey = null, lead = 0, others = [], child = null) {
    const car = this.car
    let target, look, ramp
    if (prey) {
      target = { x: prey.body.position.x, z: prey.body.position.z }
    } else {
      // Line up with a ramp coming up (jumping is the fun part), otherwise keep to our lane. A ramp counts until the
      // bot is past its far end: a bot beside it must not turn back across it into its side.
      const L = this.track.length
      ramp = this.track.ramps.find((r) => wrap(r.dist + r.half + 4 - proj.dist, L) < 64 + r.half)
      const toRamp = ramp ? wrap(ramp.dist + ramp.half + 4 - proj.dist, L) - ramp.half - 4 : 0
      // Too close to line up any more and not on its line: drive on past it, along the side it is already on.
      const room = this.track.width / 2 - 1.6
      // A small kicker (not a jump) is driven round, on the side with more road: taken at racing speed it threw the
      // bot against the wall beyond it.
      const kicker = ramp && ramp.half < 8
      const beside = !kicker && ramp && toRamp < ramp.half + 8 && Math.abs(proj.lateral - ramp.lateral) > ramp.width / 2 - 0.4 && car.grounded
      if (beside) ramp = null
      let passLane = beside ? clamp(proj.lateral, -room, room) : 0
      if (kicker) {
        const wide = this.track.width / 2 - 1.2
        const left = ramp.lateral - ramp.width / 2 - 1.5, right = ramp.lateral + ramp.width / 2 + 1.5
        passLane = Math.abs(clamp(left, -wide, wide) - left) <= Math.abs(clamp(right, -wide, wide) - right) ? clamp(left, -wide, wide) : clamp(right, -wide, wide)
        ramp = null
      }
      // Each bot keeps its own line across the ramp, so they jump side by side instead of piling up.
      const polite = child && child !== car ? this.politeness(dt, proj, child) : null
      const lane = beside || kicker
        ? passLane
        : polite?.lane != null
          ? polite.lane
          : ramp
            ? ramp.lateral + clamp(this.lane, -(ramp.width / 2 - 1.2), ramp.width / 2 - 1.2)
            : this.lane + this.dodge(dt, proj, others)
      this.polite = polite
      // Racing bots look fairly close in (as the child's steering helper does), so bends are followed, not cut against the kerb.
      look = ramp || kicker ? 6 + car.speed * 0.4 : 8 + car.speed * 0.6
      const s = this.track.sampleAt(proj.dist + look)
      target = { x: s.p.x + s.side.x * lane, z: s.p.z + s.side.z * lane }
      // Lining up for a ramp or round a kicker, the sideways gap itself also pulls the wheel: aiming down a bend alone
      // left bots drifting wide, onto the ramp's edge.
      // Elsewhere a gentler pull keeps the bot on its line round a bend instead of drifting wide into the kerb.
      this.across = ramp || kicker ? clamp((lane - proj.lateral) * 0.3, -0.4, 0.4) : clamp((lane - proj.lateral) * 0.15, -0.25, 0.25)
    }
    const angle = car.angleTo(target.x, target.z)
    if (this.unstick(dt, angle)) return

    if (prey) {
      car.controls = { steer: clamp(angle * 2.5, -1, 1), throttle: 1, brake: 0 }
      // Lined up and close: hit the turbo. Gently does it is not the point here (but never in Easy mode).
      if (!this.calm && Math.abs(angle) < 0.2 && prey.body.position.distanceTo(car.body.position) < 45 && Math.random() < 0.05) car.boost()
      return
    }
    const bend = this.track.bendAhead(proj.dist, look)
    let safe
    if (this.pace) {
      // Easy mode: a real race at the child's own calm cruise. Each bot has its own pace (a touch either side of the
      // child's), slows for bends the way the child's car does, and never takes a ramp faster than its pace.
      safe = clamp(this.pace - bend * 35, 9, this.pace)
      // Lined up for a ramp: the same run-up speed as the child's car (see JUMP_SPEED in main.js), so it clears the gap.
      if (ramp && ramp.half >= 8 && Math.abs(angle) < 0.25) safe = Math.max(safe, this.jumpSpeed ?? 24)
      // A rubber band that keeps a race a race without undoing the gates:
      // - more than 40 m ahead of the last child a bot eases off, down to 85% by 140 m, so a child at the back (one who
      //   ignores the gates, or steers wildly) still races among cars, and still loses;
      // - 10–90 m behind a leading child a bot pushes 7% harder, so a lead is something to defend and has to be
      //   re-earned at each gate (a careful child's race ends in more photo finishes);
      // - further back, up to 12% quicker. Never a burst you can see.
      if (lead > EASY_EASE && !ramp) safe *= clamp(1 - (lead - EASY_EASE) / 670, 0.85, 1)
      else if (lead < -10 && lead >= -90) safe *= 1.07
      else if (lead < -90) safe *= clamp(1.07 + (-lead - 90) / 1000, 1, 1.12)
    } else {
      // Lined up for a jump, go for it (a slow take-off falls short), but not flat out: at 40 m/s a bot overshot the
      // landing into the next bend. A small kicker is taken at the usual speed.
      safe = clamp(30 * this.skill - bend * 60, 9, 32)
      if (ramp && ramp.half >= 8 && Math.abs(angle) < 0.25) safe = Math.max(safe, 28)
      // Rubber band: well ahead, cruise slower (never on a ramp: falling short isn't fun to watch).
      if (!ramp && lead > 20) safe *= clamp(1 - (lead - 20) / 160, 0.55, 1)
      else if (lead < -40) {
        safe = Math.max(safe, 31)
        // Far behind on a straight: turbo bursts to catch up (more often the further behind).
        if (!this.calm && bend < 0.05 && Math.abs(angle) < 0.15 && !car.turboActive && Math.random() < clamp((-lead - 40) / 4000, 0, 0.04)) car.boost({ free: true, seconds: 1.2 })
      }
    }
    // Easy mode: passing a child who has stopped, slowly; or not riding just behind the child, where the camera is.
    if (this.polite?.cap != null) safe = Math.min(safe, this.polite.cap)
    if (this.polite?.floor != null) safe = Math.max(safe, this.polite.floor)
    // A robot never gains speed from being pushed (a boosted child behind it): past its own speed it is trimmed back
    // after the physics step (see main.js).
    car.speedCap = safe + 1.5
    car.controls = {
      steer: clamp(angle * 2.2 + (this.across ?? 0), -1, 1),
      throttle: car.speed < safe ? 1 : 0.2,
      brake: car.speed > safe + (this.pace ? 3 : 6) ? 0.6 : 0,
    }
  }

  /**
   * Sideways shift (metres) that steers around a car alongside or just ahead,
   * so bots pass instead of grinding against a child's car for seconds on end.
   */
  dodge(dt, proj, others) {
    const s = this.track.sampleAt(proj.dist)
    const me = this.car.body.position
    let want = 0
    for (const other of others) {
      if (other === this.car) continue
      const dx = other.body.position.x - me.x, dz = other.body.position.z - me.z
      const along = dx * s.t.x + dz * s.t.z
      const side = dx * s.side.x + dz * s.side.z
      // A quicker car close behind (a boosted child): move aside and let it by.
      if (along < -1 && along > -7 && Math.abs(side) < 2.5 && other.speed > this.car.speed + 1) {
        const theirs = proj.lateral + side
        want = theirs + (theirs > 0 ? -1 : 1) * 2.9 - this.lane
        break
      }
      if (along < -3 || along > 24 || Math.abs(side) > 3.6) continue
      // Pass on whichever side of the other car has more road, about 2.9 m out from it.
      const theirs = proj.lateral + side
      const away = Math.abs(side) > 0.4 ? -Math.sign(side) : theirs > 0 ? -1 : 1
      want = theirs + away * 2.9 - this.lane
      break
    }
    // Room to pass on a narrow road (a car in the middle leaves just enough either side), but off the kerb itself.
    const room = this.track.width / 2 - 1.3
    want = clamp(this.lane + want, -room, room) - this.lane
    this.offset = damp(this.offset, want, 2.5, dt)
    return this.offset
  }

  /**
   * Easy mode's manners round the child's car. The bots race the child for real
   * (they pass, and are passed); dodge() steers them round a car alongside. Only
   * a child who has stopped (reading a gate, stuck on a kerb) is passed slowly
   * along the far edge of the road, so a stopped car is never shunted.
   */
  politeness(dt, proj, child) {
    const s = this.track.sampleAt(proj.dist)
    const me = this.car.body.position
    const dx = child.body.position.x - me.x, dz = child.body.position.z - me.z
    const along = dx * s.t.x + dz * s.t.z // > 0: the child is ahead of this bot
    const side = dx * s.side.x + dz * s.side.z
    const edge = this.track.width / 2 - 1.4
    const farSide = (proj.lateral + side >= 0 ? -1 : 1) * edge
    if (child.speed <= 4 && this.easy) {
      if (Math.abs(side) > 6 || along <= -1 || along >= 24) return null
      return { cap: 9, lane: farSide }
    }
    // Just behind the moving child is where the camera rides: a bot does not sit there (in Easy or not, a ghost or
    // not). Measured from the child and from the camera itself. After a moment it either goes past wide (if it is the
    // quicker) or drops back.
    const behindChild = (along > 2 && along < 11 && Math.abs(side) < 4) || (this.camDist ?? 99) < 6
    this.nearCamera = behindChild ? (this.nearCamera ?? 0) + dt : 0
    // Once decided, it sticks: going past until it is ahead of the child, or dropping back until 15 m behind.
    if (this.making === 'pass' && (along < -2 || Math.abs(side) > 6)) this.making = null
    if (this.making === 'drop' && (along > 15 || along < 0)) this.making = null
    if (!this.making && this.nearCamera > 0.6) this.making = (this.pace ?? this.car.speed) > child.speed + 0.5 && along > 0 ? 'pass' : 'drop'
    if (this.making === 'pass') return { lane: farSide, floor: child.speed + 3 }
    if (this.making === 'drop') return { cap: Math.max(6, child.speed - 3) }
    return null
  }

  /** Backs out for a moment after being stuck; returns true while reversing. */
  unstick(dt, angle) {
    if (this.reverse > 0) {
      this.reverse -= dt
      // A firm reverse (as Easy mode backs the child's car out), swinging the nose towards the road.
      this.car.controls = { steer: -Math.sign(angle), throttle: 0, brake: 2.5 }
      return true
    }
    this.stuck = this.car.speed < 1.5 ? this.stuck + dt : 0
    if (this.stuck > 1) {
      this.stuck = 0
      this.reverse = 1.2
    }
    return false
  }

  /** The nearest other car within hunting range, or null. */
  static nearest(car, cars, range = 160) {
    let prey = null, best = range
    for (const other of cars) {
      if (other === car) continue
      const d = other.body.position.distanceTo(car.body.position)
      if (d < best) {
        best = d
        prey = other
      }
    }
    return prey
  }
}
