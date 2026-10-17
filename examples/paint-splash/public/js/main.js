import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { joinRoom } from 'https://bitgames.store/vendor/bitgames/multiplayer-1.js'
import { PLACES, PLACE_IDS, buildArena } from './arena.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { ITEM_KINDS, Items, STAMP_EMOJI } from './items.js'
import { HALF_D, HALF_W, NX, NZ, MIXED, MIXES, POTS, PaintMap, RAINBOW, RAINBOW_POT, SEAT_COLORS, SEAT_PAINT, STAMP_SHAPES, TOKEN_SHAPES, potHex } from './paint.js'
import { OUTLINES, OUTLINE_EMOJI, buildOutline, insidePolygon, outlinePolygon } from './outline.js'
import { VISITORS, Visitor } from './visitors.js'
import { createPictures } from './pictures.js'
import { ANIMALS, ANIMAL_IDS, COLLIDE_AHEAD, COLLIDE_R, MAX_SPEED, Painter, newStats } from './painter.js'
import { clamp, damp, easeInOut, store } from './util.js'

const params = new URLSearchParams(location.search)
const DEBUG = params.has('debug')
const $ = (id) => document.getElementById(id)
const ROUND_SECONDS = (DEBUG && Number(params.get('seconds'))) || 75
/** How long the host waits for slow devices to build the playground before starting anyway. */
const READY_TIMEOUT = 10000
/** Rollers paint in short strokes; each is one event every device applies. */
const STROKE_MS = 40
const SEND_MS = 100
const SNAP_MS = 66
const RAINBOW_MS = 6000
const REVEAL_MS = 2600
/** Once the camera has settled over the finished picture, it goes into My pictures by itself. */
const AUTO_KEEP_MS = 1500
/** The dragging finger shows when a child hasn't rolled yet (after a moment) or stops for a long while. */
const FIRST_HINT_MS = 2500
const IDLE_HINT_MS = 20000
/** Seconds between new pickups (min, extra random): something new to roll into every little while. */
const PICKUP_WAIT = { bucket: [5, 5], water: [10, 8], rainbow: [14, 8], stamp: [9, 6], giant: [14, 8] }
/** Every round has buckets plus two surprises picked from these, so no two rounds feel the same. */
const EXTRAS = ['stamp', 'giant', 'rainbow', 'water']
/** A stamp roller prints a star, heart or paw this often (metres rolled), for this long. */
const STAMP_EVERY = 2.3
const STAMP_MS = 8000
/** A thrown paint ball: how big its splat is. */
const THROW_R = 1.6
/** With no clock, robots wait (and hop) when the child hasn't moved for this long, so the picture stays the child's. */
const ROBOT_WAIT_MS = 5000
const ROBOT_SHOW_MS = 7000
/** Robots paint a narrower stripe than a child, and lift their roller right next to a child, so the child's paint stays the child's. */
const ROBOT_STRIPE = 0.62
const ROBOT_GAP = 3.2
/** Past this much of the ground painted, robots stop painting stripes (they still roll about and play). */
const ROBOT_FULL = 0.4
/**
 * Two ways to paint. The default has no clock: the picture is done when a child taps 🖼️.
 * The quick round (⏳) is a 75 s paint with four painters, until the sand runs out.
 * Both have paint buckets, water puddles and rainbow puddles to roll into.
 */
const MODES = {
  calm: { painters: 3 },
  timed: { painters: 4 },
}
/** A mixed colour counts as found once it covers about this many cells (a few roller-widths). */
const FOUND_CELLS = 120
/** How long a new colour's blob shows at the top. */
const NOTE_MS = 2600
/** A tapped splat: its size, and the rest before the next one (so taps make splats, not a flood). */
const TAP_SPLAT_R = 2
const TAP_SPLAT_MS = 380
/** Seats start in the four corners, facing the middle. Seat 0 is nearest the camera on the left. */
const START = [[-7.5, 4.5], [7.5, 4.5], [-7.5, -4.5], [7.5, -4.5]]

// --- Renderer, scene, camera -------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.0
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400)
camera.position.set(0, 30, 30)
scene.add(new THREE.HemisphereLight('#ffffff', '#c8b8a0', 1.1))
const sun = new THREE.DirectionalLight('#fff6e6', 1.9)
sun.position.set(-10, 25, 14)
scene.add(sun)
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#7cc6f2') }, bottom: { value: new THREE.Color('#fff1d6') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(vP.y * 1.8 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
})
scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), skyMaterial))

/**
 * Adaptive resolution aiming for ~50 fps: a tablet that can't keep up renders
 * fewer pixels rather than dropping frames, and gets them back when there's room.
 */
const quality = { level: 2, frames: 0, time: 0, holdUntil: 0, drops: 0 }
const QUALITY_PIXELS = [0.7, 1, Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2)]
function applyQuality() {
  renderer.setPixelRatio(QUALITY_PIXELS[quality.level])
  resize()
}
function measureQuality(realDt, now) {
  quality.frames++
  quality.time += realDt
  if (quality.time < 2.5) return
  const fps = quality.frames / quality.time
  quality.frames = quality.time = 0
  if (fps < 45 && quality.level > 0) {
    quality.level--
    quality.drops++
    quality.holdUntil = now + 8000 * quality.drops
    applyQuality()
  } else if (fps > 57 && quality.level < 2 && now > quality.holdUntil) {
    quality.level++
    quality.holdUntil = now + 5000
    applyQuality()
  }
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
applyQuality()

const audio = new Audio()
const effects = new Effects(scene)
const paint = new PaintMap()
const items = new Items(scene)
const input = new Input($('stick'), $('knob'))

// A bobbing gold star over your own painter (tilted to face the camera), so you always know which one is you.
const meMarker = new THREE.Group()
{
  const star = new THREE.Shape()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, r = k % 2 ? 0.26 : 0.6
    if (k) star.lineTo(Math.sin(a) * r, Math.cos(a) * r)
    else star.moveTo(Math.sin(a) * r, Math.cos(a) * r)
  }
  const geo = new THREE.ExtrudeGeometry(star, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }).center()
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb703', emissiveIntensity: 0.35, roughness: 0.35 })
  const mesh = new THREE.Mesh(geo, mat)
  // Facing the camera, which looks down from the south.
  mesh.rotation.x = -0.75
  meMarker.add(mesh)
  meMarker.userData.mat = mat
  meMarker.visible = false
  meMarker.scale.setScalar(0.95)
  scene.add(meMarker)
}
const meRing = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.85, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }))
meRing.renderOrder = 2
meRing.visible = false
scene.add(meRing)

// --- Game state ----------------------------------------------------------------------------

/** Every visit starts with sound and music on (a mute pressed during play is never saved). */
const settings = { sound: true, music: true }
audio.setMuted(!settings.sound)
audio.musicOn = settings.music

const game = {
  room: null,
  hostId: null,
  players: new Map(), // id -> { id, animal }, in seat order
  myAnimal: store.get('paint-splash-animal', null),
  place: store.get('paint-splash-place', 'square'),
  state: 'loading', // loading | menu | waiting | building | syncing | countdown | play | reveal | results
  setup: null,
  arena: null,
  painters: new Map(), // id -> Painter
  bots: [],
  me: null,
  roundStart: 0,
  revealAt: 0,
  outbox: [],
  lastSend: 0,
  lastSnap: 0,
  lastHud: 0,
  itemSeq: 0,
  itemWait: { bucket: 0, rainbow: 8, water: 3 },
  pendingGrab: new Set(),
  stats: new Map(), // seat -> stats from every device (host)
  final: null,
  ready: new Set(),
  timers: new Set(),
  queue: [], // messages that arrived before the models loaded
  roundQueue: [], // round messages that arrived while the playground was being built
  assetsReady: false,
  templates: {},
  placeScenes: {},
  lastMoveAt: 0,
  build: 0,
  keptRound: null,
  mode: 'calm', // the menu choice: calm (no clock) | timed (the quick 75 s round)
  found: [], // mixed colours found this round, in order
  notes: [], // new colours waiting to be shown
  noteAt: -Infinity,
  splatAt: -Infinity,
  moments: [], // the surprises this child met this round, as pictures
  resultsAt: -Infinity,
  otherTapAt: -Infinity,
  rainbowStep: 0,
  balls: [], // paint balls in the air
  visitors: [], // the place's visitor (a cow, a beach ball) wandering through
  visitAt: Infinity,
}
const modeOf = () => (game.setup?.mode === 'timed' ? 'timed' : 'calm')

// Opening (or closing) the picture wall lets go of the roller so the animal stops.
function releaseControls() {
  input.release()
  input.keys.clear()
  if (game.me) game.me.controls = { x: 0, z: 0 }
}
const gallery = createPictures({
  renderer, scene, camera, openButton: $('gallery-open'), onOpen: releaseControls,
  hideInPicture: () => [effects.drops.mesh, effects.sparks.mesh, effects.confetti.mesh, meMarker, meRing],
})

const isHost = () => game.room && game.hostId === game.room.selfId
const roundId = () => game.setup?.r ?? 0
/** Wall-clock ms (debug `sim` can push it forward to run the game faster than real time). */
let clockSkew = 0
const now = () => performance.now() + clockSkew
/** Game time in ms since GO: the clock every paint event is stamped with. */
const gameTime = () => Math.max(1, Math.round(now() - game.roundStart))

function later(fn, ms) {
  const id = setTimeout(() => {
    game.timers.delete(id)
    fn()
  }, ms)
  game.timers.add(id)
  return id
}
function clearTimers() {
  for (const id of game.timers) clearTimeout(id)
  game.timers.clear()
}

// --- Assets ------------------------------------------------------------------------------------

const loader = new GLTFLoader()

async function loadModels() {
  const [painters, props] = await Promise.all([loader.loadAsync('./models/painters.glb'), loader.loadAsync('./models/props.glb')])
  for (const id of ANIMAL_IDS) {
    const node = painters.scene.children.find((c) => c.name.startsWith(`painter_${id}`))
    if (node) game.templates[id] = node
  }
  items.attach(props.scene)
}

const placeLoads = {}
function loadPlace(id) {
  placeLoads[id] ??= loader.loadAsync(`./models/place_${id}.glb`).then(
    (g) => (game.placeScenes[id] = g.scene),
    (err) => {
      // Missing scenery never stops the painting: the ground is drawn by the game.
      console.warn('place failed to load', id, err)
      delete placeLoads[id]
      return null
    },
  )
  return placeLoads[id]
}

const retries = []
async function withRetry(load) {
  for (;;) {
    try {
      return await load()
    } catch (err) {
      console.warn(err)
      $('load-error').classList.remove('hidden')
      $('retry').classList.remove('hidden')
      await new Promise((resolve) => retries.push(resolve))
    }
  }
}
$('retry').onclick = () => {
  $('retry').classList.add('hidden')
  $('load-error').classList.add('hidden')
  for (const again of retries.splice(0)) again()
}

// --- Screens & menu -------------------------------------------------------------------------

function show(screen) {
  for (const id of ['loading', 'menu', 'waiting']) $(id).classList.toggle('hidden', id !== screen)
  $('hud').classList.toggle('hidden', !['syncing', 'countdown', 'play'].includes(game.state))
  $('results').classList.toggle('hidden', game.state !== 'results')
}

