import { createPrediction, pins as pinWord } from './prediction.js'
import { COUNT_ALOUD, createVoice } from './speech.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Counter, Mist, Spot, zoneOf } from './count.js'
import { Effects } from './effects.js'
import { LANE, Lane, PENGUIN_R, PIN_H, PIN_SPOTS, Pins } from './lane.js'
import { Crowd, Penguin } from './penguin.js'
import { Scenery, THEMES } from './scenery.js'
import { FRAMES, SHORT_FRAMES, ScoreCard } from './score.js'

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

/** Spoken words for pre-readers, quiet when the game is muted. Words queue; taps interrupt. */
const voice = createVoice({ muted: audio.muted, rate: 0.9, pitch: 1.1 })
const counter = new Counter(scene)
const spot = new Spot(scene, LANE.start - 1.2, LANE.headPin + 2.5)
const mist = new Mist(scene, LANE.headPin + 0.5, LANE.deckEnd + 0.4, LANE.half)

// --- Settings -------------------------------------------------------------------------

const MIN_SPEED = 7.5
const MAX_SPEED = 13.5
const MAX_ANGLE = 0.15
const HOOK = 2.6 // sideways pull of a full curve, units/s²
const MAX_X = LANE.half - 0.45 // 1.05
const STEP_X = 0.35 // one ◀ ▶ step; MAX_X is three of them, so the footprints are always reachable
const WOBBLE = 0.006 // radians of random wobble on every slide (about ±3.5 cm at the pins): enough that no two
// slides are the same, small enough that where the penguin stands decides about how many fall

const game = {
  state: 'loading', // loading | title | aim | roll | settle | result | over
  theme: store.get('lane') in THEMES ? store.get('lane') : 'village',
  bumpers: store.get('bumpers') !== '0',
  short: store.get('frames') === String(SHORT_FRAMES), // a five-frame game for the youngest
  x: 0,
  angle: 0,
  curve: 0, // -1 left, 0 straight, 1 right
  timer: 0,
  standingBefore: 10,
  outcome: null,
  touchedPins: false,
  thrown: Number(store.get('thrown')) || 0,
  stuck: 0,
  hitSoundAt: 0,
  idle: 0, // seconds without a touch while aiming
  resultWait: 2,
  bonds: new Map(), // the ways to make 10 met this game: "7+3" -> { self, plan } (worked out by the child; made as planned)
  bondKey: '', // the bond of the roll being counted
  // How the pins left standing are counted, and how much help the spare gets, adapting to the child:
  // 1 = tap each standing pin to count it (taps on fallen pins don't count); "where?" lays a footprint trail.
  // 2 = work out the missing part of the bond (7 + ? = 10) from three numbers; "where?" marks only where to stand.
  //     Each fresh rack starts with an optional plan ("knock 7, leave 3"), chosen from ways to make 10
  //     not met yet, so a strong bowler meets new numbers and where to stand matters.
  // 3 = the same bond on a 1-10 number strip, with plans; the spare is the child's own plan:
  //     rings only, no question, no trail.
  // With only a few pins standing, tiers 2 and 3 sometimes ask for the fallen part instead ("? + 1 = 10").
  // Three careful counts move a child from 1 to 2, four right answers from 2 to 3; two misses in a row move them back.
  tier: [1, 2, 3].includes(Number(store.get('tier'))) ? Number(store.get('tier')) : 1,
  selfCounts: 0,
  rights: 0,
  misses: 0,
  counting: null, // { up, fallen, tapped, slips, asked } while the pins left are being counted
  countsAloud: 0, // counts this game where the voice says the numbers with the child's taps
  tapHints: 0, // the finger over the first pin, shown for the first two counts of a game
  wrongSides: 0, // wrong "where / which side" answers this game; the first three are explained aloud
  asked: 0, // spoken "where / which side" questions this game; later ones are pictures only
  ask: null, // 'where' | 'more' while that question is open
  askOk: [], // the sides that answer it
  plan: null, // tiers 2-3: { k, got } — knock k on the first slide of this rack; got is what fell
  plansAsked: 0, // spoken plan questions this game
  planSaid: false, // the first plan of a game is read out
  bondsSaid: 0, // "7 and 3 make 10." sentences this game; the first four new ways are said
  onSpot: false, // the penguin stands on the footprints
  veil: null, // { f } while a bond question is open: frame f's numbers, the rack map and the plan result hide
  ignored: 0, // tier 1: counts in a row the child let the game do; after two, the rest light together
  planHits: 0, // plans this game that came out exactly
  planNear: 0, // plans this game that came out one away
  bumperOffer: false, // tier 3: "bumpers down?" has been offered this game
}

const prediction = createPrediction({
  button: $('predict-pins'),
  hud: $('hud'),
  getStanding: () => pins.countStanding(),
  // The same triangle as the lane and the rack: back row first, knocked pins as gaps.
  getLayout: () => {
    const up = standingSet()
    return [3, 2, 1, 0].map((row) => PIN_SPOTS.flatMap((s, i) => (s.row === row ? [up[i]] : [])))
  },
  voice,
  sound: (kind) => {
    audio.unlock()
    if (kind === 'tap') audio.squeak(0.9 + Math.random() * 0.4)
    else if (kind === 'keep') audio.jingle(3)
    else if (kind === 'exact') setTimeout(() => audio.jingle(10), 500)
  },
  // Drop any aim in progress so the penguin doesn't launch when the dialog closes.
  onOpen: () => {
    keys.clear()
    drag.on = false
    drag.aim = null
  },
})

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

// --- Physics events: sounds and crowd -----------------------------------------------------

lane.world.addEventListener('preStep', () => penguin.pull())

