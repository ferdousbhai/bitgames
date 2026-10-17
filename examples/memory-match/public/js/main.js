import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Sound, VOICE_LENGTH } from './audio.js'
import { Effects } from './effects.js'
import { tween, wait, clearTweens, updateTweens, ease } from './tween.js'

// --- Game data ------------------------------------------------------------------------

/**
 * Every animal in models/animals.glb, with the colour of its card spot: thirteen colours spread
 * round the colour wheel, so a face-up pair also reads as a pair of colours. trick: what the animal
 * does when it is extra happy (see TRICKS).
 */
const ANIMALS = {
  fox: { emoji: '🦊', color: '#ff8a6b', trick: 'chase' },
  dog: { emoji: '🐶', color: '#ffb35c', trick: 'chase' },
  lion: { emoji: '🦁', color: '#ffd84a', trick: 'stomp' },
  chick: { emoji: '🐥', color: '#eef56a', trick: 'flap' },
  frog: { emoji: '🐸', color: '#8fdc5f', trick: 'leap' },
  cow: { emoji: '🐮', color: '#6fdcae', trick: 'stomp' },
  fish: { emoji: '🐠', color: '#6fd8ea', trick: 'flip' },
  penguin: { emoji: '🐧', color: '#a9d8ff', trick: 'flip' },
  elephant: { emoji: '🐘', color: '#8c9cff', trick: 'stomp' },
  bunny: { emoji: '🐰', color: '#c9a3ff', trick: 'leap' },
  cat: { emoji: '🐱', color: '#f59ce6', trick: 'chase' },
  pig: { emoji: '🐷', color: '#ffb8cc', trick: 'stomp' },
  panda: { emoji: '🐼', color: '#d6d9e0', trick: 'flip' },
}
const NAMES = Object.keys(ANIMALS)

/** Pairs on each board: two pairs for a 3-year-old, eight for a real puzzle, in gentle steps. */
const LEVELS = [2, 3, 4, 5, 6, 8]
/** How each board looks as a picture on the menu: [columns, rows] of little face-down cards. */
const LEVEL_PICTURES = [[2, 2], [3, 2], [4, 2], [5, 2], [4, 3], [4, 4]]
/**
 * Each new board brings a new look, starting anywhere in the list: the mat's blanket, the card
 * backs and their stars change colour. Some looks are places, and bring their own animals first
 * (farm animals on the farm) and their own weather (snow falling, bubbles rising).
 */
const THEMES = [
  { mat: '#9ee5ca', back: '#ff6fa8', star: '#ffffff', animals: ['bunny', 'frog', 'chick', 'cat'], weather: 'petals', prop: 'flower', table: '#d6f0c4' }, // the garden
  { mat: '#8fdc5f', back: '#e8434f', star: '#ffffff', animals: ['cow', 'pig', 'chick', 'dog', 'cat', 'bunny'], prop: 'hay', table: '#ffe0a8' }, // the farm
  { mat: '#5fb8ff', back: '#1fb59f', star: '#fff27a', animals: ['fish', 'penguin', 'frog'], weather: 'bubbles', prop: 'starfish', table: '#bcdcff' }, // the sea
  { mat: '#5a4fcf', back: '#2a2f6b', panel: '#7950b5', star: '#ffe14d', animals: ['fox', 'cat', 'frog', 'panda'], weather: 'fireflies', night: true, prop: 'lantern', table: '#5a5f8f' }, // the night
  { mat: '#cfe6ff', back: '#3a7bd5', star: '#ffffff', animals: ['penguin', 'panda', 'fox', 'bunny'], weather: 'snow', prop: 'snowman', table: '#e6f0ff' }, // the snow
  { mat: '#ffd36b', back: '#c2541a', star: '#ffffff', animals: ['lion', 'elephant', 'fox', 'frog'], prop: 'palm', table: '#ffd38a' }, // the savanna
  { mat: '#f0a04b', back: '#7a2416', panel: '#a9472d', star: '#ffd23f', animals: ['fox', 'bunny', 'dog', 'pig', 'panda'], weather: 'leaves', prop: 'pumpkin', table: '#e3a77f' }, // the autumn wood
]
/** The menu's own look: the teal blanket, no place. */
const MENU_LOOK = { mat: '#3fd6c4', back: '#7d6bff', star: '#ffd23f' }
/**
 * A pair can be special: golden (gold all over, with crowns, and a flip when found), babies, or
 * twins in party hats, sleepy yawners or confetti sneezers. The golden pair is a treat that comes at least every few boards.
 */
const GOLDEN_CHANCE = 0.1
const GOLDEN_EVERY = 5
/** Seconds between each animal's hello at the finale, so every voice is heard. */
const WIN_CALL_GAP = 0.55
/** Seconds without a tap before a drawn hand shows what to do: soon on a first board, later once the child knows. */
const HAND_FIRST = 5
const HAND_LATER = 14
const HAND_MENU = 7

const CARD_W = 1.0
const CARD_D = 1.3
const GAP_X = 0.24
const GAP_Z = 0.3
const MAT_TOP = 0.03
const REST_Y = MAT_TOP + 0.05 // card centre when lying on the mat
const FACE_TOP = 0.05 // top of the face-up spot above the card centre
const ANIMAL_SIZE = 0.88
const ANIMAL_H = 0.85 * ANIMAL_SIZE
const PARADE_GAP = 1.05

const $ = (id) => document.getElementById(id)
const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// --- Saved progress (finished boards) ---------------------------------------------------

const SAVE_KEY = 'memory-match:v3'
// done: boards finished (a paw on the menu). next: the board ▶ starts.
const progress = { muted: false, done: {}, next: null }
// Sound always starts on: a mute is for this visit only (it is never saved)
try {
  Object.assign(progress, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {})
} catch {}
progress.muted = false
progress.done = { ...progress.done }
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ done: progress.done, next: progress.next }))
  } catch {}
}
// --- Scene ---------------------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
const BG = new THREE.Color('#f3d7b0')
scene.background = BG
scene.fog = new THREE.Fog(BG, 20, 50)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45

const sky = new THREE.HemisphereLight('#fff8ec', '#d9a874', 1.5)
scene.add(sky)
const sun = new THREE.DirectionalLight('#fff3dc', 2.3)
sun.position.set(-3.5, 10, 5)
sun.castShadow = true
const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048
sun.shadow.mapSize.set(shadowSize, shadowSize)
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.02
sun.shadow.radius = 3
scene.add(sun, sun.target)

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120)
const fitCam = camera.clone()
const sound = new Sound()
sound.load()
sound.setMuted(progress.muted)
const effects = new Effects(scene)

const assets = { animals: {}, card: null, setting: {}, felt: null }
const room = { mat: null, felt: null, props: [] }
/** World size of one tile of the mat's checked felt (models/mat_felt.jpg, made by blender/mat_texture.py). */
const FELT_TILE = new THREE.Vector2(1.5, 1.5 * (864 / 1024))
const board = new THREE.Group()
const parade = new THREE.Group()
scene.add(board, parade)

const game = {
  state: 'loading', // loading | menu | dealing | play | won
  level: 0,
  cards: [],
  open: [],
  matched: 0,
  turns: 0, // pairs of cards turned this board
  finale: -1, // last party; random selection never repeats it
  peekabooAt: Infinity, // after this many turns an animal may play peekaboo (once, on most boards)
  round: 0,
  pairs: 0,
  boards: (Math.random() * 7) | 0, // which look comes next (see THEMES): a visit starts anywhere
  sinceGold: 1, // boards since the last golden pair
  theme: null,
  friends: [], // the animals found on the last board: they come back to the menu
  found: [], // the animals found this board, in order (the circles at the top)
  hands: 0, // times the drawn hand has shown on this screen
  busy: false,
  mismatch: null,
  layout: null,
  paradeAnimals: [],
  time: 0,
  idle: 0, // seconds since the last tap
  cam: { pos: new THREE.Vector3(0, 9, 9), offset: new THREE.Vector2() }, // always looks at the origin
}

// --- Assets ------------------------------------------------------------------------------

const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 })
const GLOSSY = new Set(['eye', 'shine', 'nose', 'gold', 'card_star'])

/**
 * The models use one material per colour, which would mean dozens of draw calls per animal.
 * Merge each part into one matte and one glossy mesh, with the colours moved into the vertices.
 * Materials listed in keep stay as their own meshes (the card spot, which is tinted per card).
 */
function bake(part, keep = []) {
  const meshes = part.isMesh ? [part] : part.children.filter((c) => c.isMesh)
  const buckets = new Map([[matte, []], [glossy, []]])
  const out = new THREE.Group()
  out.name = part.name
  out.position.copy(part.position)
  out.quaternion.copy(part.quaternion)
  out.scale.copy(part.scale)
  for (const mesh of meshes) {
    const name = mesh.material.name
    if (keep.includes(name)) {
      out.add(mesh.clone())
      continue
    }
    const geo = mesh.geometry.clone()
    if (mesh !== part) geo.applyMatrix4(mesh.matrix)
    const n = geo.attributes.position.count
    const colors = new Float32Array(n * 3)
    const { r, g, b } = mesh.material.color
    for (let i = 0; i < n * 3; i += 3) {
      colors[i] = r
      colors[i + 1] = g
      colors[i + 2] = b
    }
    for (const key of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(key)) geo.deleteAttribute(key)
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    buckets.get(GLOSSY.has(name) ? glossy : matte).push(geo)
  }
  for (const [material, geos] of buckets) {
    if (!geos.length) continue
    const merged = new THREE.Mesh(mergeGeometries(geos), material)
    merged.castShadow = true
    out.add(merged)
  }
  part.parent.add(out)
  part.removeFromParent()
  return out
}

async function loadAssets() {
  const loader = new GLTFLoader()
  const files = ['animals', 'card', 'setting']
  const loaded = {}
  const bytes = {}
  const report = () => {
    const pct = Math.round((Object.values(bytes).reduce((a, b) => a + b, 0) / 1.1e6) * 100)
    $('loading-bar').style.width = `${Math.min(99, pct)}%`
  }
  const felt = new THREE.TextureLoader().loadAsync('./models/mat_felt.jpg').then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    assets.felt = tex
    assets.feltImage = tex.image
  })
  await Promise.all([
    felt,
    ...files.map(async (name) => {
      loaded[name] = await loader.loadAsync(`./models/${name}.glb`, (e) => {
        bytes[name] = e.loaded
        report()
      })
    }),
  ])
  for (const name of NAMES) {
    const root = loaded.animals.scene.getObjectByName(`animal_${name}`)
    root.position.set(0, 0, 0)
    for (const part of [...root.children]) bake(part)
    assets.animals[name] = root
  }
  assets.card = loaded.card.scene.getObjectByName('card')
  for (const part of [...assets.card.children]) bake(part, ['card_spot', 'card_back', 'card_panel', 'card_star'])
  assets.card.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  for (const child of [...loaded.setting.scene.children]) assets.setting[child.name] = child
}

/** The table's own colours, kept so a night board can dim the wood and bring it back by day. */
const tableColours = new Map()
/** The lantern's warm glow on a night board: a soft light and a halo (always in the scene, so no shader rebuild). */
const lanternLight = new THREE.PointLight('#ffcf6b', 0, 3.2, 1.6)
scene.add(lanternLight)
const haloTexture = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255, 230, 150, 0.9)')
  grad.addColorStop(0.35, 'rgba(255, 205, 100, 0.35)')
  grad.addColorStop(1, 'rgba(255, 190, 80, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})()
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
halo.scale.setScalar(1.3)
halo.visible = false

function buildRoom() {
  const { table, mat } = assets.setting
  table.traverse((o) => {
    if (o.isMesh) for (const m of [o.material].flat()) tableColours.set(m, m.color.clone())
  })
  table.traverse((o) => (o.receiveShadow = true))
  mat.traverse((o) => (o.receiveShadow = true))
  scene.add(table, mat)
  room.mat = mat
  // The felt gets a soft checked blanket texture. The mesh has no UVs, so map its top straight
  // down: one unit of UV per unit of the unstretched mat, scaled to the tile in placeRoom.
  mat.traverse((o) => {
    if (!o.isMesh || o.material.name !== 'mat_felt' || !assets.felt) return
    const pos = o.geometry.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i)
      uv[i * 2 + 1] = pos.getZ(i)
    }
    o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    o.material.map = assets.felt
    o.material.color.set('#ffffff')
    o.material.needsUpdate = true
    room.felt = assets.felt
  })
  for (const name of ['prop_blocks', 'prop_ball', 'prop_rings', 'prop_crayons', 'prop_bear']) {
    const prop = assets.setting[name]
    if (!prop) continue
    prop.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true
    })
    prop.userData.toy = { name, prop, busy: false, size: new THREE.Box3().setFromObject(prop).getSize(new THREE.Vector3()) }
    scene.add(prop)
    room.props.push(prop)
  }
}

const propMat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra })
/**
 * Each place has one toy of its own beside the mat, made here from simple shapes: a flower pot,
 * a hay bale, a starfish, a glowing lantern, a snowman, a palm tree or a pumpkin. Tapping it makes
 * it wobble like the other toys.
 */
