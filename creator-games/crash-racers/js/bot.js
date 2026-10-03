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

  think(dt) {
    const car = this.car
    const pos = car.body.position
    const proj = this.track.project(pos, this.hint)
    this.hint = proj.index
    const speed = car.speed
    const look = 9 + speed * 0.9
    const target = this.track.sampleAt(proj.dist + look)
    // Line up with a ramp coming up (jumping is the fun part), otherwise keep to our lane.
    let lane = this.lane
    for (const ramp of this.track.ramps) {
      const ahead = (ramp.dist - proj.dist + this.track.length) % this.track.length
      if (ahead < look * 2.5 + 10) lane = ramp.lateral
    }
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
