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
    this.state = 'stand' // stand | slide | react | gone
    this.face = Math.PI // standing, it faces down the lane (0 faces the camera, on the title)
    this.sq = 0 // squash and stretch: > 0 stretches along the body, < 0 squashes it
    this.sqV = 0
    this.mood = 'joy' // after a slide: 'joy' (hops and flaps), 'wow' (a big strike dance) or 'dizzy' (a miss)
    this.reactT = 0
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
    // Where a hat sits: just above the top of the head, in the head's own space.
    const head = this.p.head ?? model
    this.group.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(head)
    this.hatAt = head.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - 0.04, (box.min.z + box.max.z) / 2))
    const hat = this.hat
    this.hat = null
    if (hat) this.wear(hat.userData.kind, hat.userData.fish)
  }

  /**
   * Put on a hat won with a strike: 'crown', 'party' or 'fish' (a fish pin balanced on the head), or none.
   * Simple runtime geometry, so the shipped penguin model stays as it is.
   */
  wear(kind, fish = null) {
    this.hat?.removeFromParent()
    this.hat = null
    if (!kind) return
    const head = this.p.head ?? this.model
    const g = new THREE.Group()
    g.userData = { kind, fish }
    if (kind === 'crown') {
      const gold = new THREE.MeshStandardMaterial({ color: '#ffc83a', metalness: 0.6, roughness: 0.3, emissive: '#5a3a00', emissiveIntensity: 0.5 })
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.11, 20, 1, true), gold)
      band.material.side = THREE.DoubleSide
      band.position.y = -0.04
      g.add(band)
      const gems = ['#ff595e', '#4cc9f0', '#8ac926', '#ff6b9d', '#9b5de5']
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 8), gold)
        spike.position.set(Math.cos(a) * 0.155, 0.06, Math.sin(a) * 0.155)
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshStandardMaterial({ color: gems[k], roughness: 0.2 }))
        gem.position.set(Math.cos(a) * 0.172, -0.04, Math.sin(a) * 0.172)
        g.add(spike, gem)
      }
    } else if (kind === 'party') {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const x = c.getContext('2d')
      for (let k = 0; k < 8; k++) {
        x.fillStyle = ['#ff6b9d', '#ffd23f', '#4cc9f0', '#8ac926'][k % 4]
        x.fillRect(0, k * 8, 64, 8)
      }
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      // Worn at a jaunty tilt on the side of the beanie, clear of its pom-pom.
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
      cone.position.y = 0.17
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }))
      pom.position.y = 0.35
      const tilt = new THREE.Group()
      tilt.add(cone, pom)
      tilt.position.set(0.13, -0.12, 0)
      tilt.rotation.z = -0.65
      g.add(tilt)
    } else if (kind === 'tophat') {
      // A tall black top hat with a red band, sat right down over the beanie.
      const black = new THREE.MeshStandardMaterial({ color: '#26263a', roughness: 0.5 })
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.3, 24), black)
      crown.position.y = -0.02
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 28), black)
      brim.position.y = -0.16
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.06, 24), new THREE.MeshStandardMaterial({ color: '#ff595e', roughness: 0.5 }))
      band.position.y = -0.12
      g.add(crown, brim, band)
    } else if (kind === 'fish' && fish) {
      const f = fish.clone(true)
      f.scale.setScalar(0.55)
      f.rotation.set(0, 0, Math.PI / 2)
      f.position.y = 0.05
      g.add(f)
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true))
    g.position.copy(this.hatAt ?? new THREE.Vector3(0, 0.6, 0))
    head.add(g)
    this.hat = g
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
    this.sq = -0.25 // and lands with a little squash
    this.sqV = 0
    this.pose.rotation.set(0, 0, 0)
    this.pose.position.set(0, 0, 0)
    this.group.visible = true
    this.group.position.set(x, STAND_Y, LANE.start)
    this.yaw.rotation.y = this.face
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
    this.sq = 0.45 // a long stretchy dive
    this.sqV = 0
  }

  /** A bump (pins, bumpers): the body squashes and springs back. */
  bump(strength = 1) {
    this.sqV -= 7 * Math.min(1.4, strength)
  }

  /**
   * After the slide the penguin pops up behind the pins to see what happened: hopping and flapping
   * after a good knock, a strike dance, or a slow dizzy wobble after a miss.
   */
  react(x, mood, z = LANE.deckEnd - 0.7) {
    if (this.lane.world.bodies.includes(this.body)) this.lane.world.removeBody(this.body)
    this.state = 'react'
    this.mood = mood
    this.reactZ = z
    this.reactT = 0
    this.x = x
    this.lie = 0
    this.sq = 0
    this.sqV = 0
    this.group.visible = true
    this.yaw.rotation.y = 0
    this.pose.rotation.set(0, 0, 0)
    this.pose.position.set(0, 0, 0)
    this.group.position.set(x, -1.2, this.reactZ)
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
    // A soft spring: stretch and squash wobble back to the penguin's own shape.
    this.sqV += (-90 * this.sq - 9 * this.sqV) * dt
    this.sq = Math.max(-0.45, Math.min(0.6, this.sq + this.sqV * dt))
    const side = 1 - this.sq * 0.45
    this.pose.scale.set(side, 1 + this.sq, side)
    if (this.state === 'react') return this.updateReact(dt, t)
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
    // Standing to aim it only breathes: a slow, small sway, so the spot it stands on reads clearly.
    this.pose.rotation.set(0, 0, Math.sin(t * 1.6) * 0.025)
    this.yaw.rotation.y = this.face + this.spin * this.spin * Math.PI * 2
    // Now and then look back at the camera
    this.glance = Math.max(0, (this.glance || 0) - dt)
    const look = this.face === 0 ? 0 : Math.max(0, Math.sin(t * 0.7)) ** 6
    if (head) head.rotation.set(-0.1, Math.PI * 0.75 * look * (Math.sin(t * 0.35) > 0 ? 1 : -1), Math.sin(t * 2) * 0.1)
    if (head && this.glance > 0) head.rotation.set(-0.35, Math.sin(Math.min(1, this.glance) * Math.PI / 2) * this.glanceSide * 0.75, this.glanceSide * 0.15)
    const flap = this.hop > 0 ? Math.sin(t * 30) * 0.5 + 0.6 : Math.sin(t * 1.6) * 0.04
    if (flipperL) flipperL.rotation.set(0, 0, -0.15 - flap)
    if (flipperR) flipperR.rotation.set(0, 0, 0.15 + flap)
    if (footL) footL.rotation.x = 0
    if (footR) footR.rotation.x = 0
  }

  updateReact(dt, t) {
    const { head, flipperL, flipperR, footL, footR } = this.p
    const k = (this.reactT += dt)
    // Pop up from the pit with an overshoot, then stay peeking over the deck.
    const rise = Math.min(1, k / 0.35)
    let y = -1.2 + (1 - (1 - rise) ** 3) * 1.25 + Math.sin(Math.min(1, k / 0.6) * Math.PI) * 0.15
    if (k - dt < 0.35 && k >= 0.35) this.sqV += 6 // lands with a boing
    if (this.mood === 'dizzy') {
      // A slow, wobbly "whoops": the head circles, the body sways.
      this.yaw.rotation.y = 0
      this.pose.rotation.set(Math.sin(k * 3) * 0.12, 0, Math.cos(k * 3) * 0.16)
      head?.rotation.set(Math.sin(k * 5) * 0.25, Math.cos(k * 5) * 0.35, Math.sin(k * 5) * 0.2)
      flipperL?.rotation.set(0, 0, -0.5 - Math.sin(k * 4) * 0.2)
      flipperR?.rotation.set(0, 0, 0.5 + Math.cos(k * 4) * 0.2)
    } else {
      // Happy hops; a strike makes them bigger, with a spin on every other hop.
      const wow = this.mood === 'wow'
      const hopK = Math.max(0, k - 0.45)
      const ph = hopK * (wow ? 2.6 : 2.2) // hops per second
      y += Math.abs(Math.sin(ph * Math.PI)) * (wow ? 0.5 : 0.3)
      const n = Math.floor(ph)
      this.yaw.rotation.y = wow && n % 2 === 1 ? (ph - n) * Math.PI * 2 : 0
      this.pose.rotation.set(0, 0, Math.sin(k * 7) * 0.12)
      const flap = 1.1 + Math.sin(t * 26) * 0.5
      flipperL?.rotation.set(0, 0, -flap)
      flipperR?.rotation.set(0, 0, flap)
      head?.rotation.set(-0.25, 0, Math.sin(k * 6) * 0.2)
    }
    if (footL) footL.rotation.x = 0
    if (footR) footR.rotation.x = 0
    this.group.position.set(this.x, y, this.reactZ)
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
      this.list.push({ group, m, p: parts(m), home: group.position.clone(), baseY: group.position.y, phase: i * 1.3, s, yaw: group.rotation.y, hop: 0, side, slide: null })
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

  /**
   * A surprise: one of the babies near the start hops into a gutter and belly-slides all the way down
   * after the penguin, then pops up at the end of the lane to join the party. Calls `onWhee` as it dives.
   */
  slider(onWhee) {
    const near = this.list.filter((c) => c.home.z > -6 && !c.slide)
    const c = near[Math.floor(Math.random() * near.length)]
    if (!c) return null
    c.slide = { t: 0, onWhee }
    return c
  }

  /** Every slider goes home to its spot on the bank. */
  home() {
    for (const c of this.list) {
      if (!c.slide) continue
      c.slide = null
      c.group.position.copy(c.home)
      c.group.rotation.set(0, c.yaw, 0)
      c.m.rotation.set(0, 0, 0)
      c.m.position.set(0, 0, 0)
    }
  }

  /** Where a slider is in its trip: hop into the gutter, slide down it, pop up by the pins. */
  updateSlider(c, dt, t) {
    const sl = c.slide
    sl.t += dt
    const gx = c.side * (LANE.half + LANE.gutter / 2)
    const gy = -0.25 + 0.45 * c.s * 0.6
    const endZ = LANE.deckEnd - 0.3
    const g = c.group
    if (sl.t < 0.5) {
      // Hop from the bank into the gutter
      const k = sl.t / 0.5
      g.position.set(c.home.x + (gx - c.home.x) * k, c.baseY + (gy - c.baseY) * k + Math.sin(k * Math.PI) * 0.8, c.home.z)
      g.rotation.set(0, c.yaw + (Math.PI - c.yaw) * k, 0)
      return
    }
    if (!sl.dove) {
      sl.dove = true
      sl.onWhee?.()
    }
    const slideT = sl.t - 0.5
    const z = c.home.z - slideT * 8
    if (z > endZ) {
      g.position.set(gx, gy - 0.12, z)
      g.rotation.set(0, Math.PI, 0)
      c.m.rotation.set(Math.PI / 2, 0, Math.sin(t * 9) * 0.08)
      c.p.flipperL?.rotation.set(0.4, 0, -1.1 + Math.sin(t * 16) * 0.15)
      c.p.flipperR?.rotation.set(0.4, 0, 1.1 - Math.sin(t * 16) * 0.15)
      return
    }
    // At the end: stand up facing the camera and hop with joy
    const k = Math.max(0, sl.t - 0.5 - (c.home.z - endZ) / 8)
    c.m.rotation.set(0, 0, Math.sin(k * 7) * 0.12)
    g.rotation.set(0, 0, 0)
    g.position.set(gx * 0.82, 0.1 + 0.45 * c.s + Math.abs(Math.sin(k * 7)) * 0.3 * c.s, endZ)
    const flap = 1.2 + Math.sin(t * 26) * 0.5
    c.p.flipperL?.rotation.set(0, 0, -flap)
    c.p.flipperR?.rotation.set(0, 0, flap)
  }

  /** A crowd wave: the babies jump up one after another along each bank, front to back and round again. */
  wave(onJump) {
    this.waveT = 0
    this.onWaveJump = onJump
    const order = [...this.list].sort((a, b) => b.home.z - a.home.z)
    order.forEach((c, k) => (c.waveDelay = k * 0.16))
    this.waveCount = order.length
  }

  /** Start a cheer; big ones last longer and jump higher. */
  start(big) {
    this.cheer = big ? 3 : 1.6
    this.big = big
  }

  update(dt, t) {
    this.cheer = Math.max(0, this.cheer - dt)
    const on = this.cheer > 0
    if (this.waveT !== undefined) {
      const before = this.waveT
      this.waveT += dt
      for (const c of this.list) if (before < c.waveDelay && this.waveT >= c.waveDelay) this.onWaveJump?.(c)
      if (this.waveT > this.waveCount * 0.16 + 0.8) this.waveT = undefined
    }
    for (const c of this.list) {
      if (c.slide) {
        this.updateSlider(c, dt, t)
        continue
      }
      const ph = t * (on ? 10 : 2) + c.phase
      const jump = on ? Math.abs(Math.sin(ph)) * (this.big ? 0.4 : 0.22) * c.s : 0
      c.hop = Math.max(0, (c.hop ?? 0) - dt * 2.4)
      const hop = Math.sin(c.hop * Math.PI) * 0.55 * c.s
      // In a wave each baby jumps once, flippers high, as the wave reaches it.
      const w = this.waveT === undefined ? -1 : (this.waveT - c.waveDelay) / 0.5
      const waveUp = w > 0 && w < 1 ? Math.sin(w * Math.PI) * 0.75 * c.s : 0
      c.group.position.y = c.baseY + Math.max(jump, hop, waveUp)
      c.group.rotation.y = c.yaw + (c.hop > 0 ? (1 - c.hop) ** 2 * Math.PI * 2 : 0)
      const flap = waveUp > 0 ? 2.6 : on || c.hop > 0 ? 1.2 + Math.sin(ph * 2) * 0.6 : 0.15 + Math.sin(ph) * 0.08
      c.p.flipperL?.rotation.set(0, 0, -flap)
      c.p.flipperR?.rotation.set(0, 0, flap)
      c.p.head?.rotation.set(on ? -0.25 : 0, Math.sin(t * 0.5 + c.phase) * 0.3, Math.sin(ph) * (on ? 0.2 : 0.05))
    }
  }
}
