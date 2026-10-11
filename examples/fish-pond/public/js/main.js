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
import { LOOK, factsOf, lookFor } from './look.js'
import { TRAITS, answersHere, fits, listRiddle, lower, makeList, makeRiddle, missReason, more, twoOf, verdict } from './riddles.js'
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
  // Bear's riddle (riddles.js). Tier 1 asks for something you can see, tier 2 for an idea (fish or not,
  // breathes air, no bones), tier 3 for two clues at once. See answer() for how it adapts.
  riddle: null,
  tier: 1,
  // The highest tier reached before (saved): a trip starts one below it, and climbs back quickly
  best: clamp(Number(store.get('fish-pond-best', store.get('fish-pond-tier', 1))) || 1, 1, 3),
  streak: [], // the clues answered with the first catch, in a row
  said: new Set(), // "why" lines said this trip, so each reason is fresh
  recent: [], // the last few riddles asked, so they vary
  answered: [], // the animals that solved the last few riddles, so the answers vary too
  counted: new Set(), // animals counted this trip: a second count is quiet (numbers by tick, the total said)
  lookAsks: 0, // "Look closer!" is said for the first catch of a trip; after that the glow is enough
  factAt: -1e9, // when the last fact was heard (game clock)
  // Bear's list (riddles.js makeList): three animals to find across the places, for children who reached
  // two-clue riddles. Saved, so a child can plan which water to fish in from the title screen.
  list: validList(store.get('fish-pond-list', null)),
  listSaid: false, // "Nothing on Bear's list lives here" is said once a trip
  riddleSaidAt: 0, // a new riddle after the first is shown, and said only after a quiet look (RIDDLE_QUIET)
  riddleTier: 0, // the tier of the last riddle said aloud: a new kind of riddle is always said
  casts: 0,
  phaseT: 0,
  misses: 0,
  idleT: 0,
}
if (typeof game.book !== 'object' || !game.book) game.book = {}
function validList(l) {
  return Array.isArray(l) && l.length && l.every((it) => listRiddle(it)) ? l : null
}
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
  placeSnailPad()
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
  // The mission speaks its own reward once a trip, with a calm card (no trophy, no star): the count
  // is the lesson, so after three it rests until the next trip (start() begins it afresh)
  celebrate: () => {
    showIntro('🐟', '1, 2, 3!', '🐟 🐟 🐟')
    softMoment()
  },
  // Three fish pictures, lit one per kept catch, and nothing else: no tally, no star
  renderProgress: (goal, option, count) => {
    const row = document.createElement('span')
    row.className = 'adventure-steps'
    row.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < option.target; i++) row.append(Object.assign(document.createElement('span'), { className: `adventure-step${i < count ? ' adventure-got' : ''}`, textContent: option.icon }))
    goal.replaceChildren(row)
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

