import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { Course, GEMS } from './course.js'
import { Dragon } from './dragon.js'
import { Friends } from './friends.js'
import { Particles, Popups, Rings } from './effects.js'
import { loadModels } from './models.js'
import { TREASURES, treasureSVG } from './treasures.js'
import { NEST_Y, World } from './world.js'
import { WORLDS, WORLD_LENGTH } from './worlds.js'

const $ = (id) => document.getElementById(id)
const rand = THREE.MathUtils.randFloat
const { clamp, damp } = THREE.MathUtils
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const easeStep = (rate, dt) => 1 - Math.exp(-rate * dt)
const stillMotion = matchMedia('(prefers-reduced-motion: reduce)')
const debug = new URLSearchParams(location.search).has('debug')

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
const baseFov = () => (view.portrait ? 66 : camera.aspect < 1.4 ? 66 : 60)
function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  view.portrait = camera.aspect < 1
  camera.fov = baseFov()
  camera.updateProjectionMatrix()
  lane.x = view.portrait ? 3.2 : camera.aspect < 1.4 ? 4.4 : 5.5
  // short sideways phones: a lower ceiling, so Ember never climbs up under the trip bar
  lane.yMax = !view.portrait && h <= 480 ? 7.2 : 8.4
  view.back = view.portrait ? 8 : 7.6
  const hpx = h * renderer.getPixelRatio()
  sparks?.setScale(hpx, camera.fov)
  dots?.setScale(hpx, camera.fov)
}
addEventListener('resize', resize)

// --- Game state -----------------------------------------------------------------------

const sound = new Sound()
const POWER_TIME = 7 // seconds of rainbow after catching the rainbow star
const game = {
  state: 'loading', // loading | title | play | nest | done | results
  z: 0, // distance flown
  speed: 0,
  slow: 1,
  gemCombo: 0, // gems caught close together climb the scale
  gemComboT: 0,
  invuln: 0,
  power: 0,
  world: 0,
  startWorld: 0,
  nestT: 0,
  time: 0,
  fireCd: 0,
  swooshCd: 0,
  shake: 0,
  flapT: 0,
  idleT: 0, // seconds since the child last touched anything (the drawn hand waits for this)
  fired: false,
  steered: false,
  done: new Set(store.get('dragon-glide-worlds', [])),
  found: [], // per world of this trip: { kind: how many caught }
  caught: [], // per world of this trip: the kinds, in the order caught
}
if (debug) window.game = game

let templates, dragon, world, course, sparks, dots, rings, popups, friends
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
  popups = new Popups($('popups'), camera)
  dragon = new Dragon(templates.dragon)
  scene.add(dragon.root)
  world = new World(scene, templates)
  // what each nest kept from the last trip (shown on its island, see World.keepsakes)
  const kept = store.get('dragon-glide-kept', {})
  world.kept = kept && typeof kept === 'object' ? kept : {}
  course = new Course(scene, templates, sparks)
  friends = new Friends(scene)
  if (debug) Object.assign(window, { course, world, dragon, pos, target, THREE, start, fire, renderer, scene, camera, aimAt })
  buildTrip()
  buildWorldButtons()
  applyQuality()
  prewarm()
  toTitle()
  renderer.setAnimationLoop(frame)
}

/**
 * Builds one of everything that appears later (each world's surprise, bubbles, treasures, birds, the
 * constellation's lines) just ahead of the camera and compiles it once, so nothing stutters the first time it shows.
 */
function prewarm() {
  Object.assign(course, { w: WORLDS[1], wi: 1, lane })
  course.bubble(0, 4, 20, 'pink')
  course.treasures(24)
  course.power(28)
  course.lanterns(30)
  course.lolly(0, 34)
  course.fireworks(36)
  course.constellation(40)
  course.rainbowRings(44)
  friends.arrive(0, pos, lane)
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 4, -40), new THREE.Vector3(1, 5, -40)]), new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending }))
  scene.add(line)
  world.addNest(1)
  camera.position.set(0, 5, 8)
  camera.lookAt(0, 4, -20)
  renderer.compile(scene, camera)
  scene.remove(line)
  line.geometry.dispose()
  line.material.dispose()
  friends.clear()
  course.reset(0)
}

// --- Screens ----------------------------------------------------------------------------

