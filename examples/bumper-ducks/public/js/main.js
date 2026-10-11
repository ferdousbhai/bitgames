import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { Sim, newStats, STAGE_PAUSE, TRICKLE_AFTER } from './sim.js'
import { createVoice, listWords, COUNT_ALOUD } from './speech.js'
import { DuckView, ItemView, ObstacleView, Rain, skyTexture, cloneTinted } from './view.js'
import { makeWater } from './water.js'
import {
  R, PLAY_TIERS, makePlayGoal, validPlayGoal, MAX_PLAYERS, DUCKS, DUCK_IDS, ARENAS, ARENA_IDS, POWERS, PLAYER_EMOJI,
  validDuck, validArena, escapeHtml, clamp,
  BUBBLE_COLOURS, LEVELS, HIDE_LEVEL, TEN, makeTrip, validTrip, goalValue, placeJar, placeLayout, splitOf, validMode, duckName,
} from './config.js'

const $ = (id) => document.getElementById(id)
const params = new URLSearchParams(location.search)
const DEBUG = params.has('debug')
const STEP = 1 / 60
const READY_TIMEOUT = 5000
const NAP_AFTER = 3 // seconds with no child paddling before the robots float and wait
const STORE = 'bumper-ducks-'

function load(key) {
  try {
    return localStorage.getItem(STORE + key)
  } catch {
    return null
  }
}
function save(key, value) {
  try {
    localStorage.setItem(STORE + key, value)
  } catch {}
}

// --- Renderer, scene, camera ------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.0
const scene = new THREE.Scene()
const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environment = envMap
scene.environmentIntensity = 0.55
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300)
const hemi = new THREE.HemisphereLight('#eaf6ff', '#ffe2b8', 1.1)
scene.add(hemi)
const sun = new THREE.DirectionalLight('#fff6e6', 2.2)
sun.position.set(-8, 20, 10)
scene.add(sun)

const water = makeWater(R)
scene.add(water.mesh)
const labels = $('labels')
const effects = new Effects(scene, camera, labels)
const audio = new Audio()
// One voice for the game: words wait their turn instead of cutting each other off.
const voice = createVoice({ muted: audio.muted, rate: 0.85, pitch: 1 })

/** Frame the whole pond: steeper from above on an upright screen, lower and wider when sideways. */
const camTarget = new THREE.Vector3()
const camBase = new THREE.Vector3()
let hudBottom = 0 // Pond helpers: the jar's lower edge, so the pond's back rim sits below it, not under it
function frameCamera() {
  const aspect = camera.aspect
  const pitch = THREE.MathUtils.degToRad(aspect < 0.8 ? 64 : aspect < 1.25 ? 58 : 50)
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch))
  const pts = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.2), 0, Math.sin(a) * (R + 0.2)))
  }
  pts.push(new THREE.Vector3(0, 1.5, -R)) // ducks at the back stay in view
  // Room at the top for the timer and scores (taller on narrow phones, where they stack under the buttons).
  const sideHud = innerHeight <= 500 && innerWidth > innerHeight // short and sideways: the scores sit on the left
  const top = clamp(1 - (2 * Math.max(sideHud ? 6 : innerWidth < 421 ? 150 : 88, hudBottom)) / innerHeight, 0.4, 0.97)
  camTarget.set(0, 0, aspect < 0.8 ? 0.4 : 0.8)
  let lo = 10
  let hi = 120
  const v = new THREE.Vector3()
  for (let k = 0; k < 24; k++) {
    const dist = (lo + hi) / 2
    camera.position.copy(camTarget).addScaledVector(dir, dist)
    camera.lookAt(camTarget)
    camera.updateMatrixWorld()
    const fits = pts.every((p) => {
      v.copy(p).project(camera)
      return Math.abs(v.x) < 0.98 && v.y < top && v.y > -0.99
    })
    if (fits) hi = dist
    else lo = dist
  }
  camera.position.copy(camTarget).addScaledVector(dir, hi)
  camera.lookAt(camTarget)
  // An upright screen is filled edge to edge before top to bottom: centre the pond in the room left
  // between the top bar (or the jar) and the bottom, instead of leaving the floor showing below it.
  const halfZ = (hi * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.sin(pitch)
  for (let k = 0; k < 6; k++) {
    camera.updateMatrixWorld()
    let yMin = Infinity
    let yMax = -Infinity
    for (const p of pts) {
      v.copy(p).project(camera)
      yMin = Math.min(yMin, v.y)
      yMax = Math.max(yMax, v.y)
    }
    const off = (top - 0.99) / 2 - (yMin + yMax) / 2
    if (Math.abs(off) < 0.004) break
    camTarget.z += off * halfZ
    camera.position.copy(camTarget).addScaledVector(dir, hi)
    camera.lookAt(camTarget)
  }
  camBase.copy(camera.position)
}

/** Measures the jar (when it shows) so the camera keeps the pond clear of it. */
function measureHud() {
  const on = document.body.classList.contains('calm-round') && !$('hud').classList.contains('hidden')
  hudBottom = on ? $('jar').getBoundingClientRect().bottom + 24 : 0
}

function resize() {
  const w = innerWidth
  const h = innerHeight
  measureHud()
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  frameCamera()
  effects.setScale((h * renderer.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
}
addEventListener('resize', resize)
resize()

// --- Game state -------------------------------------------------------------------------

const game = {
  state: 'loading', // loading | menu | waiting | syncing | countdown | play | ending | results
  room: null,
  hostId: null,
  players: new Map(), // id -> { id, emoji, duck }
  myDuck: validDuck(load('duck')) ? load('duck') : DUCK_IDS[Math.floor(Math.random() * DUCK_IDS.length)],
  arena: validArena(load('arena')) ? load('arena') : 'bath',
  // Pond helpers (calm, untimed, together) is the default; Bumper play is the lively round (no clock: the team makes five tens).
  mode: validMode(load('mode')) ? load('mode') : 'calm',
  // The Pond helpers trip waiting on the menu, made fresh at the remembered level (see makeTrip), and its first goal.
  level: clamp(Math.floor(Number(load('level'))) || 0, 0, LEVELS - 1),
  trip: null,
  goal: null,
  models: null,
  thumbs: {},
  assetsReady: false,
  queue: [],
  setup: null,
  sim: null,
  views: new Map(),
  items: new Map(),
  obstacles: [],
  scenery: null,
  rain: null,
  bots: new Map(),
  inputs: new Map(),
  ready: new Set(),
  timers: new Set(),
  results: null,
  lastSend: 0,
  lastSync: 0,
  lastInput: 0,
  sentInput: '',
  run: 0,
  lastBubble: -9,
  tensSaid: 0, // bumper play: the team's tens already said aloud this round
  hinted: false,
  roundsPlayed: 0,
  me: null,
  // Pond helpers: how the children are doing this round, for the robots' help and the next level.
  kidMiss: 0, // bubbles in a row that didn't fit, since the children's last one that did
  lastKidCatch: 0, // sim time of the children's last bubble into the jar
  spokenGoal: '', // the goal the menu last said aloud, so GO doesn't say it again
  stuckRun: 0, // the newest goal's stuck-bubble line (older ones stop trying)
  playLines: [], // bumper play: lines waiting their turn (one at a time, with a breath between)
  playEndAt: 0,
}
function newTrip(level) {
  game.level = level
  game.trip = makeTrip(level)
  game.goal = game.trip[0]
  save('level', String(level))
}
newTrip(game.level)
/**
 * Bumper play's goal grows with the child: five tens, seven tens, then a number with ones (47). It starts
 * from the Together level (a child already making 30s and 40s there starts at 70) and then follows how
 * the child chose rafts (see adaptPlay).
 */
function newPlayGoal(tier) {
  game.playTier = clamp(tier, 0, PLAY_TIERS - 1)
  game.playGoal = makePlayGoal(game.playTier)
  save('play-tier', String(game.playTier))
}
{
  const stored = load('play-tier')
  newPlayGoal(stored == null ? (game.level >= 4 ? 1 : 0) : Math.floor(Number(stored)) || 0)
}

// A bubble's 'got' event can arrive more than once, so each one is counted once per round.
const collectedBubbles = new Set()
const isBotDuck = (id) => !!game.setup?.entries.find((e) => e.id === id)?.bot

const colourOf = (c) => BUBBLE_COLOURS[c]?.hex ?? '#ffffff'
const colourName = (c) => BUBBLE_COLOURS[c]?.name ?? ''
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const raftTold = () => load('raft') === '1'
/**
 * A Pond helpers goal in words: said aloud on the menu and when the round starts. The first time rafts
 * float by, one short line says what they are (`explain`). From level 5 only the number is said: how many
 * tens and ones is the child's to work out.
 */
const rowWords = (g) => listWords.format(g.rows.map((c) => `5 ${colourName(c)}`))
function goalWords(g, { explain = false } = {}) {
  if (g.kind === 'tens' && g.rows) return `Let's fill one ten: ${rowWords(g)}!`
  if (g.kind === 'tens') return g.n === 1 ? "Let's fill one ten together!" : `Let's fill ${g.n} tens together!`
  if (g.kind === 'colour') return `Let's find ${g.n} ${colourName(g.c)} bubbles!`
  if (g.kind === 'bond' && g.free) return `Let's make ${g.n} your own way! Pick two colours.`
  if (g.kind === 'bond') return `Let's make ${goalValue(g)}: ${listWords.format(g.parts.map(([c, n]) => `${n} ${colourName(c)}`))}!`
  const raft = explain ? ' Each raft is ten bubbles.' : ''
  if (g.level >= HIDE_LEVEL) return `Let's make ${goalValue(g)}! Tens first.${raft}`
  const ones = g.ones ? `, then ${plural(g.ones, 'one')}` : ''
  return `Let's make ${goalValue(g)}: ${plural(g.tens, 'ten')}${ones}!${raft}`
}
/** The words for a trip's next goal, which build on the one just made. */
function stageWords(g, prev) {
  if (g.kind === 'colour') return g.more ? `Now one more ${colourName(g.c)} than ${colourName(prev.c)}!` : `Now ${g.n} ${colourName(g.c)}!`
  // The next ways are the children's own: the voice names the number, never the parts.
  if (g.kind === 'bond') return g.free ? `Another way to make ${g.n}! You pick two colours.` : `Another way to make ${goalValue(g)}: ${listWords.format(g.parts.map(([c, n]) => `${n} ${colourName(c)}`))}!`
  if (g.kind !== 'place') return goalWords(g)
  const v = goalValue(g)
  if (g.level >= HIDE_LEVEL) return `Now make ${v}!`
  const more = v - goalValue(prev)
  return `Now ${more} more. Make ${v}!`
}
/** What a finished goal made: said when a trip's first goal is full, and on the team's results. */
function madeWords(g) {
  const v = goalValue(g)
  if (g.kind === 'bond') return g.parts ? `${listWords.format(g.parts.map(([c, n]) => `${n} ${colourName(c)}`))} make ${v}!` : `${v}!`
  if (g.kind === 'place') return `${listWords.format([plural(g.tens, 'ten'), ...(g.ones ? [plural(g.ones, 'one')] : [])])} make ${v}!`
  if (g.kind === 'colour') return `${v} ${colourName(g.c)}!`
  if (g.rows) return `${rowWords(g)} make ten!`
  return g.n === 1 ? 'Ten bubbles make one ten!' : `${g.n} tens make ${v}!`
}
const goalKey = (g) => JSON.stringify(g)
const STUCK_ON = { mama: 'on Mama Duck', lily: 'on a lily pad', boat: 'in a paper boat' }
const STUCK_SAY_WITHIN = 8 // seconds after its goal line: the stuck-bubble line is said by then, or not at all

/**
 * Says the goal once the round starts, for children who can't read it yet (unless the menu just said it).
 * The raft line counts as told only once it is said for a round that is really played.
 */
function sayGoal() {
  const sim = game.sim
  game.goalSaid = true
  if (sim?.calm) {
    const g = sim.goal
    const explain = g.kind === 'place' && !raftTold()
    // The stuck bubble's line follows the goal after a short breath, before the first catch, so it never
    // has to wait for a count (see sayStuck).
    const then = () => later(() => sim === game.sim && sayStuck({ first: true }), 400)
    if (goalKey(g) !== game.spokenGoal || game.spokenExplained !== explain) {
      if (!voice.sayOnce(goalWords(g, { explain }), { onend: then })) then()
    } else then()
    if (explain) save('raft', '1')
    game.spokenGoal = ''
    hushFor(4)
    return
  }
  // Bumper play: the menu said the goal (50 together); a new goal on Again is said here. Then what a raft is worth, once.
  const goal = sim?.playGoal
  // (What a raft is worth is said for the first two rounds; after that the rafts and the tally show it.)
  const explain = (Number(load('raft-play')) || 0) < 2
  if (explain) save('raft-play', String((Number(load('raft-play')) || 0) + 1))
  const fresh = goal && goal !== game.spokenPlay
  if (fresh || explain) playSay(fresh ? `Let's make ${goal} together!${explain ? ' Each raft is ten bubbles.' : ''}` : 'Each raft is ten bubbles!')
  game.spokenPlay = null
}

/**
 * Bumper play's voice: one line at a time with a breath (2 s) between, so two tens caught together, or a
 * split that ends the round, never pile up. A newer line with the same `key` replaces one still waiting,
 * and `text` may be a function, read when it is said (so a number is never stale; null drops the line).
 */
function playSay(text, key = null, { first = false } = {}) {
  if (key) game.playLines = game.playLines.filter((l) => l.key !== key)
  game.playLines[first ? 'unshift' : 'push']({ text, key })
}
/**
 * Bumper play: one or two left with a bubble on the water, so the goal is about to be made. There is
 * nothing left to decide, and a hint said now would only race the ending.
 */
function lastCatchSoon(sim) {
  if (sim.left > 2) return false
  for (const it of sim.items.values()) if (it.k === 'bubble' && it.stuck == null) return true
  return false
}
function playVoice() {
  if (game.state !== 'play' || !game.playLines.length || voice.speaking || performance.now() - game.playEndAt < 2000) return
  const { text } = game.playLines.shift()
  const words = typeof text === 'function' ? text() : text
  if (!words) return
  game.playEndAt = Infinity
  if (!voice.sayOnce(words, { onend: () => (game.playEndAt = performance.now()) })) game.playEndAt = performance.now() - 2000
}

/**
 * One instruction at a time: after a goal or stage line the voice rests for a few seconds, so the child
 * has room to think. Nope lines, the stuck-bubble line and the crossing hints wait for (or skip) it.
 */
function hushFor(seconds) {
  game.quietUntil = (game.sim?.time ?? 0) + seconds
}
/**
 * Also resting while the jar is counting: a one-off line never falls between two counted numbers (counting
 * aloud leaves a long gap: a line comes mid-count only once the counting has paused for a good while).
 */
const countingAloud = () => game.sim?.goal?.kind === 'tens' || (game.countOn && ['colour', 'bond'].includes(game.sim?.goal?.kind) && !game.sim.goal.free)
const midCount = () => countingAloud() && jar.shown > 0 && jar.shown < game.sim.target
const resting = () =>
  !game.sim || game.sim.time < (game.quietUntil ?? 0) || voice.speaking || jar.flying > 0 ||
  performance.now() - (jar.landedAt ?? 0) < (midCount() ? 8000 : 2200) || catchSoon()
/**
 * While a count is said aloud, a child's duck close to a bubble that fits is about to catch it: a line
 * started now would fall between two counted numbers ("1 yellow … We need … 2 yellow"), so it waits.
 */
function catchSoon() {
  const sim = game.sim
  if (!sim?.calm || !countingAloud()) return false
  for (const d of sim.ducks) {
    if (d.bot) continue
    for (const it of sim.items.values()) if (it.stuck == null && Math.hypot(it.x - d.x, it.z - d.z) < 4 && sim.counts(it)) return true
  }
  return false
}

/**
 * Crossing a ten with the single bubbles used up: once, a question ("what can a ten become?"), so the
 * child thinks of breaking a raft. Only if they still haven't, a while later, the how ("dash into a raft").
 */
function scarceTalk() {
  const sim = game.sim
  if (game.state !== 'play' || !sim?.calm || !sim.goal?.regroup) return
  // (Dry time counts from when this step first ran out of ones: a trickle bubble caught along the way
  // doesn't start it again, so the later reminders still come for a child who hasn't thought of a raft.)
  if (!sim.dryOnes()) return
  game.dryAt ??= sim.time
  // (Waited out until single bubbles trickled in: see the adapting in endRound.)
  if (sim.dryT > TRICKLE_AFTER) game.tripWaited = true
  if (resting()) return
  const dry = sim.time - game.dryAt
  if (dry > 1.5 && voice.sayOnce('Not enough ones. What can a ten become?')) hushFor(4)
  else if (dry > 14 && voice.sayOnce('Dash into a raft to break it into ten ones!')) hushFor(4)
  // (Once a step, and never just after a regroup line: "50! Ten ones make one ten!" is a different idea.)
  else if (dry > 45 && game.reminded !== sim.stage && performance.now() - (game.regroupAt ?? 0) > 8000) {
    game.reminded = sim.stage
    voice.say('A ten can become ten ones!')
    hushFor(4)
  }
}

/**
 * The first few rounds, one line points out the stuck bubble (a bump frees it), or in the pond the frogs'
 * order; after that the picture says it. It comes right after the goal (`first`: before any catch, so no
 * count is under way), and otherwise in the next quiet moment, trying again until the bubble is free.
 * Only the newest goal's line keeps trying.
 */
function sayStuck({ first = false, run = ++game.stuckRun, from = game.sim?.time ?? 0 } = {}) {
  const sim = game.sim
  if (run !== game.stuckRun || game.state !== 'play' || !sim?.calm) return
  // It belongs with the goal it follows: if it can't be said within a few seconds (a count runs on, or the
  // stuck colour isn't wanted yet), it is dropped and the picture says it (a bump, or it floats free).
  if (sim.time - from > STUCK_SAY_WITHIN) return
  const frogs = !!sim.frogs
  const told = Number(load(frogs ? 'frogs' : 'stuck')) || 0
  if (told >= 3) return
  const stuck = [...sim.items.values()].filter((it) => it.stuck != null)
  if (!stuck.length) return // freed already: the bump was found
  const again = () => later(() => sim === game.sim && sayStuck({ run, from }), 1500)
  // It waits for the voice, for the rest after a goal line (not when it follows the goal itself), and,
  // only while the jar counts aloud, for a pause in the count (5 s with no bubble landing or about to be
  // caught). Without counting, catches never hold it back, so a busy catcher still hears it.
  const counting = midCount() && (jar.flying > 0 || performance.now() - (jar.landedAt ?? 0) < 5000 || catchSoon())
  const busy = voice.speaking || (!first && sim.time < (game.quietUntil ?? 0)) || counting
  if (busy || sim.between != null) return again()
  for (const it of stuck) {
    // (A stuck bubble the jar can't take yet, such as a single bubble while the tens come first, waits.)
    if (!sim.counts(it)) continue
    if (frogs) {
      // Frog order: the frogs hold the bubble until they are bumped from the smallest number to the biggest.
      if (voice.sayOnce('The frogs are holding a bubble. Bump them in order, smallest number first!')) {
        save('frogs', String(told + 1))
        hushFor(4)
      }
      return
    }
    const where = STUCK_ON[sim.obstacles[it.stuck]?.kind] ?? 'over there'
    if (voice.sayOnce(`One is stuck ${where}. Bump it free!`)) {
      save('stuck', String(told + 1))
      hushFor(3)
    }
    return
  }
  again()
}

const isHost = () => game.room && game.hostId === game.room.selfId
const roundId = () => game.setup?.seed ?? 0

function later(fn, ms) {
  const id = setTimeout(() => {
    game.timers.delete(id)
    fn()
  }, ms)
  game.timers.add(id)
  return id
}
/** Every way out of a round or lobby (🏠, Escape, Change, Again, the host's menu) runs this: words stop and no timer fires afterwards. */
function clearTimers() {
  voice.hush()
  for (const id of game.timers) clearTimeout(id)
  game.timers.clear()
}

// --- Assets -----------------------------------------------------------------------------

const loader = new GLTFLoader()
async function loadModels() {
  const files = ['ducks', 'items', 'arenas']
  let done = 0
  const gltfs = await Promise.all(
    files.map((f) =>
      loader.loadAsync(`./models/${f}.glb`).then((g) => {
        $('loading-text').textContent = `Filling the bath… ${++done}/${files.length}`
        return g
      }),
    ),
  )
  const models = {}
  for (const g of gltfs) for (const child of [...g.scene.children]) models[child.name] = child
  // Toy-like finish: soft reflections, nothing too shiny.
  for (const m of Object.values(models))
    m.traverse((o) => {
      if (!o.isMesh) return
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mat.envMapIntensity = 0.6
    })
  game.models = models
}

/** Pictures of each duck for the menu, drawn once with a little camera of their own. */
function renderThumbs() {
  const size = 192
  const c = document.createElement('canvas')
  c.width = c.height = size
  let r
  try {
    r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true })
  } catch {
    return
  }
  r.toneMapping = THREE.NeutralToneMapping
  const s = new THREE.Scene()
  s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture
  s.environmentIntensity = 0.6
  s.add(new THREE.HemisphereLight('#ffffff', '#ffe2b8', 1.2))
  const l = new THREE.DirectionalLight('#ffffff', 2.2)
  l.position.set(-3, 6, 6)
  s.add(l)
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  cam.position.set(2.6, 3.0, 5.0)
  cam.lookAt(0, 0.75, 0)
  for (const id of DUCK_IDS) {
    const v = new DuckView(game.models, { duck: id, emoji: '' })
    v.tag.visible = false
    v.shadow.visible = false
    v.spinner.rotation.y = 0.5
    s.add(v.root)
    r.render(s, cam)
    game.thumbs[id] = c.toDataURL('image/png')
    s.remove(v.root)
  }
  r.dispose()
  r.forceContextLoss?.()
}