const validAnimal = (a) => typeof a === 'string' && Object.hasOwn(ANIMALS, a)
const seatOf = (id) => [...game.players.keys()].indexOf(id)

function renderPlayers() {
  const self = game.room?.selfId
  const html = [...game.players.values()]
    .slice(0, 4)
    .map((p, i) => `<span class="player${p.id === self ? ' me' : ''}"><i class="dot" style="background:${SEAT_COLORS[i]}"></i>${validAnimal(p.animal) ? ANIMALS[p.animal].emoji : '🙂'}${p.id === self ? '<small>⭐</small>' : ''}</span>`)
    .join('')
  // Playing alone, the friends row stays hidden; it appears when a friend joins.
  $('players').innerHTML = game.players.size > 1 ? html : ''
  $('players').classList.toggle('hidden', game.players.size < 2)
  $('players-waiting').innerHTML = html
  renderAnimals()
}

/** Four animals to tap. Friends' colours show on the animals they picked; two friends can pick the same one. */
function renderAnimals() {
  const self = game.room?.selfId
  const friends = new Map()
  ;[...game.players.values()].slice(0, 4).forEach((p, i) => {
    if (p.id !== self && validAnimal(p.animal)) friends.set(p.animal, (friends.get(p.animal) ?? '') + `<i style="background:${SEAT_COLORS[i]}"></i>`)
  })
  const html = ANIMAL_IDS.map((id) => `<button class="animal ${id === game.myAnimal ? 'selected' : ''}" data-animal="${id}" aria-label="${ANIMALS[id].name}">${ANIMALS[id].emoji}${friends.has(id) ? `<span class="taken">${friends.get(id)}</span>` : ''}</button>`).join('')
  for (const el of [$('animals'), $('animals-waiting')]) el.innerHTML = html
  for (const el of document.querySelectorAll('[data-animal]')) el.onclick = () => pickAnimal(el.dataset.animal)
}

function pickAnimal(animal) {
  if (!validAnimal(animal) || !game.room) return
  audio.unlock()
  audio.voice(animal)
  game.myAnimal = animal
  store.set('paint-splash-animal', animal)
  const me = game.players.get(game.room.selfId)
  if (me) me.animal = animal
  if (isHost()) broadcastPlayers()
  else send({ t: 'pick', animal })
  renderPlayers()
}

function buildMenu() {
  $('places').innerHTML = PLACE_IDS.map((id) => `<button class="place ${id === game.place ? 'selected' : ''}" data-place="${id}" style="background:${PLACES[id].color}" aria-label="${PLACES[id].name}"><span class="emoji">${PLACES[id].emoji}</span></button>`).join('')
  for (const el of document.querySelectorAll('[data-place]')) {
    el.onclick = () => {
      audio.unlock()
      audio.click()
      game.place = el.dataset.place
      store.set('paint-splash-place', game.place)
      document.querySelectorAll('[data-place]').forEach((b) => b.classList.toggle('selected', b === el))
      loadPlace(game.place)
    }
  }
  $('go').onclick = () => {
    audio.unlock()
    hostStartRound()
  }
  // On the results, ▶ waits a moment (taps still streaming in from painting don't start a new picture),
  // and 🗺️ (leaving for the menu) needs a short hold.
  $('again').onclick = () => {
    audio.unlock()
    if (now() - game.resultsAt < RESULTS_GUARD_MS) return
    hostStartRound()
  }
  holdToPress($('change'), () => {
    audio.unlock()
    if (!isHost() || game.state !== 'results') return
    send({ t: 'menu' })
    enterLobby()
  }, { always: true, ms: 500 })
  $('mode').onclick = () => {
    audio.unlock()
    audio.click()
    setMode(game.mode === 'timed' ? 'calm' : 'timed')
  }
  setMode('calm')
  for (const el of document.querySelectorAll('[data-pot]')) el.onclick = () => choosePot(Number(el.dataset.pot))
  // 🖼️ (finished) only counts as a tap on its own: not within a second of other taps (a mash).
  $('finish').onclick = () => {
    if (now() - game.otherTapAt < FINISH_QUIET_MS) return
    askFinished()
  }
  addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('#finish')) game.otherTapAt = now()
  }, true)
  holdToPress($('finish-yes'), () => finishPicture(), { always: true, ms: 500 })
  $('finish-no').onclick = () => {
    audio.click()
    closeFinishAsk()
  }
  holdToPress($('home'), () => goHome())
  // While painting, 🎵 and 🔊 need a short hold too, so a mashing child never mutes the game by accident.
  holdToPress($('music'), () => {
    audio.unlock()
    settings.music = !settings.music
    audio.setMusic(settings.music)
    updateToggles()
  })
  holdToPress($('sound'), () => {
    audio.unlock()
    settings.sound = !settings.sound
    audio.setMuted(!settings.sound)
    updateToggles()
  })
  $('splat').onclick = () => tapSplat()
  // The finished picture is kept by itself; 🖼️ shows it in My pictures (keeping it first if it's early).
  $('results-save').onclick = () => {
    audio.unlock()
    keepFinishedPicture(false)
    gallery.show()
  }
  updateToggles()
  input.on('key', (k) => {
    audio.unlock()
    if (k === ' ' && game.state === 'play') tapSplat()
    const pot = { 1: 1, 2: 2, 3: 4, 4: RAINBOW_POT, r: 1, y: 2, b: 4 }[k]
    if (pot && game.state === 'play') choosePot(pot)
    // Escape goes home from the other screens; while painting it is ignored (a stray key never ends the picture).
    if (k === 'escape' && game.state !== 'play') goHome()
  })
  input.on('touch', () => {
    audio.unlock()
    game.lastMoveAt = now()
    $('hint').classList.add('hidden')
  })
  input.on('tap', (at) => tapSplat(at))
  addEventListener('pointerdown', () => audio.unlock())
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))
}

/** The menu choice: no clock (default) or the quick round. Not remembered: every visit starts calm. */
function setMode(mode) {
  game.mode = mode === 'timed' ? 'timed' : 'calm'
  const timed = game.mode === 'timed'
  $('mode').classList.toggle('on', timed)
  $('mode').setAttribute('aria-pressed', String(timed))
  $('go').classList.toggle('timed', timed)
}

/** Dips the child's roller in a pot: a plop, a little hop and a splash of the new colour. */
function choosePot(bits) {
  const me = game.me
  if (!me || game.state !== 'play' || !POTS.includes(bits)) return
  audio.unlock()
  if (me.setPaint(bits)) {
    // Paint already rolled keeps its colour; the next stroke starts here in the new paint.
    emitStrokes(true)
    audio.drip(POTS.indexOf(bits))
    me.hop(0.5)
    copyPot(bits)
    const r = me.rollerAt()
    for (const hex of bits === RAINBOW_POT ? RAINBOW : [MIXES[bits].hex]) effects.splash(r.x, r.z, hex, bits === RAINBOW_POT ? 4 : 14, 0.45)
    if (bits === RAINBOW_POT) audio.rainbow()
  }
  updatePots()
}

function updatePots() {
  const bits = game.me?.paint
  for (const el of document.querySelectorAll('[data-pot]')) {
    const on = Number(el.dataset.pot) === bits
    el.classList.toggle('on', on)
    el.setAttribute('aria-pressed', String(on))
  }
  // The splat button is a blob of the paint in the roller.
  if (bits) $('splat').style.setProperty('--c', potHex(bits))
  $('splat').classList.toggle('rainbow', bits === RAINBOW_POT)
}

/** 🖼️: a small ✅ / 🖌️ question first, so a stray tap never ends the picture. */
function askFinished() {
  if (game.state !== 'play') return
  audio.unlock()
  audio.click()
  $('finish-ask').classList.remove('hidden')
  clearTimeout(game.askTimer)
  // Unanswered, the question goes away and painting simply carries on.
  game.askTimer = setTimeout(() => closeFinishAsk(), 10000)
}

function closeFinishAsk() {
  clearTimeout(game.askTimer)
  $('finish-ask').classList.add('hidden')
}

function finishPicture() {
  closeFinishAsk()
  if (game.state !== 'play') return
  if (isHost()) endRound()
  else send({ t: 'finish', r: roundId() })
}

function updateToggles() {
  $('music').classList.toggle('off', !settings.music)
  $('sound').classList.toggle('off', !settings.sound)
  $('sound').textContent = settings.sound ? '🔊' : '🔈'
}

/**
 * While painting, 🏠 needs a short press-and-hold (a ring fills round it), so a stray tap never
 * ends the picture. On the other screens it works with a tap.
 */
const HOLD_MS = 650
/** The results ignore ▶ this long after they appear. */
const RESULTS_GUARD_MS = 1200
/** 🖼️ (finished) is ignored this soon after any other tap. */
const FINISH_QUIET_MS = 1000
/** Every finger (or mouse button) down anywhere on the page: a hold may only start when it is the only one. */
const pointersDown = new Set()
/** Counts every pointerdown on the page: a hold only fires if no other finger came down while it was held. */
let pressCount = 0
document.addEventListener('pointerdown', (e) => {
  pointersDown.add(e.pointerId)
  pressCount++
}, true)
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, (e) => pointersDown.delete(e.pointerId), true)
/**
 * After a hold fires, the screen may change under the still-pressed finger (to the menu, the results):
 * the click its lift makes is swallowed once, so it never presses whatever is there now.
 */
function swallowNextClick() {
  const swallow = (e) => {
    e.preventDefault()
    e.stopPropagation()
    done()
  }
  const done = () => {
    document.removeEventListener('click', swallow, true)
    clearTimeout(timer)
  }
  document.addEventListener('click', swallow, true)
  // Long enough for a finger still resting on the screen; a later tap works as normal.
  const timer = setTimeout(done, 1500)
}

function holdToPress(btn, action, { always = false, ms = HOLD_MS } = {}) {
  let timer = 0
  let holder = null // the one pointer holding the button
  let spoiled = false // a second finger came down: nothing happens until every finger is up
  const down = new Set()
  const needsHold = () => always || game.state === 'play'
  btn.classList.add('holdable')
  btn.style.setProperty('--hold', `${ms}ms`)
  const cancel = () => {
    clearTimeout(timer)
    timer = 0
    holder = null
    btn.classList.remove('holding')
  }
  btn.addEventListener('pointerdown', (e) => {
    if (!needsHold()) return
    e.preventDefault()
    audio.unlock()
    down.add(e.pointerId)
    cancel()
    // Only one finger on the whole page: a palm or a second hand never presses it.
    if (down.size > 1 || pointersDown.size > 1 || input.stick.id !== null) {
      spoiled = true
      return
    }
    spoiled = false
    holder = e.pointerId
    const startCount = pressCount
    btn.classList.add('holding')
    timer = setTimeout(() => {
      const ok = holder === e.pointerId && !spoiled && pressCount === startCount && down.size === 1 && pointersDown.size === 1 && input.stick.id === null
      cancel()
      if (!ok) return
      swallowNextClick()
      action()
    }, ms)
  })
  const up = (e) => {
    down.delete(e.pointerId)
    // Let go too soon: the button wobbles and its ring shows part-filled, so a child learns to hold it.
    if (e.pointerId === holder && timer && e.type === 'pointerup') {
      btn.classList.remove('nudge')
      void btn.offsetWidth
      btn.classList.add('nudge')
      clearTimeout(btn.nudgeTimer)
      btn.nudgeTimer = setTimeout(() => btn.classList.remove('nudge'), 600)
    }
    if (e.pointerId === holder || down.size === 0) cancel()
    if (down.size === 0) spoiled = false
  }
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, up)
  btn.addEventListener('click', () => {
    if (!needsHold()) action()
  })
}

