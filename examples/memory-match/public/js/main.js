import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Sound } from './audio.js'
import { Effects } from './effects.js'
import { tween, wait, clearTweens, updateTweens, ease } from './tween.js'

// --- Game data ------------------------------------------------------------------------

/** Every animal in models/animals.glb, with the colour of its card spot. */
const ANIMALS = {
  dog: { emoji: '🐶', color: '#ffbf7a' },
  cat: { emoji: '🐱', color: '#ffe08a' },
  frog: { emoji: '🐸', color: '#a8ec7a' },
  lion: { emoji: '🦁', color: '#ffcf5c' },
  panda: { emoji: '🐼', color: '#cfe0ee' },
  pig: { emoji: '🐷', color: '#ffb0d0' },
  bunny: { emoji: '🐰', color: '#d4c6ff' },
  chick: { emoji: '🐥', color: '#fff38f' },
  elephant: { emoji: '🐘', color: '#a8dcff' },
  fox: { emoji: '🦊', color: '#ffad85' },
  penguin: { emoji: '🐧', color: '#8fd3ff' },
  cow: { emoji: '🐮', color: '#bff2cf' },
}
const NAMES = Object.keys(ANIMALS)
/** Pairs per level: gentle for 3-year-olds, a real puzzle by the end. */
const LEVELS = [2, 3, 4, 6, 8, 10]
const PRAISE = ['Yay!', 'Match!', 'Super!', 'Great!', 'Hooray!', 'Wow!', 'Yes!']

const CARD_W = 1.0
const CARD_D = 1.3
const GAP_X = 0.24
const GAP_Z = 0.3
const MAT_TOP = 0.03
const REST_Y = MAT_TOP + 0.05 // card centre when lying on the mat
const FACE_TOP = 0.05 // top of the face-up spot above the card centre
const ANIMAL_SIZE = 0.8
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

// --- Saved progress (best stars per level) ------------------------------------------

const SAVE_KEY = 'memory-match:v2'
const progress = { stars: {}, best: {}, muted: false }
try {
  Object.assign(progress, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {})
} catch {}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress))
  } catch {}
}

// --- Scene ---------------------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
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

scene.add(new THREE.HemisphereLight('#fff8ec', '#d9a874', 1.5))
const sun = new THREE.DirectionalLight('#fff3dc', 2.3)
sun.position.set(-3.5, 10, 5)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.02
sun.shadow.radius = 3
scene.add(sun, sun.target)

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120)
const fitCam = camera.clone()
const sound = new Sound()
sound.setMuted(progress.muted)
const effects = new Effects(scene)

const assets = { animals: {}, card: null, setting: {} }
const room = { mat: null, props: [] }
const board = new THREE.Group()
const parade = new THREE.Group()
scene.add(board, parade)

const game = {
  state: 'loading', // loading | menu | dealing | play | won
  level: 0,
  cards: [],
  open: [],
  matched: 0,
  turns: 0,
  busy: false,
  mismatch: null,
  layout: null,
  paradeAnimals: [],
  time: 0,
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
    $('loading-text').textContent = `Waking up the animals… ${Math.min(99, pct)}%`
  }
  await Promise.all(
    files.map(async (name) => {
      loaded[name] = await loader.loadAsync(`./models/${name}.glb`, (e) => {
        bytes[name] = e.loaded
        report()
      })
    }),
  )
  for (const name of NAMES) {
    const root = loaded.animals.scene.getObjectByName(`animal_${name}`)
    root.position.set(0, 0, 0)
    for (const part of [...root.children]) bake(part)
    assets.animals[name] = root
  }
  assets.card = loaded.card.scene.getObjectByName('card')
  for (const part of [...assets.card.children]) bake(part, ['card_spot'])
  assets.card.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  for (const child of [...loaded.setting.scene.children]) assets.setting[child.name] = child
}

function buildRoom() {
  const { table, mat } = assets.setting
  table.traverse((o) => (o.receiveShadow = true))
  mat.traverse((o) => (o.receiveShadow = true))
  scene.add(table, mat)
  room.mat = mat
  for (const name of ['prop_blocks', 'prop_ball', 'prop_rings', 'prop_crayons', 'prop_bear']) {
    const prop = assets.setting[name]
    if (!prop) continue
    prop.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true
    })
    scene.add(prop)
    room.props.push(prop)
  }
}

