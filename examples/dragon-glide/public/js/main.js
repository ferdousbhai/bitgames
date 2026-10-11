import { createAdventure } from './adventure.js'
import { createVoice } from './speech.js'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { Course, GEMS } from './course.js'
import { Dragon } from './dragon.js'
import { TOP_LEVEL, TREASURES, bestKinds, countChoices, countOf, goalDone, goalSentence, learnedSentence, makeGoal, moreWords, neededWords, ruleReachable, sortedRows, stillWanted, treasureSVG } from './goals.js'
import { nestPuzzle } from './nest.js'
import { Particles, Popups, Rings } from './effects.js'
import { loadModels } from './models.js'
import { NEST_Y, World } from './world.js'
import { WORLDS, WORLD_LENGTH, worldAt } from './worlds.js'

const $ = (id) => document.getElementById(id)
const rand = THREE.MathUtils.randFloat
const { clamp, damp } = THREE.MathUtils
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const easeStep = (rate, dt) => 1 - Math.exp(-rate * dt)
const stillMotion = matchMedia('(prefers-reduced-motion: reduce)')

// --- Saved bits (private windows may refuse storage, so everything is guarded) ---------

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

// --- Renderer, scene, camera ------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.35
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900)

// Tablets that can't keep up lose resolution, not frame rate.
const quality = { level: 2, frames: 0, time: 0 }
function applyQuality() {
  renderer.setPixelRatio(quality.level === 2 ? Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 0.8)
  resize()
}
function measureQuality(dt) {
  if (quality.level === 0 || game.state !== 'play') return
  quality.frames++
  quality.time += dt
  if (quality.time < 3) return
  const fps = quality.frames / quality.time
  quality.frames = quality.time = 0
  if (fps < 42) {
    quality.level--
    world.density = quality.level === 1 ? 0.75 : 0.55
    applyQuality()
  }
}

/** Where Ember may fly: narrower when the screen is held upright. */
const lane = { x: 5.5, yMin: 0.6, yMax: 8.4 }
const view = { back: 9.5, portrait: false }
function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  view.portrait = camera.aspect < 1
  camera.fov = view.portrait ? 74 : camera.aspect < 1.4 ? 66 : 60
  camera.updateProjectionMatrix()
  lane.x = view.portrait ? 3.2 : camera.aspect < 1.4 ? 4.4 : 5.5
  view.back = view.portrait ? 8 : 7.6
  const hpx = h * renderer.getPixelRatio()
  sparks?.setScale(hpx, camera.fov)
  dots?.setScale(hpx, camera.fov)
}
addEventListener('resize', resize)

// --- Game state -----------------------------------------------------------------------

const sound = new Sound()
const game = {
  state: 'loading', // loading | title | play | nest | results
  z: 0, // distance flown
  speed: 0,
  slow: 1,
  gemCombo: 0, // gems in a row walk round a five-note scale (never a score)
  gemComboT: 0,
  invuln: 0,
  world: 0,
  startWorld: 0,
  nestT: 0,
  time: 0,
  fireCd: 0,
  shake: 0,
  flapT: 0,
  tipT: 0,
  fired: 0,
  steered: 0,
  done: new Set(store.get('dragon-glide-worlds', [])),
  goal: null, // this world's purpose: { goal, reached, got, slips, misses, wrongRun } (see worlds.js and goals.js)
  learned: [], // what each world of this trip brought home, for the nest and the end card
  // One level per kind of goal (ring worlds count; gathering worlds sort): 0 easier, 1 stretch
  // (counting down, by twos, two kinds at once), 2 challenge (counting on, by threes or fives,
  // "more pink than blue"). It moves after each world from how carefully the child chose, never as a gate.
  levels: loadLevels(),
}

function loadLevels() {
  const saved = store.get('dragon-glide-level', 0)
  const fit = (n) => (Number.isInteger(n) ? clamp(n, 0, TOP_LEVEL) : 0)
  // older saves kept one number for both
  return typeof saved === 'object' && saved ? { rings: fit(saved.rings), gather: fit(saved.gather) } : { rings: fit(saved), gather: fit(saved) }
}
if (new URLSearchParams(location.search).has('debug')) window.game = game

// One voice for the game: words said with `queue` wait their turn, others replace what is being said.
const voice = createVoice({ muted: sound.muted, rate: 0.85, pitch: 1 })

// Optional learning missions: a slower flight, or counting the plain cloud rings (four in each gathering world).
// The numbered-ring worlds are a counting lesson of their own, so there the mission rests (missionFits):
// its "1, 2, 3" would talk over the numbers being flown.
const adventure = createAdventure({
  id: 'dragon-glide',
  anchor: $('play'),
  hud: $('hud'),
  voice,
  // a quiet acknowledgement: the chip's four rings are lit, one soft chime, and the words are said once
  celebrate: () => sound.counted(),
  options: [
    { emoji: '🐉', label: 'Free flight' },
    { emoji: '🐢', label: 'Gentle flight', pace: 0.6 },
    { emoji: '⭕', label: 'Count 4 rings', pace: 0.75, goal: 'Fly through 4 cloud rings', target: 4, icon: () => document.createElement('i'), reward: 'Four cloud rings!' },
  ],
})
/** The counting mission only runs in worlds without numbered rings. */
const missionFits = (wi) => WORLDS[wi].goal?.type !== 'rings'
function beginMission(wi) {
  adventure.enable(missionFits(wi))
  adventure.begin()
}

/** Says something aloud (unless the sound is off), after anything still being said: nothing is cut off. */
function say(text) {
  if (text) voice.say(text)
}

const numberWord = (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n)

/** Says the world's goal (and the counting mission's) as each world starts, for children who can't read yet. */
function sayGoal() {
  if (game.state !== 'play') return
  const w = WORLDS[game.world]
  voice.newRound() // each world's hints may be said once again
  const parts = [`${w.name}!`, game.goal ? goalSentence(game.goal.goal) : '']
  if (adventure.option.goal && missionFits(game.world)) parts.push(`And let's count ${numberWord(adventure.option.target)} rings!`)
  say(parts.filter(Boolean).join(' '))
}

let templates, dragon, world, course, sparks, dots, rings, popups
const pos = new THREE.Vector3(0, 4, 0) // Ember
const vel = new THREE.Vector2()
const target = new THREE.Vector2(0, 4)
const camPos = new THREE.Vector3(0, 5, 8)
const camLook = new THREE.Vector3(0, 4, 0)
let camRideZ = 0
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

async function init() {
  templates = await loadModels((k) => ($('load-bar').style.width = `${10 + k * 90}%`))
  sparks = new Particles(scene, { max: 900, glow: true })
  dots = new Particles(scene, { max: 500, glow: false })
  rings = new Rings(scene)
  popups = new Popups($('popups'), camera, bannerBox)
  dragon = new Dragon(templates.dragon)
  scene.add(dragon.root)
  world = new World(scene, templates)
  // what each gathering world's nest kept from the last trip (shown on the island, see World.keepsakes)
  const kept = store.get('dragon-glide-kept', {})
  world.kept = kept && typeof kept === 'object' ? kept : {}
  course = new Course(scene, templates, sparks)
  // the basket takes only the kinds still asked for: anything else floats away
  course.wants = (kind) => !!game.goal && stillWanted(game.goal).includes(kind)
  // help (and the quiet hint glow) points at a kind that keeps a "more than" basket's rule
  course.helps = (kind) => !!game.goal && bestKinds(game.goal).includes(kind)
  // a basket asked for by kind doesn't refuse a wrong one any more: up to two ride along in its "oops" corner
  // (another kind; at the stretch tier also one more than a row holds), and the child gives them back at the
  // nest. So careful steering saves work there, and flying through everything costs some.
  course.oops = (kind) => {
    const g = game.goal
    // once the basket is full nothing more joins it, not even by mistake
    if (!g || g.goal.type !== 'gather' || g.goal.total || extraCount(g) >= 2 || goalDone(g)) return false
    return g.goal.level >= 1 || !g.goal.wants.some(([w]) => w === kind)
  }
  if (window.game) Object.assign(window, { course, world, dragon, pos, target, THREE, start, fire, renderer, scene, camera })
  buildTrip()
  buildWorldButtons()
  applyQuality()
  toTitle()
  renderer.setAnimationLoop(frame)
}