/** 🏠: the host (or a child alone) goes back to the menu, taking everyone along; a friend waits for the next picture. */
function goHome() {
  audio.unlock()
  audio.click()
  if (['loading', 'menu', 'waiting'].includes(game.state)) return
  if (isHost()) {
    send({ t: 'menu' })
    enterLobby()
  } else {
    stopRound()
    game.state = 'waiting'
    setWaiting(false)
    show('waiting')
    renderPlayers()
  }
}

/** The waiting screen: a spinning brush, or (friends are mid-picture) their painting pictured with a sand timer. */
function setWaiting(busy) {
  $('waiting').classList.toggle('busy', busy)
}

function enterLobby() {
  stopRound()
  if (isHost()) {
    game.state = 'menu'
    show('menu')
  } else {
    game.state = 'waiting'
    setWaiting(false)
    show('waiting')
  }
  renderPlayers()
}

// --- Networking --------------------------------------------------------------------------------

function send(msg, opts) {
  game.room?.send(msg, opts)
}

function broadcastPlayers() {
  if (isHost()) send({ t: 'players', players: [...game.players.values()], host: game.hostId })
}

function addPlayer(id) {
  if (!game.players.has(id)) game.players.set(id, { id, animal: null })
}

function setupRoom(room) {
  game.room = room
  game.hostId = room.isHost ? room.selfId : null
  if (!validAnimal(game.myAnimal)) game.myAnimal = ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)]
  game.players.set(room.selfId, { id: room.selfId, animal: game.myAnimal })
  for (const id of room.peers) addPlayer(id)
  room.on('join', (id) => {
    addPlayer(id)
    if (game.assetsReady) renderPlayers()
    broadcastPlayers()
    if (isHost() && game.setup && !['menu', 'results'].includes(game.state)) send({ t: 'busy' }, { to: id })
  })
  room.on('leave', onLeave)
  room.on('message', (msg, from) => {
    if (!msg || typeof msg !== 'object') return
    if (game.assetsReady) return onMessage(msg, from)
    if (msg.t !== 's') game.queue.push([msg, from])
  })
}

function onLeave(id) {
  const wasHost = id === game.hostId
  game.players.delete(id)
  game.ready.delete(id)
  const p = game.painters.get(id)
  if (p) {
    // Their paint stays in the picture; their painter rolls away with them.
    p.dispose()
    game.painters.delete(id)
  }
  if (wasHost) migrateHost()
  else if (isHost()) {
    broadcastPlayers()
    maybeGo()
  }
  if (game.assetsReady) renderPlayers()
  if (game.state === 'results') renderResults()
}

/**
 * The host left: the remaining player with the lowest id takes over (everyone
 * has the same list, so everyone agrees) and adopts the bots and the pickups.
 */
function migrateHost() {
  const ids = [...game.players.keys()].sort()
  game.hostId = ids[0] ?? game.room.selfId
  if (!isHost()) return
  broadcastPlayers()
  if (game.setup) {
    for (const entry of game.setup.entries) {
      const p = game.painters.get(entry.id)
      if (entry.bot && p && !p.local) {
        p.local = true
        p.place(p.x, p.z, p.yaw)
        game.bots.push(new Bot(p, entry.seat + 7))
      }
    }
  }
  if (game.state === 'syncing') maybeGo(true)
  else if (game.state === 'waiting') enterLobby()
  else if (game.state === 'reveal' && !game.final) later(sendFinal, 1500)
  else if (game.state === 'results') renderResults()
}

const ROUND_MESSAGES = new Set(['s', 'e', 'item', 'grab', 'gone', 'ready', 'go', 'end', 'stats', 'final', 'finish', 'visit'])

function onMessage(msg, from) {
  if (ROUND_MESSAGES.has(msg.t)) {
    if (msg.r == null || msg.r !== roundId()) return
    // The playground is still being built: these wait for it.
    if (game.state === 'building') return void game.roundQueue.push([msg, from])
  }
  switch (msg.t) {
    case 'players': {
      // Only the host's list counts, so everyone has the same seats and colours.
      if (msg.host !== from || !Array.isArray(msg.players)) return
      game.hostId = from
      game.players = new Map(msg.players.filter((p) => p && typeof p.id === 'string').map((p) => [p.id, { id: p.id, animal: validAnimal(p.animal) ? p.animal : null }]))
      const me = game.players.get(game.room.selfId)
      if (me && me.animal !== game.myAnimal) {
        me.animal = game.myAnimal
        send({ t: 'pick', animal: game.myAnimal }, { to: from })
      }
      renderPlayers()
      break
    }
    case 'pick': {
      const p = game.players.get(from)
      if (!isHost() || !p || !validAnimal(msg.animal)) return
      p.animal = msg.animal
      broadcastPlayers()
      renderPlayers()
      break
    }
    case 'setup':
      if (msg.host !== from) return
      game.hostId = from
      startRound(msg)
      break
    case 'ready':
      if (isHost()) {
        game.ready.add(from)
        maybeGo()
      }
      break
    case 'go':
      if (from === game.hostId && game.state === 'syncing') runCountdown()
      break
    case 'busy':
      if (from === game.hostId && game.state === 'waiting') setWaiting(true)
      break
    case 'menu':
      if (from === game.hostId) enterLobby()
      break
    case 's':
      for (const snap of Array.isArray(msg.p) ? msg.p : []) {
        const p = paintersBySeat()[snap?.[0]]
        if (!p || p.local || !snap.slice(1, 5).every(Number.isFinite)) continue
        p.setTarget(snap[1] / 100, snap[2] / 100, snap[3] / 100, snap[4] / 100, !!(snap[5] & 1), POTS.includes(snap[6]) ? snap[6] : 0)
      }
      break
    case 'e':
      for (const e of Array.isArray(msg.e) ? msg.e : []) if (Array.isArray(e)) applyEvent(e)
      break
    case 'item':
      if (from === game.hostId && ITEM_KINDS[msg.k] && Number.isFinite(msg.x) && Number.isFinite(msg.z)) items.add(String(msg.id), msg.k, clamp(msg.x, -HALF_W, HALF_W), clamp(msg.z, -HALF_D, HALF_D), STAMP_SHAPES.includes(msg.s) ? msg.s : 'star')
      break
    case 'visit':
      if (from === game.hostId && game.state === 'play' && VISITORS[game.place] === msg.k && [msg.x0, msg.z0, msg.x1, msg.z1, msg.dur].every(Number.isFinite)) {
        game.visitors.push(new Visitor(scene, msg, now()))
        moment(VISIT_EMOJI[msg.k])
      }
      break
    case 'grab':
      if (isHost()) hostGrab(String(msg.id), msg.seat)
      break
    case 'gone':
      if (from === game.hostId) onGone(msg)
      break
    case 'end':
      if (from === game.hostId && game.state === 'play') endRound()
      break
    case 'finish':
      // A friend says the picture is finished: the host ends it for everyone.
      if (isHost() && game.state === 'play') endRound()
      break
    case 'stats':
      if (!isHost()) return
      for (const [seat, s] of Array.isArray(msg.list) ? msg.list : []) if (s && typeof s === 'object') game.stats.set(seat, cleanStats(s))
      // A friend's own mixes join the colours we found.
      for (const m of Array.isArray(msg.found) ? msg.found : []) if (MIXED.includes(m) && !game.found.includes(m)) game.found.push(m)
      break
    case 'final':
      if (from === game.hostId && Array.isArray(msg.rows)) {
        game.final = msg
        if (game.state === 'reveal' && now() - game.revealAt > REVEAL_MS) showResults()
        else if (game.state === 'results') renderResults()
      }
      break
  }
}

const cleanStats = (s) => Object.fromEntries(Object.keys(newStats()).map((k) => [k, Number.isFinite(s[k]) ? Math.max(0, s[k]) : 0]))

let seatCache = null
/** Painters indexed by seat (rebuilt when painters come and go). */
function paintersBySeat() {
  if (!seatCache || seatCache.size !== game.painters.size) {
    seatCache = []
    for (const p of game.painters.values()) seatCache[p.seat] = p
    seatCache.size = game.painters.size
  }
  return seatCache
}

// --- Rounds ------------------------------------------------------------------------------------

function hostStartRound() {
  if (!isHost() || !game.assetsReady || !['menu', 'results'].includes(game.state)) return
  const humans = [...game.players.values()].slice(0, 4)
  const entries = humans.map((p, seat) => ({ id: p.id, seat, animal: validAnimal(p.animal) ? p.animal : ANIMAL_IDS[seat], bot: false }))
  // Friendly bots fill the empty seats, with the animals nobody picked first.
  const free = ANIMAL_IDS.filter((a) => !entries.some((e) => e.animal === a)).sort(() => Math.random() - 0.5)
  // With no clock there are three painters, one for each paint, so the child's own rolling counts for more.
  const mode = game.mode === 'timed' ? 'timed' : 'calm'
  for (let seat = entries.length; seat < MODES[mode].painters; seat++) entries.push({ id: `bot${seat}`, seat, animal: free.shift() ?? ANIMAL_IDS[seat], bot: true })
  // Tests may choose the surprises (?debug&extras=stamp,giant).
  const asked = DEBUG && params.get('extras')?.split(',').filter((k) => EXTRAS.includes(k))
  const extras = asked?.length ? asked : [...EXTRAS].sort(() => Math.random() - 0.5).slice(0, 2)
  // And a big dotted outline on the ground, a different picture each round.
  const outline = OUTLINES[(OUTLINES.indexOf(game.lastOutline) + 1 + Math.floor(Math.random() * (OUTLINES.length - 1))) % OUTLINES.length]
  game.lastOutline = outline
  const setup = { t: 'setup', r: 1 + Math.floor(Math.random() * 1e9), place: game.place, mode, seconds: ROUND_SECONDS, entries, extras, outline, host: game.room.selfId }
  game.ready = new Set()
  send(setup)
  startRound(setup)
}

/** Clears the last round away (paint, painters, pickups, timers). Every exit comes through here. */
function stopRound() {
  clearTimers() // includes the results line booked at 900 ms
  game.build++
  for (const p of game.painters.values()) p.dispose()
  game.painters.clear()
  seatCache = null
  game.bots = []
  game.me = null
  items.clear()
  effects.clear()
  game.outbox = []
  game.pendingGrab.clear()
  game.final = null
  game.roundQueue = []
  game.found = []
  game.notes = []
  game.moments = []
  $('outline-pop').classList.add('hidden')
  clearBalls()
  for (const v of game.visitors) v.dispose()
  game.visitors = []
  updatePots()
  closeFinishAsk()
  $('mix-note').classList.add('hidden')
  input.enabled = false
  input.release()
  audio.roll(0)
  meMarker.visible = meRing.visible = false
  $('countdown').classList.add('hidden')
  $('hint').classList.add('hidden')
}

