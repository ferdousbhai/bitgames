import * as THREE from 'three'

/**
 * Party juice: paper petals and confetti, icing splats, puffs of smoke and flour,
 * sparkles and shock rings. Particles live in pooled InstancedMeshes so
 * they stay smooth on a tablet.
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

const softDot = canvasTexture(64, 64, (g, s) => {
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
      life: 1, age: 0, size: 1, spin: 0,
    }))
    this.next = 0
    Object.assign(this, { gravity, drag, grow, billboard })
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
    Object.assign(it, { life, age: 0, size, spin })
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
}

// Soft bakery pastels for the party petals
const PETALS = ['#ffc2d6', '#ffe8a3', '#c9f0e1', '#d9ccff', '#ffffff']
const CONFETTI = ['#ff6fae', '#ffd23f', '#4fd1b5', '#9b7cf7', '#7bc8ff', '#ffb347', '#ffffff']
const pick = (a) => a[(Math.random() * a.length) | 0]

export class Effects {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    // Slow paper petals for the one soft party moment: barely any gravity, lots of air
    this.petals = new Pool(scene, {
      count: 80,
      geometry: new THREE.PlaneGeometry(0.15, 0.09),
      material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      gravity: 0.25,
      drag: 0.6,
    })
    // Party-popper confetti: shot up, then flutters down a little faster than the petals
    this.confettiPool = new Pool(scene, {
      count: 120,
      geometry: new THREE.PlaneGeometry(0.12, 0.07),
      material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      gravity: 2.2,
      drag: 1.6,
    })
    // Squishy blobs of icing
    const blob = new THREE.IcosahedronGeometry(0.08, 1)
    blob.scale(1, 0.7, 1)
    this.blobs = new Pool(scene, {
      count: 200,
      geometry: blob,
      material: new THREE.MeshStandardMaterial({ roughness: 0.35 }),
      gravity: 9,
      drag: 0.8,
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
      count: 300,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      gravity: 1.5,
      drag: 1.5,
      billboard: true,
    })
    // Firework stars: normal blending, so their colours stay rich instead of washing out to white
    this.glints = new Pool(scene, {
      count: 420,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, toneMapped: false }),
      gravity: 0.5,
      drag: 1.1,
      billboard: true,
    })
    this.rings = []
    const ringGeo = new THREE.RingGeometry(0.8, 1, 40)
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
      m.visible = false
      m.userData.age = 1
      scene.add(m)
      this.rings.push(m)
    }
    this.ringNext = 0
    this.tmp = new THREE.Vector3()
  }

  ring(pos, color, size = 1.6, life = 0.4, flat = false) {
    const r = this.rings[this.ringNext]
    this.ringNext = (this.ringNext + 1) % this.rings.length
    r.position.copy(pos)
    r.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0)
    r.material.color.set(color)
    r.userData = { age: 0, life, size }
    r.visible = true
  }

  /** Icing splats out of the side of a squished layer, mostly in direction dir (+1 right, -1 left). */
  splat(pos, color, dir = 1, amount = 14, reach = 1) {
    const v = this.tmp
    for (let i = 0; i < amount; i++) {
      // Small blobs that fly sideways and up, barely toward the camera, so none looms large in front of the scene
      // ...and they stay near the cake, so none flies across the birthday friend's face.
      v.set(dir * reach * (0.3 + Math.random() * 0.6), 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6)
      this.blobs.spawn(pos, v, { life: 0.7 + Math.random() * 0.4, size: 0.3 + Math.random() * 0.45, color, spin: 6 })
    }
    for (let i = 0; i < 3; i++) {
      v.set(dir * reach * Math.random() * 1.2, Math.random(), 0.1)
      this.puffs.spawn(pos, v, { life: 0.45, size: 0.25 + Math.random() * 0.2, color: '#ffffff' })
    }
  }

  /** "Perfect!" burst: a golden ring around the layer and stars. */
  perfect(pos, width) {
    this.ring(pos, '#fff3a0', width * 0.9, 0.5, true)
    const v = this.tmp
    // A few soft sparkles that rise slowly, not a burst
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      v.set(Math.cos(a) * 0.8, 0.6 + Math.random() * 0.5, Math.sin(a) * 0.8)
      this.sparkles.spawn(pos, v, { life: 1 + Math.random() * 0.4, size: 0.2 + Math.random() * 0.15, color: pick(['#fff3a0', '#ffd23f', '#ffffff', '#ffb3d1']) })
    }
  }

  /** A puff of grey smoke as a candle goes out. */
  smoke(pos) {
    const v = this.tmp
    for (let i = 0; i < 5; i++) {
      v.set((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3)
      this.puffs.spawn(pos, v, { life: 0.9 + Math.random() * 0.4, size: 0.12 + Math.random() * 0.1, color: '#d7d3dc' })
    }
  }

  /** Breath from a customer's mouth toward the candles. */
  breath(from, to) {
    const v = this.tmp
    for (let i = 0; i < 10; i++) {
      v.subVectors(to, from).multiplyScalar(1.6 + Math.random() * 0.8)
      v.y += (Math.random() - 0.5) * 0.8
      v.z += (Math.random() - 0.5) * 0.8
      this.puffs.spawn(from, v, { life: 0.55, size: 0.12 + Math.random() * 0.12, color: '#ffffff' })
    }
  }

  /** The one soft party moment: a few paper petals that float down slowly, with no burst. */
  drift(halfWidth, top, amount = 24, cx = 0) {
    const p = this.tmp.clone()
    const v = new THREE.Vector3()
    for (let i = 0; i < amount; i++) {
      p.set(cx + (Math.random() * 2 - 1) * halfWidth, top + Math.random() * 1.5, Math.random() * 1.2 - 0.4)
      v.set((Math.random() - 0.5) * 0.4, -0.2 - Math.random() * 0.3, 0)
      this.petals.spawn(p, v, { life: 4 + Math.random() * 1.5, size: 0.8 + Math.random() * 0.4, color: pick(PETALS), spin: 1.2 })
    }
  }

  /** A party popper: a fan of paper confetti shot up and inward from one side (dir +1 shoots right). */
  confetti(pos, dir = 1, amount = 40) {
    const v = new THREE.Vector3()
    for (let i = 0; i < amount; i++) {
      v.set(dir * (1 + Math.random() * 2.5), 5 + Math.random() * 3, (Math.random() - 0.5) * 1.2)
      this.confettiPool.spawn(pos, v, { life: 3 + Math.random() * 1.5, size: 0.7 + Math.random() * 0.5, color: pick(CONFETTI), spin: 4 })
    }
  }

  /** A firework bloom: a big ring of coloured stars drifting out and fading slowly (no flash). */
  bloom(pos, color, n = 40) {
    const v = this.tmp
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      v.set(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.5).multiplyScalar(2 + Math.random() * 0.6)
      this.glints.spawn(pos, v, { life: 1.6 + Math.random() * 0.5, size: 0.32 + Math.random() * 0.14, color })
    }
  }

  sparkleAt(pos, color = '#ffffff', n = 3) {
    const v = this.tmp
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(1.5)
      this.sparkles.spawn(pos, v, { life: 0.6, size: 0.3 + Math.random() * 0.3, color })
    }
  }

  update(dt) {
    this.petals.update(dt, this.camera)
    this.confettiPool.update(dt, this.camera)
    this.blobs.update(dt, this.camera)
    this.puffs.update(dt, this.camera)
    this.sparkles.update(dt, this.camera)
    this.glints.update(dt, this.camera)
    for (const r of this.rings) {
      if (!r.visible) continue
      const u = r.userData
      u.age += dt
      const t = u.age / u.life
      if (t >= 1) {
        r.visible = false
        continue
      }
      r.scale.setScalar(0.3 + u.size * (1 - (1 - t) ** 3))
      r.material.opacity = 1 - t
    }
  }
}