const retries = []
function withRetry(fn) {
  return fn().catch((err) => {
    console.warn('Loading failed:', err)
    $('load-error').classList.remove('hidden')
    $('retry').classList.remove('hidden')
    return new Promise((resolve) => retries.push(() => resolve(withRetry(fn))))
  })
}
$('retry').onclick = () => {
  $('retry').classList.add('hidden')
  $('load-error').classList.add('hidden')
  for (const again of retries.splice(0)) again()
}

// --- Arena scenery ------------------------------------------------------------------------

/** Puts up an arena's scenery, sky and water (on the title screen too, so the menu has a view). */
function buildArena(id) {
  const a = ARENAS[id]
  game.scenery?.removeFromParent()
  game.scenery = new THREE.Group()
  const m = game.models
  if (m?.[`arena_${id}`]) game.scenery.add(m[`arena_${id}`].clone(true))
  if (id === 'puddle' && m?.umbrella) {
    const u = m.umbrella.clone(true)
    u.position.set(-14.5, 0.4, -5)
    u.rotation.set(0.1, 0.6, 0.18)
    game.scenery.add(u)
  }
  scene.add(game.scenery)
  scene.background = skyTexture(a.sky)
  scene.fog = new THREE.Fog(a.sky[1], 60, 140)
  water.setColors(a.water)
  water.clear()
  hemi.intensity = id === 'puddle' ? 0.85 : 1.1
  sun.intensity = id === 'puddle' ? 1.3 : 2.2
  game.rain?.dispose()
  game.rain = a.rain ? new Rain(scene) : null
  for (const o of game.obstacles) o.dispose()
  game.obstacles = []
}

function showObstacles(sim) {
  for (const o of game.obstacles) o.dispose()
  game.obstacles = sim.obstacles.map((o) => {
    const v = new ObstacleView(game.models, o)
    scene.add(v.root)
    return v
  })
}

// --- Screens and menus --------------------------------------------------------------------

function show(screen) {
  for (const id of ['loading', 'menu', 'waiting', 'results']) $(id).classList.toggle('hidden', id !== screen)
  const inRound = ['syncing', 'countdown', 'play', 'ending'].includes(game.state)
  $('hud').classList.toggle('hidden', !inRound)
  $('home').classList.toggle('hidden', !inRound && game.state !== 'results')
}

function duckPicture(id) {
  return game.thumbs[id] ? `<img src="${game.thumbs[id]}" alt="">` : `<span class="fallback">${DUCKS[id].emoji}</span>`
}

function renderPlayers() {
  const self = game.room?.selfId
  const html = [...game.players.values()]
    .map((p) => `<span class="player${p.id === self ? ' me' : ''}">${escapeHtml(p.emoji)}${validDuck(p.duck) ? duckPicture(p.duck) : ''}</span>`)
    .join('')
  $('players').innerHTML = html
  $('players-waiting').innerHTML = html
  renderDuckPicker()
}

/** A row of ducks to tap. Friends' animals show on the ducks they picked; two can pick the same one. */
function renderDuckPicker() {
  const self = game.room?.selfId
  const friends = new Map()
  for (const p of game.players.values()) if (p.id !== self && validDuck(p.duck)) friends.set(p.duck, (friends.get(p.duck) ?? '') + escapeHtml(p.emoji))
  const html = DUCK_IDS.map(
    (id) => `<button class="duck-pick ${id === game.myDuck ? 'selected' : ''}" data-duck="${id}" style="--c:${DUCKS[id].body}">
      ${duckPicture(id)}${friends.has(id) ? `<span class="taken">${friends.get(id)}</span>` : ''}</button>`,
  ).join('')
  for (const el of [$('ducks'), $('ducks-waiting')]) el.innerHTML = html
  for (const el of document.querySelectorAll('[data-duck]')) el.onclick = () => pickDuck(el.dataset.duck)
}

function pickDuck(id) {
  if (!validDuck(id) || !game.room) return
  audio.unlock()
  audio.squeak(1 + DUCK_IDS.indexOf(id) * 0.08)
  game.myDuck = id
  save('duck', id)
  const me = game.players.get(game.room.selfId)
  if (me) me.duck = id
  if (isHost()) broadcastPlayers()
  else send({ t: 'pick', duck: id })
  renderPlayers()
}

function buildMenu() {
  $('arenas').innerHTML = ARENA_IDS.map(
    (id) => `<button class="arena ${id === game.arena ? 'selected' : ''}" data-arena="${id}" style="background:${ARENAS[id].color}"><span class="emoji">${ARENAS[id].emoji}</span></button>`,
  ).join('')
  for (const el of document.querySelectorAll('[data-arena]')) {
    el.onclick = () => {
      audio.unlock()
      game.arena = el.dataset.arena
      save('arena', game.arena)
      document.querySelectorAll('[data-arena]').forEach((b) => b.classList.toggle('selected', b === el))
      audio.plop()
      if (game.assetsReady && game.state === 'menu') buildArena(game.arena)
    }
  }
  renderModes()
  $('go').onclick = () => {
    audio.unlock()
    audio.click()
    hostStartRound()
  }
  $('again').onclick = () => {
    audio.click()
    askAgain()
  }
  $('change').onclick = () => {
    if (!isHost()) return
    audio.click()
    send({ t: 'menu' })
    enterLobbyScreen()
  }
}

/**
 * A goal as a picture: a ten-frame per ten, coloured spaces for a colour or a number bond, and for
 * place value a raft per ten beside the single bubbles, with the number they make.
 */
function goalPicture(g) {
  const frame = (fill) =>
    `<span class="mini-frame">${Array.from({ length: 10 }, (_, i) => `<i style="--c:${fill(i)}"></i>`).join('')}</span>`
  if (g.kind === 'tens' && g.rows) return frame((i) => colourOf(g.rows[i < 5 ? 0 : 1]))
  if (g.kind === 'tens') return Array.from({ length: g.n }, () => frame(() => '#ffffff')).join('')
  if (g.kind === 'colour') return frame((i) => (i < g.n ? colourOf(g.c) : 'transparent'))
  if (g.kind === 'bond' && !g.parts) return `${frame((i) => (i < g.n ? '#ffffff' : 'transparent'))}<b class="mini-num">${g.n}</b>`
  if (g.kind === 'bond') {
    const [[a, x], [b]] = g.parts
    return `${frame((i) => (i < x ? colourOf(a) : i < goalValue(g) ? colourOf(b) : 'transparent'))}<b class="mini-num">${goalValue(g)}</b>`
  }
  // Level 5 shows only the number: the rafts and ones are the child's to work out.
  if (g.level >= HIDE_LEVEL) return `<b class="mini-num">${goalValue(g)}</b>`
  const ones = g.ones ? `<span class="mini-ones">${'<i></i>'.repeat(g.ones)}</span>` : ''
  return `${'<span class="mini-raft"></span>'.repeat(g.tens)}${ones}<b class="mini-num">${goalValue(g)}</b>`
}
/** A trip on the menu: its first goal, and a small dot for each goal in the trip. */
function tripPicture(trip) {
  const dots = trip.length > 1 ? `<span class="trip-dots" aria-hidden="true">${'<i></i>'.repeat(trip.length)}</span>` : ''
  return `${goalPicture(trip[0])}${dots}`
}
/** A goal for screen readers. */
function goalLabel(g) {
  if (g.kind === 'tens' && g.rows) return `one ten: ${rowWords(g)}`
  if (g.kind === 'tens') return plural(g.n, 'ten')
  if (g.kind === 'colour') return `${g.n} ${colourName(g.c)}`
  if (g.kind === 'bond') return g.parts ? `${goalValue(g)}: ${listWords.format(g.parts.map(([c, n]) => `${n} ${colourName(c)}`))}` : `${g.n}, your own way`
  if (g.level >= HIDE_LEVEL) return `${goalValue(g)} with tens and ones`
  return `${goalValue(g)}: ${plural(g.tens, 'ten')} and ${plural(g.ones, 'one')}`
}
const tripLabel = (trip) => listWords.format(trip.map(goalLabel))

