import { clamp, damp, wrap } from './util.js'

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
   *   Bots ease off when well ahead and push when far behind, so a young
   *   child in Easy mode still races in the pack.
   */
  update(dt, proj, prey = null, lead = 0, others = []) {
    const car = this.car
    let target, look, ramp
    if (prey) {
      target = { x: prey.body.position.x, z: prey.body.position.z }
    } else {
      // Line up with a ramp coming up (jumping is the fun part), otherwise keep to our lane.
      ramp = this.track.ramps.find((r) => wrap(r.dist - proj.dist, this.track.length) < 60)
      // Each bot keeps its own line across the ramp, so they jump side by side instead of piling up.
      const lane = ramp
        ? ramp.lateral + clamp(this.lane, -(ramp.width / 2 - 1.2), ramp.width / 2 - 1.2)
        : this.lane + this.dodge(dt, proj, others)
      look = ramp ? 6 + car.speed * 0.4 : this.track.lookAhead(car.speed)
      const s = this.track.sampleAt(proj.dist + look)
      target = { x: s.p.x + s.side.x * lane, z: s.p.z + s.side.z * lane }
    }
    const angle = car.angleTo(target.x, target.z)
    if (this.unstick(dt, angle)) return

    if (prey) {
      car.controls = { steer: clamp(angle * 2.5, -1, 1), throttle: 1, brake: 0 }
      // Lined up and close: hit the turbo. Gently does it is not the point here.
      if (Math.abs(angle) < 0.2 && prey.body.position.distanceTo(car.body.position) < 45 && Math.random() < 0.05) car.boost()
      return
    }
    const bend = this.track.bendAhead(proj.dist, look)
    // Lined up for a ramp, go for it: ramps sit on straight road, and a slow take-off falls short.
    let safe = ramp && Math.abs(angle) < 0.25 ? 40 : clamp(30 * this.skill - bend * 60, 9, 32)
    // Rubber band: well ahead, cruise slower (never on a ramp: falling short isn't fun to watch).
    if (!ramp && lead > 20) safe *= clamp(1 - (lead - 20) / 160, 0.55, 1)
    else if (lead < -40) {
      safe = Math.max(safe, 31)
      // Far behind on a straight: turbo bursts to catch up (more often the further behind).
      if (bend < 0.05 && Math.abs(angle) < 0.15 && !car.turboActive && Math.random() < clamp((-lead - 40) / 4000, 0, 0.04)) car.boost({ free: true, seconds: 1.2 })
    }
    car.controls = {
      steer: clamp(angle * 2.2, -1, 1),
      throttle: car.speed < safe ? 1 : 0.2,
      brake: car.speed > safe + 6 ? 0.6 : 0,
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
      if (along < -2 || along > 12 || Math.abs(side) > 3.2) continue
      // Move to whichever side of the other car has more road.
      const away = Math.abs(side) > 0.4 ? -Math.sign(side) : proj.lateral > 0 ? -1 : 1
      want = away * 3.4
      break
    }
    const room = this.track.width / 2 - 1.4
    want = clamp(this.lane + want, -room, room) - this.lane
    this.offset = damp(this.offset, want, 2.5, dt)
    return this.offset
  }

  /** Backs out for a moment after being stuck; returns true while reversing. */
  unstick(dt, angle) {
    if (this.reverse > 0) {
      this.reverse -= dt
      this.car.controls = { steer: -Math.sign(angle), throttle: 0, brake: 1 }
      return true
    }
    this.stuck = this.car.speed < 1.5 ? this.stuck + dt : 0
    if (this.stuck > 1.6) {
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
