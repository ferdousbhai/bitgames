import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { Audio } from './audio.js'
import { AMBIENT, BY_ID, CREATURES, Creatures, SWIM_SCALE, roll } from './creatures.js'
import { Effects, softDot } from './effects.js'
import { PLACES, RIG, World } from './world.js'
import { Book } from './book.js'

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
const world = new World(scene, camera, renderer)
const creatures = new Creatures(scene)
const effects = new Effects(scene, camera)

// --- Game state -------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | play
  place: PLACES[store.get('fish-pond-place', 'lake')] ? store.get('fish-pond-place', 'lake') : 'lake',
  phase: 'idle', // idle | cast | wait | bite | catch | show | toBook
  book: store.get('fish-pond-book', {}),
  // The big ones and shiny ones found of each creature: { id: { big: 1, shiny: 1 } } (book.js badges)
  extra: store.get('fish-pond-extra', {}),
  // Places whose every creature is in the book (a 🏆 on their title button)
  done: store.get('fish-pond-done', []),
  luck: store.get('fish-pond-luck', 0),
  casts: 0,
  phaseT: 0,
  misses: 0,
  idleT: 0,
}
if (typeof game.book !== 'object' || !game.book) game.book = {}
if (typeof game.extra !== 'object' || !game.extra) game.extra = {}
if (!Array.isArray(game.done)) game.done = []
// Saved by the old riddles, missions and look-closer facts (removed 2026-10-16)
// and by the old saved sound and music switches (sound and music now start on with every visit)
for (const key of ['fish-pond-best', 'fish-pond-tier', 'fish-pond-list', 'fish-pond-looks', 'fish-pond-sorted', 'fish-pond:adventure', 'fish-pond-sound', 'fish-pond-music']) {
  try {
    localStorage.removeItem(key)
  } catch {}
}
const debug = { force: null, variant: null } // variant: 'giant' or 'shiny' for the next catch
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
  placeSnailPad()
  // Short screens: lift the show-off so the name card fits underneath
  stage.position.y = h < 560 ? 0.55 : 0.15
}

/** Where a point on the screen meets the water (for the visible bounds, casting and taps). */
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

