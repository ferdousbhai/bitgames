import { createPrediction, pins as pinWord } from './prediction.js'
import { createVoice } from './speech.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Counter, sideOf } from './count.js'
import { Effects } from './effects.js'
import { LANE, Lane, PENGUIN_R, PIN_H, PIN_SPOTS, Pins } from './lane.js'
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

/** Spoken words for pre-readers, quiet when the game is muted. Words queue; taps interrupt. */
const voice = createVoice({ muted: audio.muted, rate: 0.9, pitch: 1.1 })
const counter = new Counter(scene, { say: voice.say })

// --- Settings -------------------------------------------------------------------------

const MIN_SPEED = 7.5
const MAX_SPEED = 13.5
const MAX_ANGLE = 0.15
const HOOK = 2.6 // sideways pull of a full curve, units/s²
const MAX_X = LANE.half - 0.45
const WOBBLE = 0.012 // radians of random wobble on every slide (about ±7 cm at the pins)

const game = {
  state: 'loading', // loading | title | aim | roll | settle | result | over
  theme: store.get('lane') in THEMES ? store.get('lane') : 'village',
  bumpers: store.get('bumpers') !== '0',
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
  lastScore: null,
  idle: 0, // seconds without a touch while aiming
  walkTo: null, // after the child says where the pins are, the penguin waddles over
  resultWait: 2,
  bonds: new Map(), // the ways to make 10 the child has seen this game: "7+3" -> count
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
  s.replaceChildren(...up.map((p) => pinIcon(p.color, `bond-pin-${p.i}`)))
  f.style.setProperty('--cols', Math.max(1, Math.min(5, fallen.length)))
  s.style.setProperty('--cols', Math.max(1, Math.min(5, up.length)))
  $('bond-fallen-n').textContent = fallen.length
  // The standing number grows as the pins are counted.
  $('bond-standing-n').textContent = up.length ? '' : '0'
  $('bond').setAttribute('aria-label', `${fallen.length} fell and ${up.length} standing make 10`)
  $('bond').hidden = false
  const key = `${fallen.length}+${up.length}`
  game.bonds.set(key, (game.bonds.get(key) ?? 0) + 1)
  return fallen.length
}

function finishRoll() {
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
  // Strikes and spares are named (they change the score), with one soft glow and chord, played once.
  const deck = new THREE.Vector3(0, 1.6, LANE.headPin - 0.8)
  // Every roll ends with the number bond: the fallen pins and the pins still standing make 10.
  const up = standingPins()
  const fallen = showBond(up)
  if (r.strike || r.spare) {
    banner(r.strike ? 'Strike!' : 'Spare!', { kind: r.strike ? 'strike' : 'spare' })
    audio.fanfare()
    audio.cheer(true)
    crowd.start(true)
    game.dance = r.strike
    effects.glow(deck, r.strike ? 16 : 12)
    voice.say(r.strike ? 'Strike! All 10 fell.' : 'Spare! You got them all.')
    game.resultWait = 3.4
    return
  }
  if (knocked === 0) banner('Wheee! 🐧', { plus: 0 })
  audio.jingle(knocked)
  crowd.start(false)
  // A few pale sparkles above the deck, never a cloud over the pins left to count
  if (knocked) effects.glow(deck, 6)
  // The pins left standing light up one at a time, counted aloud: "1, 2, 3 still standing".
  const delay = guessed ? 1.5 : 0.8
  counter.start(up, delay, () => voice.say(`${fallen} fell and ${up.length} standing. ${fallen} and ${up.length} make 10.`))
  counter.onStep = (q) => {
    $(`bond-pin-${q.i}`)?.classList.add('lit')
    $(`rack-${q.i}`)?.classList.add('lit')
    $('bond-standing-n').textContent = q.n
    audio.squeak(0.9 + q.n * 0.05)
  }
  game.resultWait = Counter.duration(up.length, delay) + 2.6
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
    if (r.frameDone) showIntro(card.frame === FRAMES - 1 ? '🏁' : '🎳', card.frame === FRAMES - 1 ? 'Last frame!' : `Frame ${card.frame + 1}`)
  } else {
    for (const p of pins.clearFallen()) effects.puff(p, 5, 0.6)
    audio.poof()
  }
  updateRack(standingSet())
  toAim()
  // Bumpers only guard the gutters; aiming is the child's job. Before a second
  // roll the rings stay under the pins left, and the child says where they are.
  if (r.resetPins) counter.clear()
  else askWhere()
}

const SIDE_WORDS = { left: 'on the left', middle: 'in the middle', right: 'on the right' }

/** Spare time: look at the pins left and say where they are. */
function askWhere() {
  const up = standingPins()
  if (!up.length) return counter.clear()
  counter.keepRings()
  for (const b of document.querySelectorAll('#where button')) b.className = ''
  $('where').hidden = false
  voice.say(`${pinWord(up.length)} left. Where are they?`)
}

function chooseSide(btn) {
  if (game.state !== 'aim') return
  audio.unlock()
  game.idle = 0
  const side = btn.dataset.side
  const there = standingPins().filter((p) => sideOf(p.x) === side)
  if (!there.length) {
    btn.className = 'no'
    audio.squeak(0.8)
    voice.sayNow(`No pins ${SIDE_WORDS[side]}. Look for the glowing rings.`)
    return
  }
  for (const b of document.querySelectorAll('#where button')) if (b.className !== 'no') b.className = b === btn ? 'yes' : ''
  audio.jingle(there.length)
  voice.sayNow(`Yes! ${pinWord(there.length)} ${SIDE_WORDS[side]}.`)
  // The penguin waddles over to face them; aiming the slide is still up to the child.
  game.walkTo = clamp(there.reduce((a, p) => a + p.x, 0) / there.length, -MAX_X, MAX_X)
}
for (const b of document.querySelectorAll('#where button')) {
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    chooseSide(b)
  })
}

