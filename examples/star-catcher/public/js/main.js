import { createAdventure } from './adventure.js'
import { createVoice } from './speech.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Particles, Popups, makeGlowTexture, numberTexture } from './effects.js'
import { Sky } from './sky.js'
import { STOPS, World } from './world.js'

const $ = (id) => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const { clamp, damp } = THREE.MathUtils
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

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
renderer.toneMappingExposure = 1.05
renderer.autoClear = false // the constellation panel is drawn as a second, flat pass (see frame)
const scene = new THREE.Scene()
scene.fog = new THREE.Fog('#2a1f66', 26, 85)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(0, 0, 16)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45
scene.add(new THREE.HemisphereLight('#d9d2ff', '#3a2a7a', 1.4))
const key = new THREE.DirectionalLight('#fff3e0', 2.4)
key.position.set(4, 6, 10)
scene.add(key)
const rim = new THREE.DirectionalLight('#8fd3ff', 1.6)
rim.position.set(-6, 4, -6)
scene.add(rim)

const audio = new Audio()
audio.muted = store.get('star-catcher-muted', false)
audio.musicOn = store.get('star-catcher-music', true)
const particles = new Particles(scene)
const popups = new Popups($('popups'), camera)
const glowTex = makeGlowTexture(false)
// The constellation panel and the night sky at home (runtime geometry, drawn over the scene)
const sky = new Sky({ reducedMotion, onLit: (n, total, data) => starLit(n, total, data), onComplete: (def) => startJoin(def) })

// --- Game state ----------------------------------------------------------------------

// `k` is the visible height compared with a roomy screen: falling speeds scale with it, so a
// zoomed-in sideways phone gives little hands just as long to reach each star
const FULL_H = Math.tan((50 * Math.PI) / 360) * 16
// hudY: the lowest edge of the top HUD in world units; falling things appear below it, never through it
const view = { w: 10, h: 7.5, k: 1, xMin: -9, xMax: 9, yMin: -6, yMax: 1, hudY: 5 }
const game = {
  state: 'loading', // loading | title | play | finale
  // On each leg: 'build' (catching stars to light the constellation), 'join' (joining its dots in
  // counting order), 'arrive' (Kitty at the planet while the constellation is named), 'choose'
  // (picking the next shape) or 'homeward' (the last flight home)
  phase: 'build',
  phaseTime: 0,
  stops: 0, // planets reached, one finished constellation each
  spawnTimer: 1,
  dizzy: 0,
  roll: 0,
  joy: 0,
  cruise: 4,
  time: 0,
  idle: 0, // seconds since the player last steered (see the nudge in frame)
  factSaid: false, // the planet's fact has been spoken (see arrive)
  level: 0, // see LEVELS; follows how the child is doing
  misses: 0, // stars caught with the wrong number on this constellation
  right: 0, // stars caught with the right number on this constellation
  history: [], // { right, misses } of the constellations built at this level (see adapt)
  hints: 0, // spoken wrong-number hints on this constellation (at most one)
  counting: false, // this constellation's numbers are said aloud one by one (the trip's first, when matching)
  values: [], // the number each star of this constellation carries
  row: 0, // the row of stars now falling (each row is one choice)
  rowTimer: 1, // seconds until the next row, counted once the sky is clear
  streak: 0, // wrong picks in a row for the star needed now
  joinHint: false, // the join-the-dots hint was said on this constellation
  joinTold: false, // "Join the dots!" was said on this trip
  offered: false, // the cards offered two different ways of counting
  climbed: false, // the last shape moved the level up (see offerLevels)
  made: [], // the level id each constellation of this trip was counted with (see the home sky)
}

/**
 * Stars come down in rows of two or three, side by side, and each row is one choice: the star
 * with the needed number lights the next star of the constellation, and once any star of the row
 * is caught the others fade. A wrong pick floats away and the next row comes after a calm pause,
 * so careful steering builds the shape far sooner than sweeping. Every sequence starts somewhere
 * new each time, so it has to be worked out, not remembered. The numbers follow how the child is
 * doing (never a gate), easiest first:
 *  match: the panel shows the number to find (two stars a row)
 *  next: count on from 2 to 8 (the panel shows the last number and a "?")
 *  back: count back from 8 to 15
 *  twos, fives: skip counting from a different place each time
 *  big: counting on from 12 to 41, where 31 sits beside 13 (both digits matter)
 *  tens: jumps of ten from any number (7, 17, 27): only the tens digit changes
 *  pattern: the panel shows the last two numbers; the jump is the puzzle (2 or 5 first, then 3,
 *    4 or 2 down, then 5 or 10 down too)
 *  leap: patterns with big jumps (9, 11, 12 and 20 up, 9 and 11 down), where both digits move, so
 *    every jump is bigger than the pattern level's (its card shows 9 → 20 → ?)
 * Each level's `near` lists its mix-ups worth noticing, in order: the number already lit, the one
 * skipped, counting by ones instead of in steps, or the digits swapped. `rule` is the short words
 * the panel shows for it, and `sample` the little number picture its choice card shows (so a
 * pre-reader sees which is harder); `ask` is how the home sky asks about it; `tip`
 * marks a `say` line that adds more than the rule's name (said even when the rule was just picked).
 */
const seq = (from, step) => (n) => Array.from({ length: n }, (_, k) => from + k * step)
const between = (a, b) => a + ((Math.random() * (b - a + 1)) | 0)
const swapDigits = (v) => Number(String(v).split('').reverse().join(''))
/** The pattern level's jump for this constellation (see LEVELS), kept so its mix-ups fit it. */
let jump = 3
let patterns = 0 // pattern constellations on this trip, so the jumps grow harder in turn
/** A jump from `tiers` (easiest first, one tier further each time) that keeps `n` numbers under 100, never the same as the last. */
function pickJump(tiers, n) {
  const list = tiers[Math.min(patterns++, tiers.length - 1)].filter((j) => j !== jump && Math.abs(j) * (n - 1) <= 90)
  jump = list[between(0, list.length - 1)]
  return jump
}
/** A pattern of `n` numbers with jump `j`, all between 1 and 99. */
const patternOf = (j, n) => seq(j > 0 ? between(1, Math.min(20, 99 - j * (n - 1))) : -j * (n - 1) + between(1, Math.min(30, 99 + j * (n - 1))), j)(n)
const LEVELS = [
  { id: 'match', labels: 'all', choices: 2, values: seq(1, 1), near: (v) => [v + 1, v - 1, v + 2], tag: () => 'Match the numbers', rule: 'Match 1, 2, 3', sample: '3 = 3', say: 'Catch the star with the same number as the sky. Find number 1!' },
  { id: 'next', labels: 'ask', choices: 3, values: (n) => seq(between(2, 8), 1)(n), near: (v) => [v - 1, v + 1, v + 2], tag: (v) => `What comes next? ${v[0]}, ?`, rule: 'Count on +1', sample: '4 → 5 → ?', ask: 'Which one did we count on, one more each time?', say: 'Which number comes next? Catch it!' },
  { id: 'back', labels: 'ask', choices: 3, values: (n) => seq(between(Math.max(8, n + 1), 15), -1)(n), near: (v) => [v + 1, v - 1, v - 2], tag: (v) => `Count back from ${v[0]}`, rule: 'Count back −1', sample: '9 → 8 → ?', ask: 'Which one did we count back, like a rocket?', say: 'Now we count back, like a rocket!' },
  { id: 'twos', labels: 'ask', choices: 3, values: (n) => seq(2 * between(1, 5), 2)(n), near: (v) => [v - 2, v - 1, v + 2, v + 1], tag: (v) => `Count by twos from ${v[0]}`, rule: 'By twos +2', sample: '2 → 4 → ?', by: 'twos', ask: 'Which one did we count by twos?', say: 'Now we count by twos!' },
  { id: 'fives', labels: 'ask', choices: 3, values: (n) => seq(5 * between(1, 4), 5)(n), near: (v) => [v - 4, v + 5, v - 5, v + 1, v + 10], tag: (v) => `Count by fives from ${v[0]}`, rule: 'By fives +5', sample: '5 → 10 → ?', by: 'fives', ask: 'Which one did we count by fives?', say: 'Now we count by fives!' },
  {
    id: 'big', labels: 'ask', choices: 3,
    // Never 11, 22, 33… or a ten, so the swapped digits always make a different number (a ten passed on the way, like 20, is mixed up with 10 instead of 2)
    values: (n) => { let a; do a = between(12, 41); while (a % 11 === 0 || a % 10 === 0); return seq(a, 1)(n) },
    near: (v) => [v % 10 ? swapDigits(v) : v - 10, v + 1, v - 1, v + 10], tag: (v) => `Big numbers from ${v[0]}`, rule: 'Big numbers +1', sample: '23 → 24 → ?', ask: 'Which one had the big numbers?', tip: true, say: 'Now the big numbers! Look at both digits.',
  },
  { id: 'tens', labels: 'ask', choices: 3, values: (n) => seq(between(1, 9), 10)(n), near: (v) => [v - 9, v + 10, v - 10, v + 1], tag: (v) => `Jump by tens from ${v[0]}`, rule: 'By tens +10', sample: '7 → 17 → ?', by: 'tens', ask: 'Which one did we count by tens?', tip: true, say: 'Now we jump by tens! Only the first digit changes.' },
  {
    id: 'pattern', labels: 'ask2', choices: 3,
    // The jumps grow harder in turn, and never repeat twice in a row, so each one is worked out afresh
    values: (n) => patternOf(pickJump([[2, 5], [3, -2, 4], [4, -5, -10, 3]], n), n),
    // The one skipped, the one already lit, a jump of one from the last, one off
    near: (v) => [v + jump, v - jump, v - jump + 1, v + 1, v - 1], tag: () => 'Find the pattern', rule: 'Find the jump', sample: '3 → 6 → ?', ask: 'Which one had a number pattern?', tip: true, say: 'Now find the pattern! Look at the last two numbers.',
  },
  {
    id: 'leap', labels: 'ask2', choices: 3,
    values: (n) => patternOf(pickJump([[9, 11, -11], [20, -9, 12], [12, -9, 11, -11, 20]], n), n),
    // The one skipped, then the tens or the ones moved by one: the mix-ups of a two-digit jump
    near: (v) => [v + jump, v - 10, v - 1, v + 1, v + 10, v - jump], tag: () => 'Big jumps', rule: 'Big jumps', sample: '9 → 20 → ?', ask: 'Which one had the big jumps?', tip: true, say: 'Big jumps now! Look at the tens and the ones.',
  },
]
/** The gentle mission keeps to matching numbers, at its slower pace, until its five stars are caught. */
const missionHeld = () => Boolean(adventure.option.goal) && !adventure.complete
const level = () => LEVELS[missionHeld() ? 0 : game.level]
/**
 * The words for one more step from `prev`, named with its rule (a "What comes after 2?" on the
 * twos level would point a child at 3). `older` is the number before `prev`, for the patterns.
 */
