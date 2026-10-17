import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Effects } from './effects.js'
import { LANE, Lane, PENGUIN_R, PIN_SPOTS, Pins } from './lane.js'
import { Crowd, Penguin } from './penguin.js'
import { Scenery, THEMES } from './scenery.js'
import { FRAMES, ScoreCard } from './score.js'

const $ = (id) => document.getElementById(id)
const clamp = THREE.MathUtils.clamp
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
const store = {
  get(k) {
    try {
      return localStorage.getItem(`penguin-bowling-${k}`)
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`penguin-bowling-${k}`, String(v))
    } catch {}
  },
}

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600)
let fov = 50 // landscape field of view; eased per game state
let fovScale = 1
const hemi = new THREE.HemisphereLight('#e4f4ff', '#b8d4ff', 1)
scene.add(hemi)
const sun = new THREE.DirectionalLight('#fff4e0', 2.2)
sun.position.set(6, 14, 4)
sun.target.position.set(0, 0, -8)
sun.castShadow = true
const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048
sun.shadow.mapSize.set(shadowSize, shadowSize)
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 14, bottom: -14, near: 1, far: 45 })
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.02
scene.add(sun, sun.target)

const audio = new Audio()
const lane = new Lane(scene)
const pins = new Pins(lane, scene)
const penguin = new Penguin(scene, lane)
const crowd = new Crowd(scene)
const scenery = new Scenery(scene, { hemi, sun, renderer })
const effects = new Effects(scene, camera)
const card = new ScoreCard()
let penguinTemplate = null

// --- Settings -------------------------------------------------------------------------

const MIN_SPEED = 7.5
const MAX_SPEED = 13.5
const MAX_ANGLE = 0.15
const HOOK = 2.6 // sideways pull of a full curve, units/s²
const MAX_X = LANE.half - 0.45 // 1.05
const STEP_X = 0.35 // one ◀ ▶ step
const WOBBLE = 0.014 // radians of random wobble on every slide, so no two slides are quite the same
const HATS = ['crown', 'party', 'tophat', 'fish'] // won one after another, a strike each

const game = {
  state: 'loading', // loading | title | aim | roll | settle | result | over
  theme: store.get('lane') in THEMES ? store.get('lane') : 'village',
  bumpers: store.get('bumpers') !== '0',
  x: 0,
  angle: 0,
  timer: 0,
  standingBefore: 10,
  outcome: null,
  touchedPins: false,
  thrown: 0, // slides this visit; the swipe hint comes sooner for the first few
  swipes: Number(store.get('swipes')) || 0, // slides ever made with a swipe: after three, only the first-aim reminder remains
  hints: 0, // drawn swipes shown this visit
  hat: HATS.includes(store.get('hat')) ? store.get('hat') : null, // the strike hat the penguin wears
  event: null, // the last surprise, so the same one doesn't come twice in a row
  spares: 0, // spares this game, and the spare that last brought the baby penguin
  babyAt: -9,
  hats: (store.get('hats') || '').split(',').filter((h) => HATS.includes(h)), // hats won so far, kept between visits
  stuck: 0,
  hitSoundAt: 0,
  boingAt: 0,
  falls: 0, // pins tipped over so far this slide: each one's "bwoop" is a note higher
  peek: 0, // seconds of a close look at a special rack before aiming
  slowmo: 0, // seconds of gentle slow motion left, as the penguin meets a full rack
  idle: 0, // seconds without a touch while aiming
  resultWait: 2,
  dance: false,
}

if (game.hat && !game.hats.includes(game.hat)) game.hats.push(game.hat)

// --- Layout -----------------------------------------------------------------------------

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // Narrow screens see more upwards and downwards so the lane still fits across.
  fovScale = w >= h ? 1 : clamp(1 / Math.pow(camera.aspect, 0.55), 1, 1.56)
  camera.fov = fov * fovScale
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// --- Physics events: sounds, squash and crowd ------------------------------------------

lane.world.addEventListener('preStep', () => penguin.pull())

penguin.onHit = (e) => {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
  if (e.body.material === lane.bumperMat) {
    // Off a bumper: a springy boing and a squash.
    const now = performance.now()
    if (v > 0.6 && now - game.boingAt > 250) {
      game.boingAt = now
      audio.boing()
      penguin.bump(v / 6)
      effects.puff(penguin.group.position.clone().setY(0.3), 4, 0.4)
    }
    return
  }
  if (e.body.material !== lane.pinMat) return
  if (!game.touchedPins) {
    game.touchedPins = true
    effects.shake = Math.min(0.35, v * 0.035)
    // A full rack gets a moment of slow motion, so the crash can be enjoyed.
    if (game.standingBefore === 10 && v > 4) game.slowmo = 0.55
  }
  if (v > 1) {
    audio.bonk(v / 10)
    penguin.bump(v / 9)
  }
  pins.wake()
}
pins.onHit = (pin, e) => {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
  if (v < 0.8) return
  const now = performance.now()
  if (now - game.hitSoundAt < 35) return
  game.hitSoundAt = now
  pin.squish = Math.max(pin.squish, Math.min(1, v / 4))
  if (e.body.material === lane.pinMat || e.body.material === lane.iceMat || e.body.material === lane.bumperMat) audio.clack(v / 6)
}
scenery.onSpout = (p) => {
  for (let i = 0; i < 14; i++) effects.sparkleAt(p, '#d6f6ff', 1, 2.5)
  effects.puff(p, 8, 1.6, '#e8f8ff')
  audio.squeak(0.6)
}

/** Each pin that tips over says "bwoop", a note higher than the last, in a puff of its own colour. */
function watchFalls() {
  for (const p of pins.list) {
    if (p.removed || p.fell || !pins.isDown(p)) continue
    p.fell = true
    game.falls++
    audio.topple(game.falls)
    const at = p.mesh.position.clone().setY(Math.max(0.25, p.mesh.position.y))
    effects.puff(at, 4, 0.55)
    effects.sparkleAt(at, p.color, 3, 1.6)
    if (p.special === 'gold') {
      audio.gold()
      effects.sparkleAt(at, '#ffe066', 14, 2.4)
      effects.confetti(at.clone().setY(0.6), 30, ['#ffd23f', '#ffe066', '#ffb703', '#fff3b0'])
    } else if (p.special === 'giant') {
      audio.thump()
      effects.shake = Math.max(effects.shake, 0.35)
      effects.puff(at.setY(0.3), 14, 1.2)
    }
  }
}

// --- Aim ----------------------------------------------------------------------------------

