import * as THREE from 'three'
import { rand } from './util.js'

/**
 * Juice: puffs of dust, carrot crumbs, sparkles, confetti, falling petals /
 * leaves / snow / fireflies, and "+1" pop-ups. Each kind of particle lives in
 * one pooled InstancedMesh, so nothing is allocated while playing.
 */
const colorCache = new Map()
const colorOf = (css) => colorCache.get(css) ?? colorCache.set(css, new THREE.Color(css)).get(css)
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

class Pool {
  constructor(scene, count, geometry, material, { gravity = 0, drag = 1 } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.mesh.frustumCulled = false
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, HIDDEN)
    scene.add(this.mesh)
    this.items = Array.from({ length: count }, () => ({
      alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), age: 0, life: 1, size: 1, shrink: true,
    }))
    this.next = 0
    this.gravity = gravity
    this.drag = drag
    this.dummy = new THREE.Object3D()
    this.anyAlive = false
  }

  spawn(p, v, { life = 0.6, size = 0.15, color = '#ffffff', spin = 4, shrink = true } = {}) {
    const i = this.next
    this.next = (i + 1) % this.items.length
    const it = this.items[i]
    it.alive = true
    it.p.copy(p)
    it.v.copy(v)
    it.rot.set(rand(0, 6), rand(0, 6), rand(0, 6))
    it.spin.set(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin))
    it.age = 0
    it.life = life
    it.size = size
    it.shrink = shrink
    this.mesh.setColorAt(i, colorOf(color))
    this.mesh.instanceColor.needsUpdate = true
    this.anyAlive = true
  }

  update(dt) {
    if (!this.anyAlive) return
    let any = false
    const d = this.dummy
    const drag = Math.pow(this.drag, dt)
    this.items.forEach((it, i) => {
      if (!it.alive) return
      it.age += dt
      if (it.age >= it.life) {
        it.alive = false
        this.mesh.setMatrixAt(i, HIDDEN)
        return
      }
      any = true
      it.v.y -= this.gravity * dt
      it.v.multiplyScalar(drag)
      it.p.addScaledVector(it.v, dt)
      it.rot.x += it.spin.x * dt
      it.rot.y += it.spin.y * dt
      it.rot.z += it.spin.z * dt
      const t = it.age / it.life
      // pop in quickly, then shrink away
      const k = Math.min(1, t * 8) * (it.shrink ? 1 - t * t : 1)
      d.position.copy(it.p)
      d.rotation.copy(it.rot)
      d.scale.setScalar(it.size * k)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    })
    this.mesh.instanceMatrix.needsUpdate = true
    this.anyAlive = any
  }
}

export class Effects {
  constructor(scene) {
    const soft = new THREE.MeshLambertMaterial({ color: '#ffffff' })
    const bright = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    this.dust = new Pool(scene, 80, new THREE.IcosahedronGeometry(1, 1), soft, { gravity: -0.6, drag: 0.15 })
    this.bits = new Pool(scene, 120, new THREE.BoxGeometry(1, 1, 1), soft, { gravity: 14, drag: 0.5 })
    this.sparks = new Pool(scene, 120, starGeometry(), bright, { gravity: 2, drag: 0.2 })
    this.confetti = new Pool(scene, 160, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshLambertMaterial({ color: '#fff', side: THREE.DoubleSide }), { gravity: 4, drag: 0.3 })
    this.v = new THREE.Vector3()
    this.p = new THREE.Vector3()
  }