function stepHint(prev, older) {
  const L = level()
  if (L.labels === 'ask2' && older != null) {
    const d = prev - older
    const word = d > 0 ? 'more' : 'less'
    return `From ${older} to ${prev} is ${Math.abs(d)} ${word}. What is ${Math.abs(d)} ${word} than ${prev}?`
  }
  if (L.by) return `Counting by ${L.by}, what comes after ${prev}?`
  if (L.id === 'back') return `Count back one from ${prev}.`
  return `What comes after ${prev}?`
}
/** The number on the star that lights next, or null when every star is already on its way. */
function neededValue() {
  return game.phase === 'build' && !sky.full ? game.values[sky.claimed] : null
}

// The sky panel already draws the stars being lit, so the mission card is just its words
function renderMissionProgress(el, option, count) {
  el.textContent = `⭐ Catch stars · ${count} / ${option.target}`
}

/** Speaks to pre-readers (respecting mute). Words wait their turn; taps and counts interrupt. */
const voice = createVoice({ muted: audio.muted, rate: 0.82, pitch: 1 })

let missionTimers = []
let goalSaidAt = -Infinity // when the picker last said a mission's goal (see start)
function clearMissionTimers() {
  missionTimers.forEach(clearTimeout)
  missionTimers = []
  $('adventure-goal')?.classList.remove('resolved')
}
const adventure = createAdventure({
  id: 'star-catcher',
  anchor: $('go'),
  hud: $('hud'),
  voice,
  announce: (text, kind) => {
    if (kind === 'choice') goalSaidAt = performance.now()
    voice.say(text, { interrupt: kind === 'choice' })
  },
  celebrate: (text) => {
    banner('⭐ Mission complete!', text)
    // The finished card stays a moment so the child sees it full, then fades out (CSS opacity;
    // the card never takes taps, so the faded card can't block anything)
    clearMissionTimers()
    missionTimers.push(setTimeout(() => $('adventure-goal')?.classList.add('resolved'), 3500))
  },
  renderProgress: renderMissionProgress,
  options: [
    { emoji: '🚀', label: 'Free space flight', caption: 'Free flight' },
    // Slower, and always matching the numbers 1 to 5: for the youngest pilots
    { label: 'Gentle star counting', pictures: '⭐ ⭐ ⭐ ⭐ ⭐', caption: 'Count 5 stars', pace: 0.6, goal: 'Catch stars 1 to 5', target: 5, reward: 'Five stars for a new constellation!' },
  ],
})

const items = []
const pools = {}
const templates = {}
const haloMats = {} // one glow material per kind, shared by every clone of it
let models = {}
let world = null
let rocket = null

/** How the trip feels on the way to stop `i`: a constant gentle pace; later planets add a sleepy rock or a passing UFO, never speed. */
function leg(i) {
  return {
    speed: 2.3,
    rock: i >= 3 ? 0.06 : 0,
    ufo: i >= 1,
  }
}

// Falling things: numbered stars (one of them lights the next star of the constellation) and
// sleepy rocks to steer around. There are no points, power-ups or bonus colours.
const KINDS = {
  star: { model: 'star', scale: 0.62, r: 0.6, glow: '#ffd23f', colors: ['#fff3a0', '#ffd23f', '#ffffff'] },
  rock: { model: 'rock', scale: 0.8, r: 0.6, glow: null, colors: ['#c9b6ff', '#ffffff'] },
}

// --- Assets -------------------------------------------------------------------------

async function load() {
  const gltf = await new GLTFLoader().loadAsync('./models/space.glb')
  for (const child of [...gltf.scene.children]) models[child.name] = child

  for (const [kind, k] of Object.entries(KINDS)) {
    const g = new THREE.Group()
    const m = models[k.model].clone()
    m.name = 'model'
    g.add(m)
    if (k.glow) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k.glow, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(3.4)
      halo.position.z = -0.6
      halo.name = 'halo'
      g.add(halo)
      haloMats[kind] = halo.material
    }
    g.scale.setScalar(k.scale)
    templates[kind] = g
    pools[kind] = []
  }

  world = new World(scene, models)
  buildRocket()
  buildUfo()
}

// --- Rocket ---------------------------------------------------------------------------

function buildRocket() {
  const root = new THREE.Group()
  const model = models.rocket
  model.scale.setScalar(0.62)
  root.add(model)
  const flame = model.getObjectByName('rocket_flame')
  const pilot = model.getObjectByName('rocket_pilot')
  const nozzle = model.getObjectByName('rocket_nozzle')
  // Warm glow behind the flame
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff9f43', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.position.set(0, -1.35, -0.2)
  glow.scale.setScalar(2.6)
  model.add(glow)
  scene.add(root)
  rocket = { root, model, flame, pilot, pilotZ: pilot.position.z, nozzle, glow, vel: new THREE.Vector2(), target: new THREE.Vector2(0, -3), nozzleWorld: new THREE.Vector3() }
  root.position.set(0, -view.h * 0.62, 0)
}

// A friendly UFO glides past now and then: scenery only, it drops nothing
const ufo = { obj: null, lights: null, lightMats: [], active: false, timerLeft: 12, dir: 1, t: 0 }
function buildUfo() {
  ufo.obj = models.ufo.clone()
  ufo.obj.scale.setScalar(0.9)
  ufo.obj.visible = false
  ufo.lights = ufo.obj.getObjectByName('ufo_lights')
  // Own material so blinking doesn't touch anything else
  ufo.lights.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone()
      ufo.lightMats.push(o.material)
    }
  })
  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#8ef0c8', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
  beam.scale.set(2.2, 3, 1)
  beam.position.y = -1.2
  ufo.obj.add(beam)
  scene.add(ufo.obj)
}

// --- Items --------------------------------------------------------------------------

function spawn(kind, x, y, vy, extra = {}) {
  const k = KINDS[kind]
  const obj = pools[kind].pop() ?? templates[kind].clone()
  obj.position.set(x, y, 0)
  obj.rotation.set(0, 0, 0)
  obj.scale.setScalar(k.scale)
  obj.visible = true
  scene.add(obj)
  const it = { obj, kind, k, x, vy, big: 1, t: Math.random() * 10, sway: kind === 'rock' ? 0 : rand(0.15, 0.45), bounced: false, fading: false, vx: 0, spin: 0, value: null, ...extra }
  if (kind === 'star') labelStar(it)
  items.push(it)
}

