import * as THREE from 'three'
import * as CANNON from 'cannon'
import { LANE, PENGUIN_R } from './lane.js'
import { bakeColors } from './merge.js'

const STAND_Y = 0.45 // origin height when standing (feet at -0.45)
const LIE_Y = PENGUIN_R + 0.06 // origin height above the body centre's floor when on the belly
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Find the animated parts of a penguin model (see blender/models.py). */
function parts(model) {
  const get = (n) => model.getObjectByName(n)
  return {
    head: get('penguin_head'),
    flipperL: get('penguin_flipper_L'),
    flipperR: get('penguin_flipper_R'),
    footL: get('penguin_foot_L'),
    footR: get('penguin_foot_R'),
  }
}

/** One mesh per moving part (body, head, flippers, feet) instead of one per colour. */
function bake(model) {
  const p = parts(model)
  bakeColors(model, { skip: Object.values(p).filter(Boolean), roughness: 0.5 })
  if (p.head) bakeColors(p.head, { roughness: 0.5 })
}

/** Give a cloned penguin its own scarf colour. */
export function tintScarf(model, color) {
  model.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const out = mats.map((m) => {
      if (m.name !== 'penguin_scarf') return m
      const c = m.clone()
      c.color.set(color)
      return c
    })
    o.material = Array.isArray(o.material) ? out : out[0]
  })
}

/** Simple stand-in if penguin.glb can't load: a black egg with a white belly. */
function fallbackModel() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), new THREE.MeshStandardMaterial({ color: '#26334d' }))
  body.scale.set(1, 1.3, 1)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshStandardMaterial({ color: '#ffffff' }))
  belly.position.set(0, -0.05, 0.12)
  belly.scale.set(1, 1.3, 1)
  g.add(body, belly)
  return g
}

/** The bowler: a chubby penguin who belly-slides down the ice. */
export class Penguin {
  constructor(scene, lane) {
    this.scene = scene
    this.lane = lane
    this.group = new THREE.Group() // world position
    this.yaw = new THREE.Group() // faces the direction of travel
    this.pose = new THREE.Group() // tips onto the belly
    this.group.add(this.yaw)
    this.yaw.add(this.pose)
    scene.add(this.group)
    this.p = {}
    this.state = 'stand' // stand | slide | gone
    this.lie = 0
    this.x = 0
    this.hop = 0
    this.spin = 0
    this.glance = 0
    this.hook = 0
    // Mass 6 (was 10): heavy enough to knock pins over easily, light enough that the pins
    // push back, so a strike needs a good line (Phase 2, measured with a scripted thrower).
    this.body = new CANNON.Body({ mass: 6, material: lane.penguinMat, fixedRotation: true, linearDamping: 0.03, allowSleep: false })
    this.body.addShape(new CANNON.Sphere(PENGUIN_R))
    this.onHit = null
    this.body.addEventListener('collide', (e) => this.onHit?.(e))
    this.setModel(fallbackModel())
  }

  setModel(model) {
    this.pose.clear()
    this.model = model
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.material.envMapIntensity = 0.5
      }
    })
    bake(model)
    this.pose.add(model)
    this.p = parts(model)
  }

  get sliding() {
    return this.state === 'slide'
  }

  /** Stand at the start line, ready to go. */
  ready(x) {
    if (this.lane.world.bodies.includes(this.body)) this.lane.world.removeBody(this.body)
    this.state = 'stand'
    this.x = x
    this.lie = 0
    this.hop = 1 // pops in with a hop
    this.group.visible = true
    this.group.position.set(x, STAND_Y, LANE.start)
    this.yaw.rotation.y = Math.PI
  }

  /** Dive! angle in radians (0 = straight down the lane), speed in units/s, hook = sideways pull. */
  launch(angle, speed, hook) {
    this.state = 'slide'
    this.hook = hook
    const b = this.body
    b.position.set(this.x, PENGUIN_R + 0.01, LANE.start - 0.2)
    b.velocity.set(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed)
    b.angularVelocity.setZero()
    if (!this.lane.world.bodies.includes(b)) this.lane.world.addBody(b)
  }

  hide() {
    if (this.lane.world.bodies.includes(this.body)) this.lane.world.removeBody(this.body)
    this.state = 'gone'
    this.group.visible = false
  }

  /** Called before every physics step while sliding: the gentle curve. */
  pull() {
    if (!this.sliding || !this.hook) return
    const b = this.body
    if (b.position.z < LANE.headPin + 0.4 || b.position.y < 0) return
    const ramp = Math.min(1, Math.max(0, (LANE.start - b.position.z) / 7))
    b.force.x += this.hook * ramp * b.mass
  }

  poke() {
    if (this.state !== 'stand') return false
    this.hop = 1
    this.spin = 1
    return true
  }

  update(dt, t) {
    const { head, flipperL, flipperR, footL, footR } = this.p
    if (this.state === 'slide') {
      const b = this.body
      this.group.position.set(b.position.x, b.position.y - PENGUIN_R, b.position.z)
      this.lie = damp(this.lie, 1, 14, dt)
      const v = b.velocity
      if (Math.hypot(v.x, v.z) > 0.5) {
        const cur = this.yaw.rotation.y
        let d = Math.atan2(v.x, v.z) - cur
        d = Math.atan2(Math.sin(d), Math.cos(d))
        this.yaw.rotation.y = cur + d * (1 - Math.exp(-8 * dt))
      }
      this.pose.position.y = LIE_Y * this.lie + STAND_Y * (1 - this.lie)
      const wob = Math.sin(t * 16) * 0.12
      if (flipperL) flipperL.rotation.set(0.4 * this.lie, 0, -1.1 * this.lie + wob)
      if (flipperR) flipperR.rotation.set(0.4 * this.lie, 0, 1.1 * this.lie - wob)
      if (head) head.rotation.set(-1.25 * this.lie, 0, Math.sin(t * 5) * 0.1)
      if (footL) footL.rotation.x = Math.sin(t * 14) * 0.4
      if (footR) footR.rotation.x = -Math.sin(t * 14) * 0.4
      this.pose.rotation.set((Math.PI / 2) * this.lie, 0, Math.sin(t * 9) * 0.06)
      return
    }
    if (this.state !== 'stand') return
    // Idle: a happy waddle on the spot, a hop when tapped or popping in.
    this.hop = Math.max(0, this.hop - dt * 2.2)
    this.spin = Math.max(0, this.spin - dt * 1.4)
    const hopY = Math.sin(this.hop * Math.PI) * 0.35
    this.group.position.set(this.x, STAND_Y + hopY, LANE.start)
    this.pose.position.y = 0
    this.pose.rotation.set(0, 0, Math.sin(t * 4) * 0.08)
    this.yaw.rotation.y = Math.PI + this.spin * this.spin * Math.PI * 2
    // Now and then look back at the camera
    const look = Math.max(0, Math.sin(t * 0.7)) ** 6
    if (head) head.rotation.set(-0.1, Math.PI * 0.75 * look * (Math.sin(t * 0.35) > 0 ? 1 : -1), Math.sin(t * 2) * 0.1)
    const flap = this.hop > 0 ? Math.sin(t * 30) * 0.5 + 0.6 : Math.sin(t * 4) * 0.12
    if (flipperL) flipperL.rotation.set(0, 0, -0.15 - flap)
    if (flipperR) flipperR.rotation.set(0, 0, 0.15 + flap)
    if (footL) footL.rotation.x = Math.max(0, Math.sin(t * 4)) * 0.3
    if (footR) footR.rotation.x = Math.max(0, -Math.sin(t * 4)) * 0.3
  }
}