// --- Screens ----------------------------------------------------------------------------

function show(id) {
  for (const s of ['loading', 'title', 'results']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', id !== null)
  $('corner').classList.toggle('hidden', id === 'loading')
  document.body.dataset.screen = id ?? 'play'
}

function toTitle() {
  game.state = 'title'
  veil?.classList.remove('show')
  game.nestReady = false
  $('fly-on').classList.add('hidden')
  game.goal = null
  game.picked = null
  adventure.enable(true)
  renderGoal()
  clearSort()
  voice.hush()
  game.z = 0
  game.speed = 0
  pos.set(0, 4.3, 0)
  vel.set(0, 0)
  course.reset(0)
  world.reset(0)
  world.generate(200, lane)
  camPos.set(1.2, 4.9, 6)
  camLook.set(0, 4.3, 0)
  dragon.root.rotation.y = Math.PI
  sound.play(null)
  renderBest()
  show('title')
}

function renderBest() {
  // The title remembers the worlds Ember has flown home from, not a score to beat.
  document.querySelectorAll('#worlds button').forEach((b, i) => b.classList.toggle('done', game.done.has(i)))
}

function buildWorldButtons() {
  const el = $('worlds')
  WORLDS.forEach((w, i) => {
    const b = document.createElement('button')
    b.textContent = w.emoji
    b.title = w.name
    b.setAttribute('aria-label', `Start at ${w.name}`)
    b.onclick = () => start(i)
    el.append(b)
  })
}

function start(from = 0) {
  beginMission(from)
  sound.unlock()
  sound.click()
  game.state = 'play'
  game.nestReady = false
  $('fly-on').classList.add('hidden')
  game.startWorld = from
  game.world = from
  game.z = from * WORLD_LENGTH + 2
  game.speed = 4
  game.slow = 1
  game.gemCombo = 0
  game.invuln = 0
  game.time = 0
  game.tipT = 0
  game.fired = 0
  game.toldFire = false
  game.steered = 0
  game.learned = []
  voice.hush() // a new trip: nothing left over from the last one
  pos.set(0, 4.3, -game.z)
  vel.set(0, 0)
  target.set(0, 4.3)
  course.reset(game.z)
  world.reset(game.z)
  world.addNest(from)
  // the camera swoops from Ember's face to behind
  camPos.set(1.2, 4.9, -game.z + 6)
  camLook.set(0, 4.3, -game.z)
  // the camera starts here, not at the title's spot (else a later world loses its first rings and its nest)
  camRideZ = pos.z
  show(null)
  $('hud').classList.remove('resting')
  const w = WORLDS[from]
  rings.setGlow(!!w.night)
  startGoal(from)
  worldBanner(w, 'Fly to the nest! 🪺')
  sound.play(w.music)
  tip('👆 Drag to fly!', 3.5)
  sayGoal()
}

function finishTrip() {
  game.state = 'results'
  const nest = world.nestFor(game.world)
  if (nest) nest.cheer = 1e6
  // No grade: the end card shows each world Ember flew through and what Ember brought home and learned there.
  const flown = WORLDS.slice(game.startWorld, game.world + 1).map((w, k) => [w, game.learned.find((l) => l.world === game.startWorld + k)])
  $('learned').innerHTML = flown.map(([w, e]) => `<div class="learn"><span class="w">${w.emoji}</span>${e ? goalPicture(e, 'end') : ''}</div>`).join('')
  const words = flown.map(([, e]) => (e ? learnedSentence(e) : '')).filter(Boolean)
  $('learned').setAttribute('aria-label', words.join(' ') || 'The worlds you flew through')
  clearSort()
  // each world's sentence was already said at its own nest, so the end card says only one short line
  say('Home sweet nest!')
  sound.finish()
  show('results')
}


// --- Each world's goal ------------------------------------------------------------------

const extraCount = (g) => Object.values(g.extra || {}).reduce((a, b) => a + b, 0)

/** The 🔥 button shows only where fire has a job: the gathering worlds' treasure bubbles. */
const showFire = (wi) => fireBtn.classList.toggle('hidden', WORLDS[wi].goal?.type !== 'gather')

function startGoal(wi) {
  showFire(wi)
  // a fresh goal each trip (how many, which kind, which numbers), at the child's level, or the way of
  // counting the child picked at the last nest (a chosen challenge, see pickNext)
  const spec = WORLDS[wi].goal
  const picked = game.picked?.world === wi ? game.picked : null
  game.picked = null
  const goal = makeGoal(spec, spec && (picked ? picked.level : game.levels[spec.type]), picked?.step)
  // `from`: the child's own level before this world, so a harder way chosen at the nest is measured fairly (see stepLevel)
  game.goal = goal ? { world: wi, goal, from: spec && game.levels[spec.type], reached: 0, flown: [], got: {}, extra: {}, slips: 0, misses: 0, wrongRun: 0, spares: 0, holdT: 0 } : null
  if (goal) course.goals.set(wi, goal)
  course.hintKinds = null
  // the first pair of an easier trip shows the way (the other ring rests pale); after one right ring the child chooses alone
  if (goal?.type === 'rings' && goal.level === 0 && !game.learned.length) course.wrongRun.set(wi, 2)
  renderGoal()
}

/**
 * The goal as a picture. 'hud': numbers that light up / slots that fill.
 * 'start': what to look for. 'end': what was brought home.
 */
function goalPicture(g, mode = 'hud') {
  const { goal } = g
  if (goal.type === 'rings') {
    const seq = mode === 'end' ? goal.seq.slice(0, g.reached) : goal.seq
    // more than five numbers stand in two even rows (3 + 3, 4 + 3 ... 5 + 5, a ten-frame), never one alone
    let h = `<span class="nums${seq.length > 5 ? ' ten' : ''}" style="--cols: ${Math.ceil(seq.length / 2)}">`
    seq.forEach((n, i) => (h += `<i class="${mode !== 'hud' || i < g.reached ? 'got' : i === g.reached ? 'next' : ''}">${n}</i>`))
    // numbers flown by mistake ride in their own dashed corner until the child takes them out at the nest
    const oops = mode === 'hud' ? (g.flown || []).filter((f) => f.wrong).map((f) => `<i>${f.n}</i>`).join('') : ''
    return `${h}</span>${oops ? `<span class="oops nums">${oops}</span>` : ''}`
  }
  if (mode === 'end') {
    return sortedRows(goal, g.got).map(([k, n]) => `<span class="kind">${treasureSVG(k).repeat(n)}</span>`).join('')
  }
  if (goal.total) {
    // "more pink than blue": the rule as a picture, then one slot per treasure, filled in the order found
    const [a, b] = goal.more
    // "one more": blue = pink + 1
    const rule = goal.rule === 'one' ? `${treasureSVG(a)}<b>=</b>${treasureSVG(b)}<b>+1</b>` : `${treasureSVG(a)}<b>&gt;</b>${treasureSVG(b)}`
    let h = `<span class="rule">${rule}</span><span class="want">`
    // grouped by kind, so "more blue than pink" can be seen as the slots fill
    const got = mode === 'start' ? [] : goal.more.flatMap((k) => Array(g.got[k] || 0).fill(k))
    for (let i = 0; i < goal.total; i++) h += got[i] ? treasureSVG(got[i]) : '<i class="slot"></i>'
    return `${h}</span>`
  }
  // one row of slots per kind asked for, then anything picked up by mistake, in its own little "oops" corner
  const rows = goal.wants.map(([k, n]) => {
    const have = mode === 'start' ? n : g.got[k] || 0
    let h = '<span class="want">'
    for (let i = 0; i < n; i++) h += treasureSVG(k, i >= have)
    return `${h}</span>`
  }).join('')
  const extra = mode === 'hud' ? Object.entries(g.extra || {}).flatMap(([k, n]) => Array(n).fill(treasureSVG(k))).join('') : ''
  return extra ? `${rows}<span class="oops">${extra}</span>` : rows
}

function renderGoal() {
  const el = $('goal')
  const g = game.goal
  el.classList.toggle('hidden', !g)
  if (!g) return el.replaceChildren()
  el.innerHTML = goalPicture(g, 'hud')
  const { goal } = g
  el.setAttribute('aria-label', goal.type === 'rings'
    ? `${goalDone(g) ? learnedSentence(g) : `${goalSentence(goal)} Next is ${goal.seq[g.reached]}.`}${g.flown?.some((f) => f.wrong) ? ` ${g.flown.filter((f) => f.wrong).length} to take out at the nest.` : ''}`
    : `${goalSentence(goal)} ${goal.wants.map(([k]) => countOf(k, g.got[k] || 0)).join(', ')} so far.${extraCount(g) ? ` ${extraCount(g)} to give back.` : ''}`)
}

/** The world's name, with its goal pictured underneath. */
function worldBanner(w, fallback) {
  if (!game.goal) return banner(`${w.emoji} ${w.name}`, fallback)
  banner(`${w.emoji} ${w.name}`, null, 3600)
  const pic = document.createElement('div')
  pic.className = 'goal-pic'
  pic.innerHTML = goalPicture(game.goal, 'start')
  $('banner').append(pic)
}

// The nest: the child finishes the world's lesson with what Ember brought home (nest.js)
let sortPlan = [] // [{ at, run }] in nest time
function clearSort() {
  sortPlan = []
  game.sortEnd = 0
  $('sort').classList.add('hidden')
  $('sort').classList.remove('puzzle', 'solved')
  $('sort').replaceChildren()
}

function sortAtNest(g) {
  clearSort()
  const tray = $('sort')
  if (!learnedSentence(g)) return
  // ▶ waits until the puzzle is solved (there is no timer on it)
  game.sortEnd = Infinity
  sortPlan = [{ at: 3.3, run: () => {
    tray.classList.remove('hidden')
    // upright, the tray stands just under the nest: last trip's keepsakes rest until the new basket replaces them
    const kept = view.portrait && world.nestFor(g.world)?.kept
    if (kept) kept.visible = false
    nestPuzzle(g, {
      tray,
      sound,
      say,
      sayOnce: (text) => voice.sayOnce(text),
      onSlip: () => (g.nestSlips = (g.nestSlips || 0) + 1),
      // the chip's oops corner empties as each one goes back to the sky
      onGiveBack: (k) => {
        if (typeof k === 'number') {
          // a number taken out of the row leaves the chip's oops corner
          const i = g.flown.findIndex((f) => f.wrong && f.n === k)
          if (i >= 0) g.flown.splice(i, 1)
        } else if (g.extra[k]) g.extra[k]--
        renderGoal()
      },
      // a swap at the nest shows on the chip as it happens
      onChange: renderGoal,
      onSolved: (extra) => {
        // a basket put right at the nest goes home as the child left it
        const entry = game.learned.at(-1)
        if (entry) entry.got = { ...g.got }
        renderGoal()
        // the family keeps this basket, the way the child sorted it, until next time
        if (g.goal.type === 'gather') {
          world.kept[g.world] = { ...g.got }
          store.set('dragon-glide-kept', world.kept)
          const nest = world.nestFor(g.world)
          if (nest) world.keepsakes(nest, g.got)
        }
        say([learnedSentence(g), extra].filter(Boolean).join(' '))
        game.sortEnd = game.nestT + 1.4
      },
    })
    // the treasures come out of Ember's basket
    for (const it of tray.querySelectorAll('.hand .item, .count .item')) flyFromEmber(it)
  } }]
}

function runSort() {
  // the puzzle waits for the "Home to the nest!" banner to go, so the two never share the screen
  if ($('banner').classList.contains('show') && game.nestT < 6) return
  while (sortPlan.length && sortPlan[0].at <= game.nestT) sortPlan.shift().run()
}

/** A sorted treasure leaves Ember's basket and drops into its row. */
function flyFromEmber(el) {
  const to = el.getBoundingClientRect()
  tmp.copy(pos).project(camera)
  const x = (tmp.x * 0.5 + 0.5) * innerWidth
  const y = (-tmp.y * 0.5 + 0.5) * innerHeight
  const still = stillMotion.matches
  const from = still ? 'none' : `translate(${x - (to.left + to.width / 2)}px, ${y - (to.top + to.height / 2)}px) scale(0.5)`
  el.animate?.([{ transform: from, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: still ? 300 : 650, easing: 'cubic-bezier(.3,.7,.4,1)' })
}

// --- HUD ----------------------------------------------------------------------------

let bannerTimer
function banner(text, small, ms = 2400) {
  const el = $('banner')
  el.className = 'banner'
  const line = document.createElement('span')
  line.className = 'line'
  line.textContent = text
  el.replaceChildren(line)
  // the big line stays on one line (shrinking a little on narrow phones), so the second line never drops onto the family
  const room = el.clientWidth - 32
  if (text && line.offsetWidth > room) line.style.fontSize = `${Math.max(0.6, room / line.offsetWidth)}em`
  if (small) {
    const s = document.createElement('small')
    s.textContent = small
    el.append(s)
  }
  el.classList.add('show')
  $('hud').classList.add('bannering')
  // numbers already floating under where the banner lands step out of its way
  for (const d of $('popups').children) d.classList.add('hush')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => {
    el.classList.remove('show')
    $('hud').classList.remove('bannering')
  }, ms)
}

/** Where the showing banner's words are on screen, if one shows. */
function bannerBox() {
  const el = $('banner')
  if (!el.classList.contains('show') || !el.children.length) return null
  let box = null
  const range = document.createRange()
  for (const c of el.children) {
    // the words themselves, not the full-width lines they sit on
    range.selectNodeContents(c)
    const r = range.getBoundingClientRect()
    if (!r.width) continue
    box = box ? { left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), top: Math.min(box.top, r.top), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  }
  if (!box) return null
  // while the banner is still popping in it's drawn smaller, so measure it at its full size
  const k = new DOMMatrixReadOnly(getComputedStyle(el).transform).a || 1
  if (k < 0.99) {
    const b = el.getBoundingClientRect()
    const cx = (b.left + b.right) / 2
    const cy = (b.top + b.bottom) / 2
    box = { left: cx + (box.left - cx) / k, right: cx + (box.right - cx) / k, top: cy + (box.top - cy) / k, bottom: cy + (box.bottom - cy) / k }
  }
  return box
}

let tipTimer
function tip(text, secs) {
  const el = $('tip')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => el.classList.remove('show'), secs * 1000)
}