/** Each star wears its number on a little sprite of its own, in front of the star and never spinning. */
function labelStar(it) {
  let label = it.obj.userData.label
  if (!label) {
    // Drawn over its own star even while the star tilts, so a two-digit number is never half hidden
    label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }))
    label.position.set(0, 0, 0.9)
    label.renderOrder = 2
    it.obj.add(label)
    it.obj.userData.label = label
  }
  const tex = numberTexture(String(it.value))
  if (label.material.map !== tex) {
    label.material.map = tex
    label.material.needsUpdate = true
  }
  label.material.opacity = 1
  label.scale.set(1.45 * tex.userData.aspect, 1.45, 1)
}

function recycle(i) {
  const it = items[i]
  scene.remove(it.obj)
  pools[it.kind].push(it.obj)
  items.splice(i, 1)
}

/** The needed number and its mix-ups for this level: two or three stars, in a shuffled row. */
function rowValues(need) {
  const L = level()
  const near = [...new Set(L.near(need))].filter((v) => v > 0 && v !== need)
  // At the first level the one mix-up is any near number; later the first ones are the telling ones
  if (L.id === 'match') near.sort(() => Math.random() - 0.5)
  // Two wrong picks in a row for this star: the next rows offer just two stars until it is found
  const choices = game.streak >= 2 ? 2 : L.choices
  const values = [need, ...near.slice(0, choices - 1)]
  return values.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v)
}

/** One choice: a row of numbered stars side by side, spread across the sky so each is easy to reach alone. */
function spawnRow() {
  const need = neededValue()
  if (need == null) return
  const values = rowValues(need)
  const span = view.xMax - view.xMin
  const lane = span / values.length
  // Three wrong picks in a row for this star: the row comes slower and the needed star is a little
  // bigger (steady, never pulsing), so a struggling child is helped to it without being shown a trick
  const help = game.streak >= 3
  const vy = -leg(game.stops).speed * view.k * 0.85 * (help ? 0.7 : 1)
  game.row++
  values.forEach((value, i) => {
    const x = view.xMin + lane * (i + 0.5) + rand(-0.15, 0.15) * lane
    spawn('star', x, view.h + 1.5 + rand(-0.25, 0.25), vy, { value, row: game.row, sway: Math.min(0.2, lane * 0.08), big: help && value === need ? 1.25 : 1 })
  })
  // If the row drifts past untouched, the next one follows soon: nothing is lost
  game.rowTimer = 0.4
}

/** A star of the row was caught: the rest of the row fades, and the next row waits a moment (longer after a wrong pick). */
function resolveRow(it, right) {
  for (const other of items) {
    if (other === it || other.row !== it.row) continue
    other.fading = true
    // After a wrong pick the right star stays a moment longer (it can't be caught now): "this was the one"
    if (!right && other.value === game.values[sky.claimed]) other.reveal = 1.3
  }
  game.rowTimer = right ? 0.45 : 1.8
}

function spawnRock() {
  const L = leg(game.stops)
  if (Math.random() >= L.rock * 4) return
  spawn('rock', rand(view.xMin + 0.5, view.xMax - 0.5), view.h + 1.5, -L.speed * view.k * 0.7)
}

// --- Catching ---------------------------------------------------------------------------

const tmp = new THREE.Vector3()
const rocketCenter = new THREE.Vector3()

/** A world point on the play plane as CSS pixels, where its flight up to the panel begins. */
function toScreen(pos) {
  tmp.copy(pos).project(camera)
  return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight }
}

/** Kitty touches a star. Returns true when the star is used up (it flies to the panel). */
function catchItem(it) {
  const pos = it.obj.position
  const need = neededValue()
  if (need != null && it.value !== need) {
    wrongStar(it, need)
    return false
  }
  // The note follows where the star was caught (left is low, right is high), so it never climbs into a frenzy
  const across = clamp((pos.x - view.xMin) / Math.max(view.xMax - view.xMin, 1), 0, 1)
  audio.catch(Math.round(across * 5))
  particles.burst(pos.clone(), it.k.colors, 6, 2.5, 0.6)
  game.joy = 0.35
  resolveRow(it, true)
  if (need == null) return true
  game.right++
  game.streak = 0
  // A star the mission counted is counted aloud by the mission's own voice, so the sky stays quiet
  const counted = adventure.event(it)
  const at = toScreen(pos)
  sky.claim(at.x, at.y, { quiet: counted === 'counted' || counted === 'done' })
  // A "?" that was opened up as a hint closes again for the next star
  sky.labels = level().labels
  renderRule()
  return true
}

/**
 * The wrong number: the star does not light anything. It floats gently back up and away with the
 * rest of its row, the next star's ring brightens, and the next row waits a calm moment. Once per
 * constellation the voice names the number caught and asks again; after two wrong picks for one
 * star the panel shows the number itself instead of "?".
 */
function wrongStar(it, need) {
  it.bounced = true
  it.fading = true // it shrinks away as it floats up
  it.vx = rand(-0.6, 0.6)
  it.vy = 2.2
  it.spin = rand(-1, 1)
  resolveRow(it, false)
  audio.notThis()
  sky.call()
  game.misses++
  game.streak++
  game.idle = 0
  // Two wrong picks for this very star (not the shape) open its "?": an earlier slip never turns later stars into matching
  if (game.streak >= 2) sky.labels = 'all'
  renderRule()
  if (game.hints >= 1) return
  game.hints++
  const prev = game.values[sky.claimed - 1]
  let line = `That one is ${it.value}. Find ${need}.`
  if (level().labels !== 'all' && prev != null) {
    const ask = stepHint(prev, game.values[sky.claimed - 2])
    line = it.value === prev ? `We have ${prev} already. ${ask}` : `That one is ${it.value}. ${ask}`
  }
  // Queued, never cutting into a number still being said (or cut off by one)
  voice.say(line)
}

/**
 * The rule stays on screen under the panel while a shape is built, with the numbers in their
 * order: "By fives · 15 → ?" or, for a pattern, "15 → 13 → ?" (the jump is the puzzle, so only
 * the order shows). The first star (two for a pattern) is already lit, so every catch is a step.
 * The panel's own labels sit beside the stars; this line says which came first.
 */
function renderRule() {
  const el = $('sky-rule')
  const L = level()
  const n = sky.claimed
  const v = game.values
  if (game.phase !== 'build' || n >= v.length) {
    el.textContent = ''
    return
  }
  const open = sky.view?.labels === 'all'
  if (L.labels === 'all') el.textContent = `Find ${v[n]}`
  else {
    const known = L.labels === 'ask2' ? 2 : 1
    const shown = [...v.slice(Math.max(0, n - known), n), open ? v[n] : '?']
    // A pattern's three numbers say enough on their own (the banner named the rule)
    const words = L.labels === 'ask2' ? '' : `${L.rule} · `
    el.textContent = words + shown.join(' → ')
  }
}

/** A star has landed in the panel: a soft bell, and on the trip's first matching constellation its number said aloud. */
function starLit(n, total, data) {
  audio.light(n)
  // The bells and the panel carry the count; the whole row of numbers is said once, at the planet
  if (!data?.quiet && game.counting) voice.count(game.values[n - 1], { interrupt: false })
  renderJourney()
}

function bumpRock(it) {
  it.bounced = true
  const dir = Math.sign(it.obj.position.x - rocket.root.position.x) || 1
  it.vx = dir * 4
  it.vy = 2.5
  it.spin = dir * -4
  game.dizzy = 1.2
  rocket.vel.x -= dir * 6
  audio.boing()
  popups.show(it.obj.position, '💫')
  for (let k = 0; k < 6; k++) {
    const a = (k / 10) * Math.PI * 2
    particles.emit(rocketCenter.x + Math.cos(a) * 0.9, rocketCenter.y + 1.2, 0.5, { vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, spread: 0.3, life: 1, size: 0.5, color: '#fff3a0', drag: 1 })
  }
}

/**
 * The constellation's stars are all lit: at the planet its shape moves into a big card with its
 * stars numbered, and the child joins the dots by tapping the stars in counting order (the order
 * they were caught, so counting back or by fives is joined the same way). Each line appears once
 * both its stars are joined, so the picture is drawn by the child's own number order. A tap out
 * of order just plays the soft "hmm" and rings the star that comes next.
 * Above matching, one number (two from jumps of ten) hides as "?": when the join reaches it, the
 * child picks the missing number from three, so the rule caught in flight is used once more.
 */
