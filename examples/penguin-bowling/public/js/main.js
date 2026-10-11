import { createPrediction, pins as pinWord } from './prediction.js'
import { COUNT_ALOUD, createVoice, listWords } from './speech.js'
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
  short: store.get('frames') !== String(FRAMES), // five frames unless the family picked the full ten
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
  // 1 = tap each standing pin to count it (taps on fallen pins don't count), then say how many from two
  //     numbers with the numbers over the pins tucked away; "where?" lays a footprint trail.
  // 2 = work out the missing part of the bond (7 + ? = 10) from three numbers while a cloud hides the pins;
  //     "where?" marks only where to stand. Each fresh rack starts with an optional plan ("knock 7"),
  //     chosen from ways to make 10 not met yet; footprints with the plan's number show where to stand.
  // 3 = the same bond on a 1-10 number strip. Plans name what to leave standing ("leave 3"), so where to
  //     stand takes the bond; curved plans (leave 7, leave 8) add numbers and the curve to aim with.
  //     The spare is the child's own plan: rings only, no question, no trail.
  // A plan that comes out just right asks for the other part of its bond.
  // With only a few pins standing, tiers 2 and 3 sometimes ask for the fallen part instead ("? + 1 = 10").
  // Three careful counts move a child from 1 to 2 (a hasty one takes one back), four right answers from
  // 2 to 3 (a miss takes two back); two misses in a row move them back a tier.
  // Each game starts from the title card's age chip, not from whoever played last on this device:
  // "3–5" starts at tier 1; "6–8" starts at tier 2, or at 3 if the last 6–8 game ended there.
  tier: 1,
  big: store.get('level') === 'big',
  bigTier: store.get('bigtier') === '3' ? 3 : 2,
  selfCounts: 0,
  bigRolls: 0, // tier 1: strikes, spares and first slides of 8 or more this game; two of them make two careful counts enough to move up
  rights: 0,
  misses: 0,
  counting: null, // { up, fallen, tapped, slips, asked } while the pins left are being counted
  countsAloud: 0, // counts this game where the voice says the numbers with the child's taps
  tapHints: 0, // the finger over the first pin, shown for the first two counts of a game
  wrongSides: 0, // wrong "where / which side" answers this game; the first three are explained aloud
  asked: 0, // spoken "where / which side" questions this game; later ones are pictures only
  ask: null, // 'where' | 'more' while that question is open
  askOk: [], // the sides that answer it
  plan: null, // tiers 2-3: { k, got, leave } — knock k on the first slide of this rack; got is what fell; leave: shown as 10 - k
  plansAsked: 0, // spoken plan questions this game
  planSaid: false, // the first plan of a game is read out
  bondsSaid: 0, // "7 and 3 make 10." sentences this game; the first four new ways are said
  onSpot: false, // the penguin stands on the footprints
  veil: null, // { f } while a bond question is open: frame f's numbers, the rack map and the plan result hide
  ignored: 0, // tier 1: counts in a row the child let the game do; after two, the rest light together
  planHits: 0, // plans at this tier that came out exactly
  planNear: 0, // plans at this tier that came out one away
  curvePlans: 0, // tier 3: curved plans chosen this game; the first gets footprints
  plansMade: 0, // tier 2: plans chosen this game; only the first two get footprints...
  planOff: false, // ...unless the last plan came out two or more away
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
  // One decision a slide: a 💭 prediction stands in for the plan card, which waits behind it and comes
  // back if the child closes the dialog without keeping a guess. (Picking a plan puts 💭 away instead.)
  onOpen: () => {
    keys.clear()
    drag.on = false
    drag.aim = null
    planWaits = !$('plan').hidden
    $('plan').hidden = true
  },
})
let planWaits = false
$('pin-prediction').addEventListener('close', () => {
  if (planWaits && prediction.guess === null && game.state === 'aim' && !game.plan) $('plan').hidden = false
  planWaits = false
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
  game.planSpoke = false
  game.standingBefore = pins.countStanding()
  // The curve a planned slide really had (a swipe makes its own), so a curved plan's tip can say so.
  if (game.plan && game.plan.got === null) game.plan.slid = Math.abs(hook) < 0.1 ? 0 : Math.sign(hook)
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
  $('bond').classList.remove('guess', 'guess-fallen', 'show-fallen', 'guess-total')
  $('bond').setAttribute('aria-label', `${fallen.length} fell and ${up.length} standing make 10`)
  $('bond').hidden = false
  // A spare clears what the first slide left; its way to make 10 (say 9 + 1) was met on that first slide.
  // So "10 + 0" is met only by a strike: all ten from a full rack in one slide.
  const spare = !up.length && game.standingBefore < 10
  game.bondKey = spare ? '' : `${fallen.length}+${up.length}`
  if (game.bondKey && !game.bonds.has(game.bondKey)) game.bonds.set(game.bondKey, { self: false, plan: false })
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
  // A pin still counted as standing but leaning on a fallen one stands up straight now, before the count,
  // so "tap the pins standing up" matches what the child sees.
  pins.straighten()
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
  // A strike says its own line; the plan's tip would make two sentences for one slide.
  const planHit = game.plan?.got === null && planResult(game.plan, knocked, { quiet: r.strike })
  // The curve a plan set was for that slide only; the spare starts straight again.
  if (game.plan?.curve && game.curve) {
    game.curve = 0
    updateCurveBtn()
  }
  if (r.strike || r.spare || (game.standingBefore === 10 && knocked >= 8)) game.bigRolls++
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
  // strays: taps on bare ice while counting; fast: two taps closer than a careful finger makes them.
  game.counting = { up, fallen, tapped: 0, slips: 0, strays: 0, fast: false, lastTap: 0, asked: false, aloud: game.tier === 1 && game.countsAloud++ < 2 }
  counter.begin(up, {
    onStep: (q, last, how) => {
      $(`bond-pin-${q.i}`)?.classList.add('lit')
      $(`rack-${q.i}`)?.classList.add('lit')
      $('bond-standing-n').textContent = q.n
      if (how === 'all') return
      audio.tick(q.n)
      // The voice counts with the child's own taps for the first two counts of a game, up to 5;
      // the child then says how many (askTotal), so the total is not said for them.
      // Otherwise, and whenever the game counts along with a child who waits, it is quiet:
      // the rings, the numbers over the pins and the rising ticks carry the count, and a small
      // total is named once a game.
      // While the voice counts with the child, the numbers the game fills in (a child who paused) are
      // said too, so the spoken count never skips one: "1, 2, 3, 4, 5".
      if (how === 'tap' || game.counting?.aloud) {
        if (game.counting?.aloud) voice.count(q.n)
      } else if (last && q.n <= COUNT_ALOUD && !game.standingSaid) {
        // One shared line a game, whatever the number: the ring numbers carry every count after it.
        game.standingSaid = true
        voice.say(`${q.n} standing.`)
      }
    },
    onDone: bondDone,
  })
  // A plan that came out just right: the child knows one part of the bond already, and works out
  // the other under the cloud (tier 2: how many are left; tier 3, whose plan named what is left: how many fell).
  if (planHit) markBond('plan')
  // A spare slide that missed leaves the very pins the child counted a moment ago: no repeat question.
  if ((planHit && guessed) || (game.tier >= 2 && !knocked && game.standingBefore < 10)) counter.showAll()
  else if (planHit) askHowMany(false, false, game.tier >= 3 ? 'fallen' : 'standing')
  else if (game.tier >= 2) askHowMany(guessed, r.frameDone || r.resetPins)
  else {
    $('bond').classList.add('tap')
    game.counting.hint = game.tapHints++ < 2
    // One sentence a slide: after a plan's or a prediction's line, the 👆 over a pin asks instead.
    if (!game.planSpoke && !guessed) voice.sayOnce('Tap the pins still standing.')
    // A child who waits is counted along with, starting where they are. A child who has let the
    // game count twice in a row isn't made to sit through a slow count: the pins light together.
    if (game.ignored >= 2) counter.countRest(guessed ? 4 : 3, { all: true })
    else counter.countRest(guessed ? 6 : 5)
  }
}

/** The count is finished: the bond is complete, said once per game, then the next roll. */
function bondDone() {
  const c = game.counting
  if (!c) return
  // Tier 1: a child who tapped every pin says how many there are, with the numbers hidden:
  // the last number counted tells how many (askTotal). A single pin needs no question.
  if (game.tier === 1 && !c.asked && !c.total && c.tapped === c.up.length && c.up.length >= 2) return askTotal()
  game.counting = null
  unveil()
  mist.hide()
  $('bond').classList.remove('tap', 'guess', 'guess-fallen', 'show-fallen', 'guess-total')
  $('howmany').hidden = true
  $('tap-hint').hidden = true
  $('bond-fallen-n').textContent = c.fallen
  const s = c.up.length
  // A count of the child's own: every standing pin tapped, one at a time (no taps quicker than a careful
  // finger, most taps on a pin rather than the bare ice), no fallen pin counted, and the total said right.
  const careful = c.tapped === s && !c.slips && !c.missed && !c.fast && c.strays * 2 <= c.tapped + c.strays
  // Tapping a single pin is a careful count (it moves a strong bowler up) but not a bond worked out.
  if (careful && (c.asked || s >= 2)) markBond('self')
  if (!c.asked) game.ignored = c.tapped ? 0 : game.ignored + 1
  // Three careful counts move them up a step; a strong bowler who leaves one pin counts it carefully too,
  // and after two strikes, spares or big first slides two careful counts are enough, so a strong bowler
  // isn't left tapping one pin for half a game. A hasty count (taps everywhere) takes one back.
  // A step up also needs one careful count of 3 or more pins with its total said right: single pins
  // and pairs alone (a strong bowler's, or lucky taps) don't show counting yet.
  if (careful && s >= 3 && c.total === 'done' && !c.missed) game.bigCount = true
  if (game.tier === 1 && careful && ++game.selfCounts >= (game.bigRolls >= 2 ? 2 : 3) && game.bigCount) setTier(2)
  else if (game.tier === 1 && !careful && c.tapped) game.selfCounts = Math.max(0, game.selfCounts - 1)
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
  game.planHits = 0 // the bumpers offer counts this tier's plans only
  game.planNear = 0
  game.plansMade = 0 // a new tier's plans get their footprints again
  // Only a 6–8 game remembers where it got to; a 3–5 game always starts at the beginning.
  if (game.big) store.set('bigtier', (game.bigTier = Math.max(2, t)))
}

/** The child taps a pin on the lane (or its picture in the bond) to count it. */
function countPin(i) {
  const c = game.counting
  if (!c || c.waiting) return false
  if (!counter.left.some((q) => q.i === i)) return false
  const now = performance.now()
  // A careful finger points, looks and taps: taps closer than 0.4 s are a sweep, not a count.
  if (c.lastTap && now - c.lastTap < 400) c.fast = true
  c.lastTap = now
  c.tapped++ // before the tap: counting the last pin finishes the bond straight away
  counter.tap(i)
  $('tap-hint').hidden = true
  // Wait for the next tap (long enough for a small child counting slowly); if the child pauses, the game counts on from here.
  counter.countRest(3.5)
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
function askHowMany(guessed, frameOver, part) {
  const c = game.counting
  const s = c.up.length
  c.asked = true
  c.plan = !!part // asked after a plan came out just right
  // A kept 💭 prediction has just said how many fell, so then the question is always the standing part.
  c.part = part ?? (s <= 3 && !guessed && Math.random() < 0.5 ? 'fallen' : 'standing')
  // While the question is open, nothing on screen gives the answer away: the frame card's numbers,
  // the rack map and the plan's result wait behind a "?", and a snow cloud settles over the pins,
  // so the bond itself is the way to the answer, not counting the lane again.
  veil()
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
  // The numbers and the question wait until the cloud hides the pins, so the lane can't be counted through it.
  c.waiting = true
  mist.show(() => {
    if (game.counting !== c) return
    c.waiting = false
    numberChoices(game.tier >= 3 ? Array.from({ length: 10 }, (_, k) => k + 1) : nearChoices(answer), c.part === 'fallen' ? 'fell' : 'standing')
    $('howmany').setAttribute('aria-label', c.part === 'fallen' ? 'How many fell down?' : 'How many are still standing?')
    // After a first slide the missing part is what the spare needs; after a last one, what was left.
    // Spoken in full the first time; after that the "?" and the numbers ask it. A slide whose plan or
    // 💭 prediction has just been answered aloud already has its sentence: the "?" asks for itself.
    const asks = c.part === 'fallen' ? 'How many fell down?' : frameOver ? 'How many are still standing?' : 'How many more make 10?'
    // The cloud is explained the first time it settles; each question is spoken once a game.
    const spoke = game.planSpoke || guessed
    const cloud = !spoke && voice.sayOnce('The pins are hiding in a cloud.')
    if (!spoke && !voice.sayOnce(asks) && !cloud) audio.tick(3)
    // A child who doesn't answer is counted along with, with no fuss.
    counter.countRest(guessed ? 8 : 7)
  })
}

/**
 * After a wrong pick, a fresh deal: the answer and the numbers nearest it that weren't tried, in order,
 * so the next try is still a choice made by counting (not the one button left to press).
 */
function redeal(answer, tried, size) {
  const near = Array.from({ length: 10 }, (_, k) => k + 1)
    .filter((n) => n !== answer && !tried.has(n))
    .sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || Math.random() - 0.5)
  return [answer, ...near.slice(0, size - 1)].sort((a, b) => a - b)
}

/** The number buttons under the bond, each answering "how many?". */
function numberChoices(picks, word) {
  $('howmany').classList.toggle('strip', picks.length > 3)
  $('howmany').replaceChildren(...picks.map((n) => {
    const b = Object.assign(document.createElement('button'), { textContent: n })
    b.dataset.n = n
    b.setAttribute('aria-label', `${n} ${word}`)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      answerHowMany(b)
    })
    return b
  }))
  $('howmany').hidden = false
}