function buildTrip() {
  $('trip-stops').innerHTML = [...WORLDS.map((w) => `<span>${w.emoji}</span>`), '<span>🪺</span>'].join('')
}
let tripShown = -1
function showTrip() {
  const p = Math.round(clamp(game.z / (WORLDS.length * WORLD_LENGTH), 0, 1) * 500) / 500
  if (p === tripShown) return
  tripShown = p
  $('trip-fill').style.transform = `scaleX(${p})`
  $('trip-dragon').style.transform = `translateX(${p * 100}%)`
}

function renderToggles() {
  $('sound').textContent = sound.muted ? '🔇' : '🔊'
  $('music').classList.toggle('off', !sound.musicOn)
}

function toggleSound() {
  sound.unlock()
  sound.setMuted(!sound.muted)
  voice.setMuted(sound.muted)
  renderToggles()
}

function toggleMusic() {
  sound.unlock()
  sound.setMusic(!sound.musicOn)
  renderToggles()
}

// --- Input ------------------------------------------------------------------------------

const keys = new Set()
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const touch = { id: null, x: 0, y: 0, t: 0, moved: 0 }
let mouseAim = null // last mouse position, re-aimed every frame while the camera moves

function aimMouse(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  plane.constant = -pos.z // the plane Ember flies in (z = pos.z)
  if (!raycaster.ray.intersectPlane(plane, tmp)) return
  target.set(clamp(tmp.x, -lane.x, lane.x), clamp(tmp.y, lane.yMin, lane.yMax))
}

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (game.state === 'nest' && game.nestReady) return flyOn()
  if (game.state !== 'play') return
  if (e.pointerType === 'mouse') {
    if (e.button === 0) fire()
    mouseAim = [e.clientX, e.clientY]
    return
  }
  if (touch.id === null) {
    touch.id = e.pointerId
    touch.x = e.clientX
    touch.y = e.clientY
    touch.t = performance.now()
    touch.moved = 0
  }
})
addEventListener('pointermove', (e) => {
  if (game.state !== 'play') return
  if (e.pointerType === 'mouse') {
    mouseAim = [e.clientX, e.clientY]
    game.steered = 1
    return
  }
  if (e.pointerId !== touch.id) return
  const dx = e.clientX - touch.x
  const dy = e.clientY - touch.y
  touch.x = e.clientX
  touch.y = e.clientY
  touch.moved += Math.abs(dx) + Math.abs(dy)
  // drag anywhere: Ember moves with the finger (a bit more, so small hands reach the edges)
  const k = (2.6 * lane.x) / Math.min(innerWidth, innerHeight * 1.3)
  target.x = clamp(target.x + dx * k, -lane.x, lane.x)
  target.y = clamp(target.y - dy * k, lane.yMin, lane.yMax)
  if (touch.moved > 30) game.steered = 1
})
function endTouch(e) {
  if (e.pointerId !== touch.id) return
  // a quick tap (not a drag) puffs fire
  if (touch.moved < 14 && performance.now() - touch.t < 350) fire()
  touch.id = null
}
addEventListener('pointerup', endTouch)
addEventListener('pointercancel', (e) => {
  if (e.pointerId === touch.id) touch.id = null
})
addEventListener('keydown', (e) => {
  sound.unlock()
  if (e.code === 'KeyM') return toggleSound()
  if (e.code === 'Escape') return ['play', 'nest', 'results'].includes(game.state) ? toTitle() : undefined
  if (e.code === 'Space' || e.code === 'Enter') {
    // a focused tile or shelf at the nest takes the key like any button
    if (e.target.closest?.('#sort')) return
    e.preventDefault()
    if (e.repeat) return
    if (game.state === 'title') return start(0)
    if (game.state === 'results') return start(0)
    return fire()
  }
  if (e.code.startsWith('Arrow')) {
    e.preventDefault()
    game.steered = 1
  }
  keys.add(e.code)
})
addEventListener('keyup', (e) => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend()
  else if (sound.ctx) sound.unlock()
})

