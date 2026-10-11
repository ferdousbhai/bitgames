import { createColourStudio } from './colour-studio.js'
import { createGallery } from './gallery.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { joinRoom } from 'https://bitgames.store/vendor/bitgames/multiplayer-1.js'
import { PLACES, PLACE_IDS, buildArena } from './arena.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { ITEM_KINDS, Items } from './items.js'
import { Job, RATIO_STEP, SHAPES, WHITE_STEP, chooseJob, fits, reachOf } from './jobs.js'
import { HALF_D, HALF_W, MIXED, MIXES, POTS, PRIMARIES, PaintMap, RAINBOW, ROLLER_R, SEAT_COLORS, SEAT_PAINT, RATIO_CODES, TINTS, WET_MS, WHITE, colourOf, mixWords } from './paint.js'
import { ANIMALS, ANIMAL_IDS, COLLIDE_AHEAD, COLLIDE_R, MAX_SPEED, Painter, newStats } from './painter.js'
import { clamp, damp, easeInOut, store } from './util.js'
import { createVoice, listWords } from './speech.js'

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
/** The dragging finger shows at the start; a child who stops to look gets it back only after a long pause. */
const IDLE_HINT_MS = 30000
/** Seconds between new pickups (min, extra random), so the playground stays calm. */
const PICKUP_WAIT = { bucket: [7, 5], water: [8, 6], rainbow: [18, 8] }
/**
 * Two ways to paint. The default has no clock: the picture is done when a child
 * says so (🖼️ Finished!), and asks when the playground is nearly all painted. Its only pickup
 * is the paint bucket, a big splash that mixes like the rollers. The quick round
 * is the old 75 s round with the water and rainbow puddles.
 */
const MODES = {
  calm: { painters: 3, items: ['bucket'] },
  timed: { painters: 4, items: ['bucket', 'water', 'rainbow'] },
}
/** A mixed colour counts as found once it covers about this many cells (a roller's width square). */
const FOUND_CELLS = 150
/** Time between spoken discoveries, so each one is heard. */
const NOTE_MS = 4200
/**
 * Paint requests climb from pictured recipes (0) to hidden recipes (1) to two-part shapes and brown (2)
 * to rules with more than one right answer ("a mix of blue and one more paint", 3) to rules on two-part
 * shapes and rules with two conditions ("a mix with blue but no red", 4) to the white pot and light
 * colours ("a pink heart", 5) to ratios ("a yellowish orange sun": more of one paint, 6), following how the child does.
 */
const TOP_TIER = RATIO_STEP
/** From this step the white pot is out: some requests want a light colour, the rest would be spoiled by white. */
const WHITE_TIER = WHITE_STEP
/** From this step recipes stay hidden and a slip just names the colour. */
const RULE_TIER = 3
/** A request with no mix in it yet after this long shows its recipe (tiers 1 and 2; the top tier keeps it hidden). */
const HELP_MS = 35000
/** Rolling one paint of the recipe over a shape this long without mixing brings a "roll over the shiny paint" tip. */
const WET_TIP_MS = 14000
/** The even mix of a ratio on the shape and the child stopped this long: a tip, while the mix is still wet. */
const RATIO_TIP_MS = 5000
/** A child with nothing right on the shape this long (or after two slips) sees a soft ring round the pot to use next. */
const RESCUE_MS = 20000
/** Still stuck this long: a still picture of the two paints crossing appears on the shape. */
const GHOST_MS = 45000
/**
 * Still stuck this long after the picture (little of the part painted): the requests step down
 * (SLIP_STEP) and the card offers another shape (🔄), which comes from the easier step.
 */
const STUCK_MS = 60000
/** A part nearly painted (STALL_SHARE) that stops growing this long is finished for the child, if nothing wrong is on it. */
const STALL_MS = 8000
const STALL_SHARE = 0.45
/** How long the camera eases over to show a request chalked out of sight. */
const GLANCE_MS = 2800
/** A quiet pause after a shape is painted before the next shapes are offered. */
const NEXT_JOB_MS = 6000
/** Every REST_EVERY shapes the pause is this much longer: time to paint freely and look at the page. */
const REST_MS = 10000
/**
 * After the first shape the child picks the next one from a few chalk shapes on the card (the game
 * still picks its colour or rule). Every REST_EVERY shapes the card simply waits for that pick: a rest
 * to paint freely or look at the picture. A child who doesn't pick gets one after PICK_WAIT_MS (REST_PICK_MS at a rest).
 */
const PICK_N = 3
const REST_EVERY = 4
const PICK_WAIT_MS = 16000
/** At a rest the card waits much longer before choosing (a child free painting is never hurried). */
const REST_PICK_MS = 60000
/** A careful, unhelped shape in coats moves the requests up this much; a slip moves them down SLIP_STEP. */
const SKILL_STEP = 0.25
const SLIP_STEP = 0.5
/** Steps carried to the next visit: the top steps are earned again each visit, so a lucky run never strands a young child there. */
const CARRY_SKILL = 2
/** Below the highest step reached before, each careful shape in coats moves up this much: steps are re-earned, just sooner. */
const REEARN_STEP = 0.5
/** A part's paint near a painted shape is washed once more this long after it is done (a roller still rolling at the edge). */
const RETIDY_MS = 2000
/** A child who hasn't picked from the card this long hears the shapes named (once per offer, not at a rest). */
const PICK_SAY_MS = 8000
/**
 * With no clock the playground is a page with a frame: requests are chalked inside, and the robot
 * friends paint only the frame (this wide, in metres), so the coloured-in shapes stand out on clean ground.
 */
const FRAME = 2.6
const inFrame = (x, z) => Math.abs(x) > HALF_W - FRAME + ROLLER_R || Math.abs(z) > HALF_D - FRAME + ROLLER_R
/** Pots are named aloud only in the first round of a visit; after that the drip and the colour are enough. */
const potsNamed = new Set()
/** Seats start in the four corners, facing the middle. Seat 0 is nearest the camera on the left. */
const START = [[-11, 6.5], [11, 6.5], [-11, -6.5], [11, -6.5]]

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

// A bouncing arrow over your own painter, so you always know which one is you.
const meMarker = new THREE.Group()
{
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.4 })
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 18).rotateX(Math.PI), mat)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat)
  ball.position.y = 0.45
  meMarker.add(cone, ball)
  meMarker.userData.mat = mat
  meMarker.visible = false
  scene.add(meMarker)
}

// --- Game state ----------------------------------------------------------------------------

const settings = { sound: store.get('paint-splash-sound', true), music: store.get('paint-splash-music', true) }
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
  notes: [], // discoveries waiting to be said
  noteAt: -Infinity,
  jobs: [], // paint requests this round (chalk shapes on the ground), the last one is the current one
  job: null,
  jobsDone: [], // [shape, ...targets] of each painted shape, for the results
  history: [], // { shape, targets } of every request this round, so they keep changing
  pageFull: false, // no room for another shape: the next 🖌️ turns to a fresh page
  told: new Set(),
  /** How the child is doing with requests: its whole part is the tier (kept between visits). */
  skill: clamp(Number(store.get('paint-splash-skill', 0)) || 0, 0, CARRY_SKILL),
  /** The highest step reached on earlier visits: below it, steps are re-earned in bigger strides. */
  peak: clamp(Number(store.get('paint-splash-peak', 0)) || 0, 0, TOP_TIER + 0.5),
  white: false, // the white pot is out this round
  offer: null, // { options: [{ spec, spot }], tier, rest }: the shapes the child may pick next (host)
}
// Tests may start at any step (?debug&skill=4); a real visit starts at most at CARRY_SKILL.
if (DEBUG && params.has('skill')) game.skill = clamp(Number(params.get('skill')) || 0, 0, TOP_TIER + 0.5)
const modeOf = () => (game.setup?.mode === 'timed' ? 'timed' : 'calm')