async function startRound(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length) return
  gallery.close()
  stopRound()
  game.setup = setup
  game.setup.seconds = clamp(Number(setup.seconds) || ROUND_SECONDS, 10, 180)
  game.setup.mode = setup.mode === 'timed' ? 'timed' : 'calm'
  game.place = Object.hasOwn(PLACES, setup.place) ? setup.place : 'square'
  if (!setup.entries.some((e) => e.id === game.room.selfId)) {
    // This picture started before we arrived: wait for the next one.
    game.state = 'waiting'
    setWaiting(true)
    show('waiting')
    renderPlayers()
    return
  }
  game.state = 'building'
  const build = game.build
  if (!game.placeScenes[game.place]) {
    show('loading')
    await loadPlace(game.place)
    if (build !== game.build) return
  }
  buildRound(setup)
}

function buildRound(setup) {
  if (game.arena) {
    game.arena.root.removeFromParent()
    game.arena.root.traverse((o) => {
      if (o.isMesh && !o.userData.shared) o.geometry.dispose()
    })
  }
  const arena = buildArena(game.place, game.placeScenes[game.place], paint)
  game.arena = arena
  scene.add(arena.root)
  paint.outline.value.dispose()
  paint.outline.value = buildOutline(setup.outline) ?? new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat)
  paint.outline.value.needsUpdate = true
  paint.outlineShow.value = 0
  game.outlinePoly = outlinePolygon(setup.outline)
  skyMaterial.uniforms.top.value.set(arena.def.sky[0])
  skyMaterial.uniforms.bottom.value.set(arena.def.sky[1])
  paint.reset(arena.obstacles)
  game.stats = new Map()
  for (const entry of setup.entries) {
    const seat = clamp(entry.seat | 0, 0, 3)
    const animal = validAnimal(entry.animal) ? entry.animal : ANIMAL_IDS[seat]
    const local = entry.id === game.room.selfId || (entry.bot && isHost())
    const p = new Painter({ id: entry.id, seat, animal, template: game.templates[animal], local, bot: !!entry.bot })
    const [x, z] = START[seat]
    p.place(x, z, Math.atan2(-x, -z))
    scene.add(p.group)
    game.painters.set(entry.id, p)
    if (entry.bot && local) game.bots.push(new Bot(p, seat + 1))
  }
  seatCache = null
  game.me = game.painters.get(game.room.selfId) ?? null
  // Only this child's own roller names a new colour.
  paint.mine = game.me?.seat ?? -1
  if (game.me) {
    meRing.material.color.set(SEAT_COLORS[game.me.seat])
  }
  // The first bucket comes soon, and the round's first surprise within a few seconds (its second a little later).
  const extras = Array.isArray(setup.extras) ? setup.extras : []
  game.itemWait = { bucket: 2, rainbow: Infinity, water: Infinity, stamp: Infinity, giant: Infinity, [extras[0] ?? 'rainbow']: 4, [extras[1] ?? 'water']: 11 }
  game.lastStrokeAt = 0
  game.roundStart = now()
  placeCamera(true)
  updatePots()
  $('sand').style.transform = 'scaleX(1)'
  $('timer').classList.toggle('hidden', modeOf() !== 'timed')
  // Everyone builds the playground at their own pace; the host says go once all are ready.
  game.state = 'syncing'
  show(null)
  const el = $('countdown')
  el.textContent = '🎨'
  el.className = 'countdown waiting'
  if (isHost()) {
    game.ready.add(game.room.selfId)
    later(() => maybeGo(true), READY_TIMEOUT)
    maybeGo()
  } else {
    send({ t: 'ready', r: roundId() })
    later(() => game.state === 'syncing' && runCountdown(), READY_TIMEOUT + 4000)
  }
  for (const [msg, from] of game.roundQueue.splice(0)) onMessage(msg, from)
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
  const el = $('countdown')
  // No count in, even in the quick round (it is finite, not a race): one soft chime and the painting starts.
  el.textContent = '🎨'
  el.className = 'countdown waiting'
  audio.beep(true)
  startPainting()
}

function startPainting() {
  game.state = 'play'
  game.roundStart = now()
  // The place's own surprise comes about 15 s in; the thumbnail on the finished button starts fresh.
  game.visitAt = game.roundStart + 14000 + Math.random() * 5000
  game.thumbAt = 0
  game.lastStrokeAt = 0
  for (const p of game.painters.values()) p.strokeFrom = p.rollerAt()
  input.enabled = true
  show(null)
  later(() => $('countdown').classList.add('hidden'), 700)
  // The dragging finger shows if the child hasn't rolled after a moment, and again after a long stop.
  game.lastMoveAt = now() - IDLE_HINT_MS + FIRST_HINT_MS
  updatePots()
  game.noteAt = -Infinity
  // Everyone gives a happy hop to start.
  for (const p of game.painters.values()) p.hop(0.8)
}

/** The picture is finished (or the time is up): everyone stops and the camera swoops up to look at it. */
function endRound() {
  if (game.state !== 'play') return
  closeFinishAsk()
  noticeMixes()
  game.notes = []
  $('mix-note').classList.add('hidden')
  game.state = 'reveal'
  game.revealAt = now()
  input.enabled = false
  input.release()
  audio.roll(0)
  $('hint').classList.add('hidden')
  show(null)
  // Paint that's still on its way goes out now, so every picture ends up the same.
  emitStrokes(true)
  flushOutbox()
  // The pickups go, so the picture is just paint.
  for (const it of [...items.values()]) effects.sparkle(it.x, 0.5, it.z, '#ffffff', 6, 1.5)
  items.clear()
  const mine = [...game.painters.values()].filter((p) => p.local)
  for (const p of mine) {
    p.speed = 0
    p.controls = { x: 0, z: 0 }
    game.stats.set(p.seat, { ...p.stats })
  }
  if (isHost()) {
    send({ t: 'end', r: roundId() })
    later(sendFinal, 1800)
  } else {
    send({ t: 'stats', r: roundId(), list: mine.map((p) => [p.seat, p.stats]), found: game.found })
    // If the host never sends the results, work them out here.
    later(() => {
      if (!game.final) {
        game.final = computeFinal()
        if (game.state === 'reveal' && now() - game.revealAt > REVEAL_MS) showResults()
      }
    }, 6000)
  }
  camStart.pos.copy(camera.position)
  camStart.look.copy(camLook)
  audio.whoosh()
  later(() => {
    // One soft moment over the finished picture: a gentle chord and a few slow petals in our colours.
    audio.fanfare()
    popOutline()
    effects.party([...new Set([...game.setup.entries.map((e) => SEAT_COLORS[e.seat]), ...game.found.map((m) => MIXES[m].hex)])], 60)
    for (const p of game.painters.values()) p.hop(1)
    if (game.final) showResults()
  }, REVEAL_MS)
}

/** The round's outline pops up over the finished picture for a moment: "we painted a fish!" */
function popOutline() {
  const emoji = OUTLINE_EMOJI[game.setup?.outline]
  if (!emoji) return
  const el = $('outline-pop')
  el.textContent = emoji
  el.classList.remove('hidden', 'show')
  void el.offsetWidth
  el.classList.add('show')
  later(() => el.classList.add('hidden'), 1900)
}

/** Remembers a surprise this child met this round (shown, once each, on the results). */
function moment(emoji) {
  if (emoji && !game.moments.includes(emoji)) game.moments.push(emoji)
}

/** The shared result: who painted, the colours we found by mixing, and how much we filled together. No ranking. */
function computeFinal() {
  noticeMixes()
  const total = Math.round(paint.coverage() * 100)
  return { t: 'final', r: roundId(), total, found: [...game.found], rows: game.setup.entries.map((e) => ({ seat: e.seat })) }
}

function sendFinal() {
  if (!isHost() || !['reveal', 'results'].includes(game.state)) return
  game.final = computeFinal()
  send(game.final)
  if (game.state === 'reveal' && now() - game.revealAt > REVEAL_MS) showResults()
}

function showResults() {
  if (game.state !== 'reveal' && game.state !== 'results') return
  const first = game.state === 'reveal'
  game.state = 'results'
  if (first) game.resultsAt = now()
  show(null)
  renderResults()
  if (first) later(() => keepFinishedPicture(true), AUTO_KEEP_MS)
}


/** Where the playground is on screen (CSS pixels), a little wider than 4:3 like the gallery frames. */
function pictureRect() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const v = new THREE.Vector3()
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    v.set(x * (HALF_W + 1), 0, z * (HALF_D + 1)).project(camera)
    const sx = ((v.x + 1) / 2) * innerWidth, sy = ((1 - v.y) / 2) * innerHeight
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy)
  }
  let w = x1 - x0, h = y1 - y0
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  if (w / h > 4 / 3) h = (w * 3) / 4
  else w = (h * 4) / 3
  if (!(w > 40 && h > 30)) return undefined
  return [cx - w / 2, cy - h / 2, w, h]
}

/** Puts this round's finished picture in My pictures, once; the frame button hops to show where it went (no white flash). */
function keepFinishedPicture(announce) {
  if (game.state !== 'results' || game.keptRound === roundId()) return
  game.keptRound = roundId()
  gallery.keep(pictureRect())
  if (!announce) return
  audio.keep()
  const btn = $('results-save')
  btn.classList.remove('kept')
  void btn.offsetWidth
  btn.classList.add('kept')
}

function renderResults() {
  const final = game.final
  if (!final) return
  const self = game.room.selfId
  // What made this round this round: the outline we painted (big), then the surprises we met, bouncing.
  const pics = [OUTLINE_EMOJI[game.setup.outline], ...game.moments].filter(Boolean)
  $('found').innerHTML = pics.map((e, i) => `<span class="moment${i ? '' : ' big'}" style="animation-delay:${0.2 + 0.18 * i}s, ${0.2 + 0.18 * i}s">${e}</span>`).join('')
  // The painters who made it, each with their colour: nobody is ranked or scored.
  const rows = final.rows.map((row) => ({ row, entry: game.setup.entries.find((e) => e.seat === row.seat) })).filter((r) => r.entry)
  $('cards').innerHTML = rows
    .map(({ row, entry }, i) => {
      const animal = validAnimal(entry.animal) ? ANIMALS[entry.animal].emoji : '🙂'
      return `<div class="card${entry.id === self ? ' me' : ''}" style="--c:${SEAT_COLORS[row.seat] ?? '#999'}; animation-delay:${0.15 * i}s">
        <span class="who">${animal}${entry.bot ? '<small>🤖</small>' : ''}${entry.id === self ? '<small>⭐</small>' : ''}</span></div>`
    })
    .join('')
  const canRestart = isHost()
  $('again').classList.toggle('hidden', !canRestart)
  $('change').classList.toggle('hidden', !canRestart)
  $('results-wait').classList.toggle('hidden', canRestart)
}