/** Where the penguin will go: simple kinematics matching the physics pull. */
function predict(x, angle, speed, hook) {
  const pts = []
  let px = x
  let pz = LANE.start - 0.2
  let vx = Math.sin(angle) * speed
  const vz = -Math.cos(angle) * speed
  const dt = 0.02
  let next = 1.9 // the first dot lies well ahead of the penguin, never across its back
  let travelled = 0
  while (pz > LANE.headPin + 0.3 && pts.length < 14) {
    const ramp = clamp((LANE.start - pz) / 7, 0, 1)
    vx += hook * ramp * dt
    px += vx * dt
    pz += vz * dt
    travelled += Math.hypot(vx, vz) * dt
    if (game.bumpers && Math.abs(px) > LANE.half - 0.1 - PENGUIN_R) {
      px = Math.sign(px) * (LANE.half - 0.1 - PENGUIN_R)
      vx = -vx * 0.55
    }
    if (Math.abs(px) > LANE.half) break
    if (travelled >= next) {
      pts.push({ x: px, z: pz })
      next += 1.0
    }
  }
  return pts
}

const drag = { on: false, pts: [], id: null, aim: null }

/** Turn a swipe (screen points) into a throw: direction, power and curve. */
function swipeToThrow(pts) {
  const a = pts[0]
  const b = pts[pts.length - 1]
  let dx = b.x - a.x
  let dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 24) return null
  // Pulling back (downwards) works like a slingshot: flip it.
  const sling = dy > 0
  if (sling) {
    dx = -dx
    dy = -dy
  }
  if (dy > -len * 0.25) return null // mostly sideways: not a throw
  // Sideways drift in a small finger's swipe is gentle on the aim (gain 0.22), and a mostly-forward
  // swipe is helped towards the pins: half of the way to the line that meets them.
  // On a second slide the help is lighter and the drift counts more, so a spare is a good shot, not a given.
  const raw = Math.atan2(dx, -dy)
  const full = pins.countStanding() === 10
  const assist = Math.abs(raw) < 0.6 ? (full ? 0.5 : 0.38) : full ? 0.2 : 0.13
  const angle = clamp(raw * (full ? 0.22 : 0.26) * (1 - assist) + aimAt() * assist, -MAX_ANGLE, MAX_ANGLE)
  const power = clamp(len / (Math.min(innerWidth, innerHeight) * 0.38), 0.3, 1)
  // Curve: how far the middle of the swipe bulged sideways from the straight line.
  let bulge = 0
  if (!sling && pts.length > 4) {
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    for (const p of pts) {
      const d = (p.x - a.x) * nx + (p.y - a.y) * ny
      if (Math.abs(d) > Math.abs(bulge)) bulge = d
    }
    // Positive bulge = the path swung out to the right
    bulge = clamp((bulge / len) * 4, -1, 1)
    if (Math.abs(bulge) < 0.2) bulge = 0
  }
  return { angle: clamp(angle + bulge * 0.05, -MAX_ANGLE, MAX_ANGLE), power, hook: -bulge * HOOK }
}

/** The straight line from where the penguin stands to the middle of the pins it should go for. */
function aimAt() {
  const up = pins.list.filter((p) => !p.removed && !pins.isDown(p))
  if (!up.length) return 0
  const front = Math.min(...up.map((p) => p.spot.row))
  // A full rack: the head pin. Pins left: the middle of the group the penguin lined up with.
  const group = up.length === 10 ? up.filter((p) => p.spot.row === front) : up.filter((p) => Math.abs(p.body.position.x - game.x) < 0.8)
  const tx = (group.length ? group : up).reduce((a, p) => a + p.body.position.x, 0) / (group.length || up.length)
  return Math.atan2(tx - game.x, LANE.start - LANE.headPin)
}

function currentAim() {
  if (drag.on && drag.aim) return drag.aim
  return { angle: game.angle, power: 0.8, hook: 0 }
}

function updateAimPreview() {
  if (game.state !== 'aim') return lane.hideAim()
  const a = currentAim()
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * a.power
  // Yellow while waiting; pink, bigger and bending with the finger while a swipe is being drawn.
  lane.showAim(predict(game.x, a.angle, speed, a.hook), drag.on ? '#ff6b9d' : '#ffca3a', simT, drag.on && drag.aim ? drag.aim.power : 0)
}

function throwPenguin({ angle, power, hook }, { swiped = false } = {}) {
  if (game.state !== 'aim') return
  if (swiped) store.set('swipes', ++game.swipes)
  game.peek = 0
  audio.unlock()
  game.state = 'roll'
  game.timer = 0
  game.stuck = 0
  game.falls = 0
  game.touchedPins = false
  game.standingBefore = pins.countStanding()
  game.thrown += 1
  hideHint()
  $('controls').classList.add('away')
  lane.hideAim()
  // A real penguin never slides exactly the same way twice: a tiny wobble.
  const wobble = (Math.random() - 0.5) * WOBBLE
  penguin.launch(angle + wobble, MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power, hook)
  audio.whoosh()
  audio.squeak(1.2)
  effects.puff(penguin.group.position, 8, 0.6)
  pins.wake()
}

// --- Rolls and frames -----------------------------------------------------------------

function standingSet() {
  return pins.list.map((p) => !p.removed && !pins.isDown(p))
}

function finishRoll() {
  watchFalls()
  // Pins pushed off the deck are out of play: they puff away now, even ones that landed upright.
  for (const p of pins.clearOffDeck()) effects.puff(p, 6, 0.7)
  // A pin leaning on a fallen one stands up straight, so what stands looks like it stands.
  pins.straighten()
  const standing = pins.countStanding()
  const knocked = game.standingBefore - standing
  const r = card.add(knocked)
  game.outcome = { ...r, knocked }
  game.state = 'result'
  game.timer = 0
  game.resultWait = 0
  updateHud()
  updateRack(standingSet())

  // The penguin, up behind the pins, reacts to what it did.
  if (penguin.state === 'slide') popUp()
  penguin.mood = r.strike ? 'wow' : knocked === 0 ? 'dizzy' : 'joy'
  const deck = new THREE.Vector3(0, 1.6, LANE.headPin - 0.8)
  if (r.strike) {
    newHat()
    if (game.theme === 'aurora') shootingStars()
  } else surprise(knocked, r)
  if (r.strike || r.spare) {
    audio.fanfare()
    audio.twinkle = 64
    audio.cheer(true)
    crowd.start(true)
    if (r.strike) game.dance = 'strike'
    effects.confetti(new THREE.Vector3(0, 0.8, LANE.headPin - 1), r.strike ? 80 : 45)
    effects.glow(deck, r.strike ? 16 : 10)
    game.resultWait = Math.max(game.resultWait, r.strike ? 3.6 : 3)
    return
  }
  if (knocked === 0) {
    audio.whoops()
    crowd.start(false)
    game.resultWait = Math.max(game.resultWait, 2.2)
    return
  }
  audio.jingle(knocked)
  audio.cheer(knocked >= 5)
  crowd.start(knocked >= 5)
  effects.glow(deck, 3 + knocked)
  game.resultWait = Math.max(game.resultWait, 2.3)
}