penguin.onHit = (e) => {
  if (e.body.material !== lane.pinMat) return
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
  if (!game.touchedPins) {
    game.touchedPins = true
    effects.shake = Math.min(0.3, v * 0.03) // a small physical bump only
  }
  if (v > 1) audio.bonk(v / 10)
  pins.wake()
}
pins.onHit = (pin, e) => {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
  if (v < 0.8) return
  const now = performance.now()
  if (now - game.hitSoundAt < 35) return
  game.hitSoundAt = now
  if (e.body.material === lane.pinMat || e.body.material === lane.iceMat || e.body.material === lane.bumperMat) audio.clack(v / 6)
}
scenery.onSpout = (p) => {
  for (let i = 0; i < 14; i++) effects.sparkleAt(p, '#d6f6ff', 1, 2.5)
  effects.puff(p, 8, 1.6, '#e8f8ff')
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
  let next = 0.9
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
  const angle = clamp(Math.atan2(dx, -dy) * 0.4, -MAX_ANGLE, MAX_ANGLE)
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

function currentAim() {
  if (drag.on && drag.aim) return drag.aim
  return { angle: game.angle, power: 0.8, hook: game.curve * HOOK }
}

function updateAimPreview() {
  if (game.state !== 'aim') return lane.hideAim()
  const a = currentAim()
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * a.power
  lane.showAim(predict(game.x, a.angle, speed, a.hook), drag.on ? '#ff6b9d' : '#ffca3a')
}

function throwPenguin({ angle, power, hook }) {
  if (game.state !== 'aim') return
  audio.unlock()
  prediction.rolling()
  game.state = 'roll'
  game.timer = 0
  game.stuck = 0
  game.touchedPins = false
  game.standingBefore = pins.countStanding()
  game.thrown += 1
  store.set('thrown', game.thrown)
  $('hint').classList.add('hidden')
  $('controls').classList.add('away')
  $('where').hidden = true
  $('plan').hidden = true
  game.ask = null
  spot.hide()
  counter.fade()
  lane.hideAim()
  // A real penguin never slides exactly the same way twice: a tiny wobble, so the
  // same throw from the same spot doesn't always give the same pins.
  const wobble = (Math.random() - 0.5) * WOBBLE
  penguin.launch(angle + wobble, MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power, hook)
  audio.whoosh()
  audio.squeak(1.2)
  effects.puff(penguin.group.position, 6, 0.5)
  pins.wake()
}

// --- Rolls and frames -----------------------------------------------------------------

function standingSet() {
  return pins.list.map((p) => !p.removed && !pins.isDown(p))
}

/** The pins still up, in counting order: front row first, left to right. */
function standingPins() {
  return pins.list
    .filter((p) => !p.removed && !pins.isDown(p))
    .map((p) => ({ i: p.i, x: p.body.position.x, z: p.body.position.z, color: p.color, row: p.spot.row }))
    .sort((a, b) => a.row - b.row || a.x - b.x)
}

const pinIcon = (color, id) => {
  const i = document.createElement('i')
  i.className = 'pin-ic'
  i.style.setProperty('--c', color)
  if (id) i.id = id
  return i
}

/** The number bond for the whole rack: fallen + standing = 10, as two groups of pins. */
function showBond(up) {
  const fallen = pins.list.filter((p) => p.removed || pins.isDown(p))
  const f = $('bond-fallen')
  const s = $('bond-standing')
  f.replaceChildren(...fallen.map((p) => pinIcon(p.color)))
  s.replaceChildren(...up.map((p) => {
    const ic = pinIcon(p.color, `bond-pin-${p.i}`)
    ic.dataset.pin = p.i
    return ic
  }))
  f.style.setProperty('--cols', Math.max(1, Math.min(5, fallen.length)))
  s.style.setProperty('--cols', Math.max(1, Math.min(5, up.length)))
  $('bond-fallen-n').textContent = fallen.length
  // The standing number grows as the pins are counted.
  $('bond-standing-n').textContent = up.length ? '' : '0'
  $('bond').classList.remove('guess', 'guess-fallen')
  $('bond').setAttribute('aria-label', `${fallen.length} fell and ${up.length} standing make 10`)
  $('bond').hidden = false
  game.bondKey = `${fallen.length}+${up.length}`
  if (!game.bonds.has(game.bondKey)) game.bonds.set(game.bondKey, { self: false, plan: false })
  return fallen.length
}

/** This roll's way to make 10 was worked out by the child ('self') or made just as planned ('plan'). */
const markBond = (flag) => {
  const b = game.bonds.get(game.bondKey)
  if (b) b[flag] = true
}

function finishRoll() {
  // Pins pushed off the deck are out of play: they puff away now, even ones that landed upright.
  for (const p of pins.clearOffDeck()) effects.puff(p, 6, 0.7)
  const standing = pins.countStanding()
  const knocked = game.standingBefore - standing
  const guessed = prediction.guess !== null
  prediction.result(knocked, standing, game.standingBefore)
  // Without a prediction the number bond below says it all; the 💭 line is for comparing.
  document.body.classList.toggle('bond-only', !guessed)
  const r = card.add(knocked)
  game.outcome = { ...r, knocked }
  game.state = 'result'
  game.timer = 0
  penguin.hide()
  updateHud()
  updateRack(standingSet())

  // Every roll gets the same calm reply: what happened, in pictures and one number.
  // Strikes and spares are named, with one soft glow and chord; said aloud only the first time.
  const deck = new THREE.Vector3(0, 1.6, LANE.headPin - 0.8)
  // Every roll ends with the number bond: the fallen pins and the pins still standing make 10.
  const up = standingPins()
  const fallen = showBond(up)
  const planHit = game.plan?.got === null && planResult(game.plan, knocked)
  if (r.strike || r.spare) {
    banner(r.strike ? 'Strike!' : 'Spare!', { kind: r.strike ? 'strike' : 'spare' })
    audio.fanfare()
    audio.cheer(true)
    crowd.start(true)
    game.dance = r.strike
    effects.glow(deck, r.strike ? 16 : 12)
    voice.sayOnce(r.strike ? 'Strike! All 10 fell.' : 'Spare! You got them all.')
    game.resultWait = 3.4
    return
  }
  if (knocked === 0) banner('Wheee! 🐧', { plus: 0 })
  audio.jingle(knocked)
  crowd.start(false)
  // A few pale sparkles above the deck, never a cloud over the pins left to count
  if (knocked) effects.glow(deck, 6)
  // Nothing left to count (a pin that toppled before the slide can make this happen without a spare)
  if (!up.length) {
    game.resultWait = 2.6
    return
  }
  // Now the pins still standing are counted, the child's way (see game.tier); the next
  // roll waits until they are.
  game.resultWait = Infinity
  game.counting = { up, fallen, tapped: 0, slips: 0, asked: false, aloud: game.tier === 1 && game.countsAloud++ < 2 }
  counter.begin(up, {
    onStep: (q, last, how) => {
      $(`bond-pin-${q.i}`)?.classList.add('lit')
      $(`rack-${q.i}`)?.classList.add('lit')
      $('bond-standing-n').textContent = q.n
      if (how === 'all') return
      audio.tick(q.n)
      // The voice counts with the child's own taps for the first two counts of a game, up to 5.
      // After that, and whenever the game counts along with a child who waits, it is quiet:
      // the rings, the numbers over the pins and the rising ticks carry the count, and a small
      // total is named once a game.
      if (how === 'tap' && game.counting?.aloud) {
        if (!last || q.n > COUNT_ALOUD) voice.count(q.n)
        else voice.sayNow(`${q.n} standing.`)
      } else if (last && q.n <= COUNT_ALOUD) voice.sayOnce(`${q.n} standing.`)
    },
    onDone: bondDone,
  })
  // A plan that came out just right: the child already knows how many are left.
  if (planHit) {
    markBond('plan')
    markBond('self')
    counter.showAll()
  } else if (game.tier >= 2) askHowMany(guessed, r.frameDone || r.resetPins)
  else {
    $('bond').classList.add('tap')
    game.counting.hint = game.tapHints++ < 2
    voice.sayOnce('Tap the pins still standing.')
    // A child who waits is counted along with, starting where they are. A child who has let the
    // game count twice in a row isn't made to sit through a slow count: the pins light together.
    if (game.ignored >= 2) counter.countRest(guessed ? 4 : 3, { all: true })
    else counter.countRest(guessed ? 5 : 4)
  }
}

/** The count is finished: the bond is complete, said once per game, then the next roll. */
function bondDone() {
  const c = game.counting
  if (!c) return
  game.counting = null
  unveil()
  mist.hide()
  $('bond').classList.remove('tap', 'guess', 'guess-fallen')
  $('howmany').hidden = true
  $('tap-hint').hidden = true
  $('bond-fallen-n').textContent = c.fallen
  const s = c.up.length
  // A count of the child's own: every standing pin tapped and no fallen pin counted.
  const careful = c.tapped === s && !c.slips && !c.missed
  if (careful) markBond('self')
  if (!c.asked) game.ignored = c.tapped ? 0 : game.ignored + 1
  // Three careful counts move them up a step; a strong bowler who leaves one pin counts it carefully too.
  if (game.tier === 1 && careful && ++game.selfCounts >= 3) setTier(2)
  // Each new way is said once, for the first four ways of a game; after that the card says it.
  const said = game.bondsSaid < 4 && voice.sayOnce(`${c.fallen} and ${s} make 10.`)
  if (said) game.bondsSaid++
  game.resultWait = game.timer + (said ? 2.8 : 1.6)
}

function setTier(t) {
  game.tier = t
  game.selfCounts = 0
  game.rights = 0
  game.misses = 0
  store.set('tier', t)
}

/** The child taps a pin on the lane (or its picture in the bond) to count it. */
function countPin(i) {
  const c = game.counting
  if (!c) return false
  if (!counter.left.some((q) => q.i === i)) return false
  c.tapped++ // before the tap: counting the last pin finishes the bond straight away
  counter.tap(i)
  $('tap-hint').hidden = true
  // Wait for the next tap; if the child pauses, the game counts on from here.
  counter.countRest(2.6)
  return true
}

const pinEnds = [new THREE.Vector3(), new THREE.Vector3()]
const pinAxis = new THREE.Vector3()
const toScreen = (v) => ({ x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight })

/**
 * The pin under a screen point: the nearest pin (standing or fallen) whose drawn body the
 * finger touches, with a little slack around it. Fallen pins are found too, so a tap on one
 * can be answered ("that one fell down") instead of counting the nearest standing pin.
 */
function pinAt(x, y) {
  let best = null
  let bestD = Infinity
  for (const p of pins.list) {
    if (p.removed || !p.mesh.visible) continue
    // The pin's own axis, base to top, as it lies now.
    pinAxis.set(0, PIN_H / 2, 0).applyQuaternion(p.body.quaternion)
    pinEnds[0].copy(p.body.position).sub(pinAxis).project(camera)
    pinEnds[1].copy(p.body.position).add(pinAxis).project(camera)
    const a = toScreen(pinEnds[0])
    const b = toScreen(pinEnds[1])
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = len2 ? clamp(((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / len2, 0, 1) : 0
    const d = Math.hypot(x - (a.x + t * (b.x - a.x)), y - (a.y + t * (b.y - a.y)))
    // About half a pin's height either side of its axis, and never smaller than a fingertip.
    const reach = clamp(Math.sqrt(len2) * 0.42, 18, 46)
    if (d < reach && d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best) return null
  const q = counter.left.find((q) => q.i === best.i)
  if (q) return { q }
  return { fallen: pins.isDown(best), counted: !pins.isDown(best) }
}

/** A tap on a pin lying down: it is not counted, and the child hears why, once a game. */
function slipPin() {
  const c = game.counting
  if (!c) return
  c.slips++
  audio.squeak(0.7)
  const f = $('bond-fallen')
  f.classList.remove('nudge')
  void f.offsetWidth
  f.classList.add('nudge')
  voice.sayOnce('That one fell down. Count the pins standing up.')
  counter.countRest(3)
}

/**
 * Three neighbouring numbers around the answer, with the answer first, middle or last at
 * random, so a child can't find it by where it sits. 0 is never a choice: a question is only
 * asked when pins are left, so 0 would be an answer to rule out without looking.
 */
function nearChoices(s) {
  const windows = [[s - 2, s - 1, s], [s - 1, s, s + 1], [s, s + 1, s + 2]].filter((w) => w[0] >= 1 && w[2] <= 10)
  return windows[Math.floor(Math.random() * windows.length)]
}

/**
 * The harder steps for children who count well: the bond shows one part and a "?", and the
 * child works out the missing part (looking at the lane is allowed).
 * Usually the hidden part is the pins standing ("7 + ? = 10"). With three or fewer standing,
 * which a glance can tell, it is sometimes the pins that fell ("? + 2 = 10"): the fallen pins
 * hide in the card, and on a second slide some have already been swept away, so the bond itself
 * is the way to the answer.
 * Tier 2 picks from three neighbouring numbers; tier 3 from a 1-10 strip, in two rows of five.
 * A right answer lights them all at once; a wrong one means counting them.
 */
function askHowMany(guessed, frameOver) {
  const c = game.counting
  const s = c.up.length
  c.asked = true
  // A kept 💭 prediction has just said how many fell, so then the question is always the standing part.
  c.part = s <= 3 && !guessed && Math.random() < 0.5 ? 'fallen' : 'standing'
  // While the question is open, nothing on screen gives the answer away: the frame card's numbers,
  // the rack map and the plan's result wait behind a "?". On tier 3 a snow cloud also settles over
  // the pins, so the bond itself is the way to the answer.
  veil()
  if (game.tier >= 3) mist.show()
  const answer = c.part === 'fallen' ? c.fallen : s
  if (c.part === 'fallen') {
    $('bond').classList.add('guess-fallen')
    $('bond-fallen-n').textContent = '?'
    // The standing part is the one given: its pins stand lit in the card.
    for (const q of c.up) $(`bond-pin-${q.i}`)?.classList.add('lit')
    $('bond-standing-n').textContent = s
  } else {
    $('bond').classList.add('guess')
    $('bond-standing-n').textContent = '?'
  }
  const picks = game.tier >= 3 ? Array.from({ length: 10 }, (_, k) => k + 1) : nearChoices(answer)
  $('howmany').classList.toggle('strip', game.tier >= 3)
  $('howmany').replaceChildren(...picks.map((n) => {
    const b = Object.assign(document.createElement('button'), { textContent: n })
    b.dataset.n = n
    b.setAttribute('aria-label', `${n} ${c.part === 'fallen' ? 'fell' : 'standing'}`)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      answerHowMany(b)
    })
    return b
  }))
  $('howmany').setAttribute('aria-label', c.part === 'fallen' ? 'How many fell down?' : 'How many are still standing?')
  $('howmany').hidden = false
  // After a first slide the missing part is what the spare needs; after a last one, what was left.
  // Spoken in full the first time; after that the "?" and the numbers ask it.
  const asks = c.part === 'fallen' ? 'How many fell down?' : frameOver ? 'How many are still standing?' : 'How many more make 10?'
  // The cloud is explained the first time it settles; each question is spoken once a game.
  const cloud = game.tier >= 3 && voice.sayOnce('The pins are hiding in a cloud.')
  if (!voice.sayOnce(asks) && !cloud) audio.tick(3)
  // A child who doesn't answer is counted along with, with no fuss.
  counter.countRest(guessed ? 8 : 7)
}

function answerHowMany(btn) {
  const c = game.counting
  if (!c || btn.disabled) return
  audio.unlock()
  const s = c.up.length
  const answer = c.part === 'fallen' ? c.fallen : s
  const n = Number(btn.dataset.n)
  for (const b of $('howmany').children) b.disabled = true
  // Answered: the cloud lifts and the numbers come back, to check by or to count.
  mist.hide()
  unveil()
  if (n === answer) {
    btn.className = 'yes'
    game.misses = 0
    audio.jingle(answer * 2)
    // The bond sentence that follows says the number; "Yes" is said aloud only while it is new.
    if (!voice.sayOnce('Yes!')) audio.tick(answer)
    if (!c.missed) markBond('self')
    $('bond-fallen-n').textContent = c.fallen
    $('bond').classList.remove('guess-fallen')
    counter.showAll()
    // Four right answers (not in a row: a slip is fine) and the number strip replaces the three choices.
    if (game.tier === 2 && !c.missed && ++game.rights >= 4) setTier(3)
    return
  }
  btn.className = 'no'
  audio.squeak(0.8)
  const first = !c.missed
  c.missed = true
  // Two misses in a row: one step back for a while.
  if (first && ++game.misses >= 2) setTier(game.tier - 1)
  if (c.part === 'fallen') {
    // The fallen pins come out from behind the "?" so the child can count them, and picks again.
    $('bond').classList.remove('guess-fallen')
    for (const b of $('howmany').children) b.disabled = b.className === 'no'
    if (!voice.sayOnce('Count the pins lying down.')) voice.hush()
    counter.countRest(9)
    return
  }
  // A wrong guess means counting them: the child taps the pins, as in the first tier.
  if (!voice.sayOnce(`Let's count them. Tap the pins standing up.`)) voice.hush()
  $('howmany').hidden = true
  $('bond').classList.remove('guess')
  $('bond').classList.add('tap')
  $('bond-standing-n').textContent = ''
  counter.countRest(5)
}
$('bond-standing').addEventListener('click', (e) => {
  const i = e.target.closest?.('.pin-ic')?.dataset.pin
  if (i !== undefined && countPin(Number(i))) e.stopPropagation()
})
$('bond-fallen').addEventListener('click', (e) => {
  if (!$('bond').classList.contains('tap') || !e.target.closest?.('.pin-ic')) return
  e.stopPropagation()
  slipPin()
})

/** Hide what would give a bond question's answer away: this roll's frame numbers, the rack map, the plan's result. */
function veil() {
  const r = game.outcome
  game.veil = { f: r.frameDone ? card.frame - 1 : card.frame }
  document.body.classList.add('veiled')
  updateHud()
  updatePlanPill()
}

function unveil() {
  if (!game.veil) return
  game.veil = null
  document.body.classList.remove('veiled')
  updateHud()
  updatePlanPill()
}

/** After the cheering: tidy the pins and get the penguin ready for the next roll. */
function nextRoll() {
  const r = game.outcome
  game.dance = false
  $('bond').hidden = true
  for (const d of document.querySelectorAll('.rack i.lit')) d.classList.remove('lit')
  if (card.over) return gameOver()
  if (r.resetPins) {
    // A fresh rack: the last frame's "fell + standing" line no longer matches.
    prediction.reset()
    pins.reset()
    audio.drop()
    if (r.frameDone) showIntro(card.frame === card.count - 1 ? '🏁' : '🎳', card.frame === card.count - 1 ? 'Last frame!' : `Frame ${card.frame + 1}`)
  } else {
    for (const p of pins.clearFallen()) effects.puff(p, 5, 0.6)
    audio.poof()
    // The plan was for the first slide; the spare question has the stage to itself.
    game.plan = null
    updatePlanPill()
  }
  updateRack(standingSet())
  toAim()
  // Bumpers only guard the gutters; aiming is the child's job. Before a second
  // roll the rings stay under the pins left, and the child says where they are.
  if (r.resetPins) {
    counter.clear()
    offerPlan()
  } else askWhere()
}

/**
 * Tiers 2 and 3, a fresh rack: the child may plan the first slide as a way to make 10 ("knock down 7,
 * leave 3"). Two plans are offered, one knocking a few pins and one knocking many, picked from
 * the ways not met yet this game, so a strong bowler meets new numbers too. Where the penguin
 * stands sets how many fall (the middle knocks nearly all, the edge just one), so a plan makes
 * aiming deliberate. Sliding without choosing is fine.
 */
function offerPlan() {
  game.plan = null
  updatePlanPill()
  if (game.tier < 2) return
  // Only plans some spot really gives: weighted towards the ones a straight slide gives most often
  // (measured: the edge gives 1; two steps out 4 or 5; one step 8; the middle 8-10; no spot gives 6
  // often, so it is never offered), and four times as likely when not met yet.
  const pick = (weights) => {
    const all = Object.entries(weights).map(([k, w]) => [Number(k), w * (game.bonds.has(`${k}+${10 - k}`) ? 1 : 4)])
    let r = Math.random() * all.reduce((a, [, w]) => a + w, 0)
    for (const [k, w] of all) if ((r -= w) < 0) return k
    return all[0][0]
  }
  $('plan-row').replaceChildren(...[pick(FEW), pick(MANY)].map((k) => {
    const b = document.createElement('button')
    b.dataset.k = k
    b.setAttribute('aria-label', `Knock down ${k}, leave ${10 - k} standing`)
    b.append(Object.assign(document.createElement('b'), { textContent: k }), tenFrame(k))
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      choosePlan(k)
    })
    return b
  }))
  $('plan').hidden = false
  // A tier-3 bowler whose plans keep coming out right is offered the next challenge once a game:
  // bumpers down, so the aim has to be true too.
  $('bumpers-down').hidden = !(game.tier >= 3 && game.bumpers && game.planHits >= 2 && game.planHits + game.planNear >= 4 && !game.bumperOffer)
  if (!$('bumpers-down').hidden) game.bumperOffer = true
  // Asked aloud the first time in a game; after that the picture asks.
  if (game.plansAsked++ < 1) voice.say('Make a plan. How many will you knock down?')
  else audio.tick(2)
}