function makeThemeProp(kind) {
  const g = new THREE.Group()
  const inner = new THREE.Group() // a touch bigger than the other toys: it is the place's sign
  inner.scale.setScalar(1.25)
  g.add(inner)
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz)
    inner.add(m)
    return m
  }
  if (kind === 'flower') {
    add(new THREE.CylinderGeometry(0.2, 0.15, 0.28, 20), propMat('#d9703c'), 0, 0.14)
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20), propMat('#e8854f'), 0, 0.29)
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), propMat('#4caf50'), 0, 0.5)
    add(new THREE.SphereGeometry(0.08, 10, 8).scale(1.6, 0.4, 1), propMat('#4caf50'), 0.1, 0.42, 0, 0, 0, 0.5)
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2
      add(new THREE.SphereGeometry(0.075, 12, 8).scale(1, 1, 0.4), propMat('#ff8fc0'), Math.cos(ang) * 0.11, 0.74 + Math.sin(ang) * 0.11, 0.02)
    }
    add(new THREE.SphereGeometry(0.07, 12, 8), propMat('#ffd23f'), 0, 0.74, 0.05)
  } else if (kind === 'hay') {
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 24), propMat('#f2c14e', { roughness: 0.95 }), 0, 0.28, 0, 0, 0, Math.PI / 2)
    for (const x of [-0.13, 0.13]) add(new THREE.TorusGeometry(0.285, 0.018, 6, 28), propMat('#b5651d'), x, 0.28, 0, 0, Math.PI / 2)
    add(new THREE.CircleGeometry(0.27, 24), propMat('#e0a93a', { roughness: 1 }), 0.251, 0.28, 0, 0, Math.PI / 2)
  } else if (kind === 'starfish') {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2
      add(new THREE.ConeGeometry(0.09, 0.32, 10).scale(1, 1, 0.45), propMat('#ff7a59'), Math.sin(ang) * 0.14, 0.04, Math.cos(ang) * 0.14, Math.PI / 2, 0, 0).rotation.set(Math.PI / 2, ang, 0, 'YXZ')
    }
    add(new THREE.SphereGeometry(0.1, 14, 8).scale(1, 0.4, 1), propMat('#ff7a59'), 0, 0.04, 0)
    add(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1.1), propMat('#fff1d6'), 0.42, 0, 0.12)
  } else if (kind === 'lantern') {
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 16), propMat('#3b3a5a', { metalness: 0.4 }), 0, 0.03)
    add(new THREE.SphereGeometry(0.15, 18, 12), new THREE.MeshStandardMaterial({ color: '#fff3a8', emissive: '#ffd23f', emissiveIntensity: 1.4, roughness: 0.3 }), 0, 0.22)
    add(new THREE.ConeGeometry(0.19, 0.14, 16), propMat('#3b3a5a', { metalness: 0.4 }), 0, 0.43)
    add(new THREE.TorusGeometry(0.06, 0.015, 6, 16), propMat('#3b3a5a', { metalness: 0.4 }), 0, 0.53)
    halo.position.set(0, 0.22, 0)
    inner.add(halo)
  } else if (kind === 'snowman') {
    const snow = propMat('#ffffff', { roughness: 0.9 })
    add(new THREE.SphereGeometry(0.24, 20, 14), snow, 0, 0.22)
    add(new THREE.SphereGeometry(0.17, 20, 14), snow, 0, 0.55)
    add(new THREE.ConeGeometry(0.035, 0.14, 10), propMat('#ff8c2e'), 0, 0.56, 0.2, Math.PI / 2)
    for (const x of [-0.06, 0.06]) add(new THREE.SphereGeometry(0.022, 8, 6), propMat('#2c2c3a'), x, 0.62, 0.15)
    add(new THREE.TorusGeometry(0.15, 0.04, 8, 20), propMat('#e8434f'), 0, 0.42, 0, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 16), propMat('#2c2c3a'), 0, 0.77)
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16), propMat('#2c2c3a'), 0, 0.7)
  } else if (kind === 'palm') {
    for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.06 - i * 0.005, 0.07 - i * 0.005, 0.18, 10), propMat(i % 2 ? '#a0703c' : '#8a5a2b'), i * 0.02, 0.09 + i * 0.17, 0, 0, 0, -0.06)
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2
      const leaf = add(new THREE.SphereGeometry(0.22, 12, 6).scale(1, 0.12, 0.38), propMat('#3fae49'), 0.1 + Math.cos(ang) * 0.16, 0.92, Math.sin(ang) * 0.16)
      leaf.rotation.set(0, -ang, -0.45)
    }
    add(new THREE.SphereGeometry(0.05, 10, 8), propMat('#6b4423'), 0.12, 0.86, 0.06)
  } else {
    // a pumpkin
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      add(new THREE.SphereGeometry(0.15, 14, 10).scale(0.75, 1, 1.2), propMat('#f28a1e'), Math.cos(ang) * 0.12, 0.2, Math.sin(ang) * 0.12, 0, -ang)
    }
    add(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 8), propMat('#5a7d2a'), 0, 0.4, 0, 0, 0, 0.2)
    add(new THREE.SphereGeometry(0.07, 10, 6).scale(1.5, 0.3, 1), propMat('#6fae3a'), 0.08, 0.38, 0, 0, 0, -0.3)
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  g.name = 'prop_theme'
  g.userData.toy = { name: 'prop_theme', prop: g, busy: false, size: new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()) }
  return g
}
const themeProps = {}
/** Puts this place's own toy beside the mat (none on the menu). */
function setThemeProp(kind) {
  room.props = room.props.filter((p) => p.name !== 'prop_theme')
  for (const p of Object.values(themeProps)) p.removeFromParent()
  if (!kind) return
  const prop = (themeProps[kind] ??= makeThemeProp(kind))
  scene.add(prop)
  room.props.push(prop)
}

/** Stretches the play mat around the area and sets the toys just outside it. */
function placeRoom(hw, hd) {
  const w = hw + 0.45
  const d = hd + 0.45
  room.mat.scale.set((w * 2) / 6, 1, (d * 2) / 6)
  // Keep the checks the same size however far the mat stretches, centred on the board.
  if (room.felt) {
    room.felt.repeat.set(room.mat.scale.x / FELT_TILE.x, room.mat.scale.z / FELT_TILE.y)
    room.felt.offset.set(0.5, 0.5)
  }
  // Wide screens: toys beside the mat. Tall screens (and the menu, whose parade leaves the table
  // behind it empty) have room above the mat instead, so the toys line up behind it.
  const back = game.state === 'menu' ? 0.35 : 0 // a step further back, so no toy looks perched on an animal's head
  const at = game.state === 'menu' || innerWidth / innerHeight < 0.8
    ? {
        prop_crayons: [-w + 0.45, -d - 0.75 - back, 0.3],
        prop_bear: [-w * 0.33, -d - 0.7 - back, 0.2],
        prop_ball: [w * 0.25, -d - 0.75 - back, 0],
        prop_rings: [w - 0.4, -d - 0.7 - back, 0],
        prop_blocks: [0, -d - 1.7 - back * 0.5, 0.5],
        prop_theme: [0, -d - 0.75 - back, 0.3],
      }
    : {
        prop_blocks: [-w - 0.75, d - 0.1, 0.5],
        prop_ball: [w + 0.75, d - 0.2, 0],
        prop_rings: [w + 0.7, -d + 0.3, 0],
        prop_crayons: [-w - 0.8, -d + 0.4, 0.3],
        prop_bear: [-w - 0.8, 0.2, 0.5],
        prop_theme: [w * 0.5, -d - 0.8, -0.4], // behind the mat, where a wide screen has room
      }
  for (const prop of room.props) {
    const [x, z, yaw] = at[prop.name]
    prop.position.set(x, 0, z)
    prop.rotation.set(0, yaw, 0)
    prop.scale.setScalar(1)
    prop.userData.toy.busy = false
  }
  const span = Math.max(w, d) + 2.5
  const cam = sun.shadow.camera
  cam.left = cam.bottom = -span
  cam.right = cam.top = span
  cam.near = 1
  cam.far = 40
  cam.updateProjectionMatrix()
}

/**
 * Slides each toy in towards the mat until the whole toy is on screen (and below the HUD), so
 * none is cut off at the edge; a toy that still does not fit is hidden.
 */
const _box = new THREE.Box3()
const _corner = new THREE.Vector3()
function settleProps(view, w, d) {
  /** A world box's screen rectangle in NDC: [left, right, bottom, top]. */
  const ndcBox = (box) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(fitCam)
      x0 = Math.min(x0, _corner.x); x1 = Math.max(x1, _corner.x)
      y0 = Math.min(y0, _corner.y); y1 = Math.max(y1, _corner.y)
    }
    return [x0, x1, y0, y1]
  }
  fitCam.position.copy(view.pos)
  fitCam.lookAt(0, 0, 0)
  fitCam.setViewOffset(innerWidth, innerHeight, view.offset.x, view.offset.y, innerWidth, innerHeight)
  fitCam.updateProjectionMatrix()
  fitCam.updateMatrixWorld()
  // The HTML on top of the scene, in NDC: a toy may not hide behind it.
  const blockers = []
  for (const el of document.querySelectorAll('#hud:not(.hidden) .hud-left, #hud:not(.hidden) .hud-center, #menu:not(.hidden) #menu-mute, #menu:not(.hidden) #play, #menu:not(.hidden) .level, #win:not(.hidden) .win-card')) {
    const r = el.matches('.win-card') // its layout box: it is still scaled small by the pop-in
      ? { left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth, top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight }
      : el.getBoundingClientRect()
    // The corner buttons get a margin, so a toy never crowds the home or sound button.
    const m = el.matches('.hud-left, #menu-mute') ? 18 : 0
    // A toy peeking out from under the win card or the pair circles looks lost: those must be fully clear.
    const tol = el.matches('.win-card, .hud-center') ? 0.01 : 0.15
    blockers.push([((r.left - m) / innerWidth) * 2 - 1, ((r.right + m) / innerWidth) * 2 - 1, 1 - ((r.bottom + m) / innerHeight) * 2, 1 - ((r.top - m) / innerHeight) * 2, tol])
  }
  // The menu's animals too, with a little headroom, so no toy seems to sit on an animal's head
  // like a hat (they may still pop in, so use their full size).
  const animals = []
  for (const a of game.paradeAnimals) {
    _box.min.set(a.holder.position.x - 0.45 * a.size, 0, -0.3 * a.size)
    _box.max.set(a.holder.position.x + 0.45 * a.size, ANIMAL_H * a.size / ANIMAL_SIZE + 0.3, 0.3 * a.size)
    animals.push(ndcBox(_box))
  }
  const shown = (lo, hi, min, max) => Math.max(0, Math.min(hi, max) - Math.max(lo, min)) / (hi - lo)
  // The whole toy (bar a sliver) must be on screen and clear of the HTML: a toy cut off at the edge looks broken.
  const onScreen = (prop) => {
    prop.updateMatrixWorld(true)
    const [x0, x1, y0, y1] = ndcBox(_box.setFromObject(prop))
    if (shown(x0, x1, -1, 1) * shown(y0, y1, -1, 1) < 0.97) return false
    if (!animals.every(([l, r, b, t]) => shown(x0, x1, l, r) * shown(y0, y1, b, t) < 0.02)) return false
    // nor hidden behind (or in front of) a toy already placed
    if (!placed.every(([l, r, b, t]) => shown(x0, x1, l, r) * shown(y0, y1, b, t) < 0.12)) return false
    return blockers.every(([l, r, b, t, tol]) => shown(x0, x1, l, r) * shown(y0, y1, b, t) < tol)
  }
  const placed = []
  // The place's own toy is placed first, so it is the one that stays when space is short
  for (const prop of [...room.props].sort((a, b) => (b.name === 'prop_theme') - (a.name === 'prop_theme'))) {
    const { size } = prop.userData.toy
    const side = Math.abs(prop.position.x) > w // beside the mat, so it can slide in sideways
    const inner = w + 0.08 + Math.max(size.x, size.z) / 2
    let ok = onScreen(prop)
    while (!ok && side && Math.abs(prop.position.x) - 0.1 >= inner) {
      prop.position.x -= Math.sign(prop.position.x) * 0.1
      ok = onScreen(prop)
    }
    // Behind the mat: step back until it is clear of the animals in front, or (cut off at the top
    // of the screen) forward towards the mat's edge.
    const z = prop.position.z
    const front = -d - 0.05 - size.z / 2
    for (let k = 1; !ok && !side && k <= 20; k++) {
      for (const dz of [-0.1 * k, 0.1 * k]) {
        if (z + dz > front) continue
        prop.position.z = z + dz
        if ((ok = onScreen(prop))) break
      }
    }
    if (!ok) prop.position.z = z
    // The place's own toy always gets a spot: if its own does not fit, it takes another toy's
    // (that toy then finds somewhere else, or sits this board out)
    // (or, on a crowded screen, a smaller version of itself)
    if (!ok && prop.name === 'prop_theme') {
      const home = prop.position.clone()
      const spots = [home, ...room.props.filter((o) => o !== prop).map((o) => new THREE.Vector3(o.position.x, 0, o.position.z))]
      for (const scale of [1, 0.8, 0.62]) {
        prop.scale.setScalar(scale)
        for (const spot of spots) {
          prop.position.copy(spot)
          if ((ok = onScreen(prop))) break
          // behind the mat it may also step back or forward a little
          for (const dz of [-0.3, -0.6, 0.3]) {
            prop.position.z = spot.z + dz
            if (!side && prop.position.z > front) continue
            if ((ok = onScreen(prop))) break
          }
          if (ok) break
        }
        if (ok) break
      }
      if (!ok) {
        prop.position.copy(home)
        prop.scale.setScalar(1)
      }
    }
    prop.visible = ok
    if (ok) placed.push(ndcBox(_box.setFromObject(prop)))
  }
  fitCam.clearViewOffset()
}
// --- Animals -------------------------------------------------------------------------------