/** A strike wins the penguin its next hat, put on with a sparkle as it pops up. */
function newHat() {
  // The next hat not won yet; once all are won, the next one along.
  const next = HATS.find((h) => !game.hats.includes(h)) ?? HATS[(HATS.indexOf(game.hat) + 1) % HATS.length]
  game.hat = next
  if (!game.hats.includes(next)) game.hats.push(next)
  store.set('hats', game.hats.join(','))
  store.set('hat', game.hat)
  setTimeout(() => {
    if (game.state !== 'result') return
    penguin.wear(game.hat, pins.templates.fish)
    audio.hat()
    penguin.sqV += 6
    effects.sparkleAt(penguin.group.position.clone().setY(1.3), '#fff3b0', 12, 2)
  }, 450)
}

/**
 * Now and then, something different happens after a slide: a baby penguin dives into a gutter and
 * slides down after the penguin, a shower of snow (the whale's spray in Fishy Bay) drenches the pins,
 * the crowd does a wave, and each lane has its own: a fish leaps over the deck in Fishy Bay, shooting
 * stars streak across the Night lane after a big knock. Every spare gets a party, taking turns: the baby
 * at most every third spare, otherwise the pins' conga, the crowd's wave, the shower or the lane's own.
 * Never the same surprise twice running.
 */
function surprise(knocked, r) {
  let kind = null
  if (r.spare) {
    game.spares++
    const party = ['conga', 'wave', 'shower']
    // Each lane's own party comes up most.
    if (game.theme === 'bay') party.push('leap', 'leap', 'leap')
    if (game.theme === 'aurora') party.push('stars', 'stars', 'stars')
    if (game.spares - game.babyAt >= 3) kind = 'baby'
    else {
      const fresh = party.filter((k) => k !== game.event)
      kind = fresh[Math.floor(Math.random() * fresh.length)]
    }
  } else if (Math.random() < 0.45) {
    const options = ['shower', 'wave']
    if (knocked >= 4 && game.spares - game.babyAt >= 1) options.push('baby')
    if (game.theme === 'bay') options.push('leap', 'leap', 'leap')
    if (game.theme === 'aurora' && knocked >= 4) options.push('stars', 'stars', 'stars')
    const fresh = options.filter((k) => k !== game.event)
    kind = fresh[Math.floor(Math.random() * fresh.length)]
  }
  if (!kind) return
  game.event = kind
  if (kind === 'stars') return shootingStars()
  if (kind === 'conga') {
    game.dance = 'conga'
    game.resultWait = Math.max(game.resultWait, 3.6)
    return
  }
  if (kind === 'wave') {
    crowd.wave((c) => audio.squeak(1.2 + Math.random() * 0.4))
    game.resultWait = Math.max(game.resultWait, 3)
    return
  }
  if (kind === 'leap') {
    leap = { t: -0.5, obj: null }
    game.resultWait = Math.max(game.resultWait, 3.2)
    return
  }
  if (kind === 'baby') {
    game.babyAt = game.spares
    if (crowd.slider(() => audio.whee())) game.resultWait = Math.max(game.resultWait, 3.4)
    return
  }
  const bay = game.theme === 'bay'
  if (bay) scenery.spout()
  setTimeout(() => {
    if (game.state !== 'result') return
    audio.splash()
    effects.flurry(new THREE.Vector3(0, 3.2, LANE.headPin - 0.8), bay ? '#bfe8ff' : '#ffffff')
    for (const p of pins.list) p.squish = 0.8
    penguin.sqV -= 5
  }, bay ? 500 : 150)
  game.resultWait = Math.max(game.resultWait, 3.2)
}

/** Night lane: three shooting stars streak across the sky over the pins, each with a soft twinkle. */
function shootingStars() {
  for (let k = 0; k < 3; k++) {
    setTimeout(() => {
      if (game.state !== 'result' && game.state !== 'aim') return
      const dir = Math.random() < 0.5 ? 1 : -1
      effects.shootingStar(new THREE.Vector3(-dir * (2 + Math.random()), 3.4 + Math.random() * 1.4, LANE.back + 0.6), new THREE.Vector3(dir * 7, -1.6, 0))
      audio.squeak(1.8 + k * 0.15)
    }, 300 + k * 550)
  }
  game.resultWait = Math.max(game.resultWait, 2.8)
}

/** Fishy Bay: a fish leaps out of one gutter, flips over the pins and splashes into the other. */
let leap = null
function updateLeap(dt) {
  if (!leap) return
  leap.t += dt
  if (leap.t < 0) return
  if (!leap.obj) {
    const tpl = pins.templates.fish
    if (!tpl) return (leap = null)
    leap.obj = tpl.clone(true)
    leap.obj.scale.setScalar(0.8)
    leap.dir = Math.random() < 0.5 ? 1 : -1
    scene.add(leap.obj)
    effects.puff(new THREE.Vector3(-leap.dir * 2, 0, LANE.headPin - 0.9), 10, 0.8, '#bfe8ff')
    audio.whee()
  }
  const k = Math.min(1, leap.t / 1.3)
  const x = -leap.dir * 2 + leap.dir * 4 * k
  leap.obj.position.set(x, -0.2 + Math.sin(k * Math.PI) * 2.4, LANE.headPin - 0.9)
  leap.obj.rotation.set(0, leap.dir > 0 ? 0 : Math.PI, Math.PI / 2 - (k - 0.5) * 2.4)
  if (k >= 1) {
    effects.puff(new THREE.Vector3(leap.dir * 2, 0, LANE.headPin - 0.9), 12, 0.9, '#bfe8ff')
    effects.flurry(new THREE.Vector3(leap.dir * 2, 1.2, LANE.headPin - 0.9), '#bfe8ff', 30)
    audio.splash()
    for (const p of pins.list) p.squish = Math.max(p.squish, 0.5)
    leap.obj.removeFromParent()
    leap = null
  }
}