function show(id) {
  for (const s of ['loading', 'title', 'results']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', id !== null)
  // sound and music wait on the menus: in flight a mashing hand can't switch them off (M still does)
  $('corner').classList.toggle('hidden', id === 'loading' || id === null)
  document.body.dataset.screen = id ?? 'play'
}

function toTitle() {
  game.state = 'title'
  game.nestReady = false
  game.power = 0
  $('fly-on').classList.add('hidden')
  hand(null)
  game.z = 0
  game.speed = 0
  pos.set(0, 4.3, 0)
  vel.set(0, 0)
  course.reset(0)
  friends.clear()
  world.reset(0)
  world.generate(200, lane)
  camPos.set(1.2, 4.9, 6)
  camLook.set(0, 4.3, 0)
  dragon.root.rotation.y = Math.PI
  sound.play(null)
  // the title remembers the worlds Ember has flown home from, not a score to beat
  document.querySelectorAll('#worlds button').forEach((b, i) => b.classList.toggle('done', game.done.has(i)))
  show('title')
}

function buildWorldButtons() {
  const el = $('worlds')
  WORLDS.forEach((w, i) => {
    const b = document.createElement('button')
    b.textContent = w.emoji
    b.setAttribute('aria-label', `Start at ${w.name}`)
    b.onclick = () => start(i)
    el.append(b)
  })
}

function start(from = 0) {
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
  game.power = 0
  game.time = 0
  game.idleT = 0
  game.greet = false
  game.friendT = 7
  game.fired = false
  game.steered = false
  game.toldFire = -1
  game.found = WORLDS.map(() => ({}))
  game.caught = WORLDS.map(() => []) // the same, in catch order, for the bag
  pos.set(0, 4.3, -game.z)
  vel.set(0, 0)
  target.set(0, 4.3)
  course.reset(game.z)
  friends.clear()
  world.reset(game.z)
  world.addNest(from)
  // the camera swoops from Ember's face to behind
  camPos.set(1.2, 4.9, -game.z + 6)
  camLook.set(0, 4.3, -game.z)
  // the camera starts here, not at the title's spot (else a later world loses its first things and its nest)
  camRideZ = pos.z
  show(null)
  $('hud').classList.remove('resting')
  const w = WORLDS[from]
  renderBag()
  worldBanner(w)
  sound.play(w.music)
}

/** The end card ignores taps and keys for a moment, so a hand still tapping from the last nest can't skip it. */
const END_PAUSE = 2000
const endReady = () => performance.now() - game.endAt > END_PAUSE

function finishTrip() {
  game.state = 'results'
  game.endAt = performance.now()
  for (const id of down) stale.add(id)
  const nest = world.nestFor(game.world)
  if (nest) nest.cheer = 1e6
  // No grade: each world Ember flew through, with the treasures found there
  const rows = WORLDS.slice(game.startWorld, game.world + 1).map((w, k) => {
    // up to nine pictures a world, shared between its kinds, so every row stays one line
    const got = Object.entries(game.found[game.startWorld + k])
    const each = Math.ceil(9 / Math.max(1, got.length))
    const pics = got.map(([kind, n]) => `<span class="kind">${treasureSVG(kind).repeat(Math.min(n, each))}</span>`).join('')
    return `<div class="learn"><span class="w">${w.emoji}</span>${pics}</div>`
  })
  $('found').innerHTML = rows.join('')
  sound.finish()
  show('results')
}

// --- The bag: what Ember has caught in this world, as pictures --------------------------

const BAG_MAX = 8
function renderBag() {
  // the newest catches, in the order they were caught
  const kinds = game.caught[game.world] ?? []
  $('bag').innerHTML = kinds.slice(-BAG_MAX).map((k) => treasureSVG(k)).join('')
  $('bag').classList.toggle('empty', !kinds.length)
  $('bag').classList.remove('pouring')
}

function addToBag(kind) {
  const got = game.found[game.world]
  got[kind] = (got[kind] || 0) + 1
  game.caught[game.world].push(kind)
  renderBag()
  const el = $('bag').lastElementChild
  if (!el) return
  // the treasure flies from Ember down into the bag
  const to = el.getBoundingClientRect()
  tmp.copy(pos).project(camera)
  const x = (tmp.x * 0.5 + 0.5) * innerWidth
  const y = (-tmp.y * 0.5 + 0.5) * innerHeight
  const from = stillMotion.matches ? 'scale(1.4)' : `translate(${x - (to.left + to.width / 2)}px, ${y - (to.top + to.height / 2)}px) scale(1.6)`
  el.animate?.([{ transform: from, opacity: 0.4 }, { transform: 'scale(1.6)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: stillMotion.matches ? 300 : 600, easing: 'cubic-bezier(.3,.7,.4,1)' })
  // and the bag gives a happy bounce as it lands
  if (!stillMotion.matches) $('bag').animate?.([{ transform: 'none' }, { transform: 'scale(1.18) translateY(-6px)', offset: 0.4 }, { transform: 'none' }], { duration: 420, delay: 380, easing: 'ease-out' })
}

/** At the nest the bag empties: each treasure hops from the bag up toward Ember, and lands on the island. */
function emptyBag() {
  const pics = [...$('bag').children]
  $('bag').classList.add('pouring')
  tmp.copy(pos).project(camera)
  const x = (tmp.x * 0.5 + 0.5) * innerWidth
  const y = (-tmp.y * 0.5 + 0.5) * innerHeight
  pics.forEach((el, i) => {
    const b = el.getBoundingClientRect()
    const a = el.animate?.([{ transform: 'none', opacity: 1 }, { transform: `translate(${x - (b.left + b.width / 2)}px, ${y - (b.top + b.height / 2)}px) scale(0.6)`, opacity: 0 }], { duration: 650, delay: i * 90, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' })
    setTimeout(() => game.state === 'nest' && sound.treasure(i), 300 + i * 90)
    if (!a) el.remove()
  })
  return pics.length * 90 + 650
}

// --- HUD ----------------------------------------------------------------------------

let bannerTimer
/** The world's picture, big, as Ember arrives in it. */
function worldBanner(w) {
  const el = $('banner')
  el.textContent = w.emoji
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1800)
}

/**
 * A drawn hand, only when the child seems stuck: 'drag' slides a finger across the sky,
 * 'fire' taps the 🔥 button. null hides it.
 */
function hand(kind) {
  const el = $('hand')
  if ((el.dataset.kind || null) === kind) return
  el.dataset.kind = kind ?? ''
  el.classList.toggle('show', !!kind)
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
  $('sound').firstChild.textContent = sound.muted ? '🔇' : '🔊'
  $('music').classList.toggle('off', !sound.musicOn)
}

function toggleSound() {
  if (game.state === 'play' || game.state === 'nest') return
  sound.unlock()
  sound.setMuted(!sound.muted)
  renderToggles()
}

function toggleMusic() {
  if (game.state === 'play' || game.state === 'nest') return
  sound.unlock()
  sound.setMusic(!sound.musicOn)
  renderToggles()
}

// --- Input ------------------------------------------------------------------------------

const keys = new Set()
const touch = { id: null, x: 0, y: 0, t: 0, moved: 0 }
let aim = null // the finger or mouse on screen, re-aimed every frame while the camera moves

/**
 * Where the camera settles while Ember flies at (x, y, z): its place into `at`, where it looks into `look`.
 * Upright, it rides higher and tilts down, so Ember sits a little below the middle and the stream of rings and
 * treasures coming toward her fills the screen from about a third of the way down, instead of empty sky.
 */
function flightCamera(x, y, z, at, look) {
  const lift = view.portrait ? 1.6 : 0
  at.set(x * 0.55, y * 0.6 + 2.7 + lift, z + view.back)
  look.set(x * 0.8, y * 0.75 + (view.portrait ? 0.2 : 2), z - 14)
}

/**
 * Ember flies toward the point on screen at (sx, sy). The camera follows her, so her lane only fills a small
 * middle part of the screen: instead the whole sky maps onto the lane, so a touch near the top sends her to the
 * top, a touch at the side sends her to that side, and wherever the finger is she heads its way.
 */
function aimAt(sx, sy) {
  const fx = clamp((sx / innerWidth - 0.1) / 0.8, 0, 1)
  const fy = clamp((sy / innerHeight - 0.22) / 0.7, 0, 1)
  target.set(-lane.x + fx * 2 * lane.x, lane.yMax - fy * (lane.yMax - lane.yMin))
}

function steered() {
  game.steered = true
  game.idleT = 0
  if ($('hand').dataset.kind === 'drag') hand(null)
}

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock()
  game.idleT = 0
  if (game.state === 'nest' && game.nestReady) return flyOn()
  if (game.state !== 'play') return
  if (e.pointerType === 'mouse') {
    if (e.button === 0) fire()
    aim = [e.clientX, e.clientY]
    steered()
    return
  }
  if (touch.id === null) {
    // a touch anywhere on the sky: Ember flies toward it
    touch.id = e.pointerId
    touch.x = e.clientX
    touch.y = e.clientY
    touch.t = performance.now()
    touch.moved = 0
    aim = [e.clientX, e.clientY]
    aimAt(...aim)
    steered()
  }
})
addEventListener('pointermove', (e) => {
  if (game.state !== 'play') return
  if (e.pointerType === 'mouse') {
    aim = [e.clientX, e.clientY]
    steered()
    return
  }
  if (e.pointerId !== touch.id) return
  touch.moved += Math.abs(e.clientX - touch.x) + Math.abs(e.clientY - touch.y)
  touch.x = e.clientX
  touch.y = e.clientY
  // Ember follows the finger wherever it goes
  aim = [e.clientX, e.clientY]
  aimAt(...aim)
})
function endTouch(e) {
  if (e.pointerId !== touch.id) return
  // a quick tap also puffs fire toward where it was
  if (game.state === 'play' && touch.moved < 14 && performance.now() - touch.t < 350) fire()
  touch.id = null
  aim = null // Ember stays where the finger left her
}
addEventListener('pointerup', endTouch)
addEventListener('pointercancel', (e) => {
  if (e.pointerId !== touch.id) return
  touch.id = null
  aim = null
})
addEventListener('keydown', (e) => {
  sound.unlock()
  game.idleT = 0
  // Leaving and sound settings require an intentional pointer hold on every screen.
  if (e.code === 'KeyM' || e.code === 'Escape') return
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    if (e.repeat) return
    if (game.state === 'results') return endReady() ? start(game.startWorld) : undefined
    if (game.state === 'title') return start(0)
    if (e.code === 'Space') keys.add('Space') // held, it keeps puffing
    return fire()
  }
  if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault()
    steered()
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
// holding 🔥 keeps puffing
let fireHeld = false
fireBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  sound.unlock()
  game.idleT = 0
  fireHeld = true
  fireBtn.setPointerCapture?.(e.pointerId)
  fire()
})
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) fireBtn.addEventListener(ev, () => (fireHeld = false))
// Every finger on the screen, wherever it is. A hold button only works for a single finger alone: a resting
// palm (more fingers anywhere) cancels any hold and spoils new ones until every finger has lifted.
// Fingers still down from the last nest when the end card appears are ignored on it too (see finishTrip).
const down = new Set()
const stale = new Set()
const holds = [] // each hold button's cancel
// Keyboard input cancels a pointer hold; focused hold buttons never activate by keyboard.
document.addEventListener('keydown', () => {
  for (const cancel of holds) cancel()
}, true)
addEventListener('blur', () => {
  for (const cancel of holds) cancel()
})
let spoiled = false
document.addEventListener('pointerdown', (e) => {
  down.add(e.pointerId)
  if (down.size > 1) {
    spoiled = true
    for (const cancel of holds) cancel()
  }
}, true)
for (const ev of ['pointerup', 'pointercancel']) {
  document.addEventListener(ev, (e) => {
    down.delete(e.pointerId)
    stale.delete(e.pointerId)
    if (!down.size) spoiled = false
  }, true)
}

/**
 * After a hold fires the screen changes under the finger that is still down: its lift's click would land on
 * whatever is there now (▶ on the title, say). That one click is swallowed (or forgotten after half a second).
 */
function swallowNextClick() {
  const swallow = (e) => {
    e.preventDefault()
    e.stopPropagation()
    off()
  }
  const off = () => {
    document.removeEventListener('click', swallow, true)
    clearTimeout(t)
  }
  document.addEventListener('click', swallow, true)
  // (forgotten half a second after the finger lifts, or after a few seconds if it never does)
  const t = setTimeout(off, 4000)
  document.addEventListener('pointerup', () => setTimeout(off, 500), { capture: true, once: true })
}

/**
 * A button that works only when held down for `ms` by one finger alone (a ring fills round it), so a stray,
 * mashing or resting hand never ends a trip. A tap that lets go early just gives the button a little wiggle.
 * `ok(e)` may refuse a pointer. Keyboard activation is ignored, including native pointerless clicks.
 */
function holdButton(btn, ms, done, ok = () => true) {
  let timer = null
  let by = null // the finger holding it
  const cancel = () => {
    clearTimeout(timer)
    timer = null
    by = null
    btn.classList.remove('holding')
  }
  holds.push(cancel)
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    sound.unlock()
    // (the document has already counted this finger)
    if (spoiled || down.size !== 1 || !ok(e)) return
    cancel()
    by = e.pointerId
    btn.setPointerCapture?.(e.pointerId)
    btn.classList.add('holding')
    timer = setTimeout(() => {
      if (by === null) return
      cancel()
      sound.click()
      swallowNextClick()
      done()
    }, ms)
  })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const target = ev === 'lostpointercapture' ? btn : document
    target.addEventListener(ev, (e) => {
      if (by === null || e.pointerId !== by) return
      cancel()
      if (ev === 'pointerup' && !stillMotion.matches) btn.animate?.([{ rotate: '0deg' }, { rotate: '-12deg' }, { rotate: '10deg' }, { rotate: '-6deg' }, { rotate: '0deg' }], { duration: 380 })
    }, true)
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  for (const ev of ['keydown', 'keyup']) btn.addEventListener(ev, (e) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return
    e.preventDefault()
    e.stopPropagation()
  })
}
// 🏠 in a trip, and the end card's 🏠, are held down
holdButton($('home'), 700, toTitle)
holdButton($('to-title'), 700, toTitle, (e) => !stale.has(e.pointerId))