/** The waddle: small hops sideways until the penguin stands where the child chose. */
function walk(dt) {
  if (game.walkTo === null) return
  const d = game.walkTo - game.x
  if (Math.abs(d) < 0.01) {
    game.walkTo = null
    return
  }
  game.x += Math.sign(d) * Math.min(Math.abs(d), dt * 1.8)
  penguin.x = game.x
  if (penguin.hop < 0.05) {
    penguin.hop = 0.4
    audio.squeak(0.95 + Math.random() * 0.2)
  }
}

function toAim() {
  effects.clearCelebration()
  prediction.aim()
  game.state = 'aim'
  game.idle = 0
  game.hinted = false
  game.walkTo = null
  penguin.ready(game.x)
  effects.puff(penguin.group.position.clone().setY(0.2), 6, 0.5)
  $('controls').classList.remove('away')
  if (game.thrown < 2) $('hint').classList.remove('hidden')
  updateHud()
}

function gameOver() {
  prediction.reset() // the results card gets the stage to itself
  counter.clear()
  $('where').hidden = true
  game.state = 'over'
  const total = card.total
  game.lastScore = total
  $('final').textContent = total
  // What the child did, not a grade: how many strikes and spares they rolled
  const marks = card.frames.flatMap((_, i) => card.marks(i))
  const strikes = marks.filter((m) => m === 'X').length
  const spares = marks.filter((m) => m === '/').length
  $('stars').innerHTML = `<span>🎳 ${card.frames.flat().reduce((a, n) => a + n, 0)}</span>` +
    (strikes ? ` <span class="mark x">X ${strikes}</span>` : '') + (spares ? ` <span class="mark s">/ ${spares}</span>` : '')
  $('stars').setAttribute('aria-label', `${strikes} strikes and ${spares} spares`)
  // What was learned: every way of making 10 the child counted this game.
  const ways = [...game.bonds.keys()].sort((a, b) => parseInt(b) - parseInt(a))
  $('bonds').replaceChildren(...ways.map((w) => Object.assign(document.createElement('span'), { textContent: w.replace('+', ' + ') })))
  $('bonds-title').textContent = `${ways.length} ${ways.length === 1 ? 'way' : 'ways'} to make 10`
  voice.say(`You found ${ways.length} ${ways.length === 1 ? 'way' : 'ways'} to make 10, like ${ways[0]?.replace('+', ' and ') ?? '10 and 0'}.`)
  show('results')
  audio.fanfare()
  crowd.start(true)
  effects.clearCelebration()
  effects.glow(new THREE.Vector3(0, 1.6, LANE.headPin - 1.2), 14)
}

// --- HUD ------------------------------------------------------------------------------

function buildCard() {
  const el = $('card')
  el.innerHTML = ''
  for (let i = 0; i < FRAMES; i++) {
    const f = document.createElement('div')
    f.className = 'frame' + (i === FRAMES - 1 ? ' wide' : '')
    f.innerHTML = `<div class="rolls">${'<span></span>'.repeat(i === FRAMES - 1 ? 3 : 2)}</div><div class="tot"></div>`
    el.appendChild(f)
  }
}

function updateHud() {
  $('score').textContent = card.total
  const totals = card.totals()
  const frames = $('card').children
  for (let i = 0; i < FRAMES; i++) {
    const f = frames[i]
    const marks = card.marks(i)
    const spans = f.querySelectorAll('.rolls span')
    spans.forEach((s, k) => {
      let m = marks[k] ?? ''
      // A strike in frames 1-9 shows in the right-hand box, like a real score sheet
      if (i < FRAMES - 1 && marks[0] === 'X') m = k === 1 ? 'X' : ''
      s.textContent = m
      s.className = m === 'X' ? 'x' : m === '/' ? 's' : ''
    })
    f.querySelector('.tot').textContent = totals[i] ?? ''
    f.classList.toggle('now', i === card.frame && game.state !== 'over')
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

function toTitle() {
  voice.hush()
  prediction.reset()
  counter.clear()
  $('bond').hidden = true
  $('where').hidden = true
  game.state = 'title'
  game.dance = false
  $('last').textContent = game.lastScore !== null ? `🎳 ${game.lastScore}` : ''
  lane.hideAim()
  pins.reset()
  pins.list.forEach((p) => (p.drop = 0))
  game.x = 0
  penguin.ready(0)
  show('title')
}

function start() {
  voice.hush()
  prediction.reset()
  counter.clear()
  game.bonds.clear()
  $('bond').hidden = true
  $('where').hidden = true
  audio.unlock()
  audio.click()
  card.reset()
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
  game.walkTo = null
  game.x = clamp(game.x + dir * 0.35, -MAX_X, MAX_X)
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
  if (game.state !== 'aim') return
  drag.tapPenguin = onPenguin
  game.walkTo = null
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
    walk(dt)
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
  effects.update(dt)
  updateAimPreview()
  updateCamera(dt, t)
  audio.updateMusic(game.state !== 'loading')
  renderer.render(scene, camera)
}
renderer.setAnimationLoop(() => frame())

show('loading')
load()
if (new URLSearchParams(location.search).has('debug')) window.__pb = { counter, standingPins, chooseSide, prediction, CAM, frame, scene, camera, effects, game, lane, pins, penguin, card, throwPenguin, renderer }