function startJoin(def) {
  game.phase = 'join'
  game.phaseTime = 0
  game.joinHint = false
  for (const it of items) if (it.kind === 'star') it.fading = true
  const box = $('join')
  $('join-cap').textContent = 'Join the dots ✨'
  box.classList.remove('hidden')
  // The youngest (matching) see a ring on every next star; later the ring shows only the start
  const L = level()
  sky.join($('join-card'), L.labels === 'all', hiddenStars(L, game.values.length))
  renderRule()
  if (!game.joinTold) {
    game.joinTold = true
    voice.say(`Join the dots! Tap the stars in order. Start at ${game.values[0]}.`)
  }
  renderJourney()
}

/** Which stars hide their number in the join card: none when matching, one, or two from jumps of ten. */
function hiddenStars(L, n) {
  const count = L.labels === 'all' ? 0 : LEVELS.indexOf(L) >= LEVELS.findIndex((l) => l.id === 'tens') ? 2 : 1
  const pool = Array.from({ length: n - 1 }, (_, k) => k + 1).sort(() => Math.random() - 0.5)
  const out = []
  // Never two side by side, so each missing number sits between two that are shown
  for (const i of pool) if (out.length < count && !out.some((j) => Math.abs(j - i) < 2)) out.push(i)
  return out
}

/** The join has reached a hidden number: three numbers to pick from (the one missing and two telling mix-ups). */
function openPicker() {
  const at = sky.view.joinCount
  const need = game.values[at]
  // Mix-ups already on the card would be too easy to rule out, so they are left out
  // (the digits swapped, or ten or three away, fill in when every telling one is on the card)
  const near = [...new Set([...level().near(need), need % 10 ? swapDigits(need) : need - 10, need + 10, need - 10, need + 3, need - 3])].filter((v) => v > 0 && !game.values.includes(v))
  const values = [need, ...near.slice(0, 2)].sort(() => Math.random() - 0.5)
  const box = $('join-pick')
  const buttons = values.map((v) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = v
    b.setAttribute('aria-label', `Number ${v}`)
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', () => pickHidden(v, b))
    return b
  })
  box.replaceChildren(...buttons)
  box.classList.remove('hidden')
  $('join-cap').classList.add('hidden')
  sky.picking = true
  buttons[0].focus({ preventScroll: true })
  voice.sayOnce('A number is hiding. Which one is it?')
}

function pickHidden(value, button) {
  if (game.phase !== 'join' || !sky.picking) return
  audio.unlock()
  const at = sky.view.joinCount
  if (value === game.values[at]) {
    game.right++
    sky.picking = false
    $('join-pick').classList.add('hidden')
    $('join-cap').classList.remove('hidden')
    joinStar(at)
    return
  }
  // The wrong number fades; the ring on the "?" brightens and the voice names the rule once
  game.misses++
  button.disabled = true
  audio.notThis()
  sky.call()
  if (game.joinHint) return
  game.joinHint = true
  voice.say(`That one is ${value}. ${stepHint(game.values[at - 1], game.values[at - 2])}`)
}

/** Star `i` is joined: its line grows, and the next hidden number (or the planet) follows. */
function joinStar(i) {
  audio.light(sky.view.joinCount + 1)
  if (sky.joinStar(i)) {
    game.phase = 'joined'
    missionTimers.push(setTimeout(() => game.phase === 'joined' && arrive(sky.def), reducedMotion ? 300 : 800))
  } else if (sky.hiddenNext()) openPicker()
}

function joinTap(e) {
  const i = sky.starAt(e.clientX, e.clientY)
  if (i >= 0) joinAt(i)
}

/** The join card by keyboard or switch: the arrow keys move a soft ring from star to star, Enter or Space joins it. */
function joinKey(e) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Tab: e.shiftKey ? -1 : 1 }[e.key]
  if (step) sky.moveFocus(step)
  else if (e.key === 'Enter' || e.key === ' ') {
    if (sky.view.focus < 0) sky.moveFocus(1)
    else joinAt(sky.view.focus)
  } else return false
  e.preventDefault()
  game.idle = 0
  return true
}

/** A tap (or Enter) on star `i` of the join card. */
function joinAt(i) {
  if (game.state !== 'play' || game.phase !== 'join' || sky.picking) return
  audio.unlock()
  const at = sky.view.joinCount
  if (i === at) {
    game.right++
    joinStar(i)
    return
  }
  if (sky.view.joinedAt[i] >= 0) return // already joined: nothing to undo or scold
  game.misses++
  audio.notThis()
  sky.call()
  if (game.joinHint) return
  game.joinHint = true
  const v = game.values
  const shown = (k) => (sky.view.hidden.includes(k) ? 'a hidden number' : v[k])
  voice.say(at === 0 ? `That one is ${shown(i)}. Start at ${v[0]}.` : `That one is ${shown(i)}. ${stepHint(v[at - 1], v[at - 2])}`)
}

const ARRIVE_HOLD = 6 // seconds at least at each planet while its constellation is named
const HOME_TIME = 4.5 // the last calm flight home

/** The constellation is whole: Kitty reaches the planet and the shape is named with one true fact. */
function arrive(def) {
  const stop = STOPS[game.stops]
  game.stops++
  game.phase = 'arrive'
  game.phaseTime = 0
  game.roll = reducedMotion ? 0 : 1
  // The name sits under the shape the child just joined (the banner would cover the card)
  $('join-cap').textContent = `${stop.emoji} ${def.name}`
  $('sky-name').textContent = def.name
  audio.constellation()
  game.factSaid = false
  // The numbers are said once, all together, as a little counting rhyme (unless they were just
  // counted aloud). A plain 1, 2, 3… is rhymed only on the trip's first shape: after that it adds nothing.
  const plain = game.values.every((v, i) => v === i + 1)
  const rhyme = game.counting || (plain && game.stops > 1) ? '' : `${game.values.join(', ')}! `
  const last = game.stops >= STOPS.length ? ' Time to fly home!' : ''
  voice.say(rhyme + def.fact + last, { onend: () => (game.factSaid = true) })
  // How it was counted, for the home sky's questions ("Which one did we count by fives?")
  game.made.push(level().id)
  adapt()
  // One soft moment: a few slow, pale sparkles drift up around Kitty
  const p = rocket.root.position
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    particles.emit(p.x + Math.cos(a) * 1.2, p.y + 0.4 + Math.sin(a) * 1.2, 0.3, { vx: Math.cos(a) * 0.4, vy: 0.6 + Math.sin(a) * 0.3, spread: 0.2, life: 2.2, size: 0.45, endSize: 0, color: '#fff3c4', drag: 0.6 })
  }
  renderJourney()
}

/**
 * The two ways of counting offered with the next shapes: the level the child has reached and the
 * one above it (a stretch), or, just after a climb, the level before it and the new one, so the
 * child decides whether to keep the new step. While the gentle mission runs both cards match.
 */
function offerLevels() {
  if (missionHeld()) return [0, 0]
  const L = game.level
  if (game.climbed || L === LEVELS.length - 1) return [L - 1, L]
  return [L, L + 1]
}

/** How each way of counting is offered aloud at the cards. */
const SPOKEN_RULE = { match: 'Match the numbers', next: 'count on', back: 'count back', twos: 'count by twos', fives: 'count by fives', big: 'big numbers', tens: 'jump by tens', pattern: 'find the pattern', leap: 'big jumps' }

/**
 * After the name and fact: the child picks the next shape, or Kitty flies home after the last one.
 * Each card carries its way of counting, and the shape with more stars carries the harder one, so
 * the choice is a real one: a short, steady shape or a longer stretch.
 */
function afterArrival() {
  $('join').classList.add('hidden')
  sky.unjoin($('sky-panel'))
  $('sky-name').classList.add('show')
  if (game.stops >= STOPS.length) return flyHome()
  const offer = sky.offer()
  if (offer.length < 2) return nextLeg(offer[0], game.level)
  game.phase = 'choose'
  game.phaseTime = 0
  const levels = offerLevels()
  // The harder way goes with the bigger shape (or either, when they are the same size)
  const harderFirst = offer[0].stars.length > offer[1].stars.length || (offer[0].stars.length === offer[1].stars.length && Math.random() < 0.5)
  if (harderFirst) levels.reverse()
  const box = $('choose')
  const cells = [...box.querySelectorAll('.choose-cell')]
  cells.forEach((cell, i) => {
    const def = offer[i]
    const L = LEVELS[levels[i]]
    cell.querySelector('span').textContent = def.short
    // A little number picture, not words, so a pre-reader sees which way is harder
    cell.querySelector('b').textContent = `${def.stars.length} ⭐ · ${L.sample}`
    cell.title = L.rule
    cell.setAttribute('aria-label', `${def.short}. ${def.stars.length} stars, ${L.rule}`)
    cell.onclick = () => chooseNext(def, levels[i])
  })
  box.classList.remove('hidden')
  // Keyboard and switch users start on the first card (Tab moves to the other, Enter picks)
  cells[0].focus({ preventScroll: true })
  sky.showChoice(offer, cells)
  // The cards are the question: the voice names the two ways of counting (each pair once a trip)
  const [a, b] = [...levels].sort((x, y) => x - y)
  game.offered = a !== b
  if (a === b) voice.sayOnce('Which shape shall we make next? Tap one.')
  else voice.sayOnce(`${SPOKEN_RULE[LEVELS[a].id]}, or ${SPOKEN_RULE[LEVELS[b].id]}? Pick a shape.`.replace(/^./, (c) => c.toUpperCase()))
}