/** Baby penguins watching from the snow banks. They cheer at every roll. */
export class Crowd {
  constructor(scene) {
    this.scene = scene
    this.list = []
    this.cheer = 0
    this.big = false
  }

  build(template, colors) {
    for (const c of this.list) c.group.removeFromParent()
    this.list = []
    if (!template) return
    const spots = [
      [-1, -1.6], [1, -2.6], [-1, -4.4], [1, -5.4], [-1, -7.4], [1, -8.4], [-1, -10.2], [1, -11.0],
    ]
    spots.forEach(([side, z], i) => {
      const m = template.clone(true)
      tintScarf(m, colors[i % colors.length])
      bake(m)
      m.traverse((o) => o.isMesh && (o.castShadow = true))
      const group = new THREE.Group()
      group.add(m)
      const s = 0.62 + (i % 3) * 0.06
      group.scale.setScalar(s)
      group.position.set(side * (LANE.half + LANE.gutter + 1.25 + (i % 2) * 0.35), -0.3 + 0.45 * s, z)
      // Face the lane, turned a little towards the camera
      group.rotation.y = side > 0 ? -Math.PI / 2 + 0.55 : Math.PI / 2 - 0.55
      this.scene.add(group)
      this.list.push({ group, p: parts(m), baseY: group.position.y, phase: i * 1.3, s, yaw: group.rotation.y, hop: 0 })
    })
  }

  /**
   * A tapped baby penguin hops. Taps are matched on screen with a generous
   * radius, so small fingers don't have to hit exactly. Returns where it is, or null.
   */
  poke(x, y, camera) {
    let best = null
    let bestD = Math.max(44, innerHeight * 0.06)
    const v = new THREE.Vector3()
    for (const c of this.list) {
      v.copy(c.group.position).setY(c.baseY + 0.35 * c.s).project(camera)
      if (v.z > 1) continue
      const d = Math.hypot(((v.x + 1) / 2) * innerWidth - x, ((1 - v.y) / 2) * innerHeight - y)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    if (!best) return null
    best.hop = 1
    return best.group.position.clone().setY(best.baseY + 0.8)
  }

  /** Start a cheer; big ones last longer and jump higher. */
  start(big) {
    this.cheer = big ? 3 : 1.6
    this.big = big
  }

  update(dt, t) {
    this.cheer = Math.max(0, this.cheer - dt)
    const on = this.cheer > 0
    for (const c of this.list) {
      const ph = t * (on ? 10 : 2) + c.phase
      const jump = on ? Math.abs(Math.sin(ph)) * (this.big ? 0.4 : 0.22) * c.s : 0
      c.hop = Math.max(0, (c.hop ?? 0) - dt * 2.4)
      const hop = Math.sin(c.hop * Math.PI) * 0.55 * c.s
      c.group.position.y = c.baseY + Math.max(jump, hop)
      c.group.rotation.y = c.yaw + (c.hop > 0 ? (1 - c.hop) ** 2 * Math.PI * 2 : 0)
      const flap = on || c.hop > 0 ? 1.2 + Math.sin(ph * 2) * 0.6 : 0.15 + Math.sin(ph) * 0.08
      c.p.flipperL?.rotation.set(0, 0, -flap)
      c.p.flipperR?.rotation.set(0, 0, flap)
      c.p.head?.rotation.set(on ? -0.25 : 0, Math.sin(t * 0.5 + c.phase) * 0.3, Math.sin(ph) * (on ? 0.2 : 0.05))
    }
  }
}