// --- Pickups (the host decides) -------------------------------------------------------------

function freeSpot() {
  const painters = [...game.painters.values()]
  for (let k = 0; k < 40; k++) {
    const x = -HALF_W + 2.5 + Math.random() * (2 * HALF_W - 5)
    const z = -HALF_D + 2.5 + Math.random() * (2 * HALF_D - 5)
    if (game.arena.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2)) continue
    if (painters.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue
    if ([...items.values()].some((it) => Math.hypot(it.x - x, it.z - z) < 4)) continue
    return { x, z }
  }
  return null
}

function hostItems(dt) {
  const extras = Array.isArray(game.setup.extras) ? game.setup.extras : EXTRAS
  for (const [kind, def] of Object.entries(ITEM_KINDS)) {
    if ((kind !== 'bucket' && !extras.includes(kind)) || items.count(kind) >= def.max) continue
    game.itemWait[kind] -= dt
    if (game.itemWait[kind] > 0) continue
    const spot = freeSpot()
    if (!spot) continue
    const [min, extra] = PICKUP_WAIT[kind] ?? [8, 6]
    game.itemWait[kind] = min + Math.random() * extra
    const id = `${game.room.selfId.slice(0, 4)}${++game.itemSeq}`
    const x = Math.round(spot.x * 100) / 100, z = Math.round(spot.z * 100) / 100
    const shape = TOKEN_SHAPES[Math.floor(Math.random() * TOKEN_SHAPES.length)]
    items.add(id, kind, x, z, shape)
    send({ t: 'item', r: roundId(), id, k: kind, x, z, s: shape })
  }
}

/** A roller reached a pickup: ask the host (or, being the host, decide). */
function tryGrab(p) {
  const r = p.rollerAt()
  for (const it of items.values()) {
    if (game.pendingGrab.has(it.id)) continue
    const reach = ITEM_KINDS[it.kind].reach
    if (Math.hypot(it.x - r.x, it.z - r.z) > reach && Math.hypot(it.x - p.x, it.z - p.z) > reach) continue
    if (isHost()) hostGrab(it.id, p.seat)
    else {
      game.pendingGrab.add(it.id)
      send({ t: 'grab', r: roundId(), id: it.id, seat: p.seat })
    }
  }
}

function hostGrab(id, seat) {
  const it = items.items.get(id)
  if (!it || game.state !== 'play' || !paintersBySeat()[seat]) return
  const msg = { t: 'gone', r: roundId(), id, seat, k: it.kind, x: it.x, z: it.z, s: it.shape }
  send(msg)
  onGone(msg)
}

function onGone({ id, seat, k, x, z, s: shape }) {
  game.pendingGrab.delete(id)
  items.remove(String(id))
  const p = paintersBySeat()[seat]
  if (!p || !ITEM_KINDS[k]) return
  // The device that drives the painter makes the paint happen (so it's one event for everyone).
  if (p.local && game.state === 'play') pickup(p, k, Number(x) || 0, Number(z) || 0, shape)
  if (k === 'rainbow') {
    effects.sparkle(x, 0.5, z, '#ffffff', 16, 2.4)
    if (p === game.me) audio.rainbow()
  }
}

function pickup(p, kind, x, z, shape) {
  if (p === game.me) moment({ stamp: STAMP_EMOJI[shape], giant: '🪣', rainbow: '🌈', water: '💧' }[kind])
  const t = gameTime()
  const seed = 1 + Math.floor(Math.random() * 1e9)
  if (kind === 'bucket') {
    p.stats.splash++
    p.hop(1)
    // The splash on the ground says what happened: no shouted banners.
    emit([1, p.seat, t, q(p.x + Math.sin(p.yaw) * 0.6), q(p.z + Math.cos(p.yaw) * 0.6), seed, p.paint])
  } else if (kind === 'water') {
    p.stats.water++
    p.hop(0.7)
    emit([2, p.seat, t, q(x), q(z), seed])
  } else if (kind === 'rainbow') {
    p.hop(0.7)
    p.rainbowUntil = now() + RAINBOW_MS
  } else if (kind === 'stamp') {
    p.hop(0.8)
    p.stampShape = STAMP_SHAPES.includes(shape) ? shape : 'star'
    p.stampUntil = now() + STAMP_MS
    p.stampDist = STAMP_EVERY
    if (p === game.me) audio.rainbow()
  } else if (kind === 'giant') {
    // The giant bucket tips over: a wave of rainbow pinwheels rolling away from the painter.
    p.hop(1.2)
    emit([1, p.seat, t, q(x), q(z), seed, RAINBOW_POT, 4, q(p.yaw)])
  }
}

// --- Paint events -------------------------------------------------------------------------------

const q = (v) => Math.round(v * 100)

/** Applies a paint event here and queues it for everyone else. */
function emit(e) {
  applyEvent(e)
  game.outbox.push(e)
}

/**
 * Paint events: [0 stroke, seat, t, x0, z0, x1, z1, paint bits, flags (1 rainbow, 2 a robot's narrow stripe)] [1 splat, seat, t, x, z, seed, paint bits, flag, yaw]
 * [2 wash, seat, t, x, z, seed] [3 stamp, seat, t, x, z, shape index, paint bits], positions in cm. Every device applies
 * the same list (splat flags: see `splat`).
 */
function applyEvent(e) {
  const [kind, seat, t] = e
  if (!(seat >= 0 && seat < 4) || !Number.isInteger(t) || t < 1 || !e.slice(3, kind === 0 ? 7 : 6).every(Number.isFinite)) return
  const x = e[3] / 100, z = e[4] / 100
  // A pot's paint, or (a cow's hoofprints) a mix it stepped in.
  const raw = e[kind === 0 ? 7 : 6]
  const bits = POTS.includes(raw) || MIXED.includes(raw) ? raw : SEAT_PAINT[seat]
  if (kind === 0) {
    paint.who = e[8] & 4 ? -1 : seat
    paint.stroke(t, bits, x, z, e[5] / 100, e[6] / 100, !!(e[8] & 1), e[8] & 2 ? (modeOf() === 'calm' ? ROBOT_STRIPE * 0.8 : ROBOT_STRIPE) : undefined)
    paint.who = -1
    return
  }
  const near = game.me ? clamp(1 - Math.hypot(game.me.x - x, game.me.z - z) / 30, 0.3, 1) : 1
  if (kind === 1) {
    const flag = e[7] | 0
    const p = paintersBySeat()[seat]
    // A child's splat (on any device): the host's robots may splat back next to it.
    if ((flag === 1 || flag === 2) && p && !p.bot && game.state === 'play') robotsReply(x, z)
    // A thrown paint ball flies first and paints where it lands (the paint itself is stamped with t, so every device ends the same).
    if (flag === 2 && p && game.state === 'play') return void throwBall(p, x, z, bits, () => splat(e, x, z, bits, near))
    splat(e, x, z, bits, near)
    return
  }
  if (kind === 3) {
    const shape = STAMP_SHAPES[e[5] | 0]
    if (!shape) return
    // A visitor's prints (e[7] 1) are nobody's (they never count as a child's new colour).
    paint.who = e[7] === 1 ? -1 : seat
    paint.stamp(t, bits, x, z, shape, shape === 'hoof' ? 0.55 : 1)
    paint.who = -1
    if (game.state === 'play') {
      effects.sparkle(x, 0.3, z, bits === RAINBOW_POT ? RAINBOW[t % 6] : MIXES[bits].hex, 4, 0.8)
      if (paintersBySeat()[seat] === game.me && e[7] !== 1) audio.stamp()
    }
    return
  }
  if (kind === 2) {
    paint.wash(t, x, z, e[5] >>> 0)
    if (game.state === 'play') {
      effects.splash(x, z, '#7cc8ff', 45, 0.9)
      effects.splash(x, z, '#ffffff', 15, 0.7)
      audio.water(near)
    }
  }
}

/** Robot friends join in: now and then a splat with a hop, and now and then a dip in another pot. */
function robotFun(p, t) {
  p.funAt ??= t + 4000 + Math.random() * 6000
  if (t < p.funAt || p === game.me || paint.coverage() > ROBOT_FULL + 0.15) return
  p.funAt = t + (modeOf() === 'calm' ? 8000 + Math.random() * 8000 : 5000 + Math.random() * 7000)
  if (Math.random() < 0.55) {
    p.hop(1)
    const r = p.rollerAt()
    emitStrokes(true)
    emit([1, p.seat, gameTime(), q(r.x), q(r.z), 1 + Math.floor(Math.random() * 1e9), splatPaint(p), 1, q(splatSize(TAP_SPLAT_R))])
  } else {
    // Mostly back to its own paint, sometimes another, so the colours keep changing.
    const pot = Math.random() < 0.5 ? SEAT_PAINT[p.seat] : POTS[Math.floor(Math.random() * 3)]
    if (p.setPaint(pot)) {
      emitStrokes(true)
      p.hop(0.5)
    }
  }
}

/**
 * Splat flags (e[7]): 0 a bucket, 1 a splat dropped under the roller, 2 a paint ball thrown to (x, z),
 * 3 a ring of paint round the obstacle at (x, z) (rolled into), 4 the giant bucket's wave (e[8] the way it falls),
 * 5 the town fountain spraying by itself. For 1 and 2, e[8] is the splat's radius in cm.
 */
function splat(e, x, z, bits, near) {
  const [, seat, t] = e
  const flag = e[7] | 0
  const seed = e[5] >>> 0
  const p = paintersBySeat()[seat]
  const playing = game.state === 'play'
  const burst = (bx, bz, n, power) => {
    if (!playing) return
    if (bits === RAINBOW_POT) for (const hex of RAINBOW) effects.splash(bx, bz, hex, Math.ceil(n / 6), power)
    else effects.splash(bx, bz, MIXES[bits].hex, n, power)
  }
  paint.who = flag === 5 ? -1 : seat
  if (flag === 5) {
    // The town fountain sprays: a ring of colour all round it, and a tall splash.
    const o = nearestObstacle(x, z)
    const R = (o?.r ?? 1) + 1.6
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + (seed % 100) / 16
      const d = R + ((seed >> k) % 3) * 0.6
      paint.splat(t, bits, x + Math.cos(a) * d, z + Math.sin(a) * d, seed + k, 0.85)
      burst(x + Math.cos(a) * d, z + Math.sin(a) * d, 6, 0.6)
    }
    if (o && playing) {
      o.boing = 1
      burst(x, z, 90, 2.2)
      audio.water(near)
      moment('⛲')
    }
  } else if (flag === 3) {
    const o = nearestObstacle(x, z)
    const R = (o?.r ?? 1) + 0.9
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + (seed % 100) / 16
      paint.splat(t, bits, x + Math.cos(a) * R, z + Math.sin(a) * R, seed + k, 0.75)
      burst(x + Math.cos(a) * R, z + Math.sin(a) * R, 8, 0.7)
    }
    if (o && playing) {
      o.boing = 1
      // A fountain sprays the colour up high.
      if (o.kind === 'fountain') burst(x, z, 60, 1.8)
      audio.bump()
    }
  } else if (flag === 4) {
    const yaw = (e[8] | 0) / 100
    for (let k = 0; k < 4; k++) {
      const d = 1 + k * 2.6
      const bx = x + Math.sin(yaw) * d, bz = z + Math.cos(yaw) * d
      paint.splat(t, RAINBOW_POT, bx, bz, seed + k, 3.4 - k * 0.5)
      burst(bx, bz, 30, 1.3)
    }
    if (playing) audio.giant(near)
  } else {
    const small = flag === 1 || flag === 2
    // A thrown or dropped splat carries its size (smaller as the picture fills, so late splats add detail, not mud).
    const size = small && e[8] > 0 ? clamp(e[8] / 100, 0.5, TAP_SPLAT_R) : flag === 2 ? THROW_R : small ? TAP_SPLAT_R : undefined
    paint.splat(t, bits, x, z, seed, size)
    burst(x, z, small ? 34 : 60, small ? 0.8 : 1.2)
    if (playing) {
      if (!small) audio.splash(near)
      else {
        audio.splat(near)
        if (flag === 1 && p && !p.local) p.hop(1)
        // A child's splat says its animal noise; the robots' splats just go splat.
        if (p && !p.bot && flag === 1) animalNoise(p)
      }
    }
  }
  paint.who = -1
}