/** Says the Pond helpers goal waiting on the menu (and remembers it, so GO doesn't repeat it). */
function sayMenuGoal() {
  game.spokenGoal = goalKey(game.goal)
  game.spokenExplained = game.goal.kind === 'place' && !raftTold()
  voice.sayNow(goalWords(game.goal, { explain: game.spokenExplained }))
}

/**
 * Two pictured ways to play: Pond helpers (calm, the default) and Bumper play (lively, no clock).
 * The ▶ beside Pond helpers shows another goal, one level further up the ladder (and round again).
 */
function renderModes() {
  const calm = game.mode === 'calm'
  $('modes').innerHTML = `
    <span class="mode-wrap">
      <button class="mode calm${calm ? ' selected' : ''}" data-mode="calm" aria-pressed="${calm}" aria-label="Pond helpers: fill the jar together, ${tripLabel(game.trip)}">
        <span class="pic">${tripPicture(game.trip)}</span><span class="name">🫧 Together</span></button>
      <button class="next-goal" id="next-goal" aria-label="Another goal"${calm ? '' : ' hidden'}>▶</button>
    </span>
    <button class="mode lively${calm ? '' : ' selected'}" data-mode="lively" aria-pressed="${!calm}" aria-label="Bumper play: bump and bounce while the team makes exactly ${game.playGoal}">
      <span class="pic"><span class="tally">${tally(game.playGoal)}</span><b class="big goal-n">${game.playGoal}</b></span><span class="name">💥 Bumper play</span></button>`
  for (const el of $('modes').querySelectorAll('[data-mode]')) {
    el.onclick = () => {
      audio.unlock()
      game.mode = el.dataset.mode
      save('mode', game.mode)
      audio.plop()
      renderModes()
      if (game.mode === 'calm') sayMenuGoal()
      else {
        game.spokenPlay = game.playGoal
        voice.sayNow(`Bumper play! Bump and bounce, and make ${game.playGoal} together: ${tensWords(game.playGoal)}, not one more.`)
      }
    }
  }
  $('next-goal').onclick = () => {
    audio.unlock()
    newTrip((game.goal.level + 1) % LEVELS)
    audio.plop()
    renderModes()
    sayMenuGoal()
  }
}

/** Again! The host starts the next splash at once; a friend's tap asks the host's device to. */
function askAgain() {
  if (game.state !== 'results') return
  if (isHost()) return hostStartRound()
  send({ t: 'again' }, { to: game.hostId })
  $('again').classList.add('asked')
}

function setWaitingText(text) {
  $('waiting-text').textContent = text
}

function enterLobbyScreen() {
  clearTimers()
  game.state = isHost() ? 'menu' : 'waiting'
  game.sitOut = false
  clearRound()
  if (game.assetsReady) buildArena(game.arena)
  $('countdown').classList.add('hidden')
  if (isHost()) {
    renderModes() // the next goals, as the last round adapted them
    show('menu')
  } else {
    setWaitingText('Waiting for the splash to start…')
    show('waiting')
  }
  renderPlayers()
}

/** Takes the last round's ducks and pickups off the water. */
function clearRound() {
  for (const v of game.views.values()) v.dispose()
  game.views.clear()
  for (const v of game.items.values()) v.dispose()
  game.items.clear()
  for (const o of game.obstacles) o.dispose()
  game.obstacles = []
  game.sim = null
  game.me = null
  document.body.classList.remove('calm-round', 'young-jar')
  hudBottom = 0
  frameCamera()
  game.bots.clear()
  game.inputs.clear()
  effects.clear()
  $('power').classList.add('hidden')
}

// --- Networking -----------------------------------------------------------------------------

function send(msg, opts) {
  game.room?.send(msg, opts)
}

function broadcastPlayers() {
  if (isHost()) send({ t: 'players', players: [...game.players.values()], host: game.hostId })
}

function addPlayer(id) {
  if (game.players.has(id)) return
  const used = new Set([...game.players.values()].map((p) => p.emoji))
  const emoji = PLAYER_EMOJI.find((e) => !used.has(e)) ?? PLAYER_EMOJI[game.players.size % PLAYER_EMOJI.length]
  game.players.set(id, { id, emoji, duck: null })
}

function setupRoom(room) {
  game.room = room
  game.hostId = room.isHost ? room.selfId : null
  game.players.set(room.selfId, { id: room.selfId, emoji: PLAYER_EMOJI[0], duck: game.myDuck })
  for (const id of room.peers) addPlayer(id)
  room.on('join', (id) => {
    addPlayer(id)
    if (game.assetsReady) renderPlayers()
    broadcastPlayers()
    if (isHost() && game.setup && ['syncing', 'countdown', 'play', 'ending'].includes(game.state)) send({ t: 'busy' }, { to: id })
  })
  room.on('leave', onLeave)
  room.on('message', (msg, from) => {
    if (!msg || typeof msg !== 'object') return
    if (game.assetsReady) return onMessage(msg, from)
    if (msg.t !== 's' && msg.t !== 'in') game.queue.push([msg, from])
  })
}

function onLeave(id) {
  const wasHost = id === game.hostId
  game.players.delete(id)
  game.ready.delete(id)
  // A friend who leaves mid-round: a robot takes over their duck so the fun goes on.
  if (game.sim && isHost() && game.sim.byId.has(id)) adoptBot(id)
  if (wasHost) migrateHost()
  else if (isHost()) {
    broadcastPlayers()
    maybeGo()
  }
  if (game.assetsReady) renderPlayers()
}

function adoptBot(id) {
  const d = game.sim?.byId.get(id)
  if (!d || id === game.room.selfId || game.bots.has(id)) return
  game.bots.set(id, new Bot(d, 0.7, game.bots.size + 2))
}

/**
 * The host left: the remaining player with the lowest id takes over (everyone
 * has the same list, so everyone picks the same one). The new host runs the
 * round from where its own copy is, with robots for everyone not here.
 */
function migrateHost() {
  const ids = [...game.players.keys()].sort()
  game.hostId = ids[0] ?? game.room.selfId
  if (!isHost()) return
  broadcastPlayers()
  if (game.sim) for (const e of game.setup.entries) if (!game.players.has(e.id)) adoptBot(e.id)
  if (game.state === 'syncing') maybeGo(true)
  else if (game.state === 'waiting') enterLobbyScreen()
  else if (game.state === 'results') renderResults()
}

const ROUND_MESSAGES = new Set(['s', 'ev', 'st', 'in', 'dash', 'ready', 'go', 'end'])

function onMessage(msg, from) {
  if (ROUND_MESSAGES.has(msg.t) && (msg.r == null || msg.r !== roundId())) return
  switch (msg.t) {
    case 'players': {
      if (msg.host !== from || !Array.isArray(msg.players)) return
      game.hostId = from
      game.players = new Map(
        msg.players
          .filter((p) => p && typeof p.id === 'string')
          .slice(0, 8)
          .map((p) => [p.id, { id: p.id, emoji: String(p.emoji ?? '🙂').slice(0, 8), duck: validDuck(p.duck) ? p.duck : null }]),
      )
      const me = game.players.get(game.room.selfId)
      if (me && me.duck !== game.myDuck) {
        me.duck = game.myDuck
        send({ t: 'pick', duck: game.myDuck }, { to: from })
      }
      renderPlayers()
      break
    }
    case 'pick': {
      const p = game.players.get(from)
      if (!isHost() || !p || !validDuck(msg.duck)) return
      p.duck = msg.duck
      broadcastPlayers()
      renderPlayers()
      break
    }
    case 'setup':
      if (msg.host !== from) return
      game.hostId = from
      game.ready = new Set()
      startRound(msg)
      break
    case 'ready':
      if (isHost()) {
        game.ready.add(from)
        maybeGo()
      }
      break
    case 'again':
      // A friend tapped Again on the podium.
      if (isHost() && game.state === 'results' && game.players.has(from)) hostStartRound()
      break
    case 'sitout':
      // A friend went home mid-round: a robot paddles their duck until the round ends.
      if (isHost() && game.sim) adoptBot(from)
      break
    case 'go':
      if (from === game.hostId && game.state === 'syncing') runCountdown()
      break
    case 'busy':
      if (from === game.hostId && game.state === 'waiting') setWaitingText('💦 A splash is on! You can join the next one.')
      break
    case 'menu':
      if (from === game.hostId) enterLobbyScreen()
      break
    case 's':
      if (from === game.hostId && game.sim && !isHost()) game.sim.applySnapshot(msg, game.me)
      break
    case 'ev':
      if (from !== game.hostId || isHost() || !game.sim || !Array.isArray(msg.e)) return
      for (const e of msg.e) {
        if (!e || typeof e !== 'object') continue
        game.sim.applyEvent(e)
        playEvent(e)
      }
      break
    case 'st': {
      if (from !== game.hostId || isHost() || !game.sim) return
      const { added, removed } = game.sim.syncItems(msg.items)
      for (const it of added) addItemView(it)
      for (const it of removed) removeItemView(it.id)
      if (Array.isArray(msg.stats)) msg.stats.forEach((s, i) => s && game.sim.ducks[i] && Object.assign(game.sim.ducks[i].stats, s))
      if (game.sim.goTo(msg.stage)) showStage(false)
      if (game.sim.syncJar(msg.jar)) catchUpJar()
      if (Array.isArray(msg.frogs)) game.sim.setFrogs(msg.frogs[0], msg.frogs[1])
      else if (msg.frogs === null) game.sim.frogs = null
      break
    }
    case 'in': {
      if (!isHost() || !game.sim) return
      const d = game.sim.byId.get(from)
      if (!d) return
      d.ix = clamp(Number(msg.x) || 0, -1, 1)
      d.iz = clamp(Number(msg.z) || 0, -1, 1)
      break
    }
    case 'dash':
      if (isHost() && game.sim && game.state === 'play') {
        const d = game.sim.byId.get(from)
        if (d && game.sim.dash(d)) playEvent({ k: 'dash', id: from })
      }
      break
    case 'end':
      if (from === game.hostId && game.sim) {
        if (Array.isArray(msg.scores)) msg.scores.forEach((s, i) => game.sim.ducks[i] && (game.sim.ducks[i].score = Number(s) || 0))
        if (Array.isArray(msg.stats)) msg.stats.forEach((s, i) => s && game.sim.ducks[i] && Object.assign(game.sim.ducks[i].stats, s))
        if (game.sim.goTo(msg.stage)) showStage(false)
        if (game.sim.syncJar(msg.jar)) catchUpJar()
        endRound()
      }
      break
  }
}

// --- Rounds -------------------------------------------------------------------------------

function hostStartRound() {
  if (!isHost() || !game.assetsReady || !['menu', 'results'].includes(game.state)) return
  const seed = 1 + Math.floor(Math.random() * 1e9)
  const entries = [...game.players.values()].slice(0, MAX_PLAYERS).map((p) => ({ id: p.id, duck: validDuck(p.duck) ? p.duck : null, bot: false, emoji: p.emoji }))
  const free = DUCK_IDS.filter((d) => !entries.some((e) => e.duck === d)).sort(() => Math.random() - 0.5)
  const anyDuck = () => free.shift() ?? DUCK_IDS[Math.floor(Math.random() * DUCK_IDS.length)]
  for (const e of entries) e.duck ??= anyDuck()
  for (let i = entries.length; i < MAX_PLAYERS; i++) entries.push({ id: `bot${i}`, duck: anyDuck(), bot: true, emoji: '🤖' })
  const count = new Map()
  for (const e of entries) {
    e.tint = count.get(e.duck) ?? 0
    count.set(e.duck, e.tint + 1)
  }
  const setup = {
    t: 'setup', arena: game.arena, seed, entries, host: game.room.selfId,
    mode: game.mode, trip: game.mode === 'calm' ? game.trip : null, playGoal: game.mode === 'calm' ? null : game.playGoal,
  }
  game.ready = new Set()
  send(setup)
  startRound(setup)
}

function startRound(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length || !validArena(setup.arena)) return
  collectedBubbles.clear()
  clearTimers()
  clearRound()
  game.setup = setup
  game.arena = setup.arena
  game.results = null
  game.tensSaid = 0
  game.tensQueued = game.tensVoiced = 0
  game.splitToTell = false
  game.reminded = -1
  game.nearSaid = false
  game.raftSaid = false
  game.tensAt = -9
  game.playNope = 0
  game.lastTeam = -1
  game.frogTalk = 0
  game.run = 0
  game.lastShake = 0
  game.lastSteer = 0
  game.idleHinted = false
  game.childActive = 0
  game.lastZzz = -9
  game.kidMiss = 0
  game.lastKidCatch = 0
  game.nopeTalk = 0
  game.quietUntil = 0
  game.dryAt = null
  game.goalSaid = false
  game.playLines = []
  game.playEndAt = 0
  game.playBounced = new Set()
  game.playSplits = 0
  game.splitTold = false
  game.tripWaited = false
  game.splitStage = null
  voice.newRound()
  const entries = setup.entries.slice(0, MAX_PLAYERS).map((e) => ({ ...e, duck: validDuck(e.duck) ? e.duck : 'sunny', emoji: String(e.emoji ?? '🙂').slice(0, 8) }))
  setup.entries = entries
  if (!entries.some((e) => e.id === game.room.selfId)) {
    game.setup = null
    game.state = 'waiting'
    setWaitingText('💦 A splash is on! You can join the next one.')
    show('waiting')
    renderPlayers()
    return
  }
  buildArena(setup.arena)
  const trip = setup.mode === 'calm' ? validTrip(setup.trip) : null
  const sim = new Sim({ arena: setup.arena, entries, mode: trip ? 'calm' : 'lively', trip, playGoal: validPlayGoal(setup.playGoal) ? setup.playGoal : undefined })
  game.sim = sim
  // Counting aloud teaches on the first trip at a level up to the first place value (and always while
  // filling the first ten). After that, and for the 6–8 tiers above it, the soft notes and the jar's own
  // number do the counting, and the voice says only the goals and what was made.
  const lvl = trip?.[0]?.level ?? 0
  game.countOn = lvl === 0 || (lvl <= 3 && load(`counted-${lvl}`) !== '1')
  document.body.classList.toggle('calm-round', sim.calm)
  // The youngest goals (one ten, colours, bonds) draw the jar larger on tablets: its cells are the lesson.
  document.body.classList.toggle('young-jar', sim.calm && lvl <= 2)
  resetJar()
  showObstacles(sim)
  entries.forEach((e) => {
    const me = e.id === game.room.selfId
    const v = new DuckView(game.models, e, { me, tint: Number(e.tint) || 0 })
    scene.add(v.root)
    game.views.set(e.id, v)
    if (me) game.me = sim.byId.get(e.id)
  })
  if (isHost()) entries.forEach((e, i) => e.bot && game.bots.set(e.id, new Bot(sim.byId.get(e.id), 0.42 + i * 0.05, i + 1)))
  renderScores()
  updateHud()
  game.state = 'syncing'
  show(null)
  measureHud()
  frameCamera()
  const el = $('countdown')
  el.textContent = '🦆'
  el.className = 'countdown waiting'
  if (isHost()) {
    game.ready.add(game.room.selfId)
    later(() => maybeGo(true), READY_TIMEOUT)
    maybeGo()
  } else {
    send({ t: 'ready', r: roundId() })
    later(() => game.state === 'syncing' && runCountdown(), READY_TIMEOUT + 3000)
  }
}