const fish = {
  pick: null, // the creature info coming to bite
  who: null, // its swimmer (or a bubble "ghost" for things in the deep)
  aim: null, // the swimmer the child cast at
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

function castTo(point, chosen = null) {
  if (game.phase !== 'idle' && game.phase !== 'wait') return
  if (game.phase === 'wait') letGo(false)
  castSpot.copy(castTarget(point))
  // The swimmer the child aimed at is the one who comes, even if it drifts a little while the line flies.
  // A tap on a swimmer's body chooses it (pickAt); otherwise aim from where the child tapped, not where
  // the bobber lands: at the ice the line snaps to the nearest hole, and the swimmer tapped swims over to it.
  // A cast into the bubbling patch brings up one of the rare finds instead of a swimmer
  fish.rare = !!patch && Math.hypot(castSpot.x - patch.pos.x, castSpot.z - patch.pos.z) < PATCH_R
  fish.aim = fish.rare ? null : chosen ?? nearestSwimmer(point, CHOOSE_R) ?? nearestSwimmer(castSpot, PLACES[game.place].ice ? CHOOSE_R + 0.8 : CHOOSE_R)
  if (fish.rare) patch.until = Math.min(patch.until, clock + 0.8)
  setPhase('cast')
  game.casts++
  bob.fly = { from: new THREE.Vector3(), to: castSpot.clone(), t: 0, dur: 0.6 }
  audio.cast()
  game.idleT = 0
}

/** The bobber lands: something will come and have a look soon. */
function landed() {
  bob.state = 'float'
  bob.pos.copy(castSpot)
  effects.plop(castSpot)
  audio.plop()
  setPhase('wait')
  fish.timer = rand(0.2, 0.4)
  fish.pick = null
  fish.who = null
}

/** Pick who bites and send them over. */
function sendBiter() {
  // Where you cast is the choice: a swimmer right by the bobber is the one who comes to look.
  // Open water far from everyone brings a surprise from the deep (the rare finds live there).
  const aim = fish.aim
  fish.aim = null
  const rare = fish.rare
  fish.rare = false
  const near = debug.force || rare ? null : aim && aim.mode === 'wander' && creatures.swimmers.includes(aim) ? aim : nearestSwimmer(bob.pos, CHOOSE_R)
  const pick = near ? near.info : BY_ID[debug.force] ?? (rare ? rareFind() : roll(game.place, game.book, game.luck))
  fish.pick = pick
  // A bob to watch before the real bite: one for the swimmer you chose, two for a surprise
  fish.nibbles = near ? 1 : 2
  fish.nibbleT = 0
  const spot = bob.pos
  if (near) {
    near.mode = 'approach'
    fish.who = near
    return
  }
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
    fish.who = { ghost: true, pos: away(3).setY(-1.6), bubbleIn: 0 }
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
    fish.who = creatures.spawnSwimmer(pick.id, away(3.2), { mode: 'approach', y: -1.9, depth: -0.8 })
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

/** How close to a swimmer a cast must land for that swimmer to be the one who bites (a little more at the ice holes). */
const CHOOSE_R = 2.6
function nearestSwimmer(p, r, ok = () => true) {
  let best = null
  let bd = r
  for (const s of creatures.swimmers) {
    if (s.mode !== 'wander' || s.spawned || !ok(s)) continue
    const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best
}

/**
 * The swimmer whose body is under the finger. Swimmers sit below the water, so a tap on one meets the
 * water plane nearer the boat than the swimmer really is: picking on the screen, by each swimmer's own
 * drawn size, means a tap on the frog's body brings the frog, even with the trout swimming close by.
 */
const pickP = new THREE.Vector3()
const pickE = new THREE.Vector3()
function pickAt(x, y) {
  let best = null
  let bd = Infinity
  for (const s of creatures.swimmers) {
    if (s.mode !== 'wander' || s.spawned) continue
    pickP.copy(s.pos).project(camera)
    if (pickP.z > 1) continue
    const sx = ((pickP.x + 1) / 2) * innerWidth
    const sy = ((1 - pickP.y) / 2) * innerHeight
    // Its drawn half-length in pixels, from a point half a body away
    pickE.copy(s.pos).addScaledVector(camRight, s.info.size * SWIM_SCALE * 0.5).project(camera)
    const r = Math.max(34, Math.abs(((pickE.x + 1) / 2) * innerWidth - sx))
    const d = Math.hypot(x - sx, y - sy) / r // under 1 is on its body
    if (d < 1.5 && d < bd) {
      bd = d
      best = s
    }
  }
  return best
}
const camRight = new THREE.Vector3(1, 0, 0)

/** Whoever was coming swims off (a giggle and a ripple if they got away: no teasing). */
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
    effects.ripple(bob.pos, 1.0, 0.6)
    effects.bubble(new THREE.Vector3(w.pos.x, w.pos.y + 0.2, w.pos.z), 6, 0.3)
    audio.giggle()
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
      w.pos.x += ((spot.x - w.pos.x) / d) * Math.min(d, dt * 3.4)
      w.pos.z += ((spot.z - w.pos.z) / d) * Math.min(d, dt * 3.4)
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
    // A swimmer that can't turn tightly enough to reach the bobber turns harder, then simply arrives
    w.coming = (w.coming ?? 0) + dt
    const d = creatures.steer(w, spot, dt, w.id === 'whale' ? 2.4 : w.id === 'snail' ? 2.2 : 3.6, w.coming > 2 ? 9 : 5.5)
    const depth = w.info.how === 'surface' ? 0.02 : w.id === 'whale' ? -1.5 : -0.45
    w.pos.y += (depth - w.pos.y) * Math.min(1, dt * 2.6)
    if (d < reach || w.coming > 5) {
      w.coming = 0
      w.mode = 'nibble'
      fish.nibbleT = 0.25
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
    fish.nibbleT = rand(0.4, 0.6)
    bob.dip = 0.12
    effects.ripple(bob.pos, 0.6, 0.6)
    audio.nibble()
    if (fish.who && !fish.who.ghost) fish.who.nudge = 0.25
    return
  }
  bite()
}

/** Bite window in seconds: long enough to see the bobber go under and tap, with no rush. */
const BITE_WINDOW = 4.5

function bite() {
  setPhase('bite')
  // More time after a miss, and for a brand-new player
  fish.window = BITE_WINDOW + Math.min(1.5, game.misses * 0.5) + (totalCaught() < 3 ? 0.6 : 0)
  bob.shake = 1
  audio.bite()
  effects.ripple(bob.pos, 1.4, 0.8)
  effects.ripple(bob.pos, 0.8, 0.5)
  effects.splash(bob.pos, 0.35)
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

/** Tap during the bite: a short tug-of-war at the bobber, then it leaps out of the water. */
const TUG = 0.5
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
    creatures.vivid(w.group, false)
    c = w
  } else {
    c = creatures.make(pick.id, pick.size * SWIM_SCALE)
    c.group.position.set(bob.pos.x, -0.4, bob.pos.z)
    scene.add(c.group)
  }
  // A repeat catch may be a big one (or the sparkly swimmer is a shiny one): something fresh to see
  const seen = Number(game.book[pick.id]) > 0
  const shiny = debug.variant === 'shiny' || !!w?.shiny || (seen && (!w || w.ghost || w.spawned) && Math.random() < 0.1)
  const giant = debug.variant === 'giant' || (!shiny && seen && pick.id !== 'whale' && Math.random() < (game.extra[pick.id]?.big ? 0.2 : 0.35))
  debug.variant = null
  if (shiny && !w?.shiny) shine(c.group)
  // The whale stays big as it leaps
  const big = (pick.id === 'whale' ? 2 : pick.stars >= 3 ? 1.5 : 1) * (giant ? 1.6 : 1)
  effects.splash(bob.pos, 0.6)
  audio.reel()
  audio.tug()
  try {
    navigator.vibrate?.([30, 40, 30])
  } catch {}
  if (shiny && w?.shiny) shine(c.group)
  fish.catch = { c, pick, big, giant, shiny, from: c.group.position.clone(), t: 0, dur: 0.95, startScale: c.group.scale.x, spin: rand(-1, 1) > 0 ? 1 : -1, leapt: false }
  setPhase('catch')
}

const stageWorld = new THREE.Vector3()
/** Scratch vectors for effects around the stage, so the show allocates nothing per frame. */
const stageFx = new THREE.Vector3()
const stageVel = new THREE.Vector3()
function updateCatch(dt, t) {
  const k = fish.catch
  k.t += dt
  const g = k.c.group
  if (k.t < TUG) {
    // The tug: it thrashes at the bobber, spraying drops, while Bear's rod bends
    g.position.copy(k.from)
    g.position.x += Math.sin(t * 31) * 0.12
    g.position.y = Math.max(k.from.y, -0.5) + Math.abs(Math.sin(t * 17)) * 0.18
    g.rotation.z = Math.sin(t * 23) * 0.35
    bob.pos.set(k.from.x + Math.sin(t * 29) * 0.15, -0.2 + Math.sin(t * 19) * 0.08, k.from.z)
    if (Math.random() < dt * 30) effects.drops.spawn(stageFx.set(k.from.x + rand(-0.4, 0.4), 0.05, k.from.z + rand(-0.4, 0.4)), stageVel.set(rand(-1.5, 1.5), rand(2, 4), rand(-1.5, 1.5)), { life: 0.8, size: rand(0.05, 0.1), color: '#e6f8ff' })
    if (Math.random() < dt * 8) effects.ripple(bob.pos, 0.8, 0.5)
    return
  }
  if (!k.leapt) {
    // Out it comes!
    k.leapt = true
    k.from.copy(g.position)
    effects.splash(bob.pos, k.big)
    audio.splash(k.big > 1 ? 1.3 : 1)
    if (k.giant) {
      audio.bigOne()
      effects.shake = 0.5
    }
  }
  const e = Math.min(1, (k.t - TUG) / k.dur)
  stage.getWorldPosition(stageWorld)
  const sm = e * e * (3 - 2 * e)
  g.position.lerpVectors(k.from, stageWorld, sm)
  g.position.y += Math.sin(e * Math.PI) * 2.6
  g.rotation.set(0, k.c.heading ?? 0, 0)
  g.rotation.y += k.spin * e * Math.PI * 2
  g.rotation.z = Math.sin(e * Math.PI) * 0.5 * k.spin
  const end = stageScale() * k.c.unit * showSize(k.pick.id) * (k.giant ? GIANT : 1)
  g.scale.setScalar(lerp(k.startScale, end, sm))
  // The bobber comes along on the line
  bob.pos.copy(g.position).y -= 0.2
  if (e >= 1) startShow()
}

/** The soft moment for a catch or a prize: a few slow bubbles rising behind the stage. */
function softMoment(n = 8) {
  stage.getWorldPosition(stageWorld)
  for (let i = 0; i < n; i++) effects.bubble(stageFx.set(rand(-1.4, 1.4), rand(-0.8, 0.2), -1.2).add(stageWorld), 1, 0.3)
}

/** In portrait the crayfish's long feelers would run off the side and cover Bear, so it shows smaller. */
const showSize = (id) => (id === 'crayfish' && innerWidth < innerHeight ? 0.9 : SHOW_SIZE[id] ?? 1)
/** Shown a little lower (in stage units), so the crayfish's bulk and the cod's back fins sit clear of Bear's face. */
const SHOW_DROP = { cod: -0.5, crayfish: -0.45 }
const SHOW_SIZE = { chest: 0.78, pufferfish: 0.85, boot: 0.9, duck: 0.9, frog: 0.8, crayfish: 1.15, snail: 0.85, octopus: 1.15 }

/** Seconds a catch shows off before it flies into the book (each tickle adds a little, up to SHOW_MAX). */
const SHOW_TIME = 3.8
const SHOW_MAX = 6.5
const newStar = $('new-star')

/** How much bigger a big one shows off. */
const GIANT = 1.38

function startShow() {
  const { c, pick, giant, shiny } = fish.catch
  stage.attach(c.group)
  c.group.position.set(0, 0, 0)
  const before = Number(game.book[pick.id]) || 0
  game.book[pick.id] = before + 1
  store.set('fish-pond-book', game.book)
  game.luck = pick.stars === 3 ? 0 : game.luck + 1
  store.set('fish-pond-luck', game.luck)
  const isNew = before === 0
  // A first big one or shiny one earns its badge in the book
  const badge = (giant && !game.extra[pick.id]?.big) || (shiny && !game.extra[pick.id]?.shiny)
  if (giant || shiny) {
    game.extra[pick.id] = { ...game.extra[pick.id], ...(giant ? { big: 1 } : {}), ...(shiny ? { shiny: 1 } : {}) }
    store.set('fish-pond-extra', game.extra)
  }
  const placeDone = !game.done.includes(game.place) && CREATURES.every((x) => !x.places[game.place] || game.book[x.id] > 0)
  if (placeDone) {
    game.done.push(game.place)
    store.set('fish-pond-done', game.done)
  }
  fish.show = { c, pick, t: 0, until: SHOW_TIME + (giant || shiny ? 1 : 0), tickle: 0, tickles: 0, isNew, giant, shiny, puffed: false, placeDone, all: isNew && caughtKinds() === CREATURES.length }
  // A plain repeat still arrives with a trick: a cartwheel or a happy shake
  if (!isNew && !giant && !shiny) {
    fish.show.tickle = 1
    fish.show.tickles = Math.random() < 0.5 ? 3 : 1
  }
  setPhase('show')
  bob.state = 'hang'
  // A new one for the book gets a gold star sticker, a first big one a medal, a first shiny one sparkles (no words)
  newStar.classList.remove('show')
  if (isNew || badge) {
    newStar.textContent = isNew ? '⭐' : shiny ? '✨' : '🏅'
    void newStar.offsetWidth
    newStar.classList.add('show')
  }
  audio.fanfare(pick.stars + (giant || shiny ? 1 : 0))
  if (isNew || badge) audio.newOne(0.55)
  if (shiny) audio.sparkle(0.3)
  softMoment(isNew ? 12 : 8)
  if (pick.stars >= 3) for (let i = 0; i < 3; i++) effects.sparkleAt(stageFx.set(rand(-1.2, 1.2), rand(-0.4, 0.8), 0.4).add(stageWorld), '#fff3a0', 3, 1.6, 0.35)
  stageLight.intensity = 6
}

/** A tap on the catch while it shows off: it jumps and squeaks (the duck quacks, the puffer puffs again). */
function tickle() {
  const s = fish.show
  if (!s || game.phase !== 'show') return
  s.tickle = 1
  s.tickles++
  s.until = Math.min(SHOW_MAX, Math.max(s.until, s.t + 1.6))
  const id = s.pick.id
  if (id === 'duck') audio.quack()
  else if (id === 'pufferfish') {
    s.puffed = false
    s.puffAt = s.t
  } else if (id === 'whale') {
    s.spoutAt = s.t
    audio.whale()
  } else audio.boing(1.25 - Math.min(0.6, s.pick.size * 0.25) + (s.tickles % 3) * 0.12)
  stage.getWorldPosition(stageWorld)
  effects.bubble(stageFx.set(rand(-0.5, 0.5), rand(-0.4, 0.2), 0.2).add(stageWorld), 4, 0.5)
  if (id === 'chest' || id === 'goldenfish') effects.sparkleAt(stageFx.set(0, 0.4, 0.4).add(stageWorld), '#ffe066', 6, 2.2, 0.35)
}

const tickleP = new THREE.Vector3()
/** Is a tap at (x, y) on the creature showing off? */
function onShowCreature(x, y) {
  stage.getWorldPosition(tickleP).project(camera)
  const sx = ((tickleP.x + 1) / 2) * innerWidth
  const sy = ((1 - tickleP.y) / 2) * innerHeight
  return Math.hypot(x - sx, y - sy) < Math.min(innerWidth, innerHeight) * 0.24
}

function updateShow(dt, t) {
  const s = fish.show
  s.t += dt
  s.tickle = Math.max(0, s.tickle - dt * 2.2)
  const g = s.c.group
  const base = stageScale() * s.c.unit * showSize(s.pick.id) * (s.giant ? GIANT : 1)
  const pop = s.t < 0.5 ? 1 + Math.sin((s.t / 0.5) * Math.PI) * 0.15 : 1
  // A tickle squashes and stretches it, like a jelly
  const jig = Math.sin((1 - s.tickle) * Math.PI * 3) * s.tickle * 0.18
  let scale = base * pop
  const id = s.pick.id
  // Each creature shows off in its own way
  if (id === 'pufferfish') {
    const from = s.puffAt ?? 0
    const k = clamp((s.t - from - (s.puffAt == null ? 0.6 : 0.05)) / 0.35, 0, 1)
    if (k > 0 && !s.puffed) {
      s.puffed = true
      audio.puff()
    }
    const deflate = s.puffAt == null ? 1 : clamp((s.t - from) / 0.15, 0, 1)
    const puff = 1 + 0.32 * ease(k) * deflate + (k >= 1 ? Math.sin(s.t * 6) * 0.03 : Math.sin(k * Math.PI) * 0.12)
    scale *= puff
    if (s.c.parts.spikes) s.c.parts.spikes.scale.setScalar(1 + 0.12 * ease(k))
  }
  if (id === 'chest' && s.c.parts.lid) {
    const k = clamp((s.t - 0.5) / 0.4, 0, 1)
    if (k > 0 && !s.opened) {
      s.opened = true
      audio.creak()
    }
    s.c.parts.lid.rotation.z = ease(k) * 1.3 + s.tickle * 0.3
    if (k > 0 && Math.random() < dt * 6) effects.sparkleAt(stageFx.set(rand(-0.6, 0.6), 0.6, 0.4).add(stageWorld), '#ffe066', 1, 2.5, 0.35)
  }
  if (s.shiny && Math.random() < dt * 7) effects.sparkleAt(stageFx.set(rand(-1.1, 1.1), rand(-0.7, 0.7), 0.5).add(stageWorld), Math.random() < 0.5 ? '#fff3a0' : '#bff4ff', 1, 1.0, 0.22)
  if (id === 'goldenfish' && Math.random() < dt * 5) effects.sparkleAt(stageFx.set(rand(-1, 1), rand(-0.6, 0.6), 0.5).add(stageWorld), '#fff3a0', 1, 1, 0.3)
  const spout = s.t - (s.spoutAt ?? 0)
  if (id === 'whale' && spout > 0.4 && spout < 2.2 && Math.random() < dt * 40) {
    // The spout sits on top of the whale
    const p = stageFx.set(0.2, 0.55, 0.3).multiplyScalar(base / s.c.unit).add(stageWorld)
    effects.drops.spawn(p, stageVel.set(rand(-0.8, 0.8), rand(3, 5), rand(-0.3, 0.6)), { life: 1.2, size: rand(0.05, 0.1), color: '#d9f3ff' })
  }
  if (id === 'jellyfish') scale *= 1 + Math.sin(s.t * 5) * 0.05
  g.scale.set(scale * (1 + jig), scale * (1 - jig), scale * (1 + jig))
  // A happy wiggle, turned so you can see its face
  // The octopus faces you square on: its arms fan round it like a star, so all eight tips show, clear of its face
  // The crayfish turns a little side-on, so its big claws reach out to the side instead of pointing at you
  const face = id === 'octopus' ? -1.45 : id === 'crayfish' ? -0.6 : id === 'pufferfish' || id === 'jellyfish' || id === 'duck' || id === 'chest' || id === 'boot' || id === 'crab' || id === 'frog' ? -1.05 : -0.45
  const sway = id === 'octopus' ? 0.2 : 0.35
  const hop = Math.sin(s.tickle * Math.PI) * 0.45
  // A tickle makes it jump and shake with giggles; every third one it does a happy flip
  const flip = s.tickles % 3 === 0 && s.tickles ? (1 - s.tickle) * Math.PI * 2 * (s.tickle > 0 ? 1 : 0) : 0
  g.rotation.set(Math.sin(s.t * 2.2) * 0.12, face + Math.sin(s.t * 1.6) * sway, Math.sin(s.t * 3.1) * 0.08 + Math.sin(s.tickle * Math.PI * 5) * 0.35 * s.tickle + flip)
  g.position.y = Math.sin(s.t * 2.8) * 0.08 + hop + (SHOW_DROP[id] ?? 0) * Math.min(1, s.t * 2)
  if (s.c.parts.tail) s.c.parts.tail.rotation[id === 'whale' || id === 'narwhal' ? 'z' : 'y'] = Math.sin(s.t * (6 + s.tickle * 10)) * 0.5
  // A still, soft glow behind the catch (no spinning rays)
  glow.material.opacity = Math.min(1, s.t * 3) * 0.4
  glow.material.color.set(s.pick.stars >= 3 ? '#ffe680' : '#fffbe6')
  if (s.t > s.until) finishShow()
}

/** The creature flies into the book. */
function finishShow() {
  const s = fish.show
  if (!s || game.phase !== 'show') return
  setPhase('toBook')
  newStar.classList.remove('show')
  const r = $('book-btn').getBoundingClientRect()
  const p = new THREE.Vector3(((r.left + r.width / 2) / innerWidth) * 2 - 1, -((r.top + r.height / 2) / innerHeight) * 2 + 1, 0.5).unproject(camera)
  const dir = p.sub(camera.position).normalize()
  const target = camera.position.clone().addScaledVector(dir, 4.6)
  s.from = s.c.group.position.clone()
  s.to = stage.worldToLocal(target.clone())
  s.fromScale = s.c.group.scale.x
  s.fly = 0
  audio.whoosh()
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
  if (e < 1) return
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
  // Finding everything is the big prize: a trophy, a chord, and the full book.
  // Every creature of one place found: a trophy for that place (it stays on its title button)
  if (s.placeDone && !s.all) {
    showIntro('🏆', PLACES[game.place].emoji)
    softMoment(10)
    audio.chord()
  }
  if (s.all) {
    showIntro('🏆', `📖 ${CREATURES.length} / ${CREATURES.length}`)
    softMoment(14)
    audio.chord()
  }
}

/** A small still ring under the swimmer the child chose, while the line flies and it swims over. */
const pickRing = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.68, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
)
pickRing.renderOrder = 3
scene.add(pickRing)
function updatePickRing(dt) {
  const ph = game.phase
  const w = ph === 'cast' ? fish.aim : ph === 'wait' && fish.who && !fish.who.ghost && !fish.who.spawned ? fish.who : null
  pickRing.material.opacity = damp(pickRing.material.opacity, w ? 0.7 : 0, w ? 6 : 3, dt)
  if (w) pickRing.position.set(w.pos.x, 0.04, w.pos.z)
  pickRing.visible = pickRing.material.opacity > 0.01
}

