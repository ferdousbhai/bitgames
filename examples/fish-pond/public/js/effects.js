import * as THREE from 'three'

/**
 * Splashes, ripples, bubbles and sparkles. Particles live in pooled
 * InstancedMeshes, so a big splash stays smooth on a tablet.
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
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

export const starTex = canvasTexture(64, 64, (g, s) => {
  g.translate(s / 2, s / 2)
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0.0)')
  g.fillStyle = grad
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const r = i % 2 ? s * 0.1 : s * 0.5
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.fill()
})

const ringTex = canvasTexture(128, 128, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.85, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

const colors = new Map()
const colorOf = (css) => colors.get(css) ?? colors.set(css, new THREE.Color(css)).get(css)
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

export class Pool {
  constructor(scene, { count, geometry, material, gravity = 0, drag = 0, grow = 0, billboard = false, floor = -Infinity, buoyant = false }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.mesh.renderOrder = 5
    scene.add(this.mesh)
    this.slots = Array.from({ length: count }, () => ({
      alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spinAxis: new THREE.Vector3(),
      life: 1, age: 0, size: 1, spin: 0, phase: 0,
    }))
    this.next = 0
    Object.assign(this, { gravity, drag, grow, billboard, floor, buoyant })
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
    it.spinAxis.set(Math.random() + 0.3, Math.random(), Math.random() * 0.5)
    Object.assign(it, { life, age: 0, size, spin, phase: Math.random() * 6 })
    this.mesh.setColorAt(i, colorOf(color))
    this.mesh.instanceColor.needsUpdate = true
    this.mesh.count = Math.max(this.mesh.count, i + 1)
  }

  update(dt, camera, t) {
    const d = this.dummy
    let any = false
    for (let i = 0; i < this.mesh.count; i++) {
      const it = this.slots[i]
      if (!it.alive) continue
      any = true
      it.age += dt
      if (it.age >= it.life || it.p.y < this.floor) {
        it.alive = false
        this.mesh.setMatrixAt(i, HIDDEN)
        continue
      }
      it.v.y -= this.gravity * dt
      it.v.multiplyScalar(Math.max(0, 1 - this.drag * dt))
      it.p.addScaledVector(it.v, dt)
      if (this.buoyant) it.p.x += Math.sin(t * 6 + it.phase) * 0.15 * dt
      const k = it.age / it.life
      d.position.copy(it.p)
      if (this.billboard) d.quaternion.copy(camera.quaternion)
      else {
        it.rot.x += it.spin * it.spinAxis.x * dt
        it.rot.y += it.spin * it.spinAxis.y * dt
        it.rot.z += it.spin * it.spinAxis.z * dt
        d.rotation.copy(it.rot)
      }
      const s = it.size * (1 + this.grow * k) * Math.min(1, (1 - k) * 3, it.age * 12 + 0.2)
      d.scale.setScalar(Math.max(s, 0.0001))
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true
  }
}

const pick = (a) => a[(Math.random() * a.length) | 0]

export class Effects {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.drops = new Pool(scene, {
      count: 400,
      geometry: new THREE.IcosahedronGeometry(0.5, 1),
      material: new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0, transparent: true, opacity: 0.85 }),
      gravity: 11,
      drag: 0.4,
      floor: -0.1,
    })
    this.puffs = new Pool(scene, {
      count: 120,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0.7 }),
      drag: 3,
      grow: 1.8,
      billboard: true,
    })
    this.sparkles = new Pool(scene, {
      count: 300,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      gravity: 1.2,
      drag: 1.5,
      billboard: true,
    })
    this.bubbles = new Pool(scene, {
      count: 160,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0.9 }),
      gravity: -1.5,
      drag: 1.2,
      billboard: true,
      buoyant: true,
    })
    // Ripples: flat rings lying on the water
    this.rings = []
    const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0 }))
      m.visible = false
      m.renderOrder = 3
      m.userData = { age: 1, life: 1, size: 1 }
      scene.add(m)
      this.rings.push(m)
    }
    this.ringNext = 0
    this.labels = document.getElementById('labels')
    this.shake = 0
    this.tmp = new THREE.Vector3()
    this.tmp2 = new THREE.Vector3()
  }

  ripple(pos, size = 1, life = 1.2, y = 0.03) {
    const r = this.rings[this.ringNext]
    this.ringNext = (this.ringNext + 1) % this.rings.length
    r.position.set(pos.x, y, pos.z)
    r.userData = { age: 0, life, size }
    r.visible = true
  }

  /** A watery splash: droplets, a puff of spray and rings. */
  splash(pos, big = 1) {
    const v = this.tmp
    const p = this.tmp2.set(pos.x, 0.05, pos.z)
    for (let i = 0; i < 30 * big; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random()
      v.set(Math.cos(a) * r * 2.4 * big, 3 + Math.random() * 4 * big, Math.sin(a) * r * 2.4 * big)
      this.drops.spawn(p, v, { life: 1.4, size: 0.06 + Math.random() * 0.08, color: pick(['#ffffff', '#d9f3ff', '#bfe9ff']) })
    }
    for (let i = 0; i < 6 * big; i++) {
      v.set((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2)
      this.puffs.spawn(p, v, { life: 0.6, size: 0.6 + Math.random() * 0.6 * big, color: '#ffffff' })
    }
    this.ripple(pos, 1.2 * big, 1.0)
    this.ripple(pos, 2.2 * big, 1.6)
  }

  /** A small plop where the bobber lands. */
  plop(pos) {
    const v = this.tmp
    const p = this.tmp2.set(pos.x, 0.05, pos.z)
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      v.set(Math.cos(a) * 0.9, 1.8 + Math.random() * 1.5, Math.sin(a) * 0.9)
      this.drops.spawn(p, v, { life: 1, size: 0.04 + Math.random() * 0.04, color: '#ffffff' })
    }
    this.ripple(pos, 0.9, 1.0)
    this.ripple(pos, 1.5, 1.5)
  }

  bubble(pos, n = 1, spread = 0.2) {
    const v = this.tmp
    for (let i = 0; i < n; i++) {
      this.tmp2.set(pos.x + (Math.random() - 0.5) * spread, pos.y, pos.z + (Math.random() - 0.5) * spread)
      v.set(0, 0.3 + Math.random() * 0.4, 0)
      this.bubbles.spawn(this.tmp2, v, { life: 0.9 + Math.random() * 0.5, size: 0.08 + Math.random() * 0.1, color: '#ffffff' })
    }
  }

  sparkleAt(pos, color = '#ffffff', n = 3, speed = 1.5, size = 0.3) {
    const v = this.tmp
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(speed)
      this.sparkles.spawn(pos, v, { life: 0.7 + Math.random() * 0.4, size: size + Math.random() * size, color })
    }
  }

  /** "+1" or an emoji floating up from a point in the world. */
  label(text, pos, { color = '#ffffff', cls = '' } = {}) {
    const p = this.tmp.copy(pos).project(this.camera)
    const el = document.createElement('div')
    el.className = `float ${cls}`
    el.textContent = text
    el.style.left = `${((p.x + 1) / 2) * 100}%`
    el.style.top = `${((1 - p.y) / 2) * 100}%`
    el.style.color = color
    this.labels.appendChild(el)
    el.addEventListener('animationend', () => el.remove())
  }

  update(dt, t) {
    this.drops.update(dt, this.camera, t)
    this.puffs.update(dt, this.camera, t)
    this.sparkles.update(dt, this.camera, t)
    this.bubbles.update(dt, this.camera, t)
    for (const r of this.rings) {
      if (!r.visible) continue
      const u = r.userData
      u.age += dt
      const k = u.age / u.life
      if (k >= 1) {
        r.visible = false
        continue
      }
      r.scale.setScalar(0.15 + u.size * (1 - (1 - k) ** 2.5))
      r.material.opacity = (1 - k) * 0.85
    }
    this.shake = Math.max(0, this.shake - dt * 2.5)
  }
}
