import * as THREE from 'three'

/**
 * Pop juice: confetti, rubber shreds, puffs, sparkles, shock rings, falling
 * strings and floating "+1" labels. Particles live in pooled InstancedMeshes so
 * a twenty-balloon star blast stays smooth on a tablet.
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

// A cartoon smoke puff: a soft ball, shaded underneath with a fluffy rim, so it reads against the pale sky.
// A cartoon smoke puff: a soft ball shaded lilac underneath, so it reads against the pale sky.
const puffTex = canvasTexture(64, 64, (g, s) => {
  const grad = g.createRadialGradient(s * 0.4, s * 0.36, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.55, 'rgba(236,233,246,1)')
  grad.addColorStop(0.82, 'rgba(196,190,218,0.95)')
  grad.addColorStop(1, 'rgba(196,190,218,0)')
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

const CONFETTI = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff6b9d', '#2ec4b6', '#ffffff']
const pick = (a) => a[(Math.random() * a.length) | 0]

export class Effects {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.confetti = new Pool(scene, {
      count: 700,
      geometry: new THREE.PlaneGeometry(0.2, 0.12),
      material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      gravity: 4.5,
      drag: 1.6,
    })
    // Curled scraps of balloon rubber
    const shred = new THREE.CircleGeometry(0.22, 5, 0, Math.PI * 0.9)
    this.shreds = new Pool(scene, {
      count: 200,
      geometry: shred,
      material: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.3 }),
      gravity: 7,
      drag: 1.2,
    })
    this.puffs = new Pool(scene, {
      count: 160,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0.6 }),
      drag: 3,
      grow: 2.2,
      billboard: true,
    })
    this.smokePuffs = new Pool(scene, {
      count: 40,
      geometry: new THREE.PlaneGeometry(1, 1),
      material: new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthWrite: false }),
      drag: 0.4,
      grow: 1.8,
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
    this.rings = []
    const ringGeo = new THREE.RingGeometry(0.8, 1, 40)
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }))
      m.visible = false
      m.userData.age = 1
      scene.add(m)
      this.rings.push(m)
    }
    this.ringNext = 0
    this.falling = []
    this.labels = document.getElementById('labels')
    this.shake = 0
    this.tmp = new THREE.Vector3()
  }

  ring(pos, color, size = 1.6, life = 0.4) {
    const r = this.rings[this.ringNext]
    this.ringNext = (this.ringNext + 1) % this.rings.length
    r.position.copy(pos)
    r.material.color.set(color)
    r.userData = { age: 0, life, size }
    r.visible = true
  }

  /** The main pop: a ring, rubber shreds in the balloon's colour, a puff and a fistful of confetti. */
  pop(pos, color, { big = false, gold = false } = {}) {
    const v = this.tmp
    this.ring(pos, color, big ? 3 : 1.8)
    for (let i = 0; i < (big ? 14 : 8); i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 4)
      this.shreds.spawn(pos, v, { life: 0.9 + Math.random() * 0.4, size: 0.6 + Math.random() * 0.8, color, spin: 10 })
    }
    for (let i = 0; i < 5; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(2)
      this.puffs.spawn(pos, v, { life: 0.45, size: 0.8 + Math.random() * 0.5, color: '#ffffff' })
    }
    for (let i = 0; i < (big ? 50 : 22); i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 6)
      this.confetti.spawn(pos, v, { life: 1.4 + Math.random() * 0.8, size: 0.8 + Math.random() * 0.6, color: gold ? pick(['#ffd23f', '#fff1a8', '#ffb300']) : pick(CONFETTI), spin: 8 })
    }
    if (gold || big) {
      for (let i = 0; i < 24; i++) {
        v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 5)
        this.sparkles.spawn(pos, v, { life: 0.8 + Math.random() * 0.5, size: 0.4 + Math.random() * 0.5, color: gold ? '#ffe680' : pick(CONFETTI) })
      }
    }
  }

  /** A celebration shower of confetti from the top of the screen. */
  shower(halfWidth, top, amount = 160) {
    const p = this.tmp.clone()
    const v = new THREE.Vector3()
    for (let i = 0; i < amount; i++) {
      p.set((Math.random() * 2 - 1) * halfWidth, top + Math.random() * 3, Math.random() * 2 - 1)
      v.set((Math.random() - 0.5) * 2, -Math.random() * 2, 0)
      this.confetti.spawn(p, v, { life: 3 + Math.random() * 1.5, size: 1 + Math.random() * 0.5, color: pick(CONFETTI), spin: 6 })
    }
  }

  /** A few twinkles; `scale` makes them bigger and faster for far-away things like the hot-air balloon. */
  sparkleAt(pos, color = '#ffffff', n = 3, scale = 1) {
    const v = this.tmp
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(1.5 * scale)
      this.sparkles.spawn(pos, v, { life: 0.6, size: (0.3 + Math.random() * 0.3) * scale, color })
    }
  }

  /** A tapped house: soft puffs of smoke rise from its chimney. */
  smoke(pos) {
    const v = this.tmp.clone()
    // A little trail of growing puffs that drifts up and away with the breeze
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        v.set(0.9 + Math.random() * 0.4, 2.6 + Math.random() * 0.6, 0)
        this.smokePuffs.spawn(pos, v, { life: 2.2, size: 0.75 + Math.random() * 0.25 })
      }, i * 230)
    }
  }

  /** A tapped tree: a burst of leaves (and the odd blossom) flutters out of its crown. */
  leaves(at) {
    const pos = at.clone().setZ(at.z + 1.2) // just in front of the leaves, so none hide inside
    const v = this.tmp
    for (let i = 0; i < 22; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 3)
      const color = i % 6 === 5 ? '#ff9ec4' : pick(['#3fae4a', '#6cc551', '#8bd86a'])
      this.confetti.spawn(pos, v, { life: 1.6 + Math.random() * 0.6, size: 2.8 + Math.random() * 1.2, color, spin: 5 })
    }
  }

  /** A popped balloon lets go of its string (or its crown, with a little hop), which tumbles down out of view. */
  dropString(mesh, hop = 1.2) {
    mesh.updateWorldMatrix(true, false)
    mesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale)
    mesh.removeFromParent()
    this.scene.add(mesh)
    mesh.userData.fall = { vy: hop, spin: (Math.random() - 0.5) * 3, age: 0 }
    this.falling.push(mesh)
  }

  /** "+1" in the balloon's colour, floating up from where it popped. */
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
    this.confetti.update(dt, this.camera)
    this.shreds.update(dt, this.camera)
    this.puffs.update(dt, this.camera)
    this.smokePuffs.update(dt, this.camera)
    this.sparkles.update(dt, this.camera)
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
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const m = this.falling[i]
      const f = m.userData.fall
      f.age += dt
      f.vy -= 9 * dt
      m.position.y += f.vy * dt
      m.rotation.z += f.spin * dt
      if (f.age > 2) {
        m.removeFromParent()
        this.falling.splice(i, 1)
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5)
  }
}
