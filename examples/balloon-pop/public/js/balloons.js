import * as THREE from 'three'

/**
 * Balloon kinds, built from the nodes in models/balloons.glb (see
 * blender/models.py). Only the "balloon_skin" material is tinted; faces,
 * stripes and strings keep their baked colours.
 */
export const PALETTE = ['#ff595e', '#ff9f1c', '#ffd23f', '#8ac926', '#2ec4b6', '#4d96ff', '#9b5de5', '#ff6b9d']

export const KINDS = {
  round: { model: 'balloon_round', points: 1, colors: PALETTE, hit: 1.1 },
  smile: { model: 'balloon_smile', points: 1, colors: PALETTE, hit: 1.1 },
  heart: { model: 'balloon_heart', points: 2, colors: ['#ff4d6d', '#ff6b9d', '#c77dff', '#ff8fab'], hit: 1.2 },
  gold: { model: 'balloon_round', points: 5, colors: ['#ffd23f'], gold: true, hit: 1.15 },
  bunny: { model: 'balloon_bunny', points: 3, colors: ['#ffffff', '#ffd6e7', '#e0d4ff', '#d4f1ff'], hit: 1.2 },
  star: { model: 'balloon_star', points: 3, colors: ['#ffd23f'], hit: 1.35, power: 'star' },
  rainbow: { model: 'balloon_rainbow', points: 2, colors: ['#ff595e'], hit: 1.15, power: 'rainbow' },
  mini: { model: 'balloon_round', points: 1, colors: PALETTE, hit: 1.1, scale: 0.55 },
}

export class Balloons {
  constructor(scene) {
    this.scene = scene
    this.list = []
    this.templates = {}
    this.skins = new Map()
    this.baseSkin = null
  }

  attach(gltf) {
    for (const kind of Object.values(KINDS)) {
      if (this.templates[kind.model]) continue
      const node = gltf.scene.getObjectByName(kind.model)
      if (!node) continue
      node.traverse((o) => {
        if (!o.isMesh) return
        if (o.material.name === 'balloon_skin') {
          o.userData.skin = true
          this.baseSkin ??= o.material
        } else if (o.material.name === 'balloon_string') {
          // Pivot the string about its top so it can swing from the knot.
          o.geometry.computeBoundingBox()
          const top = o.geometry.boundingBox.max.y
          o.geometry.translate(0, -top, 0)
          o.position.y += top
          o.userData.string = true
        }
      })
      node.position.set(0, 0, 0)
      this.templates[kind.model] = node
    }
  }

  skin(color, gold) {
    const key = color + (gold ? 'g' : '')
    let m = this.skins.get(key)
    if (!m) {
      m = this.baseSkin ? this.baseSkin.clone() : new THREE.MeshStandardMaterial()
      m.color.set(color)
      m.roughness = gold ? 0.2 : 0.3
      m.metalness = gold ? 0.45 : 0
      m.envMapIntensity = gold ? 1.4 : 0.9
      if (gold) m.emissive = new THREE.Color('#8a5c00')
      this.skins.set(key, m)
    }
    return m
  }

  /** A fresh balloon of the given kind, placed by the caller. */
  make(kindName, { color, scale = 1 } = {}) {
    const kind = KINDS[kindName]
    const template = this.templates[kind.model]
    const group = template ? template.clone(true) : this.fallback()
    color ??= kind.colors[(Math.random() * kind.colors.length) | 0]
    let string = null
    group.traverse((o) => {
      if (!o.isMesh) return
      if (o.userData.skin) o.material = this.skin(color, kind.gold)
      if (o.userData.string) string = o
    })
    const s = scale * (kind.scale ?? 1)
    group.scale.setScalar(s)
    const b = {
      group, kindName, kind, color, string, scale: s,
      speed: 1, phase: Math.random() * 10, age: 0, vx: 0, vy: 0, alive: true,
    }
    this.scene.add(group)
    this.list.push(b)
    return b
  }

  /** Used only if the model file failed to load. */
  fallback() {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial())
    body.scale.set(1, 1.15, 1)
    body.userData.skin = true
    g.add(body)
    return g
  }

  remove(b) {
    b.alive = false
    b.group.removeFromParent()
    const i = this.list.indexOf(b)
    if (i >= 0) this.list.splice(i, 1)
  }

  clear() {
    for (const b of [...this.list]) this.remove(b)
  }

  update(dt, t, top) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]
      b.age += dt
      const g = b.group
      let rise = b.speed
      if (b.kindName === 'bunny') rise *= 0.35 + 1.6 * Math.max(0, Math.sin(t * 3.2 + b.phase)) ** 2
      // Flung balloons (rainbow babies) coast out, then float up
      b.vx *= Math.max(0, 1 - 2.5 * dt)
      b.vy *= Math.max(0, 1 - 2.5 * dt)
      g.position.x += (b.vx + Math.sin(t * 1.3 + b.phase) * 0.35) * dt
      g.position.y += (rise + b.vy) * dt
      g.rotation.z = Math.sin(t * 1.7 + b.phase) * 0.12 - b.vx * 0.05
      if (b.kindName === 'star') g.rotation.y = Math.sin(t * 1.5 + b.phase) * 0.5
      else g.rotation.y = Math.sin(t * 0.9 + b.phase) * 0.25
      // Squash and stretch: a little breathing, a heartbeat for hearts, and a pop-in when born
      const born = Math.min(1, b.age * 4)
      const grow = born < 1 ? 1 - (1 - born) ** 3 * 0.6 + Math.sin(born * Math.PI) * 0.12 : 1
      let breathe = Math.sin(t * 3 + b.phase) * 0.025
      if (b.kindName === 'heart') breathe = Math.max(0, Math.sin(t * 5 + b.phase)) ** 8 * 0.1
      g.scale.set(b.scale * grow * (1 - breathe * 0.5), b.scale * grow * (1 + breathe), b.scale * grow)
      if (b.string) b.string.rotation.z = Math.sin(t * 2.1 + b.phase) * 0.18 + b.vx * 0.08
      if (g.position.y > top + 2.5 * b.scale) this.remove(b)
    }
  }
}