function castTo(point, chosen = null) {
  if (game.phase !== 'idle' && game.phase !== 'wait') return
  if (game.phase === 'wait') letGo(false)
  castSpot.copy(castTarget(point))
  // The swimmer the child aimed at is the one who comes, even if it drifts a little while the line flies.
  // A tap on a swimmer's body chooses it (pickAt); otherwise aim from where the child tapped, not where
  // the bobber lands: at the ice the line snaps to the nearest hole, and the swimmer tapped swims over to it.
  fish.aim = chosen ?? nearestSwimmer(point, CHOOSE_R) ?? nearestSwimmer(castSpot, PLACES[game.place].ice ? CHOOSE_R + 0.8 : CHOOSE_R)
  game.riddleSaidAt = 0
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
  // Where you cast is the choice: a swimmer right by the bobber is the one who comes to look.
  // Open water far from everyone brings a surprise from the deep (the rare finds live there).
  const aim = fish.aim
  fish.aim = null
  const near = debug.force ? null : aim && aim.mode === 'wander' && creatures.swimmers.includes(aim) ? aim : nearestSwimmer(bob.pos, CHOOSE_R)
  // The deep leans toward a surprise that fits Bear's riddle (a golden fish for "something yellow", the whale for
  // "breathes air"): it is put back if it doesn't fit, so open water rewards thinking, not random casts
  const boost = (c) => (game.riddle && !AMBIENT[game.place].includes(c.id) && fits(game.riddle, c.id) ? 3 : 1)
  const pick = near ? near.info : BY_ID[debug.force] ?? roll(game.place, game.book, game.luck, boost)
  fish.pick = pick
  // Slow bobs to watch before the real bite: one or two for the swimmer you chose, more for a surprise
  fish.nibbles = (near ? 1 : 2) + ((Math.random() * 2) | 0)
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

/** Whoever was coming swims off (a soft ripple if they got away: no teasing). */
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
    effects.bubble(new THREE.Vector3(w.pos.x, w.pos.y + 0.2, w.pos.z), 4, 0.3)
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
    // A swimmer that can't turn tightly enough to reach the bobber turns harder, then simply arrives
    w.coming = (w.coming ?? 0) + dt
    const d = creatures.steer(w, spot, dt, w.id === 'whale' ? 1.6 : w.id === 'snail' ? 1.5 : 2.2, w.coming > 4 ? 8 : 3.5)
    const depth = w.info.how === 'surface' ? 0.02 : w.id === 'whale' ? -1.5 : -0.45
    w.pos.y += (depth - w.pos.y) * Math.min(1, dt * 1.8)
    if (d < reach || w.coming > 9) {
      w.coming = 0
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
    creatures.vivid(w.group, false)
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
  const end = stageScale() * k.c.unit * showSize(k.pick.id)
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

/** The parts of a creature (look.js LOOK) that show each clue: what the child looked for. */
const CLUE_PARTS = {
  stripes: ['stripes'],
  spots: ['spots'],
  shell: ['shell'],
  claws: ['claws'],
  arms: ['arms'],
  tentacles: ['tentacles'],
  tusk: ['tusk'],
  spikes: ['spikes'],
  air: ['blowhole', 'skin', 'flippers'],
  nobones: ['tentacles', 'arms', 'shell'],
  fish: ['fins', 'back fin', 'back fins', 'side fins'],
}
/** The look that matches a clue the catch answered (a thing to see first, then the idea), or null. */
function clueLook(r, id) {
  if (!r) return null
  const clues = [...r.clues].filter((c) => !c.neg).sort((a, b) => TRAITS[a.t].tier - TRAITS[b.t].tier)
  for (const c of clues) {
    const l = LOOK[id]?.find((x) => CLUE_PARTS[c.t]?.includes(x.part))
    if (l) return l
  }
  return null
}

/** Boxy or round things look bigger than fish of the same length. */
/** In portrait the crayfish's long feelers would run off the side and cover Bear, so it shows smaller. */
const showSize = (id) => (id === 'crayfish' && innerWidth < innerHeight ? 0.9 : SHOW_SIZE[id] ?? 1)
/**
 * Shown a little lower (in stage units), clear of Bear: the crayfish's bulk sat over Bear and the boat in
 * portrait, and the cod's back fins (counted, with a dot on each) sat on Bear's face.
 */
const SHOW_DROP = { cod: -0.5, crayfish: -0.45 }
const SHOW_SIZE = { chest: 0.78, pufferfish: 0.85, boot: 0.9, duck: 0.9, frog: 0.8, crayfish: 1.15, snail: 0.85, octopus: 1.15 }

/** Not animals: they are always kept, whatever Bear asked (a joke, never an answer). */
const JOKES = new Set(['boot', 'duck', 'chest'])

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
  // Bear's riddle decides what is kept. An animal that fits goes in the book; one that doesn't is looked
  // at, told why not, and put back in the water (no book, no fanfare). That includes the golden fish and
  // the whale from the open water, so the rare tiles come from thinking, not from casting anywhere.
  // Only the jokes (the boot, the rubber duck, treasure) are always kept: they aren't animals.
  const r = game.riddle
  const right = fits(r, pick.id)
  const surprise = JOKES.has(pick.id)
  const keep = !r || right || surprise
  const before = Number(game.book[pick.id]) || 0
  if (keep) {
    game.book[pick.id] = before + 1
    store.set('fish-pond-book', game.book)
    game.luck = pick.stars === 3 ? 0 : game.luck + 1
    store.set('fish-pond-luck', game.luck)
  }
  const isNew = keep && before === 0
  // A catch that answered a riddle glows on the part the child reasoned with ("Yes! A rainbow trout has
  // spots!" glows on its spots, not its stripe), so the look confirms the clue; otherwise the next feature
  const clue = right ? clueLook(r, pick.id) : null
  // A feature whose facts were all heard this trip doesn't glow again (counting always may)
  let look = keep ? clue ?? lookFor(pick.id, game.book[pick.id]) : null
  // and between facts there is a calm gap (FACT_GAP), so a trip is mostly looking and fishing, not listening.
  // A new animal always has its glow, and so does the first count of an animal in a trip, and so does the
  // clue just used (if it still has a fact to tell).
  if (look && !isNew && (look.count ? game.counted.has(pick.id) : !lookFact(look) || (look !== clue && clock - game.factAt < FACT_GAP))) look = null
  fish.show = { c, pick, t: 0, strays: 0, isNew, right, back: !keep, puffed: false, all: isNew && caughtKinds() === CREATURES.length, look, lookAt: look ? creatures.featurePoint(pick.id, look.at) : null }
  setPhase('show')
  bob.state = 'hang'
  // Card under the creature: its name and a NEW sticker, with no rarity stars (a put-back shows a wave)
  $('card-stars').textContent = keep ? '' : '🌊'
  $('card-name').textContent = pick.name
  $('card-new').classList.toggle('hidden', !isNew)
  $('card').className = `card-catch show stars${pick.stars}${keep ? '' : ' back'}`
  // One line: its name, whether it answers Bear's riddle, and why (a repeat miss is just the short reason)
  const line = surprise && !right ? null : verdict(r, pick.id, pick.name, game.said)
  const wow = !keep && SAY[pick.id] ? `${SAY[pick.id]} ` : '' // "Wow! A golden fish! It isn't orange."
  // After four misses on one riddle the ringed animal has come close: further misses are a soft plip and
  // the card's words, with no voice at all. A short reason already said on this riddle (r.mute) rests too.
  const hush = !keep && r && (r.misses >= 4 || r.mute) && !wow
  if (!hush) voice.sayNow(keep ? line ?? SAY[pick.id] ?? `You caught ${/^[aeiou]/i.test(pick.name) ? 'an' : 'a'} ${lower(pick.name)}!` : wow + (wow ? (r?.mute ? '' : line.replace(/^An? [^.]*\. /, '')) : line))
  if (r && (right || !surprise)) fish.show.solved = answer(r, right, pick.id)
  if (fish.show.solved && r.list) fish.show.listDone = tickList(r)
  // Look closer: one feature to notice, asked right after the name (it is optional).
  // A put-back shows why not instead, in words, for children who read.
  $('card-look').classList.toggle('hidden', !look && keep)
  if (!keep) $('card-look').textContent = r.reason || missReason(line)
  if (look) {
    $('card-look').textContent = `🔍 ${look.part}?`
    if (game.lookAsks++ < 1) voice.say(`Look closer! See its ${look.part}?`)
  }
  if (keep) {
    audio.fanfare(pick.stars)
    softMoment()
    stageLight.intensity = 6
  } else {
    audio.nibble()
    stageLight.intensity = 3
  }
  updateHud()
}

function updateShow(dt, t) {
  const s = fish.show
  s.t += dt
  const g = s.c.group
  const base = stageScale() * s.c.unit * showSize(s.pick.id)
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
  // The octopus faces you square on: its arms fan round it like a star, so all eight tips show, clear of its face
  // The crayfish turns a little side-on, so its big claws reach out to the side instead of pointing at you
  const face = id === 'octopus' ? -1.45 : id === 'crayfish' ? -0.6 : id === 'pufferfish' || id === 'jellyfish' || id === 'duck' || id === 'chest' || id === 'boot' || id === 'crab' || id === 'frog' ? -1.05 : -0.45
  // Held quite still while arms or stripes are counted, so each dot stays under the finger: the sway and bob
  // ease out to nothing from where they were (no jump) and the count dots sit still
  s.still = damp(s.still ?? 0, s.counting || s.guessing ? 1 : 0, 4, dt)
  const move = 1 - s.still
  const sway = id === 'octopus' ? 0.2 : 0.35
  g.rotation.set(Math.sin(s.t * 2.2) * 0.12 * move, face + Math.sin(s.t * 1.6) * sway * move, Math.sin(s.t * 3.1) * 0.08 * move)
  g.position.y = Math.sin(s.t * 2.8) * 0.08 * move + (SHOW_DROP[id] ?? 0) * Math.min(1, s.t * 2)
  if (s.c.parts.tail) s.c.parts.tail.rotation[id === 'whale' || id === 'narwhal' ? 'z' : 'y'] = Math.sin(s.t * 12) * 0.5 * move
  // Rays and glow behind
  const a = Math.min(1, s.t * 3)
  // A still, soft glow behind the catch (no spinning rays)
  glow.material.opacity = a * (s.back ? 0.15 : 0.4)
  glow.material.color.set(s.pick.stars >= 3 ? '#ffe680' : '#fffbe6')
  updateLook(s)
  updateDots(s)
  // Untouched, the catch flies to the book after a calm pause. After a look, it waits for the fact.
  // While the child is counting there is no clock, but a count or guess nobody is doing ends gently
  // (a stray tap on the glow must not hold a little one on the stage): a few quiet seconds before the
  // first tap, longer once counting has begun.
  if (s.guessing) {
    if (s.t - s.guessing.last > IDLE_COUNT) finishShow()
  } else if (s.counting && !s.looked) {
    const c = s.counting
    // Some counted, then a long rest: Bear says the count so far and how many are left, once ("Two! One
    // more stripe to find."); a second rest ends it with the total, so a count never ends in silence
    if (c.n && s.t - c.last > (c.nudged ? 8 : 10)) {
      if (!c.nudged) {
        c.nudged = true
        c.last = s.t
        const left = c.pts.length - c.n
        const one = s.look.part.replace(/s$/, '')
        voice.sayNow(`${NUMBER[c.n]}! ${left === 1 ? `One more ${one}` : `${NUMBER[left]} more ${s.look.part}`} to find.`)
      } else {
        voice.sayNow(`${NUMBER[c.pts.length]} ${s.look.part} in all.`)
        finishShow()
      }
    } else if (!c.n && s.t - c.last > IDLE_COUNT) finishShow()
  } else if (s.looked) {
    const heard = s.factDone ? s.t - s.factDone > 1.2 && s.t - s.looked > s.factFor * 0.6 : s.t - s.looked > s.factFor
    if (heard || s.t - s.looked > 14) finishShow()
  } else if (s.t > (s.back ? BACK_WAIT : s.look ? LOOK_WAIT : 4.6)) finishShow()
}

// --- Look closer -----------------------------------------------------------------------

/** Seconds a guess or a count may wait for its first tap before the catch carries on. */
const IDLE_COUNT = 7
/** Seconds a catch waits on the stage for a look before flying to the book. */
const LOOK_WAIT = 7.5
/** Seconds a catch that didn't fit the riddle stays up (for its "why not") before going back in the water. */
const BACK_WAIT = 3.6
/** When the glow appears: once the name has been said. */
const LOOK_FROM = 1.3
const lookBtn = $('look')
const lookPos = new THREE.Vector3()
const lookScreen = { x: 0, y: 0, on: false }

/** Keep the glow on the creature's feature as it wiggles on the stage. */
function updateLook(s) {
  lookScreen.on = false
  if (!s.look || s.looked || s.counting || s.guessing || s.t < LOOK_FROM) return
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

/** The child tapped the glowing feature: count it if it can be counted, else say its one true fact. */
function lookCloser() {
  const s = fish.show
  if (game.phase !== 'show' || !s?.look || s.looked || s.t < LOOK_FROM) return
  if (s.guessing) return
  if (s.counting) return countNext()
  // From tier 2, a guess comes first ("How many arms?"), and counting checks it (only the first count in a trip)
  if (s.look.count) return game.tier >= 2 && s.guess == null && !game.counted.has(s.pick.id) ? askGuess(s) : startCount(s)
  readFact(s, takeFact(s.look) ?? factsOf(s.look)[0])
}

/** A fact about this feature not yet heard this trip, or null when they all have been. */
function lookFact(look) {
  return factsOf(look).find((f) => !game.said.has(f)) ?? null
}
function takeFact(look) {
  const f = lookFact(look)
  if (f) game.said.add(f)
  return f
}

/** Seconds between glows on animals already in the book, so facts come now and then, not with every catch. */
const FACT_GAP = 40

function readFact(s, fact) {
  game.factAt = clock
  s.looked = s.t
  s.factDone = 0
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
  guessBox.hidden = true
  for (const d of dots) d.hidden = true
}

// --- Tap to count (octopus arms, clownfish stripes) ---------------------------------------
// Each arm gets a soft spot to tap. A tap counts it once (tapping it again does nothing), so the
// child touches each one exactly once: one-to-one counting. Every number is said, because here
// counting is the lesson. The fact comes once all are counted.

const dotBox = $('dots')
const dots = []
const dotPos = new THREE.Vector3()
function startCount(s) {
  const pts = s.look.count.map((p) => creatures.featurePoint(s.pick.id, p))
  // A second count of the same animal in a trip is quiet: the numbers show and tick, and only the total is said
  s.counting = { pts, done: pts.map(() => false), n: 0, last: s.t, quiet: game.counted.has(s.pick.id) }
  $('card-new').classList.add('hidden')
  while (dots.length < pts.length) {
    const d = document.createElement('button')
    d.type = 'button'
    d.className = 'count-dot'
    const i = dots.length
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!countNear(e.clientX, e.clientY)) countAt(i)
    })
    dotBox.append(d)
    dots.push(d)
  }
  dots.forEach((d, i) => {
    d.hidden = i >= pts.length
    d.textContent = ''
    d.classList.remove('counted')
    d.setAttribute('aria-label', `Count this ${s.look.part.replace(/s$/, '')}`)
  })
  lookBtn.classList.remove('on')
  lookBtn.classList.add('seen')
  lookScreen.on = false
  $('card-look').textContent = `🔍 ${s.look.part}: 0`
  if (!s.counting.quiet) voice.sayNow(s.guess == null ? `Count its ${s.look.part}! Tap each one.` : `You said ${s.guess}. Now count them!`)
  audio.nibble()
}