$('fly-on').addEventListener('click', flyOn)
for (const [id, toggle] of [['music', toggleMusic], ['sound', toggleSound]]) {
  const btn = $(id)
  // Match the home hold's visible progress without changing the shared stylesheet.
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  ring.setAttribute('viewBox', '0 0 100 100')
  ring.style.cssText = 'position:absolute;inset:-5px;width:calc(100% + 10px);height:calc(100% + 10px);pointer-events:none;transform:rotate(-90deg)'
  const arc = document.createElementNS(ring.namespaceURI, 'circle')
  for (const [key, value] of Object.entries({cx:50,cy:50,r:46,fill:'none',stroke:'#ffcf1a','stroke-width':6,pathLength:1,'stroke-dasharray':1,'stroke-dashoffset':1})) arc.setAttribute(key, value)
  ring.append(arc)
  btn.style.position = 'relative'
  btn.append(ring)
  let progress
  new MutationObserver(() => {
    progress?.cancel()
    if (btn.classList.contains('holding')) progress = arc.animate([{strokeDashoffset:1},{strokeDashoffset:0}], {duration:700,fill:'forwards'})
  }).observe(btn, {attributes:true,attributeFilter:['class']})
  holdButton(btn, 700, () => { toggle(); btn.append(ring) }, e => !stale.has(e.pointerId))
}
$('play').addEventListener('click', () => start(0))
// 🔁 is a tap, but only once the end card has been up a moment, and never by a finger that was already down
let againBy = null
$('again').addEventListener('pointerdown', (e) => (againBy = stale.has(e.pointerId) ? null : e.pointerId))
$('again').addEventListener('click', (e) => {
  const byKey = e.detail === 0
  if (!endReady() || (!byKey && againBy === null)) return
  againBy = null
  start(game.startWorld)
})

