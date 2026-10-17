import * as THREE from 'three'
import * as CANNON from 'cannon'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { joinRoom } from 'https://bitgames.store/vendor/bitgames/multiplayer-1.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { CAR_MODELS, Car, TURBO_COOLDOWN, carColour, nearCamera, prepareTemplate } from './car.js'
import { CITIES, buildCity, seeThrough } from './cities.js'
import { createGates } from './gates.js'
import { Debris } from './damage.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { Pickups } from './pickups.js'
import { carPortraits } from './portraits.js'
import { GROUP_BOT, GROUP_CAR, GROUP_PROP, GROUP_STATIC, STATIC_MASK, canvasTexture, clamp, damp, escapeHtml, harmless, reducedMotion, rng, smoothing } from './util.js'

const params = new URLSearchParams(location.search)
const DEBUG = params.has('debug')
const $ = (id) => document.getElementById(id)
const FIXED_DT = 1 / 60
/** Once the first child finishes, everyone else has this long before the podium. */
const FINALE_SECONDS = 20
/** Once every robot is home, a child still racing has this long before the podium. */
const BOTS_HOME_SECONDS = 30
/** How long the host waits for slow devices to build the city before starting anyway. */
const READY_TIMEOUT = 12000
/** Seconds a respawned car drives through other cars, so it never lands inside one. */
const RESPAWN_GHOST = 2
const RESET_COOLDOWN = 3
/** Easy-mode racing stays at the calm cruise (about 72 km/h), even holding 🚀: no turbo, no burst of speed. */
const EASY_RACE_TOP = 20
/** Easy racing: lined up for a jump, the car (and each bot) takes the run-up at this speed, so it clears the gap instead of dropping in. */
const JUMP_SPEED = 24
/** Easy racing: the bots' calm paces (m/s on the straight), either side of the child's 19 m/s cruise. */
const EASY_BOT_PACE = [20.2, 19.6, 19.0]
const FIX_COOLDOWN = 8
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
/** A place as a picture: medals for the podium, then a plain number. */
const MEDAL = ['🥇', '🥈', '🥉']
const placeIcon = (i) => MEDAL[i] ?? String(i + 1)
const PLAYER_EMOJI = ['🦊', '🐼', '🐸', '🐯', '🐵', '🐰', '🐶', '🐨']

// --- Renderer, scene, physics -------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.35
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600)
const hemi = new THREE.HemisphereLight('#ffffff', '#6a7a50', 0.7)
scene.add(hemi)
const sun = new THREE.DirectionalLight('#ffffff', 2.2)
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 })
sun.shadow.bias = -0.0004
scene.add(sun, sun.target)

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#7ec8f0') }, bottom: { value: new THREE.Color('#f6e7c8') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(vP.y * 1.6 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
})
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), skyMaterial)
scene.add(sky)

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
// The default array matrix is sized by the highest body id, which keeps growing
// as cities and debris come and go; the object matrix only stores real pairs.
world.collisionMatrix = new CANNON.ObjectCollisionMatrix()
world.collisionMatrixPrevious = new CANNON.ObjectCollisionMatrix()
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true
world.solver.iterations = 10
const groundMaterial = new CANNON.Material('ground')
const carMaterial = new CANNON.Material('car')
world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, carMaterial, { friction: 0.35, restitution: 0.05 }))
world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, carMaterial, { friction: 0.3, restitution: 0.15 }))
world.defaultContactMaterial.friction = 0.4
world.defaultContactMaterial.restitution = 0.1
const ground = new CANNON.Body({ mass: 0, material: groundMaterial, collisionFilterGroup: GROUP_STATIC, collisionFilterMask: STATIC_MASK })
ground.addShape(new CANNON.Plane())
ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(ground)

const effects = new Effects(scene)
const audio = new Audio()
const debris = new Debris(scene, world)
const pickups = new Pickups(scene)
const env = { scene, world, effects, audio, debris, carMaterial, staticMaterial: groundMaterial }
const input = new Input(document.body)

/**
 * Adaptive quality, aiming for ~50 fps: tablets that can't keep up lose
 * resolution and then shadows, not frame rate, and get resolution back when
 * there's room. Shadows stay off once dropped: turning them on or off
 * recompiles every shader, a stall of its own. Hysteresis (drop below 45, rise
 * above 57, and a longer wait to rise again after each drop) keeps it from
 * flickering between levels.
 */
const quality = { level: params.has('lowgfx') ? 0 : 2, pinned: params.has('lowgfx'), frames: 0, time: 0, holdUntil: 0, drops: 0 }
const QUALITY_PIXELS = [0.6, 1, Math.min(devicePixelRatio, 1.75)]
function applyQuality() {
  renderer.setPixelRatio(QUALITY_PIXELS[quality.level])
  renderer.shadowMap.enabled = quality.level > 0
  sun.castShadow = quality.level > 0
  resize()
}
function measureQuality(realDt, now) {
  if (quality.pinned) return
  quality.frames++
  quality.time += realDt
  if (quality.time < 2.5) return
  const fps = quality.frames / quality.time
  quality.frames = 0
  quality.time = 0
  if (fps < 45 && quality.level > 0) {
    quality.level--
    quality.drops++
    quality.holdUntil = now + 8000 * quality.drops
    applyQuality()
  } else if (fps > 57 && quality.level === 1 && now > quality.holdUntil) {
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

// --- Game state -------------------------------------------------------------------

const game = {
  room: null,
  templates: {},
  portraits: {}, // car model -> picture (data URL) for the picker and podium
  props: {},
  state: 'loading', // loading | menu | waiting | syncing | countdown | race | results
  city: 'ubud',
  mode: 'race', // race (the default: a real race against the robot cars) | smash (Bumpers)
  laps: 2,
  players: new Map(), // id -> { id, emoji, model }
  hostId: null, // who runs the lobby and the bots (moves on if the host leaves)
  myModel: null, // the car this child picked in the lobby
  cars: new Map(), // id -> Car
  progress: new Map(), // id -> { lap, sector, hint, total, finished, proj }
  finishTimes: new Map(),
  bumpedAt: new Map(), // Bumpers: id -> race time a child was last bumped by a robot
  stats: new Map(), // id -> { stars, air, flips, crashes, cones, boxes, bumps } (see newStats)
  left: new Set(), // ids that left mid-race
  ready: new Set(), // humans whose city is built (host only)
  assetsReady: false, // the cars are loaded (enough for the lobby)
  propsReady: false, // the scenery is loaded too (needed to build a place)
  pendingSetup: null, // a race that waits for the scenery to load
  queue: [], // messages that arrived before the cars loaded
  timers: new Set(), // setTimeout ids of this race, cleared when a new one starts
  raceOn: false, // the cars are racing (from GO until the podium)
  finaleAt: 0, // race time when the podium shows for everyone (0: no one has finished)
  track: null,
  player: null,
  setup: null,
  raceTime: 0,
  timeScale: 1,
  slowmoUntil: 0,
  cameraMode: 0,
  snapCamera: false, // the next camera frame jumps straight behind the car (after a rescue)
  lastSend: 0,
  lastStats: 0,
  fixCooldown: 0,
  resetCooldown: 0,
}


function renderModeChoice() {
  document.querySelector('.laps').classList.toggle('hidden', game.mode !== 'race')
}
renderModeChoice()

/** Easy mode (Race and Bumpers): bumps are soft (dust, no sparks, dents or camera shake). Easy bots still race for real (see Bot.pace). */
const calmRoad = () => input.easyGas
/** A distance along the loop, wrapped into 0 … the loop's length. */
const loopMod = (d) => ((d % game.track.length) + game.track.length) % game.track.length

// --- Zoom arches (Race and Bumpers) ------------------------------------------------
// A rainbow over one lane at each gate (see gates.js): through it, a burst of speed.

const gates = createGates(scene)
/**
 * Through the rainbow, the car gets a burst of speed: for this many seconds it may go ZOOM_EXTRA m/s over its usual
 * top speed, gathering pace at ZOOM_PUSH m/s² (enough to pass a car close ahead, not to run away).
 */
const ZOOM_SECONDS = 5.5
const ZOOM_EXTRA = 10
const ZOOM_PUSH = 8
/** A race's gates: the one on show, and how far ahead each was last tick. */
const newGateRun = () => ({ ahead: null, last: new Map() })
/** Easy mode: a ◀ or ▶ held longer than this (s) fades to a light touch (see humanController). */
const HELD_TOO_LONG = 3
/** Easy mode: how recently (s) the child's own ◀ or ▶ must have pointed the car to the rainbow's side for it to count. */
const STEERED_SECONDS = 4
/** A whole line of stars swept up: a small burst of its own (a fraction of a rainbow's, for this many seconds). */
const STAR_ZOOM = { power: 0.5, seconds: 2.5 }
/** Metres either side of a gate within which going from just before it to just after it counts as going under it (a rescue can carry the car a few metres on). */
const GATE_PASS = 40

/** Each tick in Race and Bumpers: shows the gate coming up, and notices the car going under one. */
function watchGates() {
  const car = game.player
  const proj = game.progress.get(car.id)?.proj
  const run = game.gateRun
  if (!proj || !run) return
  const L = game.track.length
  let next = null, nextAhead = Infinity
  for (const g of gates.gates) {
    const ahead = loopMod(g.dist - proj.dist)
    const was = run.last.get(g)
    run.last.set(g, ahead)
    // Under it: just ahead a moment ago, just behind now (or carried past it by a rescue: a tap still counts).
    if (was != null && was < GATE_PASS && ahead > L - GATE_PASS) passGate(g, car, proj)
    else if (ahead < nextAhead) {
      nextAhead = ahead
      next = g
    }
  }
  const showing = nextAhead < 120 ? next : null
  if (showing === run.ahead) return
  run.ahead = showing
  renderGatePick()
}

/** Under gate `g`: through the rainbow (or ⚡ tapped), a burst of speed; the other lane, nothing at all. */
function passGate(g, car, proj) {
  const run = game.gateRun
  if (run.ahead === g) run.ahead = null
  // In the rainbow's lane: on its side of the road and off the middle. In Easy mode the car drives itself, so the lane
  // counts only when the child's own ◀ or ▶ took it there (a car left alone never gets a burst by chance).
  const off = proj.lateral * g.side
  const steered = car.steeredSide === g.side && game.raceTime - car.steeredAt < STEERED_SECONDS
  const inLane = input.easyGas ? off >= 0.6 && steered : off >= game.track.width * 0.12
  if (g.tapped || inLane) zoom(car)
  gates.redress(g)
  renderGatePick()
}

const zoomPoint = new THREE.Vector3()
const zoomSpray = new THREE.Vector3()
function zoom(car, { power = 1, seconds = ZOOM_SECONDS } = {}) {
  // A small burst never cuts short a bigger one already going.
  if (car.zoomUntil > game.raceTime && (car.zoomPower ?? 1) > power) return
  car.zoomUntil = game.raceTime + seconds
  car.zoomPower = power
  car.zoomHeld = 0
  audio.zoom()
  // A spray of rainbow sparkles where the car went through.
  const p = car.body.position
  for (let i = 0; i < 26; i++) {
    zoomSpray.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6)
    effects.sparkle(zoomPoint.set(p.x, 1.4, p.z), zoomSpray, RAINBOW[i % RAINBOW.length])
  }
  banner(power < 1 ? '⭐💨' : '⚡💨', 900)
  effects.addShake(0.12)
}
const RAINBOW = ['#ff5d6c', '#ffb23f', '#ffe45c', '#7ed957', '#5cc8ff', '#a98bff']

/** Easy mode: the gate coming up as one big ⚡ button on the rainbow's side; a tap takes the car through it. */
function renderGatePick() {
  const el = $('gate-pick')
  const g = game.gateRun?.ahead
  const on = !!g && input.easyGas && game.state === 'race'
  el.classList.toggle('hidden', !on)
  if (!on) return
  el.classList.toggle('right', g.side > 0)
  el.classList.toggle('chosen', !!g.tapped)
}
function pickLane() {
  const g = game.gateRun?.ahead
  if (!g || game.state !== 'race' || g.tapped) return
  audio.unlock()
  audio.tap()
  g.tapped = true
  renderGatePick()
}
$('gate-pick').onclick = pickLane

const isHost = () => game.room && game.hostId === game.room.selfId
/** The current race's id: every race message carries it, so stragglers from the last race are ignored. */
const raceId = () => (game.pendingSetup ?? game.setup)?.seed ?? 0

/** A timer that belongs to this race: startRace() and the lobby cancel whatever is still pending. */
function later(fn, ms) {
  const id = setTimeout(() => {
    game.timers.delete(id)
    fn()
  }, ms)
  game.timers.add(id)
  return id
}
/** Every way out of a race (new city, Race again, the host's menu) passes here: its timers stop together. */
function clearTimers() {
  for (const id of game.timers) clearTimeout(id)
  game.timers.clear()
}

// --- Assets -------------------------------------------------------------------------

const loader = new GLTFLoader()

/** The cars: enough for the lobby. Each is prepared for the road now, not when the first race starts. */
async function loadCars() {
  const models = Object.keys(CAR_MODELS)
  $('loading-text').textContent = ''
  await Promise.all(
    models.map(async (name) => {
      const gltf = await loader.loadAsync(`./models/car_${name}.glb`)
      const template = gltf.scene.getObjectByName(`car_${name}`) ?? gltf.scene
      prepareTemplate(template)
      game.templates[name] = template
      // Each car that is ready drives onto the loading screen.
      $('loading-text').textContent += CAR_MODELS[name].emoji
    }),
  )
  game.portraits = carPortraits(renderer, game.templates)
}

/** A car's picture, or its emoji if the pictures couldn't be made. */
function carPic(model, cls = 'pic') {
  const src = game.portraits[model]
  return src ? `<img class="${cls}" src="${src}" alt="" draggable="false">` : `<span class="emoji">${CAR_MODELS[model].emoji}</span>`
}

/** The scenery (every place's Blender props): loads behind the lobby; a race waits for it. */
async function loadProps() {
  const gltf = await loader.loadAsync('./models/props.glb')
  for (const child of gltf.scene.children) game.props[child.name] = child
}

/**
 * Runs `load`; if it fails (a dropped connection), the loading screen offers a
 * big retry button instead of spinning forever. One tap retries everything that failed.
 */
const retries = []
function withRetry(load) {
  return load().catch((err) => {
    console.warn('Loading failed:', err)
    $('load-error').classList.remove('hidden')
    $('retry').classList.remove('hidden')
    return new Promise((resolve) => retries.push(() => resolve(withRetry(load))))
  })
}
$('retry').onclick = () => {
  $('retry').classList.add('hidden')
  $('load-error').classList.add('hidden')
  for (const again of retries.splice(0)) again()
}

// --- Menu ---------------------------------------------------------------------------

const CAR_IDS = Object.keys(CAR_MODELS)
const validModel = (m) => typeof m === 'string' && Object.hasOwn(CAR_MODELS, m)

function show(screen) {
  for (const id of ['loading', 'menu', 'waiting', 'results']) $(id).classList.toggle('hidden', id !== screen)
  $('hud').classList.toggle('hidden', !['race', 'countdown', 'syncing'].includes(game.state))
}

function renderPlayers() {
  const self = game.room?.selfId
  const html = [...game.players.values()]
    .map((p) => {
      const car = validModel(p.model) ? CAR_MODELS[p.model].emoji : ''
      return `<span class="player${p.id === self ? ' me' : ''}">${escapeHtml(p.emoji)}${car}</span>`
    })
    .join('')
  $('players').innerHTML = html
  $('players-waiting').innerHTML = html
  renderCarPicker()
}

/** A row of cars to tap. Friends' animals show on the cars they picked; two can pick the same one. */
function renderCarPicker() {
  const self = game.room?.selfId
  const friends = new Map()
  for (const p of game.players.values()) if (p.id !== self && validModel(p.model)) friends.set(p.model, (friends.get(p.model) ?? '') + escapeHtml(p.emoji))
  const html = CAR_IDS.map(
    (id) => `<button class="car-pick ${id === game.myModel ? 'selected' : ''}" data-car="${id}" aria-label="${CAR_MODELS[id].name}">
      ${carPic(id)}${friends.has(id) ? `<span class="taken">${friends.get(id)}</span>` : ''}</button>`,
  ).join('')
  for (const el of [$('cars'), $('cars-waiting')]) el.innerHTML = html
  for (const el of document.querySelectorAll('[data-car]')) el.onclick = () => pickCar(el.dataset.car)
}

function pickCar(model) {
  if (!validModel(model) || !game.room) return
  audio.unlock()
  audio.beep()
  game.myModel = model
  const me = game.players.get(game.room.selfId)
  if (me) me.model = model
  if (isHost()) broadcastPlayers()
  else send({ t: 'pick', model })
  renderPlayers()
}

function buildMenu() {
  $('cities').innerHTML = Object.entries(CITIES)
    .map(([id, c]) => `<button class="city ${id === game.city ? 'selected' : ''}" data-city="${id}" style="background:${c.color}" aria-label="${c.name}" title="${c.name}">
        <span class="emoji">${c.emoji}</span><span class="more">${c.more}</span></button>`)
    .join('')
  for (const el of document.querySelectorAll('[data-city]')) {
    el.onclick = () => {
      audio.unlock()
      game.city = el.dataset.city
      document.querySelectorAll('[data-city]').forEach((b) => b.classList.toggle('selected', b === el))
      audio.beep()
    }
  }
  for (const el of document.querySelectorAll('[data-laps]')) {
    el.onclick = () => {
      game.laps = Number(el.dataset.laps)
      document.querySelectorAll('[data-laps]').forEach((b) => b.classList.toggle('on', b === el))
    }
  }
  for (const el of document.querySelectorAll('[data-mode]')) {
    el.onclick = () => {
      game.mode = el.dataset.mode
      renderModeChoice()
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b === el))
      audio.beep()
    }
  }
  // Both 🔊 buttons (menu and race) need the press-and-hold, so mashing the screen never silences the game.
  holdButton($('menu-sound'), () => setMuted(!audio.muted))
  renderSound()
  // 🧸 is a grown-up's switch: it needs the press-and-hold too, so one stray tap never turns Easy mode off.
  holdButton($('easy-gas'), () => {
    input.easyGas = !input.easyGas
    $('easy-gas').classList.toggle('on', input.easyGas)
    audio.beep(input.easyGas)
  })
  $('go').onclick = () => {
    audio.unlock()
    hostStartRace()
  }
  $('again').onclick = () => hostStartRace()
  $('change-city').onclick = () => {
    if (!isHost() || (game.raceOn && !game.room.solo)) return
    send({ t: 'menu' })
    enterLobbyScreen()
  }
}

