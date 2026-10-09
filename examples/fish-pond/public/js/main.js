import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { Audio } from './audio.js'
import { AMBIENT, BY_ID, CREATURES, Creatures, SWIM_SCALE, roll } from './creatures.js'
import { Effects, softDot } from './effects.js'
import { HOLES, PLACES, RIG, World } from './world.js'
import { Book } from './book.js'
import { lookFor } from './look.js'
import { createVoice } from './speech.js'

const $ = (id) => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const { clamp, damp, lerp } = THREE.MathUtils
const ease = (k) => 1 - (1 - k) ** 3

// --- Saved bits (private windows may refuse storage, so everything is guarded) ------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  },
}

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.0
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.6
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)
scene.add(camera)

const audio = new Audio()
// Says each creature's name and fact out loud, so nobody needs to read
const voice = createVoice({ muted: audio.muted, rate: 0.95, pitch: 1.25 })
const world = new World(scene, camera, renderer)
const creatures = new Creatures(scene)
const effects = new Effects(scene, camera)

// --- Game state -------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | play
  place: PLACES[store.get('fish-pond-place', 'lake')] ? store.get('fish-pond-place', 'lake') : 'lake',
  phase: 'idle', // idle | cast | wait | bite | catch | show | toBook
  book: store.get('fish-pond-book', {}),
  luck: store.get('fish-pond-luck', 0),
  looks: Number(store.get('fish-pond-looks', 0)) || 0, // features looked at closely (the finger helps until the first)
  casts: 0,
  phaseT: 0,
  misses: 0,
  idleT: 0,
}
if (typeof game.book !== 'object' || !game.book) game.book = {}
const debug = { force: null }
const caughtKinds = () => CREATURES.filter((c) => game.book[c.id] > 0).length
const totalCaught = () => Object.values(game.book).reduce((a, b) => a + (Number(b) || 0), 0)

// --- Camera framing ---------------------------------------------------------------

const camLook = new THREE.Vector3()
const camBase = new THREE.Vector3()
/** Fits the lake to any screen: phones in portrait see more water, less sky. */
function frameCamera() {
  const a = camera.aspect
  if (a >= 1.1) {
    camera.fov = 48
    camBase.set(0, 6.2, 15.5)
    camLook.set(0, 0.5, -3)
  } else {
    // Keep about 12 units of water across the screen near the bobbers
    const half = 6.4
    const d = 18
    camera.fov = clamp((2 * Math.atan(half / d / a) * 180) / Math.PI, 48, 74)
    camBase.set(0, 8 + (1.1 - a) * 4, 16.5)
    camLook.set(0, -0.6 - (1.1 - a) * 1.5, -2)
  }
  camera.clearViewOffset()
  view.x = view.y = 0
  camera.position.copy(camBase)
  camera.lookAt(camLook)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  // Where Bear sits on screen with the plain framing (the title slides the view from here)
  bearOnScreen.copy(RIG).setY(1.2).project(camera)
}

/**
 * On the title the picture slides sideways (or down, on tall screens) like a
 * camera lens shift, so Bear and the boat sit in the open space beside the card
 * instead of hiding behind it. Fishing uses the plain framing.
 */
const view = { x: 0, y: 0 }
const bearOnScreen = new THREE.Vector3()
let titleCard = null
function updateView(dt) {
  const w = innerWidth
  const h = innerHeight
  let tx = 0
  let ty = 0
  if (game.state === 'title') {
    titleCard ??= document.querySelector('#title .card')
    const r = titleCard.getBoundingClientRect()
    const bx = ((bearOnScreen.x + 1) / 2) * w
    const by = ((1 - bearOnScreen.y) / 2) * h
    if (w / h >= 1.25) {
      if (r.width && bx < r.right + 60) tx = bx - (r.right + w) / 2
    } else if (r.height && by < r.bottom + 60) ty = by - (r.bottom + (h - r.bottom) * 0.42)
  }
  const k = 1 - Math.exp(-dt * 4)
  view.x += (tx - view.x) * k
  view.y += (ty - view.y) * k
  if (Math.abs(view.x) < 0.5 && Math.abs(view.y) < 0.5 && !tx && !ty) {
    if (camera.view?.enabled) camera.clearViewOffset()
    view.x = view.y = 0
  } else camera.setViewOffset(w, h, view.x, view.y, w, h)
}

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  frameCamera()
  lineMat.resolution.set(w, h)
  world.layout()
  updateBounds()
  // Short screens: lift the show-off so the name card fits underneath
  stage.position.y = h < 560 ? 0.55 : 0.15
}

/** Half the visible water width at depth z (for keeping fish and casts on screen). */
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hitP = new THREE.Vector3()
function waterAt(nx, ny, out) {
  ndc.set(nx, ny)
  ray.setFromCamera(ndc, camera)
  return ray.ray.intersectPlane(waterPlane, out)
}
const bounds = { zMin: -3.2, zMax: 7, halfAt: () => 6 }
function updateBounds() {
  // The nearest water you can see (bottom of the screen) and its width
  const near = waterAt(0, -0.82, new THREE.Vector3()) ?? new THREE.Vector3(0, 0, 8)
  bounds.zMax = Math.min(10, near.z)
  const left = waterAt(-0.9, -0.3, new THREE.Vector3())
  const mid = waterAt(0, -0.3, new THREE.Vector3())
  const w = left && mid ? Math.abs(left.x) : 6
  const zRef = mid ? mid.z : 3
  const scale = w / (camera.position.z - zRef)
  bounds.halfAt = (z) => clamp(scale * (camera.position.z - z), 2.5, 13)
  creatures.bounds.x = (z) => bounds.halfAt(z) * 0.95
  creatures.bounds.zMin = bounds.zMin
  creatures.bounds.zMax = bounds.zMax - 0.5
  creatures.bounds.avoid.copy(RIG)
}

// --- Bobber & line ------------------------------------------------------------------

const bob = { group: new THREE.Group(), pos: new THREE.Vector3(), state: 'hang', fly: null, dip: 0, shake: 0, swing: 0 }
scene.add(bob.group)
const tip = new THREE.Vector3()
const castSpot = new THREE.Vector3()

