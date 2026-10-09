import * as THREE from 'three'
import { MIXES, SEAT_PAINT } from './paint.js'
import { angleDiff, canvasTexture, clamp, damp, dampAngle } from './util.js'

export const ANIMALS = {
  hedgehog: { emoji: '🦔', name: 'Hedgehog' },
  piglet: { emoji: '🐷', name: 'Piglet' },
  chick: { emoji: '🐥', name: 'Chick' },
  kitten: { emoji: '🐱', name: 'Kitten' },
}
export const ANIMAL_IDS = Object.keys(ANIMALS)
export const MAX_SPEED = 5.4
const TURN_RATE = 6.5
/** How far in front of the animal the roller's axle is (painters.glb). */
export const ROLLER_AHEAD = 0.95
const ROLLER_RADIUS = 0.3
/** The painter's collider: one circle between the animal and its roller. */
export const COLLIDE_AHEAD = 0.45
export const COLLIDE_R = 1.0

const shadowTex = canvasTexture(64, 64, (g) => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.35)')
  grad.addColorStop(0.6, 'rgba(0,0,0,0.18)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
})
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
const shadowGeo = new THREE.PlaneGeometry(2.4, 3.2).rotateX(-Math.PI / 2).translate(0, 0.03, 0.45)

export const newStats = () => ({ splash: 0, water: 0, rainbow: 0, dist: 0, swirl: 0, swap: 0 })

export class Painter {
  /**
   * @param template the painter_<animal> node from painters.glb
   * @param local true when this device moves it (its child, or a bot on the host)
   */
  constructor({ id, seat, animal, template, local, bot }) {
    Object.assign(this, { id, seat, animal, local, bot })
    /** The paint in this painter's roller: one of the red, yellow and blue bits. */
    this.paint = SEAT_PAINT[seat]
    this.color = MIXES[this.paint].hex
    this.group = new THREE.Group()
    this.model = template.clone(true)
    this.group.add(this.model)
    this.body = this.model.children.find((c) => c.name.startsWith('body'))
    this.roller = this.model.children.find((c) => c.name.startsWith('roller'))
    this.paintMat = null
    this.model.traverse((o) => {
      if (!o.isMesh) return
      if (o.material.name === 'paint') {
        this.paintMat ??= o.material.clone()
        this.paintMat.color.set(this.color)
        o.material = this.paintMat
      }
    })
    const shadow = new THREE.Mesh(shadowGeo, shadowMat)
    shadow.renderOrder = 1
    this.group.add(shadow)
    this.x = 0
    this.z = 0
    this.yaw = 0
    this.speed = 0
    this.phase = Math.random() * 6
    this.rainbowUntil = 0
    this.rainbow = false
    this.stats = newStats()
    this.target = { x: 0, z: 0, yaw: 0, speed: 0, at: 0 }
    this.controls = { x: 0, z: 0 }
    this.last = { x: 0, z: 0 }
  }

  /** Dips the roller in another pot (red, yellow or blue). */
  setPaint(bits) {
    if (!MIXES[bits] || bits === this.paint) return false
    this.paint = bits
    this.color = MIXES[bits].hex
    return true
  }

  place(x, z, yaw) {
    this.x = this.last.x = this.target.x = x
    this.z = this.last.z = this.target.z = z
    this.yaw = this.target.yaw = yaw
    this.speed = 0
    this.sync(0)
  }

  /** Where the roller touches the ground. */
  rollerAt(out = { x: 0, z: 0 }) {
    out.x = this.x + Math.sin(this.yaw) * ROLLER_AHEAD
    out.z = this.z + Math.cos(this.yaw) * ROLLER_AHEAD
    return out
  }

  /** Local painters: steer towards `controls` (a world direction, length 0..1). */
  drive(dt, speedScale = 1) {
    const { x, z } = this.controls
    const want = Math.min(1, Math.hypot(x, z))
    let target = 0
    if (want > 0.05) {
      const goal = Math.atan2(x, z)
      const diff = angleDiff(this.yaw, goal)
      const before = this.yaw
      this.yaw += clamp(diff, -TURN_RATE * dt, TURN_RATE * dt)
      if (this.speed > 0.5) this.stats.swirl += Math.abs(this.yaw - before)
      // Slow down for a sharp turn, so turning round makes a tight swirl.
      target = MAX_SPEED * speedScale * want * clamp(Math.cos(diff) * 0.7 + 0.45, 0.35, 1)
    }
    this.speed = damp(this.speed, target, target > this.speed ? 3.5 : 7, dt)
    this.x += Math.sin(this.yaw) * this.speed * dt
    this.z += Math.cos(this.yaw) * this.speed * dt
  }

  /** Remote painters: glide towards the latest snapshot. */
  follow(dt) {
    const t = this.target
    // Run a little ahead along the last known heading, so the remote roller isn't behind its paint.
    const ahead = Math.min(0.15, (performance.now() - t.at) / 1000)
    const tx = t.x + Math.sin(t.yaw) * t.speed * ahead
    const tz = t.z + Math.cos(t.yaw) * t.speed * ahead
    if (Math.hypot(tx - this.x, tz - this.z) > 4) {
      this.x = tx
      this.z = tz
    }
    this.x = damp(this.x, tx, 10, dt)
    this.z = damp(this.z, tz, 10, dt)
    this.yaw = dampAngle(this.yaw, t.yaw, 10, dt)
    this.speed = t.speed
  }

  setTarget(x, z, yaw, speed, rainbow, paint) {
    Object.assign(this.target, { x, z, yaw, speed, at: performance.now() })
    this.rainbow = rainbow
    if (paint) this.setPaint(paint)
  }

  /** Moves the model to the painter's state, spins the roller and waddles. */
  sync(dt, now = 0) {
    const moved = Math.hypot(this.x - this.last.x, this.z - this.last.z)
    this.last.x = this.x
    this.last.z = this.z
    this.group.position.set(this.x, 0, this.z)
    this.group.rotation.y = this.yaw
    if (this.roller) this.roller.rotation.x += moved / ROLLER_RADIUS
    this.phase += moved * 3.2
    const k = clamp(this.speed / MAX_SPEED, 0, 1)
    if (this.body) {
      this.body.rotation.z = Math.sin(this.phase) * 0.09 * k
      this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.07 * k
      this.body.rotation.x = 0.06 * k
    }
    if (this.paintMat) {
      if (this.rainbow) this.paintMat.color.setHSL((now / 900) % 1, 0.85, 0.6)
      else this.paintMat.color.set(this.color)
    }
    return moved
  }

  dispose() {
    this.group.removeFromParent()
    this.paintMat?.dispose()
  }
}