/** Guess first, then count: three numbers in order (a little number line), with no clock and no wrong buzz. */
const guessBox = $('guess')
function askGuess(s) {
  const n = s.look.count.length
  const step = n > 4 ? 2 : 1
  s.guessing = { last: s.t }
  $('card-new').classList.add('hidden')
  lookBtn.classList.remove('on')
  lookBtn.classList.add('seen')
  lookScreen.on = false
  guessBox.textContent = ''
  for (const v of [n - step, n, n + step]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = v
    b.setAttribute('aria-label', `${v} ${s.look.part}`)
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (fish.show !== s || !s.guessing) return
      s.guess = v
      s.guessing = null
      guessBox.hidden = true
      startCount(s)
    })
    guessBox.append(b)
  }
  guessBox.hidden = false
  $('card-look').textContent = `🔍 ${s.look.part}: ?`
  voice.sayNow(`How many ${s.look.part}? Guess first!`)
  audio.nibble()
}

function countAt(i) {
  const s = fish.show
  const c = s?.counting
  if (game.phase !== 'show' || !c || s.looked || c.done[i]) return
  c.done[i] = true
  c.n++
  c.last = s.t
  dots[i].textContent = c.n
  dots[i].classList.add('counted')
  audio.nibble()
  $('card-look').textContent = `🔍 ${s.look.part}: ${c.n}`
  // Counting is the lesson here, so the first count says every number; a repeat lets the ticks count
  voice.count(c.n, { aloud: c.quiet ? 0 : 10 })
  if (c.n < c.pts.length) return
  // All counted: say the total, with a fact not yet heard this trip
  game.counted.add(s.pick.id)
  const words = NUMBER[c.n] ?? String(c.n)
  const check = s.guess == null ? '' : s.guess === c.n ? ' Just as you guessed!' : ' Counting tells us for sure!'
  readFact(s, `${words} ${s.look.part}!${check} ${takeFact(s.look) ?? ''}`.trim())
}

