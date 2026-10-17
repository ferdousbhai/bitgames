import * as THREE from 'three'

const { damp, clamp } = THREE.MathUtils

/** Each world's little birds: canaries, candy pinks, sky blues, and glowing night birds. */
const LOOKS = [
  { body: '#ffd23f', wing: '#ffb347' },
  { body: '#ff8fc7', wing: '#c9b6ff' },
  { body: '#7cc6fe', wing: '#ffffff' },
  { body: '#c9b6ff', wing: '#8ef0ff', glow: 0.8 },
]
const BODY = new THREE.SphereGeometry(0.34, 16, 12)
const HEAD = new THREE.SphereGeometry(0.24, 14, 10)
const EYE = new THREE.SphereGeometry(0.05, 8, 6)
const BEAK = new THREE.ConeGeometry(0.08, 0.2, 8)
const WING = new THREE.SphereGeometry(0.3, 12, 8)
const mats = new Map()
const mat = (color, glow = 0) => {
  const key = `${color}|${glow}`
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 + glow, roughness: 0.5 }))
  return mats.get(key)
}

/** A round little bird made in code: body, head, beak, eyes and two flapping wings. */
function makeBird(look) {
  const root = new THREE.Group()
  const body = new THREE.Mesh(BODY, mat(look.body, look.glow))
  body.scale.set(1, 0.9, 1.3)
  root.add(body)
  // the head turns round to look back at Ember (and the camera), so its face always shows
  const head = new THREE.Group()
  head.position.set(0, 0.34, -0.22)
  head.add(new THREE.Mesh(HEAD, mat(look.body, look.glow)))
  const beak = new THREE.Mesh(BEAK, mat('#ff9f43'))
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, -0.03, 0.26)
  head.add(beak)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(EYE, mat('#2a2140'))
    eye.scale.setScalar(1.3)
    eye.position.set(side * 0.1, 0.06, 0.2)
    head.add(eye)
    const cheek = new THREE.Mesh(EYE, mat('#ff8fb0'))
    cheek.scale.set(1.2, 0.7, 0.5)
    cheek.position.set(side * 0.16, -0.05, 0.17)
    head.add(cheek)
  }
  root.add(head)
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.22, 0.12, 0)
    const w = new THREE.Mesh(WING, mat(look.wing, look.glow))
    w.scale.set(1.5, 0.22, 0.85)
    w.position.x = side * 0.38
    pivot.add(w)
    root.add(pivot)
    return pivot
  })
  root.scale.setScalar(0.9)
  return { root, wings, head }
}

/**
 * Little birds that fly up beside Ember now and then, keep her company for a while, wave a wing, and do a
 * happy flip whenever she catches something. Then they flutter off. Nothing to do with them: they are friends.
 */
export class Friends {
  constructor(scene) {
    this.scene = scene
    this.birds = []
  }

  get active() {
    return this.birds.length > 0
  }

  /** A little flock of two or three arrives from one side. */
  arrive(world, pos, lane) {
    const look = LOOKS[world] ?? LOOKS[0]
    const side = Math.random() < 0.5 ? -1 : 1
    const n = 2 + (Math.random() < 0.5 ? 1 : 0)
    for (let k = 0; k < n; k++) {
      const b = makeBird(look)
      // places beside and a little above Ember, on both sides, staggered so they never overlap
      const s = k === 1 ? -side : side
      b.off = new THREE.Vector3(s * (1.9 + k * 0.5), 1 + k * 0.55, -1.2 - k * 0.9)
      b.root.position.set(pos.x + side * (lane.x + 8), pos.y + 4, pos.z - 6)
      b.t = Math.random() * 6
      b.flip = 0
      b.stay = 11 + k
      b.wave = 0
      this.scene.add(b.root)
      this.birds.push(b)
    }
  }

  /** Ember caught something: the birds flip for joy, one after another. */
  cheer() {
    this.birds.forEach((b, i) => {
      if (b.flip <= 0 && b.stay > 0) b.flip = 1 + i * 0.25
    })
  }

  /** Everyone flutters off (at a nest, or back to the title). */
  leave() {
    for (const b of this.birds) b.stay = Math.min(b.stay, 0)
  }

  clear() {
    for (const b of this.birds) this.scene.remove(b.root)
    this.birds.length = 0
  }

  /** Returns true the moment a bird waves (for a chirp). */
  update(dt, pos, lane) {
    let waved = false
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]
      b.t += dt
      b.stay -= dt
      const r = b.root
      if (b.stay > 0) {
        // keep company: follow Ember's place plus this bird's spot, bobbing, never leaving the lane by much
        // (upright screens are narrow: the birds keep just inside the edges, so none is cut off)
        const edge = lane.x < 4 ? lane.x - 0.3 : lane.x + 1
        const tx = clamp(pos.x + b.off.x, -edge, edge)
        const ty = clamp(pos.y + b.off.y + Math.sin(b.t * 2.1) * 0.25, lane.yMin, lane.yMax + 1.2)
        r.position.x = damp(r.position.x, tx, 2.6, dt)
        r.position.y = damp(r.position.y, ty, 2.6, dt)
        r.position.z = damp(r.position.z, pos.z + b.off.z, 6, dt)
      } else {
        // fly off up and away, and go
        r.position.x += (b.off.x >= 0 ? 6 : -6) * dt
        r.position.y += 4 * dt
        r.position.z = damp(r.position.z, pos.z - 10, 1, dt)
        if (b.stay < -3) {
          this.scene.remove(r)
          this.birds.splice(i, 1)
          continue
        }
      }
      // now and then one wing waves at Ember instead of flapping
      if (b.wave <= 0 && b.stay > 1 && Math.random() < dt * 0.12) {
        b.wave = 1.6
        waved = true
      }
      b.wave = Math.max(0, b.wave - dt)
      const flap = Math.sin(b.t * 14) * 0.7
      b.wings[0].rotation.z = -flap
      b.wings[1].rotation.z = b.wave > 0 ? 1.1 + Math.sin(b.t * 9) * 0.35 : flap
      // a happy flip
      let roll = 0
      if (b.flip > 0) {
        b.flip = Math.max(0, b.flip - dt * 1.6)
        if (b.flip < 1) roll = (1 - b.flip) * Math.PI * 2
      }
      r.rotation.set(-roll, Math.sin(b.t * 0.9) * 0.25 + (b.off.x > 0 ? 0.25 : -0.25), Math.sin(b.t * 1.7) * 0.15)
      // the head looks back over the shoulder toward Ember, tilting now and then like a curious bird
      b.head.rotation.set(0.15, (b.off.x > 0 ? 0.4 : -0.4) + Math.sin(b.t * 0.6) * 0.2, Math.sin(b.t * 1.1) * 0.25)
    }
    return waved
  }
}