/** The penguin pops up behind the deck, happy while pins are tumbling, dizzy if nothing fell yet. */
function popUp() {
  const b = penguin.body.position
  if (b.y > -0.1) effects.puff(new THREE.Vector3(b.x, 0.3, b.z), 8, 0.7)
  penguin.react(clamp(b.x, -LANE.half + 0.4, LANE.half - 0.4), game.falls ? 'joy' : 'dizzy')
  audio.pop()
  effects.puff(new THREE.Vector3(penguin.x, 0.1, LANE.deckEnd - 0.7), 6, 0.6)
}

/** After the cheering: tidy the pins and get the penguin ready for the next slide. */
function nextRoll() {
  const r = game.outcome
  game.dance = false
  if (card.over) return gameOver()
  crowd.home()
  if (r.resetPins) {
    pins.reset()
    audio.drop()
    specialPin()
  } else {
    for (const p of pins.clearFallen()) effects.puff(p, 5, 0.6)
    audio.poof()
    // For the second slide the penguin waddles over in line with the pins left, so a straight slide can reach them.
    const up = pins.list.filter((p) => !p.removed && !pins.isDown(p))
    // The spot in line with the most pins (a split leaves two groups: it picks the bigger one).
    if (up.length) {
      const mid = up.reduce((a, p) => a + p.body.position.x, 0) / up.length
      let best = 0
      let bestScore = -Infinity
      for (let k = -3; k <= 3; k++) {
        const x = k * STEP_X
        const score = up.filter((p) => Math.abs(p.body.position.x - x) < 0.42).length - Math.abs(x - mid) * 0.1
        if (score > bestScore) {
          bestScore = score
          best = x
        }
      }
      game.x = clamp(best, -MAX_X, MAX_X)
      game.angle = 0
    }
  }
  updateRack(standingSet())
  toAim()
}

/** From the second frame on, about half the fresh racks hold a giant snowman at the front or one golden pin. */
function specialPin() {
  if (card.frame < 1) return
  // Rarely (about one rack in eight), the head pin is a cheeky one that jumps over the penguin.
  if (Math.random() < 0.12) {
    pins.list[0].dodger = true
    return
  }
  if (Math.random() > 0.5) return
  const giant = Math.random() < 0.5
  pins.setSpecial(giant ? pins.list[0] : pins.list[1 + Math.floor(Math.random() * 9)], giant ? 'giant' : 'gold')
  // The camera takes a quick peek at the pins, so the surprise is seen before the slide.
  game.peek = 1.6
  setTimeout(() => (giant ? audio.thump() : audio.gold()), 450)
}

function toAim() {
  effects.clearCelebration()
  game.state = 'aim'
  game.idle = 0
  penguin.ready(game.x)
  audio.squeak(1.1)
  effects.puff(penguin.group.position.clone().setY(0.2), 6, 0.5)
  $('controls').classList.remove('away')
  // More of the band joins in as the game goes on.
  audio.layer = card.frame >= 3 ? 2 : card.frame >= 1 ? 1 : 0
  updateHud()
}

let resultTimers = []
function gameOver() {
  game.state = 'over'
  for (const pos of pins.clearFallen()) effects.puff(pos, 6, 0.5)
  // Dance behind even displaced standing pins, with room for the flippers.
  const back = Math.min(LANE.deckEnd - 0.7, ...pins.list.filter((p) => !p.removed).map((p) => p.body.position.z - 1.3))
  penguin.react(0, 'wow', back)
  hideHint()
  // Each frame as a little rack of the pins it knocked over, a star on strikes and spares: no score.
  // A little penguin hops along them; each one pops in as it lands, and the star frames bounce.
  const medals = card.frames.map((rolls) => {
    const el = document.createElement('div')
    el.className = 'medal'
    const sum = rolls.reduce((a, n) => a + n, 0)
    if (rolls[0] === 10) el.classList.add('star', 'strike')
    else if (rolls.length >= 2 && rolls[0] + rolls[1] === 10) el.classList.add('star', 'spare')
    el.append(miniRack(Math.min(10, sum)))
    return el
  })
  const hopper = Object.assign(document.createElement('span'), { className: 'hopper', textContent: '🐧' })
  $('medals').replaceChildren(...medals, hopper)
  show('results')
  audio.fanfare()
  audio.cheer(true)
  crowd.start(true)
  effects.clearCelebration()
  for (const t of resultTimers) clearTimeout(t)
  resultTimers = medals.map((el, i) => setTimeout(() => {
    hopper.style.transform = `translate(${el.offsetLeft + el.offsetWidth / 2}px, ${el.offsetTop}px)`
    hopper.classList.remove('hop')
    void hopper.offsetWidth
    hopper.classList.add('hop')
    setTimeout(() => {
      el.classList.add('in')
      audio.topple(i * 2 + 1)
      if (el.classList.contains('star')) audio.jingle(8)
    }, 220)
  }, 500 + i * 520))
  resultTimers.push(setTimeout(() => {
    // The little penguin jumps up beside the trophy for its happy dance, clear of the frames.
    hopper.style.transform = ''
    hopper.classList.remove('hop')
    document.querySelector('#results .trophy').append(hopper)
    hopper.classList.add('done')
    audio.cheer(true)
    crowd.start(true)
    effects.confetti(new THREE.Vector3(0, 0.8, LANE.headPin - 1.2), 90)
  }, 500 + medals.length * 520 + 200))
}

/** A tiny triangle of ten dots, back row on top: the first `knocked` pins (front first) filled in. */
function miniRack(knocked) {
  const el = document.createElement('div')
  el.className = 'mini'
  const order = [6, 7, 8, 9, 3, 4, 5, 1, 2, 0] // back row first, as on the lane
  let k = 0
  for (const n of [4, 3, 2, 1]) {
    const row = document.createElement('div')
    for (let j = 0; j < n; j++) {
      const i = order[k++]
      const d = document.createElement('i')
      if (i < knocked) d.className = 'hit'
      row.append(d)
    }
    el.append(row)
  }
  return el
}

// --- HUD ------------------------------------------------------------------------------

function buildCard() {
  $('card').replaceChildren(...Array.from({ length: card.count }, () => document.createElement('i')))
}

/** One pip a frame: the one being played breathes, finished ones fill in, a star for a strike or spare. */
function updateHud() {
  const pips = $('card').children
  for (let i = 0; i < card.count; i++) {
    const rolls = card.frames[i]
    const done = i < card.frame
    const star = rolls.length > 0 && (rolls[0] === 10 || (rolls.length >= 2 && rolls[0] + rolls[1] === 10))
    pips[i].className = done ? (star ? 'done star' : 'done') : i === card.frame && game.state !== 'over' ? 'now' : ''
  }
}