const LINE_N = 24
const linePts = new Float32Array(LINE_N * 3)
const lineGeo = new LineGeometry()
lineGeo.setPositions(linePts)
const lineMat = new LineMaterial({ color: '#ffffff', linewidth: 2.2, transparent: true, opacity: 0.85 })
const line = new Line2(lineGeo, lineMat)
line.frustumCulled = false
line.renderOrder = 4
scene.add(line)
const lineBuf = lineGeo.attributes.instanceStart.data

function updateLine(sag) {
  const a = tip
  const b = bob.pos
  const top = 0.17 * bob.group.scale.y
  for (let i = 0; i < LINE_N; i++) {
    const k = i / (LINE_N - 1)
    const x = lerp(a.x, b.x, k)
    const y = lerp(a.y, b.y + top, k) - Math.sin(k * Math.PI) * sag
    const z = lerp(a.z, b.z, k)
    linePts[i * 3] = x
    linePts[i * 3 + 1] = y
    linePts[i * 3 + 2] = z
  }
  // Rewrite the segment pairs in place (no new buffers every frame)
  const arr = lineBuf.array
  for (let i = 0; i < LINE_N - 1; i++) {
    for (let j = 0; j < 3; j++) {
      arr[i * 6 + j] = linePts[i * 3 + j]
      arr[i * 6 + 3 + j] = linePts[(i + 1) * 3 + j]
    }
  }
  lineBuf.needsUpdate = true
}

// --- Show-off stage (rides on the camera) ----------------------------------------------

const stage = new THREE.Group()
stage.position.set(0, 0.15, -5)
camera.add(stage)
const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, color: '#fffbe6', opacity: 0, toneMapped: false }))
glow.position.z = -1.9
glow.renderOrder = 6
stage.add(glow)
const stageLight = new THREE.PointLight('#fff6e8', 0, 12, 2)
stageLight.position.set(1.2, 1.8, 1.5)
stage.add(stageLight)

function stageScale() {
  const h = 2 * Math.tan((camera.fov * Math.PI) / 360) * 5
  return Math.min(2.5, h * camera.aspect * 0.62, h * 0.5)
}

// --- Fishing ------------------------------------------------------------------------

// Optional learning missions. A pace below 1 gives a much longer bite window.
const adventure = createAdventure({
  id: 'fish-pond',
  anchor: $('title-book'),
  hud: $('hud'),
  voice,
  // The mission speaks its own reward; the screen shows a big trophy to go with it
  celebrate: () => {
    showIntro('🏆', '1, 2, 3!', '🐟 🐟 🐟', false, true)
    softMoment()
    audio.chord()
  },
  // The counting mission fills in a fish per catch, so a child who can't read can follow along
  options: [
    { emoji: '🎣', label: 'Free fishing' },
    { emoji: '🐢', label: 'Extra time to reel', pace: 0.6 },
    { emoji: '🐟', label: 'Count to 3', icon: '🐟', pace: 0.6, goal: 'Count 3 catches', target: 3, reward: 'One, two, three! You counted three catches!' },
  ],
})

const fish = {
  pick: null, // the creature info coming to bite
  who: null, // its swimmer (or a bubble "ghost" for things in the deep)
  timer: 0,
  nibbles: 0,
  nibbleT: 0,
  window: 0,
  catch: null,
  show: null,
}

function setPhase(p) {
  game.phase = p
  game.phaseT = 0
}

/** Clamp a tap on the water to somewhere sensible to fish. */
function castTarget(p) {
  const out = p.clone()
  out.y = 0
  if (PLACES[game.place].ice) return world.nearestHole(out).clone()
  out.z = clamp(out.z, bounds.zMin, bounds.zMax - 0.4)
  const w = bounds.halfAt(out.z) - 0.8
  out.x = clamp(out.x, -w, w)
  // Not on top of the boat
  const dx = out.x - RIG.x
  const dz = out.z - RIG.z
  const d = Math.hypot(dx, dz)
  if (d < 3.4) {
    out.x = RIG.x + (dx / (d || 1)) * 3.4
    out.z = RIG.z + (Math.abs(dz) / (d || 1)) * 3.4
  }
  return out
}

function castTo(point) {
  if (game.phase !== 'idle' && game.phase !== 'wait') return
  if (game.phase === 'wait') letGo(false)
  castSpot.copy(castTarget(point))
  setPhase('cast')
  game.casts++
  bob.fly = { from: new THREE.Vector3(), to: castSpot.clone(), t: 0, dur: 0.6 }
  audio.cast()
  hint(false)
  game.idleT = 0
  // The place's name card steps aside once fishing starts (a trophy stays up)
  if (introIsPlace) $('intro').classList.remove('show')
}

/** The bobber lands: something will come and have a look soon. */
function landed() {
  bob.state = 'float'
  bob.pos.copy(castSpot)
  effects.plop(castSpot)
  audio.plop()
  setPhase('wait')
  fish.timer = rand(0.5, 1.1)
  fish.pick = null
  fish.who = null
}

/** Pick who bites and send them over. */
function sendBiter() {
  const pick = BY_ID[debug.force] ?? roll(game.place, game.book, game.luck)
  fish.pick = pick
  // Two or three slow bobs to watch before the real bite
  fish.nibbles = 2 + ((Math.random() * 2) | 0)
  fish.nibbleT = 0
  const spot = bob.pos
  const away = (dist) => {
    const v = new THREE.Vector3()
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2
      v.set(spot.x + Math.cos(a) * dist, 0, spot.z + Math.sin(a) * dist)
      if (Math.abs(v.x) < bounds.halfAt(v.z) && v.z > bounds.zMin - 2 && v.z < bounds.zMax && v.distanceTo(RIG) > 3) break
    }
    return v
  }
  if (pick.how === 'deep') {
    fish.who = { ghost: true, pos: away(4).setY(-1.6), bubbleIn: 0 }
    return
  }
  if (pick.how === 'swim') {
    // A fish of the same kind already swimming about comes over, if there is one
    let best = null
    for (const s of creatures.swimmers) {
      if (s.id === pick.id && s.mode === 'wander' && (!best || s.pos.distanceTo(spot) < best.pos.distanceTo(spot))) best = s
    }
    if (best && best.pos.distanceTo(spot) < 9) {
      best.mode = 'approach'
      fish.who = best
      return
    }
    fish.who = creatures.spawnSwimmer(pick.id, away(4.2), { mode: 'approach', y: -1.9, depth: -0.8 })
    fish.who.spawned = true
    return
  }
  if (pick.how === 'surface') {
    fish.who = creatures.spawnSwimmer(pick.id, away(4.5), { mode: 'approach', y: 0.02 })
    fish.who.spawned = true
    return
  }
  // The whale: a big friendly shadow from the deep
  const p = away(6).setY(-1.9)
  fish.who = creatures.spawnSwimmer('whale', p, { mode: 'approach', y: -1.9, depth: -1.7 })
  fish.who.spawned = true
  fish.who.speed = 1.3
  audio.whale()
}

