import * as THREE from 'three'
import { canvasTexture } from './util.js'

/** How close a roller must come to grab each pickup, and how many the host keeps out. */
export const ITEM_KINDS = {
  bucket: { reach: 1.5, max: 2, node: 'bucket' },
  rainbow: { reach: 1.6, max: 1, node: 'puddle_rainbow' },
  water: { reach: 1.5, max: 1, node: 'puddle_water' },
  /** A stamp token: rolling over it turns the roller into a star, heart or paw-print stamp for a while. */
  stamp: { reach: 1.6, max: 1 },
  /** A giant bucket: it tips over in a huge wave of paint. */
  giant: { reach: 2.4, max: 1, node: 'bucket' },
}
/** The picture on each stamp token. */
export const STAMP_EMOJI = { star: '⭐', heart: '❤️', paw: '🐾' }

const tokenMaterials = {}
/** A round, chunky token with the stamp's picture on top (drawn at runtime, no model needed). */
function stampToken(shape) {
  tokenMaterials[shape] ??= new THREE.MeshStandardMaterial({
    roughness: 0.5,
    map: canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#fff6d8'
      g.fillRect(0, 0, w, h)
      g.font = '84px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(STAMP_EMOJI[shape] ?? '⭐', w / 2, h / 2 + 6)
    }),
  })
  const group = new THREE.Group()
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 28), new THREE.MeshStandardMaterial({ color: '#ffbe0b', roughness: 0.4 }))
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.72, 28).rotateX(-Math.PI / 2), tokenMaterials[shape])
  face.position.y = 0.115
  group.add(rim, face)
  return group
}

/**
 * The pickups lying on the playground. The host decides where they appear and
 * who got one; every device just shows them.
 */
export class Items {
  constructor(scene) {
    this.scene = scene
    this.templates = {}
    this.items = new Map()
  }

  attach(gltfScene) {
    for (const [kind, def] of Object.entries(ITEM_KINDS)) {
      const node = gltfScene.children.find((c) => c.name.startsWith(def.node))
      if (node) this.templates[kind] = node
    }
  }

  add(id, kind, x, z, shape = 'star') {
    if (this.items.has(id) || !ITEM_KINDS[kind]) return null
    const group = new THREE.Group()
    const tpl = this.templates[kind === 'giant' ? 'bucket' : kind]
    const model = kind === 'stamp' ? stampToken(shape) : tpl ? tpl.clone(true) : new THREE.Mesh(new THREE.SphereGeometry(0.6), new THREE.MeshStandardMaterial({ color: '#ff4d8d' }))
    if (kind === 'giant') model.scale.setScalar(1.8)
    let paint = null
    model.traverse((o) => {
      if (o.isMesh && o.material.name === 'bucket_paint') {
        paint ??= o.material.clone()
        o.material = paint
      }
    })
    group.add(model)
    group.position.set(x, 0, z)
    group.scale.setScalar(0.01)
    this.scene.add(group)
    const item = { id, kind, x, z, shape, group, model, paint, age: 0, phase: Math.random() * 6 }
    this.items.set(id, item)
    return item
  }

  remove(id) {
    const item = this.items.get(id)
    if (!item) return null
    item.group.removeFromParent()
    item.paint?.dispose()
    this.items.delete(id)
    return item
  }

  has(id) {
    return this.items.has(id)
  }

  values() {
    return this.items.values()
  }

  count(kind) {
    let n = 0
    for (const it of this.items.values()) if (it.kind === kind) n++
    return n
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id)
  }

  update(dt, now) {
    for (const it of this.items.values()) {
      it.age += dt
      // Pop in with a little bounce.
      const s = it.age < 0.5 ? 1 + Math.sin(Math.min(1, it.age / 0.5) * Math.PI) * 0.25 - (1 - Math.min(1, it.age / 0.35)) : 1
      it.group.scale.setScalar(Math.max(0.01, s))
      // The bucket bobs and turns slowly, so it looks like something to roll into; puddles lie still.
      if (it.kind === 'bucket' || it.kind === 'giant') {
        it.model.position.y = (it.kind === 'giant' ? 0.1 : 0.3) + Math.sin(it.age * 2.2 + it.phase) * 0.12
        it.model.rotation.y = it.phase + it.age * 0.6
        // The giant bucket rocks as if it's about to tip.
        if (it.kind === 'giant') it.model.rotation.z = Math.sin(it.age * 1.7) * 0.12
        it.paint?.color.setHSL((it.phase * 0.16 + (it.kind === 'giant' ? it.age * 0.05 : 0)) % 1, 0.75, 0.6)
      } else if (it.kind === 'stamp') {
        // The stamp token spins slowly and hovers, showing its picture.
        it.model.position.y = 0.35 + Math.sin(it.age * 2 + it.phase) * 0.1
        it.model.rotation.y = it.age * 1.2
        it.model.rotation.x = 0.35
      } else it.model.rotation.y = it.phase
    }
  }
}