const FIRE_COLORS = ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0', '#ff7eb9']
function fire() {
  if (game.state === 'nest' && game.nestReady) return flyOn()
  if (game.state !== 'play' || game.fireCd > 0) return
  game.fireCd = 0.28
  game.fired = true
  if ($('hand').dataset.kind === 'fire') hand(null)
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

/**
 * A burst of glowing sparks. Glow adds up on a dark sky, so at night it is half as many and smaller:
 * a sparkle, never a white flash over Ember.
 */
function burst(at, colors, n, power, size, opts) {
  const night = WORLDS[game.world]?.night
  sparks.burst(at, colors, night ? Math.ceil(n / 2) : n, power, night ? size * 0.75 : size, opts)
}

/** A ring of light spreading from a catch: smaller and quicker at night, where it would otherwise loom over Ember. */
function ring(at, color, size, life) {
  const night = WORLDS[game.world]?.night
  rings.spawn(at, color, night ? size * 0.55 : size, night ? (life ?? 0.4) * 0.7 : life)
}

const RAINBOW = ['#ff6b6b', '#ffd23f', '#8ef0c8', '#7cc6fe', '#c9b6ff', '#ff8fc7']

function handle(events) {
  for (const ev of events) {
    if (ev.type === 'gem') {
      // gems caught close together climb the scale, so a gem trail plays a little tune
      game.gemCombo = game.gemComboT > 0 ? game.gemCombo + 1 : 0
      game.gemComboT = 1.2
      const big = ev.kind === 'big'
      sound.gem(game.gemCombo % 13, big)
      burst(ev.pos, GEMS[ev.kind].colors, big ? 12 : 6, big ? 4 : 3, big ? 0.7 : 0.5, { vz: -game.speed * 0.6 })
    } else if (ev.type === 'hoop') {
      sound.hoop(ev.n)
      const c = WORLDS[game.world].hoop.hoop_cloud
      ring(ev.pos, typeof c === 'string' ? c : c.color, 5, 0.8)
      burst(ev.pos, RAINBOW, 14, 4, 0.6, { vz: -game.speed * 0.5 })
      // the third ring of a run earns a happy barrel roll
      if (ev.n === 2) dragon.twirl()
    } else if (ev.type === 'treasure') {
      sound.treasure(ev.n)
      const color = TREASURES[ev.kind].color
      ring(ev.pos, color, 3, 0.5)
      burst(ev.pos, [color, '#ffffff', '#fff3a0'], 10, 3.5, 0.55, { vz: -game.speed * 0.6 })
      if (ev.n === 3) dragon.twirl()
      dragon.yum()
      friends.cheer()
      addToBag(ev.kind)
    } else if (ev.type === 'boing') {
      // a lollipop boop: Ember springs off it, with sprinkles, and no dizzy spin
      sound.boing()
      dragon.yum()
      tmp2.set(pos.x - ev.pos.x, pos.y - ev.pos.y, 0)
      if (tmp2.lengthSq() < 0.01) tmp2.set(pos.x >= 0 ? -1 : 1, 0.5, 0)
      tmp2.normalize()
      vel.x += tmp2.x * 14
      vel.y += tmp2.y * 10 + 4
      target.x = clamp(pos.x + tmp2.x * 3, -lane.x, lane.x)
      target.y = clamp(pos.y + tmp2.y * 2.5 + 1, lane.yMin, lane.yMax)
      burst(ev.pos, ['#ff5c9a', '#4cc9f0', '#ffd23f', '#8ef0c8', '#ffffff'], 16, 5, 0.5, { vz: -game.speed * 0.3 })
    } else if (ev.type === 'brush') {
      if (ev.kind === 'gumdrop') sound.squeak()
      else sound.flutter()
      burst(ev.pos, ev.kind === 'gumdrop' ? ['#ffffff', '#ffd1e8'] : ['#fff3a0', '#ffffff'], 6, 2.5, 0.4, { vz: -game.speed * 0.4 })
    } else if (ev.type === 'flag') {
      sound.flutter(false)
    } else if (ev.type === 'whizz') {
      sound.whizz()
    } else if (ev.type === 'boom') {
      // a firework opens in the sunset sky: soft, slow-fading colour, no flash
      sound.boom()
      const colors = [ev.color, '#ffffff', '#fff3a0']
      burst(ev.pos, colors, 36, 7, 0.75, { grav: -1.2 })
      dots.burst(ev.pos, [ev.color, '#ffffff'], 24, 5, 0.35, { grav: -1.5 })
      ring(ev.pos, ev.color, 7, 0.9)
    } else if (ev.type === 'star') {
      sound.twinkle(ev.n, ev.all)
      burst(ev.pos, ['#fff3a0', '#ffffff', '#c9d4ff'], ev.all ? 20 : 8, 3, 0.5, { vz: -game.speed * 0.4 })
      if (ev.all) {
        dragon.twirl()
        friends.cheer()
      }
    } else if (ev.type === 'bubble') {
      sound.pop()
      burst(ev.pos, RAINBOW, 12, 4, 0.6, { vz: -game.speed * 0.4 })
      ring(ev.pos, '#bdeaff', 3.5)
    } else if (ev.type === 'lantern') {
      sound.lantern()
      burst(ev.pos, ['#fff3a0', '#ffd23f', '#ff9f43'], 10, 3, 0.7, { vz: -game.speed * 0.3 })
    } else if (ev.type === 'power') {
      game.power = POWER_TIME
      sound.power()
      friends.cheer()
      dragon.twirl()
      burst(ev.pos, RAINBOW, 24, 5, 0.8)
      ring(ev.pos, '#fff3a0', 6, 0.9)
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
      popups.show(tmp.set(pos.x, pos.y + 1.6, pos.z), '💫')
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        sparks.emit(pos.x + Math.cos(a) * 0.9, pos.y + 1.1, pos.z + Math.sin(a) * 0.9, { vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5 - game.speed * 0.4, vy: 0.5, spread: 0.3, life: 1, size: 0.5, color: '#fff3a0', drag: 1 })
      }
    }
  }
}