/** The child chose the next constellation (and its way of counting): off to the next planet to build it. */
function chooseNext(def, lvl) {
  if (game.phase !== 'choose') return
  audio.unlock()
  audio.click()
  $('choose').classList.add('hidden')
  // The two cards offered two different ways of counting, so the choice was heard
  nextLeg(def, lvl, game.offered)
}

function flyHome() {
  game.phaseTime = 0
  game.phase = 'homeward'
  const planet = world.current()
  if (planet) planet.userData.leaving = 0
  // Home is under a deep, quiet night sky (the world eases toward these colours)
  world.top.set('#060824')
  world.bottom.set('#1b1446')
  world.nebulae.forEach((n, i) => n.material.color.set(i % 2 ? '#3a2a8a' : '#24407a'))
  banner('🏠 Time to fly home!', `${game.stops} constellations made`)
  renderJourney()
}

function nextLeg(def, lvl, picked = false) {
  game.phaseTime = 0
  if (!missionHeld() && lvl !== game.level) {
    game.level = lvl
    game.history = []
    if (!adventure.option.goal) store.set('star-catcher-level', lvl)
  }
  $('sky-name').classList.remove('show')
  sky.pick(def)
  game.phase = 'build'
  world.setStop(game.stops)
  const changed = beginConstellation(game.stops)
  renderRule()
  const next = STOPS[game.stops]
  banner(`Next stop: ${next.emoji} ${next.name}`, level().tag(game.values), changed ? 4200 : 2600)
  // A rule the child just picked at the cards (and heard there) is not said again, unless its line adds a tip
  if (changed && !(picked && !level().tip)) voice.sayOnce(level().say)
  renderJourney()
}

/**
 * After each constellation the numbers follow how the child did, judged by the share of picks
 * (catches and dot-joining taps) that were wrong, so a lucky sweep can't climb and one slip can't
 * stall: at most about one wrong pick in six on this constellation (and across the last two)
 * moves up a level, and a flawless shape moves up two, so a steady 7-year-old meets skip
 * counting by the second or third shape. Two wrong picks in five, across the last two, move back
 * down. The gentle mission matches numbers until its five stars are caught, then climbs gently.
 */
function adapt() {
  game.climbed = false
  if (missionHeld()) return
  game.history.push({ right: game.right, misses: game.misses })
  const recent = game.history.slice(-2)
  const share = (list) => list.reduce((a, h) => a + h.misses, 0) / Math.max(1, list.reduce((a, h) => a + h.misses + h.right, 0))
  const was = game.level
  const flawless = game.misses === 0 && game.right >= 8
  // Once the gentle mission is done its pilot climbs one step at a time
  const up = flawless && !adventure.option.goal ? 2 : 1
  if (share([recent.at(-1)]) <= 0.17 && share(recent) <= 0.2) game.level = Math.min(LEVELS.length - 1, game.level + up)
  else if (share(recent) >= 0.4) game.level = Math.max(0, game.level - 1)
  game.climbed = game.level > was
  if (game.level !== was) game.history = []
  // A younger child's gentle mission never changes where the free flights start
  if (!adventure.option.goal) store.set('star-catcher-level', game.level)
}

/** Numbers the stars of constellation `i` for the current level and puts it in the panel. Returns true when the level changed. */
let levelShown = -1
function beginConstellation(i) {
  Object.assign(game, { misses: 0, right: 0, hints: 0, streak: 0, rowTimer: 1, joinHint: false })
  const L = level()
  game.values = L.values(sky.trip[i].stars.length)
  // Only the trip's first matching constellation is counted aloud star by star
  game.counting = L.id === 'match' && i === 0
  sky.begin(i, $('sky-panel'), game.values)
  sky.labels = L.labels
  // Above matching the shape starts with its first number lit (two for a pattern), so the very
  // first catch is already one more step of the rule, never a copy of a number on show
  sky.prelight(L.labels === 'ask2' ? 2 : L.labels === 'ask' ? 1 : 0)
  const changed = levelShown !== LEVELS.indexOf(L)
  levelShown = LEVELS.indexOf(L)
  return changed
}

/**
 * Home: the night sky with every constellation the child built. The names are hidden at first:
 * the voice asks for each one by its shape ("Find the W."), or, every other time, by how it was
 * counted ("Which one did we count by fives?") when no other shape was counted that way, so the
 * home sky revisits the numbers too. A card shows its name once the child finds it. A wrong card
 * says its own name and the wanted one glows softly once, so every tap teaches something.
 */
// telling: found-lines still being said; lastCard/lastAt: the found card tapped last, and when
const finale = { cells: [], order: [], at: 0, riddles: [], glow: 0, telling: 0, lastCard: -1, lastAt: 0 }
function showFinale() {
  game.state = 'finale'
  clearPlayfield()
  // Nothing drifts behind the riddle and the cards at home
  world.calm(true)
  const made = sky.done
  finale.order = made.map((_, i) => i).sort(() => Math.random() - 0.5)
  finale.at = 0
  finale.telling = 0
  finale.lastCard = -1
  finale.riddles = made.map(({ def }) => def.riddle)
  finale.order.forEach((i, k) => {
    const id = game.made[i]
    const ask = LEVELS.find((L) => L.id === id)?.ask
    if (k % 2 === 1 && ask && game.made.filter((m) => m === id).length === 1) finale.riddles[i] = ask
  })
  finale.cells = made.map(({ def }, i) => {
    const cell = document.createElement('button')
    cell.className = 'finale-cell'
    cell.setAttribute('aria-label', 'A constellation you made')
    cell.addEventListener('click', () => tapSky(i))
    return cell
  })
  $('finale-sky').replaceChildren(...finale.cells)
  const screen = $('finale')
  screen.classList.remove('hidden')
  requestAnimationFrame(() => screen.classList.remove('fade'))
  showRiddle()
  sky.showFinale(finale.cells)
  audio.fanfare()
  voice.say(`Welcome home! Here is your night sky. ${finale.riddles[finale.order[0]]}`)
}

function showRiddle() {
  const i = finale.order[finale.at]
  $('finale-count').textContent = i == null ? '✨ You found them all' : `🔎 ${finale.riddles[i]}`
  // A longer or shorter riddle moves the cards a little: the drawn constellations follow them
  sky.layout()
}

function tapSky(i) {
  audio.unlock()
  const { def } = sky.done[i]
  const cell = finale.cells[i]
  const want = finale.order[finale.at]
  if (i === want) {
    sky.highlight(i)
    audio.light(def.stars.length)
    cell.textContent = def.name
    cell.classList.add('found')
    cell.setAttribute('aria-label', `${def.name}: ${def.fact}`)
    finale.at++
    showRiddle()
    const next = finale.order[finale.at]
    const then = next == null ? 'You know your whole night sky.' : finale.riddles[next]
    // One line per find: the fact, then the next riddle. A quick child who finds the next one while
    // the last line is still being said hears it finish, then just the name and the next riddle.
    const busy = finale.telling > 0
    const told = { onend: () => (finale.telling = Math.max(0, finale.telling - 1)) }
    finale.telling++
    if (busy) voice.say(`${def.name}! ${then}`, told)
    else voice.sayNow(`Yes! ${def.fact} ${then}`, told)
    return
  }
  audio.light(3)
  if (want == null || cell.classList.contains('found')) {
    sky.highlight(i)
    // While a find is still being told (its next riddle too), a found card only glows: it never
    // cuts that line. The same card tapped again within a moment says nothing new.
    const now = performance.now()
    const repeat = finale.lastCard === i && now - finale.lastAt < 2500
    finale.lastCard = i
    finale.lastAt = now
    if ((finale.telling > 0 && voice.speaking) || repeat) return
    // A found card tells its fact once more, then only its name
    const again = cell.dataset.told
    cell.dataset.told = '1'
    return voice.sayNow(again ? `That's ${def.spoken}.` : def.fact)
  }
  finale.telling = 0 // the line below cuts in, so no find is still being told
  // The wanted card glows once, softly: the next tap can find it
  sky.highlight(want)
  const wanted = finale.cells[want]
  for (const c of finale.cells) c.classList.toggle('wanted', c === wanted)
  clearTimeout(finale.glow)
  finale.glow = setTimeout(() => wanted.classList.remove('wanted'), 1600)
  voice.sayNow(`That one is ${def.spoken}. ${finale.riddles[want]}`)
}

