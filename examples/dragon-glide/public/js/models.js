import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * Loads the Blender models (see ../../blender/models.py) and hands out copies.
 * Copies share geometry and materials, except where a world recolours them by
 * material name; those tinted materials are cached so they are made only once.
 */
export async function loadModels(onProgress) {
  const loader = new GLTFLoader()
  let done = 0
  const load = (file) =>
    loader.loadAsync(`./models/${file}`).then((gltf) => {
      onProgress?.(++done / 2)
      return gltf
    })
  const [dragon, world] = await Promise.all([load('dragon.glb'), load('world.glb')])
  const templates = {}
  for (const child of world.scene.children) templates[child.name] = child
  templates.dragon = dragon.scene.getObjectByName('dragon')
  return templates
}

const tints = new Map()
/** A cached copy of `material` with new colours: { color, emissive, emissiveIntensity }. */
export function tinted(material, look) {
  const key = `${material.uuid}|${JSON.stringify(look)}`
  let m = tints.get(key)
  if (!m) {
    m = material.clone()
    if (typeof look === 'string') look = { color: look }
    if (look.color) m.color.set(look.color)
    if (look.emissive) m.emissive.set(look.emissive)
    if (look.emissiveIntensity !== undefined) m.emissiveIntensity = look.emissiveIntensity
    if (look.fog !== undefined) m.fog = look.fog
    tints.set(key, m)
  }
  return m
}

/** A copy of a model. `recolor` maps material names to a colour (or a look, or a list to pick from). */
export function copy(template, recolor) {
  const obj = template.clone(true)
  if (recolor) {
    const chosen = {}
    obj.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const out = mats.map((mat) => {
        let look = recolor[mat.name]
        if (!look) return mat
        if (Array.isArray(look)) look = chosen[mat.name] ??= look[Math.floor(Math.random() * look.length)]
        return tinted(mat, look)
      })
      o.material = Array.isArray(o.material) ? out : out[0]
    })
  }
  return obj
}