/**
 * Tier 1, after the child has tapped every pin standing: the numbers over the pins tuck away and the
 * child says how many there are, from two neighbouring numbers. The last number counted tells how
 * many, so a careful counter knows; a child who tapped about at random has to guess.
 * Not answering is fine: the numbers come back and the game goes on, without the "worked out" mark.
 */
function askTotal() {
  const c = game.counting
  const s = c.up.length
  c.total = 'open'
  c.part = 'total'
  counter.labels(false)
  $('bond').classList.add('guess-total')
  $('bond-standing-n').textContent = '?'
  const other = s >= 10 || (s > 1 && Math.random() < 0.5) ? s - 1 : s + 1
  numberChoices(Math.random() < 0.5 ? [s, other] : [other, s], 'standing')
  $('howmany').setAttribute('aria-label', 'How many are standing?')
  if (!voice.sayOnce('How many are standing?')) audio.tick(3)
  setTimeout(() => {
    if (game.counting === c && c.total === 'open') {
      c.missed = true
      totalDone()
    }
  }, 10000)
}

function totalDone() {
  const c = game.counting
  c.total = 'done'
  counter.labels(true)
  $('bond').classList.remove('guess-total')
  $('bond-standing-n').textContent = c.up.length
  bondDone()
}

function answerHowMany(btn) {
  const c = game.counting
  if (!c || btn.disabled) return
  audio.unlock()
  const s = c.up.length
  const answer = c.part === 'fallen' ? c.fallen : s
  const n = Number(btn.dataset.n)
  for (const b of $('howmany').children) b.disabled = true
  if (c.part === 'total') {
    if (n === s) {
      btn.className = 'yes'
      audio.jingle(s * 2)
      return totalDone()
    }
    // Not quite: the numbers come back over the pins, and the last one is the answer. Two fresh
    // numbers are dealt (the one tried is gone), so the child reads the last number to choose.
    c.missed = true
    ;(c.tried ??= new Set()).add(n)
    audio.squeak(0.8)
    counter.labels(true)
    numberChoices(redeal(s, c.tried, 2), 'standing')
    if (!voice.sayOnce('The last number you counted tells how many.')) voice.hush()
    return
  }
  if (n === answer) {
    // Answered: the cloud lifts and the numbers come back, to check by. After a wrong try they stay
    // hidden until the right number is picked, so the second try comes from counting, not copying.
    mist.hide()
    unveil()
    btn.className = 'yes'
    // Only a first-try answer ends a run of misses: re-dealt numbers always reach the answer in the end.
    if (!c.missed) game.misses = 0
    audio.jingle(answer * 2)
    // The bond sentence that follows says the number; "Yes" is said aloud only while it is new.
    if (!voice.sayOnce('Yes!')) audio.tick(answer)
    if (!c.missed) markBond('self')
    $('bond-fallen-n').textContent = c.fallen
    $('bond').classList.remove('guess-fallen', 'show-fallen')
    counter.showAll()
    // Four right answers and the number strip replaces the three choices (see the miss below). A 3–5
    // child needs six, and not before the fourth frame, so tier 2 has time to settle first.
    if (game.tier === 2 && !c.missed && ++game.rights >= (game.big ? 4 : 6) && (game.big || card.frame >= 3)) setTier(3)
    return
  }
  btn.className = 'no'
  audio.squeak(0.8)
  const first = !c.missed
  c.missed = true
  // A miss takes two right answers back, so guessing among three numbers doesn't climb a tier.
  // Two misses in a row: one step back for a while.
  if (first) game.rights = Math.max(0, game.rights - 2)
  if (first && ++game.misses >= 2) setTier(game.tier - 1)
  if (c.part === 'fallen') {
    // Only the fallen pins in the card come out from behind the "?" so the child can count them and
    // pick again; the cloud, the frame card's "?" and the hidden plan stay as they are.
    $('bond').classList.add('show-fallen')
    // The strip keeps every other number live; three choices are dealt afresh around the answer.
    ;(c.tried ??= new Set()).add(n)
    if (game.tier >= 3) for (const b of $('howmany').children) b.disabled = b.className === 'no'
    else numberChoices(redeal(answer, c.tried, 3), 'fell')
    if (!voice.sayOnce('Count the pins lying down.')) voice.hush()
    counter.countRest(9)
    return
  }
  // A wrong guess means counting them: the child taps the pins, as in the first tier. The cloud lifts
  // so the pins can be tapped; the frame card and the plan stay hidden until the count is done.
  mist.hide()
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
  if (game.tier < 2) return offerRoughPlan()
  // Only plans a spot really gives about half the time or more, so following the plan honestly works
  // (measured 2026-10-11, 20 straight Go slides a spot on each side: the edge 1 (75-90%, else 2);
  // two steps out 4 (about 55%, else 3 or 5); one step 8 (about 55%, else 7 or 9); the middle 9
  // (about 55%, else 8 or 10); and 24 curved Go slides a spot: from the middle 3 (left curve 24/24,
  // right 14/24, else 4); one step out curving away from the middle 2 (21-22/24 with bumpers up;
  // with them down it slips into the gutter, so that plan needs the bumpers). 5, 6 and 7 come up too
  // seldom to be fair plans), and four times as likely when not met yet.
  const pick = (weights) => {
    const all = Object.entries(weights).map(([k, w]) => [Number(k), w * (game.bonds.has(`${k}+${10 - k}`) ? 1 : 4)])
    let r = Math.random() * all.reduce((a, [, w]) => a + w, 0)
    for (const [k, w] of all) if ((r -= w) < 0) return k
    return all[0][0]
  }
  // Tier 3 names a plan by what is left standing ("leave 3"), so where to stand takes the bond:
  // leave 3 means knock 7. Tier 2 names what to knock down, with a ten-frame showing both parts.
  const leave = game.tier >= 3
  $('plan').classList.toggle('leave', leave)
  $('plan-text').textContent = leave ? 'How many will you leave standing?' : 'How many will you knock down?'
  // Tier 3 also gets the curved plans (leave 7, leave 8): more numbers to reason about, and the curve to aim with.
  const few = leave ? { ...FEW, 3: 1, ...(game.bumpers ? { 2: 1 } : {}) } : FEW
  $('plan-row').replaceChildren(...[pick(few), pick(MANY)].map((k) => {
    const b = document.createElement('button')
    b.dataset.k = leave ? 10 - k : k
    b.dataset.knock = k
    const curved = leave && CURVED.has(k)
    b.setAttribute('aria-label', leave ? `Leave ${10 - k} standing${curved ? ', with a curve' : ''}` : `Knock down ${k}, leave ${10 - k} standing`)
    b.append(Object.assign(document.createElement('b'), { textContent: leave ? 10 - k : k }), leave ? standRow(10 - k) : tenFrame(k))
    // The same arrow the curve button will show once the plan is picked.
    if (curved) b.append(Object.assign(document.createElement('small'), { className: 'plan-curve', textContent: `${CURVE_ICONS[planCurve(k) + 1]} curve` }))
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      choosePlan(k)
    })
    return b
  }).sort((a, b) => a.dataset.k - b.dataset.k))
  $('plan').hidden = false
  // A tier-3 bowler whose plans keep coming out right is offered the next challenge once a game:
  // bumpers down, so the aim has to be true too.
  // The plans counted are this tier's own (setTier starts them again), and the last frame keeps its bumpers.
  $('bumpers-down').hidden = !(game.tier >= 3 && game.bumpers && game.planHits >= 2 && game.planHits + game.planNear >= 4 && !game.bumperOffer && card.frame < card.count - 1)
  if (!$('bumpers-down').hidden) game.bumperOffer = true
  // Asked aloud the first time in a game; after that the picture asks.
  if (game.plansAsked++ < 1) voice.say(`Make a plan. ${$('plan-text').textContent}`)
  else audio.tick(2)
}