// --- Bubbling patch ------------------------------------------------------------------------
// Now and then a patch of open water bubbles for a while. Cast into it and something rare comes up:
// the golden fish, the treasure chest, or (in the Icy Sea) the whale. No words: the bubbles invite.

const PATCH_R = 1.8
let patch = null
let patchIn = rand(14, 22)
function updatePatch(dt) {
  const playing = game.state === 'play'
  if (patch && (clock > patch.until || !playing)) {
    patch = null
    patchIn = rand(18, 30)
  }
  if (!playing) return
  if (!patch) {
    patchIn -= dt
    if (patchIn > 0 || (game.phase !== 'idle' && game.phase !== 'wait')) return
    const pos = openWater()
    if (!pos) return void (patchIn = 3)
    patch = { pos, until: clock + 9, puff: 0 }
    audio.bubbles()
  }
  patch.puff -= dt
  if (patch.puff <= 0) {
    patch.puff = 0.1
    effects.bubble(tmp.set(patch.pos.x + rand(-0.6, 0.6), -0.4, patch.pos.z + rand(-0.45, 0.45)), 3, 0.35)
    if (Math.random() < 0.5) effects.ripple(tmp.set(patch.pos.x + rand(-0.4, 0.4), 0, patch.pos.z + rand(-0.3, 0.3)), 1.1, 1.1)
    if (Math.random() < 0.12) effects.sparkleAt(tmp.set(patch.pos.x + rand(-0.5, 0.5), 0.2, patch.pos.z + rand(-0.4, 0.4)), '#fff3a0', 1, 0.6, 0.3)
  }
}