/** Stretches the play mat around the area and sets the toys just outside it. */
function placeRoom(hw, hd) {
  const w = hw + 0.45
  const d = hd + 0.45
  room.mat.scale.set((w * 2) / 6, 1, (d * 2) / 6)
  const at = {
    prop_blocks: [-w - 0.75, d - 0.1, 0.5],
    prop_ball: [w + 0.75, d - 0.2, 0],
    prop_rings: [w + 0.7, -d + 0.3, 0],
    prop_crayons: [-w - 0.8, -d + 0.4, 0.3],
    prop_bear: [-w - 0.8, 0.2, 0.5],
  }
  for (const prop of room.props) {
    const [x, z, yaw] = at[prop.name]
    prop.position.set(x, 0, z)
    prop.rotation.y = yaw
  }
  const span = Math.max(w, d) + 2.5
  const cam = sun.shadow.camera
  cam.left = cam.bottom = -span
  cam.right = cam.top = span
  cam.near = 1
  cam.far = 40
  cam.updateProjectionMatrix()
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
    busy: false,
  }
  holder.userData.animal = a // lets a tap find its animal (see tagged())
  return a
}

function poseAnimal(a, time) {
  const t = time + a.phase
  const bounce = a.excited ? Math.abs(Math.sin(t * 6.5)) * 0.07 : 0
  a.holder.position.y = a.baseY + a.hop + bounce
  a.holder.rotation.y = a.yaw + a.spin
  const s = a.pop * a.size
  const breathe = Math.sin(t * 3) * 0.02
  a.holder.scale.set(s * (1 + a.squash * 0.5), s * (1 - a.squash + breathe), s * (1 + a.squash * 0.5))
  if (a.head) a.head.rotation.set(a.nod + Math.sin(t * 2.3) * 0.05, a.shake + Math.sin(t * 0.9) * 0.12, a.tilt + Math.sin(t * 1.7) * 0.07)
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

// --- Cards ------------------------------------------------------------------------------------

const ringGeometry = new THREE.TorusGeometry(0.37, 0.03, 8, 48)
const ringMaterial = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 })
/** One tinted card-spot material per animal, shared by every card that shows it. */
const spotMaterials = {}

class Card {
  constructor(animal) {
    this.animal = animal
    this.state = 'down' // down | opening | open | closing | matched
    this.group = new THREE.Group()
    this.group.userData.card = this // a tap anywhere on the card, its animal or its ring finds the card
    this.pivot = new THREE.Group()
    this.group.add(this.pivot)
    const mesh = assets.card.clone(true)
    mesh.traverse((o) => {
      if (o.isMesh && o.material.name === 'card_spot') {
        o.material = spotMaterials[animal] ??= o.material.clone()
        o.material.color.set(ANIMALS[animal].color)
      }
    })
    this.pivot.add(mesh)
    this.critter = makeAnimal(animal)
    this.critter.baseY = FACE_TOP
    this.critter.holder.position.z = 0.1
    this.critter.holder.visible = false
    this.critter.pop = 0
    this.group.add(this.critter.holder)
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = FACE_TOP + 0.01
    this.ring.visible = false
    this.group.add(this.ring)
    this.hover = 0
    this.hoverTarget = 0
    this.lift = 0
    this.revealed = null
  }

  /** Flips the card over with a little hop, then (face up) pops the animal out. */
  flipUp() {
    this.state = 'opening'
    sound.flip()
    this.revealed = this.reveal() // tapCard waits on this for both cards of a turn
    return this.revealed
  }

  async reveal() {
    await tween(0.42, (t) => {
      this.pivot.rotation.z = ease.inOutCubic(t) * Math.PI
      this.lift = Math.sin(t * Math.PI) * 0.6
    })
    this.lift = 0
    this.land()
    await this.popOut()
  }

  async popOut() {
    const a = this.critter
    a.holder.visible = true
    sound.pop()
    sound.voice(this.animal, 0.1)
    effects.sparkle(this.worldTop(), { count: 10, speed: 1.4, up: 1.6, size: 0.06 })
    await tween(0.42, (t) => {
      a.pop = ease.outBack(t)
      a.hop = Math.sin(t * Math.PI) * 0.35
    })
    a.hop = 0
    if (this.state === 'opening') this.state = 'open'
  }

  /** Animal ducks back into the card, which flips face down. */
  async close(fast = false) {
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
    tween(0.25, (t) => (this.pivot.scale.y = 1 - Math.sin(t * Math.PI) * 0.25))
  }

  showRing() {
    this.ring.visible = true
    tween(0.5, (t) => this.ring.scale.setScalar(ease.outBack(t) + 0.001))
  }

  worldTop() {
    return this.group.position.clone().setY(REST_Y + FACE_TOP + 0.45)
  }