// --- Nests ------------------------------------------------------------------------------

const NEST_HALF_WIDTH = 4.8 // the parents' wing tips (as they cheer) and the keepsake row reach about this far each side
const FACES_Y = NEST_Y + 5.4 // the parents' heads as they hop and cheer (wing tips may go higher)
// the lowest thing to keep in view is the keepsake row on the island's front ([height, nearer by])
const KEPT_FLOOR = [NEST_Y + 0.3, 2.2]

function arriveAtNest() {
  game.state = 'nest'
  game.nestT = 0
  game.power = 0
  hand(null)
  friends.leave()
  const nest = world.nestFor(game.world)
  if (nest) nest.cheer = 4.2
  game.done.add(game.world)
  store.set('dragon-glide-worlds', [...game.done])
  sound.fanfare()
  // The family's roars wait for Ember to land: a trip left in the meantime keeps them quiet.
  setTimeout(() => game.state === 'nest' && sound.rawr(0.8), 500)
  setTimeout(() => game.state === 'nest' && sound.rawr(1.3), 800)
  // a happy hop into the nest
  dragon.hop = 1
  // the treasures from the bag hop out and land on the island in front of the family
  game.nestKeep = Object.keys(game.found[game.world]).length ? 1.1 : null
}

/** The bag's treasures land on the nest's island, with a sparkle, and the family keeps them for next time. */
function keepTreasures() {
  const wi = game.world
  const got = game.found[wi]
  const nest = world.nestFor(wi)
  const ms = emptyBag()
  setTimeout(() => {
    if (game.state !== 'nest' || game.world !== wi || !nest) return
    world.kept[wi] = { ...got }
    store.set('dragon-glide-kept', world.kept)
    world.keepsakes(nest, got)
    $('bag').replaceChildren()
    $('bag').classList.add('empty')
    if (nest.kept) {
      nest.kept.getWorldPosition(tmp)
      burst(tmp, RAINBOW, 18, 3, 0.5, { grav: -1 })
    }
  }, ms)
}