/** A spot in view, clear of the boat, the bobber and every swimmer (at the ice, one of the holes). */
function openWater() {
  for (let i = 0; i < 16; i++) {
    const z = rand(bounds.zMin + 1, bounds.zMax - 1.5)
    let p = new THREE.Vector3(rand(-1, 1) * (bounds.halfAt(z) - 1.5), 0, z)
    if (PLACES[game.place].ice) p = world.nearestHole(p).clone()
    seenP.copy(p).project(camera)
    if (Math.abs(seenP.x) > 0.8 || seenP.y < -0.8 || seenP.y > 0.6) continue
    if (p.distanceTo(RIG) < 4 || (game.phase === 'wait' && p.distanceTo(castSpot) < 3)) continue
    if (creatures.swimmers.some((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 2)) continue
    return p
  }
  return null
}

/** One of the rare (3★) finds that live here, leaning toward one not yet in the book. */
function rareFind() {
  const list = CREATURES.filter((c) => c.stars === 3 && c.places[game.place])
  const fresh = list.filter((c) => !game.book[c.id])
  const from = fresh.length && Math.random() < 0.7 ? fresh : list
  return from[(Math.random() * from.length) | 0]
}

// --- Leaping fish ------------------------------------------------------------------------
// Now and then a swimmer jumps clean out of the water with a splash: the pond feels alive, and it
// shows where the fish are. Rare enough to be a nice surprise, never a flashing call for attention.

const HOPPERS = new Set(['goldfish', 'bluefish', 'trout', 'clownfish', 'cod', 'frog', 'narwhal', 'seal', 'goldenfish', 'sunfish', 'salmon', 'catfish'])
let hopIn = 5
function updateHops(dt) {
  hopIn -= dt
  const calm = game.state === 'title' || game.phase === 'idle' || game.phase === 'wait'
  if (hopIn <= 0 && calm && !PLACES[game.place].ice) {
    hopIn = rand(6, 12)
    const pool = creatures.swimmers.filter((s) => s.mode === 'wander' && !s.spawned && !s.hop && s !== fish.aim && HOPPERS.has(s.id) && inView(s))
    const s = pool[(Math.random() * pool.length) | 0]
    if (s) s.hop = { t: 0, dur: s.id === 'narwhal' || s.id === 'seal' ? 1.2 : 0.9, splashed: 0 }
  }
  for (const s of creatures.swimmers) {
    const h = s.hop
    if (!h) continue
    if (s.mode !== 'wander') {
      s.hop = null
      continue
    }
    h.t += dt
    const k = h.t / h.dur
    if (k >= 1) {
      s.hop = null
      continue
    }
    // Up out of the water and back, nose first, and a splash going in and coming out
    // Salmon leap the highest (they jump waterfalls on the way home)
    const lift = -s.pos.y + (s.id === 'salmon' ? 2.2 : s.id === 'frog' ? 1.6 : 1.2)
    s.group.position.y = s.pos.y + Math.sin(k * Math.PI) * lift
    s.group.rotation.z = Math.cos(k * Math.PI) * 0.9
    const at = tmp.set(s.pos.x, 0, s.pos.z)
    if (h.splashed === 0 && k > 0.2) {
      h.splashed = 1
      effects.splash(at, 0.45)
      audio.blip(0.9)
    } else if (h.splashed === 1 && k > 0.82) {
      h.splashed = 2
      effects.splash(at, 0.5)
      effects.ripple(at, 1.2, 1)
      audio.plop()
    }
  }
}

const seenP = new THREE.Vector3()
/** On screen, clear of the round buttons along the top. */
function inView(s) {
  seenP.copy(s.pos).setY(0).project(camera)
  return Math.abs(seenP.x) < 0.9 && seenP.y > -0.9 && seenP.y < 0.72
}

// --- Swimmers about the place ----------------------------------------------------------

/**
 * The lily pad the pond snail lives under (real pond snails graze the green slime under lily pads).
 * It sits in plain view at the front of the water, held still even on the river, so a child who
 * knows where snails live knows where to cast. The snail creeps about under its edge, peeking out.
 */
let snailPad = null
function placeSnailPad() {
  for (const p of world.pads) p.userData.anchored = false
  snailPad = world.pads.find((p, i) => p.visible && i % 3) ?? null
  if (!snailPad) return
  const z = clamp(3.4, bounds.zMin + 2, bounds.zMax - 1.6)
  snailPad.userData.anchored = true
  snailPad.scale.setScalar(1.5)
  snailPad.position.set(-(bounds.halfAt(z) - 1.9), snailPad.position.y, z)
}

function refillAmbient() {
  // Bring back whichever kinds are missing (the one just caught, usually)
  const missing = [...(AMBIENT[game.place] ?? [])]
  for (const s of creatures.swimmers) {
    const i = s.spawned ? -1 : missing.indexOf(s.id)
    if (i >= 0) missing.splice(i, 1)
  }
  for (const id of missing) spawnAmbient(id).pos.y = -2
}

/**
 * A shiny one: the same creature with a soft golden glow (its own materials, so the others stay plain).
 * Now and then a swimmer is shiny and trails sparkles in the water, so there is something special to aim at.
 */
function shine(group) {
  group.traverse((o) => {
    if (!o.isMesh || !o.material.emissive) return
    o.material = o.material.clone()
    o.material.emissive.copy(o.material.color).lerp(SHINE, 0.35)
    o.material.emissiveIntensity = 0.22
    o.material.metalness = Math.max(o.material.metalness, 0.35)
    o.material.roughness = Math.min(o.material.roughness, 0.25)
  })
}
const SHINE = new THREE.Color('#fff1a8')
/** Chance a new swimmer (not the snail under its pad) is a shiny one. */
const SHINY_CHANCE = 0.07

function spawnAmbient(id) {
  const s = spawnHome(id)
  if (id !== 'snail' && !creatures.swimmers.some((o) => o.shiny) && Math.random() < SHINY_CHANCE) {
    s.shiny = true
    shine(s.group)
  }
  return s
}

/** One of the place's swimmers. On the reef, clownfish keep close to an anemone home. */
function spawnHome(id) {
  if (id === 'snail' && snailPad) {
    const s = creatures.spawnSwimmer(id, snailPad.position.clone().setY(0), { home: snailPad.position, depth: -0.62 })
    s.homeR = 1.1
    s.speed *= 0.35
    return s
  }
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
  placeSnailPad()
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
      rx = 0.55 + Math.sin(t * 9) * 0.05
      rz = Math.sin(t * 7) * 0.04
    } else if (ph === 'catch') {
      // Bent hard toward the water during the tug, then the big yank
      const tug = fish.catch && fish.catch.t < TUG
      rx = tug ? 0.75 + Math.sin(t * 21) * 0.12 : -0.9
      rz = tug ? Math.sin(t * 13) * 0.08 : 0
    }
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
      // A slow, steady bob under: noticeable, never a frantic jiggle
      y = -0.12 + Math.sin(t * 9) * 0.05
      bob.pos.x += Math.sin(t * 7) * 0.03
      sag = 0.0
    }
    bob.pos.y = damp(bob.pos.y, y, ph === 'bite' ? 20 : 12, dt)
    sag = ph === 'bite' ? 0.0 : 0.35
  } else if (ph === 'catch') {
    sag = fish.catch && fish.catch.t < TUG ? 0 : 0.02
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
  bob.group.rotation.z = ph === 'bite' ? Math.sin(t * 9) * 0.15 : Math.sin(t * 1.9) * 0.08
  updateLine(sag)
}