// Opening (or closing) the gallery or colour studio lets go of the roller so the animal stops.
function releaseControls() {
  input.release()
  input.keys.clear()
  if (game.me) game.me.controls = { x: 0, z: 0 }
}
const gallery = createGallery({
  renderer, scene, camera, openButton: $('gallery-open'), saveButton: $('gallery-save'), onOpen: releaseControls,
  hideInPicture: () => [effects.drops.mesh, effects.sparks.mesh, effects.confetti.mesh, meMarker],
})
/** Spoken words for children who can't read yet (quiet when the sound is off or there is no voice). */
const voice = createVoice({ muted: !settings.sound, rate: 0.95, pitch: 1.15 })
const colourStudio = createColourStudio({
  openButton: $('colour-open'),
  onOpen: () => {
    audio.unlock()
    releaseControls()
  },
  onClose: releaseControls,
  voice,
  sound: (kind, i) => audio.studio(kind, i),
  // A child who has reached the rule steps (about 6 and up, on any visit) gets ratio goals in the studio: "Can you mix a yellowish orange?"
  goals: () => Math.max(game.skill, game.peak) >= RULE_TIER,
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
  // A child who has reached the rule steps has mixing goals waiting in the studio: a still 🎯 on its button says so.
  if (screen === 'menu') $('colour-open').classList.toggle('goal', Math.max(game.skill, game.peak) >= RULE_TIER)
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
  $('players').innerHTML = html
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
  const html = ANIMAL_IDS.map((id) => `<button class="animal ${id === game.myAnimal ? 'selected' : ''}" data-animal="${id}" title="${ANIMALS[id].name}">${ANIMALS[id].emoji}${friends.has(id) ? `<span class="taken">${friends.get(id)}</span>` : ''}</button>`).join('')
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
  $('places').innerHTML = PLACE_IDS.map((id) => `<button class="place ${id === game.place ? 'selected' : ''}" data-place="${id}" style="background:${PLACES[id].color}" title="${PLACES[id].name}"><span class="emoji">${PLACES[id].emoji}</span><span class="name">${PLACES[id].name}</span></button>`).join('')
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
  $('again').onclick = () => {
    audio.unlock()
    hostStartRound()
  }
  $('change').onclick = () => {
    audio.unlock()
    if (!isHost()) return
    send({ t: 'menu' })
    enterLobby()
  }
  $('mode').onclick = () => {
    audio.unlock()
    audio.click()
    setMode(game.mode === 'timed' ? 'calm' : 'timed')
    voice.sayNow(game.mode === 'timed' ? 'A quick free paint, until the sand runs out.' : 'No clock. Paint until you are finished.')
  }
  setMode('calm')
  for (const el of document.querySelectorAll('[data-pot]')) el.onclick = () => choosePot(Number(el.dataset.pot))
  $('finish').onclick = () => askFinished()
  $('finish-yes').onclick = () => finishPicture()
  $('finish-no').onclick = () => {
    // Keep painting on a full page: it goes into My pictures and a fresh page comes.
    if (game.pageFull && isHost() && game.state === 'play') {
      closeFinishAsk()
      turnPage()
    } else closeFinishAsk(true)
  }
  $('home').onclick = () => goHome()
  $('music').onclick = () => {
    audio.unlock()
    settings.music = !settings.music
    store.set('paint-splash-music', settings.music)
    audio.setMusic(settings.music)
    updateToggles()
  }
  $('sound').onclick = () => {
    audio.unlock()
    settings.sound = !settings.sound
    store.set('paint-splash-sound', settings.sound)
    audio.setMuted(!settings.sound)
    voice.setMuted(!settings.sound)
    updateToggles()
  }
  $('voice').onclick = () => say()
  // Tapping the request card says it again.
  // Tapping a chalk shape on the card picks the next request.
  $('job').onclick = (e) => {
    const opt = e.target.closest?.('[data-opt]')
    if (opt && game.offer) return pickJob(Number(opt.dataset.opt))
    if (e.target.closest?.('[data-swap]') && game.job?.rescue === 3 && !game.job.done && isHost()) return swapJob()
    if (game.job && !game.job.done) voice.sayNow(requestWords(game.job))
  }
  // The finished picture is kept by itself; 🖼️ shows it in My pictures (keeping it first if it's early).
  $('results-save').onclick = () => {
    audio.unlock()
    keepFinishedPicture(false)
    gallery.show()
  }
  updateToggles()
  input.on('key', (k) => {
    audio.unlock()
    if (k === ' ' && game.state === 'play') say()
    const pot = { 1: 1, 2: 2, 3: 4, 4: WHITE, r: 1, y: 2, b: 4, w: WHITE }[k]
    if (pot && game.state === 'play') choosePot(pot)
    if (k === 'escape') goHome()
  })
  input.on('touch', () => {
    audio.unlock()
    $('hint').classList.add('hidden')
  })
  addEventListener('pointerdown', () => audio.unlock())
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))
}

/** The menu choice: no clock (default) or the quick round. Not remembered: every visit starts calm. */
function setMode(mode) {
  game.mode = mode === 'timed' ? 'timed' : 'calm'
  const timed = game.mode === 'timed'
  $('mode').classList.toggle('on', timed)
  $('mode').setAttribute('aria-pressed', String(timed))
  $('go').textContent = timed ? "⏳ Let's paint!" : "🎨 Let's paint!"
}

/** Dips the child's roller in the red, yellow or blue pot (or white, once it is out). */
function choosePot(bits) {
  const me = game.me
  if (!me || game.state !== 'play' || !POTS.includes(bits) || (bits === WHITE && !game.white)) return
  audio.unlock()
  if (me.setPaint(bits)) {
    // Paint already rolled keeps its colour; the next stroke starts here in the new paint.
    emitStrokes(true)
    audio.studio('drip', POTS.indexOf(bits))
    // Each pot says its name the first time in a visit; after that the drip and the colour are enough.
    if (!potsNamed.has(bits)) {
      potsNamed.add(bits)
      voice.sayNow(capital(MIXES[bits].word))
    }
  }
  updatePots()
}

function updatePots() {
  const bits = game.me?.paint
  $('pot-white').hidden = !game.white
  for (const el of document.querySelectorAll('[data-pot]')) {
    const on = Number(el.dataset.pot) === bits
    el.classList.toggle('on', on)
    el.setAttribute('aria-pressed', String(on))
  }
}

/** 🖼️ Finished!: a small ✅ / 🖌️ question first, so a stray tap never ends the picture. */
function askFinished(words = 'Is your picture finished?') {
  if (game.state !== 'play') return
  audio.unlock()
  audio.click()
  $('finish-ask').classList.remove('hidden')
  voice.sayNow(words)
  clearTimeout(game.askTimer)
  // Unanswered, the question goes away and painting simply carries on.
  game.askTimer = setTimeout(() => closeFinishAsk(), 12000)
}

/** While the ✅ / 🖌️ question is showing, the waiting lines and the next request hold back. */
const asking = () => !$('finish-ask').classList.contains('hidden')

function closeFinishAsk(spoken = false) {
  clearTimeout(game.askTimer)
  if (asking()) game.noteAt = now() - NOTE_MS + 1500 // a short pause before anything waiting is said
  $('finish-ask').classList.add('hidden')
  if (spoken && game.state === 'play') voice.sayNow('Keep painting!')
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
    setWaitingText('Waiting for the next picture…')
    show('waiting')
    renderPlayers()
  }
}

function setWaitingText(text) {
  $('waiting-text').textContent = text
}

function enterLobby() {
  stopRound()
  if (isHost()) {
    game.state = 'menu'
    show('menu')
  } else {
    game.state = 'waiting'
    setWaitingText('Waiting for friends…')
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

const ROUND_MESSAGES = new Set(['s', 'e', 'item', 'grab', 'gone', 'ready', 'go', 'end', 'stats', 'final', 'say', 'finish', 'job'])

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
      if (from === game.hostId && game.state === 'waiting') setWaitingText('🎨 Friends are painting! You can join the next picture.')
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
      if (from === game.hostId && ITEM_KINDS[msg.k] && Number.isFinite(msg.x) && Number.isFinite(msg.z)) items.add(String(msg.id), msg.k, clamp(msg.x, -HALF_W, HALF_W), clamp(msg.z, -HALF_D, HALF_D))
      break
    case 'grab':
      if (isHost()) hostGrab(String(msg.id), msg.seat)
      break
    case 'gone':
      if (from === game.hostId) onGone(msg)
      break
    case 'say': {
      const p = paintersBySeat()[msg.seat]
      if (p) {
        audio.voice(p.animal)
        effects.sparkle(p.x, 2, p.z, p.color, 10, 1.5)
      }
      break
    }
    case 'end':
      if (from === game.hostId && game.state === 'play') endRound()
      break
    case 'job':
      if (from === game.hostId && !isHost()) onJob(msg)
      break
    case 'finish':
      // A friend says the picture is finished: the host ends it for everyone.
      if (isHost() && game.state === 'play' && modeOf() === 'calm') endRound()
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
  const setup = { t: 'setup', r: 1 + Math.floor(Math.random() * 1e9), place: game.place, mode, seconds: ROUND_SECONDS, entries, host: game.room.selfId }
  game.ready = new Set()
  send(setup)
  startRound(setup)
}

/** Clears the last round away (speech, paint, painters, pickups, timers). Every exit comes through here. */
function stopRound() {
  voice.hush()
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
  for (const job of game.jobs) job.dispose()
  game.jobs = []
  game.job = null
  game.jobsDone = []
  game.history = []
  game.offer = null
  game.pageFull = false
  game.glance = null
  game.told = new Set() // recipes and tips already said this round
  game.white = false
  updatePots()
  suggestPot(0)
  $('job').classList.add('hidden')
  closeFinishAsk()
  $('mix-note').classList.add('hidden')
  input.enabled = false
  input.release()
  audio.roll(0)
  meMarker.visible = false
  $('countdown').classList.add('hidden')
  $('hint').classList.add('hidden')
}

async function startRound(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length) return
  gallery.close()
  colourStudio.close()
  stopRound()
  game.setup = setup
  game.setup.seconds = clamp(Number(setup.seconds) || ROUND_SECONDS, 10, 180)
  game.setup.mode = setup.mode === 'timed' ? 'timed' : 'calm'
  game.place = Object.hasOwn(PLACES, setup.place) ? setup.place : 'square'
  if (!setup.entries.some((e) => e.id === game.room.selfId)) {
    // This picture started before we arrived: wait for the next one.
    game.state = 'waiting'
    setWaitingText('🎨 Friends are painting! You can join the next picture.')
    show('waiting')
    renderPlayers()
    return
  }
  game.state = 'building'
  const build = game.build
  if (!game.placeScenes[game.place]) {
    $('loading-text').textContent = 'Getting the playground ready…'
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
    meMarker.userData.mat.color.set(game.me.color)
    meMarker.userData.mat.emissive.set(game.me.color)
  }
  game.itemWait = modeOf() === 'calm' ? { bucket: 10, rainbow: Infinity, water: Infinity } : { bucket: 3, rainbow: 15, water: 8 }
  game.lastStrokeAt = 0
  game.roundStart = now()
  placeCamera(true)
  updateBar()
  updatePots()
  renderFoundRow()
  $('sand').style.transform = 'scaleX(1)'
  $('timer').classList.toggle('hidden', modeOf() !== 'timed')
  $('finish').classList.toggle('hidden', modeOf() !== 'calm')
  // The picture is what is painted, not how much ground is covered: no coverage bar in either round.
  document.querySelector('.together-bar').classList.add('hidden')
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
  game.lastStrokeAt = 0
  for (const p of game.painters.values()) p.strokeFrom = p.rollerAt()
  input.enabled = true
  show(null)
  later(() => $('countdown').classList.add('hidden'), 700)
  // The dragging finger shows straight away, and again whenever the child stops rolling for a while.
  game.lastMoveAt = now() - IDLE_HINT_MS
  updatePots()
  voice.newRound()
  game.noteAt = -Infinity
  // With no clock, the host chalks the first shape to paint.
  if (modeOf() === 'calm' && isHost()) later(() => nextJob(), 500)
}