const fireBtn = $('fire')
fireBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  sound.unlock()
  fire()
})
$('home').addEventListener('click', () => {
  sound.click()
  toTitle()
})
$('fly-on').addEventListener('click', flyOn)
$('music').addEventListener('click', toggleMusic)
$('sound').addEventListener('click', toggleSound)
$('play').addEventListener('click', () => start(0))
$('again').addEventListener('click', () => start(game.startWorld))
$('to-title').addEventListener('click', () => {
  sound.click()
  toTitle()
})

const FIRE_COLORS = ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0', '#ff7eb9']
function fire() {
  if (game.state === 'nest' && game.nestReady) return flyOn()
  if (game.state !== 'play' || game.fireCd > 0) return
  game.fireCd = 0.28
  game.fired++
  dragon.puff()
  dragon.mouth.getWorldPosition(tmp)
  course.shoot(tmp, game.speed)
  sound.fire()
  for (let i = 0; i < 14; i++) {
    sparks.emit(tmp.x, tmp.y, tmp.z, { vx: rand(-1.5, 1.5), vy: rand(-0.5, 1.5), vz: -game.speed - rand(4, 12), spread: 1, life: 0.4, size: rand(0.5, 0.9), color: pick(FIRE_COLORS), drag: 3 })
  }
  fireBtn.classList.remove('press')
  void fireBtn.offsetWidth
  fireBtn.classList.add('press')
  setTimeout(() => fireBtn.classList.remove('press'), 120)
}

// --- Events from the course ---------------------------------------------------------

const OOPS = ['Bonk!', 'Boing!', 'Oopsie!', 'Bonk! 💫']
const RAINBOW = ['#ff6b6b', '#ffd23f', '#8ef0c8', '#7cc6fe', '#c9b6ff', '#ff8fc7']