const FEW = { 1: 3, 2: 1, 3: 1, 4: 2, 5: 2 }
const MANY = { 7: 1, 8: 3, 9: 2 }
/** Where a straight slide knocks about k: the middle knocks nearly all, each step out fewer, the edge just one. */
const planSpot = (k) => (k >= 9 ? 0 : k >= 7 ? STEP_X : k >= 3 ? STEP_X * 2 : MAX_X)

/** Ten dots like a ten-frame: the first k lie knocked down, the rest stand. */
function tenFrame(k) {
  const el = document.createElement('span')
  el.className = 'ten'
  for (let n = 0; n < 10; n++) el.append(Object.assign(document.createElement('i'), { className: n < k ? 'f' : '' }))
  return el
}

function choosePlan(k) {
  if (game.state !== 'aim' || $('plan').hidden) return
  audio.unlock()
  audio.click()
  game.idle = 0
  game.plan = { k, got: null }
  $('plan').hidden = true
  updatePlanPill()
  // Tier 2: the first footprints show where to stand for this plan, on the side the penguin is nearest.
  // Tier 3 remembers it alone (the middle knocks many, the edge few).
  if (game.tier === 2) spot.show((game.x < 0 ? -1 : 1) * planSpot(k), { short: true })
  // The first plan of a game is read out; after that the 🎯 card beside the rack says it.
  if (game.plansAsked === 1 && !game.planSaid) {
    game.planSaid = true
    voice.sayNow(`Knock down ${k}. Leave ${10 - k} standing.`)
  }
}

