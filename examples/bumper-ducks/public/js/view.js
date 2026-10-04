import * as THREE from 'three'
import { R, DUCKS } from './config.js'
import { FLY_TIME } from './sim.js'
import { canvasTexture } from './effects.js'
import { makeBubbleMaterial } from './water.js'

/**
 * Everything drawn from the Blender models: the ducks in their boats, the
 * pickups, the obstacles and each arena's scenery.
 */

/** Copies a model, giving its tintable rubber its own colour. */
export function cloneTinted(template, tints = {}) {
  const copy = template.clone(true)
  copy.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const out = mats.map((m) => {
      if (tints[m.name]) {
        const c = m.clone()
        c.color.set(tints[m.name])
        return c
      }
      return m
    })
    o.material = Array.isArray(o.material) ? out : out[0]
  })
  return copy
}

/** A soft dark spot under things floating on the water. */
const shadowTexture = canvasTexture(64, 64, (g, w) => {
  const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  grad.addColorStop(0, 'rgba(0,30,60,0.42)')
  grad.addColorStop(0.6, 'rgba(0,30,60,0.22)')
  grad.addColorStop(1, 'rgba(0,30,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, w, w)
})
const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })
const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
export function blobShadow(size) {
  const m = new THREE.Mesh(shadowGeometry, shadowMaterial)
  m.scale.set(size, 1, size)
  m.position.y = 0.03
  m.renderOrder = 1
  return m
}

/** A round badge with an emoji, floating above a duck so everyone knows who is who. */
export function emojiTag(emoji, me = false) {
  const tex = canvasTexture(128, 160, (g) => {
    g.fillStyle = me ? '#ffd23f' : 'rgba(255,255,255,0.92)'
    g.strokeStyle = me ? '#ff8a1f' : 'rgba(0,0,0,0.15)'
    g.lineWidth = 8
    g.beginPath()
    g.arc(64, 62, 52, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    // A little pointer underneath
    g.beginPath()
    g.moveTo(44, 106)
    g.lineTo(84, 106)
    g.lineTo(64, 150)
    g.closePath()
    g.fillStyle = me ? '#ff8a1f' : 'rgba(255,255,255,0.92)'
    g.fill()
    g.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(emoji, 64, 66)
  })
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set(1.1, 1.375, 1)
  s.renderOrder = 10
  return s
}

const bubbleMaterial = makeBubbleMaterial()
const bubbleGeometry = new THREE.SphereGeometry(0.55, 20, 14)
const shieldGeometry = new THREE.SphereGeometry(1, 24, 16)

export class DuckView {
  constructor(models, entry, { me = false, tint = 0 } = {}) {
    const look = DUCKS[entry.duck] ?? DUCKS.sunny
    const body = new THREE.Color(look.body)
    const ring = new THREE.Color(look.ring)
    // Two children on the same duck: the second gets a shifted colour.
    if (tint) {
      body.offsetHSL(0.07 * tint, 0, -0.06 * tint)
      ring.offsetHSL(0.12 * tint, 0, 0)
    }
    this.color = '#' + body.getHexString()
    this.root = new THREE.Group()
    this.tilt = new THREE.Group()
    this.spinner = new THREE.Group()
    this.root.add(this.tilt)
    this.tilt.add(this.spinner)
    this.boat = cloneTinted(models.boat, { boat_ring: ring })
    this.duck = cloneTinted(models.duck, { duck_body: body })
    this.duck.position.y = 0.12
    if (models[look.acc]) this.duck.add(models[look.acc].clone(true))
    this.spinner.add(this.boat, this.duck)
    this.shadow = blobShadow(3)
    this.root.add(this.shadow)
    if (me) {
      // A glowing ring on the water under your own duck.
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 1.6, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.85, depthWrite: false }),
      )
      this.ring.position.y = 0.05
      this.root.add(this.ring)
    }
    this.tag = emojiTag(entry.emoji ?? '🙂', me)
    this.tag.position.y = 2.7
    this.root.add(this.tag)
    this.shield = new THREE.Mesh(shieldGeometry, bubbleMaterial)
    this.shield.visible = false
    this.shield.position.y = 0.6
    this.root.add(this.shield)
    this.phase = Math.random() * 10
    this.squash = 0
    this.wakeT = 0
    this.hop = 0
  }

  bonked(strength = 1) {
    this.squash = Math.min(1, 0.5 + strength * 0.08)
  }

  update(d, t, dt, effects) {
    const root = this.root
    root.position.set(d.x, 0, d.z)
    let y = Math.sin(t * 2.4 + this.phase) * 0.06
    let flip = 0
    if (d.fly) {
      const k = Math.min(1, d.fly.t / FLY_TIME)
      y = Math.sin(Math.PI * k) * 4.8
      flip = k * Math.PI * 2
    }
    this.spinner.position.y = y
    this.spinner.rotation.y = d.h + d.spin
    // Lean into the paddling and bob on the waves.
    const sp = Math.hypot(d.vx, d.vz)
    const lean = Math.min(0.22, sp * 0.025)
    this.tilt.rotation.set(Math.cos(d.h) * lean * -0.6 + Math.sin(t * 1.9 + this.phase) * 0.04 + flip, 0, Math.sin(d.h) * lean * 0.6 + Math.cos(t * 2.1 + this.phase) * 0.04)
    this.squash = Math.max(0, this.squash - dt * 3)
    const sq = Math.sin(this.squash * Math.PI) * 0.22 * this.squash
    const s = d.scale
    this.spinner.scale.set(s * (1 + sq), s * (1 - sq), s * (1 + sq))
    this.shadow.scale.set(2.8 * s * (1 - Math.min(0.6, y * 0.1)), 1, 2.8 * s * (1 - Math.min(0.6, y * 0.1)))
    this.tag.position.y = 2.5 * s + 0.4 + y
    if (this.ring) {
      this.ring.visible = !d.fly
      this.ring.scale.setScalar(s * (1 + Math.sin(t * 5) * 0.05))
      this.ring.material.opacity = 0.6 + Math.sin(t * 5) * 0.25
    }
    this.shield.visible = d.power === 'shield'
    if (this.shield.visible) {
      const blink = d.powerT < 1.5 ? (Math.sin(t * 20) > 0 ? 1 : 0.85) : 1
      this.shield.scale.setScalar(1.75 * s * blink * (1 + Math.sin(t * 4) * 0.03))
      this.shield.position.y = 0.6 * s + y
    }
    // Foam behind a moving boat; sparkles behind a speedy one.
    this.wakeT -= dt
    if (!d.fly && sp > 2 && this.wakeT <= 0) {
      this.wakeT = 0.06
      const bx = d.x - (d.vx / sp) * 1.1 * s
      const bz = d.z - (d.vz / sp) * 1.1 * s
      effects.wake(bx, bz, sp)
      if (d.power === 'speedy') effects.sparkle(bx, 0.6, bz, '#ffe14d', 2)
    }
  }

  dispose() {
    this.root.removeFromParent()
    this.root.traverse((o) => {
      if (o.isSprite) {
        o.material.map.dispose()
        o.material.dispose()
      }
    })
  }
}

