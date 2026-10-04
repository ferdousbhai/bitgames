import * as THREE from 'three'
import { canvasTexture } from './effects.js'

/** Half the view's width and height at depth z, so things tuck into corners on any screen. */
export function halfSize(camera, z = 0) {
  const h = Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - z)
  return { w: h * camera.aspect, h }
}

/**
 * The countryside behind the balloons (models/world.glb, built by
 * blender/models.py): hills, houses, a windmill, a drifting hot-air balloon,
 * clouds and a smiling sun, under a soft gradient sky.
 */
const WORLD_Y = -8 // the hills sit along the bottom of the screen

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
    if (this.sun) this.scene.add(this.sun)
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
    for (const root of [land, this.sails, this.hab, this.sun, ...this.clouds]) {
      root?.traverse((o) => {
        if (!o.isMesh) return
        o.material.envMapIntensity = 0.25
        if (o.material.name === 'cloud') {
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
    const z = -45
    const { w, h } = halfSize(this.camera, z)
    const portrait = this.camera.aspect < 1
    this.sunScale = 2.2 * Math.min(1, Math.max(0.6, this.camera.aspect))
    this.sun.position.set(-w + (portrait ? 6 : 10), h - (portrait ? 10 : 8), z)
  }

  /** The sun giggles and spins when tapped. */
  poke(raycaster) {
    if (!this.sun) return false
    if (raycaster.intersectObject(this.sun, true).length) {
      this.sunSpin = 1
      return true
    }
    return false
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
  }
}