/** Whoever was coming swims off (giggling if they got away). */
function letGo(giggle) {
  const w = fish.who
  fish.who = null
  fish.pick = null
  hideBang()
  if (!w) return
  if (w.ghost) return
  w.mode = 'flee'
  w.fleeFor = giggle ? 2.2 : 1.2
  w.vanish = !!w.spawned
  const dir = new THREE.Vector3(w.pos.x - bob.pos.x, 0, w.pos.z - bob.pos.z).normalize()
  if (!dir.lengthSq()) dir.set(1, 0, 0)
  w.target.copy(w.pos).addScaledVector(dir, 8)
  w.target.z = clamp(w.target.z, bounds.zMin - 6, bounds.zMax + 6)
  if (giggle) {
    audio.giggle()
    effects.label(['😝', '😜', '🤭', '💨'][(Math.random() * 4) | 0], new THREE.Vector3(bob.pos.x, 0.8, bob.pos.z), { cls: 'emoji' })
    effects.bubble(new THREE.Vector3(w.pos.x, w.pos.y + 0.2, w.pos.z), 6, 0.4)
  }
}

function updateWait(dt, t) {
  if (!fish.who) {
    fish.timer -= dt
    if (fish.timer <= 0) sendBiter()
    return
  }
  const w = fish.who
  const spot = bob.pos
  if (w.ghost) {
    // Bubbles trail in from the deep
    const d = Math.hypot(spot.x - w.pos.x, spot.z - w.pos.z)
    if (d > 0.3) {
      w.pos.x += ((spot.x - w.pos.x) / d) * Math.min(d, dt * 2)
      w.pos.z += ((spot.z - w.pos.z) / d) * Math.min(d, dt * 2)
      w.bubbleIn -= dt
      if (w.bubbleIn <= 0) {
        w.bubbleIn = 0.12
        effects.bubble(new THREE.Vector3(w.pos.x, -0.6, w.pos.z), 2, 0.3)
      }
      return
    }
    return nibbleStep(dt)
  }
  const reach = w.id === 'whale' ? 1.0 : 0.35 + w.info.size * 0.35
  if (w.mode === 'approach') {
    const d = creatures.steer(w, spot, dt, w.id === 'whale' ? 1.6 : 2.2, 3.5)
    const depth = w.info.how === 'surface' ? 0.02 : w.id === 'whale' ? -1.5 : -0.45
    w.pos.y += (depth - w.pos.y) * Math.min(1, dt * 1.8)
    if (d < reach) {
      w.mode = 'nibble'
      fish.nibbleT = 0.35
    }
    return
  }
  if (w.mode === 'nibble') {
    // Face the bobber and hover
    creatures.steer(w, spot, dt * 0.05, 0.01, 4)
    nibbleStep(dt)
  }
}

function nibbleStep(dt) {
  fish.nibbleT -= dt
  if (fish.nibbleT > 0) return
  if (fish.nibbles > 0) {
    fish.nibbles--
    fish.nibbleT = rand(0.8, 1.2)
    bob.dip = 0.12
    effects.ripple(bob.pos, 0.6, 0.6)
    audio.nibble()
    if (fish.who && !fish.who.ghost) fish.who.nudge = 0.25
    return
  }
  bite()
}

function bite() {
  setPhase('bite')
  // A patient window by default: there is time to look, then tap (BITE_WINDOW)
  fish.window = (adventure.pace < 1 ? 6 : BITE_WINDOW) + Math.min(1.5, game.misses * 0.5) + (totalCaught() < 3 ? 0.6 : 0)
  bob.shake = 1
  audio.bite()
  effects.ripple(bob.pos, 1.4, 0.8)
  effects.ripple(bob.pos, 0.8, 0.5)
  try {
    navigator.vibrate?.(80)
  } catch {}
  showBang()
}

function updateBite(dt) {
  fish.window -= dt
  const w = fish.who
  if (w && !w.ghost) creatures.steer(w, bob.pos, dt * 0.05, 0.01, 4)
  if (Math.random() < dt * 2) effects.ripple(bob.pos, 0.7, 0.5)
  if (fish.window <= 0) {
    // It got away: no harm done, somebody else will come along
    game.misses++
    letGo(true)
    setPhase('wait')
    bob.shake = 0
    fish.timer = rand(1.0, 1.8)
  }
}

/** Tap during the bite: reel it in! */
function reel() {
  hideBang()
  game.misses = 0
  const pick = fish.pick
  const w = fish.who
  fish.who = null
  let c
  if (w && !w.ghost) {
    const i = creatures.swimmers.indexOf(w)
    if (i >= 0) creatures.swimmers.splice(i, 1)
    c = w
  } else {
    c = creatures.make(pick.id, pick.size * SWIM_SCALE)
    c.group.position.set(bob.pos.x, -0.4, bob.pos.z)
    scene.add(c.group)
  }
  // The whale stays big as it leaps
  const from = c.group.position.clone()
  const big = pick.id === 'whale' ? 2 : pick.stars >= 3 ? 1.5 : 1
  effects.splash(bob.pos, big)
  // No camera shake: the splash and the leap carry the moment
  audio.splash(big > 1 ? 1.3 : 1)
  audio.reel()
  fish.catch = { c, pick, from, t: 0, dur: 0.95, startScale: c.group.scale.x, spin: rand(-1, 1) > 0 ? 1 : -1 }
  setPhase('catch')
}