function handle(events) {
  for (const ev of events) {
    if (ev.type === 'gem') {
      // gems are sparkle and song along the way, never a count
      game.gemCombo = game.gemComboT > 0 ? game.gemCombo + 1 : 0
      game.gemComboT = 1.2
      const big = ev.kind === 'big'
      sound.gem(game.gemCombo % 5, big)
      sparks.burst(ev.pos, GEMS[ev.kind].colors, big ? 10 : 5, big ? 4 : 3, big ? 0.7 : 0.5, { vz: -game.speed * 0.6 })
    } else if (ev.type === 'hoop') {
      adventure.event()
      // One soft ring of light and the same gentle chime every time: no points, no streak
      sound.hoop(0)
      const c = WORLDS[game.world].hoop.hoop_cloud
      rings.spawn(ev.pos, typeof c === 'string' ? c : c.color, 4.5, 0.8)
      sparks.burst(ev.pos, RAINBOW, 8, 3, 0.6, { vz: -game.speed * 0.5 })
    } else if (ev.type === 'numRing') {
      // the next number, chosen from a pair (the counting mission rests in these worlds, so it never talks over it)
      const g = game.goal
      if (!g) continue
      g.reached++
      g.wrongRun = 0
      g.flown.push({ n: ev.number })
      // the note climbs with each step (or steps down when counting down)
      sound.number(g.goal.count === 'down' ? ev.number : g.reached)
      rings.spawn(ev.pos, '#ffd23f', 4.5, 0.8)
      sparks.burst(ev.pos, ['#ffe066', '#fff3a0', '#ffffff'], 8, 3, 0.6, { vz: -game.speed * 0.5 })
      // at the easier tier the numbers are said, up to five; after that (and at the harder tiers, where the
      // child reads the numeral) the note and the chip carry the count. Queued, so the goal is never cut off.
      // Only in the trip's first numbered-ring world: by the second, the child counts with the chip.
      if (g.goal.level === 0 && !game.learned.some((l) => l.goal.type === 'rings')) voice.count(ev.number, { interrupt: false })
      renderGoal()
    } else if (ev.type === 'numWrong') {
      // the other number: no progress, no buzzer. The same number waits on the next pair.
      const g = game.goal
      if (!g) continue
      g.slips++
      g.wrongRun++
      sound.nope()
      rings.spawn(ev.pos, '#ffffff', 3.5, 0.5)
      // above the easiest tier the wrong number rides along in the chip's oops corner (up to two), in the order
      // it was flown, and the child takes it out of the row at the nest: careless steering costs nest work
      const rides = g.goal.level >= 1 && g.flown.filter((f) => f.wrong).length < 2
      if (rides) g.flown.push({ n: ev.picked, wrong: true })
      // said once a world; after that the chip and the dimmed ring do the reminding
      if (!g.toldWrong) say(rides ? `That's ${ev.picked}. It rides along to the nest. We need ${ev.number}!` : `That's ${ev.picked}. We need ${ev.number}!`)
      g.toldWrong = true
      renderGoal()
    } else if (ev.type === 'numMiss') {
      // not a failure: the next pair shows the same number, so it waits for Ember.
      // Flying past without choosing counts as half a slip, so a child who isn't choosing gets the easier tier.
      const g = game.goal
      if (!g) continue
      g.misses++
      if (ev.waits && !g.toldMiss) say(`${ev.number} is waiting for you!`)
      g.toldMiss = true
    } else if (ev.type === 'treasureMiss') {
      if (game.goal) game.goal.misses++
    } else if (ev.type === 'treasure') {
      const g = game.goal
      if (!g) continue
      const k = ev.kind
      if (ev.extra) {
        // the wrong one rides along in the basket's oops corner, to be given back at the nest
        g.extra[k] = (g.extra[k] || 0) + 1
        g.slips++
        g.wrongRun++
        sound.nope()
        if (!g.toldOops) say(`Oops, a ${TREASURES[k].one} came too. We'll give it back at the nest.`)
        g.toldOops = true
        if (g.wrongRun >= 2) course.hintKinds = new Set(bestKinds(g))
        renderGoal()
        continue
      }
      if (!ev.taken) {
        // another kind, or one more than asked for, once the oops corner is full: it floats away.
        // (Fire pops only the bubble Ember lines up with, so a wrong bubble popped is a choice too.)
        // Once the basket is full nothing more is asked, so nothing is said either.
        sound.nope()
        if (!stillWanted(g).length) continue
        g.slips++
        g.wrongRun++
        const left = stillWanted(g)
        const full = !g.goal.total && g.goal.wants.find(([w]) => w === k)
        voice.sayOnce(full ? `We have ${countOf(k, full[1])} already!` : `That's a ${TREASURES[k].one}. We need ${neededWords(left)}!`)
        if (g.wrongRun >= 2) course.hintKinds = new Set(bestKinds(g))
        continue
      }
      g.got[k] = (g.got[k] || 0) + 1
      g.wrongRun = 0
      course.hintKinds = null
      const n = g.got[k]
      sound.treasure(g.goal.total ? g.goal.more.reduce((sum, m) => sum + (g.got[m] || 0), 0) : n)
      sparks.burst(ev.pos, [TREASURES[k].color, '#ffffff'], 6, 3, 0.5, { vz: -game.speed * 0.6 })
      // the chip's slots do the counting in the air (the nest asks how many), so only a finished row is said
      // a "more than" basket takes both kinds, so the rule is the child's to keep: once it can't be kept any
      // more, one gentle reminder (and one slip). Nothing is refused; the nest is where it gets put right.
      const broke = g.goal.total && !g.ruleBroken && !ruleReachable(g.goal, g.got)
      if (broke) {
        g.ruleBroken = true
        g.slips++
      }
      const left = stillWanted(g)
      // the rule is named at the moment it was broken, even when that treasure also filled the basket
      if (broke) voice.sayOnce(`Oh! Remember, ${moreWords(g.goal.more, g.goal.rule)}.`)
      if (!left.length) {
        // the basket is full: the rest float away, and the nest is next
        say('The basket is full. Home to the nest!')
        course.release(game.world)
      } else if (!g.goal.total && n === g.goal.wants.find(([w]) => w === k)[1]) say(`${countOf(k, n)}! Now ${neededWords(left)}.`)
      renderGoal()
    } else if (ev.type === 'bubble') {
      sound.pop()
      sparks.burst(ev.pos, RAINBOW, 10, 4, 0.6, { vz: -game.speed * 0.4 })
      rings.spawn(ev.pos, '#bdeaff', 3.5)
    } else if (ev.type === 'lantern') {
      sound.lantern()
      sparks.burst(ev.pos, ['#fff3a0', '#ffd23f', '#ff9f43'], 8, 3, 0.7, { vz: -game.speed * 0.3 })
    } else if (ev.type === 'bonk') {
      dragon.bonk()
      sound.bonk()
      game.slow = 0.4
      game.invuln = 1.4
      // a small physical wobble from the bump, nothing more (none with reduced motion)
      game.shake = stillMotion.matches ? 0 : 0.2
      // bounce away from whatever we bumped
      tmp2.set(pos.x - ev.pos.x, pos.y - ev.pos.y, 0)
      if (tmp2.lengthSq() < 0.01) tmp2.set(pos.x >= 0 ? -1 : 1, 0.3, 0)
      tmp2.normalize()
      vel.x += tmp2.x * 10
      vel.y += tmp2.y * 7
      target.x = clamp(pos.x + tmp2.x * 2.5, -lane.x, lane.x)
      target.y = clamp(pos.y + tmp2.y * 2, lane.yMin, lane.yMax)
      popups.show(tmp.set(pos.x, pos.y + 1.6, pos.z), pick(OOPS), 'oops')
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        sparks.emit(pos.x + Math.cos(a) * 0.9, pos.y + 1.1, pos.z + Math.sin(a) * 0.9, { vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5 - game.speed * 0.4, vy: 0.5, spread: 0.3, life: 1, size: 0.5, color: '#fff3a0', drag: 1 })
      }
    }
  }
}

// --- Nests ------------------------------------------------------------------------------

let nestClear = 0 // px from the top that the nest banner covers
const FACES_Y = NEST_Y + 5.4 // the parents' heads as they hop and cheer (wing tips may go higher)
const NEST_FLOOR = NEST_Y - 0.3 // just under the nest's twigs

function arriveAtNest() {
  game.state = 'nest'
  game.nestT = 0
  $('tip').classList.remove('show') // the flying hints rest while the family is together
  const w = WORLDS[game.world]
  const nest = world.nestFor(game.world)
  if (nest) nest.cheer = 4.2
  game.done.add(game.world)
  store.set('dragon-glide-worlds', [...game.done])
  sound.fanfare()
  // The family's roars wait for Ember to land: a trip left in the meantime keeps them quiet.
  setTimeout(() => game.state === 'nest' && sound.rawr(0.8), 500)
  setTimeout(() => game.state === 'nest' && sound.rawr(1.3), 800)
  const last = game.world === WORLDS.length - 1
  banner('Home to the nest! 🪺', last ? 'You flew all the way! 🌟' : `${w.emoji} ${w.name} done!`, 3200)
  // what this world's goal brought home: the family sorts it and counts it with Ember
  const g = game.goal
  if (g) {
    game.learned.push({ world: game.world, goal: g.goal, reached: g.reached, got: { ...g.got }, extra: { ...g.extra }, flown: [...g.flown] })
    sortAtNest(g)
  }
  // where the banner's words end, so the camera can keep the family's faces below them
  nestClear = bannerBox()?.bottom ?? 0
  // a happy hop into the nest (a barrel roll here read as a fall in a still moment)
  dragon.hop = 1
}