const NUMBER = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

/**
 * A tap counts the nearest arm or stripe not yet counted, within a finger's reach of its dot, so a tap
 * between two close stripes (the clownfish's are about 60 px apart) still counts one, never nothing.
 */
function countNear(x, y, reach = 64) {
  const s = fish.show
  const c = s?.counting
  if (!c) return false
  let best = -1
  let bd = reach
  c.pts.forEach((_, i) => {
    if (c.done[i] || dots[i].hidden) return
    const [dx, dy] = dotXY(dots[i])
    const d = Math.hypot(dx - x, dy - y)
    if (d < bd) [best, bd] = [i, d]
  })
  if (best < 0) return false
  countAt(best)
  return true
}

/** Keyboard: Enter or L counts the next one still to count. */
function countNext() {
  const i = fish.show.counting.done.indexOf(false)
  if (i >= 0) countAt(i)
}

/** A count dot's centre on the screen. */
const dotXY = (d) => {
  const r = d.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
}

function updateDots(s) {
  const c = s.counting
  if (!c) return
  s.c.group.updateWorldMatrix(true, true)
  c.pts.forEach((p, i) => {
    dotPos.copy(p)
    s.c.group.localToWorld(dotPos)
    dotPos.project(camera)
    dots[i].style.transform = `translate(${((dotPos.x + 1) / 2) * innerWidth}px, ${((1 - dotPos.y) / 2) * innerHeight}px)`
  })
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
  let target
  if (s.back) {
    // Back into the water, a little way from the boat
    s.splash = castSpot.clone().setY(0)
    target = s.splash.clone().setY(-0.3)
  } else {
    const r = $('book-btn').getBoundingClientRect()
    const p = new THREE.Vector3(((r.left + r.width / 2) / innerWidth) * 2 - 1, -((r.top + r.height / 2) / innerHeight) * 2 + 1, 0.5).unproject(camera)
    const dir = p.sub(camera.position).normalize()
    target = camera.position.clone().addScaledVector(dir, 4.6)
  }
  s.from = s.c.group.position.clone()
  s.to = stage.worldToLocal(target.clone())
  s.fromScale = s.c.group.scale.x
  s.fly = 0
}