/** The picture is finished (or the time is up): everyone stops and the camera swoops up to look at it. */
function endRound() {
  if (game.state !== 'play') return
  closeFinishAsk()
  noticeMixes()
  game.notes = []
  $('mix-note').classList.add('hidden')
  // A shape still waiting for paint leaves the picture; the painted ones stay, inked.
  if (game.job && !game.job.done) {
    game.job.dispose()
    game.jobs = game.jobs.filter((j) => j !== game.job)
    game.job = null
  }
  softenPage()
  $('job').classList.add('hidden')
  suggestPot(0)
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
    effects.party([...new Set([...game.setup.entries.map((e) => SEAT_COLORS[e.seat]), ...game.found.map((m) => MIXES[m].hex)])], 28)
    if (game.final) showResults()
  }, REVEAL_MS)
}

/** The shared result: who painted, the colours we found by mixing, and how much we filled together. No ranking. */
function computeFinal() {
  noticeMixes()
  const total = Math.round(paint.coverage() * 100)
  return { t: 'final', r: roundId(), total, found: [...game.found], jobs: [...game.jobsDone], rows: game.setup.entries.map((e) => ({ seat: e.seat })) }
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
  show(null)
  renderResults()
  if (first) {
    later(() => keepFinishedPicture(true), AUTO_KEEP_MS)
    // The natural ending names what was learned.
    later(() => voice.sayNow(resultWords(foundOf(game.final), jobsOf(game.final))), 900)
  }
}

/** The mixed colours in a final message (the host's list, checked). */
const foundOf = (final) => (Array.isArray(final?.found) ? final.found.filter((m) => MIXED.includes(m)) : [])

function resultWords(found, jobs = []) {
  // A few shapes are named; a long list is counted, with its colours.
  if (jobs.length > 4) return `We painted ${jobs.length} shapes, in ${listWords.format([...new Set(jobs.flatMap(([, ...t]) => t))].map((m) => colourOf(m).word))}!`
  if (jobs.length) return `We painted ${listWords.format(jobs.map(([shape, ...targets]) => jobName(shape, targets)))}!`
  if (!found.length) return 'What a picture! Next time, roll a new colour over wet paint to mix.'
  return `We made ${listWords.format(found.map((m) => MIXES[m].word))}!`
}
/** The painted shapes in a final message (checked). */
const jobsOf = (final) => (Array.isArray(final?.jobs) ? final.jobs.filter((j) => Array.isArray(j) && Object.hasOwn(SHAPES, j[0]) && j.slice(1).every((m) => MIXED.includes(m) || TINTS.includes(m) || RATIO_CODES.includes(m))) : [])

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
  audio.studio('keep')
  const btn = $('results-save')
  btn.classList.remove('kept')
  void btn.offsetWidth
  btn.classList.add('kept')
}

/** The results show at most this many shape chips (the last one says how many more). */
const SHAPE_CHIPS = 8