/** One sound switch for the whole game (menu and race). Never saved: every visit starts with sound on. */
function renderSound() {
  for (const id of ['sound-btn', 'menu-sound']) {
    const el = $(id)
    el.textContent = audio.muted ? '🔇' : '🔊'
    el.setAttribute('aria-label', audio.muted ? 'Sound off. Tap for sound.' : 'Sound on. Tap for quiet.')
    el.classList.toggle('off', audio.muted)
  }
}
function setMuted(muted) {
  audio.unlock()
  audio.setMuted(muted)
  renderSound()
}

function setWaitingText(text) {
  $('waiting-text').textContent = text
}

function enterLobbyScreen() {
  clearTimers()
  game.pendingSetup = null
  game.raceOn = false
  game.finaleAt = 0
  $('countdown').classList.add('hidden')
  if (isHost()) {
    game.state = 'menu'
    show('menu')
  } else {
    game.state = 'waiting'
    setWaitingText('⏳')
    show('waiting')
  }
  renderPlayers()
}

// --- Networking ------------------------------------------------------------------------

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
  game.players.set(id, { id, emoji, model: null })
}

/**
 * Listens to the room as soon as it exists, so nobody who joins while the cars
 * load is missed. Messages wait in a queue until the cars are ready.
 */
function setupRoom(room) {
  game.room = room
  game.hostId = room.isHost ? room.selfId : null
  game.myModel ??= CAR_IDS[Math.floor(Math.random() * CAR_IDS.length)]
  game.players.set(room.selfId, { id: room.selfId, emoji: PLAYER_EMOJI[0], model: game.myModel })
  for (const id of room.peers) addPlayer(id)
  room.on('join', (id) => {
    addPlayer(id)
    if (game.assetsReady) renderPlayers()
    broadcastPlayers()
    // Joined mid-race: they'll be in the next one.
    if (isHost() && game.raceOn) send({ t: 'busy' }, { to: id })
  })
  room.on('leave', onLeave)
  room.on('message', (msg, from) => {
    if (!msg || typeof msg !== 'object') return
    if (game.assetsReady) return onMessage(msg, from)
    // Car positions and dents are only useful live; everything else waits for the cars.
    if (msg.t !== 's' && msg.t !== 'hit') game.queue.push([msg, from])
  })
}

function onLeave(id) {
  const wasHost = id === game.hostId
  game.players.delete(id)
  game.ready.delete(id)
  const car = game.cars.get(id)
  if (car) {
    // Their car leaves with them; the podium remembers they were there.
    car.dispose()
    game.cars.delete(id)
    game.left.add(id)
  }
  if (wasHost) migrateHost()
  else if (isHost()) {
    broadcastPlayers()
    maybeGo()
  }
  if (game.assetsReady) renderPlayers()
  if (game.state === 'results') renderResults()
  if (game.raceOn && allFinished()) endRace()
}

/**
 * The host left: the remaining player with the lowest id takes over (everyone
 * has the same player list, so everyone picks the same one). The new host
 * adopts the bots so the race goes on, and runs the lobby from then on.
 */
function migrateHost() {
  const ids = [...game.players.keys()].sort()
  game.hostId = ids[0] ?? game.room.selfId
  if (!isHost()) return
  broadcastPlayers()
  if (game.setup) {
    game.setup.host = game.hostId
    game.setup.entries.forEach((entry, i) => {
      if (entry.bot && game.cars.get(entry.id)?.remote) adoptBot(entry, i)
    })
  }
  if (game.state === 'syncing') maybeGo(true)
  else if (game.state === 'waiting') enterLobbyScreen()
  else if (game.state === 'results') renderResults()
}

/** Turns a bot another device was driving into one this device drives, where it is now. */
function adoptBot(entry, i) {
  const old = game.cars.get(entry.id)
  const { position: p, quaternion: q, velocity: v } = old.body
  const yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ').y
  const pos = new THREE.Vector3(p.x, Math.max(0, p.y - 0.8), p.z)
  const vel = v.clone()
  old.dispose()
  game.cars.delete(entry.id)
  const car = makeCar(entry, i, true)
  car.place(pos, yaw)
  car.body.velocity.copy(vel)
}

const RACE_MESSAGES = new Set(['s', 'hit', 'done', 'stats', 'fix', 'ready', 'go', 'end', 'wave'])

function onMessage(msg, from) {
  // Every race message names its race, so a late one from the last race can't leak into this one.
  if (RACE_MESSAGES.has(msg.t) && (msg.r == null || msg.r !== raceId())) return
  switch (msg.t) {
    case 'players': {
      // Only the host's list counts, so everyone shows the same animal for each player.
      if (msg.host !== from || !Array.isArray(msg.players)) return
      game.hostId = from
      game.players = new Map(
        msg.players
          .filter((p) => p && typeof p.id === 'string')
          .map((p) => [p.id, { id: p.id, emoji: String(p.emoji ?? '🙂').slice(0, 8), model: validModel(p.model) ? p.model : null }]),
      )
      const me = game.players.get(game.room.selfId)
      if (me && validModel(game.myModel) && me.model !== game.myModel) {
        me.model = game.myModel
        send({ t: 'pick', model: game.myModel }, { to: from })
      }
      renderPlayers()
      break
    }
    case 'pick': {
      const p = game.players.get(from)
      if (!isHost() || !p || !validModel(msg.model)) return
      p.model = msg.model
      broadcastPlayers()
      renderPlayers()
      break
    }
    case 'setup':
      if (msg.host !== from) return
      game.hostId = from
      game.ready = new Set()
      startRace(msg)
      break
    case 'ready':
      if (isHost()) {
        game.ready.add(from)
        maybeGo()
      }
      break
    case 'go':
      if (from !== game.hostId) break
      // Still loading the scenery: count down as soon as the city is built.
      if (game.pendingSetup) game.pendingSetup.go = true
      else runCountdown()
      break
    case 'busy':
      if (from === game.hostId && game.state === 'waiting') setWaitingText('🏁 ⏳')
      break
    case 'menu':
      if (from === game.hostId && !game.raceOn) enterLobbyScreen()
      break
    case 's':
      for (const snap of msg.cars ?? []) {
        const car = game.cars.get(snap.id)
        if (!car?.remote) continue
        car.pushSnapshot(snap)
        if (snap.g) {
          if (!(car.ghost > 0)) setGhost(car, true)
          car.ghost = 0.3
        }
      }
      break
    case 'hit': {
      const car = game.cars.get(msg.id)
      if (car?.remote) {
        car.damage.impact(new THREE.Vector3(...msg.l), new THREE.Vector3(...msg.d), msg.s, msg.seed)
        showHit(car, new THREE.Vector3(...msg.l).applyMatrix4(car.root.matrixWorld), UP, msg.s)
      }
      break
    }
      break
    case 'stats':
      for (const { id, s } of msg.list ?? []) if (game.cars.get(id)?.remote && Array.isArray(s)) game.stats.set(id, unpackStats(s))
      if (game.state === 'results') renderResults()
      break
    case 'end':
      if (from === game.hostId) endSmash()
      break
    case 'fix':
      if (game.cars.get(msg.id)?.remote) game.cars.get(msg.id).damage.repair()
      break
    case 'horn':
      audio.horn()
      break
    case 'wave':
      if (game.cars.get(msg.id)?.remote) shockwave(Number(msg.x) || 0, Number(msg.z) || 0, msg.id)
      break
    case 'done': {
      const car = game.cars.get(msg.id)
      const prog = game.progress.get(msg.id)
      // Only the device driving a car says when it finished.
      if (!car?.remote || !prog || typeof msg.time !== 'number') return
      game.finishTimes.set(msg.id, msg.time)
      prog.finished = true
      onCarFinished(msg.id)
      break
    }
  }
}

// --- Race setup ------------------------------------------------------------------------

function hostStartRace() {
  // One race at a time: a double tap on GO (or Race again) does nothing the second time. Playing alone, Race again
  // (shown as soon as the child is home) starts the next race at once, without waiting for the robots to finish.
  if (!isHost() || !game.assetsReady || !['menu', 'results'].includes(game.state)) return
  if (game.raceOn && !(game.room.solo && game.state === 'results')) return
  const seed = 1 + Math.floor(Math.random() * 1e9)
  const r = rng(seed)
  const entries = [...game.players.values()].map((p) => ({ id: p.id, model: validModel(p.model) ? p.model : null, bot: false, emoji: p.emoji }))
  const free = CAR_IDS.filter((m) => !entries.some((e) => e.model === m)).sort(() => r() - 0.5)
  const anyCar = () => free.shift() ?? CAR_IDS[Math.floor(r() * CAR_IDS.length)]
  for (const e of entries) e.model ??= anyCar()
  for (let i = entries.length; i < 4; i++) entries.push({ id: `bot${i}`, model: anyCar(), bot: true, emoji: '🤖' })
  // Two children on the same car: the second one gets a different colour.
  const count = new Map()
  for (const e of entries) {
    e.tint = count.get(e.model) ?? 0
    count.set(e.model, e.tint + 1)
  }
  const setup = { t: 'setup', city: game.city, laps: game.laps, mode: game.mode, seed, entries, host: game.room.selfId }
  // Before the setup goes out, so a quick device's 'ready' isn't lost while this one still loads the scenery.
  game.ready = new Set()
  send(setup)
  startRace(setup)
}

function startRace(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length) return
  if (!game.propsReady) {
    // The scenery is still loading: build the city as soon as it's here (see boot).
    game.pendingSetup = setup
    game.state = 'loading'
    $('loading-text').textContent = CITIES[setup.city]?.emoji ?? '🏙️'
    show('loading')
    return
  }
  game.pendingSetup = null
  clearTimers()
  game.setup = setup
  game.city = Object.hasOwn(CITIES, setup.city) ? setup.city : 'ubud'
  game.laps = clamp(Number(setup.laps) || 2, 1, 5)
  game.mode = setup.mode === 'smash' ? 'smash' : 'race'
  // A friend's device follows the host's mode: laps show only for Race.
  renderModeChoice()
  game.raceOn = false
  game.finaleAt = 0
  game.confetti = false
  game.podiumShown = false
  shown.delete('place')
  game.waveNamed = false
  $('lap').classList.toggle('hidden', game.mode === 'smash')
  // Smash has no clock: the host (or a child alone) parks when they have had enough bumping.
  $('hud').classList.toggle('smash', game.mode === 'smash' && (isHost() || game.room.solo))
  $('hud').classList.toggle('easy', input.easyGas)
  // Tear down the previous race
  for (const car of game.cars.values()) car.dispose()
  game.cars.clear()
  game.progress.clear()
  game.finishTimes.clear()
  game.bumpedAt.clear()
  game.stats.clear()
  game.left.clear()
  game.player = null
  debris.clear()
  effects.reset()
  if (!setup.entries.some((e) => e.id === game.room.selfId)) {
    // This race started before we arrived: wait in the lobby for the next one.
    game.state = 'waiting'
    setWaitingText('🏁 ⏳')
    show('waiting')
    renderPlayers()
    return
  }
  game.track?.dispose()
  game.track = buildCity(game.city, env, game.props)
  // The zoom arches: a rainbow over one lane at each gate.
  gates.configure(game.track, setup.seed)
  game.gateRun = newGateRun()
  renderGatePick()
  minimap = null
  skyMaterial.uniforms.top.value.set(game.track.sky[0])
  skyMaterial.uniforms.bottom.value.set(game.track.sky[1])
  scene.fog = new THREE.Fog(game.track.fog, 120, 700)
  sun.color.set(game.track.sunColor)
  // Lines of stars to sweep up (and arcs of them over the jumps), and mystery boxes.
  pickups.build(game.track, setup.seed)

  // The robots line up in front and the children start at the back, on a row of their own (so the place pill reads
  // "4th of 4" at GO), and every race has places to win by overtaking.
  const bots = setup.entries.filter((e) => e.bot), kids = setup.entries.filter((e) => !e.bot)
  const firstKid = bots.length + (bots.length % 2)
  const grid = game.track.grid4(firstKid + kids.length)
  const lineUp = [...bots, ...(bots.length % 2 ? [null] : []), ...kids]
  setup.entries.forEach((entry, i) => {
    const local = entry.id === game.room.selfId || (entry.bot && isHost())
    const car = makeCar(entry, i, local)
    const slot = grid[lineUp.indexOf(entry)]
    car.place(slot.position, slot.yaw)
    game.progress.set(entry.id, { lap: 0, sector: 0, hint: -1, total: 0, finished: false })
    game.stats.set(entry.id, newStats())
  })
  game.player = game.cars.get(game.room.selfId)
  game.raceTime = 0
  game.fixCooldown = 0
  game.resetCooldown = 0
  game.slowmoUntil = 0
  // Everyone builds the city at their own pace; the host says go once all are ready.
  game.state = 'syncing'
  show(null)
  const el = $('countdown')
  el.textContent = '🚦'
  el.classList.remove('hidden')
  el.classList.add('waiting')
  if (isHost()) {
    game.ready.add(game.room.selfId)
    later(() => maybeGo(true), READY_TIMEOUT)
    maybeGo()
  } else {
    send({ t: 'ready', r: raceId() })
    // If the go never comes (the host's device stalled), start anyway.
    later(() => runCountdown(), READY_TIMEOUT + 4000)
  }
}