function maybeGo(force = false) {
  if (!isHost() || game.state !== 'syncing') return
  const humans = game.setup.entries.filter((e) => !e.bot && game.players.has(e.id))
  if (!force && !humans.every((e) => game.ready.has(e.id))) return
  send({ t: 'go', r: roundId() })
  runCountdown()
}

function runCountdown() {
  if (game.state !== 'syncing') return
  game.state = 'countdown'
  show(null)
  // No count-in: one soft splash, and your own duck hops so a child spots which one is theirs.
  const el = $('countdown')
  later(() => {
    el.textContent = '💦'
    el.className = 'countdown'
    void el.offsetWidth
    el.className = 'countdown tick'
    audio.splash(0.5)
    game.views.get(game.room.selfId)?.hello()
    game.state = 'play'
    showHint()
    later(sayGoal, 700)
    later(() => el.classList.add('hidden'), 900)
  }, 500)
}

/** The first time: show how to steer (a dragging finger, or the arrow keys). */
function showHint() {
  if (game.hinted || game.roundsPlayed > 0) return
  const touch = matchMedia('(any-pointer: coarse)').matches
  if (touch) placeHint()
  $(touch ? 'hint' : 'keys-hint').classList.remove('hidden')
  later(hideHint, 6000)
}
/** The dragging finger sits beside the child's own duck (never on top of it) and drags away from it. */
const hintPos = new THREE.Vector3()
function placeHint() {
  const me = game.me
  if (!me) return
  hintPos.set(me.x, 0.6, me.z).project(camera)
  const x = (hintPos.x * 0.5 + 0.5) * innerWidth
  const y = (-hintPos.y * 0.5 + 0.5) * innerHeight
  // Left of the duck unless it is near the left edge; the drag shortens on narrow screens to stay in view.
  const side = x > 150 ? -1 : 1
  const fx = clamp(x + side * 82, 40, innerWidth - 40)
  const room = side < 0 ? fx - 32 : innerWidth - fx - 32
  const el = $('hint')
  el.style.left = `${fx}px`
  el.style.top = `${clamp(y + 10, 60, innerHeight - 60)}px`
  el.style.setProperty('--dx', `${side * clamp(room - 6, 16, 60)}px`)
}
function hideHint() {
  game.hinted = true
  $('hint').classList.add('hidden')
  $('keys-hint').classList.add('hidden')
}

/**
 * A child who has not paddled for a long while (30 s) sees the steering hint once, quietly.
 * Calm pass: this used to repeat every 6 s of rest; resting is fine, and the robots nap too.
 */
function idleHint() {
  const sim = game.sim
  if (game.state !== 'play' || !game.me || game.sitOut || !sim || game.idleHinted) return
  if (sim.time - (game.lastSteer ?? 0) < 30) return
  game.idleHinted = true
  const touch = matchMedia('(any-pointer: coarse)').matches
  if (touch) placeHint()
  const el = $(touch ? 'hint' : 'keys-hint')
  el.classList.remove('hidden')
  later(() => el.classList.add('hidden'), 3000)
}

function endRound() {
  if (!['play', 'countdown', 'syncing'].includes(game.state)) return
  game.state = 'ending'
  hideHint()
  game.roundsPlayed++
  if (isHost() && !game.room.solo) {
    send({ t: 'ev', r: roundId(), e: flushEvents() })
    send({ t: 'end', r: roundId(), scores: game.sim.ducks.map((d) => d.score), stats: game.sim.ducks.map((d) => d.stats), jar: game.sim.jar, stage: game.sim.stage })
  }
  for (const d of game.sim.ducks) d.ix = d.iz = 0
  if (game.sim.calm) {
    save(`counted-${game.sim.trip[0].level ?? 0}`, '1')
    // Pond helpers: the last bubbles land and the full frame slides onto the shelf, then the team's picture.
    if (isHost()) {
      // The next trip adapts to how carefully the children chose (only bubbles a duck steered at for a
      // moment count, see Sim.chose): misses are chosen bubbles that didn't fit, and careful catches are
      // chosen ones that did. Climbing needs few misses (one in five careful catches or fewer), most catches
      // chosen (not swept up by a random paddle) and at least three of them; from the bonds up it also needs
      // steady catching (under 7 s a bubble, not counting the pauses between goals). Many misses, or catching
      // mostly by luck once there is a choice to make, steps back one. Anything else stays, with fresh numbers.
      // Short trips are noisy, so a trip with few careful catches is judged together with the trip before
      // it at the same level (rolling), and one lone miss never holds a careful child back on its own.
      const kids = game.sim.ducks.filter((d) => !d.bot)
      const level = game.sim.goal.level ?? 0
      const trip = {
        level,
        nopes: kids.reduce((n, d) => n + (d.stats.nopes ?? 0), 0),
        chosen: kids.reduce((n, d) => n + (d.stats.chosen ?? 0), 0),
        // (Bubbles of a raft broken by chance are left out: luck neither helps nor holds a child back.)
        caught: kids.reduce((n, d) => n + d.score - (d.stats.luck ?? 0), 0),
        bumps: kids.reduce((n, d) => n + (d.stats.bumps ?? 0), 0),
        time: game.sim.time - game.sim.stage * STAGE_PAUSE,
      }
      const prev = game.lastTrip?.level === level && trip.chosen < 8 ? game.lastTrip : null
      const sum = (k) => trip[k] + (prev?.[k] ?? 0)
      const [nopes, chosen, caught, bumps] = [sum('nopes'), sum('chosen'), sum('caught'), sum('bumps')]
      game.lastTrip = trip
      const rate = nopes / Math.max(1, chosen)
      const careful = chosen / Math.max(1, caught)
      const pace = sum('time') / Math.max(1, caught)
      const steady = level < 2 || pace < 7
      // (Random paddling no longer looks careful: a dash into one that doesn't fit is a miss, place value
      // asks for a surer aim, and a raft broken by a random dash gives no careful catches; see Sim.missed.)
      // Crossing a ten with the ones used up is solved by breaking a raft. A trip whose crossing was only
      // waited out (trickled ones, no raft broken on purpose) has not shown it yet: no climb, and the top
      // level (only the number shown) steps back to the one with the spaces to see.
      const waited = game.tripWaited && !kids.some((d) => d.stats.meant)
      game.tripWaited = false
      const climb = (rate <= 0.2 || trip.nopes <= 1) && rate < 0.34 && careful >= 0.55 && chosen >= 3 && steady && !waited
      game.lastJudge = { level, nopes, chosen, caught, bumps, pace: +pace.toFixed(1), waited }
      const back = (rate >= 0.5 && nopes >= 3) || (level >= 1 && caught >= 4 && careful < 0.35) || (waited && level >= HIDE_LEVEL)
      game.lastRate = rate
      game.lastCareful = careful
      const next = clamp(level + (climb ? 1 : back ? -1 : 0), 0, LEVELS - 1)
      if (next !== level) game.lastTrip = null
      newTrip(next)
    }
    later(() => {
      game.state = 'results'
      renderResults()
      show('results')
      effects.confetti(R, 18)
    }, 2400)
    return
  }
  // One soft moment: the team's last bubble is in (a gentle chord), no alarm banner or confetti burst.
  // Lines still waiting (a split's, a ten's) give way, so the goal's sentence is heard alone.
  audio.cheer()
  game.playLines = []
  // (A hint still being said gives way: the goal's sentence is never preceded by "we need 1 more".)
  const speakEnd = game.playEndAt === Infinity ? voice.sayNow : voice.sayOnce
  const split = game.playSplits && !game.splitTold ? 'One ten became ten ones. ' : ''
  speakEnd(`${split}${tensWords(game.sim.playGoal)} make ${game.sim.playGoal}!`)
  if (isHost()) adaptPlay()
  later(() => {
    game.state = 'results'
    renderResults()
    show('results')
    effects.confetti(R, 24)
  }, 1700)
}

/**
 * Bumper play adapts like Pond helpers, on the raft-or-single choice it teaches. Stepping up (50, then 70,
 * then a number with ones like 47) needs the children to have steered at rafts while a ten still fitted
 * (two or more), and in the last stretch to have chosen single bubbles with a raft right there (three or
 * more, close to half their last ones; breaking a raft on purpose counts too) while bumping at most one raft,
 * or, when rounds end on rafts alone (two last ones or fewer), to have steered at three or more rafts and
 * bumped none, twice running.
 * A random paddle sweeps up singles but seldom steers at one, so it doesn't climb. Three or more rafts
 * bumped in the last stretch, or last ones taken with almost no choosing, steps back. Anything else plays
 * the same tier again. (See Sim.pickups: stats.rafts, stats.lastOnes, stats.wise.)
 */
function adaptPlay() {
  const kids = game.sim.ducks.filter((d) => !d.bot)
  const sum = (k) => kids.reduce((n, d) => n + (d.stats[k] ?? 0), 0)
  const [rafts, lastOnes, wise] = [sum('rafts'), sum('lastOnes'), sum('wise')]
  const bounces = game.playBounced.size
  const back = bounces >= 3 || (lastOnes >= 5 && wise <= lastOnes * 0.2)
  // A round that ends on rafts alone leaves no singles to choose: three or more rafts steered at and none
  // bumped, two rounds running, shows the same care (so a careful child is never held at 70).
  game.cleanRounds = rafts >= 3 && lastOnes <= 2 && bounces === 0 ? (game.cleanRounds ?? 0) + 1 : 0
  const climb = (rafts >= 2 && wise >= 3 && wise >= lastOnes * 0.4 && bounces <= 1) || game.cleanRounds >= 2
  game.lastPlay = { rafts, lastOnes, wise, bounces, splits: game.playSplits, tier: game.playTier, clean: game.cleanRounds, climb, back }
  const tier = game.playTier
  newPlayGoal(tier + (climb ? 1 : back ? -1 : 0))
  if (game.playTier !== tier) game.cleanRounds = 0
}

function abortToLobby() {
  if (isHost()) {
    send({ t: 'menu' })
    enterLobbyScreen()
  } else {
    // A friend's device: sit this round out (a robot takes the duck) and wait for the next one.
    if (['syncing', 'countdown', 'play'].includes(game.state)) send({ t: 'sitout' }, { to: game.hostId })
    clearTimers()
    game.state = 'waiting'
    clearRound()
    game.setup = null
    setWaitingText('Waiting for the splash to start…')
    show('waiting')
    renderPlayers()
  }
}

// --- Events: sounds, splashes and words --------------------------------------------------------

let outbox = []
function flushEvents() {
  const e = outbox
  outbox = []
  return e
}

const posOf = (id) => game.sim?.byId.get(id)

/**
 * Why a bubble didn't fit, said once a round: the words point at what the jar still needs
 * ("We have enough green. Now pink!"), so the next choice can be a careful one.
 */
function nopeWords(token) {
  const sim = game.sim
  const g = sim.goal
  if (g.kind === 'place') {
    if (token !== TEN) return sim.open.includes('ten') ? 'Tens first! Find a ten raft.' : 'The ones are full.'
    // What the child has seen land (and heard counted), not bubbles still floating up.
    const now = sim.jar.slice(0, jar.shown).reduce((v, t) => v + (t === TEN ? 10 : 1), 0)
    if (g.regroup) return sim.dryOnes() ? `A raft would make ${now + 10}. Too many! Dash to break it into ones.` : `A raft would make ${now + 10}. Too many! Single bubbles now.`
    return g.level >= HIDE_LEVEL ? `${goalValue(g)} has ${plural(g.tens, 'ten')}. Now single bubbles!` : 'We have all the tens. Now single bubbles!'
  }
  if (g.free) {
    // A free bond: two colours only, and a way the team hasn't made yet.
    const have = splitOf(sim.jar)
    if (have.length >= 2 && !have.some(([c]) => c === token)) return `Just two colours: ${listWords.format(have.map(([c]) => colourName(c)))}.`
    const made = sim.trip.slice(0, sim.stage).map((t) => t.parts && `${t.parts[0][1]} and ${t.parts[1][1]}`).filter(Boolean)
    return made.length ? `We made ${listWords.format(made)} already. Try a new way!` : 'Try a new way!'
  }
  const want = listWords.format([...new Set(sim.open.filter(Number.isInteger))].map(colourName))
  if ((g.kind === 'bond' && g.parts.some(([c]) => c === token)) || g.rows?.includes(token)) return `We have enough ${colourName(token)}. Now ${want}!`
  return `We need ${want} bubbles.`
}

/** Runs `fn` once every bubble floating up has landed in the jar (and only if the goal is still the same). */
function whenLanded(fn, tries = 20) {
  const token = jar.token
  if (!jar.flying) return fn()
  if (tries > 0) later(() => token === jar.token && game.state === 'play' && whenLanded(fn, tries - 1), 250)
}

/** The jar's open spaces glow softly once, so a child who caught the wrong one can see what fits. */
function lookAtJar() {
  const el = $('jar')
  el.classList.add('look')
  later(() => el.classList.remove('look'), 1200)
}