/** Bubbles, stars and gift boxes floating on the water. */
export class ItemView {
  constructor(models, item) {
    this.item = item
    this.root = new THREE.Group()
    this.root.position.set(item.x, 0, item.z)
    if (item.k === 'bubble') {
      this.body = new THREE.Mesh(bubbleGeometry, bubbleMaterial)
      this.base = 0.7
    } else if (item.k === 'star') {
      this.body = models.star.clone(true)
      this.body.scale.setScalar(0.85)
      this.base = 1.05
    } else {
      this.body = models.gift.clone(true)
      this.body.scale.setScalar(1.0)
      this.base = 0.15
    }
    this.root.add(this.body)
    this.root.add(blobShadow(item.k === 'bubble' ? 1.1 : 1.8))
    this.phase = Math.random() * 10
    this.age = 0
  }

  update(t, dt, effects) {
    this.age += dt
    const pop = Math.min(1, this.age * 3)
    const grow = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.4 : 1
    const s = pop * grow
    const k = this.item.k
    this.body.position.y = this.base + Math.sin(t * 2 + this.phase) * (k === 'gift' ? 0.08 : 0.18)
    if (k === 'bubble') this.body.scale.setScalar(s * (1 + Math.sin(t * 3 + this.phase) * 0.05))
    else if (k === 'star') {
      this.body.scale.setScalar(0.85 * s)
      this.body.rotation.y = Math.sin(t * 1.5 + this.phase) * 0.9
      if (Math.random() < dt * 4) effects.sparkle(this.item.x + (Math.random() - 0.5), 1.2 + Math.random(), this.item.z + (Math.random() - 0.5), '#fff3b0', 1)
    } else {
      this.body.scale.setScalar(s)
      this.body.rotation.y = t * 0.8 + this.phase
      this.body.rotation.z = Math.sin(t * 2 + this.phase) * 0.08
      if (Math.random() < dt * 3) effects.sparkle(this.item.x + (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, this.item.z + (Math.random() - 0.5) * 1.2, '#d6c8ff', 1)
    }
  }

  dispose() {
    this.root.removeFromParent()
  }
}

/** The big mama duck, lily pads with frogs, and paper boats. */
export class ObstacleView {
  constructor(models, o) {
    this.o = o
    this.root = new THREE.Group()
    this.root.position.set(o.x, 0, o.z)
    this.squash = 0
    this.phase = Math.random() * 10
    if (o.kind === 'mama') {
      this.body = cloneTinted(models.duck, { duck_body: '#ffd23f' })
      this.body.add(models.acc_bow.clone(true))
      this.body.scale.setScalar(2.7)
      this.body.position.y = -0.1
      this.root.add(blobShadow(5))
    } else if (o.kind === 'lily') {
      this.body = models.lily_pad.clone(true)
      this.body.rotation.y = Math.random() * 6
      if (o.frog) {
        this.frog = models.frog.clone(true)
        this.frog.position.y = 0.08
        this.frog.rotation.y = Math.atan2(-o.x, -o.z) + Math.PI + (Math.random() - 0.5)
        this.frog.scale.setScalar(1.2)
        this.root.add(this.frog)
      }
    } else {
      this.body = models.paper_boat.clone(true)
      this.body.scale.setScalar(1.3)
      this.root.add(blobShadow(2.6))
    }
    this.root.add(this.body)
    this.hopT = 0
  }