function updateToBook(dt) {
  const s = fish.show
  s.fly += dt / (s.back ? 0.8 : 0.6)
  const e = Math.min(1, s.fly)
  const g = s.c.group
  g.position.lerpVectors(s.from, s.to, e * e)
  if (s.back) g.position.y += Math.sin(e * Math.PI) * 0.6
  g.scale.setScalar(s.fromScale * (1 - (s.back ? 0.7 : 0.88) * e))
  g.rotation.y += dt * (s.back ? 2 : 8)
  glow.material.opacity *= 0.85
  if (e >= 1 && s.back) {
    // A soft plop, and it swims off with the others again
    g.removeFromParent()
    glow.material.opacity = 0
    stageLight.intensity = 0
    effects.splash(s.splash, 0.6)
    audio.plop()
    fish.show = null
    setPhase('idle')
    const id = s.pick.id
    const want = AMBIENT[game.place].filter((k) => k === id).length
    if (creatures.swimmers.filter((w) => w.id === id && !w.spawned).length < want) spawnAmbient(id).pos.set(s.splash.x, -0.5, s.splash.z)
    refillAmbient()
    updateHud()
    if (game.riddle?.misses >= EASIER_AFTER && !game.riddle.easy && !game.riddle.list) easierRiddle()
    return
  }
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
    // Three is the whole mission: once counted it rests for the trip (no new count, no reward loop).
    adventure.event(s.pick)
    // Bear's list finished: one thank-you and a calm card, then the list is put away (a new one next trip)
    if (s.listDone === 'all') {
      voice.say("That's everything on Bear's list. Thank you!")
      showIntro('📜', "Bear's list", '✅ ✅ ✅', false, true)
      game.list = null
      store.set('fish-pond-list', null)
      renderList()
    } else if (s.listDone) voice.say("One for Bear's list!")
    // A riddle answered: Bear asks the next one once the catch is safely in the book
    if (s.solved) newRiddle()
    else if (game.riddle?.misses >= EASIER_AFTER && !game.riddle.easy && !game.riddle.list) easierRiddle()
    // Finding all 15 is the bigger prize: its card goes up last so nothing covers it
    if (s.all) {
      showIntro('🏆', 'You found them all!', `📖 ${CREATURES.length} / ${CREATURES.length}`, false, true)
      softMoment()
      audio.chord()
    }
  }
}

// --- Bear's riddle -------------------------------------------------------------------------

const riddleBtn = $('riddle')
/** Which places are fresh water and which are sea: Bear's list is planned by habitat. */
const WATER = { lake: 'fresh', river: 'fresh', night: 'fresh', ice: 'sea', reef: 'sea' }
/** Seconds a new riddle sits quietly on the chip before Bear reads it out (if no cast came first). */
const RIDDLE_QUIET = 6

