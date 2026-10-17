import * as THREE from 'three'
import { canvasTexture } from './effects.js'

/** Half the view's width and height at depth z, so things tuck into corners on any screen. */
export function halfSize(camera, z = 0) {
  const h = Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - z)
  return { w: h * camera.aspect, h }
}

/**
 * The countryside behind the balloons (models/world.glb, built by
 * blender/models.py): hills, houses, a windmill, grazing sheep, a drifting
 * hot-air balloon, clouds and a smiling sun, under a soft gradient sky.
 */
const WORLD_Y = -8 // the hills sit along the bottom of the screen
const SUN_Z = -20 // in front of the clouds, so they never hide its face
const SUN_RADIUS = 2.2 // the sun's size with its rays, in model units
// The hot-air balloon flies just in front of the clouds (they sit at -22 to -36), so it never hides behind one.
const HAB_Z = -21
const HAB_FAR = (14 - HAB_Z) / 44 // keeps its old on-screen size and height from when it flew at z = -30 (camera at 14)
// Houses and trees are baked into the landscape mesh, so their tap spots mirror blender/models.py
// (Blender x, y, z -> three x, z, -y): [x, y, ground z, scale].
const HOUSES = [[-6, 17, 3.1, 1.6], [2.5, 18.5, 3.6, 1.4], [20, 17, 3.2, 1.5], [-24, 17, 3.0, 1.4]]
const TREES = [[-11, 16, 2.8, 1.5], [-15, 17.5, 3.4, 1.7], [8, 17, 3.6, 1.5], [13, 16, 2.6, 1.4], [26, 17, 2.6, 1.6],
  [-30, 17, 2.4, 1.6], [33, 18, 2.4, 1.3], [-19, 5.5, 1.0, 1.4], [14, 6.5, 1.0, 1.5], [31, 5.5, 0.9, 1.3],
  [-37, 6, 0.6, 1.4], [40, 6, 0.6, 1.4], [-3, 19, 4.6, 1.3], [16, 18.5, 3.9, 1.2],
  [-34, 33, 7.0, 2.2], [-26, 32, 8.0, 2.0], [0, 35, 9.5, 2.3], [24, 33, 7.5, 2.1], [45, 32, 6.0, 2.0]]
/** A tap oval around part of the landscape: centre (local to the world root) and half-size, in model units. */
const spot = (x, y, z, w, h) => ({ center: new THREE.Vector3(x, z, -y), w, h })
const box = new THREE.Box3()
const center = new THREE.Vector3()
const size = new THREE.Vector3()
const tmp = new THREE.Vector3()

/**
 * Sky moods: the top, middle and horizon of the sky, the clouds' tint and how many stars show. A themed sky
 * eases into its own mood: warm gold, a lilac bunny sky, pink clouds for hearts, a minty day of giants, a dusk.
 */
export const MOODS = {
  day: { sky: ['#5fb8f5', '#a9dcff', '#fdeccf'], cloud: '#ffffff', stars: 0 },
  gold: { sky: ['#f2b84b', '#ffe3a1', '#fff3d9'], cloud: '#ffe7b8', stars: 0 },
  bunny: { sky: ['#a991ee', '#d9ccff', '#fde8f3'], cloud: '#f4eeff', stars: 0 },
  heart: { sky: ['#ff8fbd', '#ffcfe2', '#fff0e8'], cloud: '#ffc4dc', stars: 0 },
  giant: { sky: ['#52c7c0', '#bdeee4', '#fdf6dc'], cloud: '#ffffff', stars: 0 },
  dusk: { sky: ['#343a8a', '#9a7fd0', '#ffc59c'], cloud: '#d6c8ff', stars: 1 },
}