/**
 * Tier 1, a fresh rack: the same decision without numbers. "A few or a lot?" as two pictures of ten
 * dots, a few lying down or most of them. Where the penguin stands decides it (the edge knocks a few,
 * the middle a lot), so the first slide is aimed, not only pressed. A few means 1 to 4 fall, a lot 7
 * or more. The first two plans of a game show the footprints; after that the child finds the spot.
 */
const ROUGH = { 2: 'a few', 9: 'a lot' }
const roughHit = (k, n) => (k === 2 ? n >= 1 && n <= 4 : n >= 7)
function offerRoughPlan() {
  $('plan').classList.remove('leave')
  $('plan-text').textContent = 'A few or a lot?'
  $('plan-row').replaceChildren(...Object.entries(ROUGH).map(([k, words]) => {
    const b = document.createElement('button')
    b.dataset.k = k
    b.dataset.knock = k
    b.className = 'rough'
    b.setAttribute('aria-label', `Knock down ${words}`)
    b.append(tenFrame(Number(k)), Object.assign(document.createElement('small'), { textContent: words }))
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      choosePlan(Number(k))
    })
    return b
  }))
  $('bumpers-down').hidden = true
  $('plan').hidden = false
  if (game.plansAsked++ < 1) voice.say('Make a plan. Will you knock down a few, or a lot?')
  else audio.tick(2)
}