/** The plan stays in view beside the rack: what was planned, then what fell. */
function updatePlanPill() {
  const el = $('plan-pill')
  const p = game.plan
  el.hidden = !p
  if (!p) return
  const got = p.got === null || game.veil ? '' : p.got === p.k ? ' ✓' : ` → ${p.got}`
  el.replaceChildren(Object.assign(document.createElement('span'), { textContent: `🎯 ${p.k}${got}` }), tenFrame(p.k))
  el.classList.toggle('hit', !game.veil && p.got === p.k)
  el.classList.toggle('near', !game.veil && p.got !== null && Math.abs(p.got - p.k) === 1)
  el.setAttribute('aria-label', p.got === null || game.veil ? `Plan: knock down ${p.k}` : `Planned ${p.k}, ${p.got} fell`)
}

/**
 * The planned slide is over: the two numbers side by side. Returns true when it came out just
 * as planned. A different result is no failure, only a hint about where to stand next time.
 */
function planResult(plan, knocked) {
  plan.got = knocked
  updatePlanPill()
  if (knocked === plan.k) {
    game.planHits++
    audio.jingle(10)
    voice.sayOnce('Just as you planned!')
    return true
  }
  // One away is close: the right spot, with a little luck in how the pins tumble (from the best spot
  // a straight slide gives the planned number about half the time, and one away nearly all the rest).
  // The card turns pale green; no tip is needed.
  if (Math.abs(knocked - plan.k) === 1) {
    game.planNear++
    audio.jingle(4)
    voice.sayOnce('Close to your plan!')
    return false
  }
  // The 🎯 card shows both numbers; the voice gives only a tip about where to stand, once a game each way.
  voice.sayOnce(knocked > plan.k ? 'To knock down fewer, stand nearer the side.' : 'To knock down more, stand nearer the middle.')
  return false
}