const nearestObstacle = (x, z) => {
  let best = null, bd = Infinity
  for (const o of game.arena?.obstacles ?? []) {
    const d = Math.hypot(o.x - x, o.z - z)
    if (d < bd) [best, bd] = [o, d]
  }
  return best
}

/** Paint balls in the air: each flies from its painter to where it was thrown, then splats. */
const ballGeo = new THREE.SphereGeometry(0.32, 16, 12)
function throwBall(p, x, z, bits, land) {
  const mat = new THREE.MeshStandardMaterial({ color: bits === RAINBOW_POT ? RAINBOW[0] : MIXES[bits].hex, roughness: 0.25 })
  const mesh = new THREE.Mesh(ballGeo, mat)
  const from = new THREE.Vector3(p.x, 1.4, p.z)
  const d = Math.hypot(x - p.x, z - p.z)
  mesh.position.copy(from)
  scene.add(mesh)
  game.balls.push({ mesh, from, x, z, t0: now(), dur: clamp(d / 22, 0.28, 0.6) * 1000, h: 1.2 + d * 0.22, rainbow: bits === RAINBOW_POT, land })
  p.hop(0.7)
  // The whee is skipped while a child is mashing (the splat says enough).
  if ((p === game.me || !p.bot) && now() - (p.tossAt ?? -Infinity) > 600) {
    p.tossAt = now()
    audio.toss()
  }
}

function updateBalls(t) {
  for (const b of [...game.balls]) {
    const k = clamp((t - b.t0) / b.dur, 0, 1)
    b.mesh.position.set(b.from.x + (b.x - b.from.x) * k, b.from.y * (1 - k) + Math.sin(k * Math.PI) * b.h + 0.2, b.from.z + (b.z - b.from.z) * k)
    // Squash and stretch in the air: long while flying, a blob as it lands.
    b.mesh.scale.set(1 - 0.2 * Math.sin(k * Math.PI), 1 + 0.35 * Math.sin(k * Math.PI), 1)
    if (b.rainbow) b.mesh.material.color.setHSL((t / 400) % 1, 0.8, 0.6)
    if (k < 1) continue
    game.balls.splice(game.balls.indexOf(b), 1)
    b.mesh.removeFromParent()
    b.mesh.material.dispose()
    b.land()
  }
}

function clearBalls() {
  for (const b of game.balls) {
    b.mesh.removeFromParent()
    b.mesh.material.dispose()
  }
  game.balls = []
}

/**
 * The place's own surprise, now and then (host): the square's fountain sprays, a cow ambles across the
 * farmyard and a beach ball rolls through the toy room. The first comes about 15 s in.
 */
function hostVisitors(t) {
  if (t < game.visitAt) return
  game.visitAt = t + 26000 + Math.random() * 12000
  const fountain = game.arena.obstacles.find((o) => o.kind === 'fountain')
  const pot = Math.random() < 0.25 ? RAINBOW_POT : PRIMARIES_POTS[Math.floor(Math.random() * 3)]
  if (game.place === 'square' && fountain) {
    // Sprays three times, a beat apart, in changing colours.
    for (let k = 0; k < 3; k++) later(() => {
      if (game.state !== 'play') return
      emit([1, 0, gameTime(), q(fountain.x), q(fountain.z), 1 + Math.floor(Math.random() * 1e9), k ? PRIMARIES_POTS[(PRIMARIES_POTS.indexOf(pot) + k) % 3] : pot, 5])
    }, k * 900)
    return
  }
  const kind = VISITORS[game.place]
  if (!kind) return
  const left = Math.random() < 0.5
  const z = (Math.random() - 0.5) * (2 * HALF_D - 8)
  const msg = { t: 'visit', r: roundId(), k: kind, x0: left ? -HALF_W - 3 : HALF_W + 3, z0: z, x1: left ? HALF_W + 3 : -HALF_W - 3, z1: z + (Math.random() - 0.5) * 6, dur: kind === 'cow' ? 15000 : 7000 }
  send(msg)
  const v = new Visitor(scene, msg, now())
  moment(VISIT_EMOJI[kind])
  v.host = true
  v.paint = pot
  v.lastPrint = { x: v.x, z: v.z }
  v.step = 0
  game.visitors.push(v)
}
const PRIMARIES_POTS = POTS.filter((p) => p !== RAINBOW_POT)
const VISIT_EMOJI = { cow: '🐄', ball: '🏐' }

function updateVisitors(t) {
  for (const v of [...game.visitors]) {
    const going = v.update(t) && game.state !== 'results'
    // The host's copy leaves the paint: hoofprints (in the colour the cow last stepped in) or the ball's rainbow stripe.
    if (v.host && game.state === 'play' && Math.abs(v.x) < HALF_W && Math.abs(v.z) < HALF_D) {
      const d = Math.hypot(v.x - v.lastPrint.x, v.z - v.lastPrint.z)
      if (v.kind === 'cow' && d > 0.9) {
        const under = paint.mixAt(v.x, v.z)
        if (under > 0) v.paint = under
        const side = v.step++ % 2 ? 0.45 : -0.45
        const c = Math.cos(v.yaw), s = Math.sin(v.yaw)
        emit([3, 0, gameTime(), q(v.x + c * side), q(v.z - s * side), STAMP_SHAPES.indexOf('hoof'), v.paint, 1])
        v.lastPrint = { x: v.x, z: v.z }
      } else if (v.kind === 'ball' && d > 0.3) {
        emit([0, 0, gameTime(), q(v.lastPrint.x), q(v.lastPrint.z), q(v.x), q(v.z), RAINBOW_POT, 1 | 4])
        v.lastPrint = { x: v.x, z: v.z }
      }
    } else if (v.host) v.lastPrint = { x: v.x, z: v.z }
    if (going) continue
    v.dispose()
    game.visitors.splice(game.visitors.indexOf(v), 1)
  }
}

/**
 * The ending changes each round: the painters parade round the picture in a ring, dance a conga along a
 * figure of eight, or line up at the front and bounce. Display only, on every device.
 */
const PARADES = ['ring', 'conga', 'bounce']
const paradeStyle = () => PARADES[roundId() % PARADES.length]
function parade(p, t) {
  const s = (t - game.resultsAt) / 1000
  const n = Math.max(1, game.painters.size)
  const style = paradeStyle()
  let x, z
  if (style === 'ring') {
    const a = s * 0.45 + (p.seat / n) * Math.PI * 2
    ;[x, z] = [Math.cos(a) * 9, Math.sin(a) * 6]
  } else if (style === 'conga') {
    const a = s * 0.4 - p.seat * 0.32
    ;[x, z] = [Math.sin(a) * 11, Math.sin(a * 2) * 4.5]
  } else {
    ;[x, z] = [(p.seat - (n - 1) / 2) * 4, HALF_D - 4]
  }
  // Ease in from wherever the painter stopped.
  const k = clamp(s / 1.5, 0, 1)
  const nx = p.x + (x - p.x) * (k < 1 ? 0.06 : 0.3), nz = p.z + (z - p.z) * (k < 1 ? 0.06 : 0.3)
  if (Math.hypot(nx - p.x, nz - p.z) > 0.01) p.yaw = Math.atan2(nx - p.x, nz - p.z)
  else if (style === 'bounce') p.yaw = Math.sin(t / 300 + p.seat) * 0.6
  p.x = nx
  p.z = nz
  p.speed = 2
}

/** Obstacles that were rolled into hop and settle (display only). */
function updateObstacles(dt) {
  for (const o of game.arena?.obstacles ?? []) {
    if (!o.node || !(o.boing > 0)) continue
    o.boing = Math.max(0, o.boing - dt * 2.2)
    o.node.position.y = o.baseY + Math.abs(Math.sin(o.boing * Math.PI * 2)) * 0.35 * o.boing
  }
}

/** Every STROKE_MS each local roller paints from where it was to where it is. */
function emitStrokes(force = false) {
  const t = gameTime()
  if (!force && t - game.lastStrokeAt < STROKE_MS) return
  game.lastStrokeAt = t
  for (const p of game.painters.values()) {
    if (!p.local || !p.strokeFrom) continue
    const r = p.rollerAt()
    const from = p.strokeFrom
    const step = Math.hypot(r.x - from.x, r.z - from.z)
    if (step < 0.04) continue
    if (now() < (p.stampUntil ?? 0)) {
      // A stamp roller: no stripe, a star, heart or paw printed every STAMP_EVERY metres instead.
      p.stampDist = (p.stampDist ?? 0) + step
      p.strokeFrom = { x: r.x, z: r.z }
      if (p.stampDist < STAMP_EVERY) continue
      p.stampDist = 0
      emit([3, p.seat, t, q(r.x), q(r.z), STAMP_SHAPES.indexOf(p.stampShape), p.paint])
      continue
    }
    const bot = p.bot && p !== game.me
    // Robots lift their roller next to a child, inside the round's outline (that shape is the child's to fill),
    // and once the picture is getting full, so the page never turns to mud.
    if (bot && (inOutline(r.x, r.z) || paint.coverage() > ROBOT_FULL || [...game.painters.values()].some((c) => !c.bot && Math.hypot(c.x - r.x, c.z - r.z) < ROBOT_GAP))) {
      p.strokeFrom = { x: r.x, z: r.z }
      continue
    }
    const e = [0, p.seat, t, q(from.x), q(from.z), q(r.x), q(r.z), p.paint, (p.rainbow ? 1 : 0) | (bot ? 2 : 0)]
    emit(e)
    p.strokeFrom = { x: e[5] / 100, z: e[6] / 100 }
  }
}

function flushOutbox() {
  if (!game.outbox.length) return
  send({ t: 'e', r: roundId(), e: game.outbox })
  game.outbox = []
}


// --- Moving painters ----------------------------------------------------------------------------------