function renderResults() {
  const final = game.final
  if (!final) return
  const self = game.room.selfId
  $('together').textContent = '🤝 We painted it together!'
  // The colours found by mixing, each with its recipe: ● + ● = ●.
  const found = foundOf(final)
  const jobs = jobsOf(final)
  // Light colours and ratios painted join the recipes too: ● + ⚪ = pink, ● + ● + ● = yellowish orange.
  const made = [...found, ...new Set(jobs.flatMap(([, ...t]) => t).filter((m) => TINTS.includes(m) || RATIO_CODES.includes(m)))]
  // The shapes painted (each with its colours), then the colours found by mixing.
  // A long round shows its first shapes and how many more, so the results read as a picture, not a tally.
  const shown = jobs.length > SHAPE_CHIPS ? jobs.slice(0, SHAPE_CHIPS - 1) : jobs
  $('found').innerHTML = shown.map(([shape, ...targets], i) => `<div class="recipe shape-chip" style="animation-delay:${0.15 * i}s" title="${jobName(shape, targets)}"><span class="shape">${SHAPES[shape].emoji}</span>${targets.map((m) => dot(colourOf(m).hex)).join('')}</div>`).join('')
    + (jobs.length > shown.length ? `<div class="recipe shape-chip more" title="${jobs.length - shown.length} more shapes">+${jobs.length - shown.length}</div>` : '') + (made.length
    ? made.map((m, i) => `<div class="recipe" style="animation-delay:${0.2 * i}s" title="${mixWords(m)}">${recipe(m)}</div>`).join('')
    : `<div class="recipe none">${PRIMARIES.map((b) => dot(MIXES[b].hex)).join('')}<span class="hint-mix">➕💧</span></div>`)
  $('found').setAttribute('aria-label', resultWords(found, jobs))
  // Lots to show: smaller chips, so the picture keeps its room.
  $('found').classList.toggle('many', Math.min(jobs.length, SHAPE_CHIPS) + Math.max(1, made.length) > 5)
  // The painters who made it, each with their colour: nobody is ranked or scored.
  $('cards').innerHTML = final.rows
    .map((row, i) => {
      const entry = game.setup.entries.find((e) => e.seat === row.seat)
      if (!entry) return ''
      const animal = validAnimal(entry.animal) ? ANIMALS[entry.animal].emoji : '🙂'
      // Each painter's own seat colour (the ring they wore), not the last pot they dipped in.
      return `<div class="card${entry.id === self ? ' me' : ''}" style="--c:${SEAT_COLORS[row.seat] ?? '#999'}; animation-delay:${0.15 * i}s">
        <span class="who">${animal}${entry.bot ? '<small>🤖</small>' : ''}${entry.id === self ? '<small>⭐</small>' : ''}</span>
        <span class="swatch" aria-hidden="true"></span></div>`
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
    let x = -HALF_W + 2.5 + Math.random() * (2 * HALF_W - 5)
    let z = -HALF_D + 2.5 + Math.random() * (2 * HALF_D - 5)
    // With no clock the bucket waits in the frame, so its big splash decorates the edge, not the page.
    if (modeOf() === 'calm') {
      if (Math.random() < HALF_W / (HALF_W + HALF_D)) z = Math.sign(z) * (HALF_D - 1.4)
      else x = Math.sign(x) * (HALF_W - 1.4)
    }
    if (game.arena.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2)) continue
    if (painters.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue
    if ([...items.values()].some((it) => Math.hypot(it.x - x, it.z - z) < 4)) continue
    if (game.jobs.some((job) => job.near(x, z, 6))) continue
    return { x, z }
  }
  return null
}

function hostItems(dt) {
  for (const [kind, def] of Object.entries(ITEM_KINDS)) {
    if (!MODES[modeOf()].items.includes(kind) || items.count(kind) >= def.max) continue
    game.itemWait[kind] -= dt
    if (game.itemWait[kind] > 0) continue
    const spot = freeSpot()
    if (!spot) continue
    const [min, extra] = PICKUP_WAIT[kind] ?? [8, 6]
    game.itemWait[kind] = min + Math.random() * extra
    const id = `${game.room.selfId.slice(0, 4)}${++game.itemSeq}`
    const x = Math.round(spot.x * 100) / 100, z = Math.round(spot.z * 100) / 100
    items.add(id, kind, x, z)
    send({ t: 'item', r: roundId(), id, k: kind, x, z })
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
  if (!it || game.state !== 'play' || !paintersBySeat()[seat] || !MODES[modeOf()].items.includes(it.kind)) return
  const msg = { t: 'gone', r: roundId(), id, seat, k: it.kind, x: it.x, z: it.z }
  send(msg)
  onGone(msg)
}

function onGone({ id, seat, k, x, z }) {
  game.pendingGrab.delete(id)
  items.remove(String(id))
  const p = paintersBySeat()[seat]
  if (!p || !ITEM_KINDS[k]) return
  // The device that drives the painter makes the paint happen (so it's one event for everyone).
  if (p.local && game.state === 'play') pickup(p, k, Number(x) || 0, Number(z) || 0)
  if (k === 'rainbow') {
    effects.sparkle(x, 0.5, z, '#ffffff', 16, 2.4)
    if (p === game.me) audio.rainbow()
  }
}

function pickup(p, kind, x, z) {
  const t = gameTime()
  const seed = 1 + Math.floor(Math.random() * 1e9)
  if (kind === 'bucket') {
    p.stats.splash++
    // The splash on the ground says what happened: no shouted banners.
    emit([1, p.seat, t, q(p.x + Math.sin(p.yaw) * 0.6), q(p.z + Math.cos(p.yaw) * 0.6), seed, p.paint])
  } else if (kind === 'water') {
    p.stats.water++
    emit([2, p.seat, t, q(x), q(z), seed])
  } else if (kind === 'rainbow') {
    p.rainbowUntil = now() + RAINBOW_MS
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
 * Paint events: [0 stroke, seat, t, x0, z0, x1, z1, paint bits, rainbow] [1 splat, seat, t, x, z, seed, paint bits]
 * [2 wash, seat, t, x, z, seed], positions in cm. Every device applies the same list.
 */
function applyEvent(e) {
  const [kind, seat, t] = e
  if (!(seat >= 0 && seat < 4) || !Number.isInteger(t) || t < 1 || !e.slice(3, kind === 0 ? 7 : 6).every(Number.isFinite)) return
  const x = e[3] / 100, z = e[4] / 100
  const bits = POTS.includes(e[kind === 0 ? 7 : 6]) ? e[kind === 0 ? 7 : 6] : SEAT_PAINT[seat]
  if (kind === 0) {
    paint.who = seat
    paint.stroke(t, bits, x, z, e[5] / 100, e[6] / 100, !!e[8])
    paint.who = -1
    return
  }
  const near = game.me ? clamp(1 - Math.hypot(game.me.x - x, game.me.z - z) / 30, 0.3, 1) : 1
  if (kind === 1) {
    paint.who = seat
    paint.splat(t, bits, x, z, e[5] >>> 0)
    paint.who = -1
    if (game.state === 'play') {
      effects.splash(x, z, MIXES[bits].hex, 60, 1.2)
      audio.splash(near)
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

/** Every STROKE_MS each local roller paints from where it was to where it is. */
function emitStrokes(force = false) {
  const t = gameTime()
  if (!force && t - game.lastStrokeAt < STROKE_MS) return
  game.lastStrokeAt = t
  for (const p of game.painters.values()) {
    if (!p.local || !p.strokeFrom) continue
    const r = p.rollerAt()
    const from = p.strokeFrom
    if (Math.hypot(r.x - from.x, r.z - from.z) < 0.04) continue
    if (modeOf() === 'calm' && robot(p) && !inFrame(r.x, r.z)) {
      // Robots roll over the page with their roller lifted, and paint only the frame.
      p.strokeFrom = { x: r.x, z: r.z }
      continue
    }
    const e = [0, p.seat, t, q(from.x), q(from.z), q(r.x), q(r.z), p.paint, p.rainbow ? 1 : 0]
    emit(e)
    // The host notes each change of paint the child rolls onto the request, to see if it went on in coats.
    if (p === game.me && !p.rainbow && isHost() && game.job && !game.job.done) game.job.roll(paint, t, r.x, r.z, p.paint)
    p.strokeFrom = { x: e[5] / 100, z: e[6] / 100 }
  }
}

function flushOutbox() {
  if (!game.outbox.length) return
  send({ t: 'e', r: roundId(), e: game.outbox })
  game.outbox = []
}

/** A robot friend (not a child, nor a child's painter on autopilot in tests). */
const robot = (p) => p.bot && p !== game.me
const NO_ITEMS = { has: () => false, values: () => [] }

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
      }
    }
  }
  p.x = cx - fx
  p.z = cz - fz
}

function updatePainters(dt, t) {
  const playing = game.state === 'play'
  if (playing && game.me) {
    const v = gallery.open || colourStudio.open ? { x: 0, y: 0 } : input.read()
    game.me.controls = { x: v.x, z: v.y }
    if (Math.hypot(v.x, v.y) > 0.05 || input.stick.id !== null || game.me.bot || gallery.open) game.lastMoveAt = t
  }
  // With no clock the robots paint the frame round the page and leave the bucket to the child.
  const calm = modeOf() === 'calm'
  const world = { paint, items: calm ? NO_ITEMS : items, obstacles: game.arena.obstacles, painters: [...game.painters.values()], shapes: game.jobs, frame: calm ? FRAME : 0 }
  if (playing) for (const bot of game.bots) if (bot.p.local && game.painters.has(bot.p.id)) bot.update(dt, world)
  for (const p of game.painters.values()) {
    if (p.local) {
      if (playing) {
        // Robot friends roll a little slower than a child, and slower still with no clock, so the child's paint counts.
        p.drive(dt, p.bot && !(p === game.me) ? (modeOf() === 'calm' ? 0.65 : 0.8) : 1)
        collide(p)
      } else p.speed = damp(p.speed, 0, 8, dt)
      p.rainbow = playing && t < p.rainbowUntil
      if (p.rainbow) p.stats.rainbow += dt
    } else p.follow(dt)
    const moved = p.sync(dt, t)
    if (p.local && playing) p.stats.dist += moved
    if (game.state === 'results' || game.state === 'reveal') {
      // Happy hops while everyone admires the picture.
      if (p.body) p.body.position.y = Math.abs(Math.sin(t / 220 + p.seat * 0.8)) * 0.35
    }
    if (p.speed > 1 && Math.random() < dt * 6 && !(calm && robot(p) && !inFrame(p.x, p.z))) {
      const r = p.rollerAt()
      effects.drip(r.x, r.z, p.rainbow ? RAINBOW[Math.floor(Math.random() * 6)] : p.color)
    }
    if (p.rainbow && Math.random() < dt * 3) effects.sparkle(p.x, 1.2, p.z, RAINBOW[Math.floor(Math.random() * 6)], 1, 1.6)
  }
  if (playing) {
    for (const p of game.painters.values()) if (p.local && !(calm && robot(p))) tryGrab(p)
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

/** Follow view: from above and behind (south), never turning, so up on the screen is always the same way. */
function followTarget(pos, look, glance = true) {
  const me = game.me
  let fx = me?.x ?? 0, fz = me?.z ?? 0
  // A new request chalked out of sight: the camera eases most of the way over to show it, then comes back.
  const g = game.glance
  if (glance && g && now() < g.until) [fx, fz] = [fx + (g.x - fx) * 0.75, fz + (g.z - fz) * 0.75]
  const aspect = innerWidth / innerHeight
  const k = aspect < 0.8 ? 1.55 : aspect < 1.3 ? 1.25 : 1
  const tx = clamp(fx, -HALF_W + 7 * Math.min(aspect, 1.6) / 1.6, HALF_W - 7 * Math.min(aspect, 1.6) / 1.6)
  // The near edge of the playground (and its flower beds) stays at the bottom of the screen, so a
  // tall screen shows more of the picture instead of the ground beyond it.
  const h = 15 * k, back = 11.5 * k
  const nearRay = back - h / Math.tan(Math.atan2(h, back) + THREE.MathUtils.degToRad(camera.fov / 2))
  const tz = clamp(fz, -HALF_D + 3, Math.max(-HALF_D + 3, Math.min(HALF_D - 4, HALF_D + 1.6 - nearRay)))
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

/** One "together" fill (quick round): how much of the playground everyone has painted. */
function updateBar() {
  $('bar').firstElementChild.style.width = `${(clamp(paint.coverage(), 0, 1) * 100).toFixed(1)}%`
}

const dot = (hex) => `<i class="dab${hex === MIXES[WHITE].hex ? ' white' : ''}" style="background:${hex}"></i>`
/** A mixed colour's recipe in pictures: ● + ● = ●. */
const recipe = (mask) => `${colourOf(mask).recipe.map((b) => dot(MIXES[b].hex)).join('<b>+</b>')}<b>=</b>${dot(colourOf(mask).hex)}`

/** The colours found so far, as dabs under the bar. */
function renderFoundRow() {
  $('found-row').innerHTML = game.found.map((m) => `<i class="dab" style="background:${MIXES[m].hex}" title="${MIXES[m].word}"></i>`).join('')
}

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

/** Looks for mixed colours appearing on the ground for the first time this round. */
function noticeMixes() {
  for (const m of MIXED) {
    if (game.found.includes(m) || paint.mineCounts[m] < FOUND_CELLS) continue
    game.found.push(m)
    if (game.state !== 'play') continue
    // With no clock the requests do the talking: a new colour just joins the row of dabs quietly.
    // In the quick round its recipe card shows for a moment, without a word.
    renderFoundRow()
    if (modeOf() === 'timed') game.notes.push({ mix: m })
  }
}

/**
 * Says what's waiting, one line at a time so each is heard: a new colour ("Red and yellow
 * made orange!", once per round) or a request line (a new shape, a painted shape, a tip).
 */
function sayNextMix(t) {
  if (!game.notes.length || t - game.noteAt < NOTE_MS || asking()) return
  const note = game.notes.shift()
  // A line about a card that has gone (the child picked) is not said.
  if (note.offer && note.offer !== game.offer) return
  game.noteAt = t
  if (note.words) {
    voice.sayNow(note.words)
    return
  }
  const m = note.mix
  renderFoundRow()
  showNote(recipe(m), NOTE_MS - 400)
  audio.studio('drip', 2)
  const at = paint.lastAt[m]
  if (at >= 0) {
    const c = paint.cellCentre(at)
    effects.sparkle(c.x, 0.6, c.z, MIXES[m].hex, 8, 1.2)
  }
}

// --- Paint requests (no-clock rounds) ------------------------------------------------------------

const capital = (w) => w[0].toUpperCase() + w.slice(1)
const article = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a')
/** "a green fish", "a green and brown tree" */
function jobName(shape, targets) {
  const words = [...new Set(targets.map((m) => colourOf(m).word))]
  return `${article(words[0])} ${listWords.format(words)} ${SHAPES[shape].name}`
}
/** "Yellow and blue make green." */
const recipeWords = (m) => (m >= 16 ? mixWords(m).replace(' made ', ' make ').replace('!', '.') : `${capital(listWords.format(MIXES[m].recipe.map((b) => MIXES[b].word)))} make ${MIXES[m].word}.`)
const tierOf = () => clamp(Math.floor(game.skill), 0, TOP_TIER)
/**
 * A rule in words, saying exactly what counts: "a mix of blue and one more paint" (green or purple),
 * "a mix of two paints with no yellow" (purple), "a mix with blue but no red" (green), "any colour you can mix".
 */
function ruleWords(rule) {
  const w = (b) => MIXES[b].word
  if (rule.any) return rule.light ? 'any colour you can mix, light or not' : 'any colour you can mix'
  if (rule.with && rule.without) return `a mix with ${w(rule.with)} but no ${w(rule.without)}`
  return rule.with ? `a mix of ${w(rule.with)} and one more paint` : `a mix of two paints with no ${w(rule.without)}`
}
/** Why a colour breaks a rule, truthfully: "That's brown. It has all three paints in it. Use just two." */
function ruleSlip(rule, got) {
  const w = (b) => MIXES[b].word
  if (got & WHITE && !rule.light) return `That's ${w(got)}. White made it light. This one needs no white.`
  if (got === BROWN) return `That's brown. It has all three paints in it. Use just two.`
  if (rule.without && got === rule.without) return `That's ${w(got)}. This one needs no ${w(got)}.`
  if (rule.without && got & rule.without) return `That's ${w(got)}. It has ${w(rule.without)} in it.`
  if (rule.with && !(got & rule.with)) return `That's ${w(got)}. It has no ${w(rule.with)} in it.`
  return `That's ${w(got)}.`
}
const BROWN = 7
const partColour = (part) => (part.rule ? ruleWords(part.rule) : colourOf(part.code).word)

/** The request in words: "Paint the fish green!", "Paint the fish a colour with blue in it!", or for two parts "Paint the tree: green leaves, a brown trunk!" */
function requestWords(job) {
  const def = SHAPES[job.shape]
  if (job.parts.length === 1) return `Paint the ${def.name} ${partColour(job.parts[0])}!`
  // "green leaves", "a brown trunk", then a part with a rule: "the petals a mix with blue but no red"
  const named = job.parts.filter((p) => !p.rule).map((p) => `${p.word.endsWith('s') ? '' : article(colourOf(p.code).word) + ' '}${colourOf(p.code).word} ${p.word}`)
  const ruled = job.parts.filter((p) => p.rule).map((p) => `the ${p.word} ${ruleWords(p.rule)}`)
  if (!ruled.length) return `Paint the ${def.name}: ${listWords.format(named)}!`
  return `Paint the ${def.name}: ${[...named, ...ruled].join(', and ')}!`
}

/**
 * The part of the screen a child can see the ground through: below the request card and above the
 * pots, in pixels. The card may be hidden between requests, so room is kept for it.
 */
function clearView() {
  const top = $('found-row').getBoundingClientRect().bottom + 74
  const bottom = Math.min(innerHeight - 12, $('pots').getBoundingClientRect().top - 8)
  return { left: 12, right: innerWidth - 12, top: Math.min(top, innerHeight * 0.4), bottom: Math.max(bottom, innerHeight * 0.6) }
}

const probeCam = new THREE.PerspectiveCamera()
const probePos = new THREE.Vector3()
const probeLook = new THREE.Vector3()
/** Screen pixels of a ground point, seen from where the follow camera is heading (not where it is now). */
function screenPoint(cam, x, z, v = new THREE.Vector3()) {
  v.set(x, 0, z).project(cam)
  return { x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2 }
}

/** Points the probe camera where the follow camera is heading (without any glance). */
function aimProbe() {
  followTarget(probePos, probeLook, false)
  probeCam.copy(camera)
  probeCam.position.copy(probePos)
  probeCam.lookAt(probeLook)
  probeCam.updateMatrixWorld()
}

/** The pots and the 📣 button sit over the ground: a point under them can't be seen. */
function underButtons(p) {
  for (const id of ['pots', 'voice']) {
    const b = $(id).getBoundingClientRect()
    if (b.width && p.x > b.left - 8 && p.x < b.right + 8 && p.y > b.top - 8 && p.y < b.bottom + 8) return true
  }
  return false
}
const inView = (p, view) => p.x > view.left && p.x < view.right && p.y > view.top && p.y < view.bottom && !underButtons(p)

/** How much of a shape (its outline circle and middle) is in the clear part of the screen, 0..1. */
function shownShare(shape, x, z, scale, view) {
  const r = reachOf(shape, scale) * 0.92
  let n = 0
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const p = k === 12 ? screenPoint(probeCam, x, z) : screenPoint(probeCam, x + Math.cos(a) * r, z + Math.sin(a) * r)
    if (inView(p, view)) n++
  }
  return n / 13
}

/**
 * Where a shape goes: near the child, inside the page and clear of everything else. It must be wholly
 * on screen (where the camera is heading), so a child never hunts for it; only when no such spot is
 * left does a shape go partly off screen (an arrow at the edge then points to it). Null: no room left.
 */
function placeSpot(shape) {
  const me = game.me ?? { x: 0, z: 0 }
  aimProbe()
  const view = clearView()
  // A child still finding their feet gets smaller shapes; when the page fills up, smaller shapes fit the gaps.
  const scales = game.skill < 0.5 ? [0.85, 0.7, 0.55] : [1, 0.8, 0.65, 0.55]
  for (const strict of [true, false]) {
    for (const scale of scales) {
      let best = null, bestScore = -Infinity
      for (let k = 0; k < 300; k++) {
        const x = -HALF_W + Math.random() * 2 * HALF_W, z = -HALF_D + Math.random() * 2 * HALF_D
        if (!fits(shape, x, z, game.arena.obstacles, game.jobs, scale, FRAME + 0.2)) continue
        const shown = shownShare(shape, x, z, scale, view)
        if (strict && shown < 1) continue
        // Close to the child but not under them, and as much on screen as can be.
        const d = Math.hypot(x - me.x, z - me.z)
        const score = shown * 20 - Math.abs(d - 6) + Math.random()
        if (score > bestScore) [best, bestScore] = [{ x, z, scale }, score]
      }
      if (best) return best
    }
  }
  return null
}

/**
 * The host's next request. The first shape of a round is chalked straight away; after that the card
 * offers a few chalk shapes and the child picks one (the game picks its colour or rule, which is the
 * puzzle). Only shapes that still fit are offered; when none does, the page is full.
 */
function nextJob() {
  if (!isHost() || game.state !== 'play' || modeOf() !== 'calm' || game.pageFull || game.offer) return
  // A question is waiting for an answer: ask nothing new until it's answered.
  if (asking()) return void later(() => nextJob(), 1500)
  const tier = tierOf()
  const options = []
  for (let k = 0; k < 12 && options.length < (game.jobsDone.length ? PICK_N : 1); k++) {
    const spec = chooseJob(tier, game.history)
    if (options.some((o) => o.spec.shape === spec.shape)) continue
    const spot = placeSpot(spec.shape)
    if (spot) options.push({ spec, spot })
  }
  if (!options.length) {
    // No room left for another shape: the page is full. 🖌️ keeps painting on a fresh page.
    game.pageFull = true
    askFinished('Your page is full! Is your picture finished?')
    return
  }
  if (!game.jobsDone.length) return chalkJob(options[0], tier)
  // Every few shapes the card just waits: a rest to paint freely or admire, until the child picks.
  const rest = game.jobsDone.length % REST_EVERY === 0
  const offer = { options, tier, rest }
  game.offer = offer
  renderJob()
  audio.studio('drip', 0)
  if (!game.told.has('pick')) {
    game.told.add('pick')
    game.notes.push({ words: 'Which shape next? Tap one.' })
  } else if (!rest && options.length > 1) {
    // A child who can't read the card yet hears the shapes named once, if no pick comes.
    later(() => {
      if (game.offer !== offer || asking()) return
      const names = options.map((o) => SHAPES[o.spec.shape].name)
      game.notes.push({ words: `${capital(names.slice(0, -1).join(', '))} or ${names.at(-1)}?`, offer })
    }, PICK_SAY_MS)
  }
  later(() => game.offer === offer && pickJob(Math.floor(Math.random() * options.length)), rest ? REST_PICK_MS : PICK_WAIT_MS)
}

/** The child tapped shape `k` on the card (or the game picked it for them): it is chalked near them. */
function pickJob(k) {
  const offer = game.offer
  const chosen = offer?.options[k]
  if (!chosen || game.state !== 'play') return
  game.offer = null
  audio.unlock()
  audio.click()
  // Placed again where the child is now; the spot found when it was offered if there's no room here.
  chalkJob({ spec: chosen.spec, spot: placeSpot(chosen.spec.shape) ?? chosen.spot }, offer.tier)
}

function chalkJob({ spec, spot }, tier) {
  const job = { ...spec, x: Math.round(spot.x * 100) / 100, z: Math.round(spot.z * 100) / 100, scale: spot.scale, i: game.history.length, show: tier === 0, t0: gameTime(), white: tier >= WHITE_TIER }
  game.history.push({ shape: spec.shape, targets: spec.targets })
  send({ t: 'job', r: roundId(), job })
  addJob(job, tier)
}

/**
 * A soft, still arrow at the screen edge pointing to the request when it is off screen (the child
 * rolled away from it), with the shape beside it. It fades in and out; it never moves on its own.
 */
const arrowAt = new THREE.Vector3()
function updateJobArrow() {
  const el = $('job-arrow')
  const job = game.job
  let show = false
  if (game.state === 'play' && job && !job.done && !gallery.open && !colourStudio.open) {
    const part = job.parts.find((p) => !p.done) ?? job.parts[0]
    const c = centreOf(part)
    const view = clearView()
    const p = screenPoint(camera, c.x, c.z, arrowAt)
    // Off screen, or hidden under the request card: the middle of the part can't be seen.
    const top = $('hud').querySelector('.hud-top').getBoundingClientRect().bottom
    if (p.x < 16 || p.x > innerWidth - 16 || p.y < top + 8 || p.y > innerHeight - 16 || underButtons(p)) {
      show = true
      // From the middle of the clear view toward the shape, stopped just inside the edge.
      const mx = (view.left + view.right) / 2, my = (view.top + view.bottom) / 2
      const dx = p.x - mx, dy = p.y - my
      const hw = (view.right - view.left) / 2 - 46, hh = (view.bottom - view.top) / 2 - 46
      const k = Math.min(hw / Math.max(Math.abs(dx), 1e-3), hh / Math.max(Math.abs(dy), 1e-3), 1)
      el.style.transform = `translate(${(mx + dx * k).toFixed(0)}px, ${(my + dy * k).toFixed(0)}px)`
      el.firstElementChild.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`
      if (el.dataset.shape !== job.shape) {
        el.dataset.shape = job.shape
        el.lastElementChild.textContent = job.def.emoji
      }
    }
  }
  el.classList.toggle('shown', show)
}

/** A rule from a friend's device: any colour, or a paint it must have and/or one it must not (two different paints). */
const validRule = (r) => r == null || (typeof r === 'object' && (r.any === 1 || (
  (r.with == null || PRIMARIES.includes(r.with)) && (r.without == null || PRIMARIES.includes(r.without)) && (r.with ?? r.without) != null && r.with !== r.without)))
const cleanRule = (r) => (!r ? null : r.any ? { any: 1, ...(r.light ? { light: 1 } : {}) } : { ...(r.with ? { with: r.with } : {}), ...(r.without ? { without: r.without } : {}) })

/** A friend's device follows the host's requests: a new shape, a part that was painted (at game time `at`, in colour `mix`), or a fresh page. */
function onJob({ job, done, part, at, mix, page, drop }) {
  if (game.state !== 'play') return
  if (Number.isInteger(page) && page > 0) return void freshPage(page)
  const dropped = Number.isInteger(drop) && game.jobs.find((j) => j.i === drop && !j.done)
  if (dropped) dropJob(dropped)
  const prev = game.jobs.find((j) => j.i === done)
  const p = prev?.parts[part]
  if (p && !p.done && Number.isInteger(at) && at > 0) partPainted(prev, p, at, p.rule ? (p.ok.includes(mix) ? mix : p.ok[0]) : p.target)
  if (!job || !Object.hasOwn(SHAPES, job.shape) || !Number.isFinite(job.x) || !Number.isFinite(job.z) || game.jobs.some((j) => j.i === job.i)) return
  const n = SHAPES[job.shape].parts.length
  const targets = Array.isArray(job.targets) ? job.targets : []
  const rules = Array.isArray(job.rules) ? job.rules.slice(0, n) : []
  if (targets.length !== n || !rules.every(validRule) || !targets.every((m, k) => MIXED.includes(m) || TINTS.includes(m) || RATIO_CODES.includes(m) || rules[k])) return
  addJob({
    shape: job.shape, targets, rules: rules.map(cleanRule), tilt: clamp(Number(job.tilt) || 0, -0.5, 0.5),
    x: clamp(job.x, -HALF_W, HALF_W), z: clamp(job.z, -HALF_D, HALF_D), scale: clamp(Number(job.scale) || 1, 0.5, 1), i: job.i | 0, show: !!job.show, t0: Math.max(1, job.t0 | 0),
    white: !!job.white,
  })
}

function addJob(spec, tier = 0) {
  const job = new Job(spec, paint, scene)
  job.started = now()
  job.tier = tier
  job.helped = false // a recipe, tip or rescue was given
  job.slipped = false // a colour went in that the wanted colour can't come from
  job.slips = 0
  job.rescue = 0 // 1: a ring round the next pot; 2: a still picture of the two paints crossing
  job.told = new Set() // tips already given for this shape
  job.best = 0 // how far the shape has got (parts painted plus the share of the rest), and when it last grew
  job.bestAt = job.started
  game.jobs.push(job)
  game.job = job
  // The white pot comes out at the top step (or for any request that wants a light colour) and stays for the round.
  const wantsWhite = spec.white || job.parts.some((p) => p.ok.some((m) => m & WHITE))
  if (wantsWhite && !game.white) {
    game.white = true
    updatePots()
    if (!game.told.has('white')) {
      game.told.add('white')
      game.notes.push({ words: 'A new pot: white! White makes a colour lighter.' })
    }
  }
  renderJob()
  // Out of sight (a full page leaves room only far away): the camera glances over to show where it is.
  aimProbe()
  if (shownShare(spec.shape, spec.x, spec.z, job.scale, clearView()) < 0.7) game.glance = { x: spec.x, z: spec.z, until: now() + GLANCE_MS }
  // The first steps also say the recipe (once a round each); harder ones leave it to the child.
  let words = requestWords(job)
  // The first ratio of a round says what the word means (not how to paint it).
  const ish = job.parts.find((p) => p.lean)
  if (ish && !game.told.has('ish')) {
    game.told.add('ish')
    words += ` ${capital(colourOf(ish.code).word.split(' ')[0])} means more ${MIXES[ish.lean].word}.`
  }
  if (spec.show) for (const m of new Set(job.parts.filter((p) => !p.rule).map((p) => p.target))) if (!game.told.has(m)) {
    game.told.add(m)
    words += ' ' + recipeWords(m)
  }
  game.notes.push({ words })
}

/** The request card under the bar: the shape and its colour, and the recipe when it's shown (a rule shows its paint: ● + ❓, or ⃠●). */
function renderJob() {
  const job = game.job
  const el = $('job')
  el.classList.toggle('offer', !!game.offer)
  if (game.offer) {
    // The next shapes, in chalk: the child taps the one to paint.
    el.classList.remove('hidden')
    el.innerHTML = game.offer.options.map((o, k) => `<span class="opt" data-opt="${k}" role="button" aria-label="${SHAPES[o.spec.shape].name}">${SHAPES[o.spec.shape].emoji}</span>`).join('')
    el.setAttribute('aria-label', `Pick the next shape: ${listWords.format(game.offer.options.map((o) => SHAPES[o.spec.shape].name)).replace(' and ', ' or ')}`)
    return
  }
  if (!job || job.done) return el.classList.add('hidden')
  el.classList.remove('hidden')
  const q = '<span class="q">❓</span>'
  el.innerHTML = `<span class="shape">${job.def.emoji}</span>` + job.parts.map((p) => {
    if (p.rule) {
      // ● + ❓ (a paint and one more), ⃠● (not this paint), both for a two-part rule, or 🎨 for the child's own choice.
      const no = p.rule.without ? `<span class="no">${dot(MIXES[p.rule.without].hex)}</span>` : ''
      const how = p.rule.any ? '<span class="pick">🎨</span>' : p.rule.with ? `${dot(MIXES[p.rule.with].hex)}<b>+</b>${q}${no ? `<i class="gap"></i>${no}` : ''}` : no
      return `<span class="part rule${p.done ? ' done' : ''}">${p.done ? dot(MIXES[p.target].hex) : '<span class="q big">❓</span>'}<span class="how">${how}</span></span>`
    }
    // A ratio shows three hidden coats: ❓ + ❓ + ❓.
    const how = colourOf(p.code).recipe.map((b) => (job.show ? dot(MIXES[b].hex) : q)).join('<b>+</b>')
    return `<span class="part${p.done ? ' done' : ''}">${dot(colourOf(p.code).hex)}<span class="how">${how}</span></span>`
  }).join('') + (job.rescue === 3 && isHost() ? '<span class="swap" data-swap role="button" aria-label="Another shape">🔄</span>' : '')
  el.setAttribute('aria-label', requestWords(job))
}

/** A stuck child swaps the request (host): the shape leaves the page and new shapes are offered, from the easier step. */
function swapJob() {
  const job = game.job
  audio.unlock()
  audio.click()
  send({ t: 'job', r: roundId(), drop: job.i })
  dropJob(job)
  later(() => nextJob(), 600)
}

/** A request leaves the page (every device): its chalk goes, and any part painted on it is plain paint again. */
function dropJob(job) {
  job.dispose()
  for (const part of job.parts) for (const i of part.cells) paint.locked[i] = 0
  game.jobs = game.jobs.filter((j) => j !== job)
  if (game.job === job) game.job = null
  suggestPot(0)
  renderJob()
}

/** Tells the recipe (and shows it on the card) for one part of the request. */
function giveRecipe(job, part, lead = '') {
  job.helped = true
  job.show = true
  game.told.add(part.target)
  renderJob()
  game.notes.push({ words: `${lead}${recipeWords(part.target)}` })
}

/** The paint a part needs next: the one of its recipe not on it yet (for a rule, its own paint first). */
function nextPaint(job, part) {
  const colour = part.rule ? part.ok.reduce((a, b) => (part.byMix[b] > part.byMix[a] ? b : a)) : part.target
  let order = MIXES[colour].recipe
  if (part.rule?.with) order = [part.rule.with, ...order.filter((b) => b !== part.rule.with)]
  const n = part.cells.length || 1
  // A ratio: its paint again once the even mix is on (yellow over the shiny orange, for a yellowish orange).
  if (part.lean && !part.rule && (part.byMix[part.target] / n > 0.3 || part.share > 0.05)) return part.lean
  if (part.lean && !part.rule) order = [part.lean, ...order.filter((b) => b !== part.lean)]
  const on = (b) => {
    let k = 0
    for (let m = 1; m < 16; m++) if (m & b && Job.fits(part, m)) k += part.byMix[m]
    return k / n > 0.08
  }
  return order.find((b) => !on(b)) ?? order.at(-1)
}

/** A soft, still ring round one pot (0: none): the rescue for a child who is stuck. */
function suggestPot(bits) {
  for (const el of document.querySelectorAll('[data-pot]')) el.classList.toggle('suggest', Number(el.dataset.pot) === bits)
}

/** The host watches the current shape: tips when they help, then the next shape once it's painted. */
function checkJob(t) {
  const job = game.job
  if (!job || job.done || !isHost()) return
  const { finished, wrong, active } = job.check(paint)
  if (wrong) {
    // A colour that can't become the wanted one: say what it is and why, and how to fix it (once a round).
    job.slipped = true
    job.slips++
    const got = MIXES[job.wrongColour(wrong)].word
    if (wrong.rule) {
      game.notes.push({ words: ruleSlip(wrong.rule, job.wrongColour(wrong)) })
    } else if (job.tier >= RULE_TIER) {
      // White where it doesn't belong (said why once a round): "That's light green, not green. White makes colours light."
      const pale = job.wrongColour(wrong) & WHITE && !(wrong.target & WHITE) && !game.told.has('pale')
      if (pale) game.told.add('pale')
      game.notes.push({ words: `That's ${got}, not ${colourOf(wrong.code).word}.${pale ? ' White makes colours light.' : ''}` })
    }
    else giveRecipe(job, wrong, `That's ${got}. `)
    if (!game.told.has('fix')) {
      game.told.add('fix')
      game.notes.push({ words: 'Let it dry, then roll over it.' })
    }
  }
  if (active) {
    // Progress counts the wanted colour, and coats that can still become it (by how many of its coats are on): laying the first coats of brown is progress too.
    const progress = job.parts.reduce((sum, p) => sum + (p.done ? 1 : p.share + p.near * 0.8), 0)
    if (progress > job.best + 0.02) [job.best, job.bestAt] = [progress, t]
    const still = t - job.bestAt
    const recipeBits = active.rule ? [] : MIXES[active.target].recipe
    const have = recipeBits.filter((b) => active.byMix[b] > active.cells.length * 0.2)
    if (!active.rule && still > WET_TIP_MS && have.length === 1 && active.share < 0.05 && recipeBits.length === 2 && !job.told.has('wet')) {
      // One paint of the recipe sits on the shape and nothing is mixing: roll the other over it while it shines.
      job.told.add('wet')
      job.helped = true
      const other = recipeBits.find((b) => !have.includes(b))
      game.notes.push({ words: `Roll ${MIXES[other].word} over the shiny ${MIXES[have[0]].word}!` })
    } else if (active.lean && !active.rule && still > RATIO_TIP_MS && active.share < 0.05 && active.byMix[active.target] > active.cells.length * 0.5 && !job.told.has('wet')) {
      // The even mix is on and the child has stopped, but there is not more of the paint it leans to yet:
      // roll that one over the mix while it still shines (soon, before it dries).
      job.told.add('wet')
      job.helped = true
      game.notes.push({ words: `${capital(MIXES[active.target].word)}! Now more ${MIXES[active.lean].word}: roll ${MIXES[active.lean].word} over the shiny ${MIXES[active.target].word}.` })
    } else if (active.rule?.with && still > WET_TIP_MS && active.share < 0.05 && active.byMix[active.rule.with] > active.cells.length * 0.2 && !game.told.has('friend')) {
      // Plain blue on "a mix of blue and one more paint": blue alone isn't a mix (said once a round).
      game.told.add('friend')
      job.told.add('wet')
      const w = MIXES[active.rule.with].word
      game.notes.push({ words: `${capital(w)} alone is not a mix. ${capital(w)} needs a friend!` })
    } else if (!active.rule && job.tier < RULE_TIER && still > HELP_MS && !job.show && active.share < 0.15) {
      giveRecipe(job, active)
    }
    // The rescue for a child who is stuck: a still ring round the pot to use next, then a picture of the mix.
    // (A tip just said gets a few seconds to work before the ring comes.)
    const stuck = active.share < 0.05 && (still > RESCUE_MS + (job.told.has('wet') ? 8000 : 0) || job.slips >= 2)
    if (stuck && job.rescue < 1) {
      job.rescue = 1
      job.helped = true
      game.notes.push({ words: `Try the ${MIXES[nextPaint(job, active)].word} pot.` })
    }
    if (job.rescue >= 1) suggestPot(active.share < 0.3 ? nextPaint(job, active) : 0)
    if (job.rescue === 1 && active.share < 0.05 && still > GHOST_MS) {
      job.rescue = 2
      job.ghost(active, visiblePoint(active))
      const paints = colourOf(active.rule ? active.ok[0] : active.code).recipe.map((b) => MIXES[b].word)
      game.notes.push({ words: `Look: ${paints.slice(0, -1).join(', ')}, then ${paints.at(-1)} on top while it shines.` })
    }
    if (job.rescue === 2 && active.share > 0.2 && job.ghostGroup) job.ghost(null)
    // Still stuck long after the picture, or a long while on a shape that is barely half done: it is too hard
    // for now. The requests step down (once; finishing it later moves nothing) and the card offers another shape.
    const long = now() - job.started > STUCK_MS * 3 && job.best < job.parts.length * 0.5
    if (job.rescue < 3 && active.share < 0.2 && ((job.rescue === 2 && still > GHOST_MS + STUCK_MS) || long)) {
      job.rescue = 3
      job.helped = true
      game.skill = clamp(game.skill - SLIP_STEP, 0, TOP_TIER + 0.5)
      store.set('paint-splash-skill', game.skill)
      renderJob()
      if (!game.told.has('swap')) {
        game.told.add('swap')
        game.notes.push({ words: 'This one is tricky! Tap the arrows for another shape, or keep trying.' })
      }
    }
    // Nearly painted and nothing wrong on it, but the last bits are hard to reach: that's painted.
    if (!finished.includes(active) && active.share >= STALL_SHARE && still > STALL_MS && active.wrong < 0.05) finished.push(active)
  }
  for (const part of finished) {
    const at = gameTime()
    const mix = job.chosen(part)
    send({ t: 'job', r: roundId(), done: job.i, part: job.parts.indexOf(part), at, mix })
    partPainted(job, part, at, mix)
  }
  if (!job.done) return
  suggestPot(0)
  // Painted! Careful, unhelped painting in coats (one paint all over, then the next on top while it
  // shines) moves the requests up a small step; a slip moves them gently down. Swapping pots back and
  // forth while scrubbing still paints the shape, but it is not yet the painter's way, so it moves nothing.
  // A shape in the child's own choice of colour is for making, not a test: it moves nothing up.
  const coats = job.parts.every((p) => Job.layered(p))
  const clean = !job.slipped && !job.helped && !job.parts.some((p) => p.rule?.any)
  const up = game.skill < game.peak ? REEARN_STEP : SKILL_STEP
  game.skill = clamp(game.skill + (clean && coats ? up : job.slipped ? -SLIP_STEP : 0), 0, TOP_TIER + 0.5)
  game.peak = Math.max(game.peak, game.skill)
  store.set('paint-splash-skill', game.skill)
  store.set('paint-splash-peak', game.peak)
  // Once a round, the painter's way is named: as praise the first time it is done, or as a tip for a scrubber.
  if (clean && coats && !game.told.has('coats')) {
    game.told.add('coats')
    game.notes.push({ words: 'One coat, then the next on top while it shines. Just like a painter!' })
  } else if (clean && !coats && !game.told.has('scrub')) {
    game.told.add('scrub')
    const first = job.parts.find((p) => !Job.layered(p)) ?? job.parts[0]
    const [a, ...rest] = colourOf(first.code).recipe.map((m) => MIXES[m].word)
    game.notes.push({ words: `Next time, try ${a} all over first, then ${rest.join(', then ')} on top.` })
  }
  later(() => nextJob(), NEXT_JOB_MS + (game.jobsDone.length % REST_EVERY ? 0 : REST_MS))
}

/** One part is painted: it is tidied inside its lines and kept, its outline turns to ink; the last part finishes the shape. */
function partPainted(job, part, at, colour) {
  job.fill(part, paint, at, colour, game.me?.paint ?? 0)
  job.draw()
  // Paint a roller laid at the shape's edge in the next moment is washed too (every device, at the same game time).
  if (job.done) job.retidyAt = at + RETIDY_MS
  const c = centreOf(part)
  effects.sparkle(c.x, 0.6, c.z, colourOf(part.code).hex, 10, 1.6)
  if (job.done) finishJob(job)
  else {
    audio.studio('drip', 1)
    renderJob()
  }
}

/**
 * A point of a part the child can see (for the still picture of the mix), as near its middle as can
 * be but not under the child's own painter, which would hide it; null to use its middle.
 */
function visiblePoint(part) {
  const view = clearView()
  const c = centreOf(part)
  const me = game.me
  const v = new THREE.Vector3()
  let best = null, bestD = Infinity
  for (let k = 0; k < part.cells.length; k += 7) {
    const { x, z } = paint.cellCentre(part.cells[k])
    if (!inView(screenPoint(camera, x, z, v), view)) continue
    // Under or right beside the painter counts as far away: any clear spot on the part is better.
    const hidden = me && Math.hypot(x - me.x, z - me.z) < 1.8
    const d = Math.hypot(x - c.x, z - c.z) + (hidden ? 100 : 0)
    if (d < bestD) [best, bestD] = [{ x, z }, d]
  }
  return best
}

function centreOf(part) {
  let x = 0, z = 0
  for (const [a, b] of part.poly) { x += a; z += b }
  return { x: x / part.poly.length, z: z / part.poly.length }
}

/** A shape is painted: one soft chime and the ink outline say so (its name waits for the ending). */
function finishJob(job) {
  game.jobsDone.push([job.shape, ...job.parts.map((p) => p.code)])
  audio.studio('keep')
  // The child's own choice of colour: say back what they chose and how they made it.
  const own = job.parts.find((p) => p.rule?.any)
  if (own) game.notes.push({ words: `${capital(MIXES[own.target].word)}! ${recipeWords(own.target)}` })
  effects.sparkle(job.x, 0.8, job.z, colourOf(job.parts[0].code).hex, 16, 2)
  renderJob()
}

/**
 * A fresh page at game time `at` (every device): the full page goes into My pictures, then the
 * ground is washed clean and the shapes' ink lines go. The painted shapes still count in the results.
 */
function freshPage(at) {
  softenPage()
  keepWholePage()
  for (const job of game.jobs) job.dispose()
  game.jobs = []
  game.job = null
  game.pageFull = false
  game.offer = null
  suggestPot(0)
  paint.locked.fill(0)
  for (let i = 0; i < paint.mix.length; i++) paint.write(i, at, 0)
  renderJob()
  audio.studio('keep')
  game.notes = [{ words: 'Your picture is in My pictures. Here is a fresh page!' }]
}

function turnPage() {
  const at = gameTime()
  send({ t: 'job', r: roundId(), page: at })
  freshPage(at)
  later(() => nextJob(), NEXT_JOB_MS + 1500)
}

/**
 * With no clock the shapes are the picture. Paint off the shapes softens toward a quiet grey once it
 * is dry (more than half way on the page, a little in the frame), so trails and the robots' frame never
 * compete with the inked shapes, and a dry red trail reads as dusty rose, never as the pink of a tint. Wet paint stays true while it can still mix, and paint on a shape still being
 * painted is left alone. Display only: the paint itself, and every device's picture, are unchanged.
 */
const PAGE_SOFT = 0.6
const FRAME_SOFT = 0.3
function softAmount(x, z) {
  if (Math.abs(x) > HALF_W - FRAME || Math.abs(z) > HALF_D - FRAME) return FRAME_SOFT
  for (const job of game.jobs) if (!job.done && job.near(x, z, 0.4)) return 0
  return PAGE_SOFT
}
/** At the reveal, everything off the shapes softens, wet or dry. */
function softenPage() {
  if (modeOf() === 'calm' && game.jobsDone.length) paint.soften(softAmount)
}
/** A shape painted a moment ago is tidied once more, so a roller still rolling at its edge leaves it crisp. */
function retidy() {
  const t = gameTime()
  for (const job of game.jobs) if (job.retidyAt && t >= job.retidyAt) {
    job.tidy(paint, job.retidyAt)
    job.retidyAt = 0
  }
}
/** During play, dry paint softens (checked once a second). */
function softenDry(t) {
  if (modeOf() !== 'calm' || t - (game.softAt ?? 0) < 1000) return
  game.softAt = t
  paint.soften(softAmount, gameTime() - WET_MS - 200)
}

/** Keeps the whole playground, seen from straight above, in My pictures, then puts the camera back. */
function keepWholePage() {
  const pos = camera.position.clone()
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const pxPerM = Math.min(innerHeight / (2 * HALF_D + 1.5), innerWidth / (2 * HALF_W + 2))
  const h = innerHeight / (pxPerM * 2 * Math.tan(fov / 2))
  camera.position.set(0, h, h * 0.12)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  gallery.keep(pictureRect())
  camera.position.copy(pos)
  camera.lookAt(camLook)
  camera.updateMatrixWorld()
}

function say() {
  if (!game.me || game.state !== 'play') return
  audio.unlock()
  audio.voice(game.me.animal)
  effects.sparkle(game.me.x, 2, game.me.z, game.me.color, 12, 1.5)
  send({ t: 'say', r: roundId(), seat: game.me.seat })
}

function updateHud(t) {
  if (t - game.lastHud < 250) return
  game.lastHud = t
  updateBar()
  if (game.state !== 'play') return
  $('hint').classList.toggle('hidden', t - game.lastMoveAt < IDLE_HINT_MS)
  noticeMixes()
  checkJob(t)
  sayNextMix(t)
  softenDry(t)
  retidy()
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
    if (game.state === 'play') {
      if (isHost()) hostItems(dt)
      if (modeOf() === 'timed') {
        const elapsed = (t - game.roundStart) / 1000
        if (isHost() && elapsed >= game.setup.seconds) endRound()
        else if (!isHost() && elapsed >= game.setup.seconds + 3) endRound()
      }
      // With no clock the host asks only when the page is full of shapes (nextJob); the child can say Finished any time.
    }
    items.update(dt, t)
    updateCamera(realDt, t)
    updateHud(t)
    updateJobArrow()
    if (game.me && (game.state === 'play' || game.state === 'countdown' || game.state === 'syncing')) {
      meMarker.visible = true
      // The 'you' heart rides still above the painter, facing the camera: it moves only when the painter does.
      meMarker.position.set(game.me.x, 2.6, game.me.z)
      meMarker.rotation.y = 0
    } else meMarker.visible = false
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
  if (!colourStudio.open) renderer.render(scene, camera)
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
    game, paint, items, audio, effects, camera, renderer, scene, THREE, gallery, colourStudio, input,
    end: () => (isHost() ? endRound() : null),
    finish: () => finishPicture(),
    pot: (bits) => choosePot(bits),
    /** Picks shape k from the card's offer (for tests). */
    pick: (k) => pickJob(k),
    /** Chalks a shape where asked (for tests): `targets` per part (0 where `rules` has a rule), `paint` true paints it at once. */
    chalk(shape, x, z, targets, paintIt = false, rules = []) {
      const job = { shape, targets, rules, tilt: 0, x, z, scale: 1, i: 900 + game.jobs.length, show: !rules.length, t0: gameTime() }
      send({ t: 'job', r: roundId(), job })
      addJob(job)
      if (paintIt) for (const part of game.job.parts) partPainted(game.job, part, gameTime(), part.target)
    },
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
      for (let i = 0; i < paint.mix.length; i++) h = (h * 31 + paint.mix[i] + paint.lean[i] * 16) | 0
      return h
    },
  }
}

boot()