/** Bear asks for an animal by what it has; the child finds one swimming and casts near it. */
function newRiddle(first = false) {
  // Only animals the child can see now: a phone or a wide screen crops the water differently
  const seen = [...new Set(visibleKinds())]
  const kinds = seen.length >= 3 ? seen : AMBIENT[game.place]
  // Bear's list comes in every other riddle while something on it swims here, in view
  // (and not when only the animal that answered last could answer it: the same one twice running is no riddle)
  const others = kinds.filter((id) => id !== game.answered[0])
  const item = game.tier >= 2 && !game.riddle?.list ? game.list?.find((it) => !it.done && answersHere(it, others) && listRiddle(it).key !== game.riddle?.key.replace(/\*2$/, '')) : null
  // (an ordinary riddle never asks what an item still on the list asks: that one is the list's)
  const listKeys = (game.list ?? []).filter((it) => !it.done).map((it) => listRiddle(it).key)
  // Past two clues: after three two-clue riddles in a row answered with the first catch, Bear asks for
  // two different animals that fit both clues (tier 4 on the chip). One slow riddle ends the run.
  const deep = game.tier === 3 && game.streak.length >= 3
  game.riddle = item ? listRiddle(item) : makeRiddle(kinds, game.tier, game.riddle, game.recent, game.answered, { two: deep, avoid: listKeys })
  const r = game.riddle
  const pair = () => new Set(seen.filter((id) => fits(r, id))).size >= 2
  if (item) r.item = game.list.indexOf(item)
  // Tier 2 sorts a group: "find two different animals that breathe air", when two such kinds are in view
  else if (r && game.tier === 2 && r.clues.length === 1 && TRAITS[r.clues[0].t].ask2 && pair()) game.riddle = twoOf(r)
  else if (r && deep && r.clues.length > 1 && pair()) game.riddle = { ...twoOf(r), tier: 4 }
  drawRiddle()
  if (!game.riddle) return
  // The last five riddles are left out while there are others (a one-answer riddle twice in six was samey)
  game.recent = [game.riddle.key, ...game.recent].slice(0, 5)
  // The first riddle of a trip, one from Bear's list and a new kind of riddle are read out. Otherwise the
  // chip shows the new picture, and Bear reads it only after a quiet look with no cast (or on a chip tap).
  // Two clues are read out too (once per riddle in a trip, by sayRiddle): the chip's slashed pictures
  // ("fish + no yellow") are hard to decode for a six-year-old who casts quickly.
  if (first || game.riddle.list || game.riddle.tier !== game.riddleTier || game.riddle.clues.length > 1) sayRiddle(first)
  else game.riddleSaidAt = clock
}

/** Misses on one riddle before Bear swaps it for one the swimmer by the bobber answers. */
const EASIER_AFTER = 6

/**
 * A little one tapping anywhere can miss one riddle many times. After six misses Bear swaps it for a riddle
 * that the swimmer nearest where they last cast answers (one simple thing to see), with the soft ring on it
 * and that swimmer drifting in front of the boat, so the loop still closes. Careful play never gets here:
 * a riddle is only swapped after six misses, and only once.
 */
function easierRiddle() {
  const r = game.riddle
  const inView = (s) => {
    seenP.copy(s.pos).setY(0).project(camera)
    return Math.abs(seenP.x) < 0.9 && seenP.y > -0.9 && seenP.y < 0.72 && !JOKES.has(s.id) && !TOYS.has(s.id)
  }
  const near = nearestSwimmer(castSpot, 99, inView)
  if (!near) return
  const kinds = [...new Set(visibleKinds())]
  const next = makeRiddle(kinds.length >= 3 ? kinds : AMBIENT[game.place], 1, r, game.recent, [], { want: near.id })
  if (!next || !fits(next, near.id)) return
  next.easy = true
  next.misses = 4 // the ring and the drift to the front start at once (see updateHelp)
  game.riddle = next
  game.recent = [next.key, ...game.recent].slice(0, 5)
  helpFor = near
  drawRiddle()
  sayRiddle()
}
/** Pretend friends answer only colours: the swap picks a real animal near the bobber when there is one. */
const TOYS = new Set(['bluefish', 'goldenfish'])

function sayRiddle(first = false) {
  const r = game.riddle
  game.riddleTier = r.tier
  game.riddleSaidAt = 0
  const who = r.list ? "From Bear's list" : first ? "Bear's riddle" : 'Next riddle'
  const line = first ? `${who}: find ${r.ask}. Cast near ${r.need > 1 ? 'them' : 'it'}!` : `${who}: ${r.ask}.`
  // A riddle that comes round again in a trip is shown on the chip, not read again (a tap on it reads it)
  if (game.said.has(line)) return
  game.said.add(line)
  voice.say(line)
}

/** An item on Bear's list was found: tick it (saved). Returns 'all' when the list is finished. */
function tickList(r) {
  const it = game.list?.[r.item]
  if (!it) return false
  it.done = true
  store.set('fish-pond-list', game.list)
  renderList()
  return game.list.every((x) => x.done) ? 'all' : true
}

/** Children who have reached two-clue riddles get a list from Bear, kept until it is done. */
function ensureList() {
  if (game.list || game.best < 3) return false
  game.list = makeList(AMBIENT, WATER)
  store.set('fish-pond-list', game.list)
  renderList()
  return true
}