/** Keeps a local painter inside the playground and out of obstacles and friends. */
function collide(p) {
  const fx = Math.sin(p.yaw) * COLLIDE_AHEAD, fz = Math.cos(p.yaw) * COLLIDE_AHEAD
  let cx = p.x + fx, cz = p.z + fz
  const lx = HALF_W - 0.75, lz = HALF_D - 0.75
  cx = clamp(cx, -lx, lx)
  cz = clamp(cz, -lz, lz)
  for (const o of game.arena.obstacles) {
    const dx = cx - o.x, dz = cz - o.z
    const d = Math.hypot(dx, dz)
    const min = o.r + COLLIDE_R * 0.8
    if (d < min && d > 1e-4) {
      cx = o.x + (dx / d) * min
      cz = o.z + (dz / d) * min
      // Rolled into: the fountain, bale or block hops and throws a ring of this painter's paint (now and then).
      if (game.state === 'play' && p.speed > 2 && now() - (o.hitAt ?? -Infinity) > 3500 && (p === game.me || Math.random() < 0.3)) {
        o.hitAt = now()
        p.speed *= 0.4
        p.hop(0.8)
        emit([1, p.seat, gameTime(), q(o.x), q(o.z), 1 + Math.floor(Math.random() * 1e9), p.paint, 3])
      }
    }
  }
  for (const other of game.painters.values()) {
    if (other === p) continue
    const ox = other.x + Math.sin(other.yaw) * COLLIDE_AHEAD, oz = other.z + Math.cos(other.yaw) * COLLIDE_AHEAD
    const dx = cx - ox, dz = cz - oz
    const d = Math.hypot(dx, dz)
    const min = COLLIDE_R * 1.7
    if (d < min && d > 1e-4) {
      // Both sides push when both are driven here; otherwise this one moves all the way.
      const share = other.local ? 0.5 : 1
      cx += (dx / d) * (min - d) * share
      cz += (dz / d) * (min - d) * share
      if ((p === game.me || other === game.me) && p.speed > 1.5) {
        audio.bump()
        p.speed *= 0.5
        // Boing: both animals squash and wobble.
        p.hop(0.6)
        other.hop(0.6)
      }
    }
  }
  p.x = cx - fx
  p.z = cz - fz
}

function updatePainters(dt, t) {
  const playing = game.state === 'play'
  if (playing && game.me) {
    const v = gallery.open ? { x: 0, y: 0 } : input.read()
    game.me.controls = { x: v.x, z: v.y }
    if (Math.hypot(v.x, v.y) > 0.05 || input.stick.id !== null || game.me.bot || gallery.open) game.lastMoveAt = t
  }
  const world = { paint, items, obstacles: game.arena.obstacles, painters: [...game.painters.values()], avoid: inOutline }
  // With no clock, the robots wait for an idle child (a little hop now and then) instead of painting the page on their own.
  // The robots always paint for the first ROBOT_SHOW_MS (showing what to do) before they start waiting.
  const waiting = modeOf() === 'calm' && !!game.me && !game.me.bot && t - game.roundStart > ROBOT_SHOW_MS && t - game.lastMoveAt > ROBOT_WAIT_MS
  if (playing) for (const bot of game.bots) if (bot.p.local && game.painters.has(bot.p.id)) {
    if (waiting && bot.p !== game.me) {
      bot.p.controls = { x: 0, z: 0 }
      if (Math.random() < dt * 0.4) bot.p.hop(0.5)
      continue
    }
    bot.update(dt, world)
    robotFun(bot.p, t)
  }
  for (const p of game.painters.values()) {
    if (p.local) {
      if (playing) {
        // Robot friends roll slower than a child (slower still with no clock), so the child's paint counts.
        p.drive(dt, p.bot && !(p === game.me) ? (modeOf() === 'calm' ? 0.5 : 0.55) : 1)
        collide(p)
      } else p.speed = damp(p.speed, 0, 8, dt)
      p.rainbow = playing && (t < p.rainbowUntil || p.paint === RAINBOW_POT)
      if (p.rainbow) p.stats.rainbow += dt
    } else if (game.state !== 'results') p.follow(dt)
    if (game.state === 'results') parade(p, t)
    const moved = p.sync(dt, t)
    if (p.local && playing) p.stats.dist += moved
    if (game.state === 'reveal' || (game.state === 'results' && paradeStyle() === 'bounce')) {
      // Happy hops while everyone admires the picture.
      if (p.body) p.body.position.y = Math.abs(Math.sin(t / 220 + p.seat * 0.8)) * 0.35
    }
    if (p.speed > 1 && Math.random() < dt * 8) {
      const r = p.rollerAt()
      effects.drip(r.x, r.z, p.rainbow ? RAINBOW[Math.floor(Math.random() * 6)] : p.color)
    }
    if (p.rainbow && Math.random() < dt * 3) effects.sparkle(p.x, 1.2, p.z, RAINBOW[Math.floor(Math.random() * 6)], 1, 1.6)
  }
  if (playing) {
    for (const p of game.painters.values()) if (p.local) tryGrab(p)
    emitStrokes()
  }
  if (game.me && playing) audio.roll(clamp(game.me.speed / MAX_SPEED, 0, 1))
  else audio.roll(0)
}

// --- Camera -----------------------------------------------------------------------------------------

const camLook = new THREE.Vector3()
const camStart = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
const tmpPos = new THREE.Vector3()
const tmpLook = new THREE.Vector3()

/**
 * Follow view: from above and behind (south), never turning, so up on the screen is always the same way.
 * High enough to see most of the playground (friends and robots included); it leans toward the middle
 * so the rest of the picture stays in view, and rises a little more as the picture fills up.
 */
function followTarget(pos, look) {
  const me = game.me
  const aspect = innerWidth / innerHeight
  // Tall screens look down more steeply (less wall at the top, bigger animals); wide ones from further back.
  const grow = 1 + 0.1 * clamp(paint.coverage() / 0.5, 0, 1)
  // Very tall phones step further back so they still show a good part of the picture.
  const tall = clamp(0.75 / aspect, 1, 1.45)
  const [h, back] = (aspect < 0.8 ? [26 * tall, 11 * tall] : aspect < 1.3 ? [22, 13] : [17.5, 11]).map((v) => v * grow)
  const fx = (me?.x ?? 0) * 0.7, fz = (me?.z ?? 0) * 0.6
  // How wide the ground shows at the look point: the camera never slides past the playground's sides.
  const halfW = Math.hypot(h, back) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect
  const tx = clamp(fx, -Math.max(0, HALF_W + 1 - halfW), Math.max(0, HALF_W + 1 - halfW))
  // The near edge of the playground (and its flower beds) stays at the bottom of the screen, so a
  // tall screen shows more of the picture instead of the ground beyond it.
  const nearRay = back - h / Math.tan(Math.atan2(h, back) + THREE.MathUtils.degToRad(camera.fov / 2))
  // Near the bottom edge the camera keeps going a little past it, so the child's animal stays above the pot tray.
  // (Upright screens have a taller tray to clear, so they go further past it.)
  const past = aspect < 1.3 ? 5 : 2
  const tz = clamp(fz, -HALF_D + 3, Math.max(-HALF_D + 3, Math.min(HALF_D - 1.5, HALF_D + past - nearRay)))
  look.set(tx, 0, tz)
  pos.set(tx, h, tz + back)
}

/** Top view that fits the whole picture between the title and the cards. */
function revealTarget(pos, look) {
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const shown = game.state === 'results'
  const top = shown ? $('results').querySelector('.results-top').getBoundingClientRect().bottom + 8 : innerHeight * 0.16
  const bottom = shown ? $('results').querySelector('.panel').getBoundingClientRect().top - 8 : innerHeight * 0.62
  const free = Math.max(innerHeight * 0.3, bottom - top)
  const pxPerM = Math.min(free / (2 * HALF_D + 1.5), innerWidth / (2 * HALF_W + 2))
  const h = innerHeight / (pxPerM * 2 * Math.tan(fov / 2))
  const shift = -((top + bottom) / 2 - innerHeight / 2) / pxPerM
  look.set(0, 0, shift)
  pos.set(0, h, shift + h * 0.12)
}

function placeCamera(snap = false) {
  followTarget(tmpPos, tmpLook)
  if (snap) {
    camera.position.copy(tmpPos)
    camLook.copy(tmpLook)
  }
  camera.lookAt(camLook)
}

function updateCamera(dt, t) {
  if (game.state === 'reveal' || game.state === 'results') {
    revealTarget(tmpPos, tmpLook)
    const k = easeInOut(clamp((t - game.revealAt) / REVEAL_MS, 0, 1))
    if (k < 1) {
      camera.position.lerpVectors(camStart.pos, tmpPos, k)
      // Rise first, then settle over the picture.
      camera.position.y += Math.sin(k * Math.PI) * 6
      camLook.lerpVectors(camStart.look, tmpLook, k)
    } else {
      camera.position.lerp(tmpPos, 1 - Math.exp(-4 * dt))
      camLook.lerp(tmpLook, 1 - Math.exp(-4 * dt))
    }
  } else {
    followTarget(tmpPos, tmpLook)
    camera.position.lerp(tmpPos, 1 - Math.exp(-3.5 * dt))
    camLook.lerp(tmpLook, 1 - Math.exp(-3.5 * dt))
  }
  camera.lookAt(camLook)
}

// --- HUD -------------------------------------------------------------------------------------------


