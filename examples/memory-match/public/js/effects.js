import * as THREE from 'three'

/** Settings every new particle starts from, so a reused slot keeps nothing from its last life. */
const FRESH = { age: 0, delay: 0, rot: 0, spin: 0, phase: 0, sway: 0, aspect: 1, grow: false }

/**
 * Pooled particles drawn as one InstancedMesh each: sparkly stars, puffs of dust and confetti.
 * The particles live in a fixed ring of slots made up front, so spawning allocates nothing;
 * when every slot is busy the oldest particle makes way.
 */
class Pool {
  constructor(scene, geometry, max, { billboard = false, material } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material ?? new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.setColorAt(0, new THREE.Color())
    scene.add(this.mesh)
    this.billboard = billboard
    this.slots = Array.from({ length: max }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), life: 0, ...FRESH }))
    this.next = 0
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._s = new THREE.Vector3()
    this._e = new THREE.Euler()
    this._spin = new THREE.Quaternion()
    this._z = new THREE.Vector3(0, 0, 1)
  }

  /** Takes the next slot in the ring and returns it for the caller to place (pos, vel). */
  spawn(color, props) {
    const p = this.slots[this.next]
    this.next = (this.next + 1) % this.slots.length
    p.color.set(color)
    return Object.assign(p, FRESH, props)
  }

  clear() {
    for (const p of this.slots) p.life = 0
    this.next = 0
    this.mesh.count = 0
  }

  update(dt, camera) {
    let n = 0
    for (const p of this.slots) {
      if (p.age >= p.life) continue
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.age += dt
      if (p.age >= p.life) continue
      p.vel.y -= p.gravity * dt
      p.vel.multiplyScalar(1 - p.drag * dt)
      if (p.sway) p.pos.x += Math.sin(p.age * 5 + p.phase) * p.sway * dt
      p.pos.addScaledVector(p.vel, dt)
      p.rot += p.spin * dt
      const k = p.age / p.life
      const s = p.size * (p.grow ? 0.4 + k * 0.9 : k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4))
      if (this.billboard) this._q.copy(camera.quaternion).multiply(this._spin.setFromAxisAngle(this._z, p.rot))
      else this._q.setFromEuler(this._e.set(p.rot, p.rot * 0.7 + p.phase, p.rot * 0.3))
      this._m.compose(p.pos, this._q, this._s.set(s, s * p.aspect, s))
      this.mesh.setMatrixAt(n, this._m)
      this.mesh.setColorAt(n++, p.color)
    }
    this.mesh.count = n
    if (n === 0) return // nothing is drawn, so there is nothing to upload
    // Upload only the live particles' slots, not the whole pool.
    for (const [attr, size] of [[this.mesh.instanceMatrix, 16], [this.mesh.instanceColor, 3]]) {
      attr.clearUpdateRanges()
      attr.addUpdateRange(0, n * size)
      attr.needsUpdate = true
    }
  }
}

function starGeometry() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 0.42 : 1
    i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return new THREE.ShapeGeometry(shape)
}

const SPARKLE = ['#ffd23f', '#ffffff', '#ff8fb1', '#7fd8ff', '#b8ff7a']
const CONFETTI = ['#ff5d6c', '#ffbe0b', '#3fa2ff', '#6ad35a', '#b388ff', '#ff8fd0', '#2ec4b6']
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[(Math.random() * list.length) | 0]

export class Effects {
  constructor(scene) {
    this.stars = new Pool(scene, starGeometry(), 400, { billboard: true })
    this.puffs = new Pool(scene, new THREE.IcosahedronGeometry(1, 1), 120, {
      material: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    })
    this.confetti = new Pool(scene, new THREE.PlaneGeometry(1, 1), 500)
  }

  /** A burst of stars, e.g. when animals match. */
  sparkle(pos, { count = 24, colors = SPARKLE, speed = 2.6, up = 2.2, size = 0.09 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = rand(0.4, 1) * speed
      const p = this.stars.spawn(pick(colors), {
        size: size * rand(0.6, 1.4), life: rand(0.6, 1.1),
        gravity: 5, drag: 1.6, rot: Math.random() * 6, spin: rand(-6, 6),
      })
      p.pos.copy(pos)
      p.vel.set(Math.cos(a) * v, rand(0.6, 1) * up, Math.sin(a) * v)
    }
  }

  /** A ring of soft dust when something lands. */
  puff(pos, { count = 8, radius = 0.5, size = 0.08, color = '#ffffff' } = {}) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4
      const p = this.puffs.spawn(color, { size: size * rand(0.7, 1.3), life: rand(0.35, 0.55), gravity: 0, drag: 4, grow: true })
      p.pos.set(pos.x + Math.cos(a) * radius, pos.y + 0.02, pos.z + Math.sin(a) * radius)
      p.vel.set(Math.cos(a) * 0.9, rand(0.2, 0.6), Math.sin(a) * 0.9)
    }
  }

  /** Confetti raining over the area (center, half-width, half-depth). */
  rain(center, w, d, count = 220) {
    for (let i = 0; i < count; i++) {
      const p = this.confetti.spawn(pick(CONFETTI), {
        size: rand(0.06, 0.09), aspect: 1.6, life: rand(3.5, 5.5), delay: rand(0, 1.2),
        gravity: 0.6, drag: 1.2, rot: Math.random() * 6, spin: rand(2, 7), sway: rand(0.4, 1), phase: Math.random() * 6,
      })
      p.pos.set(center.x + rand(-w, w), rand(2.2, 4), center.z + rand(-d, d))
      p.vel.set(rand(-0.3, 0.3), rand(-1.2, -0.4), rand(-0.3, 0.3))
    }
  }

  clear() {
    this.stars.clear()
    this.puffs.clear()
    this.confetti.clear()
  }

  update(dt, camera) {
    for (const pool of [this.stars, this.puffs, this.confetti]) pool.update(dt, camera)
  }
}