  /** Dust kicked up by the feet: landing, taking off, skidding. */
  puff(at, count = 6, color = '#f3e2c0', power = 1) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      this.v.set(Math.cos(a) * rand(1, 2.5) * power - 1.5, rand(0.3, 1.2), Math.sin(a) * rand(0.6, 1.5) * power)
      this.p.set(at.x + rand(-0.2, 0.2), at.y + 0.08, at.z + rand(-0.2, 0.2))
      this.dust.spawn(this.p, this.v, { life: rand(0.35, 0.6), size: rand(0.1, 0.2) * power, color, spin: 0 })
    }
  }

  crumbs(at, color = '#ff8a1f') {
    for (let i = 0; i < 10; i++) {
      this.v.set(rand(-2.5, 2.5), rand(2, 5), rand(-2, 2))
      this.bits.spawn(at, this.v, { life: rand(0.4, 0.7), size: rand(0.06, 0.11), color: i % 4 ? color : '#4caf3a', spin: 10 })
    }
  }

  sparkle(at, count = 10, colors = ['#fff6a8', '#ffffff', '#ffd23f'], speed = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const b = rand(-1, 1)
      this.v.set(Math.cos(a) * speed * rand(0.5, 1), b * speed * 0.7 + 1, Math.sin(a) * speed * 0.5)
      this.sparks.spawn(at, this.v, { life: rand(0.4, 0.8), size: rand(0.08, 0.16), color: colors[i % colors.length], spin: 6 })
    }
  }

  /** Dizzy stars circling the bunny's head after a bump. */
  dizzy(at) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      this.p.set(at.x + Math.cos(a) * 0.5, at.y, at.z + Math.sin(a) * 0.5)
      this.v.set(-Math.sin(a) * 2, 1.5, Math.cos(a) * 2)
      this.sparks.spawn(this.p, this.v, { life: 0.8, size: 0.16, color: '#ffd23f', spin: 3, shrink: true })
    }
  }

  confettiBurst(at, count = 60) {
    const colors = ['#ff6b9d', '#ffd23f', '#36a8ff', '#8ac926', '#b28dff', '#ff8a1f']
    for (let i = 0; i < count; i++) {
      this.v.set(rand(-4, 4), rand(5, 10), rand(-3, 3))
      this.confetti.spawn(at, this.v, { life: rand(1.6, 2.6), size: rand(0.14, 0.24), color: colors[i % colors.length], spin: 8, shrink: false })
    }
  }

  /** A shake of leaves (or petals, or snow) drifting down from a poked tree. */
  leaves(at, color, count = 14) {
    for (let i = 0; i < count; i++) {
      this.p.set(at.x + rand(-0.6, 0.6), at.y + rand(-0.3, 0.3), at.z + rand(-0.4, 0.4))
      this.v.set(rand(-1.2, 1.2), rand(0.5, 2.5), rand(-0.6, 0.6))
      this.confetti.spawn(this.p, this.v, { life: rand(1.2, 1.8), size: rand(0.2, 0.32), color, spin: 5, shrink: true })
    }
  }

  update(dt) {
    this.dust.update(dt)
    this.bits.update(dt)
    this.sparks.update(dt)
    this.confetti.update(dt)
  }
}

/** A flat four-pointed twinkle. */
function starGeometry() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 0.35 : 1
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const g = new THREE.ShapeGeometry(shape)
  return g
}

/**
 * How each kind of weather looks and moves.
 *   fall: sink speed (negative floats up)   size: flake size   aspect: height / width
 *   tumble: turn over as it falls (else lie flat and spin)
 *   glow: wander about low down and twinkle, like fireflies
 */
const WRAP = 36 // width of the box the weather wraps around in

const WEATHER = {
  petals: { fall: 1, size: 0.14, aspect: 0.6, tumble: true, colors: ['#ffb3cf', '#ffffff', '#ffe08a'] },
  fireflies: { fall: -0.1, size: 0.09, aspect: 1, glow: true, colors: ['#fff59a', '#c9ff8a', '#fffbd0'] },
  leaves: { fall: 1.6, size: 0.2, aspect: 0.6, tumble: true, colors: ['#ff8c2a', '#ffb83a', '#e8513a', '#f2c230'] },
  snow: { fall: 1.3, size: 0.11, aspect: 1, colors: ['#ffffff'] },
}

/**
 * Weather that drifts across the view and wraps around the camera: petals in the
 * meadow, fireflies in the grove, leaves in the woods and snowflakes on the hills.
 */
