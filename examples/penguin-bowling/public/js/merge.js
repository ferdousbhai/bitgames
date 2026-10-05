import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Draw-call savers. The models are lots of small plain-coloured parts; tablets
 * draw them much faster once each rigid group is a single mesh.
 */

const tmp = new THREE.Matrix4()

/** Meshes under `root`, skipping anything inside one of the `skip` nodes. */
function rigidMeshes(root, skip) {
  const out = []
  const walk = (o) => {
    if (o !== root && skip.includes(o)) return
    if (o.isMesh && !o.isInstancedMesh) out.push(o)
    for (const c of o.children) walk(c)
  }
  walk(root)
  return out
}

/** A copy of the mesh's geometry in `root`'s space, keeping only position and normal. */
function localGeometry(mesh, inv) {
  const src = mesh.geometry
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', src.attributes.position.clone())
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone())
  else g.computeVertexNormals()
  if (src.index) g.setIndex(src.index.clone())
  g.applyMatrix4(tmp.multiplyMatrices(inv, mesh.matrixWorld))
  return g
}

function mergeAll(geos) {
  // mergeGeometries needs all-indexed or all-plain
  const indexed = geos.every((g) => g.index)
  const list = indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g))
  return mergeGeometries(list, false)
}

const bakedMaterials = new Map()
function bakedMaterial(roughness, envMapIntensity) {
  const key = `${roughness}|${envMapIntensity}`
  if (!bakedMaterials.has(key)) {
    bakedMaterials.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, envMapIntensity }))
  }
  return bakedMaterials.get(key)
}

/**
 * Bake every plain-coloured mesh under `root` (but not inside `skip` nodes) into
 * one vertex-coloured mesh: one draw call instead of one per material.
 */
export function bakeColors(root, { skip = [], roughness = 0.55, envMapIntensity = 0.5, castShadow = true } = {}) {
  root.updateWorldMatrix(true, true)
  const inv = root.matrixWorld.clone().invert()
  const meshes = rigidMeshes(root, skip)
  if (meshes.length < 2) return null
  const geos = []
  const c = new THREE.Color()
  for (const m of meshes) {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material
    const g = localGeometry(m, inv)
    c.copy(mat.color ?? c.set('#ffffff'))
    // Glowy bits (eye shine) stay bright
    if (mat.emissive && mat.emissiveIntensity) c.add(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity * 0.5))
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = Math.min(1, c.r)
      col[i * 3 + 1] = Math.min(1, c.g)
      col[i * 3 + 2] = Math.min(1, c.b)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geos.push(g)
  }
  const merged = new THREE.Mesh(mergeAll(geos), bakedMaterial(roughness, envMapIntensity))
  merged.name = `${root.name || 'baked'}_baked`
  merged.castShadow = castShadow
  for (const m of meshes) m.removeFromParent()
  root.add(merged)
  return merged
}

/**
 * Merge the static scenery under `group` into one mesh per material (keeps the
 * glowing windows and lanterns their own materials). `keep` children stay as they are.
 */
export function mergeByMaterial(group, keep = new Set()) {
  group.updateWorldMatrix(true, true)
  const inv = group.matrixWorld.clone().invert()
  const byMat = new Map()
  const victims = []
  for (const child of group.children) {
    if (keep.has(child)) continue
    victims.push(child)
    child.traverse((m) => {
      if (!m.isMesh) return
      const mat = Array.isArray(m.material) ? m.material[0] : m.material
      if (!byMat.has(mat)) byMat.set(mat, [])
      byMat.get(mat).push(localGeometry(m, inv))
    })
  }
  for (const v of victims) v.removeFromParent()
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeAll(geos), mat)
    mesh.name = `merged_${mat.name}`
    group.add(mesh)
  }
}