/**
 * After a world, the next world of the same kind steps up a tier after careful choosing (in the air and
 * at the nest), and back down after a muddle. Flying past without choosing counts as half a slip.
 */
function stepLevel(g) {
  const muddle = g.slips + g.misses / 2 + (g.nestSlips || 0)
  const at = g.goal.level
  // the child's own level before this world (it differs from `at` when a way of counting was picked at the nest)
  const was = Number.isInteger(g.from) ? g.from : at
  // careful: a picked harder way, done well, becomes the child's level; the usual way steps up one.
  // Muddled: one below the tier flown, never above where the child was. In between: where the child was.
  game.levels[g.goal.type] = muddle <= 1 ? Math.max(was, Math.min(TOP_LEVEL, at > was ? at : at + 1)) : muddle >= 3 ? Math.min(was, Math.max(0, at - 1)) : was
  store.set('dragon-glide-level', game.levels)
}

/** The family has had their cuddle: the child decides when Ember flies on. */
function offerFlyOn() {
  game.nestReady = true
  pickNext()
  const last = game.world === WORLDS.length - 1
  $('fly-on').textContent = last ? '🪺 ▶' : `▶ ${WORLDS[game.world + 1].emoji}`
  $('fly-on').setAttribute('aria-label', last ? 'See the trip' : `Fly on to ${WORLDS[game.world + 1].name}`)
  $('fly-on').classList.remove('hidden')
}

/**
 * Before a numbered-ring world the child may choose how to count there ("1 2 3", "2 4 6", "3 6 9", "5 10 15"):
 * a chosen challenge for replay. The way that fits how the child is doing is already chosen, so ▶ alone is fine.
 */
let toldPick = false
function pickNext() {
  const wi = game.world + 1
  const spec = WORLDS[wi]?.goal
  const tray = $('sort')
  if (spec?.type !== 'rings' || tray.classList.contains('hidden') || tray.querySelector('.next-pick')) return
  const choices = countChoices(spec)
  const row = document.createElement('div')
  row.className = 'next-pick'
  row.setAttribute('role', 'radiogroup')
  row.setAttribute('aria-label', `How shall we count in ${WORLDS[wi].name}?`)
  row.innerHTML = `<span class="w" aria-hidden="true">${WORLDS[wi].emoji}</span>`
  // (left as it is, by threes or fives stays a surprise)
  const choose = (c, b, auto = false) => {
    game.picked = { world: wi, level: c.level, step: auto ? undefined : c.step }
    for (const o of row.querySelectorAll('button')) o.setAttribute('aria-checked', String(o === b))
  }
  const fits = choices.findIndex((c) => c.level === game.levels.rings)
  choices.forEach((c, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', 'false')
    // the way that fits the child wears Ember's little mark; ways more than one step harder rest dimmed
    // (still there for a grown-up or a keen child), so a three-year-old rarely lands on "by fives" by chance
    const fit = i === Math.max(0, fits)
    const far = c.level > (game.levels.rings ?? 0) + 1
    b.classList.toggle('fit', fit)
    b.classList.toggle('far', far)
    b.setAttribute('aria-label', `${c.words}: ${c.seq.join(', ')}${fit ? ' (just right)' : far ? ' (a big stretch)' : ''}`)
    b.innerHTML = c.seq.map((n) => `<i>${n}</i>`).join('')
    b.onclick = () => {
      sound.click()
      choose(c, b)
    }
    row.append(b)
    if (fit) choose(c, b, true)
  })
  tray.append(row)
  if (!toldPick) voice.say('How shall we count next? Pick one, then fly on.')
  toldPick = true
}

function flyOn() {
  if (game.state !== 'nest' || !game.nestReady) return
  sound.click()
  game.nestReady = false
  $('fly-on').classList.add('hidden')
  clearSort()
  if (game.goal) stepLevel(game.goal)
  if (game.world < WORLDS.length - 1) leaveNest()
  else {
    game.state = 'done'
    sound.play(null)
    finishTrip()
  }
}

function leaveNest() {
  game.world++
  game.state = 'play'
  game.speed = 2
  const w = WORLDS[game.world]
  world.addNest(game.world)
  rings.setGlow(!!w.night)
  $('hud').classList.remove('resting')
  beginMission(game.world)
  startGoal(game.world)
  worldBanner(w, 'Off we go! 🐉')
  sayGoal()
  sound.play(w.music)
  target.set(0, 4.5)
}

// --- Main loop ----------------------------------------------------------------------------

const AIR = { vx: 0, vy: 0, vz: 0, spread: 0.05, life: 1.6, size: 0.18, color: '#ffffff', drag: 0 }
let last = performance.now()

function frame() {
  const now = performance.now()
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  tick(dt)
  renderer.render(scene, camera)
}

// ?debug: sim(seconds) runs the game forward without rendering (background tabs don't animate)
if (window.game) window.sim = (secs, draw = true, dt = 1 / 30) => {
  for (let t = 0; t < secs; t += dt) tick(dt)
  if (draw) renderer.render(scene, camera)
  return { z: game.z, state: game.state, world: game.world, levels: game.levels }
}

function tick(dt) {
  game.time += dt
  measureQuality(dt)

  const prevZ = pos.z
  const playing = game.state === 'play'
  if (playing) updatePlay(dt)
  else if (game.state === 'nest') updateNest(dt)
  else {
    // title: Ember hovers and smiles at the camera; at the end Ember bounces in the nest
    const home = game.state !== 'title'
    pos.x = damp(pos.x, home ? 0 : Math.sin(game.time * 0.6) * 0.4, 2, dt)
    pos.y = damp(pos.y, home ? NEST_Y + 1.5 + Math.abs(Math.sin(game.time * 2.5)) * 0.3 : 4.3 + Math.sin(game.time * 1.1) * 0.25, 2, dt)
    vel.set(0, Math.cos(game.time * 1.1) * 0.3)
  }

  // Ember
  dragon.root.position.copy(pos)
  const faceCamera = game.state === 'play' || (game.state === 'nest' && game.nestT < 0) ? 0 : Math.PI
  dragon.root.rotation.y += (faceCamera - dragon.root.rotation.y) * easeStep(5, dt)
  dragon.update(dt, { vx: playing ? vel.x : 0, vy: playing ? vel.y : 0, flap: playing ? 1 : 0.6 })
  // a soft whoosh on each big wing beat
  if (playing) {
    game.flapT += dt * dragon.flapRate
    if (game.flapT > Math.PI * 2) {
      game.flapT -= Math.PI * 2
      sound.flap()
    }
  }

  const behindZ = camera.position.z + 25
  course.world = game.world
  handle(course.update(dt, pos, prevZ, game.time, { invulnerable: game.invuln > 0, playing, behindZ }))
  world.generate(game.z + 185, lane)
  course.generate(game.z + 180, lane)

  updateCamera(dt)
  world.update(dt, camera, game.z)
  sparks.update(dt)
  dots.update(dt)
  rings.update(dt)
}

