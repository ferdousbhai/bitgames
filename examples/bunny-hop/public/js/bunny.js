import * as THREE from 'three'
import { clamp } from './util.js'

export const GRAVITY = 30
export const HOP = 11.5 // first hop: about 2.2 high, 0.77 s in the air
const DOUBLE_HOP = 10
const COYOTE = 0.12 // a hop still works just after running off the ground
const BUFFER = 0.16 // a tap just before landing hops on landing

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * Pip the bunny: hop physics plus all the life — squash and stretch, floppy
 * ears on springs, kicking legs, blinking, a flip on the double hop and a
 * tumble when bumping into something.
 *
 *   root (on the path) > squash (scales about the feet) > spin (turns about the
 *   middle) > face (turned a little towards the camera) > the Blender model
 */
export class Bunny {
  constructor(model) {
    this.root = new THREE.Group()
    this.squash = new THREE.Group()
    this.spin = new THREE.Group()
    this.spin.position.y = 0.65
    this.face = new THREE.Group()
    this.face.position.y = -0.65
    this.face.rotation.y = -0.45
    this.root.add(this.squash)
    this.squash.add(this.spin)
    this.spin.add(this.face)
    this.face.add(model)
    const part = (name) => {
      const o = model.getObjectByName(name)
      o.userData.rest = o.rotation.clone()
      return o
    }
    this.p = {
      head: part('bunny_head'),
      eyes: part('bunny_eyes'),
      earL: part('bunny_ear_L'),
      earR: part('bunny_ear_R'),
      armL: part('bunny_arm_L'),
      armR: part('bunny_arm_R'),
      legL: part('bunny_leg_L'),
      legR: part('bunny_leg_R'),
      tail: part('bunny_tail'),
    }
    this.reset()
  }

  reset() {
    this.y = 0
    this.vy = 0
    this.grounded = true
    this.jumps = 0
    this.sinceGround = 0
    this.buffered = 0
    this.s = 0
    this.sv = 0
    this.ear = [0, 0]
    this.earV = [0, 0]
    this.flipT = 1
    this.tumbleT = 1
    this.munchT = 1
    this.dizzy = 0
    this.blink = 2
    this.time = 0
    this.runPhase = 0
    this.idleHop = 2
    this.lookAtCamera = 0
    this.spin.rotation.z = 0
  }

  /** Returns 'hop', 'double' or null (a tap buffered until landing). */
  hop() {
    if (this.tumbleT < 0.6) return null
    if (this.grounded || this.sinceGround < COYOTE) {
      this.vy = HOP
      this.grounded = false
      this.jumps = 1
      this.sinceGround = 1
      this.sv += 5
      return 'hop'
    }
    if (this.jumps < 2) {
      this.vy = DOUBLE_HOP
      this.jumps = 2
      this.flipT = 0
      this.sv += 4
      return 'double'
    }
    this.buffered = BUFFER
    return null
  }

  bonk() {
    this.vy = 8
    this.grounded = false
    this.jumps = 2
    this.tumbleT = 0
    this.flipT = 1
    this.dizzy = 1.6
    this.sv -= 3
  }

  munch() {
    this.munchT = 0
  }

