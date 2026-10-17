import * as THREE from 'three'
import { halfSize } from './world.js'

/**
 * Creatures that visit the sky once every balloon friend has been met, built from a few simple shapes at runtime
 * (except the sheep, copied from the landscape): friends that balloons carry or drop down onto the meadow, where
 * they stay, and a little bird that flutters across and pops any balloon it bumps into.
 */
const v = new THREE.Vector3()
const box = new THREE.Box3()

/** Where (x, y) on screen a scene point is. */
function screenOf(pos, camera) {
  v.copy(pos).project(camera)
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
}

/**
 * The meadow's two rows: the front one a little lower and bigger, the back one higher and smaller, so friends stand
 * staggered instead of shoulder to shoulder. `ground` is the grass line as a share of the half-height at that depth.
 */
const ROWS = [
  { z: 1.0, ground: 0.72, scale: 1.06 },
  { z: -0.6, ground: 0.6, scale: 0.88 },
]
/** Screen pixels a meadow friend keeps clear of the landscape's own sheep. */
const CLEAR = 88

/**
 * Friends dropped (or carried down) by balloons: sheep, ducks, bunnies and piglets. Each tumbles or floats to a free
 * spot on the grass, bounces, and stays for the rest of the visit, so the meadow slowly fills with everyone who came
 * down. It holds about five in portrait and eight in landscape; past that, the friend who has been there longest
 * skips off over the hill. Sheep graze, ducks waddle, bunnies and piglets hop now and then; a tap makes any jump.
 */
export class Flock {
  /** `avoid` lists the landscape's own sheep, which the meadow's spots keep clear of. */
  constructor(scene, camera, avoid = []) {
    this.scene = scene
    this.camera = camera
    this.avoid = avoid
    this.list = []
  }

  /** How many friends fit across the screen. */
  get room() {
    return THREE.MathUtils.clamp(Math.floor((2 * halfSize(this.camera, 0.3).w) / 1.9), 5, 8)
  }

  /**
   * The spots on the grass, in screen pixels, alternating front and back rows. Each is the nearest clear place to an
   * even spread: clear of the landscape's own sheep standing at that row's height and of the other spots (the
   * other row's a little less), so nobody hides behind anybody.
   */
  spots() {
    const n = this.room
    const sheep = this.avoid.map((s) => screenOf(box.setFromObject(s).getCenter(v), this.camera))
    const rowY = ROWS.map((row) => screenOf(v.set(0, -halfSize(this.camera, row.z).h * row.ground, row.z), this.camera).y)
    const chosen = ROWS.map(() => [])
    return Array.from({ length: n }, (_, i) => {
      const r = i % 2
      const want = innerWidth * (0.1 + (0.8 * (i + 0.5)) / n)
      const clear = (x) => sheep.every((p) => Math.abs(p.y - rowY[r]) > 70 || Math.abs(p.x - x) >= CLEAR) && chosen[r].every((c) => Math.abs(c - x) >= CLEAR) && chosen[1 - r].every((c) => Math.abs(c - x) >= CLEAR * 0.6)
      let x = want
      for (let d = 0; d < innerWidth; d += 8) {
        if (want + d < innerWidth - 40 && clear(want + d)) { x = want + d; break }
        if (want - d > 40 && clear(want - d)) { x = want - d; break }
      }
      chosen[r].push(x)
      return { x, row: ROWS[r] }
    })
  }

  /** A spot's place in the scene: its x and grass line at its row's depth. */
  place(spot) {
    const { w, h } = halfSize(this.camera, spot.row.z)
    return { x: ((spot.x / innerWidth) * 2 - 1) * w, y: -h * spot.row.ground, z: spot.row.z }
  }