function makeAnimal(name) {
  const root = assets.animals[name].clone(true)
  const holder = new THREE.Group()
  holder.add(root)
  const head = root.getObjectByName(`${name}_head`)
  const a = {
    name, holder, head,
    phase: Math.random() * 10,
    pop: 1, hop: 0, spin: 0, yaw: 0, squash: 0, nod: 0, shake: 0, tilt: 0, excited: false, baseY: 0, size: ANIMAL_SIZE,
    chat: 0, // bobs while the animal calls (see chatter)
    roll: 0, rock: 0, // a forward flip and a side-to-side rock of the whole body (see TRICKS)
    busy: false,
  }
  holder.userData.animal = a // lets a tap find its animal (see tagged())
  return a
}

/** An animal says hello: its own call, with its head and body bobbing in time. */
function chatter(a) {
  const pitch = a.small ? 1.4 : 1 // a baby calls higher (and quicker)
  sound.voice(a.name, 0, pitch)
  const len = (VOICE_LENGTH[a.name] ?? 0.5) / pitch
  tween(len + 0.15, (t) => (a.chat = Math.sin(t * Math.PI * Math.max(2, Math.round(len * 9))) * (1 - t * 0.6) * (t < 1 ? 1 : 0)))
}

/** A tapped animal is happy to see you: a hop, its call and a few stars. */
function cheer(a, pos) {
  if (a.busy) return
  hopOnce(a, 0.38)
  chatter(a)
  if (pos) effects.sparkle(pos, { count: 8, speed: 1.3, up: 1.6, size: 0.06 })
}

/** Each animal arrives its own way: now a twirl, now a wiggle, now a look around. */
function flourish(a) {
  if (a.busy) return
  const pick = (Math.random() * 3) | 0
  if (pick === 0) tween(0.5, (t) => (a.spin = ease.inOutCubic(t) * Math.PI * 2 * (t < 1 ? 1 : 0)))
  else if (pick === 1) tween(0.6, (t) => (a.tilt = Math.sin(t * Math.PI * 4) * 0.3 * (1 - t)))
  else tween(0.8, (t) => (a.shake = Math.sin(t * Math.PI * 2) * 0.5 * (1 - t)))
}

/** Turns an animal (smoothly) to face the yaw `to`. */
function turnTo(a, to, dur = 0.28) {
  const from = a.yaw
  return tween(dur, (t) => (a.yaw = from + (to - from) * ease.inOutCubic(t)))
}

function poseAnimal(a, time) {
  const t = time + a.phase
  const bounce = a.excited ? Math.abs(Math.sin(t * 6.5)) * 0.07 : 0
  a.holder.position.y = a.baseY + a.hop + bounce
  a.holder.rotation.set(a.roll + (a.lean ?? 0), a.yaw + a.spin, a.rock)
  const s = a.pop * a.size
  const breathe = Math.sin(t * 3) * 0.02
  const bob = Math.abs(a.chat)
  const w = s * (1 + a.squash * 0.5 + bob * 0.05)
  a.holder.scale.set(w, s * (1 - a.squash + breathe + bob * 0.08), w)
  if (a.head) a.head.rotation.set((a.lookUp ?? 0) + a.nod - bob * 0.28 + Math.sin(t * 2.3) * 0.05, a.shake + Math.sin(t * 0.9) * 0.12, a.tilt + Math.sin(t * 1.7) * 0.07)
}

/** A happy dance: three hops, a full spin and a wiggly head. */
function dance(a, { delay = 0, dur = 1.25, hops = 3, height = 0.45 } = {}) {
  a.busy = true
  return tween(dur, (t) => {
    const ph = (t * hops) % 1
    a.hop = Math.sin(ph * Math.PI) * height * (1 - t * 0.35)
    a.squash = ph < 0.12 ? (0.12 - ph) * 1.4 : ph > 0.9 ? (ph - 0.9) * 1.6 : -0.06
    a.spin = ease.inOutCubic(t) * Math.PI * 2
    a.tilt = Math.sin(t * Math.PI * hops * 2) * 0.28
    if (t >= 1) Object.assign(a, { hop: 0, squash: 0, spin: 0, tilt: 0, busy: false })
  }, { delay })
}

function hopOnce(a, height = 0.3) {
  if (a.busy) return
  a.busy = true
  tween(0.45, (t) => {
    a.hop = Math.sin(t * Math.PI) * height
    a.squash = t < 0.15 ? (0.15 - t) * 1.2 : 0
    a.nod = -Math.sin(t * Math.PI) * 0.2
    if (t >= 1) Object.assign(a, { hop: 0, squash: 0, nod: 0, busy: false })
  })
}

/**
 * Each kind of animal has its own happy trick, done when a pair is found (and on three quick taps):
 * a dog chases its tail, a frog leaps, an elephant stomps, a chick flaps, a penguin flips.
 */
const TRICKS = {
  chase: (a) => tween(1.0, (t) => {
    a.spin = ease.inOutCubic(t) * Math.PI * 6
    a.hop = Math.abs(Math.sin(t * Math.PI * 3)) * 0.18
    a.tilt = Math.sin(t * Math.PI * 6) * 0.2
  }),
  leap: (a) => tween(1.0, (t) => {
    // crouch, spring up high, land with a squash
    if (t < 0.2) a.squash = (t / 0.2) * 0.3
    else if (t < 0.8) {
      const u = (t - 0.2) / 0.6
      a.squash = -0.12 * Math.sin(u * Math.PI)
      a.hop = Math.sin(u * Math.PI) * 1.1
    } else {
      a.hop = 0
      a.squash = Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.3
    }
  }),
  stomp: (a) => tween(1.1, (t) => {
    const ph = t * 4
    a.rock = Math.sin(ph * Math.PI) * 0.22 * (1 - t * 0.5)
    a.hop = Math.abs(Math.sin(ph * Math.PI)) * 0.14
    a.squash = Math.max(0, Math.cos(ph * Math.PI * 2)) * 0.08
  }),
  flap: (a) => tween(1.0, (t) => {
    a.hop = Math.abs(Math.sin(t * Math.PI * 5)) * 0.28
    a.tilt = Math.sin(t * Math.PI * 10) * 0.25
    a.rock = Math.sin(t * Math.PI * 5) * 0.12
  }),
  flip: (a) => tween(1.0, (t) => {
    a.hop = Math.sin(t * Math.PI) * 0.85
    a.roll = -ease.inOutCubic(t) * Math.PI * 2
  }),
}
/** Does the animal's own trick; a golden one does a flip and then its own trick. */
async function trick(a, golden = false) {
  if (a.busy) return
  a.busy = true
  if (golden) await TRICKS.flip(a)
  await TRICKS[ANIMALS[a.name].trick](a)
  Object.assign(a, { hop: 0, squash: 0, spin: 0, tilt: 0, roll: 0, rock: 0, busy: false })
}

// --- Cards ------------------------------------------------------------------------------------

const ringGeometry = new THREE.TorusGeometry(0.37, 0.03, 8, 48)
const goldRingGeometry = new THREE.TorusGeometry(0.4, 0.05, 10, 48)
const ringMaterial = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 })
/** One tinted card-spot material per animal, shared by every card that shows it. */
const spotMaterials = {}

/** The card backs' colours, shared by every card and changed for each board (see THEMES). */
const themeMaterials = {
  card_back: new THREE.MeshStandardMaterial({ roughness: 0.4 }),
  card_panel: new THREE.MeshStandardMaterial({ roughness: 0.4 }),
  card_star: new THREE.MeshStandardMaterial({ roughness: 0.3 }),
}
/** A golden pair's spot, its animals' shine and its ring. */
const goldSpot = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.6 })
/**
 * A golden animal is gold all over: each colour becomes a shade of gold by its brightness, so dark
 * eyes stay dark and a pink pig turns as golden as a yellow chick.
 */