function buildRack() {
  const el = $('rack')
  el.innerHTML = ''
  // Back row on top, the front pin at the bottom, as seen from the penguin
  for (let row = 3; row >= 0; row--) {
    const r = document.createElement('div')
    for (let i = 0; i < PIN_SPOTS.length; i++) if (PIN_SPOTS[i].row === row) r.appendChild(Object.assign(document.createElement('i'), { id: `rack-${i}` }))
    el.appendChild(r)
  }
}

function updateRack(standing) {
  standing.forEach((up, i) => {
    const d = $(`rack-${i}`)
    d.classList.toggle('down', !up)
    d.style.background = up ? pins.list[i]?.color ?? '' : ''
  })
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play' && screen !== 'results')
  $('results').classList.toggle('hidden', screen !== 'results')
  $('hud').classList.toggle('over', screen === 'results')
  $('controls').classList.toggle('hidden', screen !== 'play')
}

/**
 * The drawn swipe: a finger sliding up a dotted trail from the penguin, only while nobody is touching,
 * After three swipes, only one first-aim reminder is shown per visit.
 */
function hideHint() {
  game.idle = 0
  if ($('hint').classList.contains('hidden')) return
  $('hint').classList.add('hidden')
}
const hintAt = new THREE.Vector3()
/** The drawn swipe starts from wherever the penguin stands on screen. */
function placeHint() {
  if ($('hint').classList.contains('hidden')) return
  hintAt.copy(penguin.group.position).project(camera)
  $('hint').style.left = `${((hintAt.x + 1) / 2) * innerWidth}px`
}
function maybeHint() {
  const firstAimReminder = game.thrown === 0 && game.hints === 0
  if ((game.swipes >= 3 && !firstAimReminder) || game.hints >= 5 || !$('hint').classList.contains('hidden')) return
  if (game.idle < (game.swipes >= 3 ? 8 : game.thrown < 3 ? 2.5 : 9)) return
  game.hints++
  $('hint').classList.remove('hidden')
}

// --- Screens ------------------------------------------------------------------------------

function setTheme(name) {
  game.theme = name
  store.set('lane', name)
  for (const b of document.querySelectorAll('.lane-btn')) b.classList.toggle('on', b.dataset.theme === name)
  scenery.setTheme(name)
  lane.setNight(THEMES[name].night)
  pins.build(THEMES[name].pins)
  pins.list.forEach((p) => (p.drop = 0))
  audio.setTune(name)
}

function setBumpers(on) {
  game.bumpers = on
  store.set('bumpers', on ? '1' : '0')
  lane.setBumpers(on)
  $('bumpers').classList.toggle('on', on)
  $('bumpers').setAttribute('aria-pressed', String(on))
}

/** The hat wardrobe on the title card: hats won with strikes, tap one to wear it (tap again to take it off). */
function updateWardrobe() {
  for (const b of document.querySelectorAll('#wardrobe button')) {
    const won = game.hats.includes(b.dataset.hat)
    b.setAttribute('aria-disabled', String(!won))
    b.classList.toggle('won', won)
    b.classList.toggle('on', won && game.hat === b.dataset.hat)
  }
}
for (const b of document.querySelectorAll('#wardrobe button')) {
  b.addEventListener('click', () => {
    audio.unlock()
    if (!game.hats.includes(b.dataset.hat)) {
      b.classList.remove('wobble')
      void b.offsetWidth
      b.classList.add('wobble')
      audio.tone({ freq: 420, type: 'sine', gain: 0.08, decay: 0.16, slide: 280 })
      penguin.glance = 1.1
      penguin.glanceSide = [...b.parentElement.children].indexOf(b) < 2 ? -1 : 1
      return
    }
    game.hat = game.hat === b.dataset.hat ? null : b.dataset.hat
    store.set('hat', game.hat ?? '')
    penguin.wear(game.hat, pins.templates.fish)
    penguin.poke()
    penguin.sqV += 7
    audio.hat()
    if (game.hat) effects.sparkleAt(penguin.group.position.clone().setY(1.2), '#fff3b0', 14, 1.8)
    else effects.puff(penguin.group.position.clone().setY(1.1), 6, 0.4)
    updateWardrobe()
  })
}

function toTitle() {
  for (const t of resultTimers) clearTimeout(t)
  leap?.obj?.removeFromParent()
  leap = null
  crowd.home()
  game.state = 'title'
  game.dance = false
  hideHint()
  lane.hideAim()
  effects.clearCelebration()
  pins.reset()
  pins.list.forEach((p) => (p.drop = 0))
  game.x = 0
  penguin.ready(0)
  penguin.face = 0
  updateWardrobe()
  show('title')
}

function start() {
  for (const t of resultTimers) clearTimeout(t)
  game.event = null
  game.spares = 0
  game.babyAt = -9
  leap?.obj?.removeFromParent()
  leap = null
  crowd.home()
  audio.twinkle = 0
  audio.unlock()
  audio.click()
  card.reset(FRAMES)
  buildCard()
  pins.reset()
  game.x = 0
  game.angle = 0
  penguin.face = Math.PI
  show('play')
  updateRack(standingSet())
  audio.drop()
  toAim()
}

for (const b of document.querySelectorAll('.lane-btn')) {
  b.addEventListener('click', () => {
    audio.unlock()
    audio.squeak(1)
    setTheme(b.dataset.theme)
  })
}
$('bumpers').addEventListener('click', () => {
  audio.unlock()
  if (game.bumpers) audio.whoops()
  else audio.boing()
  setBumpers(!game.bumpers)
})
$('play').addEventListener('click', start)
$('again').addEventListener('click', start)
holdButton($('to-home'), () => {
  audio.click()
  toTitle()
}, { ms: 600 })
/**
 * The top-bar buttons need a short press-and-hold (a ring fills around them), so a stray tap or a mash
 * never ends a game or turns the sound off. `instant()` says when a plain tap is enough.
 */
