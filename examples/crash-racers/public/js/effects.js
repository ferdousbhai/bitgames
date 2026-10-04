import * as THREE from 'three'
import { canvasTexture } from './util.js'

/**
 * Particles (sparks, smoke, dust, splashes, glass), skid marks and camera
 * shake. Particles live in one pooled InstancedMesh per kind so a big pile-up
 * stays cheap on tablets.
 */
const softDot = canvasTexture(64, 64, (g) => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
})

const colors = new Map()
/** Parsed colours, so spawning a particle doesn't parse a CSS string. */
const colorOf = (css) => colors.get(css) ?? colors.set(css, new THREE.Color(css)).get(css)
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

/**
 * A fixed ring of particle slots in one InstancedMesh. A new particle takes the
 * next slot (replacing the oldest when full), so colours are written once at
 * spawn and nothing is spliced or allocated per frame.
 */
class Pool {
  constructor(scene, { count, geometry, material, gravity = 0, drag = 0, grow = 0, billboard = false }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    scene.add(this.mesh)
    this.slots = Array.from({ length: count }, () => ({
      alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), life: 1, age: 0, size: 1, spin: 0,
    }))
    this.next = 0
    this.gravity = gravity
    this.drag = drag
    this.grow = grow
    this.billboard = billboard
    this.dummy = new THREE.Object3D()
  }

  spawn(position, velocity, { life = 1, size = 0.2, color = '#ffffff', spin = 0 } = {}) {
    const i = this.next
    this.next = (i + 1) % this.slots.length
    const it = this.slots[i]
    it.alive = true
    it.p.copy(position)
    it.v.copy(velocity)
    it.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    it.life = life
    it.age = 0
    it.size = size
    it.spin = spin
    this.mesh.setColorAt(i, colorOf(color))
    this.mesh.instanceColor.needsUpdate = true
    this.mesh.count = Math.max(this.mesh.count, i + 1)
  }

  update(dt, camera) {
    const d = this.dummy
    let any = false
    for (let i = 0; i < this.mesh.count; i++) {
      const it = this.slots[i]
      if (!it.alive) continue
      any = true
      it.age += dt
      if (it.age >= it.life) {
        it.alive = false
        this.mesh.setMatrixAt(i, HIDDEN)
        continue
      }
      it.v.y -= this.gravity * dt
      it.v.multiplyScalar(1 - this.drag * dt)
      it.p.addScaledVector(it.v, dt)
      if (this.gravity && it.p.y < 0.03) {
        it.p.y = 0.03
        it.v.y *= -0.35
        it.v.x *= 0.6
        it.v.z *= 0.6
      }
      it.rot.x += it.spin * dt
      it.rot.y += it.spin * dt * 0.7
      const t = it.age / it.life
      d.position.copy(it.p)
      if (this.billboard) d.quaternion.copy(camera.quaternion)
      else d.rotation.copy(it.rot)
      d.scale.setScalar(it.size * (1 + this.grow * t) * (this.grow ? 1 : 1 - t * 0.5))
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true
  }

  clear() {
    for (const it of this.slots) it.alive = false
    this.mesh.count = 0
  }
}