  bump() {
    this.squash = 1
    if (this.frog) this.hopT = 0.6
  }

  update(t, dt) {
    const o = this.o
    this.root.position.set(o.x, 0, o.z)
    this.squash = Math.max(0, this.squash - dt * 2.5)
    const sq = Math.sin(this.squash * Math.PI * 2) * 0.12 * this.squash
    if (o.kind === 'mama') {
      this.body.scale.set(2.7 * (1 + sq), 2.7 * (1 - sq), 2.7 * (1 + sq))
      this.body.rotation.z = Math.sin(t * 1.3) * 0.05
      this.body.rotation.y = Math.sin(t * 0.4) * 0.6
      this.body.position.y = -0.1 + Math.sin(t * 1.6) * 0.06
    } else if (o.kind === 'lily') {
      this.body.position.y = Math.sin(t * 1.5 + this.phase) * 0.03 - sq * 0.3
      this.body.rotation.y += dt * 0.05
      if (this.frog) {
        this.hopT = Math.max(0, this.hopT - dt)
        // Hop when bumped, and now and then just for fun.
        if (this.hopT === 0 && Math.random() < dt * 0.15) this.hopT = 0.6
        const k = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.6) * Math.PI) : 0
        this.frog.position.y = 0.08 + k * 1.2
        this.frog.scale.set(1.2 * (1 - k * 0.1), 1.2 * (1 + k * 0.2), 1.2 * (1 - k * 0.1))
      }
    } else {
      if (Math.hypot(o.vx, o.vz) > 0.05) this.body.rotation.y = Math.atan2(o.vx, o.vz)
      this.body.rotation.z = Math.sin(t * 2 + this.phase) * 0.08
      this.body.position.y = Math.sin(t * 1.7 + this.phase) * 0.05
    }
  }

  dispose() {
    this.root.removeFromParent()
  }
}

/** Sky gradient behind each arena. */
export function skyTexture([top, bottom]) {
  return canvasTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, top)
    grad.addColorStop(1, bottom)
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  })
}

/** Falling rain lines for the puddle. */
export class Rain {
  constructor(scene, count = 400) {
    this.count = count
    const pos = new Float32Array(count * 6)
    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.drops = Array.from({ length: count }, () => this.reset({}, true))
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }))
    this.lines.frustumCulled = false
    scene.add(this.lines)
  }

  reset(d, anywhere = false) {
    d.x = (Math.random() - 0.5) * 2 * (R + 6)
    d.z = (Math.random() - 0.5) * 2 * (R + 6)
    d.y = anywhere ? Math.random() * 18 : 16 + Math.random() * 4
    d.v = 18 + Math.random() * 6
    return d
  }

  update(dt, onSplash) {
    const pos = this.geo.attributes.position.array
    this.drops.forEach((d, i) => {
      d.y -= d.v * dt
      d.x -= dt * 1.5
      if (d.y < 0) {
        if (Math.hypot(d.x, d.z) < R && Math.random() < 0.06) onSplash(d.x, d.z)
        this.reset(d)
      }
      pos.set([d.x, d.y, d.z, d.x + 0.06, d.y + 0.7, d.z], i * 6)
    })
    this.geo.attributes.position.needsUpdate = true
  }

  dispose() {
    this.lines.removeFromParent()
    this.geo.dispose()
  }
}