const goldMaterials = new Map(
  [matte, glossy].map((m) => {
    const gold = Object.assign(m.clone(), { metalness: 0.55, roughness: m === glossy ? 0.12 : 0.32, emissive: new THREE.Color('#ff9d00'), emissiveIntensity: 0.12 })
    gold.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = vec3(1.0, 0.76, 0.2) * (0.25 + lum * 1.0);`,
      )
    }
    gold.customProgramCacheKey = () => 'gold'
    return [m, gold]
  }),
)

/** Where the top of each animal's head is (in the head's own space), measured once. */
const headTops = {}
function headTop(a) {
  const key = a.small ? `${a.name}-baby` : a.name
  if (headTops[key]) return headTops[key]
  a.holder.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(a.head)
  const top = a.head.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2))
  return (headTops[key] = { top, width: box.max.x - box.min.x })
}

/** The middle of an animal's round head (in the head's own space) and its smallest size, measured once. */
const headBoxes = {}
function headBox(a) {
  const key = a.small ? `${a.name}-baby` : a.name
  if (headBoxes[key]) return headBoxes[key]
  a.holder.updateMatrixWorld(true)
  // Tall ears would pull the middle up: the round part is taken from the bottom of the head
  const box = new THREE.Box3().setFromObject(a.head)
  const size = box.getSize(new THREE.Vector3())
  const center = a.head.worldToLocal(box.getCenter(new THREE.Vector3()).setY(box.min.y + Math.min(size.x, size.y) * 0.5))
  return (headBoxes[key] = { center, size: Math.min(size.x, size.y, size.z) })
}

const hatParts = {
  crownBand: new THREE.CylinderGeometry(0.1, 0.09, 0.07, 20, 1, true),
  crownPoint: new THREE.ConeGeometry(0.028, 0.07, 8),
  jewel: new THREE.SphereGeometry(0.02, 10, 6),
  cone: new THREE.ConeGeometry(0.075, 0.2, 20),
  pompom: new THREE.SphereGeometry(0.035, 12, 8),
  bonnet: new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  bonnetCloth: new THREE.MeshStandardMaterial({ color: '#bfe3ff', roughness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }),
  ruby: new THREE.MeshStandardMaterial({ color: '#ff3d6e', roughness: 0.2 }),
  white: new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.8 }),
}
const PARTY_COLOURS = ['#ff5d8f', '#3fa2ff', '#6ad35a', '#b388ff', '#ff8c2e']

/** Puts something on an animal's head: a golden crown, or a party hat in a colour. */
function putOnHat(a, kind, colour) {
  if (!a.head) return
  const { top, width } = headTop(a)
  const g = new THREE.Group()
  if (kind === 'bonnet') {
    // A baby's soft bonnet over the back of its head (centred on the head, not on top of tall
    // ears), with a little bow at the side
    const head = headBox(a)
    const cap = new THREE.Mesh(hatParts.bonnet, hatParts.bonnetCloth)
    cap.rotation.x = -1.05
    const bow = new THREE.Mesh(hatParts.pompom, hatParts.white)
    bow.position.set(0.13, -0.04, 0.02)
    g.add(cap, bow)
    g.position.copy(head.center)
    g.scale.setScalar((head.size * 0.58) / 0.15 / a.head.scale.x)
    a.head.add(g)
    return
  } else if (kind === 'crown') {
    g.add(new THREE.Mesh(hatParts.crownBand, hatParts.gold))
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2
      const point = new THREE.Mesh(hatParts.crownPoint, hatParts.gold)
      point.position.set(Math.sin(ang) * 0.095, 0.065, Math.cos(ang) * 0.095)
      const jewel = new THREE.Mesh(hatParts.jewel, hatParts.ruby)
      jewel.position.set(Math.sin(ang) * 0.1, 0, Math.cos(ang) * 0.1)
      g.add(point, jewel)
    }
    g.position.copy(top).add(new THREE.Vector3(0, 0.02, 0))
  } else {
    const cone = new THREE.Mesh(hatParts.cone, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 }))
    cone.position.y = 0.1
    const pompom = new THREE.Mesh(hatParts.pompom, hatParts.white)
    pompom.position.y = 0.21
    g.add(cone, pompom)
    g.position.copy(top).add(new THREE.Vector3(0.02, -0.02, 0))
    g.rotation.z = -0.25
  }
  g.scale.setScalar((THREE.MathUtils.clamp(width / 0.5, 0.8, 1.4) * (kind === 'party' ? 1.6 : 1)) / a.head.scale.x)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  a.head.add(g)
}

/** Babies are softer and paler than grown-ups: a gentle cream glow lifts every colour. */
const babyMaterials = new Map(
  [matte, glossy].map((m) => [m, Object.assign(m.clone(), { emissive: new THREE.Color('#fff1e6'), emissiveIntensity: 0.1 })]),
)

/** A baby: small and round, with a big head that looks up at the child. */
function babyfy(a) {
  a.small = 0.6
  if (a.head) {
    for (const part of a.head.parent.children) if (part !== a.head) part.scale.set(0.82, 0.7, 0.82) // a short, round little body
    a.head.position.multiplyScalar(0.72)
    a.head.scale.setScalar(1.45)
    a.lookUp = -0.4
    putOnHat(a, 'bonnet')
  }
  a.holder.traverse((o) => {
    if (o.isMesh && babyMaterials.has(o.material)) o.material = babyMaterials.get(o.material)
  })
}
const feltCanvases = {}

/** Each place tints the table a little, so a board feels like a trip somewhere (night is darkest). */
function tintTable(colour) {
  const tint = new THREE.Color(colour)
  for (const [m, c] of tableColours) m.color.copy(c).multiply(tint)
}

/** A night board is lit by moonlight: cooler, softer light (the fireflies glow in it). */
function setNight(on) {
  sky.color.set(on ? '#b8c4ff' : '#fff8ec')
  sky.groundColor.set(on ? '#6a5a8a' : '#d9a874')
  sky.intensity = on ? 1.4 : 1.5
  sun.color.set(on ? '#e5e6ff' : '#fff3dc')
  sun.intensity = on ? 1.9 : 2.3
  scene.environmentIntensity = on ? 0.36 : 0.45
  renderer.toneMappingExposure = on ? 1.02 : 1.05
  BG.set(on ? '#5b4f7a' : '#f3d7b0')
  lanternLight.intensity = on ? 2.2 : 0
  halo.visible = on
  scene.fog.color.copy(BG)
  document.body.classList.toggle('night', on)
}

/** Dresses the table for a new board: the blanket and the card backs take the next colours. */
function applyTheme(theme) {
  setNight(!!theme.night)
  tintTable(theme.table ?? '#ffffff')
  setThemeProp(theme.prop)
  themeMaterials.card_back.color.set(theme.back)
  themeMaterials.card_panel.color.set(theme.panel ?? theme.back).lerp(new THREE.Color('#fff1dd'), theme.panel ? 0 : 0.22)
  themeMaterials.card_star.color.set(theme.star)
  if (!room.felt || !assets.feltImage) return
  // The same soft checked blanket, dyed: its light and shade kept, its colour changed
  room.felt.image = feltCanvases[theme.mat] ??= (() => {
    const img = assets.feltImage
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    g.globalCompositeOperation = 'color'
    g.fillStyle = theme.mat
    g.fillRect(0, 0, c.width, c.height)
    return c
  })()
  room.felt.needsUpdate = true
}

class Card {
  /** Both twins share their costume or reveal surprise. */
  constructor(animal, special = null, hatColour = null) {
    this.animal = animal
    this.special = special
    const golden = (this.golden = special === 'gold')
    this.state = 'down' // down | opening | open | closing | matched
    this.group = new THREE.Group()
    this.group.userData.card = this // a tap anywhere on the card, its animal or its ring finds the card
    this.pivot = new THREE.Group()
    this.group.add(this.pivot)
    const mesh = assets.card.clone(true)
    mesh.traverse((o) => {
      if (!o.isMesh) return
      const name = o.material.name
      if (name === 'card_spot') {
        o.material = golden ? goldSpot : (spotMaterials[animal] ??= o.material.clone())
        if (!golden) o.material.color.set(ANIMALS[animal].color)
      } else if (themeMaterials[name]) o.material = themeMaterials[name]
    })
    this.pivot.add(mesh)
    this.critter = makeAnimal(animal)
    this.critter.baseY = FACE_TOP
    if (golden) {
      this.critter.holder.traverse((o) => {
        if (o.isMesh && goldMaterials.has(o.material)) o.material = goldMaterials.get(o.material)
      })
      putOnHat(this.critter, 'crown')
    } else if (special === 'baby') babyfy(this.critter)
    else if (special === 'hat') putOnHat(this.critter, 'party', hatColour)
    this.critter.holder.position.z = 0.1
    this.critter.holder.visible = false
    this.critter.pop = 0
    this.group.add(this.critter.holder)
    this.ring = new THREE.Mesh(golden ? goldRingGeometry : ringGeometry, ringMaterial)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = FACE_TOP + 0.01
    this.ring.visible = false
    this.group.add(this.ring)
    this.hover = 0
    this.hoverTarget = 0
    this.lift = 0
    this.revealed = null
  }

  /**
   * Peekaboo: the card lifts like a lid on one side, its animal peeps out from under it and waves,
   * then hides again. A small surprise (see game.peekabooAt); tapping the card flips it as usual.
   */
  peekaboo() {
    if (this.state !== 'down' || this.peeking) return
    this.peeking = true
    const a = this.critter
    const side = this.group.position.x > 0 ? -1 : 1 // the lid opens towards the middle of the board
    const hinge = -side * 0.5
    a.holder.visible = true
    a.holder.position.x = hinge * 0.35
    sound.giggle()
    const tidy = () => {
      this.pivot.position.x = 0
      this.peekLift = 0
      a.holder.position.x = 0
      Object.assign(a, { tilt: 0, rock: 0 })
      this.peeking = false
    }
    tween(2.2, (t) => {
      if (!this.peeking) return
      if (this.state !== 'down') {
        // Tapped mid-peekaboo: the flip takes over from here
        this.pivot.rotation.z = 0
        return tidy()
      }
      const k = t < 0.2 ? ease.outCubic(t / 0.2) : t > 0.82 ? 1 - ease.inCubic((t - 0.82) / 0.18) : 1
      const lid = k * 0.95
      this.pivot.rotation.z = side * lid
      this.pivot.position.x = hinge + side * 0.5 * Math.cos(lid)
      this.peekLift = 0.5 * Math.sin(lid)
      a.pop = k * 0.8
      a.tilt = Math.sin(t * Math.PI * 9) * 0.32 * k
      a.rock = Math.sin(t * Math.PI * 4.5) * 0.14 * k
      if (t >= 1) {
        this.pivot.rotation.z = 0
        a.holder.visible = false
        a.pop = 0
        tidy()
      }
    })
  }

  /** Flips the card with a hop; its animal pops out and optionally calls. */
  flipUp({ call = true } = {}) {
    this.state = 'opening'
    sound.flip()
    this.revealed = this.reveal(call) // tapCard waits on this for both cards of a turn
    return this.revealed
  }

  async reveal(call) {
    // Up it jumps, stretching thin as it turns edge-on, then lands with a squash
    await tween(0.4, (t) => {
      this.pivot.rotation.z = ease.inOutCubic(t) * Math.PI
      this.lift = Math.sin(t * Math.PI) * 0.65
      this.pivot.scale.x = 1 - Math.sin(t * Math.PI) * 0.14
    })
    this.pivot.scale.x = 1
    this.lift = 0
    this.land()
    sound.pop()
    effects.sparkle(this.worldTop(), { count: 10, speed: 1.4, up: 1.6, size: 0.06 })
    if (this.golden) {
      // A golden one! It glitters as it comes out
      sound.shimmer()
      effects.sparkle(this.worldTop(), { count: 24, speed: 2, up: 2.2, size: 0.08, colors: GOLD })
    }
    if (this.special === 'hat') {
      // Party time! A pop of confetti and a toot
      sound.toot()
      effects.burst(this.worldTop())
    }
    if (call) chatter(this.critter)
    await this.showAnimal()
    if (this.state === 'opening' && ['sleepy', 'sneeze'].includes(this.special)) this.surprise()
    else if (this.state === 'opening') flourish(this.critter)
    if (this.state === 'opening') this.state = 'open'
  }

  /** A drowsy yawn then a pop awake, or a wind-up sneeze with a tiny confetti puff. */
  surprise() {
    const a = this.critter
    const sleepy = this.special === 'sleepy'
    let popped = false
    tween(1.25, (t) => {
      if (!['opening', 'open', 'matched'].includes(this.state)) return
      const wind = Math.sin(Math.min(1, t / 0.65) * Math.PI / 2)
      a.nod = t < 0.65 ? wind * (sleepy ? 0.65 : -0.35) : 0
      a.squash = t < 0.65 ? wind * 0.18 : 0
      a.chat = sleepy && t < 0.65 ? wind * 0.8 : 0
      if (t >= 0.65 && !popped) {
        popped = true
        sound.boing()
        hopOnce(a, sleepy ? 0.5 : 0.25)
        if (!sleepy) { sound.toot(); effects.burst(this.worldTop()) }
      }
      if (t >= 1) Object.assign(a, { nod: 0, squash: 0, chat: 0 })
    })
  }

  /** The animal bursts out big, leaning out towards the child for a beat, then settles on its spot. */
  async showAnimal() {
    const a = this.critter
    a.holder.visible = true
    // The burst is a little smaller on the back rows, so the animal stays clear of the HUD
    const multiRow = game.layout.grid.rows >= 2
    const big = multiRow ? 1.12 : 1.4 - 0.15 * (this.backness ?? 0)
    const reach = multiRow ? 0.16 : 0.4
    await tween(0.3, (t) => {
      a.pop = Math.min(multiRow ? 1.2 : Infinity, ease.outBack(t) * big)
      a.hop = ease.outCubic(t) * 0.55
      a.holder.position.z = 0.1 + ease.outCubic(t) * reach
    })
    await tween(0.35, (t) => {
      const e = ease.inOutCubic(t)
      a.pop = big - (big - 1) * e
      a.hop = 0.55 * (1 - e)
      a.holder.position.z = 0.1 + reach * (1 - e)
      a.squash = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.18 : 0
    })
    Object.assign(a, { pop: 1, hop: 0, squash: 0 })
    a.holder.position.z = 0.1
  }

  /** A baby pair's grown-up pops up behind the baby, nuzzles it and stays. */
  callParent() {
    const p = (this.parent = makeAnimal(this.animal))
    p.baseY = FACE_TOP
    p.size = (this.critter.size / (this.critter.small ?? 1)) * 0.8
    p.yaw = this.critter.yaw
    p.lean = this.critter.lean
    p.pop = 0
    p.holder.position.set(0.24, 0, -0.24) // behind the baby and to one side, still on its own card
    this.critter.holder.position.x = -0.12
    this.group.add(p.holder)
    sound.pop(0.1)
    effects.sparkle(this.worldTop(), { count: 10, speed: 1.2, up: 1.6, colors: HEARTS })
    tween(0.45, (t) => (p.pop = ease.outBack(t)), { delay: 0.1 })
    tween(1.2, (t) => (p.nod = Math.sin(t * Math.PI * 3) * 0.25 * (1 - t)), { delay: 0.5 })
  }

  /** A tap while the game is busy: the card gives a tiny wiggle, so the tap is felt. */
  wiggle() {
    if (this.wiggling) return
    this.wiggling = true
    sound.tick()
    tween(0.35, (t) => {
      this.pivot.rotation.y = Math.sin(t * Math.PI * 4) * 0.08 * (1 - t)
      if (t >= 1) {
        this.pivot.rotation.y = 0
        this.wiggling = false
      }
    })
  }

  /** A face-down card lifts one corner for a peek, then lies down again (idle life only, never a hint). */
  peekCorner() {
    if (this.state !== 'down' || this.peeking) return
    this.peeking = true
    const side = Math.random() < 0.5 ? -1 : 1
    tween(1.1, (t) => {
      // Tapped mid-peek: the flip takes over at once
      const k = this.state === 'down' && t < 1 ? Math.sin(t * Math.PI) ** 2 : 0
      this.pivot.rotation.x = -k * 0.22
      if (this.state === 'down') this.pivot.rotation.z = side * k * 0.12
      this.peekLift = k * 0.08
      if (t >= 1) this.peeking = false
    })
  }

  /** Animal ducks back into the card, which flips face down. */
  close(fast = false) {
    this.closing = this.shut(fast)
    return this.closing
  }

  async shut(fast) {
    this.state = 'closing'
    const a = this.critter
    a.excited = false
    await tween(fast ? 0.12 : 0.22, (t) => (a.pop = 1 - ease.inCubic(t)))
    a.holder.visible = false
    sound.flip()
    await tween(fast ? 0.28 : 0.38, (u) => {
      this.pivot.rotation.z = Math.PI * (1 - ease.inOutCubic(u))
      this.lift = Math.sin(u * Math.PI) * 0.5
    })
    this.lift = 0
    this.state = 'down'
    this.land(false)
  }

  land(puff = true) {
    if (puff) effects.puff(this.group.position.clone().setY(MAT_TOP), { count: 7, radius: 0.45, size: 0.06 })
    tween(0.3, (t) => {
      const k = Math.sin(t * Math.PI) * (1 - t * 0.4)
      this.pivot.scale.y = 1 - k * 0.3
      this.pivot.scale.x = this.pivot.scale.z = 1 + k * 0.08
    })
  }

  showRing() {
    this.ring.visible = true
    tween(0.5, (t) => this.ring.scale.setScalar(ease.outBack(t) + 0.001))
  }

  worldTop() {
    return this.group.position.clone().setY(REST_Y + FACE_TOP + 0.45)
  }

  /** Where the card is on screen, in pixels. */
  screenPoint() {
    _p.copy(this.group.position).setY(REST_Y + 0.05).project(camera)
    return { x: ((_p.x + 1) / 2) * innerWidth, y: ((1 - _p.y) / 2) * innerHeight }
  }

  update(dt, time) {
    const hoverTarget = this.state === 'down' ? this.hoverTarget : 0
    this.hover = THREE.MathUtils.damp(this.hover, hoverTarget, 14, dt)
    this.pivot.position.y = this.lift + this.hover * 0.08 + (this.peekLift ?? 0)
    if (this.critter.holder.visible) poseAnimal(this.critter, time)
    if (this.parent) poseAnimal(this.parent, time)
    if (this.ring.visible) this.ring.rotation.z += dt * 0.6
  }
}
const _p = new THREE.Vector3()
// --- Layout and camera ---------------------------------------------------------------------------

/** Picks the grid (columns x rows) that makes the cards biggest on this screen. */
function chooseGrid(n, region) {
  const aspect = region.w / Math.max(1, region.h)
  const elev = elevation()
  let best = null
  for (let cols = 2; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const w = cols * CARD_W + (cols - 1) * GAP_X + 0.4
    const h = (rows * CARD_D + (rows - 1) * GAP_Z) * Math.sin(elev) + ANIMAL_H * Math.cos(elev) + 0.4
    const empty = cols * rows - n
    // A lone card on its own last row looks left over (see rowSizes, which avoids it when it can)
    const sizes = rowSizes(n, cols, rows)
    const lone = rows > 1 && sizes.at(-1) === 1 ? 0.8 : 1
    // Full rows look tidy: each short row costs a little
    const short = sizes.filter((k) => k < cols).length
    const score = Math.min(aspect / w, 1 / h) * (1 - empty * 0.04) * (1 - short * 0.05) * lone
    if (!best || score > best.score) best = { cols, rows, score }
  }
  return best
}

function elevation() {
  return THREE.MathUtils.degToRad(game.state === 'menu' ? 34 : innerWidth / innerHeight < 0.8 ? 54 : 47)
}

/**
 * Cards in each row. The gaps are shared out over the last rows (4+3+3, not 4+4+2; 3+3+2+2, not
 * 3+3+3+1), so no card is left alone on a row; when there are too many gaps the last row is short.
 */
function rowSizes(n, cols, rows) {
  const empty = cols * rows - n
  if (empty < rows) {
    // The short rows go to the ends, first and last in turn (10 in four rows: 2+3+3+2), so the
    // board stays even and balanced
    const shortRows = new Set(Array.from({ length: empty }, (_, k) => (k % 2 ? Math.floor(k / 2) : rows - 1 - Math.floor(k / 2))))
    return Array.from({ length: rows }, (_, r) => (shortRows.has(r) ? cols - 1 : cols))
  }
  return Array.from({ length: rows }, (_, r) => (r === rows - 1 ? n - cols * (rows - 1) : cols))
}

function slots(n, cols, rows) {
  const out = []
  const pitchX = CARD_W + GAP_X
  const pitchZ = CARD_D + GAP_Z
  rowSizes(n, cols, rows).forEach((inRow, r) => {
    for (let c = 0; c < inRow; c++) out.push(new THREE.Vector3((c - (inRow - 1) / 2) * pitchX, REST_Y, (r - (rows - 1) / 2) * pitchZ))
  })
  return { list: out, hw: (cols * pitchX - GAP_X) / 2, hd: (rows * pitchZ - GAP_Z) / 2 }
}

/** The part of the screen (in pixels) the 3D board may use, between the HTML bits. */
function freeRegion() {
  const w = innerWidth
  const h = innerHeight
  let top = 8
  let bottom = h - 8
  if (game.state === 'menu') {
    top = 12
    bottom = document.querySelector('.menu-bottom').getBoundingClientRect().top - 4
  } else {
    for (const el of document.querySelectorAll('.hud-left, .hud-center')) top = Math.max(top, el.getBoundingClientRect().bottom + 6)
    bottom = h - 10 - safeBottom()
  }
  // The win card sits below the board (or beside it on short landscape screens), so the
  // dancing animals stay in view instead of hiding behind it.
  let left = 8
  let right = w - 8
  const el = document.querySelector('.win-card')
  if (!$('win').classList.contains('hidden')) {
    // Layout box, not getBoundingClientRect: the card is still scaled small by its pop-in.
    if (el.offsetLeft > w * 0.4) right = el.offsetLeft - 10
    else bottom = el.offsetTop - 24
  }
  if (bottom - top < h * 0.3) {
    top = Math.min(top, h * 0.35)
    bottom = Math.max(bottom, h * 0.85)
  }
  return { top, bottom, left, right, w: right - left, h: bottom - top }
}

const safeProbe = document.createElement('div')
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)'
document.body.appendChild(safeProbe)
function safeBottom() {
  return parseFloat(getComputedStyle(safeProbe).paddingBottom) || 0
}

/**
 * Frames the box (x within hw, z from -back to hd, up to height) in the free region, looking at
 * the origin.
 */
function frame(hw, hd, height, back = hd) {
  const w = innerWidth
  const h = innerHeight
  const region = freeRegion()
  const elev = elevation()
  const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev))
  fitCam.aspect = w / h
  fitCam.fov = camera.fov
  fitCam.clearViewOffset()
  fitCam.updateProjectionMatrix()
  const pts = []
  for (const x of [-hw, hw]) for (const z of [-back, hd]) for (const y of [0, height]) pts.push(new THREE.Vector3(x, y, z))
  const allowW = (region.w / w) * 2
  const allowH = (region.h / h) * 2
  const p = new THREE.Vector3()
  const measure = (d) => {
    fitCam.position.copy(dir).multiplyScalar(d)
    fitCam.lookAt(0, 0, 0)
    fitCam.updateMatrixWorld()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const q of pts) {
      p.copy(q).project(fitCam)
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    return { minX, maxX, minY, maxY }
  }
  let lo = 2
  let hi = 80
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const b = measure(mid)
    if (b.maxX - b.minX > allowW || b.maxY - b.minY > allowH) lo = mid
    else hi = mid
  }
  const b = measure(hi)
  // Shift the view so the board sits in the middle of the free region.
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const tx = ((region.left + region.right) / 2 / w) * 2 - 1
  const ty = 1 - ((region.top + region.bottom) / 2 / h) * 2
  return {
    pos: fitCam.position.clone(),
    offset: new THREE.Vector2(((cx - tx) / 2) * w, (-(cy - ty) / 2) * h),
    dist: hi,
  }
}

function applyCamera(view, animate = true) {
  const from = { pos: game.cam.pos.clone(), offset: game.cam.offset.clone() }
  const set = (t) => {
    game.cam.pos.lerpVectors(from.pos, view.pos, t)
    game.cam.offset.lerpVectors(from.offset, view.offset, t)
  }
  scene.fog.near = view.dist * 1.4
  scene.fog.far = view.dist * 3.2
  tween(animate ? 0.9 : 0, (t) => set(ease.inOutCubic(t)), { tag: 'camera' })
  if (!animate) set(1)
}

function syncCamera() {
  const w = innerWidth
  const h = innerHeight
  camera.aspect = w / h
  camera.position.copy(game.cam.pos)
  camera.lookAt(0, 0, 0)
  camera.setViewOffset(w, h, game.cam.offset.x, game.cam.offset.y, w, h)
  camera.updateProjectionMatrix()
}

function relayout(animate = true) {
  if (game.state === 'menu') {
    const hw = (game.paradeAnimals.length * PARADE_GAP) / 2
    placeRoom(hw, 0.9)
    // Tall screens: the toys line up behind the parade, so frame them too. That keeps the
    // table filled from the title down to the Play button instead of leaving an empty band.
    const view = frame(hw, 0.6, 1.05, innerWidth / innerHeight < 0.8 ? 3.4 : 0.6)
    settleProps(view, hw + 0.45, 0.9 + 0.45)
    applyCamera(view, animate)
    return
  }
  if (!game.cards.length) return
  // Once the level is won the cards stay where the child found them; only the camera moves
  // (pulled back so the win card fits). Re-gridding would teleport the dancing animals.
  const grid = game.state === 'won' && game.layout?.grid ? game.layout.grid : chooseGrid(game.cards.length, freeRegion())
  const s = slots(game.cards.length, grid.cols, grid.rows)
  game.layout = { hw: s.hw, hd: s.hd, grid }
  placeRoom(s.hw, s.hd)
  // Perspective shrinks the back rows: their animals are made a little bigger to make up for it
  const boost = Math.min(0.28, 0.09 * (grid.rows - 1))
  game.cards.forEach((card, i) => {
    card.slot = s.list[i]
    if (game.state !== 'dealing' && game.state !== 'won') card.group.position.copy(card.slot)
    if (game.state !== 'won') card.critter.yaw = Math.atan2(-card.slot.x, 9) * 0.8
    // 1 on the back row, 0 on the front
    card.backness = s.hd > 0 ? (s.hd - card.slot.z) / (2 * s.hd) : 0
    // The camera looks down steeply (most of all in portrait, and on the front rows): face-up
    // animals lean back a little so their faces turn up to the child instead of showing their heads
    const steep = innerWidth / innerHeight < 0.8
    // In portrait the front rows are a little smaller, so they don't stand over the cards behind them
    const front = steep && grid.rows > 2 ? 1 - 0.14 * (1 - card.backness) : 1
    card.critter.size = ANIMAL_SIZE * (card.critter.small ?? 1) * (1 + boost * card.backness) * front
    card.critter.lean = -((steep ? 0.12 : 0.06) + (steep ? 0.22 : 0.12) * (1 - card.backness))
    if (card.parent) Object.assign(card.parent, { lean: card.critter.lean, yaw: card.critter.yaw })
  })
  // Include hats and back-row enlargement; use a smaller jump margin beside the win card.
  const hatHeight = game.cards.some((c) => c.special === 'hat') ? 0.5 * (1 + boost) : 0
  const partyJump = game.state === 'won' && !$('win').classList.contains('hidden') ? 0.25 : innerHeight <= 500 && innerWidth > innerHeight ? 0.8 : 1.1
  const view = frame(s.hw + 0.1, s.hd + 0.1, ANIMAL_H * (1 + boost) + hatHeight + partyJump)
  settleProps(view, s.hw + 0.45, s.hd + 0.45)
  applyCamera(view, animate)
}

// --- Screens and HUD -----------------------------------------------------------------------------

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('menu').classList.toggle('hidden', screen !== 'menu')
  $('hud').classList.toggle('hidden', screen !== 'play')
  $('win').classList.toggle('hidden', screen !== 'win')
}

/** The board ▶ starts: the one after the last win, else the first not yet finished. */
function nextLevel() {
  if (Number.isInteger(progress.next)) return Math.min(LEVELS.length - 1, Math.max(0, progress.next))
  const i = LEVELS.findIndex((_, k) => !progress.done[k])
  return i < 0 ? LEVELS.length - 1 : i
}

/** Each board is a picture of its cards: a 2×2 square of little cards, up to 5×4. A finished one has a paw. */
function renderLevels() {
  const next = nextLevel()
  $('levels').innerHTML = LEVELS.map((pairs, i) => {
    const [cols, rows] = LEVEL_PICTURES[i]
    const cards = '<i class="mini"></i>'.repeat(pairs * 2)
    const paw = progress.done[i] ? '<span class="paw">🐾</span>' : ''
    return `<button class="level ${i === next ? 'next' : ''}" data-level="${i}" aria-label="${pairs * 2} cards"><span class="grid" style="--cols:${cols};--rows:${rows}">${cards}</span>${paw}</button>`
  }).join('')
  // Only the menu's own buttons (the win card's ▶ is wired once, below)
  for (const el of $('levels').querySelectorAll('[data-level]')) {
    // Only a press that started on the menu counts (not a finger lifted from a hold on the screen before)
    let downAt = 0
    el.addEventListener('pointerdown', () => (downAt = performance.now()))
    el.addEventListener('click', (e) => {
      if (e.detail !== 0 && downAt < game.menuShownAt) return
      sound.tap()
      startLevel(Number(el.dataset.level))
    })
  }
}

/** One empty circle per pair at the top; a found pair's animal pops into its circle. */
function renderPairs(popped = null, golden = false) {
  const found = game.found
  if (popped && golden) game.goldFound = popped
  $('pairs').innerHTML = Array.from({ length: game.pairs }, (_, i) =>
    found[i] ? `<span class="done ${found[i] === popped ? 'pop' : ''} ${found[i] === game.goldFound ? 'gold' : ''}">${ANIMALS[found[i]].emoji}</span>` : '<span></span>',
  ).join('')
}

function updateMute() {
  for (const id of ['mute', 'menu-mute']) $(id).textContent = progress.muted ? '🔇' : '🔊'
}

// --- The drawn hand: shows a stuck child what to tap, only after a quiet while --------------------

const hand = $('hand')
let handTimer
hand.addEventListener('animationend', hideHand)
function showHand(x, y) {
  hand.style.left = `${x}px`
  hand.style.top = `${y}px`
  hand.classList.remove('hidden', 'tap')
  void hand.offsetWidth // restart the tap animation
  hand.classList.add('tap')
  game.hands++
  clearTimeout(handTimer)
  handTimer = setTimeout(hideHand, 2700)
}

function hideHand() {
  clearTimeout(handTimer)
  hand.classList.add('hidden')
  hand.classList.remove('tap')
}

/** Called every frame: after a quiet while, the hand taps once where a tap would start the fun. */
function maybeShowHand() {
  if (!hand.classList.contains('hidden')) return
  if (game.state === 'menu') {
    if (game.hands >= 2 || game.idle < (game.hands ? 20 : HAND_MENU)) return
    const r = $('play').getBoundingClientRect()
    showHand(r.left + r.width / 2, r.top + r.height * 0.55)
  } else if (game.state === 'play') {
    if (game.hands >= 2 || game.busy || game.mismatch || game.idle < (everFlipped ? HAND_LATER : HAND_FIRST)) return
    const down = game.cards.filter((c) => c.state === 'down')
    if (!down.length) return
    const p = down[(Math.random() * down.length) | 0].screenPoint()
    showHand(p.x, p.y)
  } else return
  game.idle = 0
}
/** Has this child ever turned a card over? Then the hand waits much longer (and only on a stall). */
let everFlipped = false

// --- Menu ---------------------------------------------------------------------------------------

function enterMenu() {
  if (game.found.length) game.friends = [...game.found]
  resetScene()
  applyTheme(MENU_LOOK) // the menu keeps its own colours
  game.state = 'menu'
  game.menuShownAt = performance.now()
  game.hands = 0
  game.idle = 0
  show('menu')
  renderLevels()
  const count = innerWidth / innerHeight < 0.8 ? 3 : 5
  // The animals just found follow the child back to the menu; the rest are a surprise
  const friends = shuffle([...game.friends]).slice(0, count)
  const names = [...friends, ...shuffle(NAMES.filter((n) => !friends.includes(n)))].slice(0, count)
  game.paradeAnimals = shuffle(names).map((name, i) => {
    const a = makeAnimal(name)
    const x = (i - (count - 1) / 2) * PARADE_GAP
    a.holder.position.set(x, MAT_TOP, 0)
    a.baseY = MAT_TOP
    a.yaw = Math.atan2(-x, 8) * 0.7
    a.size = 0.95
    a.pop = 0
    parade.add(a.holder)
    tween(0.5, (t) => (a.pop = ease.outBack(t)), { delay: 0.25 + i * 0.12 })
    wait(0.3 + i * 0.12).then(() => sound.pop())
    return a
  })
  relayout(true)
}

/** Empties the table: cards, menu animals, particles and every running tween. */
function resetScene() {
  game.round++ // anything still waiting for the old board checks this and gives up
  hideHand()
  clearTweens() // also strands any pending waits from the old board, so they never resume
  effects.clear()
  parade.clear()
  game.paradeAnimals = []
  board.clear()
  game.cards = []
  game.open = []
  game.mismatch = null
  game.busy = false
  game.queued = null
}

// --- Playing ------------------------------------------------------------------------------------

function startLevel(level) {
  resetScene()
  game.level = Math.min(Math.max(0, level), LEVELS.length - 1)
  game.pairs = LEVELS[game.level]
  game.matched = 0
  game.found = []
  game.goldFound = null
  game.turns = 0
  // Most boards have a peekaboo early enough to see before the last pair.
  game.peekabooAt = Math.random() < 0.8 ? 1 : Infinity
  game.hands = 0
  game.idle = 0
  game.state = 'dealing'
  show('play')
  const theme = (game.theme = THEMES[game.boards++ % THEMES.length])
  applyTheme(theme)
  // Home animals lead; distinct visitors fill large boards so every mismatch is fair.
  const home = shuffle([...theme.animals])
  const animals = [...home, ...shuffle(NAMES.filter((n) => !home.includes(n)))]
  const picks = animals.slice(0, game.pairs).map((animal) => ({ animal, variant: null }))
  shuffle(picks)
  const pool = ['baby', 'hat', 'sleepy', 'sneeze']
  let special
  if (game.lastSpecial !== 'gold' && (game.sinceGold >= GOLDEN_EVERY || Math.random() < GOLDEN_CHANCE)) special = 'gold'
  else special = shuffle(pool.filter((k) => k !== game.lastSpecial))[0]
  game.sinceGold = special === 'gold' ? 0 : game.sinceGold + 1
  game.lastSpecial = special
  // A second surprise is optional, and can be any other kind.
  const secondSpecial = game.pairs >= 4 && Math.random() < 0.6 ? shuffle(pool.filter((k) => k !== special))[0] : null
  const hatColour = PARTY_COLOURS[(Math.random() * PARTY_COLOURS.length) | 0]
  if (picks[0]) picks[0].variant = special
  if (picks[1] && secondSpecial) picks[1].variant = secondSpecial
  game.cards = shuffle(picks.flatMap((p, pairId) => [0, 1].map(() => {
    const card = new Card(p.animal, p.variant, hatColour)
    card.pairId = pairId
    return card
  })))
  for (const card of game.cards) board.add(card.group)
  renderPairs()
  relayout(true)
  // Deal: cards fly in from a stack near the bottom with a spin, one after another.
  const from = new THREE.Vector3(0, 2.2, game.layout.hd + 2.5)
  game.cards.forEach((card, i) => {
    card.group.position.copy(from)
    card.group.scale.setScalar(0.001)
    tween(0.5, (t) => {
      const e = ease.outCubic(t)
      card.group.position.lerpVectors(from, card.slot, e)
      card.group.position.y += Math.sin(t * Math.PI) * 1.2
      card.group.rotation.y = (1 - e) * Math.PI * 1.5
      card.group.scale.setScalar(Math.min(1, 0.3 + t * 1.4))
      if (t >= 1) {
        card.group.position.copy(card.slot)
        card.group.rotation.y = 0
        card.land()
        sound.tick()
      }
    }, { delay: 0.35 + i * 0.06 })
  })
  const round = game.round
  wait(0.35 + game.cards.length * 0.06 + 0.5).then(async () => {
    // Now and then the cards do a little shuffle-dance before play (all face down: nothing is given away)
    if (game.pairs >= 3 && Math.random() < 0.3) await shuffleDance()
    if (round === game.round) game.state = 'play'
  })
}

/** The face-down cards hop in a wave, then two pairs of them swap places in big arcs. */
async function shuffleDance() {
  const round = game.round
  const cards = game.cards
  cards.forEach((c, i) => {
    const delay = (c.slot.x + game.layout.hw) * 0.12
    tween(0.4, (t) => (c.group.position.y = c.slot.y + Math.sin(t * Math.PI) * 0.35), { delay })
    wait(delay).then(() => round === game.round && i % 3 === 0 && sound.tick())
  })
  await wait(0.5 + game.layout.hw * 0.24)
  if (round !== game.round) return
  const order = shuffle(cards.map((_, i) => i))
  const swaps = [[order[0], order[1]], [order[2], order[3]]]
  sound.boing()
  await Promise.all(swaps.map(([i, j]) => {
    const [a, b] = [cards[i], cards[j]]
    const [from, to] = [a.slot.clone(), b.slot.clone()]
    return tween(0.7, (t) => {
      const e = ease.inOutCubic(t)
      a.group.position.lerpVectors(from, to, e).setY(from.y + Math.sin(t * Math.PI) * 1.1)
      b.group.position.lerpVectors(to, from, e).setY(from.y + Math.sin(t * Math.PI) * 0.7)
      a.group.rotation.y = b.group.rotation.y = e * Math.PI * 2
      if (t >= 1) a.group.rotation.y = b.group.rotation.y = 0
    })
  }))
  if (round !== game.round) return
  for (const [i, j] of swaps) [cards[i], cards[j]] = [cards[j], cards[i]]
  for (const c of cards) c.land()
  sound.tick()
  relayout(false) // the cards keep their new places
}

async function tapCard(card) {
  if (game.state !== 'play') return
  if (card.state === 'matched' || card.state === 'open') {
    tapAnimal(card)
    return
  }
  if (card.state === 'closing') {
    // Still flipping back after a miss: little fingers are quick, so flip it again once it lands.
    if (card.wanted) return
    card.wanted = true
    await card.closing
    card.wanted = false
    return tapCard(card)
  }
  if (card.state === 'down' && game.busy) {
    // Quick fingers: the tap is felt now, and the card turns over as soon as the board is free
    card.wiggle()
    game.queued = card
    return
  }
  if (card.state !== 'down') return
  if (game.mismatch) closeMismatch(true)
  everFlipped = true
  const first = game.open[0]
  game.open.push(card)
  // The second card of a pair keeps quiet on the way up: the two animals call together when they meet.
  const match = !!first && first.pairId === card.pairId
  const revealing = card.flipUp({ call: !match })
  if (!first) {
    await revealing
    if (card.state === 'open') card.critter.excited = true
    return
  }
  const opened = [...game.open]
  game.busy = true
  game.turns++
  await Promise.all(opened.map((c) => c.revealed))
  game.busy = false
  game.open = []
  for (const c of opened) c.critter.excited = false
  if (match) onMatch(opened)
  else onMismatch(opened)
  const queued = game.queued
  game.queued = null
  if (queued?.state === 'down') tapCard(queued)
}

/**
 * A face-up animal loves attention: it hops and calls. Tap it three times quickly and it does
 * a big spinning jump.
 */
function tapAnimal(card) {
  const a = card.critter
  const now = game.time
  a.taps = now - (a.lastTap ?? -9) < 1.2 ? (a.taps ?? 0) + 1 : 1
  a.lastTap = now
  if (a.taps >= 3 && !a.busy) {
    a.taps = 0
    trick(a, card.golden)
    chatter(a)
    sound.boing()
    effects.sparkle(card.worldTop(), { count: 18, speed: 2, up: 2.4, size: 0.08 })
    return
  }
  cheer(a, card.worldTop())
}

// Small reusable shapes: each place reacts to a found pair, without adding a new task.
const placeRing = new THREE.TorusGeometry(0.32, 0.025, 6, 24)
const placePetal = new THREE.SphereGeometry(0.065, 6, 4)
const placeMaterials = Object.fromEntries(Object.entries({ flower: '#ff9ec4', starfish: '#b8efff', lantern: '#fff27a', pumpkin: '#e8742b' }).map(([k, color]) => [k, new THREE.MeshBasicMaterial({ color, toneMapped: false })]))
function placeSurprise(cards) {
  const kind = game.theme.prop
  const prop = room.props.find((p) => p.name === 'prop_theme')
  // Hay leaps like popcorn; the palm bows to the pair; the pumpkin rolls and settles.
  if (prop && !prop.userData.toy.busy && ['hay', 'palm', 'pumpkin'].includes(kind)) {
    prop.userData.toy.busy = true
    const y = prop.position.y
    const z = prop.rotation.z
    tween(1.3, (t) => {
      const wave = Math.sin(t * Math.PI * 3) * (1 - t)
      prop.position.y = y + (kind === 'hay' ? Math.abs(wave) * 0.65 : 0)
      prop.rotation.z = z + (kind === 'hay' ? wave * 0.2 : wave * 0.4)
      if (t >= 1) prop.userData.toy.busy = false
    })
  }
  for (const card of cards) {
    if (kind === 'snowman' && card.special !== 'baby') {
      // A little skating figure-eight, returning to this animal's own card.
      const x = card.critter.holder.position.x
      const z = card.critter.holder.position.z
      tween(1.7, (t) => {
        card.critter.holder.position.x = x + Math.sin(t * Math.PI * 2) * 0.3
        card.critter.holder.position.z = z + Math.sin(t * Math.PI * 4) * 0.12
      })
    }
    if (!placeMaterials[kind]) continue
    const pieces = new THREE.Group()
    card.group.add(pieces)
    const n = kind === 'starfish' ? 3 : 10
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(kind === 'starfish' ? placeRing : placePetal, placeMaterials[kind])
      if (kind === 'flower' || kind === 'pumpkin') m.scale.set(1, 0.4, 1.7)
      pieces.add(m)
    }
    tween(1.7, (t) => {
      pieces.children.forEach((m, i) => {
        const angle = i / n * Math.PI * 2 + t * Math.PI * 2
        const r = kind === 'lantern' ? 0.85 - Math.sin(t * Math.PI) * 0.5 : 0.3 + t * 0.6
        m.position.set(Math.cos(angle) * r, FACE_TOP + 0.25 + Math.sin(t * Math.PI) * 0.6, Math.sin(angle) * r)
        if (kind === 'starfish') m.rotation.x = -Math.PI / 2
        else m.rotation.z = angle
        const size = Math.min(1, t * 8, (1 - t) * 5)
        m.scale.set(size, size * (kind === 'flower' || kind === 'pumpkin' ? 0.4 : 1), size)
      })
      if (t >= 1) pieces.removeFromParent()
    })
  }
}

/** The two animals find each other: they turn to look, hop and call together, then dance. */
async function onMatch(cards) {
  const round = game.round
  for (const card of cards) card.state = 'matched'
  game.matched++
  game.found.push(cards[0].animal)
  const [a, b] = cards
  const yaws = cards.map((c) => c.critter.yaw)
  const face = (me, other) => {
    const dx = other.group.position.x - me.group.position.x
    const dz = other.group.position.z - me.group.position.z
    // Never right round to show their backs: a turn of at most ~46°
    return THREE.MathUtils.clamp(Math.atan2(dx, Math.max(dz, Math.abs(dx) * 0.35)), -0.8, 0.8)
  }
  await Promise.all([turnTo(a.critter, face(a, b)), turnTo(b.critter, face(b, a))])
  if (round !== game.round) return
  sound.match()
  chatter(a.critter)
  b.critter.chat = 0
  tween((VOICE_LENGTH[b.animal] ?? 0.5) + 0.15, (t) => (b.critter.chat = a.critter.chat))
  for (const card of cards) {
    hopOnce(card.critter, 0.42)
    card.showRing()
    effects.sparkle(card.worldTop(), { count: 14, speed: 1.6, up: 1.8, colors: a.golden ? GOLD : HEARTS })
  }
  placeSurprise(cards)
  renderPairs(cards[0].animal, a.golden)
  await wait(0.6)
  if (round !== game.round) return
  // Then each does its own trick (a golden pair a flip first, in a shower of gold)
  if (a.golden) {
    sound.chime()
    for (const card of cards) effects.sparkle(card.worldTop(), { count: 40, speed: 2.6, up: 3, size: 0.1, colors: GOLD })
  }
  await Promise.all(cards.map((card, i) => turnTo(card.critter, yaws[i], 0.25)))
  if (round !== game.round) return
  for (const card of cards) trick(card.critter, card.golden)
  // Found babies: their mum or dad pops up behind them for a cuddle
  if (a.special === 'baby') for (const card of cards) card.callParent()
  if (game.matched === game.pairs) wait(a.golden ? 2.2 : 1.3).then(() => round === game.round && winLevel())
}
const _origin = new THREE.Vector3()
const HEARTS = ['#ff5d8f', '#ff8fb1', '#ffd23f', '#ffffff']
const GOLD = ['#ffd23f', '#ffe98a', '#ffb300', '#ffffff']

function onMismatch(cards) {
  sound.miss()
  for (const card of cards) {
    const c = card.critter
    // A puzzled little head shake: "not me!"
    tween(0.7, (t) => {
      c.shake = Math.sin(t * Math.PI * 4) * 0.45 * (1 - t)
      c.tilt = Math.sin(t * Math.PI) * 0.15
      if (t >= 1) c.shake = c.tilt = 0
    })
  }
  game.mismatch = { cards }
  // Long enough to see both animals; a tap on another card closes them at once.
  const round = game.round
  wait(1.3).then(() => {
    if (round === game.round && game.mismatch?.cards === cards) closeMismatch(false)
  })
}

function closeMismatch(fast) {
  const { cards } = game.mismatch
  game.mismatch = null
  for (const card of cards) {
    card.critter.shake = card.critter.tilt = 0
    card.close(fast)
  }
}

/**
 * The finale: a little tune and confetti, one of the parties (see FINALES), then everyone jumps
 * together under a shower of confetti.
 */
/** Moves an animal standing on its card to a point on the table (world x, z). */
function standAt(card, x, z) {
  card.critter.holder.position.x = x - card.group.position.x
  card.critter.holder.position.z = z - card.group.position.z
}

/** Each party returns when everyone jumps together (seconds from its start). */
const FINALES = [
  // Roll call: each pair hops and calls in turn; then a wave of hops runs left to right, column by
  // column, each a note higher up the scale
  (order, later) => {
    const gap = Math.min(WIN_CALL_GAP, 3.2 / order.length) // a big board's roll call stays quick
    order.forEach((animal, i) => {
      later(0.7 + i * gap, () => {
        const pair = game.cards.filter((c) => c.animal === animal)
        chatter(pair[0].critter)
        for (const c of pair) {
          hopOnce(c.critter, 0.45)
          effects.sparkle(c.worldTop(), { count: 8, speed: 1.2, up: 1.6, size: 0.06 })
        }
      })
    })
    const wave = 0.9 + order.length * gap
    const columns = [...new Set(game.cards.map((c) => Math.round(c.slot.x * 10)))].sort((x, y) => x - y)
    columns.forEach((x, i) => {
      later(wave + i * 0.2, () => {
        sound.note(i)
        for (const c of game.cards) if (Math.round(c.slot.x * 10) === x) hopOnce(c.critter, 0.5)
      })
    })
    return wave + columns.length * 0.2 + 0.35
  },
  // A conga: everyone hops off their card into a line that dances once round the mat, to a drum
  (order, later) => {
    const { hw, hd } = game.layout
    const rx = Math.max(0.35, hw - 0.45)
    const rz = Math.max(0.3, hd - 0.45)
    // Round the edge of the mat: a rounded rectangle (u from 0 to 1 goes once round)
    const path = (u) => {
      const ang = u * Math.PI * 2 + Math.PI / 2 // starting at the front middle
      const c = Math.cos(ang)
      const sn = Math.sin(ang)
      return [rx * Math.sign(c) * Math.abs(c) ** 0.5, rz * Math.sign(sn) * Math.abs(sn) ** 0.5]
    }
    const line = [...game.cards].sort((a, b) => b.golden - a.golden || order.indexOf(a.animal) - order.indexOf(b.animal))
    const spacing = Math.min(1 / line.length, 0.11)
    const GO = 0.6
    const MARCH = 4.5
    const STOP = 0.45
    const BACK = 0.6
    if (line[0].golden) sound.chime()
    line.forEach((card, i) => {
      const a = card.critter
      const home = card.group.position.clone().add(a.holder.position)
      const yaw0 = a.yaw
      const u0 = -i * spacing
      a.busy = true
      tween(GO + MARCH + BACK, (t) => {
        const T = t * (GO + MARCH + BACK)
        if (T < GO) {
          const e = ease.inOutCubic(T / GO)
          const [x, z] = path(u0)
          standAt(card, home.x + (x - home.x) * e, home.z + (z - home.z) * e)
          a.hop = Math.sin((T / GO) * Math.PI) * 0.5
        } else if (T < GO + MARCH) {
          // Dance a stretch, stop, turn to the child and hop (cha!), three times round
          const m = T - GO
          const leg = Math.min(2, Math.floor(m / (MARCH / 3)))
          const inLeg = m - leg * (MARCH / 3)
          const moving = inLeg < MARCH / 3 - STOP
          const u = u0 + (leg + Math.min(1, inLeg / (MARCH / 3 - STOP))) / 3
          const [x, z] = path(u)
          const [nx, nz] = path(u + 0.01)
          standAt(card, x, z)
          if (moving) {
            // Facing the way they go, but never further round than three-quarters, so faces stay in view
            const dir = Math.atan2(nx - x, nz - z)
            a.yaw = Math.abs(dir) > 1.1 ? Math.sign(nx - x || 1) * 1.1 : dir
            a.hop = Math.abs(Math.sin(m * Math.PI * 2.9)) * 0.16
            a.rock = Math.sin(m * Math.PI * 2.9) * 0.18
          } else {
            const k = (inLeg - (MARCH / 3 - STOP)) / STOP
            a.yaw *= 0.75 // turning to the child
            a.hop = Math.sin(k * Math.PI) * 0.45
            a.rock = 0
          }
          if (card.golden && Math.random() < 0.15) effects.sparkle(card.worldTop(), { count: 1, speed: 0.4, up: 0.8, size: 0.05, colors: GOLD })
        } else {
          const e = ease.inOutCubic((T - GO - MARCH) / BACK)
          const [x, z] = path(u0 + 1)
          standAt(card, x + (home.x - x) * e, z + (home.z - z) * e)
          a.yaw = yaw0
          a.rock = 0
          a.hop = Math.sin(e * Math.PI) * 0.5
        }
        if (t >= 1) {
          standAt(card, home.x, home.z)
          Object.assign(a, { hop: 0, rock: 0, yaw: yaw0, busy: false })
        }
      }, { delay: 0.6 })
    })
    for (let k = 0; k < 12; k++) later(0.6 + GO + k * (MARCH / 12), () => sound.drum(k % 4 === 3))
    order.forEach((animal, i) => later(1.4 + i * Math.min(0.5, 3.6 / order.length), () => chatter(game.cards.find((c) => c.animal === animal).critter)))
    return 0.6 + GO + MARCH + BACK + 0.2
  },
  // A ring dance: everyone hops into a circle in the middle and dances round, a note at each step
  (order, later) => {
    const { hw, hd } = game.layout
    const cards = game.cards
    // A wide ring: an oval nearly as big as the board, everyone spread out evenly
    const rx = Math.max(0.35, hw - 0.45)
    const rz = Math.max(0.3, hd - 0.45)
    const GO = 0.7
    const SPIN = 3.6
    const BACK = 0.7
    cards.forEach((card, i) => {
      const a = card.critter
      const home = card.group.position.clone().add(a.holder.position)
      const yaw0 = a.yaw
      const th = (i / cards.length) * Math.PI * 2
      const at = (T) => {
        const ang = th + (T / SPIN) * Math.PI * 1.6
        return [Math.sin(ang) * rx, Math.cos(ang) * rz, ang]
      }
      a.busy = true
      tween(GO + SPIN + BACK, (t) => {
        const T = t * (GO + SPIN + BACK)
        if (T < GO) {
          const e = ease.inOutCubic(T / GO)
          const [x, z] = at(0)
          standAt(card, home.x + (x - home.x) * e, home.z + (z - home.z) * e)
          a.hop = Math.sin((T / GO) * Math.PI) * 0.5
        } else if (T < GO + SPIN) {
          const [x, z] = at(T - GO)
          standAt(card, x, z)
          a.yaw = Math.sin((T - GO) * Math.PI * 1.2 + i) * 0.5 // facing the child, swaying
          a.hop = Math.abs(Math.sin((T - GO) * Math.PI * 2.5 + i)) * 0.22
        } else {
          const e = ease.inOutCubic((T - GO - SPIN) / BACK)
          const [x, z] = at(SPIN)
          standAt(card, x + (home.x - x) * e, z + (home.z - z) * e)
          a.yaw = yaw0
          a.hop = Math.sin(e * Math.PI) * 0.5
        }
        if (t >= 1) {
          standAt(card, home.x, home.z)
          Object.assign(a, { hop: 0, yaw: yaw0, busy: false })
        }
      }, { delay: 0.6 })
    })
    for (let k = 0; k < 9; k++) later(0.6 + GO + k * (SPIN / 9), () => sound.note(k))
    order.forEach((animal, i) => later(1.5 + i * Math.min(0.45, 3.2 / order.length), () => chatter(game.cards.find((c) => c.animal === animal).critter)))
    return 0.6 + GO + SPIN + BACK + 0.2
  },
  // A fountain of hops: two waves blossom out from the middle, then settle.
  (order, later) => {
    const cards = [...game.cards].sort((a, b) => a.slot.lengthSq() - b.slot.lengthSq())
    for (let wave = 0; wave < 2; wave++) cards.forEach((c, i) => {
      later(0.6 + wave * 1.5 + i * 0.065, () => {
        hopOnce(c.critter, 0.55 + wave * 0.15)
        if (i % 2 === 0) sound.note(i % 8)
      })
    })
    return 3.8
  },
  // A domino giggle: a playful lean runs across the twins and bounces back.
  (order, later) => {
    const cards = [...game.cards].sort((a, b) => a.slot.x - b.slot.x || a.slot.z - b.slot.z)
    for (let wave = 0; wave < 2; wave++) (wave ? [...cards].reverse() : cards).forEach((c, i) => {
      later(0.6 + wave * 1.6 + i * 0.07, () => {
        sound.note(i % 8)
        const a = c.critter
        a.busy = true
        tween(0.65, (t) => {
          a.rock = Math.sin(t * Math.PI * 2) * 0.3
          a.hop = Math.sin(t * Math.PI) * 0.25
          if (t >= 1) Object.assign(a, { rock: 0, hop: 0, busy: false })
        })
      })
    })
    return 4
  },
]

function winLevel() {
  game.state = 'won'
  game.friends = [...game.found]
  progress.done[game.level] = 1
  // Usually climb, with small breathers; the biggest board always returns to 2–4 pairs.
  const last = LEVELS.length - 1
  const next = game.level === last ? shuffle([0, 1, 2])[0]
    : game.level >= 2 && Math.random() < 0.3 ? shuffle([0, 1].filter((n) => n !== game.level))[0]
      : game.level + 1
  progress.next = next
  save()
  const round = game.round
  const later = (s, fn) => wait(s).then(() => round === game.round && fn())
  sound.fanfare()
  const { hw, hd } = game.layout
  effects.rain(new THREE.Vector3(0, 0, 0), hw + 0.6, hd + 0.6, 40)
  const byPlace = [...game.cards].sort((a, b) => a.slot.z - b.slot.z || a.slot.x - b.slot.x)
  const order = [...new Set(byPlace.map((c) => c.animal))]
  // Choose a fresh party, including the hop fountain and domino giggle.
  game.finale = shuffle(FINALES.map((_, i) => i).filter((i) => i !== game.finale))[0]
  const together = FINALES[game.finale](order, later)
  // Everyone together: one big spinning jump, and confetti
  later(together, () => {
    sound.boing()
    for (const c of game.cards) dance(c.critter, { dur: 1.1, hops: 1, height: 1.0 })
    effects.rain(new THREE.Vector3(0, 0, 0), hw + 0.8, hd + 0.8, 120)
    later(1.15, () => {
      for (const c of game.cards) {
        c.critter.holder.position.x = c.special === 'baby' ? -0.12 : 0
        c.critter.holder.position.z = 0.1
        Object.assign(c.critter, { roll: 0, rock: 0, tilt: 0, spin: 0, hop: 0, squash: 0, busy: false })
      }
      for (const c of game.cards) effects.puff(c.group.position.clone().setY(MAT_TOP), { count: 6, radius: 0.4, size: 0.06 })
    })
  })

  // The buttons come once the party has had the stage (the animals can still be tapped meanwhile)
  // Wait for the actual dance, homecoming and final landing before showing controls.
  later(together + 1.25, () => {
    game.nextBoard = next
    // The animals found, popping in one by one; tap one to hear it again.
    const pairs = [...new Map(byPlace.map((c) => [c.pairId, c])).values()]
    $('win-stars').replaceChildren(...pairs.map((card, i) => {
      const animal = card.animal
      const el = document.createElement('button')
      el.className = `found ${animal === game.goldFound ? 'gold' : ''}`
      el.textContent = ANIMALS[animal].emoji
      el.setAttribute('aria-label', animal)
      el.style.animationDelay = `${(0.15 + i * 0.09).toFixed(2)}s`
      el.addEventListener('click', () => {
        const pair = game.cards.filter((c) => c.pairId === card.pairId)
        chatter(pair[0].critter)
        for (const c of pair) hopOnce(c.critter, 0.4)
        el.classList.remove('bump')
        void el.offsetWidth
        el.classList.add('bump')
      })
      return el
    }))
    // Six and up, and all narrow screens: balanced rows instead of a stranded emoji.
    $('win-stars').classList.toggle('rows', order.length >= 6 || innerWidth <= 420)
    $('win-stars').style.setProperty('--cols', Math.ceil(order.length / 2))
    show('win')
    game.winShownAt = performance.now()
    relayout(true) // the camera pulls back so the animals stay in view above the card
  })
}
// --- Input ------------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function pick(e, objects) {
  return pickAll(e, objects)[0]
}

function pickAll(e, objects) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObjects(objects, true)
}

const cardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -REST_Y)
const _onPlane = new THREE.Vector3()
/**
 * The card under a tap. A face-down card wins over an animal standing in front of it (a bunny's
 * ears would otherwise steal the tap), and a tap just outside a card, in the gap, still counts.
 */
function pickCard(e) {
  let first = null
  for (const hit of pickAll(e, board.children)) {
    const card = tagged(hit.object, 'card')
    if (!card) continue
    first ??= card
    if (card.state === 'down' && !tagged(hit.object, 'animal')) return card
  }
  if (first) return first
  if (!raycaster.ray.intersectPlane(cardPlane, _onPlane)) return null
  let best = null
  let bestD = Infinity
  for (const card of game.cards) {
    const dx = Math.abs(_onPlane.x - card.group.position.x) - CARD_W / 2
    const dz = Math.abs(_onPlane.z - card.group.position.z) - CARD_D / 2
    const d = Math.max(dx, dz)
    if (d < 0.2 && d < bestD) [best, bestD] = [card, d]
  }
  return best
}

/** Toys around the mat react when tapped, each in its own way. */
function tapToy(e) {
  const hit = pick(e, room.props.filter((p) => p.visible))
  const toy = hit && tagged(hit.object, 'toy')
  if (!toy || toy.busy) return !!toy
  toy.busy = true
  const { prop, name } = toy
  const top = prop.position.clone().setY(toy.size.y + 0.15)
  sound.toy(name)
  effects.sparkle(top, { count: 12, speed: 1.6, up: 1.8, size: 0.07 })
  const done = () => {
    prop.position.y = 0
    prop.rotation.x = prop.rotation.z = 0
    if (name !== 'prop_theme') prop.scale.setScalar(1) // a place's toy keeps the size it was given to fit
    toy.busy = false
  }
  const yaw = prop.rotation.y
  const anims = {
    // A place's own toy: a happy wobble and a little hop
    prop_theme: [0.9, (t) => {
      prop.position.y = Math.sin(t * Math.PI) * 0.25
      prop.rotation.z = Math.sin(t * Math.PI * 4) * 0.18 * (1 - t)
      prop.rotation.y = yaw + Math.sin(t * Math.PI * 2) * 0.3
    }],
    // Bounces high, three times, a little lower each time.
    prop_ball: [1.3, (t) => {
      const k = Math.min(2, Math.floor(t * 3))
      const ph = t * 3 - k
      prop.position.y = Math.sin(ph * Math.PI) * 0.9 * 0.5 ** k
      prop.rotation.y = yaw + t * Math.PI * 3
      const squash = ph < 0.1 ? (0.1 - ph) * 2.5 : 0
      prop.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
    }],
    // A happy hop with a full twirl.
    prop_bear: [0.9, (t) => {
      prop.position.y = Math.sin(t * Math.PI) * 0.45
      prop.rotation.y = yaw + ease.inOutCubic(t) * Math.PI * 2
      prop.rotation.z = Math.sin(t * Math.PI * 4) * 0.15 * (1 - t)
    }],
    // Wobbles like a jelly on its base.
    prop_rings: [1.0, (t) => {
      prop.rotation.z = Math.sin(t * Math.PI * 6) * 0.22 * (1 - t)
      prop.rotation.x = Math.sin(t * Math.PI * 6 + 1.3) * 0.12 * (1 - t)
      const s = 1 + Math.sin(t * Math.PI * 4) * 0.08 * (1 - t)
      prop.scale.set(1 / s, s, 1 / s)
    }],
    // Jump up and clack back down.
    prop_blocks: [0.7, (t) => {
      prop.position.y = Math.sin(t * Math.PI) * 0.4
      prop.rotation.z = Math.sin(t * Math.PI * 2) * 0.12
      prop.rotation.y = yaw + Math.sin(t * Math.PI) * 0.3
    }],
    // A jiggle, like someone is about to draw.
    prop_crayons: [0.8, (t) => {
      prop.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.12 * (1 - t)
      prop.rotation.y = yaw + Math.sin(t * Math.PI * 4) * 0.25 * (1 - t)
    }],
  }
  const [dur, step] = anims[name]
  tween(dur, (t) => {
    step(t)
    if (t >= 1) {
      done()
      prop.rotation.y = yaw
    }
  })
  return true
}

addEventListener('pointerdown', () => {
  sound.unlock()
  game.idle = 0
  hideHand()
}, { capture: true })
canvas.addEventListener('pointerdown', (e) => {
  if (game.state === 'menu') {
    const hit = pick(e, parade.children)
    const a = hit && tagged(hit.object, 'animal')
    if (a) {
      if (!a.busy) {
        dance(a, { dur: 0.9, hops: 2, height: 0.4 })
        chatter(a)
        effects.sparkle(a.holder.position.clone().setY(1.0), { count: 14 })
      }
      return
    }
    tapToy(e)
    return
  }
  if (game.state === 'loading') return
  if (game.state === 'won') {
    // The party goes on under the win card: tapped animals hop and say hello.
    const card = pickCard(e)
    if (card) tapAnimal(card)
    else tapToy(e)
    return
  }
  const card = game.state === 'play' && pickCard(e)
  if (card) tapCard(card)
  else tapToy(e)
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return
  let hovered = null
  if (game.state === 'play') hovered = pickCard(e)
  if (!hovered && game.state !== 'loading') hovered = pick(e, [...parade.children, ...room.props.filter((p) => p.visible)]) ? true : null
  for (const card of game.cards) card.hoverTarget = card === hovered && card.state === 'down' ? 1 : 0
  canvas.style.cursor = hovered ? 'pointer' : ''
})

/** Walks up from a picked mesh to the first parent tagged with userData[key] ('card' or 'animal'). */
function tagged(obj, key) {
  for (let o = obj; o; o = o.parent) if (o.userData[key]) return o.userData[key]
  return null
}

{
  // ▶ too counts only a press that started on the menu
  let downAt = 0
  $('play').addEventListener('pointerdown', () => (downAt = performance.now()))
  $('play').addEventListener('click', (e) => {
    if (e.detail !== 0 && downAt < game.menuShownAt) return
    sound.tap()
    startLevel(nextLevel())
  })
}
/**
 * 🏠 and 🔊 during play are pressed and held (a ring fills round the button), so a stray tap or a
 * mash never ends a board or silences the game. A keyboard press acts at once.
 */
const HOLD = 0.7
/**
 * Every finger on the screen, anywhere: a hold only starts when it is the only one, so a resting
 * hand (one finger on 🏠, two on the board) never exits or mutes.
 */
const fingers = new Set()
/** After a hold acts, the lifting finger's click (on whatever is under it now) is dropped once. */
function swallowNextClick(pointerId) {
  let released = false
  let timer
  const stop = () => {
    removeEventListener('click', drop, true)
    removeEventListener('pointerup', lift, true)
    removeEventListener('pointercancel', lift, true)
    clearTimeout(timer)
  }
  const drop = (e) => {
    if (e.pointerId !== pointerId) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (released) stop()
  }
  const lift = (e) => {
    if (e.pointerId !== pointerId) return
    released = true
    // A compatibility click follows pointerup in this event turn. No deadline while held.
    timer = setTimeout(stop, 0)
  }
  addEventListener('click', drop, true)
  addEventListener('pointerup', lift, true)
  addEventListener('pointercancel', lift, true)
}
const holds = new Set() // the cancel functions of holds that are running
document.addEventListener('pointerdown', (e) => {
  fingers.add(e.pointerId)
  for (const cancel of [...holds]) cancel(e.pointerId)
}, true)
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, (e) => fingers.delete(e.pointerId), true)

/**
 * quick(): when true, a plain tap acts at once (🔊 unmutes with a tap; only muting needs the hold).
 * One finger only: any other finger landing anywhere cancels the hold, no new hold starts until
 * every finger has lifted, and only the finger that started a hold can end it.
 */
function holdButton(btn, action, quick = () => false) {
  let start = 0
  let frame = 0
  let finger = null
  const end = () => {
    cancelAnimationFrame(frame)
    frame = 0
    start = 0
    finger = null
    holds.delete(cancel)
    btn.style.setProperty('--hold', 0)
    btn.classList.remove('holding')
  }
  const cancel = (id) => id !== finger && end()
  const step = () => {
    frame = 0
    if (!start) return // cancelled
    const k = Math.min(1, (performance.now() - start) / (HOLD * 1000))
    btn.style.setProperty('--hold', k)
    if (k < 1) frame = requestAnimationFrame(step)
    else {
      const completedFinger = finger
      end()
      swallowNextClick(completedFinger) // the finger is still down: its lift must not click what replaces this button
      sound.tap()
      action()
    }
  }
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (fingers.size > 1) return end() // other fingers are down somewhere: no hold
    if (quick()) {
      sound.unlock()
      action()
      sound.tap()
      return
    }
    end() // nothing left over from before
    finger = e.pointerId
    btn.setPointerCapture?.(e.pointerId)
    start = performance.now()
    btn.classList.add('holding')
    sound.tick()
    holds.add(cancel)
    frame = requestAnimationFrame(step)
  })
  const lift = (e) => {
    if (e.pointerId === finger) end()
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, lift)
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) action() // keyboard
  })
}
holdButton($('home'), enterMenu)
/**
 * The win card's buttons wake up a moment after it appears (ARM), and a finger already down by
 * then does not count: a child still tapping animals at the party never skips or leaves by
 * accident. Its 🏠, like the one in play, is held.
 */
const ARM = 600
function armedButton(id, fn) {
  const btn = $(id)
  let downAt = 0
  btn.addEventListener('pointerdown', () => (downAt = performance.now()))
  btn.addEventListener('click', (e) => {
    const armed = performance.now() - game.winShownAt >= ARM && (e.detail === 0 || downAt >= game.winShownAt + ARM)
    if (!armed || game.state !== 'won') return
    sound.tap()
    fn()
  })
}
armedButton('again', () => startLevel(game.level))
armedButton('next', () => startLevel(game.nextBoard ?? game.level + 1))
holdButton($('win-home'), () => performance.now() - game.winShownAt >= ARM && game.state === 'won' && enterMenu())
function toggleMute() {
  progress.muted = !progress.muted
  sound.setMuted(progress.muted)
  updateMute()
}
// Muting takes a hold (so mashing never silences the game); a tap brings the sound back
for (const id of ['mute', 'menu-mute']) holdButton($(id), toggleMute, () => progress.muted)
addEventListener('keydown', (e) => {
  // Enter starts from the menu; no key ends a board (🏠 is held for that)
  if (e.key === 'Enter' && game.state === 'menu') startLevel(nextLevel())
})
// Block pinch zoom and double-tap zoom on iOS.
for (const type of ['gesturestart', 'dblclick']) document.addEventListener(type, (e) => e.preventDefault())

let resizeTimer = 0
function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  hideHand()
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => game.state !== 'loading' && relayout(false), 60)
}
addEventListener('resize', resize)

// --- Main loop ----------------------------------------------------------------------------------

const timer = new THREE.Timer()
function frameLoop() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  game.time += dt
  game.idle += dt
  updateTweens(dt)
  for (const card of game.cards) card.update(dt, game.time)
  for (const a of game.paradeAnimals) {
    poseAnimal(a, game.time)
    if (!a.busy && Math.random() < dt * 0.1) hopOnce(a, 0.2)
  }
  if (game.state === 'play' || game.state === 'won') {
    // Found animals stay lively: a little hop now and then.
    const rate = game.state === 'won' ? 0.1 : 0.05
    for (const card of game.cards) {
      if (card.state === 'matched' && !card.critter.busy && Math.random() < dt * rate) hopOnce(card.critter, 0.2)
      // A golden pair glitters now and then
      if (card.golden && card.state === 'matched' && Math.random() < dt * 0.6) effects.sparkle(card.worldTop(), { count: 2, speed: 0.6, up: 1, size: 0.05, colors: GOLD })
    }
  }
  // At night the lantern glows warm on the table round it
  if (halo.visible) {
    halo.getWorldPosition(lanternLight.position)
    lanternLight.intensity = themeProps.lantern?.visible && themeProps.lantern.parent ? 2.2 + Math.sin(game.time * 2.1) * 0.25 : 0
  }
  // A place's weather: snow drifting down, bubbles wobbling up
  if (game.theme?.weather && game.layout && game.state !== 'menu' && Math.random() < dt * 5) {
    effects.weather(game.theme.weather, _origin, game.layout.hw + 0.5, game.layout.hd + 0.5)
  }
  // Peekaboo (some boards, once, a few turns in): a hidden animal peeps out and waves
  if (game.state === 'play' && game.turns >= game.peekabooAt && !game.open.length && !game.busy && !game.mismatch && Math.random() < dt * 0.5) {
    game.peekabooAt = Infinity
    const down = game.cards.filter((c) => c.state === 'down')
    down[(Math.random() * down.length) | 0]?.peekaboo()
  }
  // Now and then a face-down card lifts a corner, as if someone underneath were peeking out
  if (game.state === 'play' && !game.open.length && !game.busy && Math.random() < dt * 0.12) {
    const down = game.cards.filter((c) => c.state === 'down')
    down[(Math.random() * down.length) | 0]?.peekCorner()
  }
  maybeShowHand()
  effects.update(dt, camera)
  syncCamera()
  renderer.render(scene, camera)
}

async function main() {
  updateMute()
  resize()
  try {
    await loadAssets()
  } catch (err) {
    console.error(err)
    $('loading').classList.add('failed')
    return
  }
  buildRoom()
  syncCamera()
  renderer.setAnimationLoop(frameLoop)
  // Start high above the table and swoop down to the menu.
  game.cam.pos.set(0, 16, 10)
  enterMenu()
}

main()
$('reload').addEventListener('click', () => location.reload())
if (new URLSearchParams(location.search).has('debug')) window.__memory = { game, camera, propVisible: () => !!room.props.find((p) => p.name === 'prop_theme')?.visible }