/** The family has had their cuddle: the child decides when Ember flies on. */
function offerFlyOn() {
  game.nestReady = true
  const last = game.world === WORLDS.length - 1
  // the next world's picture sits on a little night-sky chip, so a yellow moon still shows on the yellow button
  $('fly-on').innerHTML = last ? '▶' : `▶ <span class="next">${WORLDS[game.world + 1].emoji}</span>`
  $('fly-on').setAttribute('aria-label', last ? 'See the trip' : `Fly on to ${WORLDS[game.world + 1].name}`)
  $('fly-on').classList.remove('hidden')
}

function flyOn() {
  if (game.state !== 'nest' || !game.nestReady) return
  sound.click()
  game.nestReady = false
  $('fly-on').classList.add('hidden')
  if (game.world < WORLDS.length - 1) leaveNest()
  else {
    game.state = 'done'
    sound.play(null)
    finishTrip()
  }
}

function leaveNest() {
  world.leaveNest(game.world)
  game.world++
  game.state = 'play'
  game.speed = 2
  game.idleT = 0
  game.toldFire = -1
  const w = WORLDS[game.world]
  world.addNest(game.world)
  $('hud').classList.remove('resting')
  renderBag()
  // the new world's picture waits until Ember is under the new sky (updatePlay)
  game.greet = true
  game.friendT = 8
  sound.play(w.music)
  target.set(0, 4.5)
}

// --- Main loop ----------------------------------------------------------------------------

const AIR = { vx: 0, vy: 0, vz: 0, spread: 0.05, life: 1.6, size: 0.18, color: '#ffffff', drag: 0 }
const TRAIL = { vx: 0, vy: 0, vz: 0, spread: 0.1, life: 0.55, size: 0.2, endSize: 0.05, color: '#ffffff', drag: 1 }
const WISP = { vx: 0, vy: 0, vz: 0, spread: 0.1, life: 0.5, size: 0.3, endSize: 0, color: '#ffffff', drag: 2 }
let last = performance.now()

function frame() {
  const now = performance.now()
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  tick(dt)
  renderer.render(scene, camera)
}

// ?debug: sim(seconds) runs the game forward without rendering (background tabs don't animate)
if (debug) window.sim = (secs, draw = true, dt = 1 / 30) => {
  for (let t = 0; t < secs; t += dt) tick(dt)
  if (draw) renderer.render(scene, camera)
  return { z: game.z, state: game.state, world: game.world, found: game.found }
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
  // a touch smaller on upright screens, where she would otherwise cover the narrow view ahead
  dragon.root.scale.setScalar(damp(dragon.root.scale.x, view.portrait && game.state === 'play' ? 0.85 : 1, 3, dt))
  const faceCamera = game.state === 'play' || (game.state === 'nest' && game.nestT < 0) ? 0 : Math.PI
  dragon.root.rotation.y += (faceCamera - dragon.root.rotation.y) * easeStep(5, dt)
  dragon.update(dt, { vx: playing ? vel.x : 0, vy: playing ? vel.y : 0, flap: playing ? 1 + (game.power > 0 ? 0.6 : 0) : 0.6 })
  // a soft whoosh on each big wing beat
  if (playing) {
    game.flapT += dt * dragon.flapRate
    if (game.flapT > Math.PI * 2) {
      game.flapT -= Math.PI * 2
      sound.flap()
    }
  }

  const behindZ = camera.position.z + 25
  handle(course.update(dt, pos, prevZ, game.time, { magnet: game.power > 0, invulnerable: game.invuln > 0 || game.power > 0, playing, behindZ }))
  world.generate(game.z + 185, lane)
  course.generate(game.z + 180, lane)

  if (friends.update(dt, pos, lane)) sound.chirp(0.6)
  updateCamera(dt)
  world.update(dt, camera, game.z)
  sparks.update(dt)
  dots.update(dt)
  rings.update(dt)
}