const touching = new Set() // every finger (or mouse button) down anywhere on the page
let spoiled = false // a second finger landed during a hold: no hold starts again until every finger is up
const holdStops = new Set()
document.addEventListener('pointerdown', (e) => {
  touching.add(e.pointerId)
  // Any other finger anywhere (a resting palm on the lane, a second tap) cancels a running hold.
  if (touching.size > 1) {
    if (holdStops.size) spoiled = true
    for (const stop of holdStops) stop()
  }
}, true)
// Ghost clicks: when a hold fires with the finger still down and the screen changes (to the title), the
// finger's lift would click whatever is now under it. The next click after that lift is swallowed.
let ghostFinger = null
let ghostUntil = 0
for (const ev of ['pointerup', 'pointercancel']) {
  document.addEventListener(ev, (e) => {
    touching.delete(e.pointerId)
    if (!touching.size) spoiled = false
    if (e.pointerId === ghostFinger) {
      ghostFinger = null
      ghostUntil = performance.now() + 500
    }
  }, true)
}
document.addEventListener('click', (e) => {
  if (ghostFinger === null && performance.now() > ghostUntil) return
  e.preventDefault()
  e.stopPropagation()
  ghostUntil = 0
}, true)

function holdButton(btn, fn, { ms = 600 } = {}) {
  let raf = 0
  let pointer = null // the finger that started the hold
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
    pointer = null
    holdStops.delete(stop)
    btn.style.setProperty('--hold', 0)
    btn.classList.remove('holding')
  }
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    audio.unlock()
    // A hold starts only when this is the one finger on the whole screen.
    if (touching.size !== 1 || spoiled) {
      spoiled = true
      return stop()
    }
    stop()
    const id = (pointer = e.pointerId)
    holdStops.add(stop)
    let lastTick = performance.now()
    let elapsed = 0
    btn.classList.add('holding')
    audio.click()
    const tick = () => {
      if (pointer !== id || spoiled) return
      const now = performance.now()
      // A stalled render must not turn a queued short tap into a completed hold.
      elapsed += Math.min(50, now - lastTick)
      lastTick = now
      const held = Math.min(1, elapsed / ms)
      btn.style.setProperty('--hold', held)
      if (held >= 1) {
        stop()
        if (touching.has(id)) ghostFinger = id
        return fn()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  })
  // Only the starting finger lifting (or being lost) ends the hold early.
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, (e) => {
    if (e.pointerId === pointer) stop()
  })
  // Enter or Space on a focused button still works straight away.
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    fn()
  })
}
holdButton($('home'), () => {
  audio.poof()
  toTitle()
}, { ms: 700 })

const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'

}
// Sound choices last only for this visit; old saved mutes are ignored.
holdButton(soundBtn, () => {
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
// Music, like sound, always starts on for a fresh visit.
function setMusic(on) {
  audio.musicOn = on
  musicBtn.classList.toggle('off', !on)

}

holdButton(musicBtn, () => {
  setMusic(!audio.musicOn)
  audio.click()
})

// --- Input ----------------------------------------------------------------------------

function move(dir) {
  if (game.state !== 'aim') return
  hideHint()
  game.x = clamp(Math.round((game.x + dir * STEP_X) / STEP_X) * STEP_X, -MAX_X, MAX_X)
  penguin.x = game.x
  penguin.hop = Math.max(penguin.hop, 0.5)
  audio.squeak(0.8 + Math.random() * 0.3)
}

// The slide button: about straight ahead, with a little natural give in the push-off and the line, so
// pressing it is a lucky dip while a swipe (the way to aim) is in the child's own hands.
// A second slide's Go wanders a little more, so near-misses happen and a swipe is worth it.
const go = () => {
  const spread = pins.countStanding() < 10 ? 0.11 : 0.12
  throwPenguin({ angle: game.angle + (Math.random() - 0.5) * spread, power: 0.58 + Math.random() * 0.32, hook: 0 })
}

/** A finger that lands on a button and then slides up the screen is a swipe after all, not a press. */
function startDrag(e, x = e.clientX, y = e.clientY) {
  drag.on = true
  drag.id = e.pointerId
  drag.pts = [{ x, y }]
  drag.aim = null
  drag.tapPenguin = false
}
const SWIPE_SLOP = 22

/** A button that acts on a tap (`fn`), or repeats while held (`repeat`), and hands a slide-up over to the swipe. */
function pressable(id, fn, { repeat = false } = {}) {
  const el = $(id)
  let press = null
  let iv = 0
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    audio.unlock()
    hideHint()
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, swiping: false }
    el.setPointerCapture?.(e.pointerId)
    if (repeat) {
      fn()
      clearInterval(iv)
      iv = setInterval(fn, 180)
    }
  })
  el.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || press.swiping || game.state !== 'aim') return
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < SWIPE_SLOP) return
    press.swiping = true
    clearInterval(iv)
    startDrag(e, press.x, press.y)
  })
  const end = (e, cancelled) => {
    if (!press || e.pointerId !== press.id) return
    clearInterval(iv)
    const p = press
    press = null
    if (p.swiping) return cancelled ? cancelDrag() : endDrag(e)
    if (!repeat && !cancelled) fn()
  }
  el.addEventListener('pointerup', (e) => end(e, false))
  el.addEventListener('pointercancel', (e) => end(e, true))
}
pressable('left', () => move(-1), { repeat: true })
pressable('right', () => move(1), { repeat: true })
pressable('go', () => go())

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.unlock()
  hideHint()
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  // The baby penguins on the snow banks hop and cheep when tapped, any time.
  const baby = crowd.poke(e.clientX, e.clientY, camera)
  if (baby) {
    audio.squeak(1.35 + Math.random() * 0.3)
    effects.sparkleAt(baby, '#fff3b0', 4, 1.2)
  }
  // Tapping the penguin makes it hop, spin and squeak (also on the title screen)
  const onPenguin = raycaster.intersectObject(penguin.group, true).length > 0
  if (game.state === 'title' && onPenguin && penguin.poke()) audio.squeak(1 + Math.random() * 0.3)
  if (game.state !== 'aim') return
  startDrag(e)
  drag.tapPenguin = onPenguin
  canvas.setPointerCapture?.(e.pointerId)
})
// Moves arrive at the canvas or at a button whose press turned into a swipe; both bubble here.
addEventListener('pointermove', (e) => {
  if (!drag.on || e.pointerId !== drag.id) return
  drag.pts.push({ x: e.clientX, y: e.clientY })
  if (drag.pts.length > 80) drag.pts.splice(1, 1)
  drag.aim = swipeToThrow(drag.pts)
})
function endDrag(e) {
  if (!drag.on || e.pointerId !== drag.id) return
  drag.on = false
  drag.pts.push({ x: e.clientX, y: e.clientY })
  const t = swipeToThrow(drag.pts)
  drag.aim = null
  if (t) return throwPenguin(t, { swiped: true })
  if (drag.tapPenguin && penguin.poke()) return audio.squeak(1 + Math.random() * 0.3)
  // A tapped snowman (or fish) jiggles and boops.
  const hit = raycaster.intersectObjects(pins.list.filter((p) => p.mesh.visible && !p.removed).map((p) => p.mesh), true)[0]
  const pin = hit && pins.list.find((p) => hit.object === p.mesh || p.mesh.getObjectById(hit.object.id))
  if (pin) {
    pin.squish = 1
    audio.squeak(1.5 + pin.i * 0.05)
    effects.sparkleAt(pin.mesh.position.clone().setY(0.8), pin.color, 3, 1)
  }
}
function cancelDrag() {
  drag.on = false
  drag.aim = null
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', cancelDrag)
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.cancelable && e.preventDefault(), { passive: false })

