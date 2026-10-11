import * as THREE from 'three'

/** How close a roller must come to grab each pickup, and how many the host keeps out. */
export const ITEM_KINDS = {
  bucket: { reach: 1.5, max: 2, node: 'bucket' },
  rainbow: { reach: 1.6, max: 1, node: 'puddle_rainbow' },
  water: { reach: 1.5, max: 1, node: 'puddle_water' },
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

  add(id, kind, x, z) {
    if (this.items.has(id) || !ITEM_KINDS[kind]) return null
    const group = new THREE.Group()
    const tpl = this.templates[kind]
    const model = tpl ? tpl.clone(true) : new THREE.Mesh(new THREE.SphereGeometry(0.6), new THREE.MeshStandardMaterial({ color: '#ff4d8d' }))
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
    const item = { id, kind, x, z, group, model, paint, age: 0, phase: Math.random() * 6 }
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
      // Still once landed (no float, spin or colour drift while a child paints); each pickup keeps its own look.
      if (it.kind === 'bucket') {
        it.model.position.y = 0.25
        it.model.rotation.y = it.phase
        it.paint?.color.setHSL((it.phase * 0.16) % 1, 0.75, 0.6)
      } else it.model.rotation.y = it.phase
    }
  }
}