function updatePlay(dt) {
  game.fireCd -= dt
  game.gemComboT -= dt
  game.invuln = Math.max(0, game.invuln - dt)
  game.slow = Math.min(1, game.slow + dt * 0.6)
  game.tipT += dt
  // fire is for the gathering worlds' bubbles (each holds a treasure): the tip waits until one is coming
  if (!game.fired && !game.toldFire && game.goal?.goal.type === 'gather' && course.items.some((it) => it.type === 'bubble' && it.kind && it.z < pos.z - 18 && it.z > pos.z - 45)) {
    game.toldFire = true
    tip('🔥 Line up with a bubble, then tap!', 4.5)
  }
  // a child who hasn't found out how to steer yet gets the hint again
  if (!game.steered && game.tipT > 12 && (game.tipT - 12) % 14 < dt) tip('👆 Drag to fly!', 3.5)

  // One calm speed in every world
  const w = WORLDS[game.world]
  const cruise = w.speed * game.slow * adventure.pace
  game.speed = damp(game.speed, cruise, 1.5, dt)
  game.z += game.speed * dt
  // A goal is never missed: short of the nest, Ember waits while spare rings or treasures float in
  const g = game.goal
  const holdZ = (game.world + 1) * WORLD_LENGTH - 100
  if (g && !goalDone(g) && game.z > holdZ) {
    game.z = holdZ
    g.holdT += dt
    if (!g.holding) {
      g.holding = true
      g.spareT = 0
      say(g.goal.type === 'rings' ? `${g.goal.seq[g.reached]} is coming!` : `More ${neededWords(bestKinds(g))} are coming!`)
    }
    // Spare groups only need checking now and then, not every frame
    g.spareT -= dt
    if (g.spareT <= 0) {
      g.spareT = 0.5
      // after two spares have floated by (or most of a minute), the next one comes up close to Ember, with the
      // wrong one dimmed, so one small move reaches it; only after a long wait does it come right onto Ember.
      // A child who finds steering hard is never left hovering, but the last step is still the child's.
      const help = g.spares >= 2 || g.holdT > 45
      if (course.spare(game.z, lane, game.world, help ? { x: pos.x, y: pos.y, close: g.holdT > 75 } : null)) {
        g.spares++
        if (help) {
          if (g.goal.type === 'rings') course.wrongRun.set(game.world, 2)
          else course.hintKinds = new Set(bestKinds(g))
          course.relabel(game.world)
          voice.sayOnce('Here it comes, close to you!')
        }
      }
    }
  }

  // Once the goal is met there is nothing left to choose in this world: after a breath, a soft cloud carries
  // Ember most of the way home, so the nest comes within a few seconds instead of a long empty cruise
  if (g?.veilT != null) cloudHome(g, dt)
  else if (g && goalDone(g) && !g.homeward) {
    g.doneT = (g.doneT || 0) + dt
    const left = (game.world + 1) * WORLD_LENGTH - 55 - game.z
    const counting = adventure.option.goal && missionFits(game.world) && !adventure.complete
    if (left < 150 || counting) g.homeward = left < 150
    else if (g.doneT > 2.5) cloudHome(g)
  }

  // Steering: keys nudge the target, mouse points at it, fingers drag it
  const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
  const ky = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0)
  if (kx || ky) {
    mouseAim = null
    target.x = clamp(target.x + kx * 9 * dt, -lane.x, lane.x)
    target.y = clamp(target.y + ky * 7 * dt, lane.yMin, lane.yMax)
  } else if (mouseAim) aimMouse(mouseAim[0], mouseAim[1])
  target.x = clamp(target.x, -lane.x, lane.x)
  const stiff = game.invuln > 0.8 ? 14 : 38
  const damping = game.invuln > 0.8 ? 5 : 10
  vel.x += ((target.x - pos.x) * stiff - vel.x * damping) * dt
  vel.y += ((target.y - pos.y) * stiff - vel.y * damping) * dt
  pos.x = clamp(pos.x + vel.x * dt, -lane.x - 0.8, lane.x + 0.8)
  pos.y = clamp(pos.y + vel.y * dt, lane.yMin - 0.4, lane.yMax + 0.6)
  pos.z = -game.z

  // drifting air sparkles rush past and sell the speed
  if (Math.random() < dt * 8) {
    AIR.color = WORLDS[game.world].night ? '#fff6c9' : '#ffffff'
    sparks.emit(pos.x + rand(-14, 14), pos.y + rand(-6, 8), pos.z - rand(30, 60), AIR)
  }

  // Reached the nest?
  const nestZ = (game.world + 1) * WORLD_LENGTH
  if (game.z > nestZ - 55) {
    game.state = 'nest'
    $('hud').classList.add('resting') // 🔥 rests while the family celebrates
    game.nestT = -1 // flying in
  }
  sound.wind(clamp(game.speed / 25, 0, 1))
  bannerMakesWay()
  showTrip()
}

/**
 * A soft cloud drifts over the view (a slow fade, no motion), Ember is carried on to about seven seconds short
 * of the nest, and the cloud thins away. What was laid out in between is left behind, unseen.
 * Timed in game time (updatePlay calls it each frame once started), so it can't fire after the world has changed.
 */
let veil
const VEIL_IN = 0.7
function cloudHome(g, dt = 0) {
  if (g.veilT == null) {
    g.veilT = 0
    g.homeward = true
    veil ??= Object.assign(document.body.appendChild(document.createElement('div')), { id: 'veil', className: 'veil' })
    veil.classList.add('show')
    return
  }
  if (g.veilT >= VEIL_IN) return
  g.veilT += dt
  if (g.veilT < (stillMotion.matches ? 0.35 : VEIL_IN)) return
  g.veilT = VEIL_IN
  const from = game.z
  const to = (game.world + 1) * WORLD_LENGTH - 145
  if (to > from) {
    for (const it of course.items) if (it.z < -from + 2 && it.z > -to - 30) it.gone = true
    game.z = to
    pos.z = -to
    // the camera rides along unchanged, just further on
    camPos.z -= to - from
    camLook.z -= to - from
    camRideZ = pos.z
    course.nextZ = Math.max(course.nextZ, to + 30)
    world.nextZ = Math.max(world.nextZ, to - 20)
  }
  veil.classList.remove('show')
}

/** The world's banner (with its goal picture) steps aside as the first choice comes near, so it never hides it. */
function bannerMakesWay() {
  const el = $('banner')
  if (!el.classList.contains('show') || !el.querySelector('.goal-pic')) return
  const near = course.items.some((it) => (it.type === 'numring' || it.type === 'treasure' || (it.type === 'bubble' && it.kind)) && it.wi === game.world && !it.gone && !it.off && it.z < pos.z && it.z > pos.z - 48)
  if (!near) return
  clearTimeout(bannerTimer)
  el.classList.remove('show')
  $('hud').classList.remove('bannering')
}