export class Weather {
  constructor(scene, count = 70) {
    this.count = count
    const geo = new THREE.CircleGeometry(0.5, 8)
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide, transparent: true, opacity: 0.9, fog: false }), count)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
    this.items = Array.from({ length: count }, () => ({ p: new THREE.Vector3(), phase: rand(0, 6), speed: rand(0.6, 1.2), rot: rand(0, 6) }))
    this.dummy = new THREE.Object3D()
    this.kind = null
    this.look = WEATHER.petals
    this.fade = 0
    for (const it of this.items) this.respawn(it, 0)
  }

  /** Somewhere new in the box around centerX: up high, or low down for fireflies. */
  respawn(it, centerX) {
    it.p.set(centerX + rand(-WRAP / 2, WRAP / 2), this.look.glow ? rand(0.3, 4) : rand(4, 9), rand(-8, 5))
  }

  setKind(kind) {
    if (kind === this.kind) return
    this.kind = kind
    this.look = WEATHER[kind]
    const { colors } = this.look
    for (let i = 0; i < this.count; i++) this.mesh.setColorAt(i, colorOf(colors[i % colors.length]))
    this.mesh.instanceColor.needsUpdate = true
    this.fade = 0
  }

  /** Keep the flakes in a box in front of the camera. */
  update(dt, center, time) {
    const d = this.dummy
    this.fade = Math.min(1, this.fade + dt * 0.5)
    const { fall, size, aspect, tumble, glow } = this.look
    const W = WRAP
    this.items.forEach((it, i) => {
      it.p.y -= fall * it.speed * dt
      it.p.x += (glow ? Math.sin(time * 0.8 + it.phase) * 0.6 : -0.6 - Math.sin(time + it.phase) * 0.5) * dt
      it.p.z += Math.cos(time * 0.7 + it.phase) * 0.3 * dt
      // wrap around a box that follows the camera
      let x = it.p.x - center.x
      if (x < -W / 2 || x > W / 2 || it.p.y < -0.2 || it.p.y > 9) {
        this.respawn(it, center.x)
        if (x > W / 2 || x < -W / 2) it.p.x = center.x + (x < 0 ? W / 2 - rand(0, 2) : -W / 2 + rand(0, 2))
      }
      const twinkle = glow ? 0.6 + 0.4 * Math.sin(time * 4 + it.phase * 3) : 1
      d.position.copy(it.p)
      if (tumble) d.rotation.set(time * it.speed + it.rot, time * 0.7 * it.speed + it.phase, it.rot)
      else d.rotation.set(0, 0, it.rot)
      const k = size * twinkle * this.fade
      d.scale.set(k, k * aspect, k)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

/** "+1", "Yum!" and friends float up from a point in the 3D world. */
export class Popups {
  constructor(layer, camera) {
    this.layer = layer
    this.camera = camera
    this.v = new THREE.Vector3()
    this.counter = null
    this.minTop = 0 // px: words start below the score and trip bar, so they never hide behind them
  }

  /**
   * `count`: a running tally ("+1", "+2", "+3"…) that reuses the last one while it's
   * still showing, so a row of carrots counts up in one spot instead of piling up.
   */
  show(text, at, cls = '', count = false) {
    this.v.copy(at).project(this.camera)
    if (this.v.z > 1) return
    let el = count && this.counter?.isConnected ? this.counter : null
    if (el) {
      clearTimeout(el.timer)
      el.style.animation = 'none'
      void el.offsetWidth
      el.style.animation = ''
    } else {
      el = document.createElement('div')
      this.layer.appendChild(el)
    }
    if (count) this.counter = el
    el.className = `popup ${cls}`
    el.textContent = text
    // a little sideways jiggle, so quick words don't stack into one blob
    el.style.left = `calc(${((this.v.x + 1) / 2) * 100}% + ${count ? 0 : Math.round(rand(-22, 22))}px)`
    el.style.top = `${Math.max(this.minTop, ((1 - this.v.y) / 2) * innerHeight)}px`
    // A word that would land on the carrot count (both pushed down under the HUD
    // on a big hop) steps out to its right, so "+3" and "Yummy!" don't mash together.
    const c = this.counter
    if (!count && c?.isConnected && c !== el) {
      const gap = ((c.offsetWidth + el.offsetWidth) / 2) * 1.2 + 6 // they swell to 1.2x as they pop
      if (Math.abs(el.offsetLeft - c.offsetLeft) < gap && Math.abs(el.offsetTop - c.offsetTop) < (c.offsetHeight + el.offsetHeight) / 2) {
        el.style.left = `${c.offsetLeft + gap}px`
      }
    }
    el.timer = setTimeout(() => el.remove(), 1000)
  }
}

/**
 * Sunlight glinting on fresh snow: little stars lying about on the ground near
 * the camera that wink on and off. Shown only while `on` (the snowy hills).
 */
export class Glints {
  constructor(scene, count = 50) {
    this.count = count
    this.mesh = new THREE.InstancedMesh(
      starGeometry(),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false }),
      count,
    )
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.visible = false
    scene.add(this.mesh)
    this.items = Array.from({ length: count }, () => ({ p: new THREE.Vector3(), phase: rand(0, 6), rate: rand(0.5, 1.1), size: rand(0.2, 0.32), color: Math.random() < 0.5 ? '#ffffff' : '#9fdcff' }))
    this.items.forEach((it, i) => this.mesh.setColorAt(i, colorOf(it.color)))
    this.dummy = new THREE.Object3D()
    this.fade = 0
    this.placed = false
  }

  /** Scatter a glint across the snow in front of the path, and behind it a little. */
  place(it, x) {
    it.p.set(x, 0.06, Math.random() < 0.7 ? rand(1.8, 7) : rand(-4, -1.8))
  }

  update(dt, camera, time, on) {
    this.fade = THREE.MathUtils.clamp(this.fade + (on ? dt : -dt) * 0.6, 0, 1)
    this.mesh.visible = this.fade > 0
    if (!this.mesh.visible) {
      this.placed = false
      return
    }
    const cx = camera.position.x
    const d = this.dummy
    this.items.forEach((it, i) => {
      if (!this.placed) this.place(it, cx + rand(-WRAP / 2, WRAP / 2))
      else if (it.p.x < cx - WRAP / 2) this.place(it, cx + WRAP / 2 - rand(0, 3))
      // mostly hidden, then a quick bright wink
      const s = Math.max(0, Math.sin(time * 2.2 * it.rate + it.phase))
      const wink = s ** 4
      d.position.copy(it.p)
      d.quaternion.copy(camera.quaternion)
      d.rotateZ(time * 0.6 + it.phase)
      d.scale.setScalar(it.size * (0.15 + wink * 1.4) * this.fade)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    })
    this.placed = true
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
