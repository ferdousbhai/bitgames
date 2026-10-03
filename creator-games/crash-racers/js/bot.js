import * as CANNON from 'cannon'
import { clamp } from './util.js'

const NOSE = new CANNON.Vec3(0, 0, -1)

/**
 * Computer drivers: chase a point a little way down the road, slow for bends,
 * and occasionally get a bit too brave, because crashes are the fun part.
 */
export class Bot {
  constructor(car, track, skill = 0.8, seed = 1) {
    this.car = car
    this.track = track
    this.skill = skill
    this.lane = ((seed % 5) - 2) * 0.6
    this.hint = -1
    this.stuck = 0
    this.reverse = 0
  }

  /** In Smash mode, chase the nearest car instead of racing. */
  hunt(dt, cars) {
    const car = this.car
    const pos = car.body.position
    let prey = null, best = 160
    for (const other of cars) {
      if (other === car) continue
      const d = other.body.position.distanceTo(pos)
      if (d < best) {
        best = d
        prey = other
      }
    }
    if (!prey) return this.think(dt)
    const fwd = car.body.quaternion.vmult(NOSE)
    const dx = prey.body.position.x - pos.x, dz = prey.body.position.z - pos.z
    const angle = Math.atan2(fwd.x * dz - fwd.z * dx, fwd.x * dx + fwd.z * dz)
    if (car.speed < 1.5) this.stuck += dt
    else this.stuck = 0
    if (this.reverse > 0 || this.stuck > 1.6) {
      this.stuck = 0
      this.reverse = Math.max(0, (this.reverse || 1.2) - dt)
      car.controls = { steer: -Math.sign(angle), throttle: 0, brake: 1 }
      return
    }
    car.controls = { steer: clamp(angle * 2.5, -1, 1), throttle: 1, brake: 0 }
    // Lined up and close: hit the turbo. Gently does it is not the point here.
    if (Math.abs(angle) < 0.2 && best < 45 && Math.random() < 0.05) car.boost()
  }

  think(dt) {
    const car = this.car
    const pos = car.body.position
    const proj = this.track.project(pos, this.hint)
    this.hint = proj.index
    const speed = car.speed
    // Line up with a ramp coming up (jumping is the fun part), otherwise keep to our lane.
    let lane = this.lane
    let nearRamp = false
    for (const ramp of this.track.ramps) {
      const ahead = (ramp.dist - proj.dist + this.track.length) % this.track.length
      if (ahead < 60) {
        lane = ramp.lateral
        nearRamp = true
      }
    }
    const look = nearRamp ? 6 + speed * 0.4 : 9 + speed * 0.9
    const target = this.track.sampleAt(proj.dist + look)
    const tx = target.p.x + target.side.x * lane
    const tz = target.p.z + target.side.z * lane
    // Angle between the car's nose and the target.
    const fwd = car.body.quaternion.vmult(NOSE)
    const dx = tx - pos.x, dz = tz - pos.z
    const angle = Math.atan2(fwd.x * dz - fwd.z * dx, fwd.x * dx + fwd.z * dz)
    // How sharp the road ahead bends decides the safe speed.
    const far = this.track.sampleAt(proj.dist + look * 2)
    const bend = 1 - Math.abs(target.t.x * far.t.x + target.t.z * far.t.z)
    const safe = clamp(30 * this.skill - bend * 60, 9, 32)

    if (this.reverse > 0) {
      this.reverse -= dt
      car.controls = { steer: -Math.sign(angle), throttle: 0, brake: 1 }
      return
    }
    if (speed < 1.5) this.stuck += dt
    else this.stuck = 0
    if (this.stuck > 1.6) {
      this.stuck = 0
      this.reverse = 1.2
    }
    car.controls = {
      steer: clamp(angle * 2.2, -1, 1),
      throttle: speed < safe ? 1 : 0.2,
      brake: speed > safe + 6 ? 0.6 : 0,
    }
  }
}