/** Host: starts the countdown for everyone once every child's city is built (or `force`). */
function maybeGo(force = false) {
  if (!isHost() || game.state !== 'syncing') return
  const humans = game.setup.entries.filter((e) => !e.bot && game.players.has(e.id))
  if (!force && !humans.every((e) => game.ready.has(e.id))) return
  send({ t: 'go', r: raceId() })
  runCountdown()
}

function makeCar(entry, i, local) {
  const model = validModel(entry.model) ? entry.model : CAR_IDS[0]
  const car = new Car({ id: entry.id, model, template: game.templates[model], env, remote: !local, tint: Number(entry.tint) || 0 })
  car.isPlayer = entry.id === game.room.selfId
  car.isBot = !!entry.bot
  car.colour = carColour(model, Number(entry.tint) || 0)
  car.recovery = car.isPlayer ? (input.easyGas && game.mode === 'race' ? EASY_PLAYER_RECOVERY : PLAYER_RECOVERY) : BOT_RECOVERY
  // Easy mode: bumps are soft wobbles with a little dust (no dents, no sparks, nothing falls off).
  car.gentle = calmRoad()
  if (local) {
    car.onHit = (hit) => onLocalHit(car, hit)
    car.onLand = (land) => onLanding(car, land)
    const bot = car.isPlayer ? null : new Bot(car, game.track, 0.72 + i * 0.05, i + 1)
    car.bot = bot
    // Easy mode: the bots never fire a turbo (no flames or sparks in front of the child).
    if (bot) bot.calm = input.easyGas
    // Easy racing: each bot races at its own calm pace, all a little quicker than the child's cruise (19 m/s, the same
    // holding 🚀), the quickest by 1.2 m/s (which bot is which changes every race). Only the rainbows' bursts let the
    // child pull ahead, so a careful child can win and a close loss is always possible.
    if (bot && input.easyGas && game.mode === 'race') bot.pace = EASY_BOT_PACE[(i + (game.setup?.seed ?? 0)) % EASY_BOT_PACE.length]
    if (bot) bot.jumpSpeed = JUMP_SPEED
    car.controller = car.isPlayer ? humanController : botController(bot)
    car.body.addEventListener('collide', (e) => knockProp(car, e.body))
  }
  // Tags on everyone else's car; your own would only block your view.
  if (!car.isPlayer) {
    // Right up against the camera another car thins to a soft veil, so it never covers the child's view.
    car.veilNearCamera()
    car.tag = nameTag(String(entry.emoji ?? '🙂'), car.colour)
    car.tag.position.set(0, car.dims.top + 0.9, 0)
    car.root.add(car.tag)
  }
  game.cars.set(entry.id, car)
  return car
}

/**
 * A floating emoji tag above each car so little players can tell who is who:
 * a white pill ringed in the car's own colour (the same colour as its dot on
 * the minimap), so the three 🤖 bots are "the red one", "the blue one"…
 * A fixed size on screen (it never fills the view), fading out up close.
 */
function nameTag(text, colour) {
  const tex = canvasTexture(256, 128, (g) => {
    g.beginPath()
    g.roundRect(6, 6, 244, 116, 58)
    g.fillStyle = colour
    g.fill()
    // A dark rim outside, so a yellow or white ring still reads against sand and sky.
    g.strokeStyle = '#2b2d42'
    g.lineWidth = 7
    g.stroke()
    g.beginPath()
    g.roundRect(26, 24, 204, 80, 40)
    g.fillStyle = '#ffffff'
    g.fill()
    g.font = '72px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 128, 68)
  })
  // Depth-tested: the child's own car (and a gate's ⚡) in front of a robot hide its tag, instead of the tag
  // sitting on top of them.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true, sizeAttenuation: false, toneMapped: false, fog: false }))
  sprite.scale.set(0.14, 0.07, 1)
  sprite.renderOrder = 10
  return sprite
}

const tagScreen = new THREE.Vector3()
function fadeTags() {
  for (const car of game.cars.values()) {
    if (!car.tag) continue
    // A see-through robot (passing through others at a jump or after a rescue) that is overlapping the child's car is
    // not drawn at all until it has moved out, so it never hides the child's own car.
    const overlapping = (car.ghost > 0 || car.body.collisionFilterGroup === GROUP_BOT) && game.player && car.body.position.distanceTo(game.player.body.position) < 3.5
    car.root.visible = !overlapping
    const d = camera.position.distanceTo(car.root.position)
    let o = clamp((d - 4) / 6, 0, 1)
    const proj = game.progress.get(car.id)?.proj
    // A robot just ahead in the child's own line: its tag would sit on the child's car.
    const me = game.player && game.progress.get(game.player.id)?.proj
    if (proj && me && loopMod(proj.dist - me.dist) < 15 && Math.abs(proj.lateral - me.lateral) < 3) o = 0
    // Only in the middle of the view: near the edges (or behind the camera) a tag would sit on the HUD's buttons and pills.
    tagScreen.copy(car.root.position).y += car.dims.top + 0.9
    tagScreen.project(camera)
    if (tagScreen.z > 1 || Math.abs(tagScreen.x) > 0.7 || tagScreen.y > 0.6 || tagScreen.y < -0.5) o = 0
    car.tag.material.opacity = o
    car.tag.visible = o > 0.02 && car.root.visible
  }
}

function runCountdown() {
  if (game.state !== 'syncing') return
  game.state = 'countdown'
  show(null)
  const el = $('countdown')
  el.classList.remove('hidden', 'waiting')
  el.textContent = ''
  // A moment to see the city and your car on the grid, then the lights.
  const intro = 900
  const steps = ['3', '2', '1', '🟢']
  steps.forEach((text, i) =>
    later(() => {
      el.textContent = text
      el.classList.toggle('go', i === 3)
      audio.beep(i === 3)
      if (i === 3) {
        game.state = 'race'
        game.raceOn = true
        show(null)
        // The green light is small and brief: the road ahead is what matters now.
        later(() => el.classList.add('hidden'), 450)
      }
    }, intro + i * 900),
  )
}

// --- Gameplay events -----------------------------------------------------------------------

const newStats = () => ({ stars: 0, air: 0, flips: 0, crashes: 0, cones: 0, boxes: 0, bumps: 0 })
const STAT_KEYS = Object.keys(newStats())
const packStats = (s) => STAT_KEYS.map((k) => +s[k].toFixed(1))
const unpackStats = (a) => Object.fromEntries(STAT_KEYS.map((k, i) => [k, clamp(Number(a[i]) || 0, 0, 99999)]))

/** Counts towards a car's awards (only while the race is on). */
function addStat(car, key, n = 1) {
  const stats = game.raceOn && game.stats.get(car.id)
  if (stats) stats[key] += n
}
/** Keeps a car's best for an award (only while the race is on). */
function maxStat(car, key, n) {
  const stats = game.raceOn && game.stats.get(car.id)
  if (stats) stats[key] = Math.max(stats[key], n)
}


/** Fixes a car this device drives, here and on every other device. */
function repairCar(car) {
  car.damage.repair()
  send({ t: 'fix', r: raceId(), id: car.id })
}

/** Every couple of seconds (and at the finish), the stats of the cars this device drives, for the awards. */
function sendStats() {
  if (game.room.solo) return
  const list = [...game.cars.values()].filter((c) => !c.remote).map((c) => ({ id: c.id, s: packStats(game.stats.get(c.id) ?? newStats()) }))
  send({ t: 'stats', r: raceId(), list })
}

/** Boost pads, and a moment of slow motion at the top of the player's big jumps. */
function stunts(car, proj) {
  // Boost pads are turbo: not in Easy mode (for the child or the bots: no flames racing past).
  const pad = proj && !input.easyGas ? game.track.boostPadAt(proj) : null
  if (pad && car.boostPad !== pad) {
    car.boost({ free: true, seconds: 1.6 })
    if (car.isPlayer) audio.whoosh()
  }
  car.boostPad = pad ?? null
  // At the top of a jump (still going fast: a car that just rolled onto its roof isn't flying).
  // Not in a race: the swinging replay camera mid-race lost the chase view (and the car filled the screen).
  if (car.isPlayer && game.mode !== 'race' && car.airTime > 0.55 && !car.slowmoJump && car.body.velocity.y > -2 && car.speed > 6) {
    car.slowmoJump = true
    slowmo(900)
  }
}

/** Slow motion for a moment; only when playing alone, so nobody else's race slows down. */
function slowmo(ms) {
  if (!game.room.solo) return false
  game.slowmoUntil = performance.now() + ms
  return true
}

const landingDust = new THREE.Vector3()
const dustVelocity = new THREE.Vector3()
/** A car came down from a jump: dust, a thump, and for the player a cheer and a full turbo. */
function onLanding(car, { airTime, flips, upright }) {
  car.slowmoJump = false
  // Only an upright landing counts as air time (Car.trackAir already ignores time on the roof).
  if (upright) {
    maxStat(car, 'air', airTime)
    addStat(car, 'flips', flips)
  }
  const p = car.body.position
  for (let i = 0; i < 6; i++) {
    effects.puff(landingDust.set(p.x + (Math.random() - 0.5) * 2, 0.2, p.z + (Math.random() - 0.5) * 2), dustVelocity.set((Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3), { color: '#d8c9a8', size: 1, life: 1 })
  }
  if (!car.isPlayer) return
  // Easy mode: a soft thump, and the camera stays still.
  if (calmRoad()) audio.thump(Math.min(0.35, airTime * 0.3))
  if (!input.easyGas) {
    effects.addShake(Math.min(0.5, airTime * 0.3))
    audio.thump(Math.min(1, airTime * 0.8))
  }
  if (airTime < 0.8 && !flips) return
  // Says what happened (a flip, or turbo filled up), without hype words or a cheer jingle. Easy mode has no turbo.
  const ready = input.easyGas ? '' : '🔥'
  if (flips || ready) banner(`${'🌀'.repeat(Math.min(3, flips))}${ready}`, 1400)
  car.turboCooldown = 0
}

/** A car this device drives crashed (Car.applyHit has dented it): tell everyone, count it and show it. */
function onLocalHit(car, hit) {
  // Every car-to-car bump counts for the car this device drives (the Bumpers results show them as 💥).
  if (hit.otherCar) addStat(car, 'bumps')
  // Bumpers: a robot that bumped a child drives on for a moment, and that child is the last one bumped.
  if (game.mode === 'smash' && game.raceOn) {
    const kid = car.isBot ? hit.otherCar : car
    const bot = car.isBot ? car : hit.otherCar?.isBot && hit.otherCar
    if (kid && !kid.isBot && bot) {
      game.bumpedAt.set(kid.id, game.raceTime)
      bot.bot?.bumped()
      if (bot.prey === kid) bot.preyUntil = 0
    }
  }
  // Easy mode: a friendly bump, with no dents to share.
  if (hit.gentle) return friendlyBump(car, hit.world, hit.speed)
  send({ t: 'hit', r: raceId(), id: car.id, l: hit.local.toArray().map((n) => +n.toFixed(3)), d: hit.dir.toArray().map((n) => +n.toFixed(3)), s: +hit.speed.toFixed(1), seed: hit.seed })
  if (hit.speed > 7) {
    addStat(car, 'crashes')
  }
  showHit(car, hit.world, hit.normal, hit.speed)
}

const UP = new THREE.Vector3(0, 1, 0)
const gemPoint = new THREE.Vector3()
const gemVelocity = new THREE.Vector3()
/**
 * Easy mode's crash: a springy boing, a puff of dust and a pop of bright gems (more for a harder bump), and for the
 * child's own car a little jolt of the camera. Bumping is half the fun of bumper cars.
 */
function friendlyBump(car, point, speed) {
  const k = Math.min(1, speed / 12)
  const heard = car.isPlayer || (game.player && game.player.body.position.distanceTo(car.body.position) < 25)
  if (heard) audio.bump(Math.max(0.35, k) * (car.isPlayer ? 1 : 0.6))
  for (let i = 0; i < 3; i++) effects.puff(landingDust.set(point.x, 0.4, point.z), dustVelocity.set((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2), { color: '#efe6d2', size: 0.7, life: 0.9 })
  for (let i = 0, n = 4 + Math.round(k * 12); i < n; i++) {
    gemVelocity.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6)
    effects.sparkle(gemPoint.set(point.x, Math.max(0.6, point.y), point.z), gemVelocity, RAINBOW[i % RAINBOW.length])
  }
  if (car.isPlayer && speed > 4) effects.addShake(Math.min(0.22, speed / 50))
}
/**
 * Sparks and a crunch for any car's crash, local or not; for the player a small shake (a real bump).
 * Calm pass: no slow-motion replay and no random "KABOOM!" banners; the dents tell the story.
 */
function showHit(car, point, normal, speed) {
  // Easy mode on this device: a friend's dented car is shown as a friendly bump too, never a shower of hot sparks.
  if (calmRoad()) return friendlyBump(car, point, speed)
  effects.sparkBurst(point, normal, speed)
  audio.crash(speed, car.isPlayer)
  if (!car.isPlayer) return
  effects.addShake(Math.min(0.45, speed / 40))
}

/** Cones, crates and barrels: count the ones each car sends flying (once each). */
function knockProp(car, body) {
  if (!(body.collisionFilterGroup & GROUP_PROP) || body.knockedBy || !game.raceOn) return
  body.knockedBy = car.id
  addStat(car, 'cones')
}

/** What happens when a car touches a star or a mystery box (see Pickups.collect). */
const PICKUP_HANDLERS = {
  onStar(car, star, streak) {
    addStat(car, 'stars')
    if (!car.isPlayer) return
    // A ding that walks up a little tune along a line of stars, and a pop of sparkles where the star was.
    audio.coin(streak)
    // The fifth star in a row: the whole line swept up, and a little burst of speed for it (racing or bumping), once a
    // lap. In Easy mode only when the child's own steer took the car out to that side of the road for it: a car left to
    // drive itself sweeps middle lines by chance, and a child mashing ◀ ▶ lands on the side only half the time.
    const proj = game.progress.get(car.id)?.proj
    const lap = game.progress.get(car.id)?.lap ?? 0
    const steered = !input.easyGas || (!!proj && Math.abs(proj.lateral) > 0.8 && car.steeredSide === Math.sign(proj.lateral) && game.raceTime - (car.steeredAt ?? -99) < STEERED_SECONDS && !(car.steerFlips > 3))
    if (streak === 4 && game.raceOn && steered && car.starZoomLap !== lap) {
      car.starZoomLap = lap
      zoom(car, STAR_ZOOM)
    }
    for (let i = 0; i < 8; i++) effects.sparkle(zoomPoint.set(star.x, star.y, star.z), zoomSpray.set((Math.random() - 0.5) * 4, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 4), '#ffd35a')
  },
  onBox: openBox,
}

/** Mystery box: a turbo, a honk that pushes everything nearby away, or a repair. Never a bad thing. */
function openBox(car, box) {
  addStat(car, 'boxes')
  let prize = box.prize
  // Bots don't get the shockwave (it would only ever push children around), and a car that's fine doesn't need fixing.
  if (prize === 'wave' && car.isBot) prize = 'turbo'
  if (prize === 'fix' && car.damage.level < 0.12) prize = car.isBot ? 'turbo' : 'wave'
  // Easy mode has no turbo: the child's box is a honk wave instead, and a bot's box is simply opened.
  if (prize === 'turbo' && input.easyGas) prize = car.isPlayer ? 'wave' : null
  // Opening one is a soft sound, not a burst of colour.
  if (car.isPlayer) audio.box()
  const p = car.body.position
  if (prize === 'turbo') {
    car.boost({ free: true, seconds: 2.5 })
    if (car.isPlayer) {
      banner('🎁🔥', 1100)
      audio.whoosh()
    }
  } else if (prize === 'wave') {
    shockwave(p.x, p.z, car.id)
    send({ t: 'wave', r: raceId(), id: car.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2) })
    // Named once a race, small and low (never over the gate buttons): after that the soft ring says it.
    if (car.isPlayer && !game.waveNamed) {
      game.waveNamed = true
      note('🎁 📯')
    }
  } else if (prize === 'fix') {
    repairCar(car)
    if (car.isPlayer) note('🎁 🔧')
  }
}

