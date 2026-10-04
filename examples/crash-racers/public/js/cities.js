import * as THREE from 'three'
import * as CANNON from 'cannon'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Track } from './track.js'
import { GROUP_STATIC, STATIC_MASK, canvasTexture, damp, rng, solidColor, speckle } from './util.js'

/**
 * The places to race. Each one returns a Track: a looped road plus scenery and
 * colliders. The scenery comes from the Blender props in models/props.glb
 * (blender/props.py): temples, monkeys, harbour, triplexes, dinosaurs, a
 * stadium...
 *
 * The Blender props share one palette texture, so every static one in a place
 * merges into a few meshes. Moving things (dinosaurs, ferry, monkeys, flags...)
 * are animated with `track.animate()`, on the race's clock.
 */
export const CITIES = {
  ubud: { name: 'Ubud', emoji: '🌾', flag: '🇮🇩', blurb: 'Rice fields, temples and monkeys', color: '#6fbf3a' },
  helsinki: { name: 'Helsinki', emoji: '⛪', flag: '🇫🇮', blurb: 'Cobblestones, trams and the harbour', color: '#3a7bd5' },
  montreal: { name: 'Montreal', emoji: '🍁', flag: '🇨🇦', blurb: 'Staircases, maples and orange cones', color: '#d64a2f' },
  dino: { name: 'Dino Valley', emoji: '🦖', flag: '🌋', blurb: 'Dinosaurs, eggs and a volcano', color: '#3aa35a' },
  stunt: { name: 'Stunt Park', emoji: '🎢', flag: '🏜️', blurb: 'Big jumps, boost pads and a cheering crowd', color: '#e08a1e' },
}

const cache = new Map()
/** Memoises `make` by key, so every race (and every loop iteration) reuses one material or texture. */
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}
const keyOf = (value) => JSON.stringify(value, (_, v) => (v?.isTexture ? v.uuid : v))

/**
 * One material per distinct set of options. Track.addGeometry merges geometry
 * per material, so a fresh material per call would cost a draw call each.
 */
const std = (o) => cached('std' + keyOf(o), () => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }))

/** Wraps a texture builder so each distinct set of arguments is drawn only once. */
const memoTexture = (name, build) => (...args) => cached(name + keyOf(args), () => build(...args))

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const UP = v3(0, 1, 0)
/** Yaw that turns a Blender prop's front (three.js -Z) to point along `dir`. */
const facing = (dir) => Math.atan2(-dir.x, -dir.z)
/**
 * Calls `r` n times. Some scenery used to spend seeded calls on procedural
 * shapes; spending them still keeps the sequence (and so every collider placed
 * after) where it always was.
 */
const burn = (r, n) => {
  for (let i = 0; i < n; i++) r()
}

// --- Shared textures ---------------------------------------------------------