const FEW = { 1: 1, 4: 1 }
const MANY = { 8: 1, 9: 1 }
/** Tier 3's curved plans: knock 3 (leave 7) curving from the middle, knock 2 (leave 8) one step out curving away. */
const CURVED = new Set([2, 3])
/**
 * A curved plan sets the curve button for the child: from the middle to the left (it gives 3 every time),
 * from one step out away from the middle, on the side the penguin is nearest.
 */
const planCurve = (k) => (!CURVED.has(k) ? 0 : k === 3 ? -1 : game.x < 0 ? -1 : 1)
const CURVE_ICONS = ['↖️', '⬆️', '↗️']
/**
 * Where a slide knocks about k: straight, the middle 9, one step out 8, two steps 4, the edge just one;
 * curved (tier 3), the middle 3 and one step out 2.
 */
const planSpot = (k, curved = false) => (curved ? (k === 2 ? STEP_X : 0) : k >= 9 ? 0 : k >= 7 ? STEP_X : k >= 3 ? STEP_X * 2 : MAX_X)

/** Just the pins left standing: n upright dots, with no gaps to count the knocked ones by. */
function standRow(n) {
  const el = document.createElement('span')
  el.className = 'ten stand'
  for (let i = 0; i < n; i++) el.append(document.createElement('i'))
  return el
}

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
  const leave = game.tier >= 3
  const rough = game.tier < 2
  const side = game.x < 0 ? -1 : 1
  const curve = leave ? planCurve(k) : 0
  game.plan = { k, got: null, leave, curve, slid: null, rough }
  $('plan').hidden = true
  $('predict-pins').disabled = true // the plan is this slide's decision; 💭 comes back for the next one
  if (curve) {
    game.curve = curve
    updateCurveBtn()
  }
  updatePlanPill()
  // The first plan of a game is read out; after that the 🎯 card beside the rack says it.
  if (game.plansAsked === 1 && !game.planSaid) {
    game.planSaid = true
    voice.sayNow(rough ? `Knock down ${ROUGH[k]}.` : game.plan.leave ? `Leave ${10 - k} standing.` : `Knock down ${k}. Leave ${10 - k} standing.`)
  }
  // Tier 1: the whole footprint trail for the first two plans of a game (the edge for a few, the middle
  // for a lot); after that the child finds the spot, and the prints come back after a plan that missed.
  if (rough) {
    if (game.plansMade++ < 2 || game.planOff) spot.show(k === 2 ? side * MAX_X : 0)
    return
  }
  // Tier 2: for the first two plans of a game footprints show where to stand, on the side the penguin is
  // nearest; after that the child finds the spot (the middle knocks many, the edge few), and the prints
  // come back only after a plan that came out two or more away. Tier 3 remembers the straight spots alone;
  // a curved plan is new, so its first one in a game (and one after a curved plan far off) gets the prints.
  if (game.tier === 2 && (game.plansMade++ < 2 || game.planOff)) spot.show(side * planSpot(k), { short: true, label: k })
  else if (game.tier === 2) voice.sayOnce('Now you find where to stand.')
  else if (curve && (game.curvePlans++ < 1 || game.planOff)) {
    spot.show(k === 3 ? 0 : side * planSpot(k, true), { short: true, label: 10 - k })
    voice.sayOnce('A curved plan. Stand on the footprints, then press Go.')
  }
}