/** The list on the title screen: one still chip per item, ticked when found. Tap it to hear the list. */
const listBtn = $('bear-list')
function renderList() {
  listBtn.hidden = !game.list
  if (!game.list) return
  const box = $('list-items')
  box.textContent = ''
  for (const it of game.list) {
    const r = listRiddle(it)
    const li = document.createElement('span')
    li.className = it.done ? 'li done' : 'li'
    for (const { icon, not } of it.done ? [{ icon: '✅' }] : r.icons) li.append(Object.assign(document.createElement('span'), { className: not ? 'ri not' : 'ri', textContent: icon }))
    li.append(Object.assign(document.createElement('small'), { textContent: r.word }))
    box.append(li)
  }
  listBtn.setAttribute('aria-label', `Bear's list: ${game.list.map((it) => listRiddle(it).ask).join('; ')}`)
}
listBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  audio.click()
  const left = (game.list ?? []).filter((it) => !it.done).map((it) => listRiddle(it).ask.replace(/^./, (c) => c.toUpperCase()))
  if (left.length) voice.sayNow(`Bear's list: ${left.join('. ')}. Which water do they live in?`)
})

function drawRiddle(solved = false) {
  const r = game.riddle
  riddleBtn.hidden = !r || game.state !== 'play'
  if (!r) return
  riddleBtn.classList.toggle('solved', solved)
  riddleBtn.classList.toggle('two', r.tier >= 2)
  riddleBtn.classList.toggle('list', !!r.list)
  riddleBtn.querySelector('.riddle-bear').textContent = r.list ? '📜' : '🐻'
  // A new riddle settles in once (no pulse), so a child sees the picture has changed
  if (!solved && riddleBtn.dataset.key !== r.key + r.found.length) {
    riddleBtn.dataset.key = r.key + r.found.length
    riddleBtn.classList.remove('fresh')
    void riddleBtn.offsetWidth
    riddleBtn.classList.add('fresh')
  }
  // One picture per clue; a "not" clue gets a soft slash across its picture
  const icons = $('riddle-icon')
  icons.textContent = ''
  for (const { icon, not } of solved ? [{ icon: '✅' }] : r.icons) {
    const i = document.createElement('span')
    i.className = not ? 'ri not' : 'ri'
    i.textContent = icon
    icons.append(i)
  }
  // "Find two": a little slot for each, filled as they are found (no numbers, no score)
  if (r.need > 1 && !solved) {
    const slots = document.createElement('span')
    slots.className = 'slots'
    for (let k = 0; k < r.need; k++) slots.append(Object.assign(document.createElement('i'), { className: k < r.found.length ? 'on' : '' }))
    icons.append(slots)
  }
  $('riddle-word').textContent = r.word
  riddleBtn.setAttribute('aria-label', `Bear's riddle: find ${r.ask}. Tap to hear it again.`)
}

/**
 * A catch of a swimmer reached the stage: count the try, and adapt the riddles to how it is going.
 * Up a tier after four riddles in a row answered with the first catch (only two to climb back to a
 * tier reached before). Down a tier, quietly, as soon as one riddle takes four catches.
 */
function answer(r, right, id) {
  r.tries++
  if (!right) {
    r.misses++
    if (r.misses === 4 && game.tier > 1) setTier(game.tier - 1)
    return false
  }
  r.found.push(id)
  game.answered = [id, ...game.answered].slice(0, 4)
  // One of two found: the riddle stays, with its first slot filled
  if (r.found.length < r.need) {
    drawRiddle()
    return false
  }
  game.streak = r.tries === r.need ? [...game.streak, r.key] : []
  drawRiddle(true)
  const need = game.tier < game.best ? 2 : game.tier === 2 ? 3 : 4 // a tier-2 riddle is two catches, so three of them
  if (game.tier < 3 && game.streak.length >= need && new Set(game.streak).size >= 2) setTier(game.tier + 1)
  return true
}

function setTier(n) {
  const up = n > game.tier
  game.tier = n
  game.streak = []
  // Remember the highest tier, but let it drift down after a slow riddle (a younger sibling may be playing)
  game.best = up ? Math.max(game.best, n) : Math.max(n, game.best - 1)
  store.set('fish-pond-best', game.best)
  // Moving up is worth a word; moving back down happens quietly
  if (up && n === 2) voice.sayOnce('Bear has trickier riddles now!')
  if (up && n === 3) voice.sayOnce('Now Bear gives two clues at once!')
  // and a list of animals to find, some of them in other waters
  if (up && n === 3 && ensureList() && !game.list.some((it) => answersHere(it, AMBIENT[game.place]))) voice.sayOnce("Bear has a list, too. It's at home!")
}

riddleBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  game.riddleSaidAt = 0
  if (game.riddle && game.phase !== 'show') voice.sayNow(game.riddle.found.length ? more(game.riddle) : `Find ${game.riddle.ask}.`)
})

/**
 * After two catches that didn't fit, a soft still ring sits on the water over one that does,
 * so a little one is shown where to look without the riddle being answered for them.
 */
