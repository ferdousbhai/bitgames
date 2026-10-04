import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HALF_D, HALF_W, groundMaterial } from './paint.js'
import { canvasTexture, rng } from './util.js'

/** The three playgrounds. The paintable ground is drawn here; the scenery comes from place_<id>.glb. */
export const PLACES = {
  square: { name: 'Town Square', emoji: '🏘️', color: '#ff9f1c', sky: ['#7cc6f2', '#fff1d6'], base: 'tiles', outer: 'cobbles' },
  farm: { name: 'Farmyard', emoji: '🐮', color: '#5cb85c', sky: ['#86cff5', '#f4ffe0'], base: 'canvas', outer: 'grass' },
  toys: { name: 'Toy Room', emoji: '🧸', color: '#9b5de5', sky: ['#ffd6e7', '#fff5fa'], base: 'paper', outer: 'wood' },
}
export const PLACE_IDS = Object.keys(PLACES)

const textures = {
  /** Big white stone tiles: 2 m each. */
  tiles: () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#f8f6f1'
      g.fillRect(0, 0, w, h)
      speckle(g, w, h, 900, 0.03)
      g.strokeStyle = '#e4ded3'
      g.lineWidth = 6
      g.strokeRect(0, 0, w, h)
    }, { repeat: [16, 11] }),
  /** A big cream canvas with a faint weave. */
  canvas: () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#fbf6ea'
      g.fillRect(0, 0, w, h)
      g.globalAlpha = 0.05
      g.fillStyle = '#b89b6a'
      for (let i = 0; i < w; i += 4) g.fillRect(i, 0, 1, h)
      for (let j = 0; j < h; j += 4) g.fillRect(0, j, w, 1)
      g.globalAlpha = 1
      speckle(g, w, h, 600, 0.04)
    }, { repeat: [10, 7] }),
  /** White drawing paper with pale blue squares. */
  paper: () =>
    canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, w, h)
      g.strokeStyle = 'rgba(120,170,255,0.25)'
      g.lineWidth = 2
      g.strokeRect(0, 0, w, h)
    }, { repeat: [32, 22] }),
  cobbles: () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#b9b1a5'
      g.fillRect(0, 0, w, h)
      const r = rng(4)
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) {
          const v = 200 + Math.floor(r() * 30)
          g.fillStyle = `rgb(${v},${v - 6},${v - 14})`
          g.beginPath()
          g.roundRect(i * 32 + (j % 2) * 16 + 2, j * 32 + 2, 28, 28, 9)
          g.fill()
        }
    }, { repeat: [40, 40] }),
  grass: () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#7fcb5c'
      g.fillRect(0, 0, w, h)
      const r = rng(9)
      for (let i = 0; i < 500; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(60,140,50,0.35)' : 'rgba(170,230,120,0.35)'
        g.fillRect(r() * w, r() * h, 3, 7)
      }
    }, { repeat: [30, 30] }),
  wood: () =>
    canvasTexture(256, 256, (g, w, h) => {
      for (let j = 0; j < 8; j++) {
        const v = 215 + (j % 3) * 8
        g.fillStyle = `rgb(${v},${v - 50},${v - 105})`
        g.fillRect(0, j * 32, w, 32)
        g.fillStyle = 'rgba(120,70,30,0.35)'
        g.fillRect(0, j * 32, w, 2)
        g.fillRect(((j * 97) % 200) + 20, j * 32, 2, 32)
      }
    }, { repeat: [30, 30] }),
}

function speckle(g, w, h, count, alpha) {
  const r = rng(7)
  for (let i = 0; i < count; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 3})`
    g.fillRect(r() * w, r() * h, 2, 2)
  }
}

/** Gives a geometry an index if it has none, so it can merge with indexed ones. */
function ensureIndexed(geometry) {
  if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()])
  return geometry
}

/**
 * Builds a playground. Static scenery is merged into one mesh per material
 * (a handful of draws for a whole town); obstacles become round colliders.
 */
export function buildArena(id, gltfScene, paint) {
  const def = PLACES[id]
  const root = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_W, 2 * HALF_D).rotateX(-Math.PI / 2), groundMaterial(textures[def.base](), paint.texture))
  root.add(ground)
  const outerTex = textures[def.outer]()
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: outerTex, roughness: 0.95 }))
  outer.position.y = -0.015
  root.add(outer)

  const obstacles = []
  let sails = null
  // A copy, so the same playground can be built again next round.
  const place = gltfScene?.children.find((c) => c.name.startsWith(`place_${id}`))?.clone(true)
  if (place) {
    place.updateMatrixWorld(true)
    const byMaterial = new Map()
    for (const node of [...place.children]) {
      if (node.name.startsWith('obstacle')) {
        const box = new THREE.Box3().setFromObject(node)
        const size = box.getSize(new THREE.Vector3())
        const c = box.getCenter(new THREE.Vector3())
        obstacles.push({ x: c.x, z: c.z, r: (Math.max(size.x, size.z) / 2) * 0.9 })
        root.add(node)
        continue
      }
      if (node.name.startsWith('sails')) {
        sails = node
        root.add(node)
        continue
      }
      node.traverse((o) => {
        if (!o.isMesh) return
        const g = ensureIndexed(o.geometry.clone()).applyMatrix4(o.matrixWorld)
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
        if (!byMaterial.has(o.material)) byMaterial.set(o.material, [])
        byMaterial.get(o.material).push(g)
      })
    }
    for (const [material, geos] of byMaterial) {
      const merged = mergeGeometries(geos, false)
      if (merged) root.add(new THREE.Mesh(merged, material))
    }
  }
  return { root, obstacles, sails, def }
}