const SIDE_WORDS = { left: 'on the left', middle: 'in the middle', right: 'on the right' }
const SIDES = ['left', 'middle', 'right']

/**
 * The pins on each side: `lo` surely there, `hi` maybe there (a pin between the middle and a
 * side counts for both), and `score`, half-way between, to weigh which group is biggest.
 */
function sideCounts(up) {
  const lo = { left: 0, middle: 0, right: 0 }
  const hi = { left: 0, middle: 0, right: 0 }
  for (const p of up) {
    const z = zoneOf(p.x)
    hi[z.side]++
    if (z.between) hi.middle++
    else lo[z.side]++
  }
  const score = Object.fromEntries(SIDES.map((s) => [s, (lo[s] + hi[s]) / 2]))
  return { lo, hi, score }
}

/** The pins that answer "on this side": surely there, or between it and the middle. */
const pinsOn = (up, side) => up.filter((p) => {
  const z = zoneOf(p.x)
  return z.side === side || (side === 'middle' && z.between)
})

/**
 * Spare time: look at the pins left. The question is only asked when it matters, and only
 * when its answer is clear from the lane:
 * - pins surely on both sides, with clearly more on one: "Which side has more?"
 *   (so the child goes for the bigger group);
 * - otherwise, pins off to one side: "Where are the pins?" ("Where are most?" when some
 *   stand in the middle too). The side holding the most pins answers it, or either of two
 *   groups that are about the same size; a pin between the middle and a side counts for both.
 * Pins in the middle, or an even split, need no question; the rings show them.
 */
function askWhere() {
  const up = standingPins()
  if (!up.length) return counter.clear()
  counter.keepRings()
  // The top tier plans the spare alone: the rings show the pins; where to stand and how to aim is theirs.
  if (game.tier >= 3) return
  const { lo, hi, score } = sideCounts(up)
  game.ask = null
  if (lo.left && lo.right) {
    const more = lo.left > hi.right ? 'left' : lo.right > hi.left ? 'right' : null
    if (more) {
      game.ask = 'more'
      game.askOk = [more]
    }
  } else {
    const best = Math.max(...Object.values(score))
    game.askOk = SIDES.filter((s) => hi[s] && score[s] >= best - 0.5)
    // Asked only when some side would be a wrong answer, and not when the middle is the answer.
    if (game.askOk.length < 3 && game.askOk.some((s) => s !== 'middle')) game.ask = 'where'
  }
  if (!game.ask) return
  for (const b of document.querySelectorAll('#where button')) {
    b.className = ''
    b.disabled = false
    b.hidden = game.ask === 'more' && b.dataset.side === 'middle'
  }
  // "Most" only when the pins stand in more than one group.
  const oneGroup = game.askOk.some((s) => hi[s] === up.length)
  const text = game.ask === 'more' ? 'Which side has more pins?' : up.length === 1 ? 'One pin left. Where is it?' : oneGroup ? `${up.length} pins left. Where are they?` : 'Where are most of the pins?'
  $('where-text').textContent = game.ask === 'more' ? 'Which side has more?' : up.length === 1 ? 'Where is the pin?' : oneGroup ? 'Where are the pins?' : 'Where are most pins?'
  $('where').hidden = false
  // Asked aloud the first two times in a game; after that the picture asks.
  if (game.asked++ < 2) voice.say(text)
  else audio.tick(2)
}