/** A shooting star streaks across the far night sky every so often, leaving a sparkly tail. */
const shooting = { wait: 4, t: -1, from: new THREE.Vector3(), to: new THREE.Vector3() }
const STREAK = { vx: 0, vy: 0, vz: 0, spread: 0.3, life: 0.9, size: 1.6, endSize: 0, color: '#fff6c9', drag: 1 }
function shootingStars(dt) {
  if (shooting.t < 0) {
    if ((shooting.wait -= dt) > 0) return
    const dir = Math.random() < 0.5 ? 1 : -1
    shooting.from.set(-dir * rand(10, 30), pos.y + rand(16, 26), pos.z - rand(70, 100))
    shooting.to.copy(shooting.from).add(tmp2.set(dir * rand(28, 40), -rand(8, 12), 0))
    shooting.t = 0
    sound.shoot()
  }
  shooting.t += dt / 1.1
  const k = Math.min(1, shooting.t)
  tmp2.lerpVectors(shooting.from, shooting.to, k)
  // it rides along with the flight, so it crosses the sky instead of falling behind
  tmp2.z -= game.speed * shooting.t * 1.1
  for (let i = 0; i < 2; i++) sparks.emit(tmp2.x, tmp2.y, tmp2.z, STREAK)
  if (k >= 1) {
    shooting.t = -1
    shooting.wait = rand(5, 11)
  }
}

function updatePlay(dt) {
  const w = WORLDS[game.world]
  game.fireCd -= dt
  if ((fireHeld || keys.has('Space')) && game.fireCd <= 0) fire()
  game.swooshCd -= dt
  game.gemComboT -= dt
  game.idleT += dt
  game.invuln = Math.max(0, game.invuln - dt)
  game.slow = Math.min(1, game.slow + dt * 0.6)
  if (game.power > 0 && (game.power -= dt) <= 0) sound.powerDown()
  // (the sky blends over the first 50 steps of a world: the picture shows once it is mostly the new one)
  if (game.greet && game.z - game.world * WORLD_LENGTH > 36) {
    game.greet = false
    worldBanner(WORLDS[game.world])
  }
  // the night sky has shooting stars, now and then
  if (w.night) shootingStars(dt)
  // now and then a little flock of birds comes to keep Ember company
  if ((game.friendT -= dt) <= 0 && !friends.active) {
    friends.arrive(game.world, pos, lane)
    sound.chirp()
    game.friendT = 26
  }

  // The drawn hand only shows when the child seems stuck: no steering yet after a few still seconds,
  // or a lantern or bubble coming and fire never tried (once a world)
  if (!game.steered && game.idleT > 4) hand('drag')
  else if (!game.fired && game.steered && game.toldFire !== game.world && game.time > 8 &&
    course.items.some((it) => it.fireTarget && !it.done && it.z < pos.z - 16 && it.z > pos.z - 40)) {
    game.toldFire = game.world
    hand('fire')
    setTimeout(() => $('hand').dataset.kind === 'fire' && hand(null), 4000)
  }

  // One easy speed in every world, a little quicker with the rainbow star
  const cruise = w.speed * game.slow * (game.power > 0 ? 1.25 : 1)
  game.speed = damp(game.speed, cruise, 1.5, dt)
  game.z += game.speed * dt

  // Steering: keys nudge the target, mouse points at it, fingers drag it
  const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
  const ky = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0)
  if (kx || ky) {
    aim = null
    target.x = clamp(target.x + kx * 9 * dt, -lane.x, lane.x)
    target.y = clamp(target.y + ky * 7 * dt, lane.yMin, lane.yMax)
  } else if (aim) aimAt(aim[0], aim[1])
  target.x = clamp(target.x, -lane.x, lane.x)
  const stiff = game.invuln > 0.8 ? 14 : 38
  const damping = game.invuln > 0.8 ? 5 : 10
  vel.x += ((target.x - pos.x) * stiff - vel.x * damping) * dt
  vel.y += ((target.y - pos.y) * stiff - vel.y * damping) * dt
  pos.x = clamp(pos.x + vel.x * dt, -lane.x - 0.8, lane.x + 0.8)
  pos.y = clamp(pos.y + vel.y * dt, lane.yMin - 0.4, lane.yMax + 0.6)
  pos.z = -game.z

  // A big swoop gets a whoosh and wisps off the wing tips
  const swoop = Math.hypot(vel.x * 0.8, vel.y)
  if (swoop > 7) {
    if (game.swooshCd <= 0) {
      game.swooshCd = 0.7
      sound.swoosh(vel.y > 0)
    }
    if (Math.random() < 0.6) {
      WISP.vz = -game.speed * 0.5
      for (const side of [-1, 1]) sparks.emit(pos.x + side * 1.1, pos.y + 0.3, pos.z + 0.6, WISP)
    }
  }
  // the rainbow star leaves two thin rainbows from Ember's wing tips, low and to the sides so they never
  // cover the way ahead (solid dots, so the colours stay bright instead of adding up to white)
  if (game.power > 0) {
    TRAIL.vz = -game.speed * 0.8
    TRAIL.color = RAINBOW[(game.time * 12) % RAINBOW.length | 0]
    for (const side of [-1, 1]) dots.emit(pos.x + side * 1.2, pos.y - 0.1, pos.z + 0.3, TRAIL)
  }
  // drifting air sparkles rush past and sell the speed
  if (Math.random() < dt * 8) {
    AIR.color = w.night ? '#fff6c9' : '#ffffff'
    sparks.emit(pos.x + rand(-14, 14), pos.y + rand(-6, 8), pos.z - rand(30, 60), AIR)
  }

  // Reached the nest?
  const nestZ = (game.world + 1) * WORLD_LENGTH
  if (game.z > nestZ - 55) {
    game.state = 'nest'
    hand(null)
    $('hud').classList.add('resting') // 🔥 rests while the family celebrates
    game.nestT = -1 // flying in
  }
  sound.wind(clamp(game.speed / 25, 0, 1))
  showTrip()
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
    // a short soft shower while the family cheers
    const cheering = game.nestT < 1.6
    if (cheering && Math.random() < dt * 5) {
      const c = RAINBOW[(Math.random() * RAINBOW.length) | 0]
      dots.emit(rand(-5, 5), NEST_Y + rand(7, 9), -nestZ + rand(-2, 2), { vx: rand(-1, 1), vy: rand(-1, -2.5), spread: 1, life: 1.3, size: rand(0.3, 0.45), endSize: 0, color: c, grav: -1.2, drag: 0.4 })
    }
    if (cheering && Math.random() < dt * 2) {
      sparks.emit(rand(-1.5, 1.5), seatY + 1.5, -nestZ + 0.5, { vx: 0, vy: 2, spread: 0.6, life: 1.2, size: 0.7, color: '#ff8fc7', drag: 0.5 })
    }
    if (game.nestKeep != null && game.nestT > game.nestKeep) {
      game.nestKeep = null
      keepTreasures()
    }
    // No timer moves on: after the cheer, the family waits with Ember until the child taps.
    if (game.nestT > 3 && !game.nestReady) offerFlyOn()
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