  /**
   * Takes a creature out of its balloon onto the meadow. `size` is its world scale at the balloons' depth (0.6);
   * `gentle` when it was carried all the way down (a soft landing) rather than dropped.
   */
  land(mesh, { kind = 'sheep', size, gentle = false } = {}) {
    mesh.updateWorldMatrix(true, false)
    mesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale)
    mesh.removeFromParent()
    mesh.rotation.set(0, mesh.rotation.y, 0)
    this.scene.add(mesh)
    const staying = this.list.filter((c) => !c.leaving)
    const spots = this.spots()
    if (staying.length >= spots.length) staying[0].leaving = true
    const taken = new Set(this.list.filter((c) => !c.leaving).map((c) => c.spot))
    const here = screenOf(mesh.position, this.camera).x
    const free = [...spots.keys()].filter((i) => !taken.has(i)).sort((a, b) => Math.abs(spots[a].x - here) - Math.abs(spots[b].x - here))
    const spot = free[0] ?? 0
    // Keep its look: the same on-screen size at its row's depth, a touch bigger in front, smaller behind.
    const row = spots[spot].row
    const cam = this.camera.position.z
    mesh.position.z = row.z
    const base = (size ?? mesh.scale.x) * ((cam - row.z) / (cam - 0.6)) * row.scale
    this.list.push({ mesh, kind, spot, size: base, vy: gentle ? -0.5 : 2.5, spin: gentle ? 0 : (Math.random() - 0.5) * 6, standing: false, squash: 0, hop: 0, phase: Math.random() * 6, next: 2 + Math.random() * 4 })
  }

  /** The friend (if any) under a screen point. */
  at(x, y) {
    return this.list.find((c) => {
      if (c.leaving) return false
      const p = screenOf(c.mesh.position, this.camera)
      return Math.hypot(x - p.x, y - p.y + 10) < 50
    })
  }

  /** `bump(friend, hard)` plays each landing. */
  update(dt, t, bump) {
    const spots = this.spots()
    // A narrower screen (a turned tablet) holds fewer: the longest-staying skip off first.
    const staying = this.list.filter((c) => !c.leaving)
    for (const c of staying.slice(0, Math.max(0, staying.length - spots.length))) c.leaving = true
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]
      const m = c.mesh
      if (c.leaving) {
        // A happy skip up and away over the hill
        m.position.y += dt * 6
        m.position.x += dt * 4
        m.rotation.z -= dt * 3
        if (m.position.y > 20) {
          m.removeFromParent()
          this.list.splice(i, 1)
        }
        continue
      }
      const home = this.place(spots[Math.min(c.spot, spots.length - 1)])
      // Ease toward its own spot on the grass
      m.position.x += (home.x - m.position.x) * Math.min(1, dt * (c.standing ? 1.5 : 2.5))
      const ground = home.y
      if (!c.standing) {
        c.vy -= 16 * dt
        m.position.y += c.vy * dt
        m.rotation.z += c.spin * dt
        if (m.position.y <= ground) {
          m.position.y = ground
          c.squash = 1
          bump(c, Math.abs(c.vy) > 4)
          if (Math.abs(c.vy) > 3.5) {
            c.vy = -c.vy * 0.42
            c.spin *= -0.5
          } else {
            c.standing = true
            c.vy = 0
          }
        }
      } else {
        // Each in its own way: bunnies and piglets hop now and then, ducks waddle, sheep sway as they graze.
        if ((c.next -= dt) <= 0) {
          c.next = 3 + Math.random() * 5
          if (c.kind === 'bunny' || c.kind === 'piglet') c.hop = Math.max(c.hop, c.kind === 'bunny' ? 0.6 : 0.35)
        }
        const waddle = c.kind === 'duck' ? Math.sin(t * 5 + c.phase) * 0.14 : Math.sin(t * 0.8 + c.phase) * 0.05
        m.rotation.z += (waddle - m.rotation.z) * Math.min(1, dt * 6)
        c.hop = Math.max(0, c.hop - dt * 1.4)
        m.position.y = ground + (c.hop > 0 ? Math.abs(Math.sin((1 - c.hop) * Math.PI * 2)) * 0.9 * c.hop : 0)
      }
      c.squash = Math.max(0, c.squash - dt * 3)
      const q = Math.sin(c.squash * Math.PI) * 0.25
      m.scale.set(c.size * (1 + q), c.size * (1 - q), c.size)
    }
  }
}

const toon = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
const ball = (r, mat, [x, y, z], [sx, sy, sz] = [1, 1, 1]) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  return m
}
const eyes = (g, x, y, z, r = 0.06) => {
  const dark = toon('#2b2440')
  for (const s of [1, -1]) g.add(ball(r, dark, [x, y, z * s]))
}

/** Built facing +x; turned three-quarters toward the camera so its face shows. */
function faceViewer(g) {
  const holder = new THREE.Group()
  g.rotation.y = -1.05
  holder.add(g)
  return holder
}

/** A little yellow duck, about a sheep's size, its feet at y = 0. */
export function makeDuck() {
  const g = new THREE.Group()
  const yellow = toon('#ffd23f')
  g.add(ball(0.5, yellow, [0, 0.5, 0], [1.25, 0.85, 0.9]))
  g.add(ball(0.32, yellow, [0.45, 1.05, 0]))
  const beak = ball(0.16, toon('#ff9f1c'), [0.78, 1.0, 0], [1.4, 0.5, 1])
  g.add(beak)
  g.add(ball(0.2, yellow, [-0.62, 0.72, 0], [1.2, 0.6, 0.7]))
  eyes(g, 0.68, 1.14, 0.19, 0.065)
  return faceViewer(g)
}

/** A round pink piglet with a snout, little ears and a curly tail, its feet at y = 0. */
export function makePiglet() {
  const g = new THREE.Group()
  const pink = toon('#ffb3c7')
  const rosy = toon('#ff8fab')
  g.add(ball(0.5, pink, [0, 0.52, 0], [1.2, 0.95, 0.95]))
  g.add(ball(0.36, pink, [0.5, 0.78, 0]))
  g.add(ball(0.15, rosy, [0.82, 0.74, 0], [0.6, 0.85, 1]))
  for (const z of [0.05, -0.05]) g.add(ball(0.03, toon('#c2185b'), [0.9, 0.75, z]))
  for (const z of [0.18, -0.18]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 8), rosy)
    ear.position.set(0.42, 1.13, z)
    ear.rotation.z = -0.35
    g.add(ear)
  }
  for (const [x, z] of [[0.35, 0.22], [0.35, -0.22], [-0.3, 0.22], [-0.3, -0.22]]) g.add(ball(0.11, rosy, [x, 0.1, z], [1, 1, 1]))
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 14, Math.PI * 1.6), rosy)
  tail.position.set(-0.62, 0.7, 0)
  tail.rotation.y = Math.PI / 2
  g.add(tail)
  eyes(g, 0.7, 0.95, 0.2, 0.055)
  return faceViewer(g)
}