function chooseSide(btn) {
  if (game.state !== 'aim' || !game.ask || btn.disabled) return
  audio.unlock()
  game.idle = 0
  const ask = game.ask
  const side = btn.dataset.side
  const up = standingPins()
  const { hi, score } = sideCounts(up)
  if (!game.askOk.includes(side)) {
    // No help this time: the child looks again and tries another side.
    btn.className = 'no'
    btn.disabled = true
    audio.squeak(0.8)
    // The comparison is written on the card every time, and spoken for the first three misses of a game.
    // For "which side has more" both counts are said; for "where" just where most of them are.
    const best = game.askOk.reduce((a, s) => (score[s] > score[a] ? s : a))
    const shown = ask === 'more'
      ? `${hi[side]} ${SIDE_WORDS[side]}, ${hi[best]} ${SIDE_WORDS[best]}`
      : !hi[side] ? `No pins ${SIDE_WORDS[side]}` : `${hi[best] === up.length ? (up.length === 1 ? 'It is' : 'They are') : 'Most are'} ${SIDE_WORDS[best]}`
    $('where-text').textContent = shown
    const words = ask === 'more' ? `${shown}. Which is more?` : `${shown}. Look at the rings.`
    if (game.wrongSides++ < 3) voice.sayNow(words)
    return
  }
  const there = pinsOn(up, side)
  for (const b of document.querySelectorAll('#where button')) {
    if (b.className !== 'no') b.className = b === btn ? 'yes' : ''
    b.disabled = true
  }
  game.ask = null
  audio.jingle(there.length)
  // Said aloud while the questions are (the first two a game); after that the jingle and footprints answer.
  if (game.asked <= 2) {
    const other = side === 'left' ? 'right' : 'left'
    voice.sayNow(ask === 'more'
      ? `Yes! ${hi[side]} is more than ${hi[other]}.`
      : `Yes! ${pinWord(there.length)} ${SIDE_WORDS[side]}.`)
  }
  // Footprints show where to stand for those pins; walking there and aiming are the child's job.
  // Tier 1 gets the whole trail down the lane; tier 2 only the first prints: where to stand, not where to slide.
  const mid = there.reduce((a, p) => a + p.x, 0) / there.length
  spot.show(clamp(Math.round(mid / STEP_X) * STEP_X, -MAX_X, MAX_X), { short: game.tier >= 2 })
}
for (const b of document.querySelectorAll('#where button')) {
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    chooseSide(b)
  })
}

function toAim() {
  effects.clearCelebration()
  prediction.aim()
  game.state = 'aim'
  game.idle = 0
  game.hinted = false
  game.ask = null
  spot.hide()
  penguin.ready(game.x)
  effects.puff(penguin.group.position.clone().setY(0.2), 6, 0.5)
  $('controls').classList.remove('away')
  if (game.thrown < 2) $('hint').classList.remove('hidden')
  updateHud()
}

function gameOver() {
  prediction.reset() // the results card gets the stage to itself
  counter.clear()
  spot.hide()
  game.plan = null
  updatePlanPill()
  $('where').hidden = true
  $('plan').hidden = true
  game.state = 'over'
  // What was learned, in pictures rather than a score: all eleven ways of making 10, in order,
  // like a staircase. The ways met this game stand out; the ones the child worked out (counted
  // carefully or answered) are marked, and ways made just as planned carry a 🎯.
  const met = game.bonds.size
  const own = [...game.bonds.values()].filter((b) => b.self).length
  // The headline is what the child worked out: careful counts and bonds answered, not pins that just fell.
  const plans = [...game.bonds.values()].filter((b) => b.plan).length
  $('bonds').replaceChildren(...Array.from({ length: 11 }, (_, k) => bondPicture(10 - k, k, game.bonds.get(`${10 - k}+${k}`))))
  const ways = (n) => `${n} ${n === 1 ? 'way' : 'ways'} to make 10`
  $('bonds-title').textContent = own ? `You worked out ${ways(own)}` : `You met ${ways(met)}`
  $('bonds-own').textContent = met
  $('bonds-plans').textContent = plans
  $('bonds-plan').hidden = !plans
  $('bonds-key').hidden = !own
  voice.say(own ? `You worked out ${ways(own)}${plans ? `, and ${plans} just as you planned` : ''}.` : `You met ${ways(met)}.`)
  show('results')
  audio.fanfare()
  crowd.start(true)
  effects.clearCelebration()
  effects.glow(new THREE.Vector3(0, 1.6, LANE.headPin - 1.2), 14)
}

/** One way to make 10 as a picture: the fallen pins lying down, then the ones left standing. */
function bondPicture(fallen, up, met) {
  const el = document.createElement('div')
  el.className = `way${met ? '' : ' faint'}${met?.self ? ' self' : ''}`
  el.setAttribute('aria-label', `${fallen} and ${up} make 10${met ? (met.self ? ', worked out' : ', met') : ''}${met?.plan ? ', as planned' : ''}`)
  const dots = document.createElement('span')
  dots.className = 'way-pins'
  for (let k = 0; k < 10; k++) dots.append(Object.assign(document.createElement('i'), { className: k < fallen ? 'f' : '' }))
  el.append(dots, Object.assign(document.createElement('b'), { textContent: `${fallen} + ${up}` }))
  if (met?.plan) el.append(Object.assign(document.createElement('span'), { className: 'way-plan', textContent: '🎯' }))
  return el
}

// --- HUD ------------------------------------------------------------------------------

function buildCard() {
  const el = $('card')
  el.innerHTML = ''
  for (let i = 0; i < card.count; i++) {
    const f = document.createElement('div')
    f.className = 'frame' + (i === card.count - 1 ? ' wide' : '')
    f.innerHTML = `<div class="rolls">${'<span></span>'.repeat(i === card.count - 1 ? 3 : 2)}</div><div class="tot"></div>`
    el.appendChild(f)
  }
}

/** The frame card keeps what each slide knocked over, and each finished frame's pins: no running score. */
function updateHud() {
  const frames = $('card').children
  for (let i = 0; i < card.count; i++) {
    const f = frames[i]
    const rolls = card.frames[i]
    const hid = game.veil?.f === i
    f.querySelectorAll('.rolls span').forEach((s, k) => {
      s.textContent = rolls[k] === undefined ? '' : hid ? '?' : rolls[k]
      s.className = rolls[k] === 10 && !hid ? 'x' : ''
    })
    const tot = f.querySelector('.tot')
    tot.textContent = i < card.frame && !hid ? rackSums(rolls).join('·') : ''
    tot.classList.toggle('racks', tot.textContent.length > 2)
    f.classList.toggle('now', i === card.frame && game.state !== 'over')
  }
}

/**
 * The pins each rack in a frame gave, out of 10. A frame has one rack; the tenth can bring fresh
 * racks after a strike or spare, and each keeps its own sum ("10·10·9"), never a total past 10.
 */
function rackSums(rolls) {
  const sums = []
  let n = 0
  for (const r of rolls) {
    n += r
    if (n === 10) {
      sums.push(10)
      n = 0
    }
  }
  if (n || !sums.length) sums.push(n)
  return sums
}

const tipAt = new THREE.Vector3()
/** For the first counts of a game: a still finger over the first pin to tap, until the child taps or the game counts along. */
function updateTapHint() {
  const c = game.counting
  const q = c?.hint && !c.tapped && !c.asked && counter.n === 0 && game.timer > 1.2 ? counter.left[0] : null
  const el = $('tap-hint')
  el.hidden = !q
  if (!q) return
  tipAt.set(q.x, PIN_H * 0.55, q.z).project(camera)
  el.style.left = `${((tipAt.x + 1) / 2) * innerWidth}px`
  el.style.top = `${((1 - tipAt.y) / 2) * innerHeight}px`
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
  // A plan for this rack sits just under the little map of it.
  el.appendChild($('plan-pill'))
}

function updateRack(standing) {
  standing.forEach((up, i) => {
    const d = $(`rack-${i}`)
    d.classList.toggle('down', !up)
    d.style.background = up ? pins.list[i]?.color ?? '' : ''
  })
}