// --- HUD & screens ---------------------------------------------------------------------

function updateHud() {
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
  tmp.y += 1.0
  tmp.project(camera)
  bang.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px)`
}

/** The trophy card: a big picture and the full book, no words. */
let introTimer = 0
function showIntro(emoji, sub) {
  $('intro-emoji').textContent = emoji
  $('intro-sub').textContent = sub
  const el = $('intro')
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(introTimer)
  introTimer = setTimeout(() => el.classList.remove('show'), 4200)
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play')
}

/**
 * The pointing finger, only for someone who seems stuck: a new player who hasn't cast yet, anyone
 * idle for a while (it points at a fish), and a bite left waiting (it points at the bobber).
 */
const hintEl = $('hint')
let hintFor = null
function updateHint() {
  if (game.state !== 'play' || book.open) return hintEl.classList.add('hidden')
  let target = null
  const ph = game.phase
  const stuck = ph === 'idle' && (game.idleT > (totalCaught() < 3 && game.casts === 0 ? 2.5 : 12))
  if (!stuck) hintFor = null
  else if (!hintFor || !creatures.swimmers.includes(hintFor) || hintFor.mode !== 'wander' || !inView(hintFor)) hintFor = nearestSwimmer(RIG, 99, inView)
  if (stuck && hintFor) target = tmp.copy(hintFor.pos).setY(0)
  else if (ph === 'bite' && game.phaseT > (totalCaught() < 2 || game.misses > 0 ? 0.8 : 2.2)) target = tmp.copy(bob.pos).setY(0)
  if (!target) return hintEl.classList.add('hidden')
  hintEl.classList.remove('hidden')
  target.project(camera)
  hintEl.style.transform = `translate(${((target.x + 1) / 2) * innerWidth}px, ${((1 - target.y) / 2) * innerHeight}px)`
}

function toTitle() {
  // A catch on stage or flying to the book is already in the book (startShow)
  if (fish.show) {
    fish.show.c.group.removeFromParent()
    fish.show = null
  }
  if (fish.catch && game.phase === 'catch') fish.catch.c.group.removeFromParent()
  letGo(false)
  hideBang()
  newStar.classList.remove('show')
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
  audio.unlock()
  audio.click()
  if (place !== game.place || game.state === 'loading') setupPlace(place)
  else audio.setPlace(place)
  game.state = 'play'
  game.casts = 0
  game.idleT = 0
  setPhase('idle')
  show('play')
  audio.setAmbient(true)
  updateHud()
  // A fish says hello straight away, so the water is plainly full of things to catch
  hopIn = 1.2
}

function markPlace() {
  for (const b of document.querySelectorAll('.place')) {
    b.classList.toggle('last', b.dataset.place === game.place)
    b.classList.toggle('done', game.done.includes(b.dataset.place))
  }
}

for (const b of document.querySelectorAll('.place')) {
  b.addEventListener('click', () => start(b.dataset.place))
}
/**
 * The play buttons (home, music, sound) work by press-and-hold, so a little one mashing the screen never
 * leaves the pond or goes quiet by accident: a ring fills round the button for HOLD seconds, and a quick
 * tap only wiggles it. A keyboard press (Enter or Space on the button) acts at once, and so does Escape.
 */
const HOLD = 0.7
/**
 * Every finger down anywhere on the page. A hold starts only with one finger down in the whole page; any
 * other finger landing (a resting palm on the water, or mashing) cancels it, and no hold can start again
 * until every finger has lifted.
 */
const fingers = new Set()
const holdCancels = []
let spoiled = false
document.addEventListener('pointerdown', (e) => {
  fingers.add(e.pointerId)
  if (fingers.size > 1) {
    spoiled = true
    for (const cancel of holdCancels) cancel()
  }
}, true)
/**
 * Ghost clicks: a hold that fires while the finger is still down changes the screen (🏠 shows the title),
 * and the lift's click would land on whatever is now under the finger, such as a place button. So after a
 * hold fires, the next click is swallowed: until that finger lifts, and for half a second after.
 */
let ghostFinger = null
let swallowUntil = 0
document.addEventListener('click', (e) => {
  if (performance.now() > swallowUntil) return
  swallowUntil = 0
  e.preventDefault()
  e.stopPropagation()
}, true)
const lifted = (e) => {
  fingers.delete(e.pointerId)
  if (!fingers.size) spoiled = false
  if (e.pointerId === ghostFinger) {
    ghostFinger = null
    swallowUntil = performance.now() + 500
  }
}
document.addEventListener('pointerup', lifted, true)
document.addEventListener('pointercancel', lifted, true)

function holdButton(btn, act) {
  let start = 0
  let raf = 0
  let finger = null // the pointer that began the hold: only it can finish or end it
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
    finger = null
    btn.style.setProperty('--hold', '0')
    btn.classList.remove('holding')
  }
  const tick = () => {
    if (!start) return
    const k = (performance.now() - start) / 1000 / HOLD
    btn.style.setProperty('--hold', String(Math.min(1, k)))
    if (k >= 1) {
      ghostFinger = finger
      swallowUntil = Infinity
      start = 0
      stop()
      act()
      return
    }
    raf = requestAnimationFrame(tick)
  }
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    audio.unlock()
    // A second finger while a hold is running (a palm, or mashing) cancels it: a hold is one finger
    if (start) return release()
    if (spoiled || fingers.size !== 1) return
    cancelAnimationFrame(raf)
    finger = e.pointerId
    try {
      btn.setPointerCapture(e.pointerId)
    } catch {}
    start = performance.now()
    btn.classList.add('holding')
    raf = requestAnimationFrame(tick)
  })
  const release = (e) => {
    if (!start || (e?.pointerId != null && finger != null && e.pointerId !== finger && e.type !== 'pointerdown')) return
    start = 0
    stop()
    btn.classList.remove('wiggle')
    void btn.offsetWidth
    btn.classList.add('wiggle')
    audio.blip(1.1)
  }
  holdCancels.push(() => start && release())
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('lostpointercapture', release)
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (e.detail === 0) act()
  })
}

holdButton($('home'), () => {
  audio.click()
  toTitle()
})

// Sound and music start on with every visit: a mute made mid-play is not saved
const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
}
holdButton(soundBtn, () => {
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
function setMusic(on) {
  audio.setMusic(on)
  musicBtn.classList.toggle('off', !on)
}
holdButton(musicBtn, () => {
  setMusic(!audio.musicOn)
  audio.click()
})

// --- Collection book ---------------------------------------------------------------

const book = new Book({ el: $('book'), audio, creatures, getBook: () => game.book, getExtra: () => game.extra })
const openBook = (e) => {
  e?.stopPropagation()
  // A tap on 📖 straight after a tap on the water is mashing, not a wish to look at the book
  if (e?.detail && game.state === 'play' && clock - lastTap < 0.45) {
    const b = $('book-btn')
    b.classList.remove('wiggle')
    void b.offsetWidth
    b.classList.add('wiggle')
    return
  }
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

/** When the last tap came: taps close together are mashing, not a fresh choice of where to fish. */
let lastTap = -1
function tapAt(x, y) {
  audio.unlock()
  if (game.state !== 'play' || book.open) return
  game.idleT = 0
  const mashing = clock - lastTap < 0.45
  lastTap = clock
  const ph = game.phase
  if (ph === 'bite') return reel()
  if (ph === 'show') {
    // A tap on the catch tickles it; a tap anywhere else sends it to the book
    if (onShowCreature(x, y)) return tickle()
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
  const p = ray.ray.intersectPlane(waterPlane, hitP)
  const chosen = ph === 'idle' || ph === 'wait' ? pickAt(x, y) : null
  // A tap on the boat with a swimmer just behind it is a cast at that swimmer, not a poke at Bear
  if (poked === 'bear' && ph === 'idle' && !chosen && !(p && nearestSwimmer(p, CHOOSE_R))) {
    bear.wave = 1.5
    audio.giggle()
    effects.label('💕', tmp.copy(RIG).setY(4), { cls: 'emoji' })
    return
  }
  if (ph !== 'idle' && ph !== 'wait') return
  // Tapping the sky casts as far as the line can go
  const target = p ? p.clone() : new THREE.Vector3(((x / innerWidth) * 2 - 1) * 4, 0, bounds.zMin)
  if (ph === 'wait') {
    // While the line is out, quick taps (a little one mashing) just wiggle the bobber, so the fish still
    // comes. Only a tap on another swimmer's body casts again, or any tap once the line has sat a while
    // with nobody coming (and never in the middle of fast tapping). Once someone is nibbling, the bite is
    // moments away: nothing re-casts.
    const nibbling = fish.who && (fish.who.ghost ? Math.hypot(fish.who.pos.x - bob.pos.x, fish.who.pos.z - bob.pos.z) < 0.4 : fish.who.mode === 'nibble')
    const other = chosen && chosen !== fish.who && game.phaseT > 0.6 && !mashing
    if (nibbling || !(other || (!fish.who && game.phaseT > 1.5 && !mashing))) {
      bob.dip = 0.06
      effects.ripple(bob.pos, 0.5, 0.5)
      audio.blip(1.3)
      return
    }
  }
  castTo(target, chosen)
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
  // (Escape no longer leaves the pond: a hand resting on a keyboard must not end the trip; hold 🏠 instead)
  if (game.state === 'title' && (k === 'enter' || k === ' ')) {
    e.preventDefault()
    return start(game.place)
  }
  if (game.state !== 'play') return
  if (k === 'b') return openBook()
  if (k === ' ' || k === 'enter') {
    e.preventDefault()
    if (e.repeat) return
    const ph = game.phase
    if (ph === 'bite') return reel()
    // Enter tickles the catch; Space carries on
    if (ph === 'show') return k === 'enter' ? tickle() : fish.show.t > 0.5 && finishShow()
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
  const [c, w] = await Promise.allSettled([loader.loadAsync('./models/creatures.glb'), loader.loadAsync('./models/world.glb'), loadShore(PLACES[game.place].shore)])
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
      else if (ph === 'catch') updateCatch(dt, t)
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
      if (game.phase === 'bite' && s === fish.who) s.group.rotation.z = Math.sin(t * 9) * 0.08
      // A shiny one leaves a trail of little sparkles as it swims
      if (s.shiny && Math.random() < dt * 4) effects.sparkleAt(tmp.set(s.pos.x + rand(-0.4, 0.4), 0.15, s.pos.z + rand(-0.3, 0.3)), '#fff3a0', 1, 0.8, 0.28)
    }
    updateHops(dt)
    updatePatch(dt)
    updateBear(dt, t)
    updateBobber(dt, t)
    updatePickRing(dt)
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
    game, fish, creatures, world, bob, camera, book, castTo, reel, tapAt, start, tickle, debug, pickAt,
    patch: () => patch,
    advance(seconds) {
      const n = Math.round(seconds * 30)
      for (let i = 0; i < n; i++) frame(1 / 30, i === n - 1)
    },
  }
}