function playEvent(e) {
  const sim = game.sim
  if (!sim) return
  const meId = game.room.selfId
  const mine = e.id === meId
  switch (e.k) {
    case 'item':
      addItemView({ id: e.item, k: e.kind, x: e.x, z: e.z, ...(Number.isInteger(e.c) ? { c: e.c } : {}) })
      if (e.kind !== 'bubble') audio.plop()
      water.ripple(e.x, e.z, 0.3)
      break
    case 'got': {
      const sorted = sim.calm && (e.kind === 'bubble' || e.kind === 'ten')
      const fresh = (e.kind === 'bubble' || e.kind === 'ten') && !collectedBubbles.has(e.item)
      if (fresh) {
        collectedBubbles.add(e.item)
        if (!sim.calm && !isBotDuck(e.id)) game.lastKidCatch = sim.time
      }
      const v = game.items.get(e.item)
      const y = v ? v.body.position.y : 0.8
      removeItemView(e.item)
      const d = posOf(e.id)
      if (sorted) {
        effects.pop(e.x, y, e.z)
        if (!isBotDuck(e.id)) {
          game.kidMiss = 0
          game.lastKidCatch = sim.time
        }
        // Into the jar it floats, to be counted when it lands.
        if (e.ok && fresh) jarDrop(e, y)
      } else if (e.kind === 'bubble') {
        effects.pop(e.x, y, e.z)
        if (mine) {
          const now = performance.now() / 1000
          // A run of bubbles walks up and down a five-note scale instead of climbing like a combo.
          game.run = now - game.lastBubble < 1.6 ? game.run + 1 : 0
          game.lastBubble = now
          audio.bubble(game.run % 5)
        } else if (Math.random() < 0.5) audio.bubble(0)
        // Calm pass: no "+1" / "⭐+3" score pop-ups; the duck's counter shows what it collected.
      } else if (e.kind === 'ten') {
        // Bumper play: a raft is ten at once. The first a child gathers in a round says the sum once
        // ("23 and one ten make 33!"); after that the team's tally shows it.
        effects.pop(e.x, y, e.z)
        audio.chord(0.08)
        const from = Number(e.from)
        if (!isBotDuck(e.id) && Number.isInteger(from) && from > 0 && !game.raftSaid) {
          game.raftSaid = true
          // (This sentence covers the ten it crosses, so the tally's "Three tens!" stays quiet. Tens still
          // waiting are said first, in order: "Two tens! … 23 and one ten make 33!")
          const covers = Math.floor((from + 10) / 10)
          game.tensSaid = Math.max(game.tensSaid, covers)
          playSay(() => {
            game.tensVoiced = Math.max(game.tensVoiced ?? 0, covers)
            return `${from} and one ten make ${from + 10}!`
          }, 'raft')
        }
      } else if (e.kind === 'star') {
        effects.sparkle(e.x, 1.2, e.z, '#ffd23f', 10)
        audio.star()
      } else if (e.kind === 'gift' && e.p) {
        effects.sparkle(e.x, 1, e.z, '#c9a7ff', 12)
        audio.gift()
        later(() => audio.power(e.p), 250)
        // The power's picture floats up from the duck: it says what the gift does without words.
        effects.label(POWERS[e.p].emoji, { x: d?.x ?? e.x, y: 3, z: d?.z ?? e.z }, { size: 'big' })
      }
      break
    }
    case 'bonk': {
      const s = Number(e.s) || 3
      game.views.get(e.a)?.bonked(s)
      game.views.get(e.b)?.bonked(s)
      // (Two robots bumping each other get no stars: the children's own bumps are the ones to see.)
      if (!isBotDuck(e.a) || !isBotDuck(e.b)) effects.bonkStars(e.x, e.z, Math.min(2, s / 5))
      effects.splash(e.x, e.z, Math.min(1.2, s / 8))
      water.ripple(e.x, e.z, Math.min(2, s / 4))
      audio.bonk(s / 6)
      // A bonk is a real bump, so a child's own duck still feels a small nudge on hard ones.
      // One small "bonk!" at a time, never a stack of them. (Pond helpers: the sound is enough; no word
      // floats over the ducks while the child reads the jar.)
      const now = performance.now()
      if (!sim.calm && s > 4 && now - (game.lastBonkLabel ?? 0) > 1500) {
        game.lastBonkLabel = now
        effects.label('bonk!', { x: e.x, y: 2.4, z: e.z }, { size: 'small' })
      }
      if ((e.a === meId || e.b === meId) && s > 6) effects.shake = Math.min(0.35, s / 30)
      break
    }
    case 'thud': {
      const o = game.obstacles[e.o]
      o?.bump()
      const ob = sim.obstacles[e.o]
      if (!ob) break
      water.ripple(ob.x, ob.z, 0.8)
      if (ob.kind === 'mama') {
        audio.quack(0.75)
        if (!sim.calm) effects.label('quack!', { x: ob.x, y: 5, z: ob.z }, { size: 'small' })
      } else if (ob.kind === 'lily' && ob.frog) {
        audio.ribbit()
        // (In the frog-order puzzle the frog's number is what to read: no word drawn over its sign.)
        if (!sim.frogs) effects.label('ribbit!', { x: ob.x, y: 2.5, z: ob.z }, { size: 'small' })
      } else audio.boing()
      break
    }
    case 'rim':
      audio.boing()
      effects.splash(e.x, e.z, 0.4)
      water.ripple(e.x, e.z, 0.6)
      break
    case 'fly': {
      const d = posOf(e.id)
      if (!d) break
      audio.splash(1)
      audio.whee()
      effects.splash(d.x, d.z, 1.4)
      water.ripple(d.x, d.z, 1.5)
      effects.label('whee!', { x: d.x, y: 3, z: d.z }, { size: 'small' })
      break
    }
    case 'land':
      audio.splash(1.2)
      effects.splash(e.x, e.z, 1.6)
      water.ripple(e.x, e.z, 2)
      game.views.get(e.id)?.bonked(8)
      if (mine) effects.shake = 0.3
      break
    case 'drop':
      audio.plop()
      effects.splash(e.x, e.z, 0.8, '#dfe9ff')
      water.ripple(e.x, e.z, 1.6)
      break
    case 'dash': {
      const d = posOf(e.id)
      if (!d) break
      if (mine || isHost()) audio.dash()
      effects.splash(d.x, d.z, 0.3)
      break
    }
    case 'powerEnd':
      if (mine) audio.click()
      break
    case 'show': {
      // A robot helper points a bubble out: it waits beside it, and the bubble twinkles for the child.
      const it = sim.items.get(e.item)
      if (it) effects.sparkle(it.x, 1.2, it.z, colourOf(it.c), 8)
      game.views.get(e.id)?.hello()
      // One show answers being stuck; the robots point again only if the child stays stuck.
      game.kidMiss = 0
      game.lastKidCatch = Math.max(game.lastKidCatch, sim.time - 12)
      break
    }
    case 'nope': {
      // A bubble the jar has no space for bobs away from the duck: a soft note, never a buzzer.
      water.ripple(e.x, e.z, 0.5)
      // Brushed past on the way to another: it just slides aside, quietly.
      if (e.q) break
      if (!sim.calm) {
        // Bumper play's last ten: a raft would be too many. Once, why (a raft is ten, and fewer are
        // wanted); the second time, how a raft can still help (break it into ones).
        // (Each raft counts once, however often it is bumped.)
        if (!isBotDuck(e.id) && e.kind === 'ten') game.playBounced.add(e.item)
        if (!mine) break
        audio.nope()
        game.views.get(e.id)?.bonked(2)
        if (game.playNope === 0 && sim.left > 0) {
          game.playNope++
          // (This answers the "Will a raft still fit?" question, so the question is no longer asked.)
          game.nearSaid = true
          game.playLines = game.playLines.filter((l) => l.key !== 'near')
          game.playNopeAt = sim.time
          // (A ten still owed comes first, so the count never runs backwards: "Four tens and 6. A raft is ten…")
          playSay(() => (sim.left > 0 && !lastCatchSoon(sim) ? `${tensSoFar(sim, '. ')}A raft is ten. We need just ${sim.left} more!` : null), 'nope')
        } else if (game.playNope === 1 && sim.time - game.playNopeAt > 10) {
          game.playNope++
          // (Never once a raft has been broken: the child is not told to do what they just did.)
          playSay(() => (sim.left > 0 && !game.playSplits && !lastCatchSoon(sim) ? 'Dash into a raft to break it into ten ones!' : null), 'nope')
        }
        break
      }
      if (!isBotDuck(e.id)) game.kidMiss++
      if (mine) {
        audio.nope()
        game.views.get(e.id)?.bonked(2)
        lookAtJar()
        // At most two of these a round: after that the soft note and the glowing spaces say it. The words
        // wait for bubbles still floating up, so they never run ahead of the jar the child sees.
        if (game.goalSaid && game.nopeTalk < 2) whenLanded(() => {
            // Once the jar has caught up, the bubble may fit after all (the tens are in): then nothing to say.
            // (Never between two counted numbers: while the jar counts aloud the line waits for a real pause, or is dropped.)
            if (game.nopeTalk >= 2 || sim.between != null || resting() || sim.counts({ k: e.c === TEN ? 'ten' : 'bubble', c: e.c })) return
            if (voice.sayOnce(nopeWords(e.c))) game.nopeTalk++
          })
      }
      break
    }
    case 'split': {
      // A dash broke a raft into its ten bubbles: a soft chord and a ring of bubbles on the water.
      removeItemView(e.item)
      audio.chord(0.1)
      effects.splash(e.x, e.z, 0.7)
      water.ripple(e.x, e.z, 1.2)
      if (isBotDuck(e.id)) break
      // Pond helpers: said once the bubbles already floating up have landed, so it never runs ahead of a
      // raft's count. If the split's own bubbles finish the step first, the step's last landing says it
      // (see countAloud), so the decomposition is always named. On a crossing step the regroup line says it
      // instead ("40! Ten ones make one ten!"), so breaking a ten and making one are never said together.
      if (sim.calm) {
        if (sim.goal.regroup && game.splitStage !== -1) game.splitStage = sim.stage
        else {
          game.splitToTell = true
          whenLanded(() => game.splitToTell && sim.open.includes('any') && tellSplit())
        }
      } else {
        // Bumper play: named next, once a round (a waiting hint to break a raft is then dropped). If the ending
        // comes first, the ending names it: "One ten became ten ones. 5 tens make 50!"
        game.playSplits++
        playSay(() => {
          if (game.splitTold || sim.left <= 0 || lastCatchSoon(sim)) return null
          game.splitTold = true
          return 'One ten is ten ones!'
        }, 'split', { first: true })
      }
      break
    }
    case 'frogs':
      break
    case 'frog': {
      // Frog order: the right frog keeps its place (its sign turns green); one out of turn starts the line
      // again, with a soft note and (once a round, when the voice is free) what to look for.
      if (e.ok) audio.bubble(Math.max(0, (e.next ?? 1) - 1) + 2)
      else {
        audio.nope()
        if (!isBotDuck(e.id) && !resting() && game.frogTalk < 1 && voice.sayOnce('Oops, back to the start. Smallest number first!')) {
          game.frogTalk++
          hushFor(3)
        }
      }
      break
    }
    case 'free': {
      // A bump knocked the stuck bubble off: it drops into the water with a plop and a little splash.
      audio.plop()
      effects.splash(e.x, e.z, 0.6)
      water.ripple(e.x, e.z, 0.9)
      break
    }
    case 'full':
      // The jar holds this goal: a short rest while the last bubbles land and the team sees what it made.
      game.kidMiss = 0
      break
    case 'stage':
      showStage(true)
      break
    case 'fade': {
      // The pond is full: a bubble nobody needed drifts off to make room.
      const v = game.items.get(e.item)
      if (v) effects.pop(v.root.position.x, v.body.position.y, v.root.position.z)
      removeItemView(e.item)
      break
    }
    case 'zzz':
      // Robots napping while the children rest: each nods off under sleepy Zs (refreshed while the nap lasts).
      if (Array.isArray(e.ids)) for (const id of e.ids) game.views.get(id)?.nap(3)
      break
    case 'wake':
      // A child paddled: the robots wake up at once.
      if (Array.isArray(e.ids)) for (const id of e.ids) game.views.get(id)?.wake()
      break
    case 'end':
      if (isHost()) endRound()
      break
  }
}

/** How high a stuck bubble sits: on a lily pad, on the frog's head, on Mama Duck's back or in a paper boat. */
function liftOf(it) {
  const o = it.stuck != null && game.sim?.obstacles[it.stuck]
  if (!o) return 0
  return o.kind === 'mama' ? 3.4 : o.kind === 'boat' ? 0.7 : o.frog ? 1.5 : 0.25
}

function addItemView(it) {
  if (game.items.has(it.id)) return
  const v = new ItemView(game.models, it)
  scene.add(v.root)
  game.items.set(it.id, v)
}
function removeItemView(id) {
  game.items.get(id)?.dispose()
  game.items.delete(id)
}

// --- HUD ----------------------------------------------------------------------------------------

function renderScores() {
  if (!game.setup) return
  const self = game.room.selfId
  $('scores').innerHTML = game.setup.entries
    .map((e) => {
      const color = game.views.get(e.id)?.color ?? DUCKS[e.duck].body
      return `<div class="score${e.id === self ? ' me' : ''}" id="score-${escapeHtml(e.id)}" style="--c:${color}"><span class="dot">${escapeHtml(e.emoji)}</span><b class="tally"></b></div>`
    })
    .join('')
  game.scoreEls = game.setup.entries.map((e) => document.getElementById(`score-${e.id}`))
  game.shownScores = game.setup.entries.map(() => -1)
}

const TENS_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

/**
 * Bumper play counts by tens aloud, never skipping one: the line is read when it is said, so tens caught
 * close together are said together ("Three tens, four tens!") instead of the newer replacing the older.
 */
/**
 * A ten to say in Bumper play. Not while the last catch is right there (the ending is about to say the
 * tens: "7 tens make 70!"); it is asked again (see updateHud), so a ten is only ever put off, never lost.
 */
function tensSoon() {
  const sim = game.sim
  return sim && sim.left < 10 && lastCatchSoon(sim) ? null : tensLine()
}
function tensLine() {
  const from = (game.tensVoiced ?? 0) + 1
  const to = game.tensQueued ?? 0
  if (to < from) return null
  game.tensVoiced = to
  const word = (t) => (t === 1 ? 'One ten' : `${TENS_WORDS[t] ?? t} tens`)
  const words = Array.from({ length: to - from + 1 }, (_, i) => word(from + i))
  return `${[words[0], ...words.slice(1).map((w) => w.toLowerCase())].join(', ')}!`
}