// --- HUD ----------------------------------------------------------------------------

let bannerTimer = 0
function banner(text, small, ms = 2600) {
  const el = $('banner')
  el.innerHTML = ''
  el.append(text)
  if (small) {
    const s = document.createElement('small')
    s.textContent = small
    el.append(s)
  }
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

/** Progress toward the current planet: the share of its constellation already lit. */
function legProgress() {
  return game.phase === 'build' ? (sky.total ? sky.lit / sky.total : 0) : 1
}

/** Home, the five planets, and home again: the trip has an end. */
let journeyKey = ''
let journeyFills = [] // { el, fill } for each track's bar
let journeyShip = null
function renderJourney() {
  const at = game.stops
  const homeward = game.phase === 'homeward'
  // Joining the dots happens just before the planet is reached (it counts as the end of the track)
  const building = game.phase === 'build' || game.phase === 'join' || game.phase === 'joined'
  // The rocket rides the track being flown, or rests at the planet it just reached
  const ship = building ? at : homeward ? STOPS.length : at - 1
  const fills = STOPS.map((s, i) => (i < at ? 1 : i === at && building ? legProgress() : 0))
  // Rounded, so the bar is only touched when it visibly moves
  fills.push(homeward ? Math.round(Math.min(game.phaseTime / HOME_TIME, 1) * 500) / 500 : 0)
  // The stops and tracks are rebuilt only when the trip moves on; every frame just moves the bars
  const key = `${at}:${homeward}:${ship}`
  if (key !== journeyKey) {
    journeyKey = key
    const track = (i) => (i === ship ? '<span class="track on"><b></b><span class="ship">🚀</span></span>' : '<span class="track"><b></b></span>')
    const parts = ['<span class="stop done">🏠</span>']
    STOPS.forEach((s, i) => {
      parts.push(track(i))
      parts.push(`<span class="stop ${i < at ? 'done' : i === at && !homeward ? 'next' : ''}">${s.emoji}</span>`)
    })
    parts.push(track(STOPS.length))
    parts.push(`<span class="stop ${homeward ? 'next' : ''}">🏠</span>`)
    const journey = $('journey')
    journey.innerHTML = parts.join('')
    journeyFills = [...journey.querySelectorAll('.track b')].map((el) => ({ el, fill: -1 }))
    journeyShip = journey.querySelector('.ship')
  }
  fills.forEach((fill, i) => {
    const bar = journeyFills[i]
    if (bar.fill === fill) return
    bar.fill = fill
    bar.el.style.transform = `scaleX(${fill})`
    if (i === ship && journeyShip) {
      journeyShip.style.left = `${fill * 100}%`
      journeyShip.style.transform = `translateX(-${fill * 100}%)`
    }
  })
}

function renderSound() {
  $('sound').textContent = audio.muted ? '🔇' : '🔊'
  // The music switch only changes the music; the bells, voice and sound effects stay
  for (const id of ['music', 'finale-music']) {
    const el = $(id)
    el.classList.toggle('off', !audio.musicOn)
    el.setAttribute('aria-pressed', String(audio.musicOn))
  }
}

function toggleMusic() {
  audio.unlock()
  audio.setMusic(!audio.musicOn)
  store.set('star-catcher-music', audio.musicOn)
  renderSound()
}

function toggleSound() {
  audio.unlock()
  audio.setMuted(!audio.muted)
  store.set('star-catcher-muted', audio.muted)
  voice.setMuted(audio.muted)
  renderSound()
}

// --- Input --------------------------------------------------------------------------

const keys = new Set()
const raycaster = new THREE.Raycaster()
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const ndc = new THREE.Vector2()
let pointerDown = false

function aim(e) {
  if (!rocket) return
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (!raycaster.ray.intersectPlane(plane, tmp)) return
  game.idle = 0
  // Fingers cover what they touch, so the rocket flies a little above the finger
  const lift = e.pointerType === 'mouse' ? 0 : 1.4
  rocket.target.set(tmp.x, tmp.y + lift)
}

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true
  audio.unlock()
  if (game.state !== 'play') return
  poke(e)
  aim(e)
})

/** Tapping Kitty gets a happy meow; tapping the planet ahead makes it giggle and wobble. */
function poke(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (!raycaster.ray.intersectPlane(plane, tmp)) return
  const p = rocket.root.position
  if (Math.hypot(tmp.x - p.x, tmp.y - p.y - 0.3) < 1.3) {
    if (game.joy < 0.2) audio.meow()
    game.joy = 0.6
    return
  }
  const planet = world.current()
  if (planet && raycaster.intersectObject(planet, true).length) {
    if (world.boop(planet)) audio.boop()
  }
}
addEventListener('pointermove', (e) => {
  if (game.state === 'play' && (pointerDown || e.pointerType === 'mouse')) aim(e)
})
addEventListener('pointerup', () => (pointerDown = false))
addEventListener('pointercancel', () => (pointerDown = false))
addEventListener('keydown', (e) => {
  audio.unlock()
  if (e.key === 'm' || e.key === 'M') return toggleSound()
  if (e.key === 'n' || e.key === 'N') return toggleMusic()
  if (e.key === 'Escape') return goHome()
  if (game.state === 'finale' && e.key === 'Enter') return flyAgain()
  if (game.state === 'title' && (e.key === 'Enter' || e.key === ' ')) return start()
  if (game.state === 'play' && game.phase === 'join' && !sky.picking && joinKey(e)) return
  keys.add(e.key)
  game.idle = 0
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
})
addEventListener('keyup', (e) => keys.delete(e.key))
addEventListener('blur', () => keys.clear())
// No pinch-zoom, double-tap zoom or long-press menus
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('gesturestart', (e) => e.preventDefault())
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend()
  else if (audio.ctx) audio.unlock()
})
$('sound').addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  toggleSound()
})
for (const id of ['music', 'finale-music']) $(id).addEventListener('click', toggleMusic)

function start() {
  if (game.state !== 'title') return
  clearMissionTimers()
  adventure.begin()
  audio.unlock()
  audio.click()
  game.state = 'play'
  world.calm(false)
  $('start').classList.add('fade')
  missionTimers.push(setTimeout(() => $('start').classList.add('hidden'), 400))
  $('hud').classList.remove('hidden')
  rocket.target.set(0, view.yMin + 1.2)
  game.spawnTimer = 0.8
  game.idle = 0
  game.phase = 'build'
  game.phaseTime = 0
  // A new trip starts one level below the last one reached: a warm-up, and kind to a younger sibling
  // The gentle mission starts at matching whatever was reached before (a younger child plays it)
  game.level = adventure.option.goal ? 0 : clamp((store.get('star-catcher-level', 0) | 0) - 1, 0, LEVELS.length - 1)
  game.history = []
  game.made = []
  patterns = 0
  game.joinTold = false
  levelShown = -1
  voice.newRound()
  resize() // the HUD is on screen now, so the band that things fade in below can be measured
  beginConstellation(0)
  renderRule()
  banner(`🚀 Blast off!`, level().tag(game.values))
  // The gentle mission's goal is said once: when the picker has just said it, the start line
  // waits for it to finish and adds only the first number
  const goal = adventure.option.goal
  if (goal && performance.now() - goalSaidAt < 20000) voice.say(`Find number ${game.values[0]}!`)
  else voice.sayNow(goal ? `${goal}! Find number ${game.values[0]}!` : level().say)
  renderJourney()
}
$('go').addEventListener('click', start)

/** Back to the title, where the child can choose another mission or just fly again. */
function goHome() {
  if (game.state !== 'play' && game.state !== 'finale') return
  resetTrip()
  const screen = $('start')
  screen.classList.remove('hidden')
  requestAnimationFrame(() => screen.classList.remove('fade'))
}
$('home').addEventListener('click', goHome)
$('join').addEventListener('pointerdown', joinTap)
$('finale-home').addEventListener('click', goHome)

/** From the night sky at home straight into a new trip. */
function flyAgain() {
  if (game.state !== 'finale') return
  resetTrip()
  start()
}
$('again').addEventListener('click', flyAgain)