/** Glide down into the nest, celebrate with the family, then fly on (or finish). */
function updateNest(dt) {
  const nestZ = (game.world + 1) * WORLD_LENGTH
  const seatY = NEST_Y + 1.5
  if (game.nestT < 0) {
    // flying in: slow down and line up with the nest
    const left = nestZ - game.z
    game.speed = damp(game.speed, Math.max(1.5, left * 0.9), 3, dt)
    game.z = Math.min(nestZ, game.z + game.speed * dt)
    pos.x = damp(pos.x, 0, 2.2, dt)
    pos.y = damp(pos.y, seatY + Math.min(3, left * 0.06), 2.2, dt)
    vel.set(-pos.x * 0.6, 0)
    pos.z = -game.z
    if (left < 0.4) arriveAtNest()
    sound.wind(clamp(game.speed / 25, 0, 1) * 0.6)
  } else {
    game.nestT += dt
    pos.x = damp(pos.x, 0, 3, dt)
    // Ember's happy bounce settles into a gentle rest while the family waits for the child
    pos.y = damp(pos.y, seatY + Math.abs(Math.sin(game.nestT * 3.2)) * 0.35 * Math.max(0.15, 1 - game.nestT / 5), 4, dt)
    vel.set(0, 0)
    // a short soft shower while the family cheers; it has settled and faded before the puzzle tray comes
    // (sortAtNest), so the thinking moment is still
    const cheering = game.nestT < 1.2
    if (cheering && Math.random() < dt * 4) {
      const c = RAINBOW[(Math.random() * RAINBOW.length) | 0]
      dots.emit(rand(-5, 5), NEST_Y + rand(7, 9), -nestZ + rand(-2, 2), { vx: rand(-1, 1), vy: rand(-1, -2.5), spread: 1, life: 1.3, size: rand(0.3, 0.45), endSize: 0, color: c, grav: -1.2, drag: 0.4 })
    }
    if (cheering && Math.random() < dt * 2) {
      sparks.emit(rand(-1.5, 1.5), seatY + 1.5, -nestZ + 0.5, { vx: 0, vy: 2, spread: 0.6, life: 1.2, size: 0.7, color: '#ff8fc7', drag: 0.5 })
    }
    // No timer moves on: after the cheer, the family waits with Ember until the child taps.
    runSort()
    if (game.nestT > Math.max(3.2, game.sortEnd || 0) && !game.nestReady) offerFlyOn()
  }
  showTrip()
}

/** How far (in world units, `depth` from the camera) to slide the nest picture right, past a panel on the left. */
function shiftPast(panel, depth) {
  const box = panel.getBoundingClientRect()
  if (!box.width) return 0
  // the middle of the space between the panel and the sound buttons, as a fraction of half the screen
  const mid = (box.right + innerWidth - 66) / 2
  const ndc = mid / innerWidth * 2 - 1
  return Math.max(0, ndc * depth * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
}
/** The end card stands on the left of sideways phones, so the family moves over to the right. */
const sideResults = matchMedia('(max-height: 480px) and (orientation: landscape)')
const sideShift = () => (sideResults.matches ? shiftPast(document.querySelector('#results .menu-bottom'), 8.4) : 0)
/** Held sideways, the nest puzzle's tray waits at the left: the family steps right, clear of it. */
const sideways = matchMedia('(orientation: landscape)')
let traySide = 0
function trayShift(depth) {
  const tray = $('sort')
  const want = game.state === 'nest' && sideways.matches && !tray.classList.contains('hidden') ? shiftPast(tray, depth) : 0
  // measured each frame but eased, so the family glides over as the tray appears
  traySide += (want - traySide) * 0.08
  return traySide
}

/** Upright screens: the top of the nest puzzle's tray, which the nest should stay above (0 when there is none). */
function nestFloorPx() {
  const tray = $('sort')
  if (!view.portrait || tray.classList.contains('hidden')) return 0
  return tray.getBoundingClientRect().top
}
/** The end card's rows above and its buttons below: the room left for the family between them. */
function endCardRoom() {
  if (game.state !== 'results') return [0, 0]
  const rows = $('learned').getBoundingClientRect()
  const buttons = document.querySelector('#results .menu-bottom').getBoundingClientRect()
  return [rows.height ? rows.bottom : 0, buttons.height ? buttons.top : 0]
}

function updateCamera(dt) {
  let px, py, pz, lx, ly, lz, rate
  const s = game.state
  const atNest = (s === 'nest' && game.nestT >= 0) || ((s === 'results' || s === 'done') && world.nestFor(game.world))
  world.moonAside = 0
  if (s === 'title' || (!atNest && (s === 'results' || s === 'done'))) {
    // in front of Ember's face; Ember is turned toward us
    const portrait = view.portrait
    px = pos.x + 1.1
    py = pos.y + (portrait ? 1.2 : 0.7)
    pz = pos.z + (portrait ? 8.5 : 5.4)
    lx = pos.x + 0.1
    ly = pos.y + (portrait ? 0.3 : -0.25)
    lz = pos.z
    rate = 2.5
  } else if (atNest) {
    const nestZ = -(game.world + 1) * WORLD_LENGTH
    // on sideways phones the end card stands on the left, so the family moves over to the right
    const side = s === 'results' ? sideShift() : trayShift(view.portrait ? 11 : 7.2)
    // on the end card the moon steps out from behind the rows of what Ember learned
    // (upright screens: right out of the picture, since the rows fill the whole sky);
    // at the nest it rests up on the right, away from the banner's words and the puzzle tray
    // (upright screens have no room beside the words, so it steps out of the picture)
    world.moonAside = s === 'results' && !side ? (view.portrait ? -260 : -150) : s === 'nest' ? (view.portrait ? 140 : 70) : 0
    px = 1.6 - side
    py = NEST_Y + 3.6
    // on the wide end card the camera steps back a little, so the family fits between the stars and the score
    pz = nestZ + (view.portrait ? 11 : side ? 8.4 : s === 'results' ? 10.6 : 7.2)
    lx = -side
    // while the banner shows, the family sits lower in the picture, under it
    ly = NEST_Y + (s === 'nest' ? (view.portrait ? 3.1 : 2.7) : 1.9)
    lz = nestZ
    // the family fits between what covers the top of the screen (the nest's banner, or the end card's rows)
    // and the bottom (the puzzle tray on upright screens, or the end card's buttons)
    const [top, bottom] = s === 'nest' ? [nestClear, nestFloorPx()] : side ? [0, 0] : endCardRoom()
    if (top || bottom) {
      // the camera steps back until the parents' faces and the nest fit in that room, then tilts as little
      // as it can so the faces stay under the top and the nest stays above the bottom
      const t = Math.tan((camera.fov * Math.PI) / 360)
      const room = Math.atan((1 - (2 * (top + 10)) / innerHeight) * t)
      const low = Math.atan((bottom ? 1 - (2 * (bottom - 8)) / innerHeight : -0.82) * t)
      let d = pz - nestZ
      while (d < pz - nestZ + 12 && Math.atan2(FACES_Y - py, d) - Math.atan2(NEST_FLOOR - py, d) > room - low) d += 0.25
      // the camera's tilt: faces under the top edge first, then (if there is room) the nest above the bottom
      const p0 = Math.atan2(ly - py, pz - nestZ)
      const p = Math.max(Math.atan2(FACES_Y - py, d) - room, bottom ? Math.min(p0, Math.atan2(NEST_FLOOR - py, d) - low) : p0)
      if (Math.abs(p - p0) > 1e-4) {
        ly = py + d * Math.tan(p)
        pz = nestZ + d
      }
    }
    rate = 2
  } else {
    px = pos.x * 0.55
    py = pos.y * 0.6 + 2.7
    pz = pos.z + view.back
    lx = pos.x * 0.8
    ly = pos.y * 0.75 + 1.4
    lz = pos.z - 14
    rate = s === 'play' && game.time > 1.5 ? 6 : 2.2
  }
  if (s === 'play' || s === 'nest') {
    // ride along with the flight first, so easing doesn't trail behind at speed
    const dz = pos.z - camRideZ
    camPos.z += dz
    camLook.z += dz
  }
  camRideZ = pos.z
  const k = easeStep(rate, dt)
  camPos.lerp(tmp.set(px, py, pz), k)
  camLook.lerp(tmp2.set(lx, ly, lz), k)
  camera.position.copy(camPos)
  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt)
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.6
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.6
  }
  camera.lookAt(camLook)
  // a little wider when zooming
  const fov = view.portrait ? 74 : camera.aspect < 1.4 ? 66 : 60
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = damp(camera.fov, fov, 3, dt)
    camera.updateProjectionMatrix()
  }
}

// --- Go ---------------------------------------------------------------------------------

resize()
renderToggles()
init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game }
