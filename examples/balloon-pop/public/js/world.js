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

/** A tall, thin strip: the sky only changes from top to bottom. */
const skyTexture = () =>
  canvasTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#5fb8f5')
    grad.addColorStop(0.55, '#a9dcff')
    grad.addColorStop(1, '#fdeccf')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  })

export class World {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    scene.background = skyTexture()
    scene.fog = new THREE.Fog('#cfeaff', 55, 140)
    this.clouds = []
    this.sheep = []
    this.sunSpin = 0
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
      this.hab.scale.setScalar(1.4)
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
        if (o.material.name === 'cloud' || o.material.name === 'wool') {
          o.material.emissive.set('#ffffff')
          o.material.emissiveIntensity = 0.35
        }
      })
    }
    this.layout()
  }

  layout() {
    // Clouds wrap just past the screen edge at their own depth.
    for (const c of this.clouds) c.userData.wrap = halfSize(this.camera, c.position.z).w + 8
    if (!this.sun) return
    // Placed in screen pixels, tucked under the home button and score pill so the HUD never touches it.
    const W = innerWidth
    const H = innerHeight
    const { w, h } = halfSize(this.camera, SUN_Z)
    const px = H / (2 * h) // pixels per unit at the sun's depth
    const r = Math.min(80, Math.max(30, Math.min(W, H) * 0.1))
    const x = 18 + r
    const y = 66 + r * 1.08
    this.sunScale = r / (SUN_RADIUS * px)
    const pivot = this.sunPivot
    pivot.position.set(-w + x / px, h - y / px, SUN_Z)
    // Face the camera squarely wherever it sits, and narrow it a touch near the screen edge,
    // where a wide landscape view would stretch it.
    pivot.lookAt(this.camera.position)
    const p = pivot.position
    const d = this.camera.position.z - p.z
    pivot.scale.set(Math.cos(Math.atan2(Math.abs(p.x), d)), Math.cos(Math.atan2(Math.abs(p.y), d)), 1)
  }

  /** Tapping the sun makes it giggle and spin; tapping a sheep makes it hop and baa. */
  poke(raycaster) {
    if (this.sun && raycaster.intersectObject(this.sun, true).length) {
      this.sunSpin = 1
      return { sun: true }
    }
    for (const s of this.sheep) {
      if (!raycaster.intersectObject(s, true).length) continue
      s.userData.hop = 1
      return { sheep: s.userData.pitch }
    }
    return null
  }

  update(dt, t) {
    if (this.sails) this.sails.rotation.z -= dt * 0.8
    if (this.hab) {
      this.habX += dt * 0.6
      if (this.habX > 45) this.habX = -45
      this.hab.position.set(this.habX, 13 + Math.sin(t * 0.4) * 1.2, -30)
      this.hab.rotation.y = Math.sin(t * 0.3) * 0.3
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > c.userData.wrap) c.position.x = -c.userData.wrap
      c.position.y = c.userData.y + Math.sin(t * 0.3 + c.userData.speed * 10) * 0.3
    }
    if (this.sun) {
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