const stageWorld = new THREE.Vector3()
/** Scratch vectors for effects around the stage, so the show allocates nothing per frame. */
const stageFx = new THREE.Vector3()
const stageVel = new THREE.Vector3()
function updateCatch(dt) {
  const k = fish.catch
  k.t += dt
  const e = Math.min(1, k.t / k.dur)
  stage.getWorldPosition(stageWorld)
  const g = k.c.group
  const sm = e * e * (3 - 2 * e)
  g.position.lerpVectors(k.from, stageWorld, sm)
  g.position.y += Math.sin(e * Math.PI) * 2.6
  g.rotation.set(0, k.c.heading ?? 0, 0)
  g.rotation.y += k.spin * e * Math.PI * 2
  g.rotation.z = Math.sin(e * Math.PI) * 0.5 * k.spin
  const end = stageScale() * k.c.unit * (SHOW_SIZE[k.pick.id] ?? 1)
  g.scale.setScalar(lerp(k.startScale, end, sm))
  // The bobber comes along on the line
  bob.pos.copy(g.position).y -= 0.2
  if (e >= 1) startShow()
}

/** Bite window in seconds: long enough to watch the bobber and then tap, with no rush. */
const BITE_WINDOW = 4.5

/** The one soft moment for a catch or a prize: a few slow bubbles rising behind the stage. */
function softMoment() {
  stage.getWorldPosition(stageWorld)
  for (let i = 0; i < 8; i++) effects.bubble(stageFx.set(rand(-1.4, 1.4), rand(-0.8, 0.2), -1.2).add(stageWorld), 1, 0.3)
}

/** Boxy or round things look bigger than fish of the same length. */
const SHOW_SIZE = { chest: 0.78, pufferfish: 0.85, boot: 0.9, duck: 0.9 }

const SAY = {
  boot: 'Silly! An old boot!',
  chest: 'Wow! Treasure!',
  whale: 'A friendly whale!',
  goldenfish: 'Wow! A golden fish!',
  duck: 'Quack! A rubber duck!',
}

function startShow() {
  const { c, pick } = fish.catch
  stage.attach(c.group)
  c.group.position.set(0, 0, 0)
  const before = Number(game.book[pick.id]) || 0
  game.book[pick.id] = before + 1
  store.set('fish-pond-book', game.book)
  game.luck = pick.stars === 3 ? 0 : game.luck + 1
  store.set('fish-pond-luck', game.luck)
  const isNew = before === 0
  const look = lookFor(pick.id, game.book[pick.id])
  fish.show = { c, pick, t: 0, isNew, puffed: false, all: isNew && caughtKinds() === CREATURES.length, look, lookAt: look ? creatures.featurePoint(pick.id, look.at) : null }
  setPhase('show')
  bob.state = 'hang'
  // Card under the creature: stars, name and a NEW sticker
  $('card-stars').textContent = '⭐'.repeat(pick.stars)
  $('card-name').textContent = pick.name
  $('card-new').classList.toggle('hidden', !isNew)
  $('card').className = `card-catch show stars${pick.stars}`
  audio.fanfare(pick.stars)
  voice.sayNow(SAY[pick.id] ?? `You caught ${/^[aeiou]/i.test(pick.name) ? 'an' : 'a'} ${pick.name.toLowerCase()}!`)
  // Look closer: one feature to notice, asked right after the name (it is optional)
  $('card-look').classList.toggle('hidden', !look)
  if (look) {
    $('card-look').textContent = `🔍 ${look.part}?`
    voice.say(`Look closer! See its ${look.part}?`)
  }
  softMoment()
  stageLight.intensity = 6
  updateHud()
}

function updateShow(dt, t) {
  const s = fish.show
  s.t += dt
  const g = s.c.group
  const base = stageScale() * s.c.unit * (SHOW_SIZE[s.pick.id] ?? 1)
  const pop = s.t < 0.5 ? 1 + Math.sin((s.t / 0.5) * Math.PI) * 0.15 : 1
  let scale = base * pop
  const id = s.pick.id
  // Each creature shows off in its own way
  if (id === 'pufferfish') {
    const k = clamp((s.t - 0.6) / 0.35, 0, 1)
    if (k > 0 && !s.puffed) {
      s.puffed = true
      audio.puff()
    }
    const puff = 1 + 0.32 * ease(k) + (k >= 1 ? Math.sin(s.t * 6) * 0.03 : Math.sin(k * Math.PI) * 0.12)
    scale *= puff
    if (s.c.parts.spikes) s.c.parts.spikes.scale.setScalar(1 + 0.12 * ease(k))
  }
  if (id === 'chest' && s.c.parts.lid) {
    const k = clamp((s.t - 0.5) / 0.4, 0, 1)
    if (k > 0 && !s.opened) {
      s.opened = true
      audio.creak()
    }
    s.c.parts.lid.rotation.z = ease(k) * 1.3
    if (k > 0 && Math.random() < dt * 6) effects.sparkleAt(stageFx.set(rand(-0.6, 0.6), 0.6, 0.4).add(stageWorld), '#ffe066', 1, 2.5, 0.35)
  }
  if (id === 'goldenfish' && Math.random() < dt * 5) effects.sparkleAt(stageFx.set(rand(-1, 1), rand(-0.6, 0.6), 0.5).add(stageWorld), '#fff3a0', 1, 1, 0.3)
  if (id === 'whale' && s.t > 0.4 && s.t < 2.2 && Math.random() < dt * 40) {
    // The spout sits on top of the whale
    const p = stageFx.set(0.2, 0.55, 0.3).multiplyScalar(base / s.c.unit).add(stageWorld)
    effects.drops.spawn(p, stageVel.set(rand(-0.8, 0.8), rand(3, 5), rand(-0.3, 0.6)), { life: 1.2, size: rand(0.05, 0.1), color: '#d9f3ff' })
  }
  if (id === 'jellyfish') scale *= 1 + Math.sin(s.t * 5) * 0.05
  g.scale.setScalar(scale)
  // A happy wiggle, turned so you can see its face
  const face = id === 'pufferfish' || id === 'octopus' || id === 'jellyfish' || id === 'duck' || id === 'chest' || id === 'boot' || id === 'crab' ? -1.05 : -0.45
  g.rotation.set(Math.sin(s.t * 2.2) * 0.12, face + Math.sin(s.t * 1.6) * 0.35, Math.sin(s.t * 3.1) * 0.08)
  g.position.y = Math.sin(s.t * 2.8) * 0.08
  if (s.c.parts.tail) s.c.parts.tail.rotation[id === 'whale' || id === 'narwhal' ? 'z' : 'y'] = Math.sin(s.t * 12) * 0.5
  // Rays and glow behind
  const a = Math.min(1, s.t * 3)
  // A still, soft glow behind the catch (no spinning rays)
  glow.material.opacity = a * 0.4
  glow.material.color.set(s.pick.stars >= 3 ? '#ffe680' : '#fffbe6')
  updateLook(s)
  // Untouched, the catch flies to the book after a calm pause. After a look, it waits for the fact.
  if (s.looked) {
    const heard = s.factDone ? s.t - s.factDone > 1.2 && s.t - s.looked > s.factFor * 0.6 : s.t - s.looked > s.factFor
    if (heard || s.t - s.looked > 14) finishShow()
  } else if (s.t > (s.look ? LOOK_WAIT : 4.6)) finishShow()
}