const helpRing = new THREE.Mesh(
  new THREE.RingGeometry(0.75, 0.95, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
)
helpRing.renderOrder = 3
scene.add(helpRing)
let helpFor = null
function updateHelp(dt) {
  const r = game.riddle
  const want = game.state === 'play' && r && r.misses >= 2 && (game.phase === 'idle' || game.phase === 'wait' || game.phase === 'cast')
  if (want && (!helpFor || !creatures.swimmers.includes(helpFor) || helpFor.mode !== 'wander')) {
    helpFor = nearestSwimmer(RIG, 99, (s) => fits(r, s.id))
    if (helpFor && r.misses === 2) voice.sayOnce('Look for the soft ring.')
  }
  if (!want) helpFor = null
  // Still not found after four catches: the ringed one drifts over in front of the boat, where little ones look
  if (helpFor && r.misses >= 4 && helpFor.mode === 'wander') {
    helpFor.target.set(clamp(helpFor.target.x, -2.5, 2.5), 0, 2)
    helpFor.retarget = 5
  }
  const on = want && helpFor
  helpRing.material.opacity = damp(helpRing.material.opacity, on ? 0.6 : 0, 3, dt)
  if (helpFor) helpRing.position.set(helpFor.pos.x, 0.05, helpFor.pos.z)
  helpRing.visible = helpRing.material.opacity > 0.01
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

// --- Swimmers about the place ----------------------------------------------------------

const seenP = new THREE.Vector3()
/** The kinds swimming where the child can see them now (under the riddle chip and the name card is still in view). */
function visibleKinds() {
  const out = []
  for (const s of creatures.swimmers) {
    if (s.spawned || s.mode === 'flee') continue
    seenP.copy(s.pos).setY(0).project(camera)
    if (Math.abs(seenP.x) < 0.9 && seenP.y > -0.9 && seenP.y < 0.72) out.push(s.id)
  }
  return out
}

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

/** One of the place's swimmers. On the reef, clownfish keep close to an anemone home. */
function spawnAmbient(id) {
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
      // A slow, steady bob under: noticeable, never a frantic jiggle
      y = -0.3 + Math.sin(t * 9) * 0.05
      bob.pos.x += Math.sin(t * 7) * 0.03
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
  bob.group.rotation.z = ph === 'bite' ? Math.sin(t * 9) * 0.15 : Math.sin(t * 1.9) * 0.08
  updateLine(sag)
}

// --- HUD & screens ---------------------------------------------------------------------

function updateHud() {
  // (no count on the in-play book button: fishing is about Bear's riddle, not filling the book)
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
let hintFor = null
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
  // A brand-new player's first cast, or a child who has stopped: point at a swimmer that answers the riddle
  // (never at a fixed spot, where a wrong answer may be swimming)
  const showMe = game.phase === 'idle' && !placeCardUp && ((game.casts === 0 && totalCaught() < 3) || game.idleT > 30)
  if (!showMe) hintFor = null
  else if (!hintFor || !creatures.swimmers.includes(hintFor) || hintFor.mode !== 'wander') hintFor = game.riddle ? nearestSwimmer(RIG, 99, (w) => fits(game.riddle, w.id)) : null
  if (showMe && hintFor) target = tmp.copy(hintFor.pos).setY(0)
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
  riddleBtn.hidden = true
  updateHud()
  markPlace()
  ensureList()
  renderList()
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
  voice.newRound()
  // The sorting page comes back each trip: the catches wait in the tray to be sorted again
  book.newTrip()
  game.lookAsks = 0
  game.said.clear()
  game.recent = []
  game.answered = []
  game.counted.clear()
  // Each trip starts a tier below the best reached, and climbs back after two quick answers
  game.tier = Math.max(1, game.best - 1)
  game.streak = []
  game.riddle = null
  game.riddleTier = 0
  newRiddle(true)
  // Bear's list is planned on the title: fishing where none of it lives gets one quiet word
  if (game.list && !game.list.some((it) => !it.done && answersHere(it, AMBIENT[place]))) voice.say("Nothing on Bear's list lives here.")
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
  // The sorting page gives older players a clue before the answer (book.js clue)
  getTier: () => (game.state === 'play' ? game.tier : game.best),
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
    // Mid-count, a tap between the arms is a near miss, not "carry on". Taps well away from the
    // count (twice), or anywhere while guessing (twice), mean the child wants to go on fishing.
    const s = fish.show
    if ((s.counting || s.guessing) && !s.looked) {
      const near = (d) => {
        const [dx, dy] = dotXY(d)
        return !d.hidden && Math.hypot(dx - x, dy - y) < 110
      }
      if (s.counting && countNear(x, y)) return
      const close = s.counting && dots.some(near)
      if (!close && ++s.strays >= 2) finishShow()
      return
    }
    if (s.t > 0.7) finishShow()
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
    // Space carries on, even mid-count (Enter or L counts)
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
  ensureList()
  renderList()
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
      if (game.riddleSaidAt && ph === 'idle' && !book.open && clock - game.riddleSaidAt > RIDDLE_QUIET) sayRiddle()
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
      if (game.phase === 'bite' && s === fish.who) s.group.rotation.z = Math.sin(t * 9) * 0.08
    }
    updateBear(dt, t)
    updateBobber(dt, t)
    updateHelp(dt)
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
    game, fish, creatures, world, bob, camera, castTo, reel, tapAt, start, debug, newRiddle, setTier, pickAt, ensureList, renderList,
    advance(seconds) {
      const n = Math.round(seconds * 30)
      for (let i = 0; i < n; i++) frame(1 / 30, i === n - 1)
    },
  }
  window.__adventure = { mission: adventure, game }
}