  update(dt, time) {
    const hoverTarget = this.state === 'down' ? this.hoverTarget : 0
    this.hover = THREE.MathUtils.damp(this.hover, hoverTarget, 14, dt)
    this.pivot.position.y = this.lift + this.hover * 0.08
    if (this.critter.holder.visible) poseAnimal(this.critter, time)
    if (this.ring.visible) this.ring.rotation.z += dt * 0.6
  }
}

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
    const score = Math.min(aspect / w, 1 / h) * (1 - empty * 0.04)
    if (!best || score > best.score) best = { cols, rows, score }
  }
  return best
}

function elevation() {
  return THREE.MathUtils.degToRad(game.state === 'menu' ? 34 : innerWidth / innerHeight < 0.8 ? 54 : 47)
}

function slots(n, cols, rows) {
  const out = []
  const pitchX = CARD_W + GAP_X
  const pitchZ = CARD_D + GAP_Z
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols
    const c = i % cols
    out.push(new THREE.Vector3((c - (inRow - 1) / 2) * pitchX, REST_Y, (r - (rows - 1) / 2) * pitchZ))
  }
  return { list: out, hw: (cols * pitchX - GAP_X) / 2, hd: (rows * pitchZ - GAP_Z) / 2 }
}

/** The part of the screen (in pixels) the 3D board may use, between the HTML bits. */
function freeRegion() {
  const w = innerWidth
  const h = innerHeight
  let top = 8
  let bottom = h - 8
  if (game.state === 'menu') {
    top = document.querySelector('.menu-top').getBoundingClientRect().bottom + 4
    bottom = document.querySelector('.menu-bottom').getBoundingClientRect().top - 4
  } else {
    for (const el of document.querySelectorAll('.hud-left, .hud-center')) top = Math.max(top, el.getBoundingClientRect().bottom + 6)
    bottom = h - 10 - safeBottom()
  }
  if (bottom - top < h * 0.3) {
    top = Math.min(top, h * 0.35)
    bottom = Math.max(bottom, h * 0.85)
  }
  return { top, bottom, left: 8, right: w - 8, w: w - 16, h: bottom - top }
}

const safeProbe = document.createElement('div')
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)'
document.body.appendChild(safeProbe)
function safeBottom() {
  return parseFloat(getComputedStyle(safeProbe).paddingBottom) || 0
}

/** Frames the box (hw, hd around the origin, up to height) in the free region, looking at the origin. */
function frame(hw, hd, height) {
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
  for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [0, height]) pts.push(new THREE.Vector3(x, y, z))
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
    applyCamera(frame(hw, 0.6, 1.05), animate)
    return
  }
  if (!game.cards.length) return
  const grid = chooseGrid(game.cards.length, freeRegion())
  const s = slots(game.cards.length, grid.cols, grid.rows)
  game.layout = { hw: s.hw, hd: s.hd }
  placeRoom(s.hw, s.hd)
  game.cards.forEach((card, i) => {
    card.slot = s.list[i]
    if (game.state !== 'dealing') card.group.position.copy(card.slot)
    card.critter.yaw = Math.atan2(-card.slot.x, 9) * 0.8
  })
  applyCamera(frame(s.hw + 0.1, s.hd + 0.1, ANIMAL_H), animate)
}

// --- Screens and HUD -----------------------------------------------------------------------------

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('menu').classList.toggle('hidden', screen !== 'menu')
  $('hud').classList.toggle('hidden', screen !== 'play')
  $('win').classList.toggle('hidden', screen !== 'win')
}

function nextLevel() {
  const i = LEVELS.findIndex((_, k) => !progress.stars[k])
  return i < 0 ? LEVELS.length - 1 : i
}