// --- Look closer -----------------------------------------------------------------------

/** Seconds a catch waits on the stage for a look before flying to the book. */
const LOOK_WAIT = 7.5
/** When the glow appears: once the name has been said. */
const LOOK_FROM = 1.3
const lookBtn = $('look')
const lookPos = new THREE.Vector3()
const lookScreen = { x: 0, y: 0, on: false }

/** Keep the glow on the creature's feature as it wiggles on the stage. */
function updateLook(s) {
  lookScreen.on = false
  if (!s.look || s.looked || s.t < LOOK_FROM) return
  s.c.group.updateWorldMatrix(true, false)
  lookPos.copy(s.lookAt)
  s.c.group.localToWorld(lookPos)
  lookPos.project(camera)
  lookScreen.x = ((lookPos.x + 1) / 2) * innerWidth
  lookScreen.y = ((1 - lookPos.y) / 2) * innerHeight
  lookScreen.on = true
  lookBtn.style.transform = `translate(${lookScreen.x}px, ${lookScreen.y}px)`
  if (lookBtn.classList.contains('hidden')) {
    lookBtn.className = 'look'
    lookBtn.setAttribute('aria-label', `Look closer: ${s.look.part}`)
    void lookBtn.offsetWidth
    lookBtn.classList.add('on')
  }
}

/** The child tapped the glowing feature: say its one true fact, then carry on. */
function lookCloser() {
  const s = fish.show
  if (game.phase !== 'show' || !s?.look || s.looked || s.t < LOOK_FROM) return
  s.looked = s.t
  s.factDone = 0
  const fact = s.look.fact
  // A muted game shows the words only, so allow reading time instead of waiting for the voice
  s.factFor = 1.5 + fact.split(' ').length * 0.42
  if (!audio.muted) voice.sayNow(fact, { onend: () => fish.show === s && (s.factDone = s.t) })
  $('card-look').textContent = fact
  lookBtn.classList.remove('on')
  lookBtn.classList.add('seen')
  audio.nibble()
  game.looks++
  store.set('fish-pond-looks', game.looks)
  hint(false)
}

function hideLook() {
  lookBtn.className = 'look hidden'
  lookScreen.on = false
  $('card-look').classList.add('hidden')
}

lookBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  e.stopPropagation()
  audio.unlock()
  lookCloser()
})
lookBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  lookCloser()
})

/** The creature flies into the book. */
function finishShow() {
  const s = fish.show
  if (!s || game.phase !== 'show') return
  setPhase('toBook')
  $('card').className = 'card-catch'
  hideLook()
  const r = $('book-btn').getBoundingClientRect()
  const p = new THREE.Vector3(((r.left + r.width / 2) / innerWidth) * 2 - 1, -((r.top + r.height / 2) / innerHeight) * 2 + 1, 0.5).unproject(camera)
  const dir = p.sub(camera.position).normalize()
  const target = camera.position.clone().addScaledVector(dir, 4.6)
  s.from = s.c.group.position.clone()
  s.to = stage.worldToLocal(target.clone())
  s.fromScale = s.c.group.scale.x
  s.fly = 0
}

function updateToBook(dt) {
  const s = fish.show
  s.fly += dt / 0.6
  const e = Math.min(1, s.fly)
  const g = s.c.group
  g.position.lerpVectors(s.from, s.to, e * e)
  g.scale.setScalar(s.fromScale * (1 - 0.88 * e))
  g.rotation.y += dt * 8
  glow.material.opacity *= 0.85
  if (e >= 1) {
    g.removeFromParent()
    glow.material.opacity = 0
    stageLight.intensity = 0
    audio.thump()
    const b = $('book-btn')
    b.classList.remove('bump')
    void b.offsetWidth
    b.classList.add('bump')
    fish.show = null
    setPhase('idle')
    refillAmbient()
    updateHud()
    // Counted once the catch is in the book, so the number never talks over its name.
    // After a trophy the next catch starts a fresh count at 1, so there is always a goal.
    if (adventure.complete) adventure.begin()
    adventure.event(s.pick)
    // Finding all 15 is the bigger prize: its card goes up last so nothing covers it
    if (s.all) {
      showIntro('🏆', 'You found them all!', '📖 15 / 15', false, true)
      softMoment()
      audio.chord()
    }
  }
}

// --- Swimmers about the place ----------------------------------------------------------

function refillAmbient() {
  // Bring back whichever kinds are missing (the one just caught, usually)
  const missing = [...(AMBIENT[game.place] ?? [])]
  for (const s of creatures.swimmers) {
    const i = s.spawned ? -1 : missing.indexOf(s.id)
    if (i >= 0) missing.splice(i, 1)
  }
  for (const id of missing) spawnAmbient(id).pos.y = -2
}

/** One of the place's swimmers. On the reef, clownfish keep close to an anemone home. */
function spawnAmbient(id) {
  const homes = PLACES[game.place].anemones
  if (id !== 'clownfish' || !homes) return creatures.spawnSwimmer(id, creatures.randomSpot())
  const taken = creatures.swimmers.filter((s) => s.home).length
  const [x, z] = homes[taken % homes.length]
  const home = new THREE.Vector3(x, 0, z)
  const s = creatures.spawnSwimmer(id, home.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1))), { home, depth: -1.2 })
  s.speed *= 0.6
  return s
}

function setupPlace(name) {
  game.place = name
  store.set('fish-pond-place', name)
  world.setPlace(name)
  audio.setPlace(name)
  creatures.clear()
  for (const id of AMBIENT[name]) spawnAmbient(id)
  // Each shore downloads only when its place is first chosen
  loadShore(PLACES[name].shore)
  // Jellyfish glow brighter in the dark
  creatures.templates.jellyfish?.traverse((o) => {
    if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = PLACES[name].night ? 3 : 1
  })
}