function hideUfo() {
  ufo.active = false
  ufo.obj.visible = false
  ufo.timerLeft = 12
}

/** Clears the play: falling things, power-ups, the UFO, the nudge, the banner and the HUD. */
function clearPlayfield() {
  for (let i = items.length - 1; i >= 0; i--) recycle(i)
  Object.assign(game, { dizzy: 0, roll: 0 })
  hideUfo()
  nudgeEl.classList.remove('show')
  $('banner').classList.remove('show')
  $('hud').classList.add('hidden')
}

/** Everything back to the start of a trip: items, stops, power-ups, the UFO, speech and the sky. */
function resetTrip() {
  audio.click()
  clearMissionTimers()
  voice.hush()
  game.state = 'title'
  clearPlayfield()
  Object.assign(game, { phase: 'build', phaseTime: 0, stops: 0, idle: 0 })
  nudgeShown = false
  nudgeUsed = false
  world.setStop(0)
  // The title is calm: no planets drift behind the words, and the first planet waits low
  world.calm(true, { title: true })
  sky.reset()
  $('choose').classList.add('hidden')
  $('join').classList.add('hidden')
  $('join-pick').classList.add('hidden')
  $('join-cap').classList.remove('hidden')
  $('sky-name').classList.remove('show')
  const finale = $('finale')
  finale.classList.add('hidden', 'fade')
  keys.clear()
  pointerDown = false
}

// --- Layout -------------------------------------------------------------------------

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // Short screens (sideways phones) zoom in so Kitty and the stars stay big enough to see and catch
  view.h = clamp(h / 70, 5.2, FULL_H)
  // Wide screens (desktops, sideways tablets) have width to spare: zoom in a little for chunkier stars and Kitty
  if (w / h > 1.25) view.h = Math.min(view.h, FULL_H * 0.84)
  view.k = view.h / FULL_H
  camera.fov = (Math.atan(view.h / camera.position.z) * 360) / Math.PI
  camera.updateProjectionMatrix()
  view.w = view.h * camera.aspect
  // Keep the rocket clear of notches and rounded corners
  const cs = getComputedStyle($('safe'))
  const px = (2 * view.w) / w
  const inset = (name) => parseFloat(cs[name]) * px || 0
  view.xMin = -view.w + inset('paddingLeft') + 0.8
  view.xMax = view.w - inset('paddingRight') - 0.8
  view.yMin = -view.h + inset('paddingBottom') + 1.5
  view.yMax = Math.min(view.h * 0.2, view.h - 3)
  // Falling things fade in below the constellation panel, journey and mission card, not through them
  const hudBottom = Math.max(...['journey', 'sky-panel', 'adventure-goal'].map((id) => {
    const el = $(id)
    const r = el && !el.hidden ? el.getBoundingClientRect() : null
    return r && r.top < h / 2 ? r.bottom : 0 // a card moved to the bottom on short screens does not count
  })) + 12
  view.hudY = view.h - Math.min(hudBottom, h * 0.3) * px
  const hpx = h * renderer.getPixelRatio()
  particles.setScale(hpx, camera.fov)
  world?.setScale(hpx, camera.fov)
  sky.resize(w, h)
}
addEventListener('resize', resize)

// --- Main loop ----------------------------------------------------------------------

// Muted warm tones: the particles glow additively, so darker colours give a softer trail
const EXHAUST_COLORS = ['#a8862a', '#a5672c', '#8f4f4f', '#a89f6a'].map((c) => new THREE.Color(c))
const exhaust = { vx: 0, vy: 0, spread: 0.35, life: 0.55, size: 0, endSize: 0.05, color: EXHAUST_COLORS[0], drag: 1.5 }
const trail = { vy: -2, spread: 0.4, life: 0.6, size: 0.35, color: new THREE.Color('#ffffff'), drag: 1 }

function updateRocket(dt) {
  const r = rocket
  const playing = game.state === 'play'
  // At a planet the cards are the thing to look at: Kitty waits low, clear of them (to the side on wide screens),
  // but high enough that the whole rocket stays on screen
  const waiting = playing && ['join', 'joined', 'arrive', 'choose'].includes(game.phase)
  if (waiting) {
    // (a little higher on short, sideways screens, where the flame would reach the edge, and a
    // little lower on tall phones, where the nose would meet the join card)
    const lift = innerHeight < 500 ? 0.75 : camera.aspect < 0.6 ? 0 : 0.3
    r.target.set(camera.aspect > 1.2 ? view.xMax - 0.4 : 0, view.yMin + lift + Math.sin(game.time * 1.3) * 0.15)
  } else if (playing) {
    const dx = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0)
    const dy = (keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0)
    r.target.x += dx * 11 * dt
    r.target.y += dy * 9 * dt
  } else {
    // On wide screens Kitty waits beside the title instead of hiding behind the Fly button
    const side = camera.aspect > 1.3 ? view.w * 0.68 : 0
    // At home Kitty rests low in the corner, clear of the night sky cards
    // (high enough that the whole rocket stays on screen). Narrow phones have no free corner, so
    // Kitty waits beside the last card, in the gap the five cards leave on the left.
    const narrow = camera.aspect < 0.6
    if (game.state === 'finale') r.target.set(narrow ? -view.w + 1.3 : view.w - 1.6, (narrow ? -view.h * 0.5 : -view.h + 2.2) + Math.sin(game.time * 1.3) * 0.15)
    else r.target.set(side + Math.sin(game.time * 0.7) * Math.min(side ? 0.8 : 2, view.w * 0.3), -view.h * 0.62 + Math.sin(game.time * 1.3) * 0.3)
  }
  r.target.x = clamp(r.target.x, view.xMin, view.xMax)
  r.target.y = clamp(r.target.y, playing && !waiting ? view.yMin : -view.h, playing ? view.yMax : 3)
  // Springy follow: responsive but smooth; wobbly when dizzy
  const stiff = game.dizzy > 0 ? 18 : 60
  const damping = game.dizzy > 0 ? 6 : 13
  const p = r.root.position
  r.vel.x += ((r.target.x - p.x) * stiff - r.vel.x * damping) * dt
  r.vel.y += ((r.target.y - p.y) * stiff - r.vel.y * damping) * dt
  p.x += r.vel.x * dt
  p.y += r.vel.y * dt
  p.x = clamp(p.x, view.xMin - 0.5, view.xMax + 0.5)

  // Lean into turns and bank to show off the fins
  const lean = clamp(-r.vel.x * 0.045, -0.5, 0.5)
  r.root.rotation.z = damp(r.root.rotation.z, lean, 8, dt)
  let spin = clamp(-r.vel.x * 0.06, -0.8, 0.8)
  // Dizzy is a slow wobble, not a fast spin
  if (game.dizzy > 0 && !reducedMotion) spin += Math.sin((1 - game.dizzy / 1.2) * Math.PI * 2) * 0.6
  if (game.roll > 0) {
    game.roll = Math.max(0, game.roll - dt * 0.9)
    spin += (1 - game.roll) ** 2 * Math.PI * 2
  }
  r.model.rotation.y = spin
  r.model.position.y = Math.sin(game.time * 3.2) * 0.07

  // Flame flickers and grows when climbing
  const climb = clamp(r.vel.y * 0.08, -0.3, 0.6)
  // A soft, slow breathing flame: no fast flicker
  const f = 1 + climb + Math.sin(game.time * 4) * 0.04
  r.flame.scale.set(1 + Math.sin(game.time * 3) * 0.02, f, 1 + Math.sin(game.time * 3) * 0.02)
  r.glow.material.opacity = 0.4 + 0.03 * Math.sin(game.time * 2.5) + climb * 0.1
  r.glow.scale.setScalar(2.4 + climb * 1.2)

  // Kitty pilot: a happy bounce when catching things
  game.joy = Math.max(0, game.joy - dt)
  r.pilot.rotation.z = Math.sin(game.time * 2) * 0.12 + Math.sin(game.joy * 12) * game.joy * 0.3
  r.pilot.position.z = r.pilotZ + game.joy * 0.15

  // Exhaust trail (every frame, so it reuses one options object and pre-parsed colours)
  r.nozzle.getWorldPosition(r.nozzleWorld)
  const n = r.nozzleWorld
  // A thin, slow trail: about 18 puffs a second in flight (it was about 120), 5 at rest at home
  const puffs = Math.random() < dt * (game.state === 'finale' ? 5 : 18) ? 1 : 0
  for (let i = 0; i < puffs; i++) {
    const x = n.x + rand(-0.08, 0.08)
    exhaust.vx = rand(-0.3, 0.3) - r.vel.x * 0.1
    exhaust.vy = -game.cruise * 0.4 - 1
    exhaust.size = rand(0.35, 0.5)
    exhaust.color = EXHAUST_COLORS[(Math.random() * EXHAUST_COLORS.length) | 0]
    particles.emit(x, n.y - 0.35, n.z - 0.1, exhaust)
  }
  if (Math.abs(r.vel.x) > 4 && Math.random() < 0.2) {
    particles.emit(p.x + rand(-0.4, 0.4), p.y + rand(-0.5, 0.5), 0.2, trail)
  }

  rocketCenter.set(p.x, p.y + 0.3, 0)
}

