import { clamp, wrap } from './util.js'

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
  }

  /**
   * Sets the car's controls for this physics step.
   * @param proj where the car is on the road (from the race's progress tracking)
   * @param prey in Smash mode, the car to chase (or null to race)
   */
  update(dt, proj, prey = null) {
    const car = this.car
    let target, look
    if (prey) {
      target = { x: prey.body.position.x, z: prey.body.position.z }
    } else {
      // Line up with a ramp coming up (jumping is the fun part), otherwise keep to our lane.
      const ramp = this.track.ramps.find((r) => wrap(r.dist - proj.dist, this.track.length) < 60)
      const lane = ramp ? ramp.lateral : this.lane
      look = ramp ? 6 + car.speed * 0.4 : 9 + car.speed * 0.9
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
    // How sharply the road ahead bends decides the safe speed.
    const bend = this.track.bendAt(proj.dist + look * 1.5, look * 0.5)
    const safe = clamp(30 * this.skill - bend * 60, 9, 32)
    car.controls = {
      steer: clamp(angle * 2.2, -1, 1),
      throttle: car.speed < safe ? 1 : 0.2,
      brake: car.speed > safe + 6 ? 0.6 : 0,
    }
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