const wavePoint = new THREE.Vector3()
/** The horn shockwave from (x, z): pushes this device's cars (not the honker) and props away. */
function shockwave(x, z, sourceId) {
  effects.ring(wavePoint.set(x, 0, z))
  if (game.player && game.player.body.position.distanceTo(wavePoint) < 60) audio.wave()
  for (const car of game.cars.values()) if (!car.remote && car.id !== sourceId) push(car.body, x, z, 14, 6)
  for (const prop of game.track?.props ?? []) push(prop.body, x, z, 18, 9)
}

function push(body, x, z, radius, strength) {
  const dx = body.position.x - x, dz = body.position.z - z
  const d = Math.hypot(dx, dz)
  if (d > radius || d < 0.01) return
  const k = strength * (1 - (d / radius) * 0.5)
  body.wakeUp()
  body.velocity.x += (dx / d) * k
  body.velocity.z += (dz / d) * k
  body.velocity.y += k * 0.45
  body.angularVelocity.y += (Math.random() - 0.5) * k * 0.4
}

let noteTimer = 0
/** A small, quiet word at the foot of the screen (a mystery box): never big, never over the gate buttons. */
function note(text, ms = 1500) {
  const el = $('note')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => el.classList.remove('show'), ms)
}

let bannerTimer = 0
function banner(text, ms = 1300) {
  const el = $('banner')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

/** Where a car is on the road: from progress tracking, or measured now if not tracked yet. */
const projOf = (car) => game.progress.get(car.id)?.proj ?? game.track.project(car.body.position)

/** Back on the road `ahead` metres on (place() clears the car's recovery timers), passing through cars for a moment. */
function respawn(car, ahead = 0) {
  const proj = projOf(car)
  let to = proj.dist + ahead
  // A robot put back on the road never lands right by this device's child (in the camera's view, or overlapping as a
  // ghost just in front): it comes back a little behind the camera instead.
  const me = car.isBot && game.player && game.progress.get(game.player.id)?.proj
  if (me && (loopMod(to - me.dist) < 12 || loopMod(me.dist - to) < 14)) to = me.dist - 24
  const s = game.track.sampleAt(game.track.clearOfRamps(to, 3))
  car.place(s.p, game.track.headingAt(s))
  car.backOut = car.wedged = car.backOuts = 0
  // A car that lost a wheel can't get going again: it comes back with its wheels on.
  if (car.wheels.some((w) => w.state === 'gone')) repairCar(car)
  setGhost(car, true)
  // The child's camera comes straight back behind the car, never left inside the scenery it was rescued from.
  if (car.isPlayer) game.snapCamera = true
}

/**
 * The child's car was put back on the road: said once, in the banner's slot (never over the place and lap pills or the
 * gate buttons), and not again for a rescue straight after.
 */
let rescuedAt = -Infinity
function rescued() {
  if (game.raceTime - rescuedAt > RESCUE_QUIET) banner('🔄', 1200)
  rescuedAt = game.raceTime
}
const RESCUE_QUIET = 8
/** Bumpers: 🅿️ works only after this many seconds of play. */
const PARK_AFTER = 15
/** Average speed along the road (m/s) below which a car over its whole no-headway window counts as getting nowhere. */
const HEADWAY_SPEED = 1.5

/**
 * Seconds before a car this device drives is put back on the road (see recover).
 * A child gets longer to sort it out themselves; only the child's car is rescued from far off the road.
 */
const PLAYER_RECOVERY = { offRoad: 2, roof: 2.5, stuck: 5, noHeadway: 12 }
/** Easy racing: a child who is stuck is put back on the road sooner, so a snag never loses the race. */
const EASY_PLAYER_RECOVERY = { offRoad: 2, roof: 2.5, stuck: 3, noHeadway: 6 }
const BOT_RECOVERY = { offRoad: Infinity, roof: 3, stuck: 2, noHeadway: 3.5 }

/**
 * Puts a car this device drives back on the road when it can't get there
 * itself. Lost (far off the road, or on its roof): where it is for the child, a
 * little further on for a bot. Stuck (wedged, or wriggling against a wall and
 * getting nowhere, as Easy mode's gas does for a child steering into it): a
 * little further on. Bots keep getting unstuck after this device's child finished.
 */
function recover(car, dt) {
  if (!game.raceOn) return
  const limits = car.recovery
  const prog = game.progress.get(car.id)
  const proj = prog?.proj
  const finished = prog?.finished
  car.offRoadTime = proj && proj.distance > game.track.width / 2 + 30 ? car.offRoadTime + dt : 0
  car.stuckTime = car.speed < 1.5 && !finished ? car.stuckTime + dt : 0
  // Headway is net progress over a window: a car circling on the spot (a child holding one button) makes a few metres
  // now and then but almost none overall, and is put back on the road like a stuck one.
  if (!car.headway || finished) car.headway = []
  const log = car.headway
  if (!log.length || game.raceTime - log[log.length - 1].time >= 0.5) log.push({ total: prog?.total ?? 0, time: game.raceTime })
  while (log.length > 1 && log[1].time <= game.raceTime - limits.noHeadway) log.shift()
  const lost = car.offRoadTime > limits.offRoad || car.upsideDownTime > limits.roof || car.backOuts >= 2
  // The child is only rescued while still racing (not behind the podium).
  if (car.isPlayer && lost && game.state === 'race') {
    respawn(car)
    rescued()
    return
  }
  const noHeadway = game.mode === 'race' && !finished && game.raceTime - log[0].time >= limits.noHeadway && (prog?.total ?? 0) - log[0].total < limits.noHeadway * HEADWAY_SPEED
  if ((!car.isPlayer && lost) || car.stuckTime > limits.stuck || noHeadway) {
    respawn(car, 6)
    // Bots come back fixed so a wreck doesn't sit at the back forever.
    if (!car.isPlayer && car.damage.level > 0.6) repairCar(car)
    if (car.isPlayer) rescued()
  }
}

/** Racing: metres either side of a ramp or jump where the robots pass through each other (see startGhost). */
const RAMP_GHOST_PAD = 40
/**
 * Racing: a bot that has been pressed against another car for a while (alongside, pinning it to a wall, or locked
 * nose to tail) passes through it for a moment, so neither car is shoved off the road or held up for long.
 */
const PINNED_SECONDS = 0.7
function unpin(car, dt) {
  if (game.mode !== 'race' || !game.raceOn || !car.isBot || car.ghost > 0) return (car.pressed = 0)
  // Side by side (centres within 3.2 m), or nose to tail: a car up to 5 m behind or ahead in the same line is pressing.
  let touching = false
  const proj = game.progress.get(car.id)?.proj
  const s = proj && game.track.sampleAt(proj.dist)
  for (const other of game.cars.values()) {
    if (other === car) continue
    const dx = other.body.position.x - car.body.position.x, dz = other.body.position.z - car.body.position.z
    const along = s ? dx * s.t.x + dz * s.t.z : 0, side = s ? dx * s.side.x + dz * s.side.z : 99
    if (Math.hypot(dx, dz) < 3.2 || (Math.abs(along) < 5 && Math.abs(side) < 2)) touching = true
  }
  car.pressed = touching ? (car.pressed ?? 0) + dt : 0
  if (car.pressed > PINNED_SECONDS) {
    car.pressed = 0
    setGhost(car, true)
    car.ghost = 1
  }
}
/**
 * Easy racing: for this long after GO the robots pass through each other (only each other: they still meet the child's
 * car, and steer round it), so the bunched start never ends in a pile-up at the first bend.
 */
const START_GHOST = 14
function startGhost(car, proj) {
  // Robots pass through each other (only each other: never through the child's car) after GO in Easy, and round every
  // ramp and jump, so a pack lined up for the same jump never piles up on it, and no robot sits over the child.
  const atRamp = !!proj && game.track.nearRamp(proj.dist, RAMP_GHOST_PAD)
  const on = car.isBot && game.mode === 'race' && game.raceOn && ((input.easyGas && game.raceTime < START_GHOST) || atRamp)
  const body = car.body
  if (on && body.collisionFilterGroup !== GROUP_BOT) {
    body.collisionFilterGroup = GROUP_BOT
    body.collisionFilterMask &= ~GROUP_BOT
  } else if (!on && body.collisionFilterGroup === GROUP_BOT) {
    body.collisionFilterGroup = GROUP_CAR
    if (!(car.ghost > 0)) body.collisionFilterMask |= GROUP_BOT
    // Still overlapping another robot: an ordinary ghost until they are apart.
    if ([...game.cars.values()].some((o) => o !== car && o.isBot && o.body.position.distanceTo(body.position) < 3.2)) setGhost(car, true)
  }
}
/**
 * Round a jump the robots pass through each other only (above). A small kicker is different: the cars drive round it,
 * all on the same strip of road beside it (Ubud's is on a narrow road), so there every car passes through the others,
 * the child included, from 25 m before it to 15 m after.
 */
function rampGhost(car, proj) {
  startGhost(car, proj)
  if (game.mode !== 'race' || !game.raceOn || !proj) return
  const atKicker = game.track.ramps.some((r) => r.half < 8 && loopMod(proj.dist - (r.dist - r.half - 25)) < r.half * 2 + 40)
  // At a jump, a robot that comes within 6 m of the child passes through it too, rather than knocking it off the
  // take-off (it then moves out of the child's line, see Bot.politeness).
  // So does a robot right beside the child during a rainbow burst: at that speed a side-swipe put the child on the
  // pavement.
  const near = car.isBot && game.player && car.body.position.distanceTo(game.player.body.position)
  const nearChild = near && ((near < 6 && game.track.nearRamp(proj.dist, RAMP_GHOST_PAD)) || (near < 4.5 && game.player.zoomUntil > game.raceTime))
  if (!atKicker && !nearChild) return
  if (car.ghost > 0) car.ghost = Math.max(car.ghost, 0.5)
  else {
    setGhost(car, true)
    car.ghost = 0.5
  }
}

/** A ghost car passes through other cars for a moment (it still hits walls). It stays in plain view: no blinking. */
function setGhost(car, on) {
  car.ghost = on ? RESPAWN_GHOST : 0
  if (on) car.body.collisionFilterMask &= ~(GROUP_CAR | GROUP_BOT)
  else car.body.collisionFilterMask |= GROUP_CAR | (car.body.collisionFilterGroup === GROUP_BOT ? 0 : GROUP_BOT)
}

function ghostTick(car, dt) {
  car.ghost -= dt
  if (car.ghost > 0) return
  // Still inside another car: stay a ghost a little longer.
  if (!car.remote) {
    for (const other of game.cars.values()) {
      if (other !== car && other.body.position.distanceTo(car.body.position) < 3.2) {
        car.ghost = 0.2
        return
      }
    }
  }
  setGhost(car, false)
}

function fixPlayer() {
  if (!game.player || game.fixCooldown > 0) return
  repairCar(game.player)
  game.fixCooldown = FIX_COOLDOWN
  banner('🔧✨')
  audio.cheer()
}

/** In-race actions, by keyboard key and by on-screen button name. */
const ACTIONS = {
  reset: () => {
    if (!game.player || game.resetCooldown > 0) return
    // Easy racing: a car already on the road and moving needs no rescue, so 🔄 does nothing (mashing it used to stop
    // the car dead every time). It still helps a car that is stuck, upside down or off the road.
    const proj = game.progress.get(game.player.id)?.proj
    if (input.easyGas && game.mode === 'race' && proj && proj.distance < game.track.width / 2 && game.player.speed > 4 && !game.player.upsideDownTime) return
    respawn(game.player)
    game.resetCooldown = RESET_COOLDOWN
  },
  fix: fixPlayer,
  horn: () => {
    audio.horn()
    send({ t: 'horn' })
  },
  camera: () => (game.cameraMode = (game.cameraMode + 1) % 3),
  turbo,
  // Smash: no clock. Whoever runs the game parks everyone when they are ready.
  // Not in the first 15 s: one stray tap on 🅿️ used to end the session at once.
  park: () => {
    if (game.mode === 'smash' && (isHost() || game.room.solo) && game.raceTime > PARK_AFTER) endSmash()
  },
}
const KEYS = { r: 'reset', f: 'fix', h: 'horn', c: 'camera', shift: 'turbo' }
function act(name) {
  audio.unlock()
  if (game.state !== 'race') return
  if (name === 'park' && game.mode !== 'smash') return
  ACTIONS[name]?.()
}
// No mute key: a mashed keyboard never silences the game (the 🔊 buttons need a hold).
input.on('key', (k) => act(KEYS[k]))
input.on('button', act)

/**
 * In-race buttons that end the drive or change the sound (🅿️, 🔊) act on a short press-and-hold while a ring fills
 * round them; a quick tap only wiggles the button, so mashing the screen never parks or mutes the game.
 */
const HOLD_MS = 900
// Every finger (or mouse button) down anywhere on the page. A hold starts only when it is the one finger down, and any
// other finger landing anywhere (a resting hand on the road, a palm on the button) cancels it; nothing new starts until
// every finger has lifted.
const pointersDown = new Set()
const runningHolds = new Set()
let holdsSpoiled = false
document.addEventListener('pointerdown', (e) => {
  pointersDown.add(e.pointerId)
  if (pointersDown.size > 1) {
    holdsSpoiled = true
    for (const cancel of runningHolds) cancel()
  }
}, true)
// After a hold fires, the finger still on the glass will lift over whatever the new screen put under it: that one
// lift's click is swallowed, so it never presses a button the child never meant to press.
let swallowPointer = null, swallowUntil = 0
document.addEventListener('click', (e) => {
  if (performance.now() > swallowUntil) return
  swallowUntil = 0
  e.preventDefault()
  e.stopPropagation()
}, true)
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (e) => {
    if (e.pointerId === swallowPointer) {
      swallowPointer = null
      swallowUntil = performance.now() + 400
    }
    pointersDown.delete(e.pointerId)
    if (!pointersDown.size) holdsSpoiled = false
  }, true)
}
// A lost lift (the page hidden mid-touch) must not block holds for good.
for (const type of ['blur', 'visibilitychange']) addEventListener(type, () => {
  pointersDown.clear()
  holdsSpoiled = false
})
function holdButton(el, onDone) {
  let start = 0, raf = 0, pointer = null
  const cancel = (nudge = true) => {
    cancelAnimationFrame(raf)
    raf = 0
    runningHolds.delete(cancel)
    if (nudge && start && performance.now() - start < HOLD_MS) {
      el.classList.remove('nudge')
      void el.offsetWidth
      el.classList.add('nudge')
    }
    start = 0
    pointer = null
    el.classList.remove('holding')
    el.style.setProperty('--hold', '0')
  }
  const step = (now) => {
    raf = 0
    if (!start || pointer == null || holdsSpoiled || pointersDown.size !== 1) return cancel()
    const k = clamp((now - start) / HOLD_MS, 0, 1)
    el.style.setProperty('--hold', k.toFixed(3))
    if (k < 1) return (raf = requestAnimationFrame(step))
    swallowPointer = pointer
    cancel(false)
    onDone()
  }
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    audio.unlock()
    if (start) return cancel()
    // The document's listener has already counted this finger: it must be the only one down.
    if (holdsSpoiled || pointersDown.size !== 1) return
    cancelAnimationFrame(raf)
    pointer = e.pointerId
    start = performance.now()
    el.classList.add('holding')
    runningHolds.add(cancel)
    raf = requestAnimationFrame(step)
  })
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, (e) => e.pointerId === pointer && cancel())
}
holdButton($('park-btn'), () => act('park'))
holdButton($('sound-btn'), () => setMuted(!audio.muted))