// --- Bear ---------------------------------------------------------------------------

const bear = { yaw: 0, wave: 0, cheer: 0 }
const tmp = new THREE.Vector3()
function updateBear(dt, t) {
  const b = world.bear
  if (!b) return
  let want = Math.sin(t * 0.4) * 0.15
  const ph = game.phase
  if (game.state === 'play' && (ph === 'cast' || ph === 'wait' || ph === 'bite')) {
    const aim = ph === 'cast' ? castSpot : bob.pos
    want = Math.atan2(aim.x - RIG.x, aim.z - RIG.z)
  }
  want = clamp(want, -1.25, 1.25)
  bear.yaw = damp(bear.yaw, want, 5, dt)
  b.rotation.y = bear.yaw
  if (world.boat) world.boat.rotation.y = 0.5 + bear.yaw * 0.15
  const cheering = ph === 'show' || ph === 'toBook'
  bear.cheer = damp(bear.cheer, cheering ? 1 : 0, 6, dt)
  bear.wave = Math.max(0, bear.wave - dt)
  const baseY = PLACES[game.place].ice ? 0.46 : 0.22
  b.position.y = baseY + Math.abs(Math.sin(t * 3)) * 0.05 * bear.cheer
  if (world.head) {
    world.head.rotation.y = -bear.yaw * 0.55 + Math.sin(t * 0.7) * 0.08
    world.head.rotation.x = ph === 'bite' ? 0.18 : ph === 'wait' ? 0.1 : -0.1 * bear.cheer
    world.head.rotation.z = Math.sin(t * 0.9) * 0.06 + Math.sin(t * 2.5) * 0.06 * bear.cheer
  }
  if (world.armL) {
    const up = Math.max(bear.cheer, Math.min(1, bear.wave * 2))
    world.armL.rotation.z = -2.2 * up + Math.sin(t * 4) * 0.25 * up
  }
  // Rod: wind up, flick, wait, dip on a bite, yank on a catch
  if (world.rod) {
    let rx = -0.15
    let rz = 0
    if (ph === 'cast') {
      const k = game.phaseT
      rx = k < 0.28 ? lerp(-0.15, -0.95, ease(k / 0.28)) : lerp(-0.95, 0.35, ease(Math.min(1, (k - 0.28) / 0.18)))
    } else if (ph === 'wait') rx = 0.3 - bob.dip * 0.8
    else if (ph === 'bite') {
      rx = 0.55 + Math.sin(t * 30) * 0.06
      rz = Math.sin(t * 23) * 0.05
    } else if (ph === 'catch') rx = -0.9
    else if (cheering) rx = -0.6
    world.rod.rotation.x = damp(world.rod.rotation.x, rx, ph === 'cast' || ph === 'catch' ? 30 : 8, dt)
    world.rod.rotation.z = rz
  }
  if (world.reel && (ph === 'catch' || ph === 'cast')) world.reel.rotation.x += dt * 25
}

// --- Bobber per frame --------------------------------------------------------------------

function updateBobber(dt, t) {
  world.rodTipWorld(tip)
  const ph = game.phase
  let sag = 0.3
  bob.dip = Math.max(0, bob.dip - dt * 0.5)
  bob.shake = Math.max(0, bob.shake - dt * 0.3)
  if (ph === 'cast' && bob.fly) {
    const f = bob.fly
    if (game.phaseT < 0.3) {
      // Still on the rod while it winds up
      bob.pos.copy(tip).y -= 0.55
    } else {
      if (f.t === 0) f.from.copy(bob.pos)
      f.t += dt / f.dur
      const e = Math.min(1, f.t)
      bob.pos.lerpVectors(f.from, f.to, e)
      bob.pos.y += Math.sin(e * Math.PI) * 2.2
      sag = 0.05
      if (e >= 1) {
        bob.fly = null
        landed()
      }
    }
  } else if (ph === 'wait' || ph === 'bite') {
    bob.pos.x = castSpot.x
    bob.pos.z = castSpot.z
    let y = Math.sin(t * 2.4) * 0.035 - bob.dip * 1.4
    if (ph === 'bite') {
      y = -0.3 + Math.sin(t * 25) * 0.05
      bob.pos.x += Math.sin(t * 31) * 0.05
      sag = 0.0
    }
    bob.pos.y = damp(bob.pos.y, y, ph === 'bite' ? 20 : 12, dt)
    sag = ph === 'bite' ? 0.0 : 0.35
  } else if (ph === 'catch') {
    sag = 0.02
  } else {
    // Hanging from the rod tip, swinging a little
    bob.swing += dt
    const hang = tmp.copy(tip)
    hang.x += Math.sin(t * 1.7) * 0.06
    hang.z += Math.cos(t * 1.3) * 0.06
    hang.y -= 0.55
    if (ph === 'show' || ph === 'toBook' || bob.pos.distanceTo(hang) > 3) bob.pos.lerp(hang, Math.min(1, dt * 6))
    else bob.pos.lerp(hang, Math.min(1, dt * 12))
    sag = 0.02
  }
  bob.group.position.copy(bob.pos)
  bob.group.rotation.z = ph === 'bite' ? Math.sin(t * 20) * 0.25 : Math.sin(t * 1.9) * 0.08
  updateLine(sag)
}

// --- HUD & screens ---------------------------------------------------------------------

function updateHud() {
  $('count').textContent = `${caughtKinds()}/${CREATURES.length}`
  $('title-count').textContent = `${caughtKinds()}/${CREATURES.length}`
}