/** The plan stays in view beside the rack: what was planned, then what fell. */
function updatePlanPill() {
  const el = $('plan-pill')
  const p = game.plan
  el.hidden = !p
  if (!p) return
  // A "leave" plan (tier 3) is shown and checked by the pins left standing; a "knock" plan by the pins that fell.
  const show = (n) => (p.leave ? 10 - n : n)
  if (p.rough) {
    // A picture plan: what was planned in words, then a ✓ or how many fell.
    const ok = p.got !== null && roughHit(p.k, p.got)
    const done = p.got === null || game.veil ? '' : ok ? ' ✓' : ` → ${p.got}`
    const pic = tenFrame(p.k)
    pic.classList.add('rough')
    el.replaceChildren(Object.assign(document.createElement('span'), { textContent: `🎯 ${ROUGH[p.k]}${done}` }), pic)
    el.classList.toggle('hit', !game.veil && ok)
    el.classList.remove('near')
    el.setAttribute('aria-label', p.got === null || game.veil ? `Plan: knock down ${ROUGH[p.k]}` : `Planned ${ROUGH[p.k]}, ${p.got} fell`)
    return
  }
  const got = p.got === null || game.veil ? '' : p.got === p.k ? ' ✓' : ` → ${show(p.got)}`
  el.replaceChildren(Object.assign(document.createElement('span'), { textContent: `🎯 ${p.leave ? 'leave ' : ''}${show(p.k)}${p.curve ? ` ${CURVE_ICONS[p.curve + 1]}` : ''}${got}` }), p.leave ? standRow(10 - p.k) : tenFrame(p.k))
  el.classList.toggle('hit', !game.veil && p.got === p.k)
  el.classList.toggle('near', !game.veil && p.got !== null && Math.abs(p.got - p.k) === 1)
  el.setAttribute('aria-label', p.got === null || game.veil ? `Plan: ${p.leave ? `leave ${10 - p.k} standing` : `knock down ${p.k}`}` : `Planned ${p.k}, ${p.got} fell`)
}