/** A soft white bunny with long pink-lined ears, its feet at y = 0. */
export function makeBunny() {
  const g = new THREE.Group()
  const white = toon('#fbf7ff')
  const pink = toon('#ffb3cf')
  g.add(ball(0.48, white, [0, 0.48, 0], [1, 0.95, 0.9]))
  g.add(ball(0.36, white, [0.18, 1.08, 0]))
  for (const z of [0.12, -0.12]) {
    g.add(ball(0.13, white, [0.12, 1.62, z], [0.8, 2.6, 0.7]))
    g.add(ball(0.07, pink, [0.18, 1.62, z], [0.6, 2.2, 0.5]))
  }
  g.add(ball(0.06, pink, [0.52, 1.04, 0]))
  g.add(ball(0.16, white, [-0.5, 0.4, 0]))
  eyes(g, 0.46, 1.13, 0.19, 0.06)
  for (const z of [0.24, -0.24]) g.add(ball(0.07, pink, [0.4, 1.0, z], [0.6, 0.5, 0.6]))
  return faceViewer(g)
}

/** A round little bird made of spheres and a cone, with flapping wings. */
function makeBird() {
  const body = new THREE.MeshStandardMaterial({ color: '#4d96ff', roughness: 0.5 })
  const belly = new THREE.MeshStandardMaterial({ color: '#ffe066', roughness: 0.6 })
  const beakMat = new THREE.MeshStandardMaterial({ color: '#ff9f1c', roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2440', roughness: 0.3 })
  const g = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), body)
  torso.scale.set(1.15, 0.9, 0.85)
  g.add(torso)
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), belly)
  tummy.position.set(0.12, -0.12, 0.12)
  tummy.scale.set(0.95, 0.75, 0.8)
  g.add(tummy)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), body)
  head.position.set(0.5, 0.3, 0)
  g.add(head)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 10), beakMat)
  beak.rotation.z = -Math.PI / 2
  beak.position.set(0.86, 0.26, 0)
  g.add(beak)
  for (const z of [0.2, -0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark)
    eye.position.set(0.68, 0.4, z)
    g.add(eye)
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 8), body)
  tail.rotation.z = Math.PI / 2 + 0.4
  tail.position.set(-0.65, 0.12, 0)
  g.add(tail)
  const wings = [0.3, -0.3].map((z) => {
    const pivot = new THREE.Group()
    pivot.position.set(-0.02, 0.18, z)
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 8), body)
    wing.scale.set(1, 0.18, 0.9)
    wing.position.z = Math.sign(z) * 0.32
    pivot.add(wing)
    pivot.userData.side = Math.sign(z)
    g.add(pivot)
    return pivot
  })
  g.userData.wings = wings
  return g
}

export class Bird {
  constructor(scene, camera) {
    this.camera = camera
    this.mesh = makeBird()
    this.mesh.visible = false
    scene.add(this.mesh)
    this.flying = false
    this.loop = 0
  }

  /** Flutters in from one side at the given height and crosses the screen. */
  fly(halfWidth, y) {
    this.dir = Math.random() < 0.5 ? 1 : -1
    this.end = halfWidth + 3
    this.y = y
    this.t = 0
    this.mesh.position.set(-this.dir * this.end, y, 0.4)
    this.mesh.scale.set(this.dir, 1, 1)
    this.mesh.visible = true
    this.flying = true
  }

  /** Tapped: a loop-the-loop. Returns true when the tap was on the bird. */
  tap(x, y) {
    if (!this.flying) return false
    const p = screenOf(this.mesh.position, this.camera)
    if (Math.hypot(x - p.x, y - p.y) > 70) return false
    this.loop = 1
    return true
  }

  /** Moves the bird; `bump(position)` is called each frame so it can pop balloons it touches. */
  update(dt, t, bump) {
    if (!this.flying) return
    const m = this.mesh
    this.t += dt
    this.loop = Math.max(0, this.loop - dt * 1.3)
    const looping = this.loop > 0
    const a = (1 - this.loop) * Math.PI * 2
    m.position.x += this.dir * dt * (looping ? 1 : 3.2)
    m.position.y = this.y + Math.sin(this.t * 2.2) * 0.7 + (looping ? Math.sin(a) * 1.6 : 0)
    m.rotation.z = looping ? this.dir * a : Math.sin(this.t * 2.2 + 1) * 0.15
    for (const w of m.userData.wings) w.rotation.x = w.userData.side * (Math.sin(t * 22) * 0.9 + 0.2)
    bump(m.position)
    if (Math.abs(m.position.x) > this.end) {
      this.flying = false
      m.visible = false
    }
  }
}