let bannerTimer = 0
function banner(word, { kind = '', stars = 0, plus = 0 } = {}) {
  const el = $('banner')
  el.querySelector('.b-stars').textContent = '⭐'.repeat(stars)
  el.querySelector('.b-word').textContent = word
  el.querySelector('.b-plus').textContent = plus ? `+${plus}` : ''
  el.className = `banner show ${kind}`
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => (el.className = 'banner'), kind === 'strike' ? 2600 : 1800)
}

let introTimer = 0
function showIntro(emoji, title) {
  $('intro-emoji').textContent = emoji
  $('intro-title').textContent = title
  const el = $('intro')
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(introTimer)
  introTimer = setTimeout(() => el.classList.remove('show'), 1800)
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play' && screen !== 'results')
  $('results').classList.toggle('hidden', screen !== 'results')
  $('hud').classList.toggle('over', screen === 'results')
  $('controls').classList.toggle('hidden', screen !== 'play')
}

function updateCurveBtn() {
  $('curve').textContent = ['↖️', '⬆️', '↗️'][game.curve + 1]
}

// --- Screens ------------------------------------------------------------------------------

function setTheme(name) {
  game.theme = name
  store.set('lane', name)
  for (const b of document.querySelectorAll('.lane-btn')) b.classList.toggle('on', b.dataset.theme === name)
  scenery.setTheme(name)
  lane.setNight(THEMES[name].night)
  pins.build(THEMES[name].pins)
  document.body.classList.toggle('pins-fish', THEMES[name].pins === 'fish')
  pins.list.forEach((p) => (p.drop = 0))
  audio.setTune(name)
}

function setBumpers(on) {
  game.bumpers = on
  store.set('bumpers', on ? '1' : '0')
  lane.setBumpers(on)
  $('bumpers').classList.toggle('on', on)
  $('bumpers-state').textContent = on ? 'ON' : 'OFF'
}

/** The one cleanup every exit and fresh start shares: words stop and the counting cards clear. */
function stopPlay() {
  voice.hush()
  prediction.reset()
  counter.clear()
  spot.hide()
  game.counting = null
  game.ask = null
  $('bond').hidden = true
  $('where').hidden = true
  $('plan').hidden = true
  $('howmany').hidden = true
  $('tap-hint').hidden = true
  game.plan = null
  unveil()
  mist.hide()
  updatePlanPill()
}

function toTitle() {
  stopPlay()
  game.state = 'title'
  game.dance = false
  lane.hideAim()
  pins.reset()
  pins.list.forEach((p) => (p.drop = 0))
  game.x = 0
  penguin.ready(0)
  show('title')
}

function start() {
  stopPlay()
  voice.newRound()
  game.bonds.clear()
  game.asked = 0
  game.plansAsked = 0
  game.planSaid = false
  game.bondsSaid = 0
  game.wrongSides = 0
  game.tapHints = 0
  game.countsAloud = 0
  game.selfCounts = 0
  game.rights = 0
  game.misses = 0
  game.ignored = 0
  game.planHits = 0
  game.planNear = 0
  game.bumperOffer = false
  audio.unlock()
  audio.click()
  card.reset(game.short ? SHORT_FRAMES : FRAMES)
  buildCard()
  pins.reset()
  game.x = 0
  game.angle = 0
  game.curve = 0
  updateCurveBtn()
  show('play')
  updateRack(standingSet())
  audio.drop()
  showIntro('🎳', 'Frame 1')
  toAim()
  offerPlan()
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
  audio.click()
  setBumpers(!game.bumpers)
})
function setShort(on) {
  game.short = on
  store.set('frames', on ? SHORT_FRAMES : FRAMES)
  $('frames-state').textContent = on ? SHORT_FRAMES : FRAMES
}
$('frames').addEventListener('click', () => {
  audio.unlock()
  audio.click()
  setShort(!game.short)
})
$('bumpers-down').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  audio.click()
  setBumpers(false)
  $('bumpers-down').hidden = true
  voice.sayNow('Bumpers down. Now your aim matters too!')
})
$('play').addEventListener('click', start)
$('again').addEventListener('click', start)
$('to-home').addEventListener('click', () => {
  audio.click()
  toTitle()
})
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
  store.set('sound', on ? '1' : '0')
}
if (store.get('sound') === '0') setSound(false)
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
// Music on/off is remembered between visits, like the sound button.
function setMusic(on) {
  audio.musicOn = on
  musicBtn.classList.toggle('off', !on)
  store.set('music', on ? '1' : '0')
}
if (store.get('music') === '0') setMusic(false)
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setMusic(!audio.musicOn)
  audio.click()
})

// --- Input ----------------------------------------------------------------------------

function move(dir) {
  if (game.state !== 'aim') return
  game.x = clamp(Math.round((game.x + dir * STEP_X) / STEP_X) * STEP_X, -MAX_X, MAX_X)
  penguin.x = game.x
  penguin.hop = Math.max(penguin.hop, 0.5)
  audio.squeak(0.8 + Math.random() * 0.3)
}

function cycleCurve() {
  game.idle = 0
  game.curve = game.curve === 0 ? 1 : game.curve === 1 ? -1 : 0
  updateCurveBtn()
  audio.click()
}

const go = () => throwPenguin({ angle: game.angle, power: 0.8, hook: game.curve * HOOK })
const holdable = (id, fn) => {
  let iv = 0
  const el = $(id)
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    audio.unlock()
    game.idle = 0
    fn()
    clearInterval(iv)
    iv = setInterval(fn, 180)
  })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => clearInterval(iv))
}
holdable('left', () => move(-1))
holdable('right', () => move(1))
$('curve').addEventListener('click', (e) => {
  e.stopPropagation()
  cycleCurve()
})
$('go').addEventListener('click', (e) => {
  e.stopPropagation()
  go()
})

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.unlock()
  game.idle = 0
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  // The baby penguins on the snow banks hop and cheep when tapped, any time.
  const baby = crowd.poke(e.clientX, e.clientY, camera)
  if (baby) {
    audio.squeak(1.35 + Math.random() * 0.3)
    effects.sparkleAt(baby, '#fff3b0', 4, 1.2)
  }
  // Tapping the penguin makes it hop and squeak (also on the title screen)
  const onPenguin = raycaster.intersectObject(penguin.group, true).length > 0
  if (game.state === 'title' && onPenguin && penguin.poke()) audio.squeak(1 + Math.random() * 0.3)
  // Counting time: a tap on a standing pin counts it.
  if (game.state === 'result' && game.counting) {
    const hit = pinAt(e.clientX, e.clientY)
    if (hit?.q && $('howmany').hidden) countPin(hit.q.i)
    else if (hit?.fallen && $('howmany').hidden) slipPin()
    return
  }
  if (game.state !== 'aim') return
  drag.tapPenguin = onPenguin
  drag.on = true
  drag.id = e.pointerId
  drag.pts = [{ x: e.clientX, y: e.clientY }]
  drag.aim = null
  canvas.setPointerCapture?.(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
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
  if (t) throwPenguin(t)
  else if (drag.tapPenguin && penguin.poke()) audio.squeak(1 + Math.random() * 0.3)
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', (e) => {
  drag.on = false
  drag.aim = null
})
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