const bang = $('bang')
function showBang() {
  bang.classList.remove('hidden')
}
function hideBang() {
  bang.classList.add('hidden')
}
function updateBang() {
  if (bang.classList.contains('hidden')) return
  tmp.copy(bob.pos)
  tmp.y += 0.9
  tmp.project(camera)
  bang.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px)`
}

let introTimer = 0
let introIsPlace = false
function showIntro(emoji, title, sub, place = false, prize = false) {
  introIsPlace = place
  $('intro-emoji').textContent = emoji
  $('intro-title').textContent = title
  $('intro-sub').textContent = sub
  const el = $('intro')
  el.classList.remove('show')
  el.classList.toggle('prize', prize)
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(introTimer)
  introTimer = setTimeout(() => el.classList.remove('show'), prize ? 4200 : 2800)
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play')
}

/** The pointing finger: where to tap first, then when to reel. */
const hintEl = $('hint')
let hintOn = false
function hint(on) {
  hintOn = on
  hintEl.classList.toggle('hidden', !on)
}
function updateHint() {
  if (game.state !== 'play' || book.open) return hintEl.classList.add('hidden')
  let target = null
  // First cast, or a little one who has stopped: point at the water again
  // (after the place's name card has gone, so the finger never covers its words)
  const placeCardUp = introIsPlace && $('intro').classList.contains('show')
  if (game.phase === 'show' && lookScreen.on && game.looks === 0 && fish.show.t > LOOK_FROM + 2) {
    hintEl.classList.remove('hidden')
    hintEl.style.transform = `translate(${lookScreen.x}px, ${lookScreen.y + 30}px)`
    return
  }
  if (game.phase === 'idle' && !placeCardUp && (game.casts === 0 || game.idleT > 30)) target = tmp.set(1.6, 0, 2.2)
  else if (game.phase === 'bite' && (totalCaught() < 2 || game.misses > 0)) target = tmp.copy(bob.pos).setY(0)
  if (!target) return hintEl.classList.add('hidden')
  hintEl.classList.remove('hidden')
  target.project(camera)
  hintEl.style.transform = `translate(${((target.x + 1) / 2) * innerWidth}px, ${((1 - target.y) / 2) * innerHeight}px)`
}

function toTitle() {
  voice.hush()
  // A catch on stage or flying to the book is already in the book (startShow). The mission count
  // needs no settling: start() begins it afresh. The 15/15 trophy card lives in the hidden HUD.
  if (fish.show) {
    fish.show.c.group.removeFromParent()
    fish.show = null
  }
  if (fish.catch && game.phase === 'catch') fish.catch.c.group.removeFromParent()
  letGo(false)
  hideBang()
  hideLook()
  $('card').className = 'card-catch'
  glow.material.opacity = 0
  stageLight.intensity = 0
  setPhase('idle')
  game.state = 'title'
  bob.state = 'hang'
  updateHud()
  markPlace()
  show('title')
}

function start(place) {
  adventure.begin()
  audio.unlock()
  audio.click()
  if (place !== game.place || game.state === 'loading') setupPlace(place)
  else audio.setPlace(place)
  game.state = 'play'
  game.casts = 0
  setPhase('idle')
  show('play')
  audio.setAmbient(true)
  updateHud()
  const P = PLACES[place]
  showIntro(P.emoji, P.name, P.ice ? 'Tap a hole to fish!' : 'Tap the water to fish!', true)
}

function markPlace() {
  for (const b of document.querySelectorAll('.place')) b.classList.toggle('last', b.dataset.place === game.place)
}

for (const b of document.querySelectorAll('.place')) {
  b.addEventListener('click', () => start(b.dataset.place))
  b.addEventListener('pointerenter', () => {
    // Peek at a place from the title screen
    if (game.state === 'title' && b.dataset.place !== game.place) {
      setupPlace(b.dataset.place)
      markPlace()
    }
  })
}
$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.click()
  toTitle()
})

const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  voice.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
  store.set('fish-pond-sound', on)
}
if (store.get('fish-pond-sound', true) === false) setSound(false)
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
function setMusic(on) {
  audio.setMusic(on)
  musicBtn.classList.toggle('off', !on)
  store.set('fish-pond-music', on)
}
setMusic(store.get('fish-pond-music', true) !== false)
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setMusic(!audio.musicOn)
  audio.click()
})

// --- Collection book ---------------------------------------------------------------

const book = new Book({
  el: $('book'),
  audio,
  voice,
  creatures,
  getBook: () => game.book,
})
const openBook = (e) => {
  e?.stopPropagation()
  audio.unlock()
  audio.click()
  if (game.phase === 'show') finishShow()
  book.show()
}
$('book-btn').addEventListener('click', openBook)
$('title-book').addEventListener('click', openBook)

// --- Input ------------------------------------------------------------------------

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.6, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
)
marker.renderOrder = 4
marker.visible = false
scene.add(marker)
const keyAim = new THREE.Vector3(1.5, 0, 2)
let keysUsed = false

function tapAt(x, y) {
  audio.unlock()
  if (game.state !== 'play' || book.open) return
  game.idleT = 0
  const ph = game.phase
  if (ph === 'bite') return reel()
  if (ph === 'show') {
    // A tap close to the glow counts as looking closer; anywhere else carries on
    if (lookScreen.on && Math.hypot(x - lookScreen.x, y - lookScreen.y) < 90) return lookCloser()
    if (fish.show.t > 0.7) finishShow()
    return
  }
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const poked = world.poke(ray)
  if (poked === 'sky') {
    audio.giggle()
    return
  }
  if (poked === 'bear' && ph === 'idle') {
    bear.wave = 1.5
    audio.giggle()
    effects.label('💕', tmp.copy(RIG).setY(4), { cls: 'emoji' })
    return
  }
  if (ph !== 'idle' && ph !== 'wait') return
  const p = ray.ray.intersectPlane(waterPlane, hitP)
  // Tapping the sky casts as far as the line can go
  const target = p ? p.clone() : new THREE.Vector3(((x / innerWidth) * 2 - 1) * 4, 0, bounds.zMin)
  if (ph === 'wait') {
    // A tap right by the bobber just wiggles it: wait for the "!"
    tmp.copy(bob.pos).project(camera)
    const sx = ((tmp.x + 1) / 2) * innerWidth
    const sy = ((1 - tmp.y) / 2) * innerHeight
    if (Math.hypot(sx - x, sy - y) < Math.max(70, innerWidth * 0.08) || PLACES[game.place].ice && world.nearestHole(target).distanceTo(castSpot) < 0.1) {
      bob.dip = 0.06
      effects.ripple(bob.pos, 0.5, 0.5)
      return
    }
  }
  castTo(target)
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  tapAt(e.clientX, e.clientY)
})
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

const keys = new Set()
addEventListener('keydown', (e) => {
  audio.unlock()
  const k = e.key.toLowerCase()
  if (book.open) {
    if (k === 'escape' || k === 'b' || k === ' ' || k === 'enter') {
      e.preventDefault()
      book.hide()
    }
    return
  }
  if (k === 'escape' && game.state === 'play') return toTitle()
  if (game.state === 'title' && (k === 'enter' || k === ' ')) {
    e.preventDefault()
    return start(game.place)
  }
  if (game.state !== 'play') return
  if (k === 'b') return openBook()
  if (k === 'l') return lookCloser()
  if (k === ' ' || k === 'enter') {
    e.preventDefault()
    if (e.repeat) return
    const ph = game.phase
    if (ph === 'bite') return reel()
    // Enter looks closer when there is something to look at; Space carries on
    if (ph === 'show' && k === 'enter' && fish.show.look && !fish.show.looked) return lookCloser()
    if (ph === 'show') return fish.show.t > 0.5 && finishShow()
    if (ph === 'idle' || (ph === 'wait' && keysUsed && keyAim.distanceTo(castSpot) > 1)) {
      if (!keysUsed) keyAim.copy(castTarget(new THREE.Vector3(rand(-3, 3), 0, rand(0, 4))))
      castTo(keyAim)
    }
    return
  }
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
    e.preventDefault()
    keys.add(k)
    if (!keysUsed) keyAim.copy(castTarget(keyAim))
    keysUsed = true
  }
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())

function updateMarker(dt, t) {
  const on = keysUsed && game.state === 'play' && (game.phase === 'idle' || game.phase === 'wait') && !book.open
  marker.visible = on
  if (!on) return
  const sp = 5 * dt
  if (keys.has('arrowleft') || keys.has('a')) keyAim.x -= sp
  if (keys.has('arrowright') || keys.has('d')) keyAim.x += sp
  if (keys.has('arrowup') || keys.has('w')) keyAim.z -= sp
  if (keys.has('arrowdown') || keys.has('s')) keyAim.z += sp
  if (keys.size) {
    keyAim.z = clamp(keyAim.z, bounds.zMin, bounds.zMax - 0.4)
    const w = bounds.halfAt(keyAim.z) - 0.8
    keyAim.x = clamp(keyAim.x, -w, w)
  }
  const shown = PLACES[game.place].ice ? world.nearestHole(keyAim) : keyAim
  marker.position.set(shown.x, 0.06, shown.z)
  marker.scale.setScalar(1 + Math.sin(t * 5) * 0.08)
}

// --- Loading ------------------------------------------------------------------------

const loader = new GLTFLoader()
const shoreLoads = {}
function loadShore(name) {
  if (!shoreLoads[name]) {
    shoreLoads[name] = loader.loadAsync(`./models/${name}.glb`).then(
      (g) => world.attachShore(name, g),
      (err) => console.warn(`${name}.glb failed`, err),
    )
  }
  return shoreLoads[name]
}

async function load() {
  let done = 0
  const step = () => ($('loading-text').textContent = `Filling the pond… ${++done}/3`)
  const [c, w] = await Promise.allSettled([
    loader.loadAsync('./models/creatures.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/world.glb').then((g) => (step(), g)),
    loadShore(PLACES[game.place].shore).then(step),
  ])
  if (c.status === 'fulfilled') creatures.attach(c.value)
  else console.warn('creatures.glb failed', c.reason)
  if (w.status === 'fulfilled') world.attach(w.value)
  else console.warn('world.glb failed', w.reason)
  const bobberModel = world.bobberModel
  if (bobberModel) {
    bobberModel.position.set(0, 0, 0)
    bob.group.add(bobberModel)
  } else bob.group.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), new THREE.MeshStandardMaterial({ color: '#ff3b4f' })))
  bob.group.scale.setScalar(1.5)
  setupPlace(game.place)
  resize()
  // Warm up every creature so the first catch doesn't stutter
  const warm = CREATURES.map((cr) => {
    const m = creatures.make(cr.id)
    m.group.position.set(0, -1, 0)
    scene.add(m.group)
    return m.group
  })
  renderer.compile(scene, camera)
  for (const g of warm) g.removeFromParent()
  book.build()
  updateHud()
  markPlace()
  game.state = 'title'
  show('title')
}

// --- Loop -----------------------------------------------------------------------------

addEventListener('resize', resize)
resize()

const timer = new THREE.Timer()
timer.connect(document)
let clock = 0

function frame(dt, draw = true) {
  clock += dt
  const t = clock
  if (game.state !== 'loading') {
    game.phaseT += dt
    const ph = game.phase
    if (game.state === 'play') {
      game.idleT = ph === 'idle' && !book.open ? game.idleT + dt : 0
      if (ph === 'cast' && !bob.fly && game.phaseT > 1) setPhase('idle')
      if (ph === 'wait') updateWait(dt, t)
      else if (ph === 'bite') updateBite(dt)
      else if (ph === 'catch') updateCatch(dt)
      else if (ph === 'show') updateShow(dt, t)
      else if (ph === 'toBook') updateToBook(dt)
    }
    creatures.update(dt, t)
    for (const s of creatures.swimmers) {
      if (s.nudge > 0) {
        s.nudge -= dt
        s.group.position.x += Math.cos(s.heading) * s.nudge * 0.4
        s.group.position.z -= Math.sin(s.heading) * s.nudge * 0.4
      }
      if (game.phase === 'bite' && s === fish.who) s.group.rotation.z = Math.sin(t * 30) * 0.15
    }
    updateBear(dt, t)
    updateBobber(dt, t)
  }
  updateView(dt)
  world.update(dt, t, effects)
  effects.update(dt, t)
  updateBang()
  updateHint()
  updateMarker(dt, t)
  audio.updateMusic(game.state !== 'loading')
  audio.updateAmbient(dt, game.state !== 'loading')
  const sh = effects.shake * effects.shake * 0.4
  camera.position.set(camBase.x + (Math.random() - 0.5) * sh, camBase.y + (Math.random() - 0.5) * sh, camBase.z)
  if (draw) renderer.render(scene, camera)
}

renderer.setAnimationLoop(() => {
  timer.update()
  frame(Math.min(timer.getDelta(), 1 / 20))
})

show('loading')
load()

// ?debug: poke at the game from the console, and step time in a hidden tab
if (new URLSearchParams(location.search).has('debug')) {
  window.fishPond = {
    game, fish, creatures, world, bob, castTo, reel, tapAt, start, debug,
    advance(seconds) {
      const n = Math.round(seconds * 30)
      for (let i = 0; i < n; i++) frame(1 / 30, i === n - 1)
    },
  }
  window.__adventure = { mission: adventure, game }
}