const keys = new Set()
addEventListener('keydown', (e) => {
  audio.unlock()
  hideHint()
  const k = e.key.toLowerCase()
  // Escape leaves only from the results card; during play 🏠 is held instead.
  if (k === 'escape' && game.state === 'over') return toTitle()
  if ((game.state === 'title' || game.state === 'over') && (k === 'enter' || k === ' ')) {
    e.preventDefault()
    return start()
  }
  if (k === ' ' || k === 'enter' || k === 'arrowup' || k === 'w') {
    e.preventDefault()
    if (!e.repeat) go()
    return
  }
  if (k === 'a') return move(-1)
  if (k === 'd') return move(1)
  if (['arrowleft', 'arrowright'].includes(k)) {
    e.preventDefault()
    keys.add(k)
  }
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())

function updateKeys(dt) {
  if (game.state !== 'aim') return
  if (keys.has('arrowleft')) game.angle = clamp(game.angle - dt * 0.18, -MAX_ANGLE, MAX_ANGLE)
  if (keys.has('arrowright')) game.angle = clamp(game.angle + dt * 0.18, -MAX_ANGLE, MAX_ANGLE)
}

// --- Camera ------------------------------------------------------------------------------

const camPos = new THREE.Vector3(0, 2.4, 6)
const camLook = new THREE.Vector3(0, 0.4, -8)
const titleOff = [0, 0] // where on screen the camera puts the title penguin (eased)
const wantPos = new THREE.Vector3()
const wantLook = new THREE.Vector3()

/**
 * Camera framing per state. Aiming uses a long lens from further back, so the
 * pins at the far end look big while the penguin stays the same size.
 * [landscape, portrait] pairs; aim and deck add a third, for sideways phones.
 * Sideways phones stand further back with a longer lens: pins as big, and the
 * whole penguin fits above the bottom edge.
 */
const CAM = {
  aim: { fov: [17, 19, 13], back: [14, 12, 13.5], up: [4.4, 4.3, 4.3], look: [-9.5, -8.8, -6.0] },
  roll: { fov: 40, back: [5.6, 6.6], up: [2.9, 3.4] },
  // After the crash: close on the deck, with the penguin peeking up behind the pins.
  deck: { fov: [27, 35, 29], back: [6.6, 6.2, 6.6], up: [3.4, 3.4, 3.2], look: [-2.4, -2.3, -2.2] },
}

function updateCamera(dt, t) {
  const pi = camera.aspect < 1 ? 1 : 0
  let wantFov = 50
  switch (game.state) {
    case 'loading': {
      const a = Math.sin(t * 0.15) * 0.5
      wantPos.set(Math.sin(a) * 5, 2.6, LANE.start + 4 + Math.cos(a) * 1.5)
      wantLook.set(0, 0.5, -8)
      break
    }
    case 'title': {
      // In front of the penguin, which turns to face us: the lane and pins behind it, and its hat in clear view.
      wantFov = 40
      wantPos.set(Math.sin(t * 0.2) * 0.3, 1.25, LANE.start + (pi ? 4.6 : 3.6))
      wantLook.set(0, 0.75, LANE.start)
      break
    }
    case 'aim': {
      if (game.peek > 0) {
        const d = CAM.deck
        const di = pi || (innerHeight <= 520 ? 2 : 0)
        wantFov = d.fov[di]
        wantPos.set(0, d.up[di], LANE.headPin + d.back[di])
        wantLook.set(0, 0.4, LANE.headPin + d.look[di])
        break
      }
      const c = CAM.aim
      const ai = pi || (innerHeight <= 520 ? 2 : 0)
      // Very short sideways screens (~260-330px tall): a touch wider, so the
      // back pins stay below the top bar and the penguin above the buttons.
      wantFov = c.fov[ai] * (ai === 2 ? 1 + clamp((330 - innerHeight) / 300, 0, 0.25) : 1)
      wantPos.set(game.x * 0.5, c.up[ai], LANE.start + c.back[ai])
      wantLook.set(game.x * 0.15, 0, c.look[ai])
      break
    }
    case 'roll': {
      const c = CAM.roll
      wantFov = c.fov
      const z = Math.max(penguin.body.position.z + c.back[pi], LANE.headPin + CAM.deck.back[pi])
      wantPos.set(penguin.body.position.x * 0.4, c.up[pi], z)
      wantLook.set(penguin.body.position.x * 0.2, 0.2, Math.max(z - 10, LANE.headPin + CAM.deck.look[pi]))
      break
    }
    case 'settle':
    case 'result':
    case 'over': {
      const c = CAM.deck
      const di = pi || (innerHeight <= 520 ? 2 : 0)
      wantFov = c.fov[di]
      wantPos.set(0, c.up[di] + (game.dance ? 0.3 : 0), LANE.headPin + c.back[di] + (game.dance ? 0.6 : 0))
      wantLook.set(0, game.dance ? 1.0 : 0.4, LANE.headPin + c.look[di])
      break
    }
  }
  const k = game.state === 'roll' ? 6 : 2.5
  camPos.x = damp(camPos.x, wantPos.x, k, dt)
  camPos.y = damp(camPos.y, wantPos.y, k, dt)
  camPos.z = damp(camPos.z, wantPos.z, k, dt)
  camLook.lerp(wantLook, 1 - Math.exp(-k * dt))
  if (Math.abs(fov - wantFov) > 0.01) {
    fov = damp(fov, wantFov, k, dt)
    camera.fov = fov * fovScale
    camera.updateProjectionMatrix()
  }
  const sh = effects.shake * effects.shake * 0.3
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z)
  camera.lookAt(camLook)
  // On the title the penguin sits beside the card: under it when upright, to its right when sideways.
  const portrait = camera.aspect < 1
  const want = game.state === 'title' ? (portrait ? [0, -0.66] : [0.5, -0.12])
    : game.state === 'over' ? [0, 0.42] : [0, 0]
  titleOff[0] = damp(titleOff[0], want[0], k, dt)
  titleOff[1] = damp(titleOff[1], want[1], k, dt)
  if (Math.abs(titleOff[0]) + Math.abs(titleOff[1]) > 0.001) {
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    camera.rotateY(Math.atan(titleOff[0] * ty * camera.aspect))
    camera.rotateX(Math.atan(-titleOff[1] * ty))
  }
}

