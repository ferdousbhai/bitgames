import * as THREE from 'three'

/**
 * Juice: snow spray behind the sliding penguin, puffs and soft sparkles.
 * Particles live in pooled InstancedMeshes so a strike stays smooth on a tablet.
 */
/** A texture painted once by `draw(ctx, width, height)`. */
export function canvasTexture(width, height, draw) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  draw(c.getContext('2d'), width, height)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export const softDot = canvasTexture(64, 64, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.7)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

const starTex = canvasTexture(64, 64, (g, s) => {
  g.translate(s / 2, s / 2)
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0.0)')
  g.fillStyle = grad
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const r = i % 2 ? s * 0.12 : s * 0.5
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.fill()
})

const colors = new Map()
const colorOf = (css) => colors.get(css) ?? colors.set(css, new THREE.Color(css)).get(css)
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

class Pool {
  constructor(scene, { count, geometry, material, gravity = 0, drag = 0, grow = 0, billboard = false }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.mesh.renderOrder = 2
    scene.add(this.mesh)
    this.slots = Array.from({ length: count }, () => ({
      alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spinAxis: new THREE.Vector3(),
      life: 1, age: 0, size: 1, spin: 0, onDie: null,
    }))
    this.next = 0
    Object.assign(this, { gravity, drag, grow, billboard })
    this.dummy = new THREE.Object3D()
  }

  spawn(position, velocity, { life = 1, size = 0.2, color = '#ffffff', spin = 0, onDie = null } = {}) {
    const i = this.next
    this.next = (i + 1) % this.slots.length
    const it = this.slots[i]
    it.alive = true
    it.p.copy(position)
    it.v.copy(velocity)
    it.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    it.spinAxis.set(Math.random() + 0.3, Math.random(), Math.random() * 0.5)
    Object.assign(it, { life, age: 0, size, spin, onDie })
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
        if (it.onDie) it.onDie(it.p)
        continue
      }
      it.v.y -= this.gravity * dt
      it.v.multiplyScalar(Math.max(0, 1 - this.drag * dt))
      it.p.addScaledVector(it.v, dt)
      const t = it.age / it.life
      d.position.copy(it.p)
      if (this.billboard) d.quaternion.copy(camera.quaternion)
      else {
        it.rot.x += it.spin * it.spinAxis.x * dt
        it.rot.y += it.spin * it.spinAxis.y * dt
        it.rot.z += it.spin * it.spinAxis.z * dt
        d.rotation.copy(it.rot)
      }
      const s = it.size * (1 + this.grow * t) * Math.min(1, (1 - t) * 3)
      d.scale.setScalar(Math.max(s, 0.0001))
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Hide everything at once, so nothing from the last roll drifts over the next aim. */
  clear() {
    for (let i = 0; i < this.mesh.count; i++) {
      if (!this.slots[i].alive) continue
      this.slots[i].alive = false
      this.mesh.setMatrixAt(i, HIDDEN)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.snow = new Pool(scene, {
      count: 300,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0.85 }),
      gravity: 6,
      drag: 1.5,
      billboard: true,
    })
    this.puffs = new Pool(scene, {
      count: 160,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0.6 }),
      drag: 3,
      grow: 2.2,
      billboard: true,
    })
    this.sparkles = new Pool(scene, {
      count: 96,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      gravity: 1.2,
      drag: 1.2,
      billboard: true,
    })
    this.labels = document.getElementById('labels')
    this.shake = 0
    this.tmp = new THREE.Vector3()
    this.v = new THREE.Vector3()
  }

  /** Snow kicked up behind the sliding penguin. */
  spray(pos, speed) {
    const v = this.v
    const n = Math.min(3, Math.ceil(speed / 5))
    for (let i = 0; i < n; i++) {
      v.set((Math.random() - 0.5) * 2.5, 1 + Math.random() * 2, 1 + Math.random() * 2)
      this.snow.spawn(pos, v, { life: 0.5 + Math.random() * 0.3, size: 0.08 + Math.random() * 0.1, color: '#ffffff' })
    }
  }

  puff(pos, n = 6, size = 0.6, color = '#ffffff') {
    const v = this.v
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(2)
      this.puffs.spawn(pos, v, { life: 0.5, size: size * (0.7 + Math.random() * 0.6), color })
    }
  }

  sparkleAt(pos, color = '#ffffff', n = 3, speed = 1.5) {
    const v = this.v
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()))
      this.sparkles.spawn(pos, v, { life: 0.6 + Math.random() * 0.3, size: 0.2 + Math.random() * 0.25, color })
    }
  }

  /** The one soft celebration: a few slow, pale sparkles rising over the pin deck. */
  glow(pos, n = 14, color = '#fff3c4') {
    const v = this.v
    for (let i = 0; i < n; i++) {
      v.set((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4)
      this.sparkles.spawn(this.tmp.copy(pos).add({ x: (Math.random() - 0.5) * 3, y: Math.random() * 0.6, z: (Math.random() - 0.5) * 1.2 }), v, { life: 1.6 + Math.random() * 0.6, size: 0.25 + Math.random() * 0.15, color })
    }
  }

  /** Clear celebration particles before the next aim. */
  clearCelebration() {
    this.sparkles.clear()
  }

  /** "+3" or "⭐" floating up from a point in the world. */
  label(text, pos, color, big = false) {
    const p = this.tmp.copy(pos).project(this.camera)
    const el = document.createElement('div')
    el.className = 'float' + (big ? ' big' : '')
    el.textContent = text
    el.style.left = `${((p.x + 1) / 2) * 100}%`
    el.style.top = `${((1 - p.y) / 2) * 100}%`
    el.style.color = color
    this.labels.appendChild(el)
    el.addEventListener('animationend', () => el.remove())
  }

  update(dt) {
    this.snow.update(dt, this.camera)
    this.puffs.update(dt, this.camera)
    this.sparkles.update(dt, this.camera)
    this.shake = Math.max(0, this.shake - dt * 2.5)
  }
}
