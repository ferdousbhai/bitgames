import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { pick } from './util.js'

/**
 * Loads the Blender models (see ../../blender/models.py) and hands out copies.
 * Copies share geometry; materials are shared too, except where a biome
 * recolours them (by material name), and those tinted materials are cached.
 */
export async function loadModels(onProgress) {
  const loader = new GLTFLoader()
  let done = 0
  const load = (file) =>
    loader.loadAsync(`./models/${file}`).then((gltf) => {
      onProgress?.(++done / 2)
      return gltf
    })
  const [bunny, world] = await Promise.all([load('bunny.glb'), load('world.glb')])
  const templates = {}
  for (const child of world.scene.children) templates[child.name] = child
  // Clouds glow softly and ignore the fog, so they stay bright far away.
  templates.cloud.traverse((o) => {
    if (o.isMesh) o.material.fog = false
  })
  return { bunny: bunny.scene.getObjectByName('bunny'), templates }
}

const tints = new Map()
function tinted(material, color) {
  const key = `${material.uuid}|${color}`
  let m = tints.get(key)
  if (!m) {
    m = material.clone()
    m.color.set(color)
    tints.set(key, m)
  }
  return m
}

/**
 * A copy of a model. `recolor` maps material names to a list of colours; one
 * colour is chosen per copy so a row of trees isn't all the same shade.
 */
export function copy(template, { recolor, shadow = false } = {}) {
  const obj = template.clone(true)
  const chosen = {}
  obj.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = shadow
    o.receiveShadow = false
    const colors = recolor?.[o.material.name]
    if (colors) o.material = tinted(o.material, (chosen[o.material.name] ??= pick(colors)))
  })
  return obj
}