function renderLevels() {
  const next = nextLevel()
  $('levels').innerHTML = LEVELS.map((pairs, i) => {
    const stars = progress.stars[i] ?? 0
    const row = [0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">⭐</span>`).join('')
    return `<button class="level ${i === next ? 'next' : ''}" data-level="${i}"><span class="num">${i + 1}</span><span class="cards">🃏 ${pairs * 2}</span><span class="lstars">${row}</span></button>`
  }).join('')
  for (const el of document.querySelectorAll('[data-level]')) {
    el.addEventListener('click', () => {
      sound.tap()
      startLevel(Number(el.dataset.level))
    })
  }
}

function renderPairs() {
  const pairs = LEVELS[game.level]
  const done = game.cards.filter((c) => c.state === 'matched')
  const found = [...new Set(done.map((c) => c.animal))]
  $('pairs').innerHTML = Array.from({ length: pairs }, (_, i) => (found[i] ? `<span class="done">${ANIMALS[found[i]].emoji}</span>` : '<span></span>')).join('')
  $('level-pill').textContent = `Level ${game.level + 1}`
}

let bannerTimer = 0
function banner(text, ms = 900) {
  const el = $('banner')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

function updateMute() {
  $('mute').textContent = progress.muted ? '🔇' : '🔊'
}

// --- Menu ---------------------------------------------------------------------------------------

function enterMenu() {
  resetScene()
  game.state = 'menu'
  show('menu')
  renderLevels()
  const count = innerWidth / innerHeight < 0.8 ? 3 : 5
  game.paradeAnimals = shuffle([...NAMES]).slice(0, count).map((name, i) => {
    const a = makeAnimal(name)
    const x = (i - (count - 1) / 2) * PARADE_GAP
    a.holder.position.set(x, MAT_TOP, 0)
    a.baseY = MAT_TOP
    a.yaw = Math.atan2(-x, 8) * 0.7
    a.size = 0.95
    a.pop = 0
    parade.add(a.holder)
    tween(0.5, (t) => (a.pop = ease.outBack(t)), { delay: 0.25 + i * 0.12 })
    return a
  })
  relayout(true)
}

/** Empties the table: cards, menu animals, particles and every running tween. */
function resetScene() {
  clearTweens() // also strands any pending waits from the old board, so they never resume
  effects.clear()
  parade.clear()
  game.paradeAnimals = []
  board.clear()
  game.cards = []
  game.open = []
  game.mismatch = null
  game.busy = false
}

// --- Playing ------------------------------------------------------------------------------------

function startLevel(level) {
  resetScene()
  game.level = level
  game.matched = 0
  game.turns = 0
  game.state = 'dealing'
  show('play')
  const pairs = LEVELS[level]
  const picks = shuffle([...NAMES]).slice(0, pairs)
  const deck = shuffle([...picks, ...picks])
  game.cards = deck.map((animal) => new Card(animal))
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
  wait(0.35 + game.cards.length * 0.06 + 0.5).then(() => {
    game.state = 'play'
    banner(level === 0 ? 'Find the twins!' : `Level ${level + 1}`, 1100)
  })
}

async function tapCard(card) {
  if (game.state !== 'play') return
  if (card.state === 'matched' || card.state === 'open') {
    // Matched animals love attention.
    hopOnce(card.critter)
    sound.voice(card.animal)
    return
  }
  if (card.state !== 'down' || game.busy) return
  if (game.mismatch) closeMismatch(true)
  if (game.open.length >= 2) return
  game.open.push(card)
  const revealing = card.flipUp()
  if (game.open.length === 1) {
    await revealing
    if (card.state === 'open') card.critter.excited = true
    return
  }
  const [a, b] = game.open
  game.busy = true
  game.turns++
  await Promise.all([a.revealed, b.revealed])
  game.busy = false
  game.open = []
  a.critter.excited = b.critter.excited = false
  if (a.animal === b.animal) onMatch(a, b)
  else onMismatch(a, b)
}

function onMatch(a, b) {
  a.state = b.state = 'matched'
  game.matched++
  sound.match()
  sound.voice(a.animal, 0.35)
  for (const card of [a, b]) {
    dance(card.critter, { delay: 0.05 })
    card.showRing()
    effects.sparkle(card.worldTop(), { count: 26 })
  }
  renderPairs()
  const done = game.matched === LEVELS[game.level]
  if (!done) banner(PRAISE[(Math.random() * PRAISE.length) | 0], 800)
  else wait(1.1).then(winLevel)
}

function onMismatch(a, b) {
  sound.miss()
  for (const card of [a, b]) {
    const c = card.critter
    tween(0.7, (t) => {
      c.shake = Math.sin(t * Math.PI * 4) * 0.45 * (1 - t)
      c.tilt = Math.sin(t * Math.PI) * 0.15
      if (t >= 1) c.shake = c.tilt = 0
    })
  }
  game.mismatch = { a, b }
  wait(1.25).then(() => {
    if (game.mismatch?.a === a) closeMismatch(false)
  })
}

function closeMismatch(fast) {
  const { a, b } = game.mismatch
  game.mismatch = null
  for (const card of [a, b]) {
    card.critter.shake = card.critter.tilt = 0
    card.close(fast)
  }
}

function starsFor(pairs, turns) {
  const extra = turns - pairs
  if (extra <= Math.ceil(pairs * 0.5)) return 3
  if (extra <= pairs * 1.5) return 2
  return 1
}

function winLevel() {
  game.state = 'won'
  const pairs = LEVELS[game.level]
  const stars = starsFor(pairs, game.turns)
  const before = progress.stars[game.level] ?? 0
  const bestTurns = progress.best[game.level]
  const newBest = bestTurns === undefined || game.turns < bestTurns
  progress.stars[game.level] = Math.max(before, stars)
  if (newBest) progress.best[game.level] = game.turns
  save()

  // Party: everyone dances in a wave, confetti everywhere.
  sound.fanfare()
  banner('You did it!', 1600)
  const { hw, hd } = game.layout
  effects.rain(new THREE.Vector3(0, 0, 0), hw + 0.6, hd + 0.6, 160 + pairs * 20)
  effects.cannon(new THREE.Vector3(-hw - 0.3, 0.2, -hd))
  effects.cannon(new THREE.Vector3(hw + 0.3, 0.2, -hd))
  game.cards.forEach((card, i) => {
    dance(card.critter, { delay: (card.slot.x + hw) * 0.12 + Math.random() * 0.1, dur: 1.4, hops: 3, height: 0.55 })
    sound.voice(card.animal, 0.5 + (i % pairs) * 0.18)
  })

  wait(2.3).then(() => {
    const last = game.level === LEVELS.length - 1
    $('win-title').textContent = last ? 'Champion!' : { 3: 'Amazing!', 2: 'Hooray!', 1: 'Well done!' }[stars]
    $('win-text').textContent = last
      ? `You found all ${pairs} pairs! You matched them all! 🏆`
      : `You found ${pairs} pairs in ${game.turns} tries!${newBest && bestTurns !== undefined ? ' New best! 🎉' : ''}`
    $('next').classList.toggle('hidden', last)
    const spans = $('win-stars').children
    for (let i = 0; i < 3; i++) {
      spans[i].className = ''
      wait(0.35 + i * 0.3).then(() => {
        spans[i].className = i < stars ? 'on' : 'off'
        if (i < stars) sound.star(i)
      })
    }
    show('win')
  })
}

// --- Input ------------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function pick(e, objects) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObjects(objects, true)[0]
}

addEventListener('pointerdown', () => sound.unlock(), { capture: true })
canvas.addEventListener('pointerdown', (e) => {
  if (game.state === 'menu') {
    const hit = pick(e, parade.children)
    const a = hit && tagged(hit.object, 'animal')
    if (a && !a.busy) {
      dance(a, { dur: 0.9, hops: 2, height: 0.4 })
      sound.voice(a.name)
      effects.sparkle(a.holder.position.clone().setY(1.0), { count: 14 })
    }
    return
  }
  const hit = pick(e, board.children)
  const card = hit && tagged(hit.object, 'card')
  if (card) tapCard(card)
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return
  let hovered = null
  if (game.state === 'play') {
    const hit = pick(e, board.children)
    hovered = hit && tagged(hit.object, 'card')
  } else if (game.state === 'menu') {
    hovered = pick(e, parade.children) ? true : null
  }
  for (const card of game.cards) card.hoverTarget = card === hovered && card.state === 'down' ? 1 : 0
  canvas.style.cursor = hovered ? 'pointer' : ''
})

/** Walks up from a picked mesh to the first parent tagged with userData[key] ('card' or 'animal'). */
function tagged(obj, key) {
  for (let o = obj; o; o = o.parent) if (o.userData[key]) return o.userData[key]
  return null
}

$('play').addEventListener('click', () => {
  sound.tap()
  startLevel(nextLevel())
})
$('home').addEventListener('click', () => {
  sound.tap()
  enterMenu()
})
$('win-home').addEventListener('click', () => {
  sound.tap()
  enterMenu()
})
$('again').addEventListener('click', () => {
  sound.tap()
  startLevel(game.level)
})
$('next').addEventListener('click', () => {
  sound.tap()
  startLevel(Math.min(LEVELS.length - 1, game.level + 1))
})
$('mute').addEventListener('click', () => {
  progress.muted = !progress.muted
  sound.setMuted(progress.muted)
  updateMute()
  save()
})
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && game.state === 'menu') startLevel(nextLevel())
})
// Block pinch zoom and double-tap zoom on iOS.
for (const type of ['gesturestart', 'dblclick']) document.addEventListener(type, (e) => e.preventDefault())

let resizeTimer = 0
function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
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
  updateTweens(dt)
  for (const card of game.cards) card.update(dt, game.time)
  for (const a of game.paradeAnimals) {
    poseAnimal(a, game.time)
    if (!a.busy && Math.random() < dt * 0.25) hopOnce(a, 0.25)
  }
  if (game.state === 'play') {
    for (const card of game.cards) {
      if (card.state === 'matched' && !card.critter.busy && Math.random() < dt * 0.06) hopOnce(card.critter, 0.2)
    }
  }
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
    $('loading-text').textContent = 'Oops, the animals are hiding. Please reload!'
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