/** A tall, thin strip: the sky only changes from top to bottom. `paint` redraws it in new colours. */
function skyTexture() {
  const paint = (g, w, h, [top, mid, low]) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, top)
    grad.addColorStop(0.55, mid)
    grad.addColorStop(1, low)
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  }
  const tex = canvasTexture(4, 256, (g, w, h) => paint(g, w, h, MOODS.day.sky))
  tex.paint = (stops) => {
    paint(tex.image.getContext('2d'), tex.image.width, tex.image.height, stops)
    tex.needsUpdate = true
  }
  return tex
}

const starTexture = () =>
  canvasTexture(32, 32, (g, s) => {
    g.translate(s / 2, s / 2)
    g.fillStyle = '#fff6c8'
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 ? s * 0.18 : s * 0.48
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    g.fill()
  })

export class World {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.sky = skyTexture()
    scene.background = this.sky
    scene.fog = new THREE.Fog('#cfeaff', 55, 140)
    // The colours the sky is easing between, and the mood it is easing to
    const colours = (mood) => ({ sky: mood.sky.map((c) => new THREE.Color(c)), cloud: new THREE.Color(mood.cloud), stars: mood.stars })
    this.now = colours(MOODS.day)
    this.moods = Object.fromEntries(Object.entries(MOODS).map(([k, m]) => [k, colours(m)]))
    this.mood = this.moods.day
    this.cloudMats = new Set()
    // A few soft stars, high up, that come out for the dusk sky
    const starMat = new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false })
    this.stars = Array.from({ length: 14 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), starMat.clone())
      m.position.set((((i * 53) % 29) / 29 - 0.5) * 70, 6 + ((i * 37) % 17) * 0.75, -40)
      m.scale.setScalar(0.9 + ((i * 7) % 5) * 0.25)
      m.userData.phase = i * 1.7
      m.visible = false
      scene.add(m)
      return m
    })
    this.clouds = []
    this.sheep = []
    this.sunSpin = 0
    this.habHop = 0
    this.sailSpin = 0
    this.spots = [
      ...HOUSES.map(([x, y, z, s]) => ({ ...spot(x, y, z + 1.0 * s, 0.95 * s, 1.05 * s), house: true, chimney: new THREE.Vector3(x + 0.42 * s, z + 2.2 * s, -y - 0.2 * s) })),
      ...TREES.map(([x, y, z, s]) => ({ ...spot(x, y, z + 1.3 * s, 0.9 * s, 1.15 * s), tree: true })),
    ]
    this.root = new THREE.Group()
    this.root.position.y = WORLD_Y
    scene.add(this.root)
  }

  /** Called with the loaded glTF; without it the sky still looks fine. */
  attach(gltf) {
    const get = (name) => gltf.scene.getObjectByName(name)
    const land = get('landscape')
    if (land) this.root.add(land)
    this.sails = get('windmill_sails')
    if (this.sails) this.root.add(this.sails)
    this.hab = get('hot_air_balloon')
    if (this.hab) {
      this.hab.scale.setScalar(1.4 * HAB_FAR)
      // Its size and centre (above its origin), measured on its own, so it can pass the sun without crossing it.
      this.hab.removeFromParent()
      this.hab.position.set(0, 0, 0)
      this.hab.rotation.set(0, 0, 0)
      box.setFromObject(this.hab)
      this.habBox = { cy: (box.min.y + box.max.y) / 2, hw: (box.max.x - box.min.x) / 2, hh: (box.max.y - box.min.y) / 2 }
      this.habDodge = 0
      this.root.add(this.hab)
      this.habX = -20
    }
    this.sun = get('sun')
    if (this.sun) {
      // The pivot faces the camera; the sun wobbles and spins inside it.
      this.sunPivot = new THREE.Group()
      this.sunPivot.add(this.sun)
      this.sun.position.set(0, 0, 0)
      this.scene.add(this.sunPivot)
    }
    for (let i = 0; get(`sheep_${i}`); i++) {
      const s = get(`sheep_${i}`)
      s.userData = { base: s.position.clone(), hop: 0, phase: i * 2.1, pitch: 0.9 + ((i * 37) % 5) * 0.06 }
      this.root.add(s)
      this.sheep.push(s)
    }
    for (let i = 0; i < 3; i++) {
      const c = get(`cloud_${i}`)
      if (!c) continue
      for (let k = 0; k < 2; k++) {
        const cloud = k ? c.clone() : c
        cloud.userData = { speed: 0.4 + Math.random() * 0.5, depth: -22 - Math.random() * 14, y: 4 + Math.random() * 9 }
        cloud.scale.setScalar(1.6 + Math.random() * 0.8)
        cloud.position.set((Math.random() * 2 - 1) * 40, cloud.userData.y, cloud.userData.depth)
        this.scene.add(cloud)
        this.clouds.push(cloud)
      }
    }
    // Materials from glTF are lit; give them a softer, toy-like finish.
    for (const root of [land, this.sails, this.hab, this.sun, ...this.clouds, ...this.sheep]) {
      root?.traverse((o) => {
        if (!o.isMesh) return
        o.material.envMapIntensity = 0.25
        if (o.material.name === 'cloud') this.cloudMats.add(o.material)
        if (o.material.name === 'cloud' || o.material.name === 'wool') {
          o.material.emissive.set('#ffffff')
          o.material.emissiveIntensity = 0.35
        }
      })
    }
    this.layout()
  }

  /**
   * Places the sun in screen pixels, tucked under the home button.
   */
  layout() {
    // Clouds wrap just past the screen edge at their own depth.
    for (const c of this.clouds) c.userData.wrap = halfSize(this.camera, c.position.z).w + 8
    if (!this.sun) return
    const W = innerWidth
    const H = innerHeight
    const { w, h } = halfSize(this.camera, SUN_Z)
    const px = H / (2 * h) // pixels per unit at the sun's depth
    const r = Math.min(80, Math.max(30, Math.min(W, H) * 0.1))
    const x = 18 + r
    const y = 66 + r * 1.08
    this.sunScale = r / (SUN_RADIUS * px)
    this.sunAt = new THREE.Vector3(-w + x / px, h - y / px, SUN_Z)
    if (!this.sunPlaced) this.placeSun(this.sunAt)
    this.sunPlaced = true
  }

  /** Moves the sun's pivot and keeps it facing the camera squarely. */
  placeSun(at) {
    const pivot = this.sunPivot
    pivot.position.copy(at)
    // Face the camera squarely wherever it sits, and narrow it a touch near the screen edge,
    // where a wide landscape view would stretch it.
    pivot.lookAt(this.camera.position)
    const p = pivot.position
    const d = this.camera.position.z - p.z
    pivot.scale.set(Math.cos(Math.atan2(Math.abs(p.x), d)), Math.cos(Math.atan2(Math.abs(p.y), d)), 1)
  }

  /**
   * Tapping the sun makes it giggle and spin, a sheep hops and baas, the hot-air balloon
   * bobs up with a whoosh and the windmill whirls. Forgiving like the balloons: a tap anywhere
   * in a padded circle around the thing counts, so tiny sheep on a phone are easy to hit.
   */
  poke(x, y) {
    const things = [
      [this.sun, () => ((this.sunSpin = 1), { sun: true })],
      [this.hab, () => ((this.habHop = 1), { hab: this.habCenter() })],
      [this.sails, () => ((this.sailSpin = 1), { windmill: true })],
      ...this.sheep.map((s) => [s, () => ((s.userData.hop = 1), { sheep: s.userData.pitch })]),
    ]
    // Houses puff smoke from the chimney and trees shake out leaves (only if the landscape loaded)
    if (this.root.children.length) {
      for (const p of this.spots) {
        const at = (v) => v.clone().add(this.root.position)
        things.push([p, () => (p.house ? { house: at(p.chimney) } : { tree: at(p.center) })])
      }
    }
    let best = null
    let bestD = 1
    for (const [obj, react] of things) {
      if (!obj) continue
      const d = this.screenDistance(obj, x, y)
      if (d < bestD) {
        bestD = d
        best = react
      }
    }
    return best ? best() : null
  }

  /** How far (x, y) is from the object's padded on-screen oval: below 1 means inside. */
  screenDistance(obj, x, y) {
    if (obj.isObject3D) {
      box.setFromObject(obj)
      box.getCenter(center)
      box.getSize(size)
    } else {
      center.copy(obj.center).add(this.root.position)
      size.set(obj.w * 2, obj.h * 2, 0)
    }
    tmp.copy(center).project(this.camera)
    if (tmp.z > 1) return Infinity
    const sx = ((tmp.x + 1) / 2) * innerWidth
    const sy = ((1 - tmp.y) / 2) * innerHeight
    const ppu = innerHeight / (2 * halfSize(this.camera, center.z).h)
    const rx = Math.max(30, (size.x / 2) * ppu) * 1.2
    const ry = Math.max(30, (size.y / 2) * ppu) * 1.15
    return Math.hypot((x - sx) / rx, (y - sy) / ry)
  }

  /** Eases the sky into one of the MOODS. */
  setMood(name) {
    this.mood = this.moods[name] ?? this.moods.day
  }

  /** A fresh copy of a sheep for a balloon bunch to carry, or null if the landscape did not load. */
  sheepCopy() {
    const s = this.sheep[(Math.random() * this.sheep.length) | 0]
    if (!s) return null
    const copy = s.clone(true)
    copy.position.set(0, 0, 0)
    copy.rotation.set(0, 0, 0)
    copy.scale.setScalar(1)
    return copy
  }

  /** The world scale that makes something at depth z look the size of the meadow's own sheep. */
  sheepSizeAt(z) {
    const s = this.sheep[0]
    if (!s) return 0.5
    const at = s.getWorldPosition(tmp)
    const cam = this.camera.position.z
    return (s.getWorldScale(new THREE.Vector3()).x * (cam - z)) / (cam - at.z)
  }

  /** A visible cloud's screen position (for a shower of babies), or null when none is on screen. */
  cloudOnScreen() {
    const seen = this.clouds
      .map((c) => tmp.copy(c.position).project(this.camera) && { x: ((tmp.x + 1) / 2) * innerWidth, y: ((1 - tmp.y) / 2) * innerHeight })
      .filter((p) => p.x > 60 && p.x < innerWidth - 60 && p.y > 40 && p.y < innerHeight * 0.45)
    return seen[(Math.random() * seen.length) | 0] ?? null
  }

  /** The hot-air balloon's screen position, or null when it is off screen. */
  habOnScreen() {
    if (!this.hab) return null
    tmp.copy(this.habCenter()).project(this.camera)
    const p = { x: ((tmp.x + 1) / 2) * innerWidth, y: ((1 - tmp.y) / 2) * innerHeight }
    return p.x > 40 && p.x < innerWidth - 40 && p.y > 0 && p.y < innerHeight * 0.6 ? p : null
  }

  /** Just above the basket, where the burner flame would be. */
  habCenter() {
    return this.hab.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, 1.4 * this.hab.scale.y, 0))
  }

  /**
   * How far the hot-air balloon (its origin at x, y in the world root) rises or sinks to pass the sun, which sits
   * just in front of it, so their paths can cross on narrow screens. It eases in as
   * the two draw near, so the balloon drifts over or under the sun (whichever is nearer) instead of crossing it.
   */
  sunDodge(x, y) {
    if (!this.sun || !this.habBox) return 0
    const { cy, hw, hh } = this.habBox
    const sun = this.sunPivot.position
    const r = SUN_RADIUS * this.sunScale
    const dx = Math.abs(x - sun.x) - (hw + r + 0.4)
    if (dx > 4) return 0
    const dy = y + WORLD_Y + cy - sun.y
    const gap = hh + r + 0.4 - Math.abs(dy)
    if (gap <= 0) return 0
    const near = dx <= 0 ? 1 : 1 - dx / 4
    return (dy >= 0 ? 1 : -1) * gap * near * near * (3 - 2 * near)
  }

  /** Eases the sky's colours, the clouds' tint and the stars toward the chosen mood. */
  updateMood(dt, t) {
    const k = 1 - Math.exp(-dt * 0.9)
    let moved = false
    this.mood.sky.forEach((to, i) => {
      const from = this.now.sky[i]
      if (Math.abs(from.r - to.r) + Math.abs(from.g - to.g) + Math.abs(from.b - to.b) < 0.003) return
      from.lerp(to, k)
      moved = true
    })
    if (moved) this.sky.paint(this.now.sky.map((c) => `#${c.getHexString()}`))
    this.now.cloud.lerp(this.mood.cloud, k)
    for (const m of this.cloudMats) m.color.copy(this.now.cloud)
    this.now.stars += (this.mood.stars - this.now.stars) * k
    for (const star of this.stars) {
      star.visible = this.now.stars > 0.01
      if (!star.visible) continue
      star.material.opacity = this.now.stars * (0.65 + Math.sin(t * 1.3 + star.userData.phase) * 0.3)
      star.lookAt(this.camera.position)
    }
  }

  update(dt, t) {
    this.updateMood(dt, t)
    this.sailSpin = Math.max(0, this.sailSpin - dt * 0.35)
    if (this.sails) this.sails.rotation.z -= dt * (0.8 + 9 * this.sailSpin * this.sailSpin)
    if (this.hab) {
      this.habX += dt * 0.6
      if (this.habX > 45) this.habX = -45
      // Tapped: a burner-powered bounce up, then a gentle sink back
      this.habHop = Math.max(0, this.habHop - dt * 0.5)
      const lift = Math.sin((1 - this.habHop) * Math.PI) * 3.5 * Math.min(1, this.habHop * 3)
      const y = (5 + Math.sin(t * 0.4) * 1.2 + lift) * HAB_FAR - WORLD_Y
      this.habDodge += (this.sunDodge(this.habX * HAB_FAR, y) - this.habDodge) * (1 - Math.exp(-dt * 2))
      this.hab.position.set(this.habX * HAB_FAR, y + this.habDodge, HAB_Z)
      this.hab.rotation.y = Math.sin(t * 0.3) * 0.3 + this.habHop * this.habHop * Math.PI * 2
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > c.userData.wrap) c.position.x = -c.userData.wrap
      c.position.y = c.userData.y + Math.sin(t * 0.3 + c.userData.speed * 10) * 0.3
    }
    if (this.sun) {
      if (this.sunAt && this.sunPivot.position.distanceToSquared(this.sunAt) > 1e-6) {
        this.placeSun(this.sunPivot.position.clone().lerp(this.sunAt, 1 - Math.exp(-dt * 2.5)))
      }
      this.sunSpin = Math.max(0, this.sunSpin - dt * 0.8)
      this.sun.rotation.z = Math.sin(t * 0.8) * 0.08 + this.sunSpin * this.sunSpin * Math.PI * 4
      const s = this.sunScale * (1 + Math.sin(t * 2) * 0.03 + this.sunSpin * 0.3)
      this.sun.scale.setScalar(s)
    }
    for (const s of this.sheep) {
      const u = s.userData
      u.hop = Math.max(0, u.hop - dt * 1.4)
      // A happy double bounce when tapped; otherwise a slow grazing sway
      const hop = u.hop > 0 ? Math.abs(Math.sin((1 - u.hop) * Math.PI * 2)) * 0.9 * u.hop : 0
      s.position.set(u.base.x, u.base.y + hop, u.base.z)
      s.rotation.z = Math.sin(t * 0.7 + u.phase) * 0.04 + (u.hop > 0 ? Math.sin((1 - u.hop) * Math.PI * 4) * 0.15 * u.hop : 0)
      const squash = u.hop > 0 ? 0 : Math.sin(t * 1.6 + u.phase) * 0.02
      s.scale.set(1 - squash, 1 + squash, 1)
    }
  }
}