  /**
   * mode: 'menu' (idling), 'run' or 'home' (celebrating). Returns the landing
   * speed when the bunny touches down this frame, else 0.
   */
  update(dt, speed, mode) {
    this.time += dt
    let landed = 0

    // Little happy hops on the menu and at home
    if (mode !== 'run' && this.grounded) {
      this.idleHop -= dt
      if (this.idleHop <= 0) {
        this.idleHop = mode === 'home' ? 0.15 + Math.random() * 0.3 : 2 + Math.random() * 3
        this.vy = mode === 'home' ? 9 : 6
        this.grounded = false
        this.jumps = 1
        this.sv += 3
        if (mode === 'home' && Math.random() < 0.4) this.flipT = 0
      }
    }

    // Physics
    if (!this.grounded) {
      this.vy -= GRAVITY * dt
      this.y += this.vy * dt
      if (this.y <= 0) {
        landed = -this.vy
        this.y = 0
        this.vy = 0
        this.grounded = true
        this.jumps = 0
        this.sinceGround = 0
        this.sv -= 2 + Math.min(1, landed / 12) * 5
        if (this.buffered > 0 && mode === 'run') {
          this.buffered = 0
          this.hop()
          landed = -landed // signal: landed and hopped again at once
        }
      }
    } else {
      this.sinceGround += dt
    }
    this.buffered = Math.max(0, this.buffered - dt)

    // Squash and stretch: a damped spring, stretched by speed in the air
    const target = this.grounded ? 0 : clamp(this.vy * 0.022, -0.12, 0.24)
    this.sv += ((target - this.s) * 220 - this.sv * 14) * dt
    this.s += this.sv * dt
    const s = clamp(this.s, -0.35, 0.4)

    // Running skips: bunnies bound along with tiny hops
    const running = mode === 'run' && this.grounded && speed > 0.5
    this.runPhase += dt * (running ? speed * 1.7 : 0)
    const skip = running ? Math.abs(Math.sin(this.runPhase)) * 0.13 : 0
    const skipSquash = running ? (Math.abs(Math.sin(this.runPhase)) < 0.25 ? -0.05 : 0.02) : 0

    this.root.position.y = this.y + skip
    this.squash.scale.set(1 - (s + skipSquash) * 0.5, 1 + s + skipSquash, 1 - (s + skipSquash) * 0.5)

    // Flip (double hop) and tumble (bump)
    this.flipT = Math.min(1, this.flipT + dt / 0.5)
    this.tumbleT = Math.min(1, this.tumbleT + dt / 0.7)
    let spin = 0
    if (this.flipT < 1) spin = -Math.PI * 2 * ease(this.flipT)
    if (this.tumbleT < 1) spin = Math.PI * 2 * ease(this.tumbleT)
    this.spin.rotation.z = spin

    // Turn to face the camera on the menu and at home
    const look = mode === 'run' ? 0 : 1
    this.lookAtCamera = THREE.MathUtils.damp(this.lookAtCamera, look, 4, dt)
    this.face.rotation.y = -0.45 - this.lookAtCamera * 0.75

    const p = this.p
    // Ears trail behind when rising and float up when falling, each on its own spring
    // (a positive turn about Z tips an ear backwards)
    for (let i = 0; i < 2; i++) {
      const flop = running ? Math.sin(this.runPhase * 2 + i * 0.7) * 0.18 : 0
      const twitch = mode === 'menu' && Math.sin(this.time * 1.3 + i * 2) > 0.97 ? 0.4 : 0
      const target = clamp(this.vy * 0.045, -0.6, 0.7) + flop - twitch + (this.dizzy > 0 ? 0.5 : 0)
      this.earV[i] += ((target - this.ear[i]) * (90 + i * 25) - this.earV[i] * 7) * dt
      this.ear[i] += this.earV[i] * dt
    }
    p.earL.rotation.z = p.earL.userData.rest.z + this.ear[0]
    p.earR.rotation.z = p.earR.userData.rest.z + this.ear[1]
    p.earL.rotation.x = p.earL.userData.rest.x + this.ear[0] * 0.25
    p.earR.rotation.x = p.earR.userData.rest.x - this.ear[1] * 0.25

    // Legs kick back on take-off and tuck under on the way down; paws reach forward
    let leg = 0
    let arm = 0
    if (!this.grounded) {
      leg = this.vy > 0 ? -0.9 * clamp(this.vy / 10, 0, 1) : 0.5 * clamp(-this.vy / 10, 0, 1)
      arm = 0.7
    } else if (running) {
      leg = -Math.cos(this.runPhase * 2) * 0.45
      arm = Math.cos(this.runPhase * 2) * 0.4
    }
    p.legL.rotation.z = p.legL.userData.rest.z + leg
    p.legR.rotation.z = p.legR.userData.rest.z + leg * 0.92
    p.armL.rotation.z = p.armL.userData.rest.z + arm
    p.armR.rotation.z = p.armR.userData.rest.z + arm * 0.9

    // Head: tilts with the hop, nods while munching, wobbles when dizzy
    this.munchT = Math.min(1, this.munchT + dt / 0.35)
    this.dizzy = Math.max(0, this.dizzy - dt)
    const nod = this.munchT < 1 ? Math.sin(this.munchT * Math.PI * 3) * 0.2 * (1 - this.munchT) : 0
    const idleLook = mode === 'menu' ? Math.sin(this.time * 0.7) * 0.15 : 0
    p.head.rotation.z = p.head.userData.rest.z + clamp(this.vy * 0.012, -0.15, 0.15) - nod
    p.head.rotation.x = p.head.userData.rest.x + (this.dizzy > 0 ? Math.sin(this.time * 12) * 0.15 * this.dizzy : 0) + idleLook
    p.tail.rotation.y = p.tail.userData.rest.y + Math.sin(this.time * (running ? 14 : 4)) * 0.3

    // Blink every few seconds
    this.blink -= dt
    if (this.blink < -0.12) this.blink = 1.5 + Math.random() * 3.5
    p.eyes.scale.y = this.blink < 0 || this.dizzy > 0.8 ? 0.15 : 1

    return landed
  }
}
