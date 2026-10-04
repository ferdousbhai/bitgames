import * as THREE from 'three'

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)
const colors = new Map()
const colorOf = (css) => colors.get(css) ?? colors.set(css, new THREE.Color(css)).get(css)

/**
 * A fixed ring of particle slots in one InstancedMesh: paint drops, water
 * drops, sparkles and confetti stay one draw call each, however many there are.
 */
class Pool {
  constructor(scene, { count, geometry, material, gravity = 9, drag = 0.5, floor = true, spin = false }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    scene.add(this.mesh)
    this.slots = Array.from({ length: count }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), life: 1, age: 0, size: 1, w: 0 }))
    this.next = 0
    Object.assign(this, { gravity, drag, floor, spin })
    this.dummy = new THREE.Object3D()
  }

  spawn(p, v, { life = 1, size = 0.15, color = '#ffffff' } = {}) {
    const i = this.next
    this.next = (i + 1) % this.slots.length
    const s = this.slots[i]
    s.alive = true
    s.p.copy(p)
    s.v.copy(v)
    s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    s.w = (Math.random() - 0.5) * 12
    s.life = life
    s.age = 0
    s.size = size
    this.mesh.setColorAt(i, colorOf(color))
    this.mesh.instanceColor.needsUpdate = true
    this.mesh.count = Math.max(this.mesh.count, i + 1)
  }

  update(dt) {
    const d = this.dummy
    let any = false
    for (let i = 0; i < this.mesh.count; i++) {
      const s = this.slots[i]
      if (!s.alive) continue
      any = true
      s.age += dt
      if (s.age >= s.life) {
        s.alive = false
        this.mesh.setMatrixAt(i, HIDDEN)
        continue
      }
      s.v.y -= this.gravity * dt
      s.v.multiplyScalar(1 - this.drag * dt)
      s.p.addScaledVector(s.v, dt)
      if (this.floor && s.p.y < 0.02) {
        s.p.y = 0.02
        s.v.set(0, 0, 0)
      }
      if (this.spin) {
        s.r.x += s.w * dt
        s.r.z += s.w * 0.7 * dt
      }
      const fade = Math.min(1, (s.life - s.age) * 4)
      d.position.copy(s.p)
      d.rotation.copy(s.r)
      d.scale.setScalar(s.size * fade)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true
  }

  clear() {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].alive = false
      this.mesh.setMatrixAt(i, HIDDEN)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

export class Effects {
  constructor(scene) {
    this.drops = new Pool(scene, {
      count: 400,
      geometry: new THREE.SphereGeometry(1, 8, 6),
      material: new THREE.MeshStandardMaterial({ roughness: 0.3 }),
      gravity: 14,
      drag: 0.4,
    })
    this.sparks = new Pool(scene, {
      count: 160,
      geometry: new THREE.OctahedronGeometry(1, 0),
      material: new THREE.MeshBasicMaterial({ toneMapped: false }),
      gravity: -0.5,
      drag: 1.5,
      floor: false,
      spin: true,
    })
    this.confetti = new Pool(scene, {
      count: 360,
      geometry: new THREE.PlaneGeometry(1, 0.6),
      material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      gravity: 2.2,
      drag: 1.6,
      floor: false,
      spin: true,
    })
    this.tmp = new THREE.Vector3()
    this.tmpV = new THREE.Vector3()
  }

  /** A burst of paint drops flying out of a splat. */
  splash(x, z, color, count = 40, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = (2 + Math.random() * 5) * power
      this.drops.spawn(this.tmp.set(x, 0.3, z), this.tmpV.set(Math.cos(a) * s, 3 + Math.random() * 6 * power, Math.sin(a) * s), {
        life: 0.9 + Math.random() * 0.6,
        size: 0.1 + Math.random() * 0.16,
        color,
      })
    }
  }

  /** Little drops flicked off a rolling roller. */
  drip(x, z, color) {
    const a = Math.random() * Math.PI * 2
    this.drops.spawn(this.tmp.set(x, 0.35, z), this.tmpV.set(Math.cos(a) * 1.2, 1.5 + Math.random() * 2, Math.sin(a) * 1.2), { life: 0.6, size: 0.06 + Math.random() * 0.05, color })
  }

  sparkle(x, y, z, color, count = 8, spread = 1) {
    for (let i = 0; i < count; i++) {
      this.sparks.spawn(this.tmp.set(x + (Math.random() - 0.5) * spread, y + Math.random() * spread * 0.6, z + (Math.random() - 0.5) * spread), this.tmpV.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), {
        life: 0.6 + Math.random() * 0.5,
        size: 0.08 + Math.random() * 0.1,
        color,
      })
    }
  }

  /** Confetti raining over the whole picture. */
  party(colors, count = 200, area = { x: 16, z: 11, y: 14 }) {
    for (let i = 0; i < count; i++) {
      this.confetti.spawn(this.tmp.set((Math.random() - 0.5) * 2 * area.x, area.y + Math.random() * 6, (Math.random() - 0.5) * 2 * area.z), this.tmpV.set((Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2), {
        life: 5 + Math.random() * 2,
        size: 0.3 + Math.random() * 0.25,
        color: colors[i % colors.length],
      })
    }
  }

  update(dt) {
    this.drops.update(dt)
    this.sparks.update(dt)
    this.confetti.update(dt)
  }

  clear() {
    this.drops.clear()
    this.sparks.clear()
    this.confetti.clear()
  }
}