/**
 * The planned slide is over: the two numbers side by side. Returns true when it came out just
 * as planned. A different result is no failure, only a hint about where to stand next time.
 */
function planResult(plan, knocked, { quiet = false } = {}) {
  plan.got = knocked
  game.planOff = Math.abs(knocked - plan.k) >= 2
  updatePlanPill()
  // A line spoken here is this slide's sentence; the question after it doesn't add the cloud line too.
  game.planSpoke = false
  const say = (t) => !quiet && (game.planSpoke = voice.sayOnce(t))
  if (plan.rough) {
    // Tier 1's picture plan: right or not, the count of the pins still standing comes next, by tapping.
    game.planOff = !roughHit(plan.k, knocked)
    if (!game.planOff) {
      audio.jingle(8)
      say('Just as you planned!')
    } else say(plan.k === 2 ? 'For a few, stand near the side.' : 'For a lot, stand in the middle.')
    return false
  }
  if (knocked === plan.k) {
    game.planHits++
    audio.jingle(10)
    say('Just as you planned!')
    return true
  }
  // One away is close: the right spot, with a little luck in how the pins tumble (from the best spot
  // a straight slide gives the planned number about half the time, and one away nearly all the rest).
  // The card turns pale green; no tip is needed.
  if (Math.abs(knocked - plan.k) === 1) {
    game.planNear++
    audio.jingle(4)
    say('Close to your plan!')
    return false
  }
  // The 🎯 card shows both numbers; the voice gives only a tip about where to stand, once a game each way.
  if (plan.curve) {
    say(plan.slid !== plan.curve
      ? 'A curved plan needs the curve. Press Go to slide it.'
      : knocked > plan.k ? 'To leave more standing, curve away from the middle.' : 'To leave fewer standing, curve from the middle.')
    return false
  }
  say(knocked > plan.k
    ? (plan.leave ? 'To leave more standing, stand nearer the side.' : 'To knock down fewer, stand nearer the side.')
    : (plan.leave ? 'To leave fewer standing, stand nearer the middle.' : 'To knock down more, stand nearer the middle.'))
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
    // Asked only when some side would be a wrong answer, and not when the middle is an answer: a pin
    // between the middle and a side counts for both, so with the middle accepted too the spoken counts
    // ("5 in the middle", "4 on the right") would add up to more pins than are standing.
    if (game.askOk.length && !game.askOk.includes('middle')) game.ask = 'where'
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
    // Every accepted side is named, so a right answer after this never contradicts it: "Most are on the
    // left and on the right" is never said as "Most are on the left" before "Yes! 3 on the right".
    // The sides named are left and right only (the middle is never asked), so no pin is counted twice.
    const best = game.askOk[0]
    const all = game.askOk.reduce((a, s) => a + hi[s], 0) === up.length
    const where = listWords.format(game.askOk.map((s) => SIDE_WORDS[s]))
    const shown = ask === 'more'
      ? `${hi[side]} ${SIDE_WORDS[side]}, ${hi[best]} ${SIDE_WORDS[best]}`
      : !hi[side] ? `No pins ${SIDE_WORDS[side]}` : `${all ? (up.length === 1 ? 'It is' : 'They are') : 'Most are'} ${where}`
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
  // The card shows the answer in place of the question (or of a wrong try's comparison).
  $('where-text').textContent = ask === 'more' ? `${hi[side]} ${SIDE_WORDS[side]}` : `${there.length} ${SIDE_WORDS[side]}`
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
  const own = [...game.bonds.values()].filter((b) => b.self).length
  // The headline is what the child worked out: careful counts and bonds answered, not pins that just fell.
  const plans = [...game.bonds.values()].filter((b) => b.plan).length
  $('bonds').replaceChildren(...Array.from({ length: 11 }, (_, k) => bondPicture(10 - k, k, game.bonds.get(`${10 - k}+${k}`))))
  const ways = (n) => `${n} ${n === 1 ? 'way' : 'ways'} to make 10`
  // The headline is the child's own work: the ways they worked out (careful counts, bonds answered),
  // not the ways that merely happened, which random bowling meets as many of as careful bowling.
  // With none worked out it is a plain picture title. The staircase still shows every way met.
  $('bonds-title').textContent = own ? `You worked out ${ways(own)}` : 'Ways to make 10'
  $('bonds-own').textContent = own
  $('bonds-plans').textContent = plans
  $('bonds-plan').hidden = !plans
  $('bonds-key').hidden = !own && !plans
  $('bonds-key-self').hidden = !own
  $('bonds-plan').firstChild.textContent = own ? ' · 🎯 ' : '🎯 '
  voice.say(own
    ? `You worked out ${ways(own)} yourself${plans ? `, and made ${plans} just as you planned` : ''}.`
    : plans ? `You made ${plans} ${plans === 1 ? 'way' : 'ways'} to make 10 just as you planned.` : 'Here are the ways the pins made 10.')
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
  $('curve').textContent = CURVE_ICONS[game.curve + 1]
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

/** The title chip's choice is the family's and is kept; `keep: false` lasts only this game (the tier-3 offer). */
function setBumpers(on, { keep = true } = {}) {
  game.bumpers = on
  if (keep) store.set('bumpers', on ? '1' : '0')
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
  game.bigRolls = 0
  game.bigCount = false
  game.standingSaid = false
  game.rights = 0
  game.misses = 0
  game.ignored = 0
  game.plansMade = 0
  game.curvePlans = 0
  game.planOff = false
  game.planHits = 0
  game.planNear = 0
  game.bumperOffer = false
  // Bumpers start as the title chip says, so one game's "bumpers down" isn't the next child's game.
  setBumpers(store.get('bumpers') !== '0', { keep: false })
  setTier(game.big ? game.bigTier : 1)
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
function setLevel(big) {
  game.big = big
  store.set('level', big ? 'big' : 'little')
  $('level-icon').textContent = big ? '🐧' : '🐣'
  $('level-state').textContent = big ? '6–8' : '3–5'
}
$('level').addEventListener('click', () => {
  audio.unlock()
  audio.click()
  setLevel(!game.big)
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
  setBumpers(false, { keep: false })
  $('bumpers-down').hidden = true
  // Without bumpers the curve from one step out slips into the gutter: the plans are picked again.
  offerPlan()
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
    if (game.counting.waiting) return // the cloud is still settling before the question
    const hit = pinAt(e.clientX, e.clientY)
    if (hit?.q && $('howmany').hidden) countPin(hit.q.i)
    else if (hit?.fallen && $('howmany').hidden) slipPin()
    else if (!hit && $('howmany').hidden) game.counting.strays++ // bare ice: not a count, but a careful counter seldom does it
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
    return b && choosePlan(Number(b.dataset.knock))
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
  // Counting: tablets and laptops held sideways look down from higher with a longer lens, so the pins are
  // about 40% bigger and the rows stand apart to tap; sideways phones a little less, to keep the bond card clear.
  deck: { fov: [26, 40, 34], back: [6.6, 6.2, 6.6], up: [5.2, 4.1, 4.2], look: [-1.8, -1.8, -1.6] },
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
      const di = pi || (innerHeight <= 520 ? 2 : 0)
      wantFov = c.fov[di]
      wantPos.set(0, c.up[di] + (game.dance ? 0.3 : 0), LANE.headPin + c.back[di] + (game.dance ? 0.6 : 0))
      wantLook.set(0, game.dance ? 1.2 : 0.3, LANE.headPin + c.look[di])
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
  setLevel(game.big)
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
  // While the pins are counted, a bond question is open or the child is aiming, the whale doesn't spout
  // and the lamps hold still.
  scenery.hush = (game.state === 'result' && !!game.counting) || game.state === 'aim'
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