/** Any ten still owed, with the ones so far, ending in `end`: "Four tens and 6. " (or '' when none is owed). */
function tensSoFar(sim, end) {
  const owed = tensLine()
  const ones = sim.gathered % 10
  return owed ? `${owed.slice(0, -1)}${ones ? ` and ${ones}` : ''}${end}` : ''
}

/** Race counts as a picture of tens and ones: a little raft for each ten, a dot for each one (no jumping numbers). */
function tally(n) {
  return `${'<span class="t-raft"></span>'.repeat(Math.floor(n / 10))}<span class="t-ones">${'<i></i>'.repeat(n % 10)}</span>`
}

/**
 * Bumper play has no clock: the team gathers exactly its goal together. The pill shows it as rafts of ten
 * that fill dot by dot (two rows of five), and each full one is said once ("Two tens!"). A goal with ones
 * (47) ends on a short frame of just its ones (7 spaces), so the picture shows a raft won't fit there.
 */
function teamTally(n, goal) {
  return Array.from({ length: Math.ceil(goal / 10) }, (_, k) => {
    const size = Math.min(10, goal - k * 10)
    const on = clamp(n - k * 10, 0, size)
    return `<span class="tr${on === 10 ? ' full' : ''}${size < 10 ? ' ones' : ''}">${Array.from({ length: size }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('')}</span>`
  }).join('')
}
function updateHud() {
  const sim = game.sim
  if (!sim) return
  if (!sim.calm) {
    const goal = sim.playGoal
    const n = Math.min(goal, sim.gathered)
    if (n !== game.lastTeam) {
      game.lastTeam = n
      // The number now and the goal beside the rafts, so 46 and 48 can be told apart at a glance.
      $('timer').innerHTML = `<b class="tt-now">${n}</b>${teamTally(n, goal)}<b class="tt-goal"><small>make</small>${goal}</b>`
      $('timer').setAttribute('aria-label', `Together: ${tensWords(n)} of ${goal}`)
    }
    const tens = Math.floor(n / 10)
    // Into the last stretch (a raft is too many now): one question, so the child looks before grabbing a
    // raft. With only one or two left there is nothing to decide, so it isn't asked.
    const asking = () => !game.nearSaid && sim.left >= 3 && sim.left < 10
    if (game.state === 'play' && tens > game.tensSaid) {
      game.tensSaid = tens
      audio.chord(0.12)
      game.tensAt = sim.time
      // Each ten, in order (a newer one joins one still waiting). In the last stretch the question below
      // carries it instead: "Four tens and 6! Will a raft still fit?" So counting by tens never skips one.
      game.tensQueued = tens
      // (The goal's own ten is said by the ending: "5 tens make 50!")
      if (sim.left > 0 && !asking() && !game.playLines.some((l) => l.key === 'tens')) playSay(tensSoon, 'tens')
    }
    if (game.state === 'play' && asking() && sim.time - (game.tensAt ?? -9) > 3) {
      game.nearSaid = true
      playSay(() => {
        // (Read when said: any ten not yet voiced comes first, even if the question no longer fits.)
        if (sim.left < 3 || sim.left >= 10) return tensLine()
        return `${tensSoFar(sim, '! ') || `${sim.gathered}! `}Will a raft still fit?`
      }, 'near')
    } else if (game.state === 'play' && sim.left > 0 && !asking() && game.tensQueued > game.tensVoiced && !game.playLines.some((l) => ['tens', 'near', 'raft', 'nope'].includes(l.key))) {
      // (A ten left for the question that is no longer asked: said on its own.)
      playSay(tensSoon, 'tens')
    }
    playVoice()
  }
  // Each duck's own count, with no leader highlighted.
  sim.ducks.forEach((d, i) => {
    const el = game.scoreEls?.[i]
    if (!el) return
    if (game.shownScores[i] !== d.score) {
      game.shownScores[i] = d.score
      const b = el.querySelector('b')
      b.innerHTML = tally(d.score)
      b.setAttribute('aria-label', String(d.score))
    }
  })
  idleHint()
  scarceTalk()
  if (sim.calm && sim.jar.length > jar.shown + jar.flying) catchUpJar()
  // My power: its emoji with a ring that runs down.
  const me = game.me
  const p = me?.power
  const el = $('power')
  el.classList.toggle('hidden', !p)
  if (p) {
    $('power-emoji').textContent = POWERS[p].emoji
    $('power-ring').style.strokeDashoffset = String(100 - clamp((me.powerT / POWERS[p].time) * 100, 0, 100))
  }
  if (me) {
    const cool = clamp(me.dashCd / 1.4, 0, 1)
    const dash = $('dash')
    dash.style.setProperty('--cool', cool.toFixed(2))
    if (cool === 0 && game.dashWasCooling) {
      dash.classList.remove('ready')
      void dash.offsetWidth
      dash.classList.add('ready')
    }
    game.dashWasCooling = cool > 0
  }
}

// --- Pond helpers: the shared ten-frame jar ------------------------------------------------------

/**
 * Every bubble the team collects floats up into one shared jar and is counted as it lands. Ten fill a
 * frame ("ten!"), which slides onto the shelf as a group of ten; place value counts on from the tens
 * (10, 20, 21, 22). Landings are spaced out, so every number is heard in order.
 */
const jar = { shown: 0, flying: 0, slid: 0, token: 0, nextLand: 0 }
const FLY_MS = 750
const LAND_GAP = 650 // at least this long between two landings, so counts never pile up
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** A fresh jar for a new goal: a carried place-value step keeps what is already in it. */
function resetJar() {
  jar.shown = game.sim?.calm ? game.sim.jar.length : 0
  jar.flying = jar.slid = 0
  jar.nextLand = 0
  jar.bundled = false
  jar.token++
  for (const el of document.querySelectorAll('.jar-fly')) el.remove()
  $('jar').classList.remove('look')
  renderJar()
}

/** The trip's next goal: the jar shows its spaces (glowing once), and the voice says what to make next. */
function showStage(spoken) {
  const sim = game.sim
  if (!sim?.calm) return
  resetJar()
  lookAtJar()
  if (!spoken) return
  const then = () => later(() => sim === game.sim && sayStuck({ first: true }), 400)
  if (!voice.sayOnce(stageWords(sim.goal, sim.trip[sim.stage - 1]), { onend: then })) then()
  hushFor(4)
  game.dryAt = null
}

/**
 * A free bond's bubbles sit in the frame by colour (all of the first colour, then the second), whatever
 * order they were caught in, so the frame always shows the two parts: 5 green, then 3 pink.
 */
const byPart = (g, tokens) => (g.free ? splitOf(tokens).flatMap(([c, k]) => Array(k).fill(c)) : tokens)

/** A number bond as coloured numbers: 6 + 2, each in its bubbles' colour. */
const wayHtml = (t) => `<span class="way-sum">${t.parts.map(([c, n]) => `<b style="color:${colourOf(c)}">${n}</b>`).join('+')}</span>`

/** How far along the trip the team is: a small dot per goal, the finished ones filled. */
function tripDots(sim) {
  if (sim.trip.length < 2) return ''
  return `<span class="trip-dots">${sim.trip.map((_, k) => `<i class="${k < sim.stage ? 'done' : k === sim.stage ? 'now' : ''}"></i>`).join('')}</span>`
}

function renderJar() {
  const sim = game.sim
  if (!sim?.calm) return
  const g = sim.goal
  if (g.kind === 'tens') return renderTensJar(sim, g)
  // Colour, number-bond and place-value goals: every space knows what it wants; a bubble lands in the first that takes it.
  const shown = byPart(g, sim.jar.slice(0, jar.shown))
  const filled = new Map(placeJar(sim.slots, shown).map((slot, k) => [slot, shown[k]]))
  const place = g.kind === 'place'
  const lay = place ? placeLayout(g) : { tens: 0, bundle: 0, ones: 0 }
  // Level 5 shows only the number: the shelf holds just the rafts caught so far, and the ones frame shows
  // all ten spaces, so how many tens and ones (and how far there is still to go) is the child's to work out.
  const hide = place && g.level >= HIDE_LEVEL
  // Below that, place value shows how far the jar has come as a filling bar with its number (progress,
  // never an "=" to the goal); a free bond shows the ways already made (in their colours), so the
  // children can see which way is new.
  const value = shown.reduce((v, t) => v + (t === TEN ? 10 : 1), 0)
  const now = place && !hide
    ? `<span class="jar-now" title="${value} so far"><i style="width:${Math.round(clamp(value / Math.max(1, goalValue(g)), 0, 1) * 100)}%"></i><b>${value}</b></span>`
    : ''
  const ways = g.free ? `<span class="jar-ways">${sim.trip.slice(0, sim.stage).filter((t) => t.parts).map(wayHtml).join('')}</span>` : ''
  $('jar-goal').innerHTML = tripDots(sim) + (g.kind === 'colour' ? `<span class="swatch" style="--c:${colourOf(g.c)}"></span>`
    // Place value's goal is labelled "make" and drawn in gold, so it never reads like the white number on the progress bar.
    : place ? `<b class="jar-num make"><small>make</small>${goalValue(g)}</b>` : `<b class="jar-num">${goalValue(g)}</b>`) + now + ways
  const raft = (full) => `<span class="ten raft${full ? ' full' : ''}">${full ? '<i></i>'.repeat(10) : ''}</span>`
  // Crossing a ten: ten single bubbles fill the frame, then slide onto the shelf as one ten (their own colours).
  // (No empty place waits on the shelf meanwhile: a raft-shaped gap would invite the raft that is too many.)
  const bundling = lay.bundle && !jar.bundled
  const bundle = lay.bundle && jar.bundled
    ? `<span class="ten full">${Array.from({ length: 10 }, (_, i) => `<i style="--c:${colourOf(filled.get(lay.tens + i))}"></i>`).join('')}</span>`
    : ''
  const tensIn = place ? [...Array(lay.tens).keys()].filter((k) => filled.has(k)).length : 0
  // "One more than": the colour before sits beside the frame as a row of dots, so the two can be compared.
  const before = g.more ? sim.trip[sim.stage - 1] : null
  $('jar-tens').innerHTML = before ? `<span class="jar-compare" aria-hidden="true">${`<i style="--c:${colourOf(before.c)}"></i>`.repeat(before.n)}</span>`
    : !place ? ''
    : hide ? raft(true).repeat(tensIn) + bundle
    : Array.from({ length: lay.tens }, (_, k) => raft(filled.has(k))).join('') + bundle
  const base = bundling ? lay.tens : lay.ones
  const open = hide || bundling ? 10 : place ? g.ones : sim.slots.length
  // A free bond marks where the ways already made split the frame (a dashed line after the 6th space
  // for 6 + 2, and after the 2nd), so a careful child can plan a split that is new.
  const cuts = new Set(g.free ? sim.used.flatMap((w) => w.split('+').map(Number)).filter((k) => k > 0 && k < g.n) : [])
  const cells = []
  for (let i = 0; open && i < 10; i++) {
    const want = sim.slots[base + i]
    const full = filled.has(base + i)
    const ring = Number.isInteger(want) ? colourOf(want) : '#ffffff'
    cells.push(`<span class="cell${i < open ? '' : ' spare'}${full ? ' full' : ''}${cuts.has(i + 1) ? ' cut' : ''}" style="--c:${full ? colourOf(filled.get(base + i)) : 'transparent'};--ring:${ring}"></span>`)
  }
  $('jar-frame').innerHTML = cells.join('')
  // Tens first: the ones frame waits, dimmed, until every raft is in.
  $('jar-frame').classList.toggle('waiting', place && sim.open.includes('ten'))
  $('jar').setAttribute('aria-label', `Team jar: ${jar.shown} of ${sim.target} spaces filled, to make ${goalValue(g)}`)
}

/** One ten (or more): a frame of ten any-colour spaces; each full frame slides onto the shelf as a ten. */
function renderTensJar(sim, g) {
  if (g.rows) return renderRowsJar(sim, g)
  $('jar-goal').innerHTML = ''
  $('jar-tens').innerHTML = Array.from({ length: g.n }, (_, k) => {
    const full = k < jar.slid
    const dots = full ? sim.jar.slice(k * 10, k * 10 + 10).map((c) => `<i style="--c:${colourOf(c)}"></i>`).join('') : ''
    return `<span class="ten${full ? ' full' : ''}" data-k="${k}">${dots}</span>`
  }).join('')
  const base = jar.slid * 10
  const inFrame = jar.shown - base
  const cells = []
  for (let i = 0; i < 10; i++) {
    const full = i < inFrame
    cells.push(`<span class="cell${full ? ' full' : ''}" style="--c:${full ? colourOf(sim.jar[base + i]) : 'transparent'};--ring:#ffffff"></span>`)
  }
  $('jar-frame').innerHTML = cells.join('')
  $('jar-frame').classList.remove('waiting')
  $('jar').setAttribute('aria-label', `Team jar: ${jar.shown} of ${g.n * 10}, ${plural(jar.slid, 'ten')} full`)
}

/**
 * One ten as two rows of five: the top row's spaces ring in one colour and the bottom row's in the other,
 * and each bubble sits in its own colour's row, so the frame shows "5 and 5" as it fills.
 */
function renderRowsJar(sim, g) {
  const shown = sim.jar.slice(0, jar.shown)
  const filled = new Map(placeJar(sim.slots, shown).map((slot, k) => [slot, shown[k]]))
  $('jar-goal').innerHTML = ''
  $('jar-tens').innerHTML = jar.slid ? `<span class="ten full">${sim.slots.map((_, i) => `<i style="--c:${colourOf(filled.get(i))}"></i>`).join('')}</span>` : ''
  $('jar-frame').innerHTML = jar.slid ? '' : sim.slots
    .map((want, i) => `<span class="cell${filled.has(i) ? ' full' : ''}" style="--c:${filled.has(i) ? colourOf(filled.get(i)) : 'transparent'};--ring:${colourOf(want)}"></span>`)
    .join('')
  $('jar-frame').classList.remove('waiting')
  $('jar').setAttribute('aria-label', `Team jar: ${jar.shown} of 10, ${rowWords(g)}`)
}

/** Missed events or a late join: show the jar as it is, without animation. */
function catchUpJar() {
  const sim = game.sim
  if (!sim?.calm) return
  jar.shown = Math.max(0, sim.jar.length - jar.flying)
  if (sim.goal.kind === 'tens') jar.slid = Math.min(sim.goal.n, Math.floor(jar.shown / 10))
  if (sim.goal.regroup) jar.bundled = jar.shown >= placeLayout(sim.goal).ones
  renderJar()
}