function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const o = it.obj
    it.t += dt
    if (it.bounced) {
      // A bumped rock tumbles away; a wrong-number star just floats softly back up
      if (it.kind === 'rock') it.vy -= 3 * dt
      it.x += it.vx * dt
      o.position.y += it.vy * dt
      o.rotation.z += it.spin * dt
    } else {
      o.position.y += it.vy * dt * (game.state === 'play' && missionHeld() ? adventure.pace : 1)
    }
    o.position.x = it.x + Math.sin(it.t * 1.7) * it.sway

    // Each kind moves in its own gentle way
    const model = o.children[0]
    if (it.kind === 'rock') {
      if (!it.bounced) o.rotation.z = Math.sin(it.t * 0.9) * 0.25
    } else {
      model.rotation.y = Math.sin(it.t * 2.2) * 0.55
      model.rotation.z = Math.sin(it.t * 1.4) * 0.2
    }

    // Things grow in just below the HUD band instead of sliding through the panel and mission card
    const grow = it.bounced && !it.fading ? 1 : clamp((view.hudY - o.position.y) / 0.8 + 0.001, 0, 1)
    // Stars no longer needed (or caught with the wrong number) shrink quietly away
    if (it.reveal > 0) it.reveal -= dt
    else if (it.fading) {
      it.fade = (it.fade ?? 1) - dt * 1.1
      if (it.fade <= 0) {
        recycle(i)
        continue
      }
    }
    const size = grow * (it.fading ? it.fade ?? 1 : 1)
    o.visible = size > 0
    if (!it.bounced || it.fading) o.scale.setScalar(it.k.scale * it.big * size)

    // Catch!
    if (game.state === 'play' && !it.bounced && !it.fading && grow >= 1) {
      const d = Math.hypot(o.position.x - rocketCenter.x, o.position.y - rocketCenter.y)
      if (d < 0.95 + it.k.r * 0.9) {
        if (it.kind === 'rock') {
          if (game.dizzy <= 0) bumpRock(it)
        } else if (catchItem(it)) {
          recycle(i)
          continue
        }
      }
    }
    if (o.position.y < -view.h - 2.5 || Math.abs(o.position.x) > view.w + 4) recycle(i)
  }
}

function updateUfo(dt) {
  if (!ufo.obj) return
  // Slow, soft glow in turn: never a blink
  ufo.lightMats.forEach((m, i) => (m.emissiveIntensity = 0.8 + 0.3 * Math.sin(game.time * 1.2 + i * 2)))
  if (!ufo.active) {
    if (game.state !== 'play' || game.phase !== 'build' || !leg(game.stops).ufo) return
    ufo.timerLeft -= dt
    if (ufo.timerLeft > 0) return
    ufo.active = true
    ufo.dir = Math.random() < 0.5 ? 1 : -1
    ufo.t = 0
        ufo.obj.visible = true
    ufo.obj.position.set(-ufo.dir * (view.w + 3), view.hudY - 1.4, -1)
    audio.whoosh(1.4)
    return
  }
  ufo.t += dt
  const o = ufo.obj
  const speed = Math.max(2.4, (view.w * 2 + 6) / 8)
  o.position.x += ufo.dir * speed * dt
  o.position.y = view.hudY - 1.4 + Math.sin(ufo.t * 1.2) * 0.2
  o.rotation.x = 0.3
  o.rotation.z = -ufo.dir * 0.15 + Math.sin(ufo.t * 3) * 0.05
  o.rotation.y += dt * 0.8
  if (Math.abs(o.position.x) > view.w + 3.5 && ufo.t > 1) {
    ufo.active = false
    o.visible = false
    ufo.timerLeft = rand(20, 30)
  }
}

// A hand swipes under the rocket when it has not been steered for a while: no reading needed
const nudgeEl = $('nudge')
let nudgeShown = false
let nudgeUsed = false // one quiet hint per flight, after a long rest
function updateNudge(dt) {
  game.idle += dt
  if (nudgeShown && game.idle < 1) nudgeUsed = true
  const show = !nudgeUsed && game.idle > 30 && !pointerDown && game.phase === 'build'
  if (show !== nudgeShown) {
    nudgeShown = show
    nudgeEl.classList.toggle('show', show)
  }
  if (!show) return
  tmp.set(rocket.root.position.x, rocket.root.position.y - 1.3, 0).project(camera)
  nudgeEl.style.left = `${clamp((tmp.x * 0.5 + 0.5) * 100, 15, 85)}%`
  nudgeEl.style.top = `min(${(-tmp.y * 0.5 + 0.5) * 100}%, calc(100% - 82px))`
}

const timer = new THREE.Timer()
timer.connect(document)
const fogMix = new THREE.Color()

function frame() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 1 / 20)
  game.time += dt
  if (game.state === 'loading') {
    renderer.clear()
    renderer.render(scene, camera)
    return
  }
  const playing = game.state === 'play'
  const L = leg(game.stops)
  // At home the sky stands still, so the child's constellations are the only thing to look at
  const finale = game.state === 'finale'
  game.cruise = damp(game.cruise, playing ? 3 + L.speed : finale ? 0 : 2.5, finale ? 2 : 1, dt)

  if (playing) {
    game.phaseTime += dt
    // Stars fall only while a constellation is being built: arriving and flying home are calm
    if (game.phase === 'build') {
      // One row of stars at a time: the next comes once the sky is clear of the last choice
      if (!items.some((it) => it.kind === 'star' && !it.bounced && !it.fading)) {
        game.rowTimer -= dt
        if (game.rowTimer <= 0) spawnRow()
      }
      game.spawnTimer -= dt
      if (game.spawnTimer <= 0) {
        spawnRock()
        game.spawnTimer = 4 * rand(0.8, 1.2)
      }
    } else if (game.phase === 'arrive') {
      // Stay at the planet until its name and fact have been spoken. A hush (mute, home) drops
      // the words' onend, so the trip also goes on once nothing is left to say.
      if (game.phaseTime > ARRIVE_HOLD && (game.factSaid || !voice.speaking)) afterArrival()
    } else if (game.phase === 'homeward') {
      renderJourney()
      if (game.phaseTime > HOME_TIME) showFinale()
    }
    game.dizzy = Math.max(0, game.dizzy - dt)
    updateNudge(dt)
  }

  updateRocket(dt)
  updateItems(dt)
  updateUfo(dt)
  // The planets step back while numbers fall, while the dots are joined and while the cards are
  // read, and come forward at arrival
  world.quiet = playing && ['build', 'join', 'joined', 'choose'].includes(game.phase)
  world.update(finale ? dt * 0.2 : dt, game.cruise, playing ? legProgress() : 0.15, view)
  particles.update(dt)
  audio.updateEngine(playing, Math.hypot(rocket.vel.x, rocket.vel.y))
  audio.updateMusic()

  // Fog follows the sky so distant things melt into it
  const skyColors = world.skyMat.uniforms
  fogMix.copy(skyColors.uTop.value).lerp(skyColors.uBottom.value, 0.55)
  scene.fog.color.copy(fogMix)

  // A gentle camera drift adds depth
  camera.position.x = damp(camera.position.x, rocket.root.position.x * 0.08, 3, dt)
  camera.position.y = damp(camera.position.y, rocket.root.position.y * 0.04, 3, dt)
  camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5, 0)

  renderer.clear()
  renderer.render(scene, camera)
  sky.update(dt)
  sky.render(renderer)
}

resize()
renderer.setAnimationLoop(frame)
renderSound()

load()
  .then(() => {
    resize()
    game.state = 'title'
    world.calm(true, { title: true })
    const go = $('go')
    go.disabled = false
    go.textContent = '🚀 Fly!'
  })
  .catch((err) => {
    console.error(err)
    $('go').textContent = 'Oops! Try again 🔄'
    $('go').disabled = false
    $('go').onclick = () => location.reload()
  })
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game, sky, items, camera, neededValue, level, LEVELS, finale, tapSky, catchItem, chooseNext, joinTap, joinAt, pickHidden, get rocket() { return rocket }, get world() { return world } }
