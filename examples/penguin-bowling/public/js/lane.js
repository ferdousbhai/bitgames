import * as THREE from 'three'
import * as CANNON from 'cannon'
import { canvasTexture } from './effects.js'
import { bakeColors } from './merge.js'

/**
 * The icy lane, its physics and the ten pins.
 *
 * Three.js coordinates: y is up, the penguin starts near z = 0 and slides
 * towards -z. The lane top is y = 0.
 */
export const LANE = {
  half: 1.5, // lane half width
  gutter: 0.6, // gutter width each side
  start: 0.9, // penguin start z
  foul: -0.2,
  headPin: -11.5, // z of the front pin
  deckEnd: -13.8, // pit starts here
  back: -16.5, // pit back wall
  front: 3, // lane begins here (behind the penguin)
}
export const PENGUIN_R = 0.32
export const PIN_H = 0.72
const PIN_SPACING = 0.54

/** Pin spots, numbered like a real bowling alley: 1 at the front, 7-10 at the back. */
export const PIN_SPOTS = []
for (let row = 0; row < 4; row++) {
  for (let j = 0; j <= row; j++) {
    PIN_SPOTS.push({ x: (j - row / 2) * PIN_SPACING, z: LANE.headPin - row * PIN_SPACING * 0.866, row })
  }
}

export const PIN_COLORS = ['#ffd23f', '#ff595e', '#4cc9f0', '#8ac926', '#ff6b9d', '#9b5de5', '#ff9f1c', '#2ec4b6', '#ff595e', '#1982c4']

// --- Textures -------------------------------------------------------------------------