function turbo() {
  if (input.easyGas) return
  if (game.player?.boost()) {
    audio.whoosh()
    banner('🔥', 700)
  }
}
// Any tap, click or key unlocks sound (the engine starts by itself once it can).
for (const type of ['pointerdown', 'keydown', 'touchend', 'click']) addEventListener(type, () => audio.unlock(), { capture: true, passive: true })
document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))

// --- Race progress ----------------------------------------------------------------------------

const SECTORS = 8
function updateProgress(id, car) {
  const prog = game.progress.get(id)
  if (!prog) return
  // Keep measuring after the finish: the pull-over driving and pickups need it.
  const proj = game.track.project(car.body.position, prog.hint)
  prog.hint = proj.index
  prog.proj = proj
  if (game.mode !== 'race' || prog.finished) return
  const sector = Math.floor((proj.dist / game.track.length) * SECTORS)
  // Sectors must come in order; crossing from the last sector to the first completes a lap.
  if (sector === (prog.sector + 1) % SECTORS) {
    if (sector === 0) {
      prog.lap++
      pickups.newLap(id)
      if (car.isPlayer && prog.lap < game.laps) {
        banner(prog.lap === game.laps - 1 ? '🔔' : '🏁', 1100)
        audio.cheer()
      }
      if (prog.lap >= game.laps) finishCar(id, car)
    }
    prog.sector = sector
  }
  // On the grid, cars sit just behind the line: count them as not started, not as nearly a lap done.
  const dist = prog.lap === 0 && prog.sector === 0 && proj.dist > game.track.length / 2 ? proj.dist - game.track.length : proj.dist
  prog.total = prog.lap * game.track.length + dist
}

function finishCar(id, car) {
  const prog = game.progress.get(id)
  prog.finished = true
  if (!game.finishTimes.has(id)) game.finishTimes.set(id, game.raceTime)
  // Remote cars are only tracked here for the standings; their own device says when they finished.
  if (!car.remote) {
    send({ t: 'done', r: raceId(), id, time: game.raceTime })
    sendStats()
  }
  if (car.isPlayer) {
    audio.cheer()
    // The place this child crossed the line in (Race), said on the banner as the podium gets ready.
    const place = [...game.finishTimes.values()].filter((t) => t < game.finishTimes.get(id)).length
    banner(game.mode === 'race' ? (place === 0 ? '🏆' : `🏁 ${placeIcon(place)}`) : '🏁', 2000)
    later(() => {
      if (game.state !== 'race') return
      game.state = 'results'
      renderResults()
      show('results')
    }, 2200)
  }
  onCarFinished(id)
}

/** The first child home starts the finale countdown; when everyone is home, it's podium time. */
function onCarFinished(id) {
  const entry = game.setup?.entries.find((e) => e.id === id)
  if (entry && !entry.bot && !game.finaleAt && game.raceOn) game.finaleAt = game.raceTime + FINALE_SECONDS
  // Every robot home and a child still out on the road (holding one button, or simply slow): a calm 30 s more, then
  // the race ends where everyone is and the podium comes. A race always finishes.
  const botsHome = game.setup?.entries.every((e) => !e.bot || game.progress.get(e.id)?.finished)
  if (botsHome && !game.finaleAt && game.raceOn) game.finaleAt = game.raceTime + BOTS_HOME_SECONDS
  if (game.state === 'results') renderResults()
  if (allFinished()) later(endRace, 2400)
}

function allFinished() {
  return game.setup.entries.every((e) => game.left.has(e.id) || game.progress.get(e.id)?.finished)
}

/** The race is over for everyone: still-racing cars stop where they are and everyone sees the podium. */
function endRace() {
  if (!game.raceOn || game.mode === 'smash') return
  game.raceOn = false
  game.finaleAt = 0
  for (const e of game.setup.entries) {
    const prog = game.progress.get(e.id)
    if (prog && !prog.finished) prog.dnf = true
  }
  if (game.state === 'race' || game.state === 'countdown') {
    banner('🏁', 1500)
    audio.cheer()
  }
  game.state = 'results'
  renderResults()
  show('results')
}

function standings() {
  const entries = game.setup.entries.map((e) => ({ ...e, prog: game.progress.get(e.id), time: game.finishTimes.get(e.id), left: game.left.has(e.id) }))
  // Smash has no winner: everyone is listed in the order they lined up.
  if (game.mode === 'smash') return entries.sort((a, b) => a.left - b.left)
  return entries.sort((a, b) => {
    if (a.left !== b.left) return a.left - b.left
    if (a.time != null && b.time != null) return a.time - b.time
    if (a.time != null) return -1
    if (b.time != null) return 1
    return (b.prog?.total ?? 0) - (a.prog?.total ?? 0)
  })
}

function renderResults() {
  if (!game.setup || !game.track) return
  $('results-title').textContent = game.mode === 'smash' ? '🅿️' : '🏁'
  const self = game.room.selfId
  const rows = standings()
  const race = game.mode === 'race'
  const podium = $('podium')
  podium.classList.toggle('ranked', race)
  if (race) {
    // A real podium: the winner on the tall middle step, 2nd on the left, 3rd on the right, the rest beside it. Cars
    // still on the road wait beside the podium (🏎️) until they finish.
    const mine = rows.findIndex((e) => e.id === self)
    const done = game.finishTimes.has(self) || !game.raceOn
    $('results-title').textContent = !done ? '🏁' : mine === 0 ? '🏆' : '🏁'
    const step = (e, i) => {
      const model = validModel(e.model) ? e.model : CAR_IDS[0]
      const home = e.left || e.time != null || !game.raceOn
      return `<div class="step p${i + 1}${e.id === self ? ' me' : ''}${home ? '' : ' racing'}" style="--ring:${game.cars.get(e.id)?.colour ?? '#fff'}" aria-label="${ORDINAL[i]}">
        <span class="who">${escapeHtml(e.emoji)}</span>
        ${carPic(model, 'pic podium-pic')}
        <span class="block">${e.left ? '👋' : home ? placeIcon(i) : '🏎️'}</span></div>`
    }
    // Shown left to right as 2nd, 1st, 3rd, then 4th and on.
    const order = rows.length > 1 ? [1, 0, ...rows.keys()].filter((i, k, a) => i < rows.length && a.indexOf(i) === k) : [0]
    podium.innerHTML = order.map((i) => step(rows[i], i)).join('')
    // The cars drop onto their steps one by one only the first time; later updates (a robot crossing the line) just fill in.
    podium.classList.toggle('settled', !!game.podiumShown)
    game.podiumShown = true
  } else {
    // Bumpers: every car as a small chip, the child's own first, then the order everyone lined up in (no winner).
    const lineUp = new Map(game.setup.entries.map((e, i) => [e.id, i]))
    rows.sort((a, b) => a.left - b.left || (b.id === self) - (a.id === self) || lineUp.get(a.id) - lineUp.get(b.id))
    // Each car with its bumps as a row of 💥 (up to a dozen, then the number), and a 👑 for the bumpiest.
    const bumps = (e) => Math.round(game.stats.get(e.id)?.bumps ?? 0)
    const most = Math.max(1, ...rows.map(bumps))
    podium.innerHTML = rows
      .map((e) => {
        const n = bumps(e)
        const booms = n > 12 ? `${'💥'.repeat(12)}<b>${n}</b>` : '💥'.repeat(n)
        return `<div class="place bumper ${e.id === self ? 'me' : ''}" aria-label="${n} bumps">
      ${carPic(validModel(e.model) ? e.model : CAR_IDS[0], 'pic podium-pic')}
      <span class="who">${escapeHtml(e.emoji)}${n === most ? '👑' : ''}</span>
      <span class="booms">${e.left ? '👋' : booms}</span></div>`
      })
      .join('')
    podium.classList.toggle('settled', !!game.podiumShown)
    game.podiumShown = true
  }
  // In a race with friends, the next one starts once everyone is home.
  const canRestart = isHost() && (!game.raceOn || game.room.solo)
  $('again').classList.toggle('hidden', !canRestart)
  // Playing alone, 🗺️ New city is there at once, like Race again.
  $('change-city').classList.toggle('hidden', !canRestart || (game.raceOn && !game.room.solo))
  // Playing alone, Race again works at once: nobody to wait for, so no waiting line.
  $('results-wait').classList.toggle('hidden', canRestart)
  updateResultsWait()
  if (!game.confetti) {
    game.confetti = true
    if (race) celebrate(rows.findIndex((e) => e.id === self))
    // Bumpers: confetti and a cheer for everyone, the fanfare for the bumpiest.
    else celebrate(Math.round(game.stats.get(self)?.bumps ?? 0) >= Math.max(1, ...rows.map((e) => Math.round(game.stats.get(e.id)?.bumps ?? 0))) ? 0 : 1)
  }
}

/**
 * The race's one celebration, once: a fanfare for a win (a cheerful chord otherwise), and confetti drifting down
 * (none under reduced motion). Gold for a win; every colour otherwise.
 */