/** A recipe card that fades in under the bar for a few seconds. */
function showNote(html, ms) {
  const el = $('mix-note')
  el.innerHTML = html
  el.classList.remove('hidden', 'show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(game.noteTimer)
  game.noteTimer = setTimeout(() => el.classList.add('hidden'), ms)
}

/** Looks for mixed colours this child's roller makes for the first time this round. */
function noticeMixes() {
  for (const m of MIXED) {
    if (game.found.includes(m) || paint.mineCounts[m] < FOUND_CELLS) continue
    game.found.push(m)
    if (game.state === 'play') game.notes.push(m)
  }
}

/** A new colour, one at a time: a twinkle, sparkles where it appeared and a blob of it springing in at the top. */
function showNextMix(t) {
  if (!game.notes.length || t - game.noteAt < NOTE_MS + 400) return
  const m = game.notes.shift()
  game.noteAt = t
  showNote(`<span class="spark">✨</span><i class="blob-dab" style="--c:${MIXES[m].hex}"></i><span class="spark">✨</span>`, NOTE_MS)
  audio.discover(MIXED.indexOf(m) % 5)
  const at = paint.lastAt[m]
  if (at >= 0) {
    const c = paint.cellCentre(at)
    effects.sparkle(c.x, 0.6, c.z, MIXES[m].hex, 18, 1.8)
    effects.splash(c.x, c.z, MIXES[m].hex, 16, 0.5)
  }
  game.me?.hop(0.6)
}

/**
 * A splat: the button (or Space) drops one right under the roller; a tap on the ground throws a
 * paint ball there. Either way the animal hops and the robots may splat back nearby.
 */
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const hitPoint = new THREE.Vector3()
function tapSplat(at) {
  const me = game.me
  if (!me || game.state !== 'play') return
  audio.unlock()
  const t = now()
  game.lastMoveAt = t
  if (t - game.splatAt < TAP_SPLAT_MS) return
  game.splatAt = t
  emitStrokes(true)
  const seed = 1 + Math.floor(Math.random() * 1e9)
  const bits = splatPaint(me)
  if (at) {
    ndc.set((at.x / innerWidth) * 2 - 1, -(at.y / innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return
    const x = clamp(hitPoint.x, -HALF_W + 0.5, HALF_W - 0.5), z = clamp(hitPoint.z, -HALF_D + 0.5, HALF_D - 0.5)
    // Turn to face the throw.
    me.yaw = Math.atan2(x - me.x, z - me.z)
    emit([1, me.seat, gameTime(), q(x), q(z), seed, bits, 2, q(splatSize(THROW_R))])
    animalNoise(me)
    return
  }
  me.hop(1)
  const r = me.rollerAt()
  emit([1, me.seat, gameTime(), q(r.x), q(r.z), seed, bits, 1, q(splatSize(TAP_SPLAT_R))])
  const btn = $('splat')
  btn.classList.remove('boing')
  void btn.offsetWidth
  btn.classList.add('boing')
}

const inOutline = (x, z) => !!game.outlinePoly && insidePolygon(game.outlinePoly, x, z)

/** A robot friend sometimes copies the child's new pot, with a hop: "me too!" */
function copyPot(bits) {
  if (!isHost() || Math.random() > 0.4) return
  const bots = game.bots.map((b) => b.p).filter((p) => p !== game.me && game.painters.has(p.id))
  const p = bots[Math.floor(Math.random() * bots.length)]
  if (!p) return
  later(() => {
    if (game.state !== 'play' || !p.setPaint(bits)) return
    emitStrokes(true)
    p.hop(0.9)
    effects.sparkle(p.x, 2, p.z, potHex(bits), 8, 1.2)
  }, 600 + Math.random() * 600)
}

/** A painter's animal noise, at most once a second each, so mashing doesn't stack sounds. */
function animalNoise(p) {
  const t = now()
  if (t - (p.noiseAt ?? -Infinity) < 1000) return
  p.noiseAt = t
  audio.voice(p.animal)
}

/** Splats shrink as the picture fills: full size up to a third painted, about half size when it's nearly full. */
const splatSize = (r) => r * (1 - 0.5 * clamp((paint.coverage() - 0.33) / 0.5, 0, 1))

/** A splat's paint: the roller's pot, or on the rainbow pot the next colour round the wheel (one colour per splat, no pinwheel noise). */
const WHEEL = [1, 3, 2, 6, 4, 5]
function splatPaint(p) {
  if (p.paint !== RAINBOW_POT) return p.paint
  game.rainbowStep = (game.rainbowStep + 1) % WHEEL.length
  return WHEEL[game.rainbowStep]
}

/** Robots play along: now and then one throws a ball of its own paint next to the child's splat. */
function robotsReply(x, z) {
  if (!isHost() || now() - (game.replyAt ?? 0) < 4000 || Math.random() > 0.3) return
  game.replyAt = now()
  const bots = game.bots.map((b) => b.p).filter((p) => p !== game.me && game.painters.has(p.id))
  if (!bots.length) return
  const p = bots.reduce((a, b) => (Math.hypot(a.x - x, a.z - z) < Math.hypot(b.x - x, b.z - z) ? a : b))
  if (Math.hypot(p.x - x, p.z - z) > 16) return
  later(() => {
    if (game.state !== 'play' || !game.painters.has(p.id)) return
    const a = Math.random() * Math.PI * 2, d = 1.6 + Math.random() * 1.2
    const bx = clamp(x + Math.cos(a) * d, -HALF_W + 0.5, HALF_W - 0.5), bz = clamp(z + Math.sin(a) * d, -HALF_D + 0.5, HALF_D - 0.5)
    p.yaw = Math.atan2(bx - p.x, bz - p.z)
    emit([1, p.seat, gameTime(), q(bx), q(bz), 1 + Math.floor(Math.random() * 1e9), splatPaint(p), 2, q(splatSize(THROW_R))])
  }, 700 + Math.random() * 500)
}

/** The framed little picture on the finished button: the paint itself, redrawn once a second. */
const thumbSource = document.createElement('canvas')
thumbSource.width = NX
thumbSource.height = NZ
const thumbData = new ImageData(new Uint8ClampedArray(paint.rgba.buffer), NX, NZ)
function drawThumb() {
  const el = $('finish-thumb')
  const g = el.getContext('2d')
  thumbSource.getContext('2d').putImageData(thumbData, 0, 0)
  g.fillStyle = '#fff9eb'
  g.fillRect(0, 0, el.width, el.height)
  g.drawImage(thumbSource, 0, 0, el.width, el.height)
}

function updateHud(t) {
  if (t - game.lastHud < 250) return
  game.lastHud = t
  if (game.state !== 'play') return
  if (t - (game.thumbAt ?? 0) > 1000) {
    game.thumbAt = t
    drawThumb()
  }
  $('hint').classList.toggle('hidden', t - game.lastMoveAt < IDLE_HINT_MS || gallery.open || !$('finish-ask').classList.contains('hidden'))
  noticeMixes()
  showNextMix(t)
  if (modeOf() !== 'timed') return
  // A sand timer, not numbers: the sand runs down quietly (no seconds, hurry colour, pulse or ticking at the end).
  const left = clamp(1 - (t - game.roundStart) / 1000 / game.setup.seconds, 0, 1)
  $('sand').style.transform = `scaleX(${left.toFixed(3)})`
}

// --- Loop ------------------------------------------------------------------------------------------

/** One step of the game: everything but drawing. */
function step(dt, realDt, t) {
  const inRound = ['syncing', 'countdown', 'play', 'reveal', 'results'].includes(game.state) && game.arena
  if (inRound) {
    updatePainters(dt, t)
    updateBalls(t)
    updateObstacles(dt)
    // The round's outline comes back on top of the paint as the camera rises over the finished picture.
    paint.outlineShow.value = game.state === 'reveal' || game.state === 'results' ? clamp((t - game.revealAt - 600) / 1500, 0, 1) : 0
    updateVisitors(t)
    if (game.state === 'play') {
      if (isHost()) {
        hostItems(dt)
        hostVisitors(t)
      }
      if (modeOf() === 'timed') {
        const elapsed = (t - game.roundStart) / 1000
        if (isHost() && elapsed >= game.setup.seconds) endRound()
        else if (!isHost() && elapsed >= game.setup.seconds + 3) endRound()
      }
    }
    items.update(dt, t)
    updateCamera(realDt, t)
    updateHud(t)
    if (game.me && (game.state === 'play' || game.state === 'countdown' || game.state === 'syncing')) {
      meMarker.visible = true
      // The 'you' heart rides still above the painter, facing the camera: it moves only when the painter does.
      // A bobbing marker above, and a soft ring in the child's colour round their animal on the ground.
      meMarker.position.set(game.me.x, 4.1 + Math.sin(t / 260) * 0.2, game.me.z)
      // A gentle wobble, never a spin.
      meMarker.rotation.z = Math.sin(t / 420) * 0.18
      meRing.visible = true
      meRing.position.set(game.me.x + Math.sin(game.me.yaw) * 0.4, 0.04, game.me.z + Math.cos(game.me.yaw) * 0.4)
      meRing.scale.setScalar(1 + Math.sin(t / 300) * 0.06)
    } else meMarker.visible = meRing.visible = false
    if (game.arena.sails) game.arena.sails.rotation.z = -t / 900
    if (!game.room.solo) {
      if (t - game.lastSnap > SNAP_MS && ['play', 'countdown', 'reveal'].includes(game.state)) {
        game.lastSnap = t
        const p = [...game.painters.values()].filter((x) => x.local).map((x) => [x.seat, q(x.x), q(x.z), q(x.yaw), q(x.speed), x.rainbow ? 1 : 0, x.paint])
        send({ t: 's', r: roundId(), p }, { fast: true })
      }
      if (t - game.lastSend > SEND_MS) {
        game.lastSend = t
        flushOutbox()
      }
    } else game.outbox.length = 0
  }
  effects.update(dt)
  return inRound
}

let last = now()
function frame() {
  const t = now()
  const realDt = Math.min(0.1, (t - last) / 1000)
  last = t
  const dt = Math.min(realDt, 1 / 20)
  if (step(dt, realDt, t)) {
    paint.now.value = gameTime() / 100
    paint.upload()
    if (game.state === 'play') measureQuality(realDt, t)
  }
  audio.updateMusic(game.state !== 'loading') // one steady, gentle tempo (no speed-up at the end)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// --- Boot ------------------------------------------------------------------------------------------

async function boot() {
  buildMenu()
  show('loading')
  const models = withRetry(loadModels).then(() => (game.assetsReady = true))
  setupRoom(await joinRoom({ maxPlayers: 4 }))
  await models
  // The chosen playground first, then the others in the background.
  loadPlace(game.place).then(() => PLACE_IDS.forEach(loadPlace))
  renderer.compile(scene, camera)
  if (DEBUG && params.get('place')) {
    game.place = params.get('place')
    game.state = 'menu'
    hostStartRound()
  } else enterLobby()
  for (const [msg, from] of game.queue.splice(0)) onMessage(msg, from)
  requestAnimationFrame(frame)
}

if (DEBUG) {
  window.__paint = {
    game, paint, items, audio, effects, camera, renderer, scene, THREE, gallery, input,
    end: () => (isHost() ? endRound() : null),
    finish: () => finishPicture(),
    pot: (bits) => choosePot(bits),
    splat: (at) => tapSplat(at),
    /** Gives this child a pickup right away (for tests): `give('stamp', 'heart')`, `give('giant')`. */
    give: (kind, shape = 'star') => game.me && pickup(game.me, kind, game.me.x, game.me.z, shape),
    /** Lets a bot drive this child's painter (for tests). */
    autopilot(on = true) {
      const me = game.me
      if (!me) return
      game.bots = game.bots.filter((b) => b.p !== me)
      if (on) game.bots.push(new Bot(me, 9))
      me.bot = on
    },
    state: () => ({
      state: game.state,
      host: isHost(),
      solo: game.room?.solo,
      mode: modeOf(),
      coverage: +(paint.coverage() * 100).toFixed(1),
      counts: [...paint.counts],
      found: [...game.found],
      items: [...items.values()].map((i) => `${i.kind}@${i.x.toFixed(1)},${i.z.toFixed(1)}`),
      painters: [...game.painters.values()].map((p) => ({ seat: p.seat, animal: p.animal, local: p.local, paint: p.paint, x: +p.x.toFixed(2), z: +p.z.toFixed(2) })),
      final: game.final,
    }),
    /** Runs `seconds` of game time right away (tabs in the background get no frames). */
    sim(seconds, fps = 30) {
      for (let i = Math.round(seconds * fps); i > 0; i--) {
        clockSkew += 1000 / fps
        last = now()
        step(1 / fps, 1 / fps, now())
      }
      paint.now.value = gameTime() / 100
      paint.upload()
      renderer.render(scene, camera)
      return this.state()
    },
    /** A checksum of the picture, to compare devices. */
    hash() {
      let h = 0
      for (let i = 0; i < paint.mix.length; i++) h = (h * 31 + paint.mix[i]) | 0
      return h
    },
  }
}

boot()