/** Where the jar's `index`th bubble lands: its space in the frame, or a raft's place on the shelf. */
function jarSpace(index) {
  const sim = game.sim
  const g = sim.goal
  if (g.kind === 'tens' && g.rows) return $('jar-frame').children[placeJar(sim.slots, sim.jar.slice(0, index + 1))[index]] ?? null
  if (g.kind === 'tens') return $('jar-frame').children[index % 10]
  if (g.free) {
    // Its place among its own colour: after every bubble of the colours that came first.
    const t = sim.jar[index]
    let at = -1
    for (const [c, k] of splitOf(sim.jar.slice(0, index + 1))) {
      at += k
      if (c === t) break
    }
    return $('jar-frame').children[Math.min(9, Math.max(0, at))]
  }
  const slot = placeJar(sim.slots, sim.jar.slice(0, index + 1))[index]
  if (slot == null || slot < 0) return null
  if (g.kind === 'place') {
    // A bundle space and a ones space sit in the same frame cell (the bundle slides away first).
    const lay = placeLayout(g)
    if (slot >= lay.tens) return $('jar-frame').children[(slot - lay.tens) % 10]
    const shelf = $('jar-tens').children
    return shelf[Math.min(slot, shelf.length - 1)] ?? $('jar-goal')
  }
  return $('jar-frame').children[slot]
}

/**
 * A collected bubble (or raft) floats from the duck up into its space in the jar, and is counted when it
 * lands. It rises from below the jar, so it never spills over the top of the screen, and a raft turns
 * upright to fit its shelf place.
 */
function jarDrop(e, y) {
  const sim = game.sim
  const token = jar.token
  const index = jar.shown + jar.flying
  if (index >= sim.target) return
  jar.flying++
  const land = () => {
    if (token !== jar.token || game.sim !== sim) return
    jar.flying = Math.max(0, jar.flying - 1)
    jar.shown = Math.min(sim.jar.length, jar.shown + 1)
    jar.landedAt = performance.now()
    renderJar()
    countAloud()
  }
  const now = performance.now()
  const cell = jarSpace(index)
  const still = reducedMotion() || !cell || !document.body.animate
  const landAt = Math.max(now + (still ? 0 : FLY_MS), jar.nextLand + LAND_GAP)
  jar.nextLand = landAt
  if (still) return later(land, landAt - now)
  const from = new THREE.Vector3(e.x, y, e.z).project(camera)
  const sx = ((from.x + 1) / 2) * innerWidth
  const sy = ((1 - from.y) / 2) * innerHeight
  const r = cell.getBoundingClientRect()
  const tx = r.left + r.width / 2
  const ty = r.top + r.height / 2
  const raft = e.c === TEN
  const dot = document.createElement('div')
  dot.className = raft ? 'jar-fly raft' : 'jar-fly'
  dot.style.setProperty('--c', colourOf(e.c))
  document.body.append(dot)
  const midY = Math.max(ty + 70, (sy + ty) / 2)
  const turn = raft ? ' rotate(90deg)' : ''
  const anim = dot.animate(
    [
      { transform: `translate(${sx}px, ${sy}px) scale(1.4)` },
      { transform: `translate(${(sx + tx) / 2}px, ${midY}px) scale(1.15)`, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) scale(1)${turn}` },
    ],
    { duration: landAt - now, easing: 'ease-in-out' },
  )
  anim.onfinish = () => {
    dot.remove()
    land()
  }
}

/**
 * Each landing gets a soft rising note, and the voice says only what teaches, never skipping or going
 * backwards: numbers to ten while filling the first ten; a colour counted to five, then its total; each
 * bond part counted with its colour ("2 pink") when it is five or less, or named whole when it fills
 * ("7 pink!"); place value counted on from the tens ("10, 20, 21, 22"). A finished goal mid-trip says
 * what it made. Counts wait their turn (landings are spaced), so every number is heard in order.
 */
function countAloud() {
  const sim = game.sim
  const g = sim.goal
  const n = jar.shown
  const say = (text) => voice.say(text)
  const done = n >= sim.target
  if (g.kind === 'tens') {
    const within = n - Math.floor((n - 1) / 10) * 10
    audio.bubble(within - 1)
    if (within < 10) return voice.count(within, { aloud: n <= 10 ? 10 : 0, interrupt: false })
    const k = n / 10
    audio.chord(0.15)
    say(k === 1 ? 'Ten!' : `${k} tens!`)
    const token = jar.token
    later(() => token === jar.token && slideTen(k - 1), 650)
    return
  }
  const at = placeJar(sim.slots, sim.jar.slice(0, n))
  const slot = at[n - 1]
  if (g.kind === 'colour') {
    audio.bubble(n - 1)
    if (done) say(`${n} ${colourName(g.c)}!`)
    else if (game.countOn) voice.count(n, { interrupt: false })
  } else if (g.kind === 'bond' && g.free) {
    // The children's own way: soft notes while it fills, then what they made ("5 pink and 3 blue make 8!").
    audio.bubble((n - 1) % 10)
  } else if (g.kind === 'bond') {
    const [[a, x], [b, y]] = g.parts
    const first = slot < x
    const size = first ? x : y
    const k = at.filter((sl) => sl >= 0 && (first ? sl < x : sl >= x)).length
    audio.bubble(k - 1 + (first ? 0 : 3))
    const colour = colourName(first ? a : b)
    if (!game.countOn) {
      // A trip already heard at this level: the picture counts, and the made line says the bond.
    } else if (k === size) {
      // The landing that completes the bond says the whole bond once (madeWords, now or on the results).
      if (!done) say(`${k} ${colour}!`)
    }
    else if (size <= COUNT_ALOUD) say(`${k} ${colour}`)
  } else {
    // Count on from the tens: each raft adds ten, each single bubble one (a full bundle is ten of them).
    const lay = placeLayout(g)
    const tensIn = at.filter((sl) => sl >= 0 && sl < lay.tens).length
    const singles = at.filter((sl) => sl >= lay.tens).length
    if (slot < lay.tens) audio.chord(0.05)
    else audio.bubble((singles - 1) % 10)
    const value = tensIn * 10 + singles
    if (lay.bundle && slot < lay.ones && singles === 10) {
      // Regrouping: the tenth single fills the frame, and the frame slides onto the shelf as one ten.
      audio.chord(0.15)
      // A raft the child broke on this step is named here, at the bundling moment, as the same idea backwards
      // (once a trip; after that the shorter line).
      const fold = game.splitStage === sim.stage
      if (fold) game.splitStage = -1
      voice.sayOnce(fold ? `${value}! A ten became ten ones, and ten ones make one ten again!` : `${value}! Ten ones make one ten!`)
      game.regroupAt = performance.now()
      const token = jar.token
      later(() => token === jar.token && slideFrame(lay.tens, () => { jar.bundled = true }), 400)
    } else if (game.countOn && sim.stage === 0 && value <= 10) say(String(value))
    // (Counting aloud stays within the first ten: past it the soft notes and the jar's bar carry the count.)
    // Later steps and later trips count with soft notes and the jar's own number; the voice stays quiet.
  }
  // A raft broken on this step whose bubbles finished it: named now, before what comes next.
  if (done && game.splitToTell) tellSplit()
  // (A colour's count already ends with its total, "5 green!", and a carried step's was just said: "Now 10 more. Make 36!")
  if (done && sim.stage < sim.trip.length - 1 && g.kind !== 'colour' && !g.carry) {
    audio.chord(0.1)
    say(madeWords(g))
  }
}

/** Pond helpers: a child broke a raft for its ones (said once a round). */
function tellSplit() {
  game.splitToTell = false
  voice.sayOnce('One ten is ten ones!')
}

/** The full frame moves onto the shelf as one group of ten, and an empty frame waits for more. */
function slideTen(k) {
  if (jar.slid > k) return
  slideFrame(k, () => { jar.slid = k + 1 })
}
/** Slides a picture of the full frame onto shelf place `k`; `mark` records that it moved, before the jar redraws. */
function slideFrame(k, mark) {
  const frame = $('jar-frame')
  const from = frame.getBoundingClientRect()
  const ghost = frame.cloneNode(true)
  mark()
  renderJar()
  const slot = $('jar-tens').children[k]
  if (reducedMotion() || !slot || !document.body.animate || game.state !== 'play') return
  const to = slot.getBoundingClientRect()
  // A hidden jar (the round just ended, or the HUD is away) has no size to slide between.
  if (!from.width || !from.height || !to.width || !to.height) return
  slot.classList.add('arriving')
  ghost.removeAttribute('id')
  ghost.className = 'jar-frame jar-ghost'
  ghost.style.left = `${from.left}px`
  ghost.style.top = `${from.top}px`
  ghost.style.width = `${from.width}px`
  ghost.style.height = `${from.height}px`
  document.body.append(ghost)
  const anim = ghost.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${to.width / from.width}, ${to.height / from.height})`, opacity: 0.6 },
    ],
    { duration: 700, easing: 'ease-in-out' },
  )
  anim.onfinish = () => {
    ghost.remove()
    slot.classList.remove('arriving')
  }
}