// --- Loading ----------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  const [pg, pn, wd] = await Promise.allSettled([
    loader.loadAsync('./models/penguin.glb'),
    loader.loadAsync('./models/pins.glb'),
    loader.loadAsync('./models/world.glb'),
  ])
  if (pg.status === 'fulfilled') {
    penguinTemplate = pg.value.scene.getObjectByName('penguin')
    penguin.setModel(penguinTemplate.clone(true))
  } else console.warn('penguin.glb failed', pg.reason)
  if (pn.status === 'fulfilled') pins.attach(pn.value)
  else console.warn('pins.glb failed', pn.reason)
  if (wd.status === 'fulfilled') scenery.attach(wd.value)
  else console.warn('world.glb failed', wd.reason)
  crowd.build(penguinTemplate, ['#ffca3a', '#4cc9f0', '#8ac926', '#9b5de5', '#ff9f1c', '#2ec4b6', '#ff6b9d', '#1982c4'])
  buildRack()
  buildCard()
  setTheme(game.theme)
  setBumpers(game.bumpers)
  penguin.wear(game.hat, pins.templates.fish)
  toTitle()
  renderer.compile(scene, camera)
}

// --- Loop -----------------------------------------------------------------------------

const timer = new THREE.Timer()
timer.connect(document)

let simT = 0
function frame(fixedDt) {
  timer.update()
  const realDt = fixedDt ?? Math.min(timer.getDelta(), 1 / 20)
  // Slow motion eases in and out over the first crash into a full rack.
  game.slowmo = Math.max(0, game.slowmo - realDt)
  const dt = realDt * (game.slowmo > 0 ? 0.4 + 0.6 * (1 - Math.sin((game.slowmo / 0.55) * Math.PI)) : 1)
  simT += dt
  const t = simT
  game.timer += dt
  updateKeys(dt)

  if (game.state === 'roll' || game.state === 'settle' || game.state === 'aim' || game.state === 'title') lane.world.step(1 / 120, dt, 4)
  if (game.state === 'roll' || game.state === 'settle') watchFalls()

  if (game.state === 'roll') {
    const b = penguin.body
    const speed = Math.hypot(b.velocity.x, b.velocity.z)
    audio.slide(b.position.y > 0 ? speed : speed * 0.5)
    if (speed > 2 && b.position.y > -0.1 && Math.random() < 0.8) effects.spray(penguin.group.position.clone().setY(0.1), speed)
    game.stuck = speed < 0.4 ? game.stuck + dt : 0
    if (b.position.z < LANE.deckEnd - 0.6 || b.position.y < -0.4 || game.stuck > 0.6 || game.timer > 7) {
      game.state = 'settle'
      game.timer = 0
      audio.slide(0)
      if (b.position.z < LANE.deckEnd) effects.puff(new THREE.Vector3(b.position.x, 0, LANE.deckEnd - 1), 10, 1)
    }
  } else if (game.state === 'settle') {
    // Once the penguin has tumbled into the pit (or stopped), it pops up behind the pins to watch them fall.
    if (penguin.state === 'slide' && (penguin.body.position.y < -0.3 || game.timer > 0.5)) popUp()
    if ((game.timer > 1.1 && !pins.moving()) || game.timer > 3.4) finishRoll()
  } else if (game.state === 'aim' && (drag.on || game.peek > 0)) {
    // Any touch ends the peek at a special rack.
    game.peek = drag.on ? 0 : game.peek - dt
  } else if (game.state === 'aim') {
    // Wait for idle before offering the drawn swipe or the once-per-visit reminder.
    game.idle += dt
    maybeHint()
  } else if (game.state === 'result') {
    if (game.timer > game.resultWait) nextRoll()
  }

  if (game.state === 'result' && game.dance && game.timer > 0.7) {
    if (game.timer - dt <= 0.7) {
      for (const p of pins.list) effects.puff(new THREE.Vector3(p.spot.x, 0.3, p.spot.z), 2, 0.5)
      audio.drop()
    }
    if (game.dance === 'conga') {
      pins.conga(game.timer - 0.7)
      // A little hop-hop beat for the conga line.
      if (Math.floor((game.timer - 0.7) * 3) !== Math.floor((game.timer - 0.7 - dt) * 3)) audio.topple(Math.floor((game.timer - 0.7) * 3) % 5 + 3)
    } else pins.dance(game.timer)
  } else pins.sync(dt)
  // The cheeky head pin jumps over the penguin as it arrives, then lands back on its spot.
  for (const p of pins.list) {
    if (p.dodger && p.jump === undefined && game.state === 'roll' && penguin.body.position.z < LANE.headPin + 2.4) {
      p.dodger = false
      pins.dodge(p)
      audio.boing()
      audio.squeak(1.6)
    }
    if (pins.updateDodge(p, dt)) {
      audio.thump()
      effects.puff(new THREE.Vector3(p.spot.x, 0.1, p.spot.z), 8, 0.7)
    }
  }

  // The golden pin twinkles now and then while it stands.
  for (const p of pins.list) {
    if (p.special === 'gold' && !p.fell && !p.removed && Math.random() < dt * 7) effects.sparkleAt(p.mesh.position.clone().add({ x: (Math.random() - 0.5) * 0.4, y: 0.1 + Math.random() * 0.6, z: 0 }), '#fff3b0', 1, 0.5)
  }
  updateLeap(dt)
  penguin.update(dt, t)
  crowd.update(dt, t)
  scenery.update(dt, t)
  effects.update(dt)
  updateAimPreview()
  updateCamera(dt, t)
  placeHint()
  audio.updateMusic(game.state !== 'loading')
  renderer.render(scene, camera)
}
renderer.setAnimationLoop(() => frame())

show('loading')
load()
if (new URLSearchParams(location.search).has('debug')) window.__pb = { CAM, frame, surprise, shootingStars, newHat, scene, camera, effects, game, lane, pins, penguin, crowd, audio, scenery, card, throwPenguin, renderer }