function celebrate(place) {
  const won = place === 0
  if (game.finishTimes.has(game.room.selfId) || !game.raceOn) later(() => (won ? audio.fanfare() : audio.cheer()), 300)
  if (reducedMotion.matches) return
  const party = document.createElement('div')
  party.className = 'party'
  const colours = won ? ['#ffd35a', '#ffbe0b', '#fff3c4'] : RAINBOW
  for (let i = 0; i < (won ? 36 : 18); i++) {
    const petal = document.createElement('i')
    petal.style.left = `${4 + Math.random() * 92}%`
    petal.style.background = colours[i % colours.length]
    petal.style.animationDuration = `${5 + Math.random() * 2}s`
    petal.style.animationDelay = `${Math.random() * 1.2}s`
    petal.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`)
    petal.style.setProperty('--spin', `${(Math.random() - 0.5) * 540}deg`)
    party.append(petal)
  }
  // On the page, not in the results screen: as its last child it bottom-aligned the results for as long as it lasted.
  document.body.append(party)
  setTimeout(() => party.remove(), 9500)
}

function updateResultsWait() {
  const el = $('results-wait')
  const text = game.raceOn ? '🏎️💨' : '⏳'
  if (el.textContent !== text) el.textContent = text
}

function endSmash() {
  if (!game.raceOn) return
  game.raceOn = false
  game.state = 'results'
  if (isHost()) send({ t: 'end', r: raceId() })
  audio.cheer()
  banner('🅿️', 1800)
  later(() => {
    renderResults()
    show('results')
  }, 1800)
}

/** A child on the menu who hasn't tapped anything for a long while: GO glows softly, once, to show where to tap. */
let lastTouch = performance.now()
addEventListener('pointerdown', () => {
  lastTouch = performance.now()
  $('go').classList.remove('nudge')
}, { capture: true, passive: true })
setInterval(() => {
  if (game.state === 'menu' && performance.now() - lastTouch > 30000) $('go').classList.add('nudge')
}, 1000)

// --- Main loop ------------------------------------------------------------------------------------

let accumulator = 0
let last = performance.now()
const camPos = new THREE.Vector3(0, 10, 20)
const camLook = new THREE.Vector3()
let sparkTimer = 0
/** Waiting for GO, or the race is over: brakes on, no reversing. */
const BRAKE = { steer: 0, throttle: 0, brake: 1, hold: true }

/** The child at this device: keyboard, touch or gamepad, with Easy mode's helpers. */
const humanController = {
  update(car, dt) {
    const controls = input.read()
    // Easy off: the child steers, but a car held on the gas against a wall still backs itself out after a moment.
    if (!input.easyGas) return (car.controls = govern(car, backOut(car, controls, dt, WEDGED_SECONDS_FREE)))
    // A ◀ or ▶ held for a long time (a young child holding one button) fades to a light touch after 3 s, so the car
    // keeps racing round the road instead of bumping the kerb; a fresh press (or the other side) steers fully again.
    const side = Math.abs(controls.steer) > 0.3 ? Math.sign(controls.steer) : 0
    if (side !== car.holdSide) car.holdStart = game.raceTime
    car.holdSide = side
    // Remembered for the rainbows and star lines: steering into one yourself counts like tapping ⚡ (see passGate).
    // A button held for longer than HELD_TOO_LONG stops counting, so holding one side all race earns nothing.
    // Side changes in the last 2 s: a child mashing ◀ ▶ (see onStar) flips several times a second.
    if (side && side !== car.steeredSide) car.flipTimes = [...(car.flipTimes ?? []).filter((t) => game.raceTime - t < 2), game.raceTime]
    car.steerFlips = (car.flipTimes ?? []).filter((t) => game.raceTime - t < 2).length
    if (side && game.raceTime - car.holdStart <= HELD_TOO_LONG) {
      car.steeredSide = side
      car.steeredAt = game.raceTime
    }
    const held = side ? game.raceTime - car.holdStart : 0
    const fade = held > HELD_TOO_LONG ? 0.25 : 1
    // Holding 🚀 in Easy mode is no faster (see easyTop), but it feels like it: the engine roars, flames puff from the
    // exhaust and the camera leans in a touch.
    car.revving = controls.throttle >= 1 && !controls.cruise && !controls.brake
    const gentle = { ...controls, steer: rampSteer(car, controls.steer, dt) * fastSteer(car) * fade }
    car.controls = govern(car, backOut(car, steeringHelper(car, controls.cruise ? cruise(car, gentle) : gentle, dt), dt))
  },
}

/**
 * Easy racing's speed for the road ahead: the calm cruise, slower into bends. The same for the cruise and for holding
 * 🚀, so holding the pedal down is no shortcut: the rainbows are the only way to go faster.
 */
const EASY_CRUISE = 19
function easyTop(car) {
  const proj = game.progress.get(car.id)?.proj
  const bend = proj ? game.track.bendAhead(proj.dist, game.track.lookAhead(car.speed)) : 0
  return clamp(EASY_CRUISE - bend * 35, 10, EASY_CRUISE)
}

/** Easy-mode racing never goes faster than the calm cruise for the road ahead, even holding 🚀. */
function govern(car, controls) {
  // A rainbow's burst of speed (see zoomExtra) lifts the top speed while it lasts, and so does a jump's run-up.
  const extra = zoomExtra(car)
  // A jump's run-up is always taken at the same speed (a burst on top would overshoot the landing).
  const top = input.easyGas ? (runUp(car) ? JUMP_SPEED : easyTop(car) + extra) : Infinity
  if (car.speed <= top) return controls
  // As a burst fades the car coasts back down to its usual speed, but only when a little over it: much faster than the
  // road ahead allows (a bend coming) it brakes, so a burst never carries the car into a wall.
  if (car.zoomUntil + 2 > game.raceTime && input.easyGas && car.speed <= easyTop(car) + zoomExtra(car) + 3) return { ...controls, throttle: 0, brake: 0 }
  return { ...controls, throttle: 0, brake: car.speed > top + 2 ? 0.6 : 0 }
}

/**
 * Easy racing: whether the car is on a jump's run-up (lined up with it, up to 45 m before it) or flying it. The calm
 * cruise would drop the car into the gap; the run-up takes it at JUMP_SPEED instead.
 */
function runUp(car) {
  if (!input.easyGas) return false
  const proj = game.progress.get(car.id)?.proj
  if (!proj) return false
  if (!car.grounded && car.runUpUntil > game.raceTime) return true
  // Jumps only: a small kicker is a bump in the road, taken at the usual speed (at jump speed it threw the car into the next bend).
  const on = game.track.ramps.some((r) => r.half >= 8 && loopMod(r.dist - r.half - proj.dist) < 45 && Math.abs(proj.lateral - r.lateral) < r.width / 2)
  if (on) car.runUpUntil = game.raceTime + 2.5
  return on || car.runUpUntil > game.raceTime
}

/**
 * How much faster (m/s) a rainbow's burst lets the car go just now: the full ZOOM_EXTRA on straight road, less into a
 * bend and none round a sharp one, so a burst never carries the car off the road.
 */
function zoomExtra(car) {
  if (!(car.zoomUntil > game.raceTime)) return 0
  // Stuck right behind a car (see passLane), the burst waits until the car is out beside it.
  if (car.blocked && car.isPlayer) return 0.01
  const proj = game.progress.get(car.id)?.proj
  if (!proj) return 0
  const power = ZOOM_EXTRA * (car.zoomPower ?? 1)
  if (!input.easyGas) {
    const bend = game.track.bendAhead(proj.dist, game.track.lookAhead(car.speed))
    return power * clamp(1 - bend * 6, 0, 1)
  }
  // Easy: the burst may only go as fast as the car can still slow down from before every bend (and ramp) in the next
  // 100 m, at a gentle ZOOM_BRAKE. Looking only one bend ahead let a burst carry the car off the road at the next one.
  let allowed = Infinity
  for (let x = 0; x <= 100; x += 10) {
    const d = proj.dist + x
    const b = game.track.bendAt(d + 12, 12)
    const ramp = game.track.ramps.some((r) => loopMod(r.dist - r.half - d) < 12 || loopMod(d - (r.dist - r.half)) < r.half * 2)
    const there = clamp(EASY_CRUISE - b * 35, 10, EASY_CRUISE) + (ramp ? 0 : power * clamp(1 - b * 6, 0, 1))
    allowed = Math.min(allowed, Math.sqrt(there * there + 2 * ZOOM_BRAKE * x))
  }
  return clamp(allowed - easyTop(car), 0, power)
}
/** Easy: how hard (m/s²) a burst plans to slow down for a bend coming up. */
const ZOOM_BRAKE = 4
/** The speed a burst pushes the car up to just now: the usual speed for the road ahead (slower into a bend), plus the burst. */
function zoomTop(car) {
  return (input.easyGas ? easyTop(car) : 30) + zoomExtra(car)
}
const zoomDust = new THREE.Vector3()
const zoomDrift = new THREE.Vector3()
function zoomPush(car, dt) {
  if (!(car.zoomUntil > game.raceTime) || !car.grounded || runUp(car)) return
  // Waiting behind a car: the burst's clock waits too (up to 2 s), and there is no push into its tail.
  if (car.blocked) {
    if ((car.zoomHeld ?? 0) < 2) {
      car.zoomHeld = (car.zoomHeld ?? 0) + dt
      car.zoomUntil += dt
    }
    return
  }
  const v = car.body.velocity
  const flat = Math.hypot(v.x, v.z)
  const top = zoomTop(car)
  // Only while the child is driving on (🚀, or Easy mode's cruise): 🐢 still slows the car.
  if (flat > 2 && flat < top && !(car.controls?.brake > 0)) {
    const k = Math.min(top, flat + ZOOM_PUSH * dt) / flat
    v.x *= k
    v.z *= k
  }
  // A gentle trail: a few soft puffs in the house's colour, drifting up behind the car.
  if (Math.random() < 0.5) {
    const p = car.body.position
    zoomDust.set(p.x - (v.x / (flat || 1)) * 2.2 + (Math.random() - 0.5), 0.5, p.z - (v.z / (flat || 1)) * 2.2 + (Math.random() - 0.5))
    effects.puff(zoomDust, zoomDrift.set(0, 0.6, 0), { color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)], size: 0.9, life: 0.9, kind: 'dust' })
  }
}

/**
 * Easy mode: the calm cruise holds in the air and after landings too. A bump,
 * a jump or a push can carry the car past the cap where the brakes cannot
 * reach; past the cap the speed is trimmed back after each physics step.
 */
function capSpeed(car, cap, dt) {
  const v = car.body.velocity
  const flat = Math.hypot(v.x, v.z)
  if (flat <= cap) return
  const to = Math.max(cap, flat - 10 * dt)
  v.x *= to / flat
  v.z *= to / flat
}

function holdEasyCap(car, dt) {
  // A burst of speed lifts the cap while it lasts; afterwards the speed eases back down, never snaps.
  const v = car.body.velocity
  const flat = Math.hypot(v.x, v.z)
  // During a burst, the bend-aware top (the road ahead's speed plus the burst), so it never overruns a bend;
  // otherwise the calm cruise's flat 20 m/s (the cruise and 🚀 already slow for bends themselves).
  const cap = (runUp(car) ? JUMP_SPEED : car.zoomUntil > game.raceTime ? zoomTop(car) : EASY_RACE_TOP) + 1
  if (flat <= cap) return
  // Well over it (a bend arriving at the end of a burst) the speed comes down faster.
  const to = Math.max(cap, flat - (6 + 2 * (flat - cap)) * dt)
  v.x *= to / flat
  v.z *= to / flat
}

/** The way a car's nose points (its local -z), for the arrow on the race map. */
const NOSE_AXIS = new CANNON.Vec3(0, 0, -1)
const headingScratch = new CANNON.Vec3()

/**
 * Easy mode: a tap on ◀ or ▶ is a gentle nudge and holding it turns harder
 * and harder, so a quick tap at full speed doesn't fling the car into a wall.
 * Analogue steering (a gamepad stick) passes straight through.
 */
function rampSteer(car, steer, dt) {
  if (Math.abs(steer) < 1) return (car.steerHeld = 0), steer
  car.steerHeld = Math.sign(steer) === Math.sign(car.lastSteer ?? 0) ? (car.steerHeld ?? 0) + dt : 0
  car.lastSteer = steer
  return steer * Math.min(1, 0.4 + car.steerHeld * 1.2)
}

/**
 * Easy mode: the faster the car, the less a held ◀ ▶ turns it, so holding a
 * button down a city street drifts across the road instead of into the houses.
 * Slow (a bend, turning round after a crash) it still turns fully.
 */
const fastSteer = (car) => clamp(1 - (car.speed - 6) * 0.04, 0.4, 1)

/** Seconds of pushing against something without moving before Easy mode backs the car out, and how long it reverses. */
const WEDGED_SECONDS = 0.9
const BACK_OUT_SECONDS = 1.1
/** Easy off: a longer push against the wall before the car backs itself out (the child may be doing it on purpose). */
const WEDGED_SECONDS_FREE = 1.8
/**
 * Easy mode: a car nosed into a wall (or a terrace, a tent, a parked tram)
 * backs out by itself, turning towards the road, and drives on, instead of
 * pushing at the wall until it's put back on the road.
 */
function backOut(car, controls, dt, wedgedSeconds = WEDGED_SECONDS) {
  if (car.backOut > 0) {
    car.backOut -= dt
    const proj = game.progress.get(car.id)?.proj
    const s = proj && game.track.sampleAt(proj.dist + 10)
    // Reversing, the wheel turns the other way: steer away from the road to swing the nose towards it.
    const toRoad = s ? Math.sign(car.angleTo(s.p.x, s.p.z)) : 0
    // A firmer reverse than the 🐢 pedal's, so the car really swings round.
    return { steer: -toRoad, throttle: 0, brake: 2.5, cruise: false }
  }
  const pushing = controls.throttle > 0 && !controls.brake && car.forwardSpeed < 1.2 && car.grounded && !car.upsideDownTime
  car.wedged = pushing ? (car.wedged ?? 0) + dt : 0
  if (car.wedged > wedgedSeconds) {
    car.wedged = 0
    car.backOut = BACK_OUT_SECONDS
    // Backing out keeps failing (boxed in): recover() puts the car back on the road.
    car.backOuts = game.raceTime - (car.lastBackOut ?? -99) < 8 ? (car.backOuts ?? 0) + 1 : 1
    car.lastBackOut = game.raceTime
  }
  return controls
}

/**
 * Easy mode's gas: full speed on the straights (as fast as the bots), easing
 * off before sharp bends. Holding 🚀 always means full speed.
 */
function cruise(car, controls) {
  const proj = game.progress.get(car.id)?.proj
  if (!proj) return controls
  // Calm pass: a noticeably gentler cruise (was up to 30 m/s, about 108 km/h), the same as holding 🚀 (see easyTop).
  const target = runUp(car) ? JUMP_SPEED : easyTop(car) + zoomExtra(car)
  if (car.speed > target + 3) return { ...controls, throttle: 0, brake: 0.3 }
  return { ...controls, throttle: car.speed < target ? 1 : 0.3 }
}

/** A computer driver; in Smash mode it hunts the nearest car. */
function botController(bot) {
  return {
    update(car, dt) {
      const proj = projOf(car)
      // Racing (Easy or not), every bot keeps out of the camera's view of this device's child (see Bot.politeness).
      const child = game.mode === 'race' && game.raceOn ? game.player : null
      bot.camDist = camera.position.distanceTo(car.root.position)
      bot.easy = input.easyGas
      // Bumper cars: each bot comes round, along the road, for a bump with a child (see Bot.hunt).
      const prey = game.mode === 'smash' && preyFor(car)
      const preyProj = prey && game.progress.get(prey.id)?.proj
      // Of the robots waiting ahead of the same child, only the nearest waits right in its line.
      const ahead = (c) => loopMod((game.progress.get(c.id)?.proj?.dist ?? 0) - preyProj.dist)
      const first = !!preyProj && [...game.cars.values()].every((o) => o === car || !o.isBot || o.prey !== prey || ahead(o) > game.track.length / 2 || ahead(o) >= ahead(car))
      if (prey && preyProj) bot.hunt(dt, proj, prey, preyProj, first)
      else if (game.mode === 'smash') bot.update(dt, proj, Bot.nearest(car, game.cars.values()))
      else bot.update(dt, proj, null, leadOverLastHuman(car), game.cars.values(), child)
    },
  }
}

/**
 * Bumpers: the child a bot goes after, the one bumped least recently (so with friends everybody gets bumped), nearest
 * first on a tie. Kept for a few seconds, so a bot does not switch back and forth.
 */
function preyFor(car) {
  if (car.prey && game.cars.get(car.prey.id) === car.prey && game.raceTime < car.preyUntil) return car.prey
  const kids = [...game.cars.values()].filter((c) => !c.isBot)
  if (!kids.length) return null
  const last = (c) => game.bumpedAt.get(c.id) ?? -Infinity
  kids.sort((a, b) => last(a) - last(b) || a.body.position.distanceTo(car.body.position) - b.body.position.distanceTo(car.body.position))
  car.prey = kids[0]
  car.preyUntil = game.raceTime + 4
  return car.prey
}

/** Metres a car is ahead of the last child still racing (0 when every child is home). */
function leadOverLastHuman(car) {
  let last = Infinity
  for (const e of game.setup.entries) {
    if (e.bot || game.left.has(e.id)) continue
    const prog = game.progress.get(e.id)
    if (prog && !prog.finished) last = Math.min(last, prog.total)
  }
  return last === Infinity ? 0 : (game.progress.get(car.id)?.total ?? 0) - last
}

/** After the finish line: a slow victory lap along the edge of the road, out of everyone's way. */
function pullOver(car) {
  const proj = projOf(car)
  car.pullSide ??= proj.lateral >= 0 ? 1 : -1
  const s = game.track.sampleAt(proj.dist + 8 + car.speed * 0.5)
  const lane = car.pullSide * (game.track.width / 2 - 1.5)
  const angle = car.angleTo(s.p.x + s.side.x * lane, s.p.z + s.side.z * lane)
  car.controls = { steer: clamp(angle * 2, -1, 1), throttle: car.speed < 4 ? 0.35 : 0, brake: car.speed > 7 ? 0.5 : 0 }
}

function step(dt) {
  for (const car of game.cars.values()) {
    if (!car.remote) {
      // Each car decides for itself: racing, done (pull over), or waiting for GO / the race is over.
      if (!game.raceOn) car.controls = BRAKE
      else if (game.progress.get(car.id)?.finished) pullOver(car)
      else car.controller.update(car, dt)
    }
    car.drive(dt)
  }
  world.step(dt)
  for (const car of game.cars.values()) if (!car.remote) car.afterStep(dt)
  // After the physics (the wheels would otherwise push the speed straight back): the Easy cap holds on the ground and in the air.
  if (game.player && game.raceOn) zoomPush(game.player, dt)
  // A robot is never carried faster than its own pace by a push from behind (see Bot.update's speedCap).
  if (game.raceOn) for (const car of game.cars.values()) if (car.isBot && !car.remote && car.speedCap && car.grounded && !car.turboActive) capSpeed(car, car.speedCap, dt)
  if (game.player && input.easyGas && game.raceOn) holdEasyCap(game.player, dt)
}

const laneAim = new THREE.Vector3()
/**
 * Easy mode, a ramp or jump coming up that the car would clip with one side: line up on it, as the bots do, instead of
 * catching its edge (a car half on a kicker tips and sticks). A car well clear of it is left alone. Null: no ramp to mind.
 */
function rampLane(car, proj) {
  const edge = game.track.width / 2 - 1.3
  for (const r of game.track.ramps) {
    const to = loopMod(r.dist - r.half - proj.dist)
    // A kicker is passed beside until 12 m past its end, so the car is clear of it before it steers back in.
    if (to > 90 && loopMod(proj.dist - (r.dist - r.half)) > r.half * 2 + (r.half < 8 ? 12 : 0)) continue
    const off = proj.lateral - r.lateral
    const kicker = r.half < 8
    if (Math.abs(off) > r.width / 2 + (kicker ? 2.4 : 1.6)) continue
    // A small kicker: passed well clear beside it, on the car's side if there is room there, else the other side.
    // A jump (or a kicker with no room either side): line up on it.
    if (kicker) {
      const side = Math.sign(off || 1)
      for (const way of [side, -side]) {
        const beside = r.lateral + way * (r.width / 2 + 1.9)
        if (Math.abs(beside) <= edge) return beside
      }
    }
    // Near its middle, as the bots take it: the edges of a jump have kerb flags and scenery close by.
    const keep = Math.min(0.6, r.width / 2 - 1.6)
    return r.lateral + clamp(off, -keep, keep)
  }
  return null
}

/**
 * Easy mode: a car close ahead in the same line (up to 20 m, further during a burst) is passed, not followed: the helper
 * aims about 2.5 m to its open side. This also keeps the lean into a tapped lane from running into a car already in
 * it, and lets a child who started at the back overtake. Null: nobody in the way.
 */
function passLane(car, proj) {
  const s = game.track.sampleAt(proj.dist)
  const me = car.body.position
  const room = game.track.width / 2 - 1.3
  const boosted = zoomExtra(car) > 0
  const reach = boosted ? 30 : 20
  // Boosted, the pass is wider (3.2 m beside the car, against 2.5 m), so the burst goes past it instead of into its tail.
  const gap = boosted ? 3.2 : 2.5
  let best = null, nearest = Infinity
  car.blocked = false
  for (const other of game.cars.values()) {
    if (other === car) continue
    const dx = other.body.position.x - me.x, dz = other.body.position.z - me.z
    const along = dx * s.t.x + dz * s.t.z
    const side = dx * s.side.x + dz * s.side.z
    if (along < -1 || along > reach || Math.abs(side) > gap || along > nearest) continue
    nearest = along
    const theirs = proj.lateral + side
    // The side of that car with more road; the lane is `gap` from it, kept on the road.
    const way = theirs > 0 ? -1 : 1
    best = clamp(theirs + way * gap, -room, room)
    // Right behind it and not yet beside it: the burst waits (see zoomPush), so the child never shoves a car along.
    car.blocked = along < 7 && Math.abs(side) < 2.1
  }
  return best
}
/** Metres before a tapped gate where Easy mode's helper starts leaning into the rainbow's lane. */
const GATE_LANE_AHEAD = 35
/**
 * Easy mode's steering helper: leans the wheel towards the road ahead, less so
 * the more the child is steering themselves. It never fights a deliberate turn.
 */
function steeringHelper(car, controls, dt = FIXED_DT) {
  const proj = game.progress.get(car.id)?.proj
  if (!proj) return controls
  // How fast the car is sliding across the road (m/s), to see the kerb coming rather than only once it is there.
  const slide = car.lastLateral == null ? 0 : clamp((proj.lateral - car.lastLateral) / dt, -15, 15)
  car.lastLateral = proj.lateral
  // ⚡ tapped for the gate coming up: over the last stretch before it, a gentle lean towards the rainbow's side. The tap
  // counts wherever the car ends up, so the lean is only the picture of driving through it: a full swerve into the
  // lane at racing speed put the car on the kerb.
  let gate = game.gateRun?.ahead?.tapped ? game.gateRun.ahead : null
  if (gate && loopMod(gate.dist - proj.dist) > GATE_LANE_AHEAD) gate = null
  const target = game.track.sampleAt(proj.dist + 8 + car.speed * 0.6)
  // A ramp coming up comes first, then a car to pass, then the gate's lean.
  const ramp = rampLane(car, proj)
  // Racing, a car close ahead is passed; in Bumpers it is there to be bumped.
  const pass = ramp == null && game.mode === 'race' ? passLane(car, proj) : null
  if (pass == null) car.blocked = false
  const lane = ramp ?? pass ?? (gate ? gate.side * Math.min(1.2, game.track.width * 0.16) : 0)
  laneAim.copy(target.p).addScaledVector(target.side, lane)
  // Lining up for a ramp, the sideways gap itself also pulls the wheel (aiming at a point down a bend alone leaves the
  // car drifting wide of the line, onto the jump's edge).
  // Passing, the same: a firmer grip, so the car really pulls out beside the one ahead.
  const across = ramp != null ? clamp((ramp - proj.lateral) * 0.3, -0.4, 0.4) : pass != null ? clamp((pass - proj.lateral) * 0.35, -0.5, 0.5) : 0
  // A held ◀ or ▶ is the child's own steering, and the helper only leans on it, unless the car has turned well away
  // from the road (more than about 50°: room to change lanes, not to zigzag across the road) or is at the edge and still steering off it. Then the helper takes the wheel,
  // so a young child holding one button never circles for ever and the race always reaches its finish.
  const aim = car.angleTo(laneAim.x, laneAim.z)
  // Near the edge (1.8 m from it, where the car's own side is a metre from the kerb) a steer held towards the kerb is
  // set aside, so the car keeps moving instead of bumping the kerb (or a gate's post) every few seconds.
  const edge = game.track.width / 2 - 1.8
  // Where the car will be across the road in 0.6 s: a held steer that would carry it over the edge is set aside now.
  const soon = proj.lateral + slide * 0.6
  const offRoad = Math.abs(aim) > 0.9 || (Math.abs(soon) > edge && Math.sign(controls.steer) === Math.sign(soon) && controls.steer !== 0)
  if (offRoad) return { ...controls, steer: clamp(aim * 2.5, -1, 1) }
  // Right at a ramp or jump (from 35 m before it to just past it) the helper drives the line by itself: a held ◀ or ▶
  // there wedged the car against the jump's side.
  const atRamp = ramp != null && game.track.ramps.some((r) => loopMod(r.dist - r.half - proj.dist) < 35 || loopMod(proj.dist - (r.dist - r.half)) < r.half * 2 + 6)
  if (atRamp) return { ...controls, steer: clamp(aim * 2.2 + across, -1, 1) }
  const firm = ramp != null || pass != null
  const help = clamp(aim * (firm ? 2.2 : 1.6) + across, firm ? -1 : -0.8, firm ? 1 : 0.8) * (1 - Math.abs(controls.steer) * 0.7)
  return { ...controls, steer: clamp(controls.steer + help, -1, 1) }
}

/** Everything that follows the physics: visuals, damage, progress and effects. Shared by the frame loop and sim(). */
function tick(dt, realDt) {
  if (game.raceOn) {
    game.raceTime += dt
    if (game.finaleAt && game.raceTime >= game.finaleAt) endRace()
  }
  game.fixCooldown = Math.max(0, game.fixCooldown - realDt)
  game.resetCooldown = Math.max(0, game.resetCooldown - realDt)
  for (const [id, car] of game.cars) {
    car.syncVisual(dt)
    car.damage.update(dt, car.accel)
    updateProgress(id, car)
    if (car.turboActive || (car.revving && game.raceOn && Math.random() < 0.5)) exhaustFlames(car)
    if (car.ghost > 0) ghostTick(car, realDt)
    if (car.remote) continue
    const proj = game.progress.get(id)?.proj
    stunts(car, proj)
    rampGhost(car, proj)
    unpin(car, dt)
    if (game.raceOn && proj) pickups.collect(car, proj, game.raceTime, PICKUP_HANDLERS)
  }
  pickups.update(dt, game.room.selfId, game.raceTime, camera)
  debris.update(dt)
  game.track.update(dt)
  if (game.raceOn && game.player && !game.progress.get(game.player.id)?.finished) watchGates()
  scrapeAndSkid(dt)
  offRoadEffects(dt)
  for (const car of game.cars.values()) if (!car.remote) recover(car, dt)
}

const sparkPoint = new THREE.Vector3()
const sparkUp = new THREE.Vector3(0, 1, 0)
const smokeVelocity = new THREE.Vector3(0, 0.8, 0)
const tyreSmoke = { color: '#e8e8e8', size: 0.5, life: 1.2, kind: 'dust' }
function scrapeAndSkid(dt) {
  const player = game.player
  // Sparks where the player's body grinds against walls, other cars or the road.
  sparkTimer -= dt
  if (player && sparkTimer <= 0 && player.speed >= 5 && !calmRoad()) {
    for (const c of world.contacts) {
      const mine = c.bi === player.body
      if (!mine && c.bj !== player.body) continue
      if (harmless(mine ? c.bj : c.bi)) continue
      const r = mine ? c.ri : c.rj
      sparkPoint.set(player.body.position.x + r.x, player.body.position.y + r.y, player.body.position.z + r.z)
      // Rubbing door to door with another car: a light fizz, not a shower in front of the camera.
      const rubbing = !!(mine ? c.bj : c.bi).car
      effects.sparkBurst(sparkPoint, sparkUp, player.speed * (rubbing ? 0.08 : 0.25))
      audio.scrape(Math.min(1, player.speed / 20) * (rubbing ? 0.5 : 1))
      sparkTimer = rubbing ? 0.2 : 0.05
      break
    }
  }
  // Skid marks and tyre smoke for every locally simulated car.
  for (const car of game.cars.values()) {
    if (!car.vehicle) continue
    const e = car.root.matrixWorld.elements // car's right axis is the first column
    car.vehicle.wheelInfos.forEach((w, i) => {
      if (car.wheels[i].state === 'gone' || !w.isInContact) return effects.skids.mark(w, 0, 0, 0, 0, 0)
      const slip = 1 - w.skidInfo
      const hit = w.raycastResult.hitPointWorld
      effects.skids.mark(w, hit.x, hit.z, e[0], e[2], slip > 0.35 && car.speed > 5 ? slip : 0)
      if (slip > 0.6 && car.speed > 8 && Math.random() < 0.3) effects.puff(sparkPoint.set(hit.x, 0.3, hit.z), smokeVelocity, tyreSmoke)
    })
  }
}

function offRoadEffects(dt) {
  const p = game.player
  const proj = p && game.progress.get(p.id)?.proj
  if (proj && game.state === 'race') {
    if (proj.offRoad && p.speed > 3) {
      if (game.track.waterZones) {
        // Splashing through the rice paddies: slow and wet.
        p.body.velocity.scale(1 - dt * 0.9, p.body.velocity)
        if (Math.random() < 0.4) effects.splashAt(new THREE.Vector3(p.body.position.x, 0.2, p.body.position.z), p.speed)
        if (Math.random() < 0.05) audio.splash()
      } else if (Math.random() < 0.3) {
        effects.puff(new THREE.Vector3(p.body.position.x, 0.3, p.body.position.z), new THREE.Vector3(0, 0.6, 0), { color: '#c8b48a', size: 0.7, kind: 'dust' })
      }
    }
  }
}

const CAMERA_MODES = [
  { offset: new THREE.Vector3(0, 2.6, 6.8), look: new THREE.Vector3(0, 1, -4), stiffness: 7 }, // chase
  { offset: new THREE.Vector3(0, 5, 12), look: new THREE.Vector3(0, 1, -4), stiffness: 7 }, // far chase
  { offset: new THREE.Vector3(0, 1.4, -0.4), look: new THREE.Vector3(0, 1.2, -10), stiffness: 30 }, // bonnet
]
const UP_AXIS = new THREE.Vector3(0, 1, 0)
const headingQ = new THREE.Quaternion()
const headingE = new THREE.Euler()
const want = new THREE.Vector3()
function updateCamera(dt) {
  const p = game.player
  if (!p) return
  const pos = p.root.position
  if (game.debugCam) {
    const { yaw, dist, height } = game.debugCam
    camPos.set(pos.x + Math.sin(yaw) * dist, pos.y + height, pos.z + Math.cos(yaw) * dist)
    camLook.copy(pos).y += 0.6
  } else if (performance.now() < game.slowmoUntil) {
    // Swing around the car for a dramatic replay angle.
    const a = performance.now() / 600
    camPos.lerp(want.set(pos.x + Math.cos(a) * 7, pos.y + 2.5, pos.z + Math.sin(a) * 7), smoothing(4, dt))
    camLook.lerp(pos, smoothing(6, dt))
  } else {
    const mode = CAMERA_MODES[game.cameraMode]
    // Use only the car's heading, so the camera doesn't flip with a rolling car.
    headingQ.setFromAxisAngle(UP_AXIS, headingE.setFromQuaternion(p.root.quaternion, 'YXZ').y)
    // A phone held upright sees a narrow slice of road: the chase cameras sit higher and further back.
    const tall = mode !== CAMERA_MODES[2] && camera.aspect < 0.8
    want.copy(mode.offset)
    if (tall) want.set(want.x, want.y * 1.45, want.z * 1.3)
    const snap = game.snapCamera
    game.snapCamera = false
    camPos.lerp(want.applyQuaternion(headingQ).add(pos), snap ? 1 : smoothing(mode.stiffness, dt))
    want.copy(mode.look)
    // An upright screen looks further down the road and lower, so the road (not the sky) fills it.
    if (tall) want.set(want.x, -1.6, want.z * 1.6)
    camLook.lerp(want.applyQuaternion(headingQ).add(pos), snap ? 1 : smoothing(12, dt))
  }
  camera.position.copy(camPos)
  if (effects.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * effects.shake
    camera.position.y += (Math.random() - 0.5) * effects.shake
  }
  camera.lookAt(camLook)
  camera.fov = damp(camera.fov, (camera.aspect < 1 ? 75 : 62) + clamp(p.speed - 15, 0, 20) * 0.5 + (p.revving && game.state === 'race' ? 4 : 0), 3, dt)
  camera.updateProjectionMatrix()
  // Trees between the camera and the car thin out (see cities.js).
  seeThrough.camera.value.copy(camera.position)
  nearCamera.value.copy(camera.position)
  seeThrough.car.value.copy(pos).y += 0.8
  sun.position.set(pos.x + 40, 80, pos.z + 25)
  sun.target.position.copy(pos)
  sky.position.copy(camera.position)
}

const flamePoint = new THREE.Vector3()
function exhaustFlames(car) {
  for (const side of [-0.4, 0.4]) effects.flame(flamePoint.set(side, 0.35, car.dims.length / 2 + 0.1).applyMatrix4(car.root.matrixWorld))
}

/** Sets an element's text only when it changed, so the HUD doesn't touch the DOM every frame. */
const shown = new Map()
function setText(id, text) {
  if (shown.get(id) === text) return
  shown.set(id, text)
  $(id).firstChild.nodeValue = text
}

/** Greys out a button and fills it from the top while it recharges (0 = ready). */
function setCooldown(el, fraction) {
  const v = Math.ceil(clamp(fraction, 0, 1) * 20) / 20
  if (shown.get(el) === v) return
  // Ready again: a quick pop says "tap me".
  if (v === 0 && shown.get(el) > 0) {
    el.classList.remove('ready')
    void el.offsetWidth
    el.classList.add('ready')
  }
  shown.set(el, v)
  el.classList.toggle('cooling', v > 0)
  el.style.setProperty('--cool', v)
}

let waitUpdatedAt = 0
let placeUpdatedAt = 0
let placePending = { key: '', since: 0 }
/** Milliseconds a new race order must hold before the place pill shows it. */
const PLACE_SETTLE = 900
/**
 * Racing: the child's place, steady at the top ("2nd of 4"), and every car's picture in race order with the child's
 * own ringed. It changes only when the order changes: no flashing, no pulse.
 */
function renderPlace(now = performance.now()) {
  const el = $('place')
  const on = game.mode === 'race' && !!game.player && (game.state === 'race' || game.state === 'countdown')
  el.classList.toggle('hidden', !on)
  if (!on) return
  const rows = standings()
  const self = game.player.id
  const key = rows.map((r) => r.id).join()
  // A new order shows once it has held for a moment, so cars side by side never make the pill flicker.
  if (key !== placePending.key) placePending = { key, since: now }
  if (shown.get('place') === key || (shown.has('place') && now - placePending.since < PLACE_SETTLE)) return
  // Moving up a place: a cheeky zip and the place badge pops; dropping one: a soft slide down.
  const before = shown.get('place')?.split(',')
  shown.set('place', key)
  const i = rows.findIndex((r) => r.id === self)
  const was = before ? before.indexOf(self) : i
  if (before && game.state === 'race' && was !== i) {
    if (i < was) audio.overtake()
    else audio.overtaken()
    const rank = el.querySelector('.rank')
    rank.classList.remove('pop')
    void rank.offsetWidth
    rank.classList.toggle('pop', i < was)
  }
  el.querySelector('.rank').textContent = placeIcon(i)
  el.querySelector('.order').innerHTML = rows.map((r) => `<span class="${r.id === self ? 'me' : ''}" style="--ring:${game.cars.get(r.id)?.colour ?? '#fff'}">${carPic(validModel(r.model) ? r.model : CAR_IDS[0], 'pic order-pic')}</span>`).join('')
  el.setAttribute('aria-label', `${ORDINAL[i]} of ${rows.length}`)
}

function updateHud(now) {
  const p = game.player
  if (!p || !game.setup) return
  // The results line only changes when a friend gets home: a few checks a second is plenty.
  if (now - waitUpdatedAt > 200) {
    waitUpdatedAt = now
    if (game.state === 'results') updateResultsWait()
  }
  const prog = game.progress.get(p.id)
  // Laps as dots: one filled in for each lap begun.
  const lap = Math.min(game.laps, (prog?.lap ?? 0) + 1)
  setText('lap', `🏁 ${'●'.repeat(lap)}${'○'.repeat(game.laps - lap)}`)
  // Standings sort every car, so only a few times a second.
  if (now - placeUpdatedAt > 250) {
    placeUpdatedAt = now
    renderPlace(now)
  }
  setCooldown($('turbo-btn'), (p.turboCooldown - now) / TURBO_COOLDOWN)
  setCooldown($('fix-btn'), game.fixCooldown / FIX_COOLDOWN)
  // A battered car (or one missing a wheel): 🔧 stays highlighted until it's tapped.
  const broken = game.fixCooldown <= 0 && (p.damage.level > 0.45 || p.wheels.some((w) => w.state === 'gone'))
  if (shown.get('broken') !== broken) {
    shown.set('broken', broken)
    $('fix-btn').classList.toggle('needed', broken)
  }
  setCooldown($('reset-btn'), game.resetCooldown / RESET_COOLDOWN)
  // The finale: once a friend is home, a calm flag (no ticking seconds) for whoever is still racing.
  $('finale').classList.toggle('hidden', !(game.raceOn && game.finaleAt && game.state === 'race'))
  drawMinimap()
}

/** The track outline is drawn once per city; each frame only the car dots are drawn on top. */
let minimap = null
function drawMinimap() {
  const t = game.track
  if (minimap?.track !== t) {
    const xs = t.samples.map((s) => s.p.x), zs = t.samples.map((s) => s.p.z)
    const minX = Math.min(...xs), minZ = Math.min(...zs)
    const scale = 120 / Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ)
    const outline = new Path2D()
    t.samples.forEach((s, i) => outline[i ? 'lineTo' : 'moveTo'](20 + (s.p.x - minX) * scale, 20 + (s.p.z - minZ) * scale))
    outline.closePath()
    minimap = { track: t, minX, minZ, scale, outline, g: $('minimap').getContext('2d') }
  }
  // The road is stroked straight onto the map each frame (a cached offscreen copy could come back blank after a lost context).
  const { g, minX, minZ, scale } = minimap
  g.clearRect(0, 0, 160, 160)
  g.lineJoin = 'round'
  // A dark edge under the white road, so it reads on the cream card.
  g.strokeStyle = 'rgba(30,30,50,0.55)'
  g.lineWidth = 11
  g.stroke(minimap.outline)
  g.strokeStyle = 'rgba(255,255,255,0.92)'
  g.lineWidth = 6
  g.stroke(minimap.outline)
  g.textBaseline = 'alphabetic'
  // Each car is a dot in its own colour (the colour of its name tag). Everyone else
  // first, so the child's own dot, bigger and ringed in white, is always on top.
  g.strokeStyle = '#2b2d42'
  drawGateMarks(g, minX, minZ, scale)
  for (const pass of [false, true]) {
    for (const car of game.cars.values()) {
      if (car.isPlayer !== pass) continue
      const x = 20 + (car.body.position.x - minX) * scale, y = 20 + (car.body.position.z - minZ) * scale
      g.beginPath()
      if (car.isPlayer) {
        g.arc(x, y, 13, 0, Math.PI * 2)
        g.fillStyle = '#ffffff'
        g.fill()
        g.lineWidth = 3
        g.stroke()
        // A small point the way the car faces, so "the next gate" can be read off the map.
        const nose = car.body.quaternion.vmult(NOSE_AXIS, headingScratch)
        const k = Math.hypot(nose.x, nose.z) || 1, nx = nose.x / k, nz = nose.z / k
        g.beginPath()
        g.moveTo(x + nx * 21, y + nz * 21)
        g.lineTo(x + nx * 11 - nz * 7, y + nz * 11 + nx * 7)
        g.lineTo(x + nx * 11 + nz * 7, y + nz * 11 - nx * 7)
        g.closePath()
        g.fillStyle = '#ffffff'
        g.fill()
        g.lineWidth = 2
        g.stroke()
        g.beginPath()
        g.arc(x, y, 8, 0, Math.PI * 2)
        g.fillStyle = car.colour
        g.fill()
        g.lineWidth = 2
        g.stroke()
      } else {
        g.arc(x, y, 7.5, 0, Math.PI * 2)
        g.fillStyle = car.colour
        g.fill()
        g.lineWidth = 3
        g.stroke()
      }
    }
  }
}

/** The zoom arches on the map: a small ⚡ where each gate stands, so the child can see the next one coming. */
function drawGateMarks(g, minX, minZ, scale) {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '15px system-ui'
  for (const gate of gates.gates) {
    const x = 20 + (gate.at.x - minX) * scale, y = 20 + (gate.at.z - minZ) * scale
    g.beginPath()
    g.arc(x, y, 9, 0, Math.PI * 2)
    g.fillStyle = '#ffd35a'
    g.fill()
    g.lineWidth = 2
    g.stroke()
    g.fillText('⚡', x, y + 1)
  }
  g.textBaseline = 'alphabetic'
}

function frame(now) {
  gates.show(['race', 'results', 'syncing', 'countdown'].includes(game.state))
  const realDt = Math.min(0.1, (now - last) / 1000)
  last = now
  game.timeScale = now < game.slowmoUntil ? 0.28 : damp(game.timeScale, 1, 5, realDt)
  const dt = realDt * game.timeScale
  if (game.track && game.player && ['race', 'countdown', 'results', 'syncing'].includes(game.state)) {
    accumulator += dt
    let steps = 0
    while (accumulator >= FIXED_DT * game.timeScale && steps < 4) {
      step(FIXED_DT * Math.min(1, game.timeScale))
      accumulator -= FIXED_DT * game.timeScale
      steps++
    }
    if (steps === 4) accumulator = 0
    tick(dt, realDt)
    updateCamera(realDt)
    fadeTags()
    updateHud(now)
    const revving = game.player.revving && game.state === 'race'
    audio.updateEngine(game.player.speed, revving ? 2.2 : game.player.controls.throttle, calmRoad())
    if (!game.room.solo) {
      // Send our cars ~20 times a second (bots too if we run them), in one message.
      if (now - game.lastSend > 50) {
        game.lastSend = now
        const cars = [...game.cars.values()].filter((c) => !c.remote).map((c) => ({ id: c.id, ...c.snapshot(), ...(c.ghost > 0 ? { g: 1 } : {}) }))
        send({ t: 's', r: raceId(), cars }, { fast: true })
      }
      if (game.raceOn && now - game.lastStats > 2000) {
        game.lastStats = now
        sendStats()
      }
    }
  } else audio.idleEngine()
  // Soft music on the menus and the podium only; on the road the engine is the music.
  audio.updateMusic(['menu', 'waiting', 'results'].includes(game.state))
  effects.update(realDt, camera)
  if (game.state === 'race') measureQuality(realDt, now)
  gates.update(camera)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// --- Boot ------------------------------------------------------------------------------------------------

async function boot() {
  buildMenu()
  // Join the room while the cars load, and listen from the moment it exists.
  const cars = withRetry(loadCars).then(() => (game.assetsReady = true))
  // The scenery isn't needed for the lobby: a race that starts before it's here waits for it.
  withRetry(loadProps).then(() => {
    game.propsReady = true
    const setup = game.pendingSetup
    if (!setup) return
    startRace(setup)
    if (setup.go) runCountdown()
  })
  setupRoom(await joinRoom({ maxPlayers: 4 }))
  await cars
  if (DEBUG && params.get('city')) {
    game.city = params.get('city')
    game.laps = Number(params.get('laps') ?? 2)
    game.mode = params.get('mode') ?? 'race'
    if (params.get('car')) game.myModel = params.get('car')
    game.players.get(game.room.selfId).model = game.myModel
    game.state = 'menu'
    hostStartRace()
  } else enterLobbyScreen()
  // Whatever arrived while the cars loaded (a race may already be starting).
  for (const [msg, from] of game.queue.splice(0)) onMessage(msg, from)
  requestAnimationFrame(frame)
}

if (DEBUG) {
  // Hooks for automated tests: drive, crash and inspect.
  window.__crash = {
    game, THREE, CANNON, effects, world, input, pickups, quality,
    endRace, standings, renderResults, Car, env,
    state: () => ({
      state: game.state,
      speed: game.player?.speed,
      damage: game.player?.damage.level,
      parts: game.player?.damage.parts.map((p) => `${p.name}:${p.state}`),
      glass: game.player?.damage.glass.map((g) => g.state),
      wheels: game.player?.wheels.map((w) => w.state),
      progress: game.progress.get(game.player?.id),
      pos: game.player && [game.player.body.position.x, game.player.body.position.y, game.player.body.position.z],
      debris: debris.items.length,
    }),
    /** Points the player's car at a world position and sets it moving at `speed` m/s. */
    launch(x, z, speed, yawOverride) {
      const car = game.player
      const p = car.body.position
      const yaw = yawOverride ?? Math.atan2(-(x - p.x), -(z - p.z))
      car.body.quaternion.setFromEuler(0, yaw, 0)
      car.body.velocity.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed)
      car.body.angularVelocity.setZero()
    },
    /** Lets a bot drive the player's car (for tests); off gives it back to the input. */
    autopilot(on = true, skill = 0.85) {
      game.player.controller = on ? botController(new Bot(game.player, game.track, skill, 7)) : humanController
    },
    race: () => ({
      time: game.raceTime,
      raceOn: game.raceOn,
      finaleAt: game.finaleAt,
      state: game.state,
      cars: [...game.cars.values()].map((c) => {
        const p = game.progress.get(c.id)
        return { id: c.id, model: c.model, lap: p.lap, sector: p.sector, total: Math.round(p.total), finished: p.finished, time: game.finishTimes.get(c.id), damage: +c.damage.level.toFixed(2), speed: +c.speed.toFixed(1), stats: game.stats.get(c.id) }
      }),
    }),
    /** Orbit camera for inspecting the car: yaw is world-space, in radians. */
    view(yaw, dist = 6, height = 2.5) {
      game.debugCam = yaw == null ? null : { yaw, dist, height }
      updateCamera(1)
    },
    place(x, z, yaw) {
      game.player.place(new THREE.Vector3(x, 0, z), yaw)
    },
    /** Runs `seconds` of game time immediately (no rendering), optionally overriding the player's controls. */
    sim(seconds, controls) {
      input.override = controls ?? null
      for (let i = Math.round(seconds / FIXED_DT); i > 0; i--) {
        step(FIXED_DT)
        tick(FIXED_DT, FIXED_DT)
      }
      input.override = null
      updateCamera(1)
      return this.state()
    },
  }
  window.__race = { game, gates, camera, respawn, act, startRace, onMessage }
}

boot()