/** The ice: pale blue with frosty streaks, approach dots, aiming arrows and pin spots. */
function laneTexture() {
  const W = 256
  const H = 2048
  const len = LANE.front - LANE.deckEnd
  const zToY = (z) => ((z - LANE.deckEnd) / len) * H
  const xToX = (x) => ((x + LANE.half) / (LANE.half * 2)) * W
  return canvasTexture(W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, W, 0)
    grad.addColorStop(0, '#bfe6fb')
    grad.addColorStop(0.5, '#e6f7ff')
    grad.addColorStop(1, '#bfe6fb')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    // Frosty streaks along the lane
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`
      g.lineWidth = 1 + Math.random() * 2
      const x = Math.random() * W
      const y = Math.random() * H
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (Math.random() - 0.5) * 12, y + 40 + Math.random() * 160)
      g.stroke()
    }
    // A few sparkly cracks
    g.strokeStyle = 'rgba(150,205,240,0.5)'
    g.lineWidth = 1.5
    for (let i = 0; i < 14; i++) {
      let x = Math.random() * W
      let y = Math.random() * H
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 40
        y += (Math.random() - 0.5) * 40
        g.lineTo(x, y)
      }
      g.stroke()
    }
    // Foul line: a candy stripe
    const fy = zToY(LANE.foul)
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#ff595e'
      g.fillRect((i * W) / 16, fy - 7, W / 16 + 1, 14)
    }
    // Approach dots and aiming arrows (little fish shapes!)
    const arrowColors = ['#ff595e', '#ff9f1c', '#ffca3a', '#8ac926', '#ffca3a', '#ff9f1c', '#ff595e']
    for (let i = 0; i < 7; i++) {
      const x = W * ((i + 1) / 8)
      const off = Math.abs(i - 3)
      const y = zToY(-3.6) + off * 26
      g.fillStyle = arrowColors[i]
      g.beginPath()
      g.moveTo(x, y - 26)
      g.lineTo(x + 11, y + 4)
      g.lineTo(x - 11, y + 4)
      g.closePath()
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.75)'
      g.beginPath()
      g.arc(x, zToY(1.8), 5, 0, Math.PI * 2)
      g.fill()
    }
    // Pin spots
    g.fillStyle = 'rgba(70,130,200,0.45)'
    for (const s of PIN_SPOTS) {
      g.beginPath()
      g.ellipse(xToX(s.x), zToY(s.z), 10, 10 * (W / (LANE.half * 2)) / (H / len), 0, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** The soft curtain behind the pins: deep blue with big friendly snowflakes. */
function cushionTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#5b7fd6')
    grad.addColorStop(1, '#3a5aa8')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(255,255,255,0.85)'
    g.lineCap = 'round'
    const flake = (x, y, r) => {
      g.lineWidth = r * 0.14
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const ex = x + Math.cos(a) * r
        const ey = y + Math.sin(a) * r
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(ex, ey)
        for (const s of [-1, 1]) {
          const mx = x + Math.cos(a) * r * 0.6
          const my = y + Math.sin(a) * r * 0.6
          g.moveTo(mx, my)
          g.lineTo(mx + Math.cos(a + s * 0.8) * r * 0.3, my + Math.sin(a + s * 0.8) * r * 0.3)
        }
        g.stroke()
      }
    }
    const spots = [[60, 70, 28], [170, 170, 22], [260, 80, 34], [360, 175, 24], [450, 75, 28], [110, 210, 14], [400, 30, 12], [210, 40, 12], [310, 230, 12], [490, 200, 14], [20, 180, 12]]
    for (const [x, y, r] of spots) flake(x, y, r)
  })
}

// --- Lane -------------------------------------------------------------------------

export class Lane {
  constructor(scene) {
    this.scene = scene
    this.root = new THREE.Group()
    scene.add(this.root)

    // Physics
    const world = (this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) }))
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = true
    world.solver.iterations = 12
    this.iceMat = new CANNON.Material('ice')
    this.penguinMat = new CANNON.Material('penguin')
    this.pinMat = new CANNON.Material('pin')
    this.bumperMat = new CANNON.Material('bumper')
    this.wallMat = new CANNON.Material('wall')
    world.addContactMaterial(new CANNON.ContactMaterial(this.iceMat, this.penguinMat, { friction: 0, restitution: 0 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.iceMat, this.pinMat, { friction: 0.3, restitution: 0.1 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.penguinMat, this.pinMat, { friction: 0.05, restitution: 0.35 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.pinMat, this.pinMat, { friction: 0.2, restitution: 0.3 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.bumperMat, this.penguinMat, { friction: 0, restitution: 0.55 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.bumperMat, this.pinMat, { friction: 0.1, restitution: 0.5 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.wallMat, this.penguinMat, { friction: 0, restitution: 0.2 }))
    world.addContactMaterial(new CANNON.ContactMaterial(this.wallMat, this.pinMat, { friction: 0.2, restitution: 0.2 }))

    const box = (hx, hy, hz, x, y, z, mat = this.iceMat) => {
      const b = new CANNON.Body({ mass: 0, material: mat })
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)))
      b.position.set(x, y, z)
      world.addBody(b)
      return b
    }
    const midZ = (LANE.front + LANE.deckEnd) / 2
    const halfLen = (LANE.front - LANE.deckEnd) / 2
    // Lane top at y = 0
    box(LANE.half, 0.5, halfLen, 0, -0.5, midZ)
    // Gutters: lower channels either side, running into the pit
    const gx = LANE.half + LANE.gutter / 2
    const gLen = (LANE.front - LANE.back) / 2
    const gMid = (LANE.front + LANE.back) / 2
    for (const s of [-1, 1]) {
      box(LANE.gutter / 2, 0.5, gLen, s * gx, -0.75, gMid)
      // Snow-bank walls outside the gutters
      box(0.4, 1.2, gLen, s * (LANE.half + LANE.gutter + 0.4), 0.5, gMid, this.wallMat)
    }
    // Pit floor and back cushion
    box(LANE.half, 0.5, (LANE.deckEnd - LANE.back) / 2, 0, -1.4, (LANE.deckEnd + LANE.back) / 2)
    box(LANE.half + LANE.gutter + 0.8, 2, 0.4, 0, 1, LANE.back - 0.4, this.wallMat)
    // Bumpers sit on top of the lane edges (added in bumper mode)
    this.bumpers = [-1, 1].map((s) => {
      const b = new CANNON.Body({ mass: 0, material: this.bumperMat })
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.09, 0.3, (LANE.foul - LANE.deckEnd) / 2)))
      b.position.set(s * (LANE.half - 0.02), 0.3, (LANE.foul + LANE.deckEnd) / 2)
      return b
    })
    this.bumpersOn = false

    this.buildVisuals()
  }

  buildVisuals() {
    const r = this.root
    const len = LANE.front - LANE.deckEnd
    // Ice
    this.iceMaterial = new THREE.MeshStandardMaterial({ map: laneTexture(), roughness: 0.12, metalness: 0.0, envMapIntensity: 1.2 })
    const ice = new THREE.Mesh(new THREE.BoxGeometry(LANE.half * 2, 0.4, len), [
      new THREE.MeshStandardMaterial({ color: '#a6dcf7', roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: '#a6dcf7', roughness: 0.3 }),
      this.iceMaterial,
      new THREE.MeshStandardMaterial({ color: '#a6dcf7', roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: '#a6dcf7', roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: '#a6dcf7', roughness: 0.3 }),
    ])
    ice.position.set(0, -0.2, (LANE.front + LANE.deckEnd) / 2)
    ice.receiveShadow = true
    r.add(ice)
    // Gutters: icy half-pipes
    const gutterMat = new THREE.MeshStandardMaterial({ color: '#8fd0f2', roughness: 0.2, side: THREE.DoubleSide })
    const gLen = LANE.front - LANE.back
    const pipe = new THREE.CylinderGeometry(LANE.gutter / 2, LANE.gutter / 2, gLen, 16, 1, true, Math.PI / 2, Math.PI)
    pipe.rotateX(Math.PI / 2)
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(pipe, gutterMat)
      g.position.set(s * (LANE.half + LANE.gutter / 2), -0.0, (LANE.front + LANE.back) / 2)
      g.rotation.z = Math.PI
      g.receiveShadow = true
      r.add(g)
    }
    // Pit: a deep blue snow hollow with a soft cushion at the back
    const pit = new THREE.Mesh(
      new THREE.BoxGeometry((LANE.half + LANE.gutter) * 2, 0.2, LANE.deckEnd - LANE.back),
      new THREE.MeshStandardMaterial({ color: '#5a7fb8', roughness: 0.9 }),
    )
    pit.position.set(0, -0.9, (LANE.deckEnd + LANE.back) / 2)
    r.add(pit)
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry((LANE.half + LANE.gutter + 0.8) * 2, 2.6, 0.5),
      new THREE.MeshStandardMaterial({ map: cushionTexture(), roughness: 0.95 }),
    )
    cushion.position.set(0, 0.3, LANE.back - 0.25)
    r.add(cushion)
    // Snow banks along both sides, with a rounded top
    const bankMat = new THREE.MeshStandardMaterial({ color: '#f4f9ff', roughness: 0.95 })
    this.bankMat = bankMat
    this.gutterMat = gutterMat
    const bank = new THREE.CapsuleGeometry(0.42, gLen, 6, 12)
    bank.rotateX(Math.PI / 2)
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(bank, bankMat)
      b.scale.set(1.1, 0.75, 1)
      b.position.set(s * (LANE.half + LANE.gutter + 0.42), 0.05, (LANE.front + LANE.back) / 2)
      b.receiveShadow = true
      r.add(b)
    }
    // Bumpers: puffy candy-striped tubes
    const stripe = canvasTexture(256, 16, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#ff6b9d'
        g.fillRect((i * w) / 16, 0, w / 16 + 1, h)
      }
    })
    stripe.wrapS = THREE.RepeatWrapping
    stripe.repeat.set(5, 1)
    const bumperLen = LANE.foul - LANE.deckEnd
    const bgeo = new THREE.CapsuleGeometry(0.13, bumperLen, 6, 12)
    bgeo.rotateZ(Math.PI / 2)
    bgeo.rotateY(Math.PI / 2)
    const bmat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.4 })
    this.bumperMeshes = [-1, 1].map((s) => {
      const m = new THREE.Mesh(bgeo, bmat)
      m.position.set(s * (LANE.half - 0.02), 0.16, (LANE.foul + LANE.deckEnd) / 2)
      m.castShadow = true
      m.visible = false
      r.add(m)
      return m
    })
    // Aim dots: little snowballs showing where the penguin will go
    this.aimDots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#ff6b9d', toneMapped: false }),
      14,
    )
    this.aimDots.frustumCulled = false
    this.aimDots.count = 0
    r.add(this.aimDots)
    const arrowShape = new THREE.Shape()
    arrowShape.moveTo(0, 0.38)
    arrowShape.lineTo(0.26, 0)
    arrowShape.lineTo(0.1, 0)
    arrowShape.lineTo(0.1, -0.22)
    arrowShape.lineTo(-0.1, -0.22)
    arrowShape.lineTo(-0.1, 0)
    arrowShape.lineTo(-0.26, 0)
    arrowShape.closePath()
    const ageo = new THREE.ShapeGeometry(arrowShape)
    ageo.rotateX(-Math.PI / 2)
    this.aimArrow = new THREE.Mesh(ageo, new THREE.MeshBasicMaterial({ color: '#ffca3a', transparent: true, opacity: 0.95, depthWrite: false }))
    this.aimArrow.visible = false
    r.add(this.aimArrow)
  }

  /** Moonlight: the ice and snow banks turn night-blue. */
  setNight(on) {
    this.iceMaterial.color.set(on ? '#9fb2ea' : '#ffffff')
    this.bankMat.color.set(on ? '#a3b2ea' : '#f4f9ff')
    this.gutterMat.color.set(on ? '#6f93d6' : '#8fd0f2')
  }

  setBumpers(on) {
    if (on === this.bumpersOn) return
    this.bumpersOn = on
    for (const b of this.bumpers) on ? this.world.addBody(b) : this.world.removeBody(b)
    for (const m of this.bumperMeshes) m.visible = on
  }

  /** Show the aim dots along a predicted path: [{x, z}, ...]. */
  showAim(points, color) {
    const d = new THREE.Object3D()
    const n = Math.min(points.length, this.aimDots.instanceMatrix.count)
    for (let i = 0; i < n; i++) {
      const p = points[i]
      d.position.set(p.x, 0.07, p.z)
      d.scale.setScalar(1 - (i / n) * 0.5)
      d.updateMatrix()
      this.aimDots.setMatrixAt(i, d.matrix)
    }
    this.aimDots.count = n
    this.aimDots.instanceMatrix.needsUpdate = true
    if (points.length > 1) {
      const a = points[points.length - 1]
      const b = points[points.length - 2]
      this.aimArrow.position.set(a.x, 0.06, a.z)
      this.aimArrow.rotation.y = Math.atan2(-(a.x - b.x), -(a.z - b.z))
      this.aimArrow.visible = true
      this.aimArrow.material.color.set(color)
    }
  }

  hideAim() {
    this.aimDots.count = 0
    this.aimArrow.visible = false
  }
}

// --- Pins -------------------------------------------------------------------------

const UP = new CANNON.Vec3(0, 1, 0)
const FOOT = new CANNON.Sphere(0.05)
const tmpUp = new CANNON.Vec3()

export class Pins {
  constructor(lane, scene) {
    this.lane = lane
    this.scene = scene
    this.list = []
    this.templates = {}
    this.kind = 'snowman'
    this.onHit = null
  }

  /** gltf from pins.glb: pin_snowman and pin_fish, tinted per pin. */
  attach(gltf) {
    for (const kind of ['snowman', 'fish']) {
      const node = gltf.scene.getObjectByName(`pin_${kind}`)
      if (!node) continue
      node.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.material.envMapIntensity = 0.4
        }
      })
      this.templates[kind] = node
    }
  }

  /** Fallback when the model can't load: a simple white bowling pin. */
  fallback() {
    const pts = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      const y = -PIN_H / 2 + t * PIN_H
      const r = 0.06 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.3)) ** 2 + (t > 0.7 ? 0.06 * Math.sin(((t - 0.7) / 0.3) * Math.PI) : 0)
      pts.push(new THREE.Vector2(Math.max(0.02, r), y))
    }
    const g = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }))
    mesh.castShadow = true
    g.add(mesh)
    return g
  }

  build(kind) {
    this.kind = kind
    for (const p of this.list) {
      p.mesh.removeFromParent()
      this.lane.world.removeBody(p.body)
    }
    this.list = PIN_SPOTS.map((spot, i) => {
      const tpl = this.templates[kind] ?? this.templates.snowman
      const mesh = tpl ? tpl.clone(true) : this.fallback()
      const color = PIN_COLORS[i]
      mesh.traverse((o) => {
        if (!o.isMesh) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        const tinted = mats.map((m) => {
          if (m.name === 'pin_tint' || m.name === 'fish_skin') {
            const c = m.clone()
            c.color.set(color)
            return c
          }
          return m
        })
        o.material = Array.isArray(o.material) ? tinted : tinted[0]
      })
      // Each pin becomes a single mesh: ten draw calls for the rack, not seventy.
      bakeColors(mesh, { roughness: 0.7, envMapIntensity: 0.4 })
      this.scene.add(mesh)
      const body = new CANNON.Body({
        mass: 0.5,
        material: this.lane.pinMat,
        linearDamping: 0.08,
        angularDamping: 0.12,
        sleepSpeedLimit: 0.12,
        sleepTimeLimit: 0.4,
      })
      // Snowballs stacked like the pin itself (spheres are cheap and topple nicely),
      // standing on a little ring of feet so it stays up until something hits it.
      body.addShape(new CANNON.Sphere(0.19), new CANNON.Vec3(0, -0.17, 0))
      body.addShape(new CANNON.Sphere(0.15), new CANNON.Vec3(0, 0.04, 0))
      body.addShape(new CANNON.Sphere(0.12), new CANNON.Vec3(0, 0.22, 0))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        body.addShape(FOOT, new CANNON.Vec3(Math.cos(a) * 0.13, -PIN_H / 2 + 0.05, Math.sin(a) * 0.13))
      }
      body.addEventListener('collide', (e) => this.onHit?.(pin, e))
      const pin = { i, spot, mesh, body, color, standing: true, removed: false, drop: 0, dance: 0 }
      return pin
    })
    this.reset()
  }

  /** Put every pin back on its spot (they drop in from above). */
  reset() {
    for (const p of this.list) {
      if (!this.lane.world.bodies.includes(p.body)) this.lane.world.addBody(p.body)
      p.body.position.set(p.spot.x, PIN_H / 2 + 0.002, p.spot.z)
      p.body.quaternion.set(0, 0, 0, 1)
      p.body.velocity.setZero()
      p.body.angularVelocity.setZero()
      p.body.sleep()
      p.standing = true
      p.removed = false
      p.mesh.visible = true
      p.mesh.scale.setScalar(1)
      p.drop = 1
      p.dance = 0
      p.vanish = undefined
    }
  }

  /** Is this pin knocked over (tipped, or pushed off the deck)? */
  isDown(p) {
    if (p.removed) return true
    const b = p.body
    b.quaternion.vmult(UP, tmpUp)
    return tmpUp.y < 0.75 || b.position.y < PIN_H / 2 - 0.15 || b.position.z < LANE.deckEnd || Math.abs(b.position.x) > LANE.half
  }

  countStanding() {
    return this.list.filter((p) => !p.removed && !this.isDown(p)).length
  }

  /** Are the pins still wobbling? */
  moving() {
    return this.list.some((p) => !p.removed && p.body.sleepState !== CANNON.Body.SLEEPING && (p.body.velocity.length() > 0.08 || p.body.angularVelocity.length() > 0.25))
  }

  wake() {
    for (const p of this.list) if (!p.removed) p.body.wakeUp()
  }

  sync(dt) {
    for (const p of this.list) {
      if (p.removed && p.vanish === undefined) continue
      p.mesh.position.copy(p.body.position)
      p.mesh.quaternion.copy(p.body.quaternion)
      if (p.drop > 0) {
        p.drop = Math.max(0, p.drop - dt * 2.2)
        const t = 1 - p.drop
        // Drop in from above with a little bounce
        const y = t < 0.7 ? (1 - t / 0.7) ** 2 * 2.2 : Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.08
        p.mesh.position.y += y
      }
      if (p.vanish !== undefined) {
        p.vanish -= dt * 3
        p.mesh.scale.setScalar(Math.max(0.001, p.vanish))
        if (p.vanish <= 0) {
          p.mesh.visible = false
          p.vanish = undefined
        }
      }
    }
  }

  /** Fallen pins disappear in a puff; returns their positions for effects. */
  clearFallen() {
    const out = []
    for (const p of this.list) {
      if (p.removed || !this.isDown(p)) continue
      p.removed = true
      p.vanish = 1
      this.lane.world.removeBody(p.body)
      out.push(p.mesh.position.clone())
    }
    // Standing pins settle exactly where they are
    for (const p of this.list) {
      if (p.removed) continue
      p.body.velocity.setZero()
      p.body.angularVelocity.setZero()
    }
    return out
  }

  /** Strike party: every pin pops back up and dances on its spot. */
  dance(t) {
    for (const p of this.list) {
      const ph = t * 9 + p.i * 0.7
      p.mesh.visible = true
      p.mesh.scale.setScalar(1)
      p.mesh.position.set(p.spot.x + Math.sin(ph * 0.5) * 0.05, PIN_H / 2 + Math.abs(Math.sin(ph)) * 0.35, p.spot.z)
      p.mesh.rotation.set(0, Math.sin(t * 3 + p.i) * 0.9, Math.sin(ph) * 0.25)
    }
  }

  removeAllBodies() {
    for (const p of this.list) if (this.lane.world.bodies.includes(p.body)) this.lane.world.removeBody(p.body)
  }
}