let bannerTimer = 0
function banner(text, ms = 1300, big = false) {
  const el = $('banner')
  el.textContent = text
  el.classList.toggle('big', big)
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

// --- Results --------------------------------------------------------------------------------

/** Every duck in player order, never ranked. */
function standings() {
  const sim = game.sim
  return game.setup.entries.map((e, i) => ({ ...e, score: sim.ducks[i].score, stats: sim.ducks[i].stats ?? newStats(), i }))
}

/**
 * Pond helpers' ending: no medals. The jar is shown again and lit step by step with soft notes and
 * its numbers (10, 20, 21, 22, 23), then one sentence says what the bubbles made, and each duck gets
 * a kind note about how it helped.
 */
function renderTeamResults() {
  const sim = game.sim
  const g = sim.goal
  const self = game.room.selfId
  const shown = byPart(g, sim.jar.slice(0, sim.target))
  const filled = new Map(placeJar(sim.slots, shown).map((slot, k) => [slot, shown[k]]))
  const cell = (slot, ring, label = '') =>
    `<span class="cell${filled.has(slot) ? ' full' : ' spare'}" data-n="${label}" style="--c:${filled.has(slot) ? colourOf(filled.get(slot)) : 'transparent'};--ring:${ring}"></span>`
  const frame = (from, open, ring, label) =>
    `<div class="team-ten"><span class="jar-frame">${Array.from({ length: 10 }, (_, i) => (i < open ? cell(from + i, ring(from + i), label(i)) : '<span class="cell spare"></span>')).join('')}</span></div>`
  const bar = (k, dots, label) => `<div class="team-ten bar"><span class="ten full${g.kind === 'place' ? ' raft' : ''}">${dots}</span><b>${label}</b></div>`
  let jarHtml
  if (g.kind === 'tens' && g.rows) jarHtml = bar(0, sim.slots.map((_, i) => `<i style="--c:${colourOf(filled.get(i))}"></i>`).join(''), 10)
  else if (g.kind === 'tens') jarHtml = Array.from({ length: g.n }, (_, k) => bar(k, shown.slice(k * 10, k * 10 + 10).map((c) => `<i style="--c:${colourOf(c)}"></i>`).join(''), (k + 1) * 10)).join('')
  else if (g.kind === 'place') {
    // Rafts, then the ten made from single bubbles when the trip crossed a ten (in their own colours), then the ones.
    const lay = placeLayout(g)
    const at = placeJar(sim.slots, shown)
    const bundle = shown.filter((_, k) => at[k] >= lay.tens && at[k] < lay.ones)
    jarHtml = Array.from({ length: lay.tens }, (_, k) => bar(k, '<i></i>'.repeat(10), (k + 1) * 10)).join('') +
      (lay.bundle ? `<div class="team-ten bar"><span class="ten full">${bundle.map((c) => `<i style="--c:${colourOf(c)}"></i>`).join('')}</span><b>${g.tens * 10}</b></div>` : '') +
      (g.ones ? frame(lay.ones, g.ones, () => '#ffffff', (i) => g.tens * 10 + i + 1) : '')
  }
  else jarHtml = frame(0, sim.target, (slot) => colourOf(sim.slots[slot]), (i) => i + 1)
  const helpers = game.setup.entries
    .map((e, i) => {
      const d = sim.ducks[i]
      const n = d?.score ?? 0
      const name = duckName(e.duck)
      // Each duck's part as a kind note, never a number to compare (the jar above is the team's count):
      // the child's own row is marked only by its ⬅️.
      const note = n > 0 ? `${e.id === self ? 'You' : name} helped` : `${name} cheered the team on`
      return `<div class="helper">${duckPicture(e.duck)}<span class="tag">${escapeHtml(e.emoji)}${e.id === self ? ' ⬅️' : ''}</span>
        <span class="note">${note}</span><span class="helps" aria-hidden="true">${n > 0 ? '🫧' : '💛'}</span></div>`
    })
    .join('')
  const pond = ARENAS[game.arena]
  // The whole trip in one line: three ways to make 9 as pictures, or 23 → 33 → 35.
  const trip = sim.trip
  const tripHtml = trip.length < 2 ? ''
    : g.kind === 'place' ? trip.map((t) => `<b>${goalValue(t)}</b>`).join('<span class="arrow">→</span>')
    : trip.map((t) => `<span class="way">${goalPicture(t)}</span>`).join('')
  $('team').innerHTML = `<div class="team-jar${g.kind === 'tens' || g.kind === 'place' ? '' : ' colour'}">${jarHtml}</div>
    <div class="team-total" aria-live="polite"></div>
    ${tripHtml ? `<div class="team-trip" aria-label="${escapeHtml(tripLabel(trip))}">${tripHtml}</div>` : ''}
    <div class="pond" style="--pond:${pond.water.shallow};--deep:${pond.water.deep}">${helpers}</div>`
  // The count-up: each ten, then each single bubble, lights in turn with a soft rising note and its number.
  const steps = [...$('team').querySelectorAll('.team-ten.bar, .cell.full')]
  const gap = steps.length > 6 ? 450 : 650
  const run = jar.token
  steps.forEach((el, k) =>
    later(() => {
      if (run !== jar.token) return
      el.classList.add('lit')
      audio.bubble(Math.min(k, 12))
    }, 500 + k * gap),
  )
  const v = goalValue(g)
  // Three ways to make a number are read out one by one ("4 and 3. 5 and 2. 6 and 1."), so a child who
  // can't read the sums yet hears them too.
  const read = trip.filter((t) => t.parts).map((t) => `${t.parts[0][1]} and ${t.parts[1][1]}.`).join(' ')
  const ways = trip.length > 2 ? ` ${read} ${['', 'One', 'Two', 'Three'][trip.length]} ways to make ${v}!` : ''
  const [total, summary] =
    g.kind === 'tens' && g.rows ? [`5 + 5 = 10 🫧`, `${rowWords(g)} make one ten!`]
    : g.kind === 'tens' ? [`${'🔟 '.repeat(g.n)}= ${v} 🫧`, g.n === 1 ? 'Ten bubbles make one ten!' : `${g.n} tens make ${v}!`]
    : g.kind === 'colour' ? [trip.map((t) => `${t.n} ${colourName(t.c)}`).join(' + ') + ' 🫧', `We found ${listWords.format(trip.map((t) => `${t.n} ${colourName(t.c)}`))} bubbles!${g.more ? ` ${g.n} is one more than ${g.n - 1}!` : ''}`]
    : g.kind === 'bond' ? [trip.map((t) => (t.parts ? `${t.parts[0][1]} + ${t.parts[1][1]}` : '')).filter(Boolean).join(' = ') + ` = ${v}`, ways ? ways.trim() : madeWords(g)]
    : [`${plural(g.tens, 'ten')}${g.ones ? ` + ${g.ones}` : ''} = ${v}`, madeWords(g)]
  later(() => {
    if (run !== jar.token) return
    $('team').querySelector('.team-total').textContent = total
    audio.chord()
    voice.say(summary)
  }, 700 + steps.length * gap)
}

function renderResults() {
  if (!game.setup || !game.sim) return
  const calm = game.sim.calm
  $('results-title').textContent = calm ? '🫧 Well done, team! 🫧' : `🫧 ${game.sim.playGoal} together! 🫧`
  $('podium').classList.toggle('hidden', calm)
  $('team').classList.toggle('hidden', !calm)
  // Everyone can tap Again (a friend's tap asks the host); only the host picks a new place.
  // In Pond helpers the host's Again shows the next goal the jar will ask for.
  $('again').classList.remove('asked')
  // Bumper play's Again shows the team's next goal (it grows with the child: 50, 70, then 47).
  $('again').innerHTML = !isHost() ? '🔁 Again!'
    : calm ? `▶ <span class="next-pic" aria-hidden="true">${tripPicture(game.trip)}</span>`
    : `▶ <span class="next-pic" aria-hidden="true"><b class="mini-num">${game.playGoal}</b></span>`
  $('again').setAttribute('aria-label', !isHost() ? 'Again' : calm ? `Next: ${tripLabel(game.trip)}` : `Next: make ${game.playGoal} together`)
  $('change').classList.toggle('hidden', !isHost())
  if (calm) return renderTeamResults()
  const rows = standings()
  const self = game.room.selfId
  // Bumper play's ending: no medals, places, titles or per-duck totals to compare, the child's own
  // included. The team's tens and ones on top (the sum that was said), then each duck as a kind note.
  const goal = game.sim.playGoal
  const total = Math.min(goal, rows.reduce((n, r) => n + r.score, 0))
  const helpers = game.setup.entries
    .map((e, i) => {
      const n = game.sim.ducks[i]?.score ?? 0
      const me = e.id === self
      const note = n > 0 ? `${me ? 'You' : duckName(e.duck)} helped` : `${me ? 'You' : duckName(e.duck)} cheered the team on`
      return `<div class="helper">${duckPicture(e.duck)}<span class="tag">${escapeHtml(e.emoji)}${me ? ' ⬅️' : ''}</span>
        <span class="note">${note}</span></div>`
    })
    .join('')
  const pond = ARENAS[game.arena]
  $('podium').innerHTML = `<div class="team-sum"><span class="team-tally">${teamTally(total, goal)}</span><b>${tensWords(total)} = ${total}</b></div>
    <div class="pond" style="--pond:${pond.water.shallow};--deep:${pond.water.deep}">${helpers}</div>`
}
/** 71 as "7 tens and 1 one". */
function tensWords(n) {
  const t = Math.floor(n / 10)
  const o = n % 10
  return t && o ? `${plural(t, 'ten')} and ${plural(o, 'one')}` : t ? plural(t, 'ten') : plural(o, 'one')
}

// --- Main loop -------------------------------------------------------------------------------

let accumulator = 0
let last = performance.now()
const camShake = new THREE.Vector3()

/** The child at this device steers their own duck: screen right is +X, screen down is +Z. */
function readMyInput() {
  const me = game.me
  if (!me) return
  const playing = game.state === 'play' && !game.sitOut
  const { x, y } = playing ? input.read() : { x: 0, y: 0 }
  me.ix = x
  me.iz = y
  if (playing && Math.hypot(x, y) > 0.3) {
    game.lastSteer = game.sim.time
    if (game.hinted) for (const id of ['hint', 'keys-hint']) $(id).classList.add('hidden')
  }
  if (playing && Math.hypot(x, y) > 0.3 && !game.hinted && !game.hintHiding && game.sim.time > 1.2) {
    game.hintHiding = true
    later(hideHint, 1200)
  }
  if (input.takeDash() && playing) {
    if (game.sim.dash(me)) {
      playEvent({ k: 'dash', id: me.id })
      if (!isHost()) send({ t: 'dash', r: roundId() })
    }
  }
}

function step(dt) {
  const sim = game.sim
  const host = isHost()
  readMyInput()
  if (game.state !== 'play') {
    // Waiting to start or showing the end: ducks drift and bob, nobody paddles, the clock stands still.
    for (const d of sim.ducks) d.ix = d.iz = 0
    const time = sim.time
    sim.step(dt, false)
    sim.time = time
    return
  }
  if (host && game.bots.size) {
    let kids = -1
    let napping = sim.time > 3
    // Pond helpers: the child leads and does the choosing. The robots fetch only while they hold under a
    // quarter of the jar, and point a bubble out only when the child seems stuck (two bubbles in a row that
    // didn't fit, or 25 s without one that did).
    let botHelps = 0
    let kidHelps = 0
    for (const d of sim.ducks) {
      if (game.bots.has(d.id)) {
        botHelps += d.score
        continue
      }
      kidHelps += d.score
      kids = Math.max(kids, d.score)
      if (Math.hypot(d.ix, d.iz) > 0.1 || d.dashT > 0) game.childActive = sim.time
    }
    // Every child has stopped paddling: the robots float and nap until someone paddles again.
    napping = napping && kids >= 0 && sim.time - (game.childActive ?? 0) > NAP_AFTER
    // A free bond's colours are the children's choice, so the robots leave it to them (unless they seem stuck).
    // Bumper play: the last ten is the children's to count (the robots leave the ones to them unless no
    // child has gathered one for 20 s), and a robot never gets more than a few ahead (see Bot.update).
    // Bumper play also keeps the robots to about a third of the team's bubbles, so the children's own
    // choices (rafts early, ones late) are what bring the goal home, and wandering play takes longer.
    const helpedEnough = sim.calm ? botHelps * 3 >= kidHelps || !!sim.goal?.free : sim.left < 12 || botHelps * 2 > kidHelps + 6
    const help = sim.calm ? game.kidMiss >= 2 || sim.time - game.lastKidCatch > 25 : sim.time - game.lastKidCatch > 20
    for (const bot of game.bots.values()) bot.update(sim, dt, kids < 0 ? 0 : bot.duck.score - kids, napping, helpedEnough, help)
    if (napping && sim.time - (game.lastZzz ?? -9) > 2.2) {
      game.lastZzz = sim.time
      const e = { k: 'zzz', ids: [...game.bots.keys()] }
      playEvent(e)
      outbox.push(e)
    } else if (!napping && game.lastZzz > 0) {
      game.lastZzz = -9
      const e = { k: 'wake', ids: [...game.bots.keys()] }
      playEvent(e)
      outbox.push(e)
    }
  }
  // Between a trip's goals: the next goal waits until every bubble still floating up has landed (and been
  // heard), so a quick burst of catches is never cut off by the next goal's words.
  if (host && sim.calm && sim.between != null && jar.flying > 0) sim.between = Math.max(sim.between, sim.time - (STAGE_PAUSE - 1.2))
  sim.step(dt, host)
  if (host) {
    for (const e of sim.events) {
      playEvent(e)
      if (e.k !== 'end') outbox.push(e)
    }
    sim.events.length = 0
  }
}

function sendNet(now) {
  if (game.room.solo || !game.sim) return
  const r = roundId()
  if (isHost()) {
    if (outbox.length) send({ t: 'ev', r, e: flushEvents() })
    if (game.state === 'play' || game.state === 'countdown') {
      if (now - game.lastSend > 50) {
        game.lastSend = now
        send({ t: 's', r, ...game.sim.snapshot() }, { fast: true })
      }
      if (now - game.lastSync > 2000) {
        game.lastSync = now
        const f = game.sim.frogs
        send({ t: 'st', r, items: game.sim.itemList(), stats: game.sim.ducks.map((d) => d.stats), ...(game.sim.calm ? { jar: game.sim.jar, stage: game.sim.stage, frogs: f ? [f.n, f.next] : null } : {}) })
      }
    }
  } else if (game.me && game.state === 'play') {
    const key = `${game.me.ix.toFixed(2)},${game.me.iz.toFixed(2)}`
    if (key !== game.sentInput || now - game.lastInput > 250) {
      if (now - game.lastInput > 50) {
        game.sentInput = key
        game.lastInput = now
        send({ t: 'in', r, x: +game.me.ix.toFixed(2), z: +game.me.iz.toFixed(2) }, { fast: true })
      }
    }
  }
}

function tick(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
  last = Math.max(last, now)
  const t = now / 1000
  if (game.sim) {
    accumulator += dt
    let steps = 0
    while (accumulator >= STEP && steps < 6) {
      step(STEP)
      accumulator -= STEP
      steps++
    }
    if (steps === 6) accumulator = 0
    for (const d of game.sim.ducks) game.views.get(d.id)?.update(d, t, dt, effects)
    for (const [id, v] of game.items) {
      const it = game.sim.items.get(id)
      if (it) v.follow(it.x, it.z, dt, liftOf(it))
      v.update(t, dt, effects)
    }
    // Frog order: each frog shows its number, green once it has its place in the line.
    // (Only while playing: on the results the answer's own numbers are the only ones to see.)
    const f = game.state === 'play' ? game.sim.frogs : null
    // (A frog holding the stuck bubble or raft lifts its sign higher, so what it holds stays in view; one
    // with a raft floating just behind it, where the camera sees the sign over the raft, moves it aside.)
    const held = f ? new Set([...game.sim.items.values()].map((it) => it.stuck)) : null
    const aside = (ob) => {
      const r = [...game.sim.items.values()].find((it) => it.k === 'ten' && it.stuck == null && Math.abs(it.x - ob.x) < 2.2 && it.z < ob.z - 0.3 && it.z > ob.z - 4)
      return r ? (r.x > ob.x ? -1 : 1) : 0
    }
    game.obstacles.forEach((o, i) => {
      const high = !!held?.has(i)
      o.sign(f?.n[i] ?? null, !!f && f.order.indexOf(i) < f.next && f.order.includes(i), high, f && !high ? aside(game.sim.obstacles[i]) : 0)
    })
    for (const o of game.obstacles) o.update(t, dt)
    updateHud()
    sendNet(now)
  }
  game.rain?.update(dt, (x, z) => {
    effects.rainOn(x, z)
    if (Math.random() < 0.2) water.ripple(x, z, 0.15)
  })
  water.update(t)
  effects.update(dt)
  audio.updateMusic(game.state !== 'loading')
  // Camera: a gentle sway, and a shake on big bonks.
  const sh = effects.shake * effects.shake * 0.6
  camShake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0)
  const idle = !game.sim ? Math.sin(t * 0.2) * 1.5 : 0
  camera.position.set(camBase.x + camShake.x + idle, camBase.y + camShake.y, camBase.z)
  camera.lookAt(camTarget.x + camShake.x * 0.5 + idle * 0.5, camTarget.y, camTarget.z)
  renderer.render(scene, camera)
}

function frame(now) {
  tick(now)
  requestAnimationFrame(frame)
}

// --- Buttons, keys and sound --------------------------------------------------------------------

const input = new Input({
  stick: $('stick'),
  knob: $('knob'),
  dashButton: $('dash'),
  enabled: () => game.state === 'play' && !game.sitOut,
})

$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.click()
  abortToLobby()
})
addEventListener('keydown', (e) => {
  audio.unlock()
  if (e.key === 'Escape' && ['play', 'countdown', 'syncing', 'ending', 'results'].includes(game.state)) $('home').click()
  if (e.key.toLowerCase() === 'm' && !e.repeat) $('music').click()
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
    if (game.state === 'menu') hostStartRound()
    else if (game.state === 'results') askAgain()
  }
})
addEventListener('pointerdown', () => audio.unlock(), { capture: true })

const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  voice.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
  save('sound', on ? '1' : '0')
}
if (load('sound') === '0') setSound(false)
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
  save('music', on ? '1' : '0')
}
if (load('music') === '0') setMusic(false)
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setMusic(!audio.musicOn)
  audio.click()
})
// Stop pinch-zoom and double-tap zoom on iPad.
for (const ev of ['gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

// --- Boot -------------------------------------------------------------------------------------

/** The multiplayer SDK, or playing alone with robots if it can't be reached. */
async function openRoom() {
  try {
    const { joinRoom } = await import('https://bitgames.store/vendor/bitgames/multiplayer-1.js')
    return await joinRoom({ maxPlayers: MAX_PLAYERS })
  } catch (err) {
    console.warn('Multiplayer unavailable, playing alone:', err)
    const listeners = () => {}
    return { selfId: 'solo', isHost: true, code: '', solo: true, peers: [], on: () => listeners, send() {}, leave() {} }
  }
}

async function boot() {
  buildMenu()
  show('loading')
  const models = withRetry(loadModels).then(() => {
    renderThumbs()
    game.assetsReady = true
  })
  const room = openRoom().then(setupRoom)
  await models
  buildArena(game.arena)
  await room
  requestAnimationFrame(frame)
  if (DEBUG && params.get('arena')) {
    game.arena = validArena(params.get('arena')) ? params.get('arena') : game.arena
    game.state = 'menu'
    hostStartRound()
  } else enterLobbyScreen()
  for (const [msg, from] of game.queue.splice(0)) onMessage(msg, from)
}

let fakeNow = 0
if (DEBUG) {
  window.__ducks = {
    game, THREE, scene, camera, input, effects, audio, standings, renderResults, endRound,
    /** Runs whole frames (with networking) at a fake clock, for tests in a hidden tab. */
    tick(ms) {
      fakeNow = Math.max(fakeNow, performance.now())
      fakeNow += ms
      tick(fakeNow)
    },
    /** Runs `seconds` of game time now (no drawing). */
    sim(seconds) {
      for (let i = Math.round(seconds / STEP); i > 0; i--) step(STEP)
    },
  }
}

boot()