export class Effects {
  constructor(scene) {
    this.sparks = new Pool(scene, {
      count: 400,
      geometry: new THREE.BoxGeometry(0.05, 0.05, 0.3),
      material: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      gravity: 9,
      drag: 1.5,
    })
    this.smoke = new Pool(scene, {
      count: 300,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0.55, color: '#ffffff' }),
      drag: 1.2,
      grow: 3,
      billboard: true,
    })
    this.dust = new Pool(scene, {
      count: 200,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0.4, color: '#ffffff' }),
      drag: 2,
      grow: 2.5,
      billboard: true,
    })
    this.glass = new Pool(scene, {
      count: 500,
      geometry: new THREE.TetrahedronGeometry(0.05),
      material: new THREE.MeshStandardMaterial({ color: '#bfe3f0', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.8 }),
      gravity: 9.8,
      drag: 0.4,
    })
    this.splash = new Pool(scene, {
      count: 200,
      geometry: new THREE.SphereGeometry(0.07, 6, 4),
      material: new THREE.MeshStandardMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.7, roughness: 0.1 }),
      gravity: 9.8,
      drag: 0.5,
    })
    this.fire = new Pool(scene, {
      count: 120,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ff8a2a', toneMapped: false }),
      drag: 1,
      grow: -0.6,
      billboard: true,
    })
    this.pools = [this.sparks, this.smoke, this.dust, this.glass, this.splash, this.fire]
    this.skids = new SkidMarks(scene)
    this.shake = 0
  }

  sparkBurst(point, normal, strength) {
    const n = Math.min(60, 6 + strength * 4)
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * strength * 0.8)
      v.addScaledVector(normal, 2)
      this.sparks.spawn(point, v, { life: 0.25 + Math.random() * 0.45, size: 1 + Math.random(), color: Math.random() < 0.5 ? '#ffd35a' : '#ff8a1c' })
    }
  }

  puff(point, velocity, { color = '#dddddd', size = 0.6, life = 1.4, kind = 'smoke' } = {}) {
    const pool = kind === 'dust' ? this.dust : this.smoke
    pool.spawn(point, velocity, { life, size, color })
  }

  flame(point) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6)
    this.fire.spawn(point, v, { life: 0.5 + Math.random() * 0.3, size: 0.5 + Math.random() * 0.4 })
  }

  shatter(point, velocity, count = 40) {
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(5).add(velocity)
      this.glass.spawn(point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6)), v, {
        life: 2.5 + Math.random() * 2,
        size: 0.6 + Math.random() * 1.2,
        spin: 8,
      })
    }
  }

  splashAt(point, speed) {
    const v = new THREE.Vector3()
    for (let i = 0; i < Math.min(30, 4 + speed); i++) {
      v.set((Math.random() - 0.5) * 3, 2 + Math.random() * speed * 0.3, (Math.random() - 0.5) * 3)
      this.splash.spawn(point, v, { life: 0.8, size: 0.6 + Math.random() })
    }
  }

  /** A ring of dust and sparks rushing outwards: the horn shockwave. */
  ring(point, radius = 12) {
    const v = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      v.set(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(radius * 1.4)
      p.set(point.x + Math.cos(a), 0.5, point.z + Math.sin(a))
      this.dust.spawn(p, v, { life: 0.8, size: 1.4, color: '#fff3c4' })
      if (i % 2) this.sparks.spawn(p, v.multiplyScalar(0.8).setY(3), { life: 0.6, size: 1.5, color: i % 4 === 1 ? '#6c63ff' : '#2ec4b6' })
    }
  }

  /** A shower of coloured sparks where a star or box was grabbed. */
  sparkle(point, colors = ['#fff04a', '#ffffff', '#ffbe0b']) {
    const v = new THREE.Vector3()
    for (let i = 0; i < 14; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 3)
      this.sparks.spawn(point, v, { life: 0.5 + Math.random() * 0.4, size: 0.7 + Math.random() * 0.6, color: colors[i % colors.length] })
    }
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount)
  }

  update(dt, camera) {
    for (const pool of this.pools) pool.update(dt, camera)
    this.shake = Math.max(0, this.shake - dt * 1.8)
  }

  reset() {
    for (const pool of this.pools) pool.clear()
    this.skids.clear()
  }
}

/** Tyre marks: a ring buffer of dark quads laid on the road behind sliding wheels. */
class SkidMarks {
  constructor(scene, max = 3000) {
    this.max = max
    this.positions = new Float32Array(max * 6 * 3)
    this.alpha = new Float32Array(max * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05,0.05,0.05, vA * 0.55); }',
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
    this.cursor = 0
    /** Per wheel: the trail's last left/right edge points, and whether the trail is running. */
    this.trails = new Map()
  }

  /** Extends wheel `key`'s trail to (x, z) with lateral axis (sx, sz), or breaks it when intensity is low. */
  mark(key, x, z, sx, sz, intensity, width = 0.22) {
    let trail = this.trails.get(key)
    if (!trail) this.trails.set(key, (trail = { on: false, lx: 0, lz: 0, rx: 0, rz: 0 }))
    if (intensity <= 0.05) {
      trail.on = false
      return
    }
    const lx = x + sx * width, lz = z + sz * width
    const rx = x - sx * width, rz = z - sz * width
    if (trail.on && (trail.lx - lx) ** 2 + (trail.lz - lz) ** 2 < 9) {
      const i = this.cursor
      const y = 0.02
      // Two triangles: prev-left, prev-right, left / prev-right, right, left.
      this.positions.set([trail.lx, y, trail.lz, trail.rx, y, trail.rz, lx, y, lz, trail.rx, y, trail.rz, rx, y, rz, lx, y, lz], i * 18)
      this.alpha.fill(Math.min(1, intensity), i * 6, i * 6 + 6)
      const { position, alpha } = this.mesh.geometry.attributes
      position.addUpdateRange(i * 18, 18)
      alpha.addUpdateRange(i * 6, 6)
      position.needsUpdate = alpha.needsUpdate = true
      this.cursor = (i + 1) % this.max
    }
    Object.assign(trail, { on: true, lx, lz, rx, rz })
  }

  clear() {
    this.positions.fill(0)
    this.alpha.fill(0)
    const { position, alpha } = this.mesh.geometry.attributes
    position.clearUpdateRanges()
    alpha.clearUpdateRanges()
    position.needsUpdate = alpha.needsUpdate = true
    this.trails.clear()
  }
}