const keys = new Set()
addEventListener('keydown', (e) => {
  audio.unlock()
  game.idle = 0
  const k = e.key.toLowerCase()
  if (k === 'escape' && game.state !== 'title' && game.state !== 'loading') return toTitle()
  if ((game.state === 'title' || game.state === 'over') && (k === 'enter' || k === ' ')) {
    e.preventDefault()
    return start()
  }
  if (k === ' ' || k === 'enter' || k === 'arrowup' || k === 'w') {
    e.preventDefault()
    if (!e.repeat) go()
    return
  }
  // Number keys pick a plan, or answer "How many are still standing?"
  if (!$('plan').hidden && /^\d$/.test(k)) {
    const b = $('plan-row').querySelector(`[data-k="${k}"]`)
    return b && choosePlan(Number(k))
  }
  if (!$('howmany').hidden && /^\d$/.test(k)) {
    const all = [...$('howmany').children]
    const b = all.find((b) => b.dataset.n === k) ?? (k === '0' ? all.find((b) => b.dataset.n === '10') : null)
    return b && answerHowMany(b)
  }
  if (k === 'c' && game.state === 'aim') return cycleCurve()
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
  if (game.state !== 'aim' || prediction.open) return
  if (keys.has('arrowleft')) game.angle = clamp(game.angle - dt * 0.18, -MAX_ANGLE, MAX_ANGLE)
  if (keys.has('arrowright')) game.angle = clamp(game.angle + dt * 0.18, -MAX_ANGLE, MAX_ANGLE)
}

// --- Camera ------------------------------------------------------------------------------

const camPos = new THREE.Vector3(0, 2.4, 6)
const camLook = new THREE.Vector3(0, 0.4, -8)
const wantPos = new THREE.Vector3()
const wantLook = new THREE.Vector3()

/**
 * Camera framing per state. Aiming uses a long lens from further back, so the
 * pins at the far end look big while the penguin stays the same size.
 * [landscape, portrait] pairs; aim adds a third, for sideways phones.
 * Phones aim tighter (about 35-60% bigger pins); the lane still fits across.
 * Sideways phones stand further back with a longer lens: pins as big, and the
 * whole penguin fits above the bottom edge.
 * iPads held sideways and laptops get a longer lens too (pins about 30% bigger).
 */
const CAM = {
  aim: { fov: [17, 19, 13], back: [14, 12, 13.5], up: [4.4, 4.3, 4.3], look: [-9.5, -8.8, -6.0] },
  roll: { fov: 40, back: [5.6, 6.6], up: [2.9, 3.4] },
  deck: { fov: 40, back: [6.6, 6.2], up: [3.4, 4.1], look: [-1.4, -1.8] },
}

function updateCamera(dt, t) {
  const pi = camera.aspect < 1 ? 1 : 0
  let wantFov = 50
  switch (game.state) {
    case 'loading':
    case 'title': {
      const a = Math.sin(t * 0.15) * 0.5
      wantPos.set(Math.sin(a) * 5, 2.6, LANE.start + 4 + Math.cos(a) * 1.5)
      wantLook.set(0, 0.5, -8)
      break
    }
    case 'aim': {
      const c = CAM.aim
      const ai = pi || (innerHeight <= 520 ? 2 : 0)
      // Very short sideways screens (~260-330px tall): a touch wider, so the
      // back pins stay below the scorecard and the penguin above the buttons.
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
      wantFov = c.fov
      wantPos.set(0, c.up[pi] + (game.dance ? 0.3 : 0), LANE.headPin + c.back[pi] + (game.dance ? 0.6 : 0))
      wantLook.set(0, game.dance ? 1.2 : 0.3, LANE.headPin + c.look[pi])
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
}

// --- Loading ----------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  let done = 0
  const step = () => ($('loading-text').textContent = `Polishing the ice… ${++done}/3`)
  const [pg, pn, wd] = await Promise.allSettled([
    loader.loadAsync('./models/penguin.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/pins.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/world.glb').then((g) => (step(), g)),
  ])
  if (pg.status === 'fulfilled') {
    penguinTemplate = pg.value.scene.getObjectByName('penguin')
    const me = penguinTemplate.clone(true)
    penguin.setModel(me)
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
  setShort(game.short)
  toTitle()
  renderer.compile(scene, camera)
}

// --- Loop -----------------------------------------------------------------------------

const timer = new THREE.Timer()
timer.connect(document)

let simT = 0
function frame(fixedDt) {
  timer.update()
  const dt = fixedDt ?? Math.min(timer.getDelta(), 1 / 20)
  simT += dt
  const t = simT
  game.timer += dt
  updateKeys(dt)

  if (game.state === 'roll' || game.state === 'settle' || game.state === 'aim' || game.state === 'title') lane.world.step(1 / 120, dt, 4)

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
      if (b.position.z < LANE.deckEnd) effects.puff(new THREE.Vector3(b.position.x, 0, LANE.deckEnd - 1), 8, 0.9)
    }
  } else if (game.state === 'settle') {
    if (penguin.state === 'slide' && penguin.body.position.y < -0.3) penguin.hide()
    if ((game.timer > 1.1 && !pins.moving()) || game.timer > 3.4) finishRoll()
  } else if (game.state === 'aim' && !drag.on) {
    // One quiet hint for a child who has paused for a long while: the swipe hand, once, no sound
    game.idle += dt
    if (game.idle > 30 && !game.hinted) {
      game.hinted = true
      $('hint').classList.remove('hidden')
    }
  } else if (game.state === 'result') {
    if (game.timer > game.resultWait) nextRoll()
  }

  if (game.state === 'result' && game.dance && game.timer > 0.7) {
    if (game.timer < 0.75) {
      for (const p of pins.list) effects.puff(new THREE.Vector3(p.spot.x, 0.3, p.spot.z), 2, 0.5)
      audio.drop()
    }
    pins.dance(game.timer)
  } else pins.sync(dt)

  penguin.update(dt, t)
  crowd.update(dt, t)
  scenery.update(dt, t)
  counter.update(dt, t)
  mist.update(dt, t)
  // Stepping onto the footprints: one soft chime, no words.
  const onSpot = spot.update(dt, game.x)
  if (onSpot && !game.onSpot && game.state === 'aim') audio.jingle(4)
  game.onSpot = onSpot
  updateTapHint()
  effects.update(dt)
  updateAimPreview()
  updateCamera(dt, t)
  audio.updateMusic(game.state !== 'loading')
  renderer.render(scene, camera)
}
renderer.setAnimationLoop(() => frame())

show('loading')
load()
if (new URLSearchParams(location.search).has('debug')) window.__pb = { counter, spot, mist, planSpot, standingPins, sideCounts, chooseSide, choosePlan, offerPlan, rackSums, countPin, pinAt, answerHowMany, setTier, prediction, CAM, frame, scene, camera, effects, game, lane, pins, penguin, card, throwPenguin, renderer }