/** The top of ▶ (where it stands, or will stand), so the keepsakes on the island's front stay above it. */
let flyOnTop = 0
function nestFloorPx() {
  const box = $('fly-on').getBoundingClientRect()
  if (box.height) flyOnTop = innerHeight - box.top
  return innerHeight - (flyOnTop || 124)
}
/** The end card's rows above and its buttons below: the room left for the family between them. */
function endCardRoom() {
  if (game.state !== 'results') return [0, 0]
  const rows = $('found').getBoundingClientRect()
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
    const side = s === 'results' ? sideShift() : 0
    // on the end card the moon steps out from behind the rows (upright: right out of the picture);
    // at the nest it rests up on the right
    world.moonAside = s === 'results' && !side ? (view.portrait ? -260 : -150) : s === 'nest' ? (view.portrait ? 140 : 70) : 0
    px = 1.6 - side
    py = NEST_Y + 3.6
    // on the wide end card the camera steps back a little, so the family fits between the rows and the buttons
    pz = nestZ + (view.portrait ? 11 : side ? 8.4 : s === 'results' ? 10.6 : 7.2)
    // narrow upright screens: step back until the parents' wing tips and the keepsake row fit across
    if (view.portrait) pz = Math.max(pz, nestZ + NEST_HALF_WIDTH / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect))
    lx = -side
    ly = NEST_Y + (s === 'nest' ? (view.portrait ? 3.1 : 2.7) : 1.9)
    lz = nestZ
    // the family fits between what covers the top of the screen (the end card's rows) and the bottom (▶, or the buttons)
    const [top, bottom] = s === 'nest' ? [0, nestFloorPx()] : side ? [0, 0] : endCardRoom()
    if (top || bottom) {
      // the camera steps back until the parents' faces and the nest fit in that room, then tilts as little
      // as it can so the faces stay under the top and the nest stays above the bottom
      const t = Math.tan((camera.fov * Math.PI) / 360)
      const room = Math.atan((1 - (2 * (top + 10)) / innerHeight) * t)
      const low = Math.atan((bottom ? 1 - (2 * (bottom - 8)) / innerHeight : -0.82) * t)
      let d = pz - nestZ
      const [fy, fz] = s === 'nest' ? KEPT_FLOOR : [NEST_Y - 0.3, 0]
      const floor = (d) => Math.atan2(fy - py, d - fz)
      while (d < pz - nestZ + 12 && Math.atan2(FACES_Y - py, d) - floor(d) > room - low) d += 0.25
      // the camera's tilt: faces under the top edge first, then (if there is room) the nest above the bottom
      const p0 = Math.atan2(ly - py, pz - nestZ)
      const p = Math.max(Math.atan2(FACES_Y - py, d) - room, bottom ? Math.min(p0, floor(d) - low) : p0)
      if (Math.abs(p - p0) > 1e-4) {
        ly = py + d * Math.tan(p)
        pz = nestZ + d
      }
    }
    rate = 2
  } else {
    flightCamera(pos.x, pos.y, pos.z, tmp, tmp2)
    ;[px, py, pz, lx, ly, lz] = [tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z]
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
  // a touch wider while the rainbow star zooms Ember along
  const fov = baseFov() + (game.power > 0 && s === 'play' ? 5 : 0)
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