const asphalt = memoTexture('asphalt', function asphalt({ lines = true, patches = false, edge = '#d8d8d0' } = {}) {
  return canvasTexture(256, 512, (g, w, h) => {
    const r = rng(3)
    speckle(g, w, h, '#4a4b4f', 0.18, 9000, 2, r)
    if (patches) {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(20,20,22,${0.3 + r() * 0.3})`
        g.beginPath()
        g.ellipse(r() * w, r() * h, 12 + r() * 30, 8 + r() * 20, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.strokeStyle = 'rgba(15,15,15,0.6)'
      for (let i = 0; i < 10; i++) {
        g.beginPath()
        let x = r() * w, y = r() * h
        g.moveTo(x, y)
        for (let k = 0; k < 5; k++) g.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.5) * 40))
        g.stroke()
      }
    }
    g.fillStyle = edge
    g.fillRect(6, 0, 6, h)
    g.fillRect(w - 12, 0, 6, h)
    if (lines) {
      g.fillStyle = '#f2d24a'
      for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y, 6, 70)
    }
  })
})

const cobbles = memoTexture('cobbles', function cobbles() {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(11)
    g.fillStyle = '#5e5a55'
    g.fillRect(0, 0, w, h)
    const size = 22
    for (let y = 0; y < h; y += size) {
      const shift = (y / size) % 2 ? size / 2 : 0
      for (let x = -size; x < w; x += size) {
        const c = 110 + r() * 50
        g.fillStyle = `rgb(${c},${c - 6},${c - 14})`
        g.beginPath()
        g.roundRect(x + shift + 1.5, y + 1.5, size - 3, size - 3, 5)
        g.fill()
      }
    }
    // Tram rails
    g.fillStyle = '#b8bcc2'
    for (const x of [0.36, 0.44, 0.56, 0.64]) g.fillRect(x * w - 3, 0, 6, h)
  })
})

const grassTexture = memoTexture('grassTexture', function grassTexture(base = '#5fa83a') {
  return canvasTexture(256, 256, (g, w, h) => speckle(g, w, h, base, 0.25, 6000, 3, rng(5)), { repeat: [60, 60] })
})

const riceTexture = memoTexture('riceTexture', function riceTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(9)
    g.fillStyle = '#5fb84a'
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 6) {
        g.fillStyle = `rgba(${40 + r() * 60},${150 + r() * 80},${30 + r() * 40},0.9)`
        g.fillRect(x + r() * 2, y, 2, 6)
      }
    }
  }, { repeat: [3, 3] })
})

/** A building front: wall colour, a grid of windows (with pediments) and a door; tiles every 8 m x 12 m. */
const facade = memoTexture('facade', function facade({ wall, window = '#2d3a4a', frame = '#f4f1ea', brick = false, shutters = null, floors = 4 }) {
  return canvasTexture(256, 384, (g, w, h) => {
    const r = rng(wall.length * 31)
    if (brick) {
      g.fillStyle = '#7a3324'
      g.fillRect(0, 0, w, h)
      for (let y = 0; y < h; y += 8) {
        for (let x = -12; x < w; x += 24) {
          const c = 0.75 + r() * 0.35
          g.fillStyle = `rgb(${Math.floor(160 * c)},${Math.floor(70 * c)},${Math.floor(50 * c)})`
          g.fillRect(x + ((y / 8) % 2 ? 12 : 0) + 1, y + 1, 22, 6)
        }
      }
    } else {
      speckle(g, w, h, wall, 0.06, 2000, 3, r)
      g.fillStyle = 'rgba(255,255,255,0.5)'
      for (let f = 1; f < floors; f++) g.fillRect(0, (f * h) / floors - 3, w, 5)
    }
    const fh = h / floors
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < 2; c++) {
        const x = 36 + c * 128, y = f * fh + fh * 0.22
        if (!brick) {
          // A little pediment over each window, like Helsinki's Empire-style fronts.
          g.fillStyle = 'rgba(255,255,255,0.75)'
          g.beginPath()
          g.moveTo(x - 9, y - 7)
          g.lineTo(x + 28, y - 7 - fh * 0.12)
          g.lineTo(x + 65, y - 7)
          g.closePath()
          g.fill()
        }
        g.fillStyle = frame
        g.fillRect(x - 5, y - 5, 66, fh * 0.6 + 10)
        g.fillStyle = window
        g.fillRect(x, y, 56, fh * 0.6)
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.fillRect(x + 4, y + 4, 16, fh * 0.6 - 8)
        g.fillStyle = frame
        g.fillRect(x + 26, y, 4, fh * 0.6)
        if (shutters) {
          g.fillStyle = shutters
          g.fillRect(x - 16, y, 10, fh * 0.6)
          g.fillRect(x + 62, y, 10, fh * 0.6)
        }
      }
    }
  })
})

/** Box with wall UVs scaled in metres, so windows keep their size on any building. */
function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv
  const faceWidth = [d, d, w, w, w, w]
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k
      if (face === 2 || face === 3) uv.setXY(i, 0.02, 0.02) // roof and floor: a plain wall pixel
      else uv.setXY(i, uv.getX(i) * (faceWidth[face] / 8), uv.getY(i) * (h / 12))
    }
  }
  return geo
}

/**
 * A solid `w` x `h` x `d` building at `center`, turned by `yaw`: facade walls
 * and a flat cap that overhangs the walls by `overhang` and sits 0.1 m down on them.
 */
function building(track, center, yaw, w, h, d, wallMat, capMat, { overhang, capH }) {
  solid(track, center, w, h, d, yaw)
  const geo = buildingGeometry(w, h, d)
  geo.rotateY(yaw)
  geo.translate(center.x, h / 2, center.z)
  track.addGeometry(geo, wallMat)
  const top = new THREE.BoxGeometry(w + overhang, capH, d + overhang)
  top.rotateY(yaw)
  top.translate(center.x, h + capH / 2 - 0.1, center.z)
  track.addGeometry(top, capMat)
}

// --- Building the track: chunks, colliders, Blender props ----------------------

const CHUNK = 100

/**
 * Prepares a Track for scenery:
 *  - static geometry merges per material *and* per 100 m chunk, so frustum
 *    culling (and the shadow pass) skips what's out of view, and only scenery
 *    near the road casts shadows;
 *  - scenery colliders join one compound static body per chunk instead of a
 *    body each (the same boxes, far fewer bodies);
 *  - a collider that would poke onto the road or into a jump's landing zone is
 *    left out, so no car gets wedged.
 */
function prepare(track) {
  track.decor = rng(track.width * 977 + track.length)
  const chunkOf = (x, z) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`
  const box = new THREE.Box3()
  track.bucket = (g, material, castShadow) => {
    box.setFromBufferAttribute(g.attributes.position)
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2
    const big = box.max.x - box.min.x > CHUNK || box.max.z - box.min.z > CHUNK
    // Far from the road a shadow would never land where the camera is looking.
    const shadow = castShadow && !big && track.distanceToRoad(cx, cz, 3) < 45
    return { key: material.uuid + (shadow ? 's' : '') + (big ? '@big' : '@' + chunkOf(cx, cz)), shadow }
  }
  const bodies = new Map()
  track.staticCollider = (center, size, yaw) => {
    if (blocked(track, center, size, yaw)) return null
    const key = chunkOf(center.x, center.z)
    let body = bodies.get(key)
    if (!body) {
      body = new CANNON.Body({ mass: 0, material: track.staticMaterial, collisionFilterGroup: GROUP_STATIC, collisionFilterMask: STATIC_MASK })
      const [cx, cz] = key.split(',').map((n) => (Number(n) + 0.5) * CHUNK)
      body.position.set(cx, 0, cz)
      track.world.addBody(body)
      track.bodies.push(body)
      bodies.set(key, body)
    }
    const q = new CANNON.Quaternion().setFromEuler(0, yaw, 0)
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), new CANNON.Vec3(center.x - body.position.x, center.y, center.z - body.position.z), q)
    return body
  }
}

/** The four corners and the middle of a box's ground footprint (`size` turned by `yaw`). */
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]
function footprint(center, size, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  return CORNERS.map(([a, b]) => {
    const x = (a * size.x) / 2, z = (b * size.z) / 2
    return v3(center.x + x * c + z * s, 0, center.z - x * s + z * c)
  })
}

/** True if a box (footprint `size` turned by `yaw`) would reach the road or a jump's flight path. */
function blocked(track, center, size, yaw, margin = 0.6) {
  const edge = track.width / 2 + margin
  for (const p of footprint(center, size, yaw)) {
    if (track.distanceToRoad(p.x, p.z, 1) < edge) return true
    if (inJumpZone(track, p)) return true
  }
  return false
}

/** Inside the stretch where cars fly and land after a jump (they can land well wide of the road). */
function inJumpZone(track, p, lateral = 16) {
  if (!track.ramps.length) return false
  // The spatial hash rules most spots out without scanning the whole road.
  if (track.distanceToRoad(p.x, p.z) > track.width / 2 + lateral + 2) return false
  const proj = track.project(p)
  if (proj.distance > track.width / 2 + lateral + 2) return false
  return track.ramps.some((rp) => {
    const o = track.offset(proj.dist, rp.dist)
    return rp.half > 8 && o > -rp.half - 6 && o < rp.half + 40 && Math.abs(proj.lateral - rp.lateral) < lateral
  })
}

let P = {} // the Blender props for the place being built (set by buildCity)

/** Blender props store normals and UVs quantized; merged buckets need plain floats like three's own shapes. */
const floatGeometry = (() => {
  const memo = new WeakMap()
  const toFloat = (a) => {
    const out = new Float32Array(a.count * a.itemSize)
    const get = [a.getX, a.getY, a.getZ, a.getW]
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = get[k].call(a, i)
    return new THREE.BufferAttribute(out, a.itemSize)
  }
  return (geo) => {
    if (!memo.has(geo)) {
      const g = new THREE.BufferGeometry()
      for (const name of ['position', 'normal', 'uv']) if (geo.attributes[name]) g.setAttribute(name, toFloat(geo.attributes[name]))
      g.setIndex(geo.index)
      memo.set(geo, g)
    }
    return memo.get(geo)
  }
})()

// --- See-through foliage: trees never hide the child's car -------------------

/** Where the camera and the child's car are (main.js updates them every frame). */
export const seeThrough = { camera: { value: new THREE.Vector3() }, car: { value: new THREE.Vector3(0, -1e4, 0) } }
const FOLIAGE = new Set(['palm', 'banana', 'fern', 'tree_birch', 'tree_jungle', 'tree_maple', 'tree_round'])

/**
 * A copy of a tree's material that thins out (a fine dither, no transparency
 * sorting) wherever it stands between the camera and the car, or right in front
 * of the camera: a palm frond or a maple's canopy never fills the screen.
 * Shadows are drawn separately, so trees still cast whole ones.
 */
const seeThroughMaterial = (material) =>
  cached('see' + material.uuid, () => {
    const m = material.clone()
    m.onBeforeCompile = (shader) => {
      shader.uniforms.seeCamera = seeThrough.camera
      shader.uniforms.seeCar = seeThrough.car
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSeeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;\nuniform vec3 seeCamera;\nuniform vec3 seeCar;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec3 seeRay = seeCar - seeCamera;
          float seeT = dot(vSeeWorld - seeCamera, seeRay) / max(dot(seeRay, seeRay), 0.001);
          float seeD = length(vSeeWorld - seeCamera - seeRay * clamp(seeT, 0.0, 1.0));
          float seeFade = (1.0 - smoothstep(1.8, 3.4, seeD)) * step(0.0, seeT) * (1.0 - smoothstep(0.8, 1.0, seeT));
          seeFade = max(seeFade, 1.0 - smoothstep(3.5, 6.0, distance(vSeeWorld, seeCamera)));
          if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < seeFade * 0.92) discard;`,
        )
    }
    m.customProgramCacheKey = () => 'seeThrough'
    return m
  })

/** The game paints a prop's 'tint' faces (walls, dinosaur skin...) with this colour. */
const tintMat = (color = '#ffffff') => std({ color, roughness: 0.8 })
const materialFor = (material, tint) => (material.name === 'tint' ? tintMat(tint) : material)

function transform(position, yaw, scale) {
  const s = typeof scale === 'number' ? v3(scale, scale, scale) : scale
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(UP, yaw), s)
}

/** Is `o` the node `name` or inside it? */
const within = (o, name) => {
  for (let n = o; n; n = n.parent) if (n.name === name) return true
  return false
}

/**
 * Merges a Blender prop into the static scenery at `position`, turned by `yaw`,
 * scaled by a number or a Vector3. `part` merges just that part.
 */
function place(track, name, position, yaw = 0, scale = 1, { tint, shadow = true, part, except } = {}) {
  const root = P[name]
  const m = transform(position, yaw, scale)
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const local = new THREE.Matrix4()
  root.traverse((o) => {
    if (!o.isMesh) return
    if (part && !within(o, `${name}_${part}`)) return
    if (except && except.some((p) => within(o, `${name}_${p}`))) return
    // One copy, still indexed (the merge keeps it that way), moved into place in one go.
    const g = floatGeometry(o.geometry).clone()
    g.applyMatrix4(local.multiplyMatrices(toRoot, o.matrixWorld).premultiply(m))
    const material = materialFor(o.material, tint)
    track.addGeometry(g, FOLIAGE.has(name) ? seeThroughMaterial(material) : material, shadow)
  })
}

/**
 * A live copy of a prop (sharing its geometry and materials) for things that
 * move. `staticParts` are merged into the scenery instead (a dinosaur's body
 * stands still while its head and tail move).
 */
function spawn(track, name, position, yaw = 0, scale = 1, { tint, staticParts = [], shadow = true } = {}) {
  const obj = P[name].clone(true)
  obj.position.copy(position)
  obj.rotation.set(0, yaw, 0)
  if (typeof scale === 'number') obj.scale.setScalar(scale)
  else obj.scale.copy(scale)
  for (const part of staticParts) {
    place(track, name, position, yaw, scale, { tint, part })
    obj.getObjectByName(`${name}_${part}`)?.removeFromParent()
  }
  obj.traverse((o) => {
    if (!o.isMesh) return
    o.geometry.userData.shared = true // the loaded prop owns it; a race's dispose() must leave it
    o.material = materialFor(o.material, tint)
    o.castShadow = shadow
    o.receiveShadow = true
  })
  track.group.add(obj)
  return obj
}

/** The first mesh of a prop, for instancing many copies in one draw call. */
function firstMesh(name) {
  let mesh = null
  P[name].traverse((o) => {
    if (o.isMesh && !mesh) mesh = o
  })
  return mesh
}

/** Is a spot (radius `r`) at least `gap` metres clear of the road edge, and out of jump zones? */
function clear(track, p, r = 2, gap = 2) {
  return track.distanceToRoad(p.x, p.z, 3) > track.width / 2 + r + gap && !inJumpZone(track, p)
}

// --- Waving flags: every flag in a place is one mesh, waved in the vertex shader ---

const flagTime = { value: 0 }
const flagMaterial = () =>
  cached('flagMaterial', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.flagTime = flagTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float wave;\nattribute vec3 flagNormal;\nuniform float flagTime;')
        .replace('#include <begin_vertex>', 'vec3 transformed = position + flagNormal * sin(flagTime * 6.0 - wave * 5.0 + position.x * 0.3 + position.z * 0.3) * wave * 0.28;')
    }
    m.customProgramCacheKey = () => 'flag'
    return m
  })

class Flags {
  constructor(track) {
    this.track = track
    this.parts = []
  }

  /** A flag on a pole at `base`, flying towards `yaw` (radians), `w` x `h` metres, in one or more stripes. */
  add(base, yaw, colors, { pole = 6, w = 2.2, h = 1.3, collide = false } = {}) {
    const p = new THREE.CylinderGeometry(0.07, 0.09, pole, 5)
    p.translate(base.x, pole / 2, base.z)
    this.track.addGeometry(p, std({ color: '#d8d8dc', metalness: 0.4, roughness: 0.4 }))
    if (collide) solid(this.track, base, 0.3, 3, 0.3)
    const stripes = Array.isArray(colors) ? colors : [colors]
    stripes.forEach((color, i) => {
      const sh = h / stripes.length
      const g = new THREE.PlaneGeometry(w, sh, 6, 1)
      g.translate(w / 2, pole - sh * (i + 0.5) - 0.05, 0)
      const n = g.attributes.position.count
      const pos = g.attributes.position
      g.setAttribute('wave', new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, k) => pos.getX(k) / w), 1))
      g.rotateY(yaw)
      g.translate(base.x, 0, base.z)
      const normal = v3(0, 0, 1).applyAxisAngle(UP, yaw)
      g.setAttribute('flagNormal', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [normal.x, normal.y, normal.z]).flat(), 3))
      this.parts.push(solidColor(g, new THREE.Color(color)))
    })
  }

  finish() {
    if (!this.parts.length) return
    const mesh = new THREE.Mesh(mergeGeometries(this.parts), flagMaterial())
    mesh.frustumCulled = false
    this.track.group.add(mesh)
    this.track.animate((dt, t) => (flagTime.value = t))
  }
}

// --- Shared props -----------------------------------------------------------

const TREE_PROPS = { palm: 'palm', jungle: 'tree_jungle', birch: 'tree_birch', maple: 'tree_maple', round: 'tree_round' }

function tree(track, position, kind, r, { collide = true } = {}) {
  const h = kind === 'palm' ? 7 + r() * 3 : 5 + r() * 3
  const yaw = r() * Math.PI * 2
  burn(r, kind === 'palm' ? 0 : kind === 'maple' ? 17 : 16)
  if (collide && blocked(track, position, v3(0.5, 0, 0.5), 0)) return // too near the road or a jump: leave it out
  place(track, TREE_PROPS[kind], position, yaw, kind === 'palm' ? h / 8.4 : h / 6.5)
  if (collide) trunkCollider(track, position)
}

/**
 * An invisible collider standing on the ground at `position`: `w` across,
 * `h` tall and `d` deep, turned by `yaw` (the scenery is drawn separately).
 */
function solid(track, position, w, h, d, yaw = 0) {
  track.addStaticBox(v3(position.x, h / 2, position.z), v3(w, h, d), yaw, null, { visual: false })
}

/** Trunks are solid: hitting a tree is a crash. */
function trunkCollider(track, position, width = 0.5) {
  solid(track, position, width, 3, width)
}

/** Calls `plant(position)` `count` times, at random spots in a ring `from`..`to` metres round (cx, cz). */
function scatter(count, cx, cz, from, to, r, plant) {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = from + r() * (to - from)
    plant(v3(Math.cos(a) * d + cx, 0, Math.sin(a) * d + cz))
  }
}

/** Trees of the given kinds scattered round (cx, cz). Far out (`collide: false`) nobody drives, so no trunks to hit. */
function forest(track, count, cx, cz, from, to, kinds, r, { collide = false } = {}) {
  scatter(count, cx, cz, from, to, r, (p) => tree(track, p, kinds[Math.floor(r() * kinds.length)], r, { collide }))
}

function lampPost(track, position, toRoad) {
  if (blocked(track, position, v3(0.3, 0, 0.3), 0)) return
  place(track, 'lamp', position, facing(toRoad))
  trunkCollider(track, position, 0.3)
}

/** One mesh per cone (orange body and base, white stripe as vertex colours), built once and shared. */
let coneGeometry
function makeConeGeometry() {
  const part = (geo, y, color) => {
    geo.translate(0, y, 0)
    return solidColor(geo, new THREE.Color(color))
  }
  const geometry = mergeGeometries([
    part(new THREE.ConeGeometry(0.28, 0.75, 12), 0, '#ff6a00'),
    part(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), 0.05, '#ffffff'),
    part(new THREE.BoxGeometry(0.6, 0.06, 0.6), -0.36, '#ff6a00'),
  ])
  geometry.userData.shared = true
  return geometry
}
function cone(track, position) {
  coneGeometry ??= makeConeGeometry()
  const m = new THREE.Mesh(coneGeometry, std({ vertexColors: true, roughness: 0.6 }))
  track.addProp(m, new CANNON.Box(new CANNON.Vec3(0.25, 0.38, 0.25)), new THREE.Vector3(position.x, 0.4, position.z), 3)
}

const crateMat = std({ color: '#b0793f' })
function crate(track, position, size = 0.8, mat = crateMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat)
  track.addProp(m, new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), new THREE.Vector3(position.x, size / 2, position.z), 12 * size)
}

function mountain(track, x, z, radius, height, color, snow = false) {
  const g = new THREE.ConeGeometry(radius, height, 9, 3)
  g.translate(x, height / 2 - 2, z)
  track.addGeometry(g, std({ color, flatShading: true }), false)
  if (snow) {
    const cap = new THREE.ConeGeometry(radius * 0.28, height * 0.28, 9)
    cap.translate(x, height - 2 - height * 0.14 + 0.5, z)
    track.addGeometry(cap, std({ color: '#f6f6f6', flatShading: true }), false)
  }
}

function sceneryBase(track, { ground, sky, fog, sun }) {
  // Split into a grid and sunk a little: one giant quad has too little depth precision
  // at low camera angles and would poke through the road.
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 64, 64), ground)
  g.rotation.x = -Math.PI / 2
  g.position.y = -0.06
  g.receiveShadow = true
  track.group.add(g)
  track.sky = sky
  track.fog = fog
  track.sunColor = sun
}

/** Many copies of a one-mesh prop in one draw call; `pose(i, t, matrix)` sets each one's matrix every frame. */
function herd(track, name, count, pose) {
  const src = firstMesh(name)
  if (!count) return null
  src.geometry.userData.shared = true
  const mesh = new THREE.InstancedMesh(src.geometry, src.material, count)
  mesh.castShadow = mesh.receiveShadow = true
  mesh.frustumCulled = false
  const m = new THREE.Matrix4()
  const update = (t) => {
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, pose(i, t, m))
    mesh.instanceMatrix.needsUpdate = true
  }
  update(0)
  track.group.add(mesh)
  track.animate((dt, t) => update(t))
  return mesh
}

// --- Ubud ---------------------------------------------------------------------

function buildUbud(env) {
  const track = new Track({
    ...env,
    width: 7.5,
    seed: 101,
    points: [[0, 0], [70, -14], [130, 6], [178, 58], [168, 130], [118, 172], [56, 150], [4, 188], [-62, 164], [-104, 108], [-92, 46], [-48, 18]],
  })
  prepare(track)
  const r = track.random
  const dr = track.decor
  sceneryBase(track, { ground: std({ map: grassTexture('#4f9a33') }), sky: ['#7ec8f0', '#f6e7c8'], fog: '#d9ead0', sun: '#fff1d6' })
  track.buildRoad(std({ map: asphalt({ lines: false, patches: true, edge: '#8b7a55' }), roughness: 0.9 }))
  track.buildStrip(std({ color: '#8b6f47' }), track.width / 2, track.width / 2 + 1.2, 0.015) // dirt verge
  // Jumps first, so the scenery can keep their landing zones clear.
  const jump = track.addJump(380, { length: 7, height: 1.6, gap: 9, width: 5.5, material: std({ color: '#8a6a45' }), fill: (d, c, yaw, s) => {
    for (const k of [-1.4, 0, 1.4]) crate(track, c.clone().addScaledVector(s.side, k), 0.8, std({ color: (d | 0) % 2 ? '#f0a020' : '#c0392b' }))
  } })
  track.addBoostPad(jump - 40)
  track.addRamp(620, { length: 8, width: 4, height: 1.3, lateral: 1.2, material: std({ color: '#8a6a45' }) })
  track.addBoostPad(150, { lateral: -1.5 })

  const water = std({ color: '#7fb6c7', metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.85 })
  const rice = std({ map: riceTexture() })
  const terraceWall = std({ color: '#8a6a45' })
  const monkeys = [] // { pos, yaw, phase }
  // Stepped rice terraces climbing away from the road. The first step is a low wall: bump it and you crash.
  track.lineSides({ offset: track.width / 2 + 3.2, spacing: () => 11, depth: 26 }, ({ center, yaw, sign, sample }) => {
    for (let step = 0; step < 3; step++) {
      const height = 0.55 + step * 0.65
      const out = sample.side.clone().multiplyScalar(sign * (step * 8.5 - 8.5))
      const c = center.clone().add(out)
      // On bends a step's corners can swing towards the road: leave that step out.
      if (blocked(track, c, v3(10.8, 0, 8.4), yaw, 1.2)) continue
      track.addStaticBox(new THREE.Vector3(c.x, height / 2, c.z), new THREE.Vector3(10.8, height, 8.4), yaw, terraceWall)
      const top = new THREE.PlaneGeometry(10.4, 8)
      top.rotateX(-Math.PI / 2)
      top.rotateY(yaw)
      top.translate(c.x, height + 0.02, c.z)
      track.addGeometry(top, step % 2 ? water : rice, false)
      if (step === 0 && dr() < 0.22) monkeys.push({ pos: c.clone().addScaledVector(sample.side, -sign * 3.2).setY(height), yaw: facing(sample.side.clone().multiplyScalar(-sign)) + (dr() - 0.5), phase: dr() * 10 })
      if (step === 2 && dr() < 0.12) place(track, 'hut', c.clone().setY(height), dr() * Math.PI)
      if (step === 1 && dr() < 0.08) place(track, 'banana', c.clone().addScaledVector(sample.side, sign * 3).setY(height), dr() * 6)
    }
    if (r() < 0.35) tree(track, center.clone().addScaledVector(sample.side, sign * 14), r() < 0.6 ? 'palm' : 'jungle', r)
  })

  // Palms right at the roadside, and banana plants between them
  track.lineSides({ offset: track.width / 2 + 1.6, spacing: () => 16 + r() * 18, depth: 0.6 }, ({ center, dist, sign }) => {
    const yaw = r() * 6, scale = 0.9 + r() * 0.3
    place(track, 'palm', center, yaw, scale)
    trunkCollider(track, center)
    if (dr() < 0.3) {
      const b = track.beside(dist + 6, sign * (track.width / 2 + 2.4)).pos
      if (clear(track, b, 0.5, 1.4)) place(track, 'banana', b, dr() * 6, 0.8 + dr() * 0.3)
    }
  })

  // Balinese split gate (candi bentar) at the start line, one tower on each side, with umbrellas.
  const start = track.sampleAt(0)
  for (const sign of [-1, 1]) {
    const c = start.p.clone().addScaledVector(start.side, sign * (track.width / 2 + 2.4))
    const yaw = track.alongAt(start)
    // The prop's tower extends along its +X, which this yaw points away from the road on the left; mirror it on the right.
    place(track, 'gate', c, yaw + (sign > 0 ? Math.PI : 0), 1)
    solid(track, c, 2.8, 6, 2.2, yaw)
    for (const along of [-3.2, 3.2]) place(track, 'tedung', c.clone().addScaledVector(start.side, sign * 1.6).addScaledVector(start.t, along), 0, 1.2)
    monkeys.push({ pos: c.clone().addScaledVector(start.t, 2.2).addScaledVector(start.side, sign * 0.4), yaw: facing(start.side.clone().multiplyScalar(-sign)), phase: sign * 3 })
  }
  // Little shrines with offerings (and a monkey or two after the fruit).
  for (const d of [140, 420, 640]) {
    const { pos: c, s } = track.beside(d, track.width / 2 + 2)
    place(track, 'shrine', c, facing(s.side.clone().negate()), 0.95)
    solid(track, c, 1.2, 2.4, 1.2)
    place(track, 'tedung', c.clone().addScaledVector(s.t, 1.8).addScaledVector(s.side, 0.6), 0, 0.9)
    monkeys.push({ pos: c.clone().addScaledVector(s.t, -1.4).addScaledVector(s.side, -0.2), yaw: facing(s.side.clone().negate()), phase: d })
  }
  for (const d of [260, 520]) {
    const s = track.sampleAt(d)
    for (let k = 0; k < 7; k++) {
      const c = s.p.clone().addScaledVector(s.side, -(track.width / 2 - 1 - (k % 3) * 0.9)).addScaledVector(s.t, Math.floor(k / 3) * 0.9)
      crate(track, c, 0.8, std({ color: k % 2 ? '#f0a020' : '#c0392b' }))
    }
  }
  // The great temple in the middle of the loop, with its eleven roofs.
  for (const [x, z, s] of [[42, 92, 1.2], [-20, 120, 0.8]]) {
    if (track.distanceToRoad(x, z, 4) > 30) place(track, 'meru', v3(x, 0, z), dr() * 6, s)
  }
  mountain(track, 380, -520, 260, 280, '#5a6b4e')
  mountain(track, -300, -420, 160, 140, '#4f7a3a')
  forest(track, 40, 40, 80, 260, 520, ['palm', 'jungle'], r, { collide: true })
  forest(track, 60, 40, 80, 300, 560, ['round', 'palm', 'jungle'], dr)

  // Monkeys: one draw call for the whole troop; each one sits, looks about and hops now and then.
  const q = new THREE.Quaternion(), s1 = v3(1.25, 1.25, 1.25), p = v3()
  herd(track, 'monkey', monkeys.length, (i, t, m) => {
    const mk = monkeys[i]
    const wave = Math.sin(t * 0.8 + mk.phase)
    const hop = wave > 0.55 ? Math.abs(Math.sin((t + mk.phase) * 7)) * 0.45 : 0
    q.setFromAxisAngle(UP, mk.yaw + Math.sin(t * 0.35 + mk.phase) * 0.7)
    return m.compose(p.copy(mk.pos).setY(mk.pos.y + hop), q, s1)
  })
  track.waterZones = true // off the road you splash through paddies
  track.finish()
  return track
}

// --- Helsinki ------------------------------------------------------------------

function buildHelsinki(env) {
  const track = new Track({
    ...env,
    width: 10,
    seed: 202,
    points: [[0, 0], [130, 0], [168, 22], [176, 100], [160, 150], [100, 168], [30, 160], [-20, 190], [-80, 180], [-110, 130], [-100, 60], [-60, 14]],
  })
  prepare(track)
  const r = track.random
  const dr = track.decor
  sceneryBase(track, { ground: std({ map: grassTexture('#6c9a4a') }), sky: ['#9cc9f5', '#eef3f8'], fog: '#dfe8f0', sun: '#ffffff' })
  track.buildRoad(std({ map: cobbles(), roughness: 0.75 }))
  const curb = std({ color: '#b5b2ab' })
  track.buildStrip(curb, track.width / 2, track.width / 2 + 0.35, 0.1)
  track.buildStrip(std({ color: '#9d9a94' }), track.width / 2 + 0.35, track.width / 2 + 4, 0.1)
  // Jump the blue crates on the long straight; a boost pad before it sends you higher.
  const jump = track.addJump(430, { length: 8, height: 1.8, gap: 11, width: 6, lateral: -1.5, material: std({ color: '#c9c3b8' }), fill: (d, c, yaw, s) => {
    for (const k of [-1.6, 0, 1.6]) crate(track, c.clone().addScaledVector(s.side, k), 0.9, std({ color: '#3a6ea5' }))
  } })
  track.addBoostPad(jump - 45, { lateral: -1.5 })
  track.addBoostPad(200)
  track.addBoostPad(560, { lateral: 2 })

  const styles = [
    { wall: '#e8c35a', shutters: null }, { wall: '#9ec3dd' }, { wall: '#f1d6c9' }, { wall: '#f4f1ea', window: '#2c3e55' },
    { wall: '#c7d9b3' }, { wall: '#e7a979' },
  ].map((s) => std({ map: facade({ ...s, floors: 5 }) }))
  const harbourStyles = [{ wall: '#d9433a' }, { wall: '#f2c14e' }, { wall: '#3f7cc0' }, { wall: '#6cbf84' }].map((s) => std({ map: facade({ ...s, floors: 3 }) }))
  const roofColors = ['#4f9a80', '#4a5560', '#5f9e86', '#3e4650']
  const cornice = std({ color: '#5b6066' })
  const market = []
  track.lineSides({ offset: track.width / 2 + 4, spacing: () => 15 + r() * 6, depth: 14 }, ({ center, yaw, sign, sample }) => {
    let w = 13 + r() * 5, h = 15 + r() * 7
    const style = Math.floor(r() * styles.length)
    // The jump's landing zone is an open market square (cars that fly wide land among the tents, not in a wall).
    if (blocked(track, center, v3(w, 0, 14), yaw, 0.6)) {
      if (sign > 0) market.push({ pos: center.clone(), yaw })
      return
    }
    // By the harbour (the south side of the start straight) the houses are low and gabled, so you see the sea.
    const harbour = sample.p.z < 30 && center.z < sample.p.z - 3
    if (harbour) h = 8 + (h - 15) * 0.4
    building(track, center, yaw, w, h, 14, harbour ? harbourStyles[style % harbourStyles.length] : styles[style], cornice, { overhang: 0.6, capH: 1 })
    const roof = harbour || dr() < 0.25 ? 'hel_gable' : 'hel_roof'
    const tint = harbour ? ['#b5523b', '#3e4650', '#8a3a2b'][Math.floor(dr() * 3)] : roofColors[Math.floor(dr() * roofColors.length)]
    if (roof === 'hel_gable') place(track, roof, v3(center.x, h + 0.9, center.z), yaw + Math.PI / 2, v3(14, 1, w), { tint })
    else place(track, roof, v3(center.x, h + 0.9, center.z), yaw, v3(w, 1, 14), { tint })
  })
  // Birch trees and lamp posts on the sidewalk
  track.lineSides({ offset: track.width / 2 + 2.2, spacing: () => 18 + r() * 10, depth: 0.5 }, ({ center, dist, sign, sample }) => {
    if (Math.floor(dist / 40) % 2) tree(track, center, 'birch', r)
    else lampPost(track, center, sample.side.clone().multiplyScalar(-sign))
  })
  // Kauppatori: market tents in the square by the jump.
  for (const { pos, yaw } of market.slice(0, 3)) place(track, 'market', pos, yaw + dr(), 0.9)

  // Helsinki Cathedral on its platform, looking over the loop.
  place(track, 'cathedral', v3(30, 0, 95), 0, 1.2)
  // The harbour: sea, quay, the SkyWheel on its pier, sailboats and the Suomenlinna ferry.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 400), std({ color: '#3d6f8f', metalness: 0.5, roughness: 0.15 }))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(30, 0.03, -260)
  track.group.add(sea)
  const quay = new THREE.BoxGeometry(900, 1.4, 4)
  quay.translate(30, 0.3, -60)
  track.addGeometry(quay, std({ color: '#8e8a84' }), false)
  const pier = new THREE.BoxGeometry(34, 1.2, 30)
  pier.translate(140, 0.5, -112)
  track.addGeometry(pier, std({ color: '#8e8a84' }), false)
  const wheel = spawn(track, 'skywheel', v3(140, 1.1, -120), 0, 1, { shadow: false }).getObjectByName('skywheel_wheel')
  track.animate((dt) => (wheel.rotation.z -= dt * 0.06))
  const boats = []
  for (let k = 0; k < 6; k++) {
    const b = spawn(track, 'sailboat', v3(-160 + k * 62 + dr() * 20, 0, -85 - dr() * 50), dr() * 6, 1.3, { shadow: false })
    boats.push({ b, phase: dr() * 6 })
  }
  const ferry = spawn(track, 'ferry', v3(0, 0, -150), -Math.PI / 2, 1, { shadow: false })
  track.animate((dt, t) => {
    for (const { b, phase } of boats) {
      b.position.y = Math.sin(t * 1.3 + phase) * 0.25
      b.rotation.z = Math.sin(t * 0.9 + phase) * 0.08
    }
    // Back and forth across the harbour, turning round at each end.
    ferry.position.x = 30 + Math.sin(t * 0.045) * 230
    const heading = Math.cos(t * 0.045) >= 0 ? -Math.PI / 2 : Math.PI / 2
    ferry.rotation.y = damp(ferry.rotation.y, heading, 0.6, dt)
    ferry.position.y = Math.sin(t * 0.8) * 0.2
  })
  // Parked trams on the long straight (crash into them if you go wide)
  for (const d of [60, 600]) {
    const { pos: c, s } = track.beside(d, track.width / 2 + 2.6)
    const yaw = track.alongAt(s)
    place(track, 'tram', c, yaw, 1)
    solid(track, c, 2.6, 3.4, 26, yaw)
  }
  for (const d of [300, 960]) {
    const s = track.sampleAt(d)
    for (let k = 0; k < 6; k++) crate(track, s.p.clone().addScaledVector(s.side, (k - 2.5) * 1.2).addScaledVector(s.t, (k % 2) * 1.5), 0.9, std({ color: '#3a6ea5' }))
  }
  // Finnish flags on the corners
  const flags = new Flags(track)
  for (const d of [140, 330, 700]) {
    const { pos, s } = track.beside(d, track.width / 2 + 3.4)
    if (clear(track, pos, 0.2, 2.6)) flags.add(pos, track.alongAt(s) + Math.PI / 2, ['#ffffff', '#1f5fa8', '#ffffff'], { pole: 7, collide: true })
  }
  flags.finish()
  forest(track, 50, 30, 90, 260, 520, ['birch', 'round'], dr)
  track.finish()
  return track
}

// --- Montreal --------------------------------------------------------------------

function buildMontreal(env) {
  const track = new Track({
    ...env,
    width: 9,
    seed: 303,
    points: [[0, 0], [118, -10], [156, 28], [146, 104], [96, 144], [26, 124], [-24, 156], [-92, 126], [-104, 52], [-64, 10]],
  })
  prepare(track)
  const r = track.random
  const dr = track.decor
  sceneryBase(track, { ground: std({ map: grassTexture('#7aa04f') }), sky: ['#8fbfef', '#fbe9d4'], fog: '#efe4d8', sun: '#fff0e0' })
  track.buildRoad(std({ map: asphalt({ lines: true, patches: true }), roughness: 0.9 }))
  track.buildStrip(std({ color: '#a7a39c' }), track.width / 2, track.width / 2 + 3.2, 0.12)
  // Fly over a row of orange cones (the city's favourite thing).
  const jump = track.addJump(300, { length: 8, height: 1.8, gap: 11, width: 6, lateral: 0.5, material: std({ color: '#ff7a1a' }), fill: (d, c, yaw, s) => {
    for (const k of [-1.8, -0.6, 0.6, 1.8]) cone(track, c.clone().addScaledVector(s.side, k))
  } })
  track.addBoostPad(jump - 42, { lateral: 0.5 })
  track.addBoostPad(560, { lateral: -2 })

  const bricks = [facade({ wall: '#8a3a28', brick: true, floors: 3, frame: '#f2efe6' }), facade({ wall: '#8a3a28', brick: true, floors: 3, frame: '#2b4f7a' })].map((t) => std({ map: t }))
  const roofMat = std({ color: '#3f3a36' })
  const trims = ['#2f6b4f', '#1f3f6b', '#7a1f2b', '#2b2b2e', '#c08a2a']
  track.lineSides({ offset: track.width / 2 + 5.5, spacing: () => 11 + r() * 3, depth: 12 }, ({ center, yaw, sign, sample }) => {
    const w = 10 + r() * 1.5, h = 10.5 + r()
    const brick = bricks[Math.floor(r() * 2)]
    const stairs = r() < 0.75
    if (blocked(track, center, v3(w, 0, 12), yaw, 0.6)) return // the jump's landing zone stays open
    building(track, center, yaw, w, h, 12, brick, roofMat, { overhang: 0.4, capH: 0.8 })
    // Face the street: a fancy cornice, a balcony and painted front doors.
    const toStreet = sample.side.clone().multiplyScalar(-sign)
    place(track, 'triplex_trim', center.clone().addScaledVector(toStreet, w / 2), facing(toStreet), v3(1, h / 10.5, 1), { tint: trims[Math.floor(dr() * trims.length)] })
    // The famous outside staircases, out on the sidewalk.
    if (stairs) {
      // Balcony against the facade, the flight running out over the sidewalk.
      const front = center.clone().addScaledVector(sample.side, -sign * (6 + 0.5))
      // Face the foot of the stairs (the prop's -Z) towards the street.
      place(track, 'staircase', front, facing(toStreet), 1)
      solid(track, front, 2.2, 3.6, 2.2, yaw)
    }
  })
  track.lineSides({ offset: track.width / 2 + 1.4, spacing: () => 20 + r() * 12, depth: 0.5 }, ({ center }) => tree(track, center, 'maple', r))
  // Orange cones: Montreal's most famous wildlife. Knock them all over.
  for (let d = 40; d < track.length; d += 55 + r() * 40) {
    const s = track.sampleAt(d)
    const sideways = (r() < 0.5 ? -1 : 1) * (track.width / 2 - 1.2)
    for (let k = 0; k < 6; k++) cone(track, s.p.clone().addScaledVector(s.side, sideways - Math.sign(sideways) * (k % 2) * 0.9).addScaledVector(s.t, k * 2.2))
  }
  // Snowbanks at a couple of corners, piled up on the sidewalk (clear of the road).
  const snow = std({ color: '#f4f7fb', roughness: 0.95 })
  for (const d of [180, 470]) {
    const s = track.sampleAt(d)
    for (let k = 0; k < 4; k++) {
      const c = s.p.clone().addScaledVector(s.side, track.width / 2 + 2.2).addScaledVector(s.t, k * 2.5)
      if (blocked(track, c, v3(2, 0, 2), 0, 0.8)) continue
      const pile = new THREE.SphereGeometry(1.3, 8, 6)
      pile.scale(1, 0.55, 1)
      pile.translate(c.x, 0.2, c.z)
      track.addGeometry(pile, snow)
      solid(track, c, 2, 0.8, 2)
    }
  }
  // Mount Royal with its cross, the Olympic Stadium's leaning tower and the Biosphere.
  mountain(track, -120, -420, 300, 150, '#4f7a3a')
  const cross = new THREE.BoxGeometry(2, 30, 2)
  cross.translate(-120, 160, -420)
  track.addGeometry(cross, std({ color: '#f5f5f5', emissive: '#ffffff', emissiveIntensity: 0.3 }), false)
  const arm = new THREE.BoxGeometry(14, 2, 2)
  arm.translate(-120, 166, -420)
  track.addGeometry(arm, std({ color: '#f5f5f5', emissive: '#ffffff', emissiveIntensity: 0.3 }), false)
  place(track, 'olympic', v3(300, 0, -300), 0.5, 1, { shadow: false })
  place(track, 'biosphere', v3(40, 0, 300), 0, 1.4, { shadow: false })
  forest(track, 70, 25, 70, 220, 480, ['maple', 'maple', 'round', 'birch'], dr)
  track.finish()
  return track
}

// --- Dino Valley ------------------------------------------------------------------

const DINO_PARTS = { trex: ['head', 'tail'], longneck: ['neck', 'tail'], triceratops: ['head', 'tail'] }

/**
 * A friendly dinosaur standing at `origin`. Its body is static scenery; its
 * head (or neck) bobs and its tail swishes. 'longneck' arches its neck high
 * over the road on its +X side.
 */
function dinosaur(track, origin, yaw, kind, color, phase) {
  // `yaw` faces the dinosaur's +Z; the Blender ones (bar the long-neck) face -Z.
  const dino = spawn(track, kind, origin, yaw + (kind === 'longneck' ? 0 : Math.PI), 1, { tint: color, staticParts: ['body'] })
  const [headName, tailName] = DINO_PARTS[kind]
  const head = dino.getObjectByName(`${kind}_${headName}`)
  const tail = dino.getObjectByName(`${kind}_${tailName}`)
  const nod = kind === 'longneck' ? 0.035 : 0.14
  track.animate((dt, t) => {
    head.rotation.x = Math.sin(t * 1.7 + phase) * nod + (kind === 'trex' ? Math.max(0, Math.sin(t * 0.5 + phase)) ** 8 * 0.25 : 0)
    head.rotation.y = Math.sin(t * 0.6 + phase) * (kind === 'longneck' ? 0.04 : 0.18)
    tail.rotation.y = Math.sin(t * 1.3 + phase) * 0.22
  })
  const big = kind === 'longneck' ? 1.6 : kind === 'trex' ? 1.15 : 1
  // Solid legs and body: drive into a dinosaur and you crash. (The long neck is high above the road.)
  solid(track, origin, 4.4 * big, 5 * big, 6 * big, yaw)
}

/** The volcano, puffing smoke and now and then throwing glowing lava bombs. */
function volcano(track, x, z) {
  place(track, 'volcano', v3(x, 0, z), 0, 1, { shadow: false })
  const top = v3(x, 186, z)
  const puffs = 12
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std({ color: '#c9c2bc', transparent: true, opacity: 0.8, flatShading: true }), puffs)
  const bombs = 7
  const lava = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std({ color: '#ff7a1a', emissive: '#ff4a00', emissiveIntensity: 1.6, flatShading: true }), bombs)
  smoke.frustumCulled = lava.frustumCulled = false
  track.group.add(smoke, lava)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = v3(), s = v3()
  track.animate((dt, t) => {
    for (let i = 0; i < puffs; i++) {
      const life = (t * 0.06 + i / puffs) % 1
      p.set(top.x + life * 70 + Math.sin(i * 3.1) * 12, top.y + life * 110, top.z - life * 25 + Math.cos(i * 2.3) * 10)
      const size = (10 + life * 30) * Math.min(1, life * 6) * (1 - life * 0.4)
      q.setFromAxisAngle(UP, i + t * 0.1)
      smoke.setMatrixAt(i, m.compose(p, q, s.setScalar(size)))
    }
    smoke.instanceMatrix.needsUpdate = true
    // An eruption every eight seconds: bombs fly out and fall back onto the slopes.
    const tc = t % 8
    for (let i = 0; i < bombs; i++) {
      const a = i * 2.4
      const v = 26 + (i % 3) * 5
      if (tc > 4.2) {
        lava.setMatrixAt(i, m.makeScale(0, 0, 0))
        continue
      }
      p.set(top.x + Math.cos(a) * 14 * tc, top.y + v * tc - 12 * tc * tc, top.z + Math.sin(a) * 14 * tc)
      lava.setMatrixAt(i, m.compose(p, q.identity(), s.setScalar(5 + (i % 2) * 2)))
    }
    lava.instanceMatrix.needsUpdate = true
  })
}

function fern(track, position, r) {
  burn(r, 5)
  place(track, 'fern', position, r() * 6.3, 1.2 + (position.x * 13.1 - Math.floor(position.x * 13.1)) * 0.5)
}

const eggMats = ['#fff3d6', '#d9f2ff', '#ffe0ef'].map((color) => std({ color, roughness: 0.5 }))
/** A giant dinosaur egg: knock it flying. */
function egg(track, position, k) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 9), eggMats[k % eggMats.length])
  m.scale.set(1, 1.3, 1)
  track.addProp(m, new CANNON.Sphere(0.6), new THREE.Vector3(position.x, 0.7, position.z), 6)
}

function buildDino(env) {
  const track = new Track({
    ...env,
    width: 9,
    seed: 404,
    points: [[0, 0], [110, -20], [190, 25], [215, 115], [165, 190], [75, 180], [15, 235], [-80, 215], [-135, 145], [-115, 60], [-60, 18]],
  })
  prepare(track)
  const r = track.random
  const dr = track.decor
  sceneryBase(track, { ground: std({ map: grassTexture('#4c9a3c') }), sky: ['#ffb978', '#ffe9c7'], fog: '#f6dcc0', sun: '#ffe2b8' })
  track.buildRoad(std({ map: asphalt({ lines: false, patches: true, edge: '#c49a5a' }), color: '#d7b89a', roughness: 0.95 }))
  track.buildStrip(std({ color: '#a8753f' }), track.width / 2, track.width / 2 + 1.4, 0.015) // dirt verge
  // Jump the egg nest, then the river; boost pads to get there fast.
  const eggJump = track.addJump(260, { length: 8, height: 1.8, gap: 11, width: 6.5, material: std({ color: '#9b6b3e' }), fill: (d, c, yaw, s) => {
    for (const k of [-1.8, -0.6, 0.6, 1.8]) egg(track, c.clone().addScaledVector(s.side, k + (dr() - 0.5) * 0.4), (d | 0) + k * 3)
  } })
  track.addBoostPad(eggJump - 42)
  const gapPoints = []
  const riverJump = track.addJump(560, { length: 9, height: 2.2, gap: 14, width: 7, material: std({ color: '#9b6b3e' }), fill: (d) => gapPoints.push(d) })
  track.addBoostPad(riverJump - 45)
  track.addBoostPad(80, { lateral: -2 })

  track.lineSides({ offset: track.width / 2 + 2.5, spacing: () => 9 + r() * 8, depth: 0.6 }, ({ center }) => {
    if (r() < 0.55) fern(track, center, r)
    else tree(track, center, r() < 0.5 ? 'palm' : 'jungle', r)
  })
  // Dinosaurs along the road; the long-neck's neck arches right over it.
  const kinds = [['longneck', '#7bc96f'], ['trex', '#f08a3c'], ['triceratops', '#6aa7e0'], ['longneck', '#b08ee0'], ['trex', '#5fbf9a'], ['triceratops', '#f2b94a']]
  kinds.forEach(([kind, color], i) => {
    const d = (track.length / kinds.length) * (i + 0.35)
    const sign = i % 2 ? 1 : -1
    const reach = kind === 'longneck' ? 10 : 9
    const { pos: origin, s } = track.beside(d, sign * (track.width / 2 + reach))
    // Long-necks stand along the road with it on their +X side, so the neck arches over it
    // (rotated to face along the road, +X points to the road's left); the others look at the road.
    const yaw = kind === 'longneck' ? track.alongAt(s) + (sign < 0 ? Math.PI : 0) : facing(s.side.clone().multiplyScalar(sign))
    dinosaur(track, origin, yaw, kind, color, i * 1.7)
  })
  // Nests by the road, where babies keep popping out of their eggs to see the race.
  const babies = []
  for (let k = 0; k < 5; k++) {
    const d = (track.length / 5) * (k + 0.8)
    const sign = k % 2 ? -1 : 1
    const { pos, toRoad } = track.beside(d, sign * (track.width / 2 + 4.5))
    if (!clear(track, pos, 2.2, 0.6)) continue
    const baby = spawn(track, 'nest', pos, facing(toRoad), 1.2, { staticParts: ['body'] }).getObjectByName('nest_baby')
    babies.push({ baby, y: baby.position.y, phase: k * 2.3 })
  }
  track.animate((dt, t) => {
    for (const { baby, y, phase } of babies) {
      const peek = Math.max(0, Math.sin(t * 0.9 + phase))
      baby.position.y = y - 0.75 + Math.min(1, peek * 1.6) * 0.75
      baby.rotation.y = Math.sin(t * 2.5 + phase) * 0.35 * peek
    }
  })
  const river = new THREE.PlaneGeometry(400, 12)
  river.rotateX(-Math.PI / 2)
  // Under the middle of the gap, which isn't the middle of the whole jump.
  const rs = track.sampleAt(gapPoints.reduce((a, b) => a + b, 0) / gapPoints.length)
  river.rotateY(track.alongAt(rs) + Math.PI / 2)
  river.translate(rs.p.x, 0.03, rs.p.z)
  track.addGeometry(river, std({ color: '#3fa7d6', metalness: 0.3, roughness: 0.15 }), false)
  volcano(track, 230, -320)
  mountain(track, -320, -300, 180, 150, '#4f7a3a')
  forest(track, 40, 40, 100, 270, 530, ['palm', 'jungle'], r, { collide: true })
  forest(track, 50, 40, 100, 300, 560, ['round', 'jungle', 'palm'], dr)
  for (let i = 0; i < 30; i++) {
    const a = dr() * Math.PI * 2, d = 120 + dr() * 200
    const p = v3(Math.cos(a) * d + 40, 0, Math.sin(a) * d + 110)
    if (clear(track, p, 3, 6)) place(track, 'fern', p, dr() * 6, 1.6 + dr())
  }
  // Pterodactyls gliding in circles over the valley, flapping now and then.
  const pteros = ['#b08ee0', '#ff9e7a', '#7fc8e8'].map((color, k) => {
    const obj = spawn(track, 'ptero', v3(), 0, 1.6, { tint: color, shadow: false })
    obj.rotation.order = 'YXZ'
    obj.rotation.z = -0.3
    return { obj, k, right: obj.getObjectByName('ptero_wing_r'), left: obj.getObjectByName('ptero_wing_l') }
  })
  track.animate((dt, t) => {
    for (const { obj, k, right, left } of pteros) {
      const a = t * (0.16 + k * 0.03) + k * 2.1
      const R = 70 + k * 25
      obj.position.set(40 + Math.cos(a) * R, 24 + k * 6 + Math.sin(t * 0.7 + k) * 3, 110 + Math.sin(a) * R)
      // Facing along the circle, (-sin a, 0, cos a).
      obj.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a))
      const flap = Math.sin(t * 5 + k) * (Math.sin(t * 0.5 + k) > 0 ? 0.55 : 0.12)
      right.rotation.z = flap
      left.rotation.z = -flap
    }
  })
  track.finish()
  return track
}

// --- Stunt Park ------------------------------------------------------------------

const sandTexture = memoTexture('sandTexture', function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => speckle(g, w, h, '#e3b77a', 0.2, 7000, 3, rng(17)), { repeat: [60, 60] })
})

/** Red-and-white kerb stripes, like a race circuit. */
const kerbTexture = memoTexture('kerbTexture', function kerbTexture() {
  return canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#e63946'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, w, h / 2)
  })
})

function mesa(track, x, z, radius, height) {
  place(track, 'mesa', v3(x, 0, z), x * 0.01, v3(radius / 60, height / 61.5, radius / 60), { shadow: false })
}

function cactus(track, position, r, { collide = true } = {}) {
  const h = 3 + r() * 2.5
  // Spend the seeded calls the old procedural arms used (see burn).
  for (let side = 0; side < 2; side++) if (r() >= 0.3) r()
  if (collide && blocked(track, position, v3(0.6, 0, 0.6), 0)) return
  place(track, 'cactus', position, position.x * 7.3, h / 4.6)
  if (collide) trunkCollider(track, position, 0.6)
}

const barrelMats = ['#e63946', '#1d8fe1', '#f4c430'].map((color) => std({ color, roughness: 0.5, metalness: 0.2 }))
/** A stunt barrel: drop onto it and it goes flying. */
function barrel(track, position, k) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), barrelMats[k % barrelMats.length])
  track.addProp(m, new CANNON.Cylinder(0.45, 0.45, 1.1, 8), new THREE.Vector3(position.x, 0.56, position.z), 8)
}

/** A banner arch over the road with checkered flags. */
function arch(track, dist, color, flags) {
  const s = track.sampleAt(dist)
  const yaw = track.alongAt(s)
  const mat = std({ color })
  for (const sign of [-1, 1]) {
    const c = s.p.clone().addScaledVector(s.side, sign * (track.width / 2 + 1.2))
    const post = new THREE.BoxGeometry(0.8, 8, 0.8)
    post.translate(c.x, 4, c.z)
    track.addGeometry(post, mat)
    solid(track, c, 0.8, 8, 0.8, yaw)
    flags.add(c.clone().setY(0), yaw + (sign > 0 ? 0 : Math.PI) + Math.PI / 2, ['#111111', '#ffffff', '#111111'], { pole: 11, w: 1.8, h: 1.2 })
  }
  const beam = new THREE.BoxGeometry(track.width + 3.2, 1.6, 0.6)
  beam.rotateY(yaw)
  beam.translate(s.p.x, 8, s.p.z)
  track.addGeometry(beam, std({ map: checkerTexture() }))
}

const checkerTexture = memoTexture('checkerTexture', function checkerTexture() {
  return canvasTexture(256, 32, (g, w, h) => {
    for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) {
      g.fillStyle = (x + y) % 32 ? '#111111' : '#ffffff'
      g.fillRect(x, y, 16, 16)
    }
  })
})

/**
 * A grandstand alongside the road (its 30 m length runs along the road),
 * set back well clear of the kerb, with a cheering crowd and flags.
 */
function grandstand(track, dist, sign, flags, crowds) {
  let spot, yaw, middle
  // Slide along until the whole stand is clear of the road and of every jump's landing zone.
  for (let tries = 0; tries < 30; tries++, dist += 8) {
    spot = track.beside(dist, sign * (track.width / 2 + 7))
    yaw = facing(spot.toRoad)
    // The stand fills 10 m behind its front edge; its collider covers that, never the road.
    middle = spot.pos.clone().addScaledVector(spot.toRoad, -5)
    if (!blocked(track, middle, v3(30, 0, 10), yaw, 3)) break
  }
  solid(track, middle, 30, 8, 10, yaw)
  const { pos: front, toRoad, s } = spot
  const stand = spawn(track, 'stadium', front, yaw, 1, { staticParts: ['body'] })
  crowds.push({ crowd: stand.getObjectByName('stadium_crowd'), phase: dist })
  for (const k of [-14, -4.7, 4.7, 14]) {
    flags.add(front.clone().addScaledVector(toRoad, -9.5).addScaledVector(s.t, k), track.alongAt(s), [['#e63946', '#f4c430', '#1d8fe1', '#2a9d8f'][Math.abs(Math.round(k)) % 4]], { pole: 13 })
  }
}

/**
 * The big screen by the start: cheers and emojis, flashing. Every frame of it
 * (five messages, each in two blink states) is drawn once; the screen swaps between them.
 */
const JUMBOTRON_MESSAGES = [['WOW!', '🤩', '#ff5d8f'], ['GO GO GO!', '🏎️', '#ffd23f'], ['BIG JUMP!', '🚀', '#4cc9f0'], ['CRASH!', '💥', '#f77f00'], ['STUNT PARK', '🏁', '#7bd389']]
const jumbotronScreen = () =>
  cached('jumbotron', () => {
    const frames = JUMBOTRON_MESSAGES.flatMap(([text, emoji, color]) =>
      [0, 1].map((blink) =>
        canvasTexture(512, 280, (g, w, h) => {
          g.fillStyle = '#10121a'
          g.fillRect(0, 0, w, h)
          for (let y = 0; y < h; y += 20) for (let x = 0; x < w; x += 20) {
            g.fillStyle = (x + y + blink * 20) % 40 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'
            g.fillRect(x, y, 18, 18)
          }
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.font = '110px sans-serif'
          g.fillText(emoji, 256, 100)
          g.font = 'bold 74px sans-serif'
          g.fillStyle = blink ? color : '#ffffff'
          g.fillText(text, 256, 215)
        }),
      ),
    )
    const material = new THREE.MeshBasicMaterial({ map: frames[0], toneMapped: false })
    // A new message every two seconds, blinking four times a second.
    const show = (t) => (material.map = frames[(Math.floor(t / 2) % JUMBOTRON_MESSAGES.length) * 2 + (Math.floor(t * 4) % 2)])
    return { material, show }
  })

function jumbotron(track, dist, sign) {
  const { pos, toRoad } = track.beside(dist, sign * (track.width / 2 + 16))
  const yaw = facing(toRoad)
  place(track, 'jumbotron', pos, yaw, 1)
  solid(track, pos, 12, 7, 2, yaw)
  const screen = jumbotronScreen()
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.6), screen.material)
  plane.position.copy(pos).addScaledVector(toRoad, 0.58).setY(11)
  plane.rotation.y = yaw + Math.PI // a plane faces +Z; the prop's front is -Z
  track.group.add(plane)
  track.animate((dt, t) => screen.show(t))
}

function buildStunt(env) {
  const track = new Track({
    ...env,
    width: 11,
    seed: 505,
    points: [[0, 0], [160, 0], [225, 40], [235, 125], [185, 175], [60, 172], [-60, 172], [-135, 130], [-145, 50], [-92, 5]],
  })
  prepare(track)
  const r = track.random
  const dr = track.decor
  sceneryBase(track, { ground: std({ map: sandTexture() }), sky: ['#5fb4f0', '#fde3b0'], fog: '#f4dcb2', sun: '#fff1d0' })
  track.buildRoad(std({ map: asphalt({ lines: true }), roughness: 0.85 }))
  track.buildStrip(std({ map: kerbTexture() }), track.width / 2, track.width / 2 + 1, 0.06)
  // Three jumps: a warm-up over barrels, a mega jump, and one more to finish.
  const fillBarrels = (d, c, yaw, s) => {
    for (const k of [-2.4, -1.2, 0, 1.2, 2.4]) barrel(track, c.clone().addScaledVector(s.side, k), (d | 0) + Math.round(k * 2))
  }
  const ramps = std({ color: '#f4c430' })
  const first = track.addJump(230, { length: 8, height: 1.8, gap: 10, width: 8, material: ramps, fill: fillBarrels })
  track.addBoostPad(first - 40)
  const mega = track.addJump(470, { length: 10, height: 2.6, gap: 18, width: 9, material: std({ color: '#e63946' }), fill: fillBarrels })
  track.addBoostPad(mega - 55, { lateral: -2 })
  track.addBoostPad(mega - 55, { lateral: 2 })
  const last = track.addJump(720, { length: 8, height: 2, gap: 12, width: 8, material: ramps, fill: fillBarrels })
  track.addBoostPad(last - 42)
  track.addRamp(820, { length: 6, width: 3.5, height: 1.2, lateral: 3, material: std({ color: '#1d8fe1' }) })
  track.addBoostPad(330, { lateral: -3 })

  track.lineSides({ offset: track.width / 2 + 4, spacing: () => 14 + r() * 16, depth: 0.6 }, ({ center }) => cactus(track, center, r))
  const flags = new Flags(track)
  const crowds = []
  arch(track, 0, '#e63946', flags)
  // Between the first jump and the kicker, so nobody flies into its banner.
  arch(track, 300, '#1d8fe1', flags)
  grandstand(track, 40, 1, flags, crowds)
  grandstand(track, track.length / 2 + 30, -1, flags, crowds)
  track.animate((dt, t) => {
    for (const { crowd, phase } of crowds) crowd.position.y = Math.abs(Math.sin(t * 5 + phase)) * 0.3
  })
  jumbotron(track, 30, -1)
  // Flags on the kerbs at each jump's take-off, read from the jumps themselves.
  const colors = ['#e63946', '#f4c430', '#1d8fe1', '#2a9d8f', '#ff5d8f']
  for (const rp of track.ramps) {
    if (rp.half < 8) continue
    for (const sign of [-1, 1]) {
      const { pos, s } = track.beside(rp.dist - rp.half, sign * (track.width / 2 + 1.8))
      flags.add(pos, track.alongAt(s) + Math.PI, colors[Math.round(rp.dist) % colors.length], { pole: 5, w: 1.8, h: 1.1 })
    }
  }
  // Tyre walls on the outside of the bends, flags all round.
  for (let d = 60; d < track.length; d += 45) {
    const a = track.sampleAt(d - 15).t, b = track.sampleAt(d + 15).t
    const turn = a.x * b.z - a.z * b.x // which way the road bends
    const outside = turn > 0 ? -1 : 1
    if (track.bendAt(d) > 0.04) {
      const { pos, s } = track.beside(d, outside * (track.width / 2 + 2.5))
      if (clear(track, pos, 2.2, 1)) {
        place(track, 'tires', pos, track.alongAt(s) + Math.PI / 2, 1.1)
        solid(track, pos, 1.2, 1.4, 4.8, track.alongAt(s))
      }
    } else {
      const { pos, s } = track.beside(d, -outside * (track.width / 2 + 3))
      if (clear(track, pos, 0.3, 2.5)) flags.add(pos, track.alongAt(s) + Math.PI, colors[Math.floor(d / 45) % colors.length], { pole: 6, collide: true })
    }
  }
  flags.finish()
  // A giant loop-the-loop in the infield, and hot-air balloons drifting over the desert.
  if (track.distanceToRoad(45, 88, 4) > 30) place(track, 'loop', v3(45, 0, 88), 0.3, 1.4)
  const balloons = [[-80, 60, 0], [120, 70, 2], [40, 90, 4], [260, 55, 1]].map(([x, h, k]) => ({ obj: spawn(track, 'balloon', v3(x, h, -60 + k * 60), k, 1.6, { shadow: false }), x, h, k }))
  track.animate((dt, t) => {
    for (const { obj, x, h, k } of balloons) {
      obj.position.set(x + Math.sin(t * 0.04 + k) * 60, h + Math.sin(t * 0.3 + k) * 3, 85 + Math.cos(t * 0.035 + k * 1.7) * 160)
      obj.rotation.y += dt * 0.05
    }
  })
  mesa(track, 320, -260, 70, 60)
  mesa(track, -260, -200, 90, 45)
  mesa(track, 380, 300, 60, 75)
  mesa(track, -300, 330, 80, 55)
  scatter(30, 40, 85, 230, 480, r, (p) => cactus(track, p, r))
  scatter(40, 40, 85, 200, 500, dr, (p) => cactus(track, p, dr, { collide: false }))
  track.finish()
  return track
}

const BUILDERS = { ubud: buildUbud, helsinki: buildHelsinki, montreal: buildMontreal, dino: buildDino, stunt: buildStunt }

/** Builds a place from the loaded Blender props (`props`: name -> node, from models/props.glb). */
export function buildCity(id, env, props) {
  P = props
  return (BUILDERS[id] ?? buildMontreal)(env)
}
