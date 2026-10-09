import { createDelivery } from './delivery.js'
import { createAdventure } from './adventure.js'
import { createVoice } from './speech.js'
import { createTown, drawMapCar, drawTownMap, townMapLayout } from './town.js'
import * as THREE from 'three'
import * as CANNON from 'cannon'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { joinRoom } from 'https://bitgames.store/vendor/bitgames/multiplayer-1.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { CAR_MODELS, Car, TURBO_COOLDOWN, carColour, prepareTemplate } from './car.js'
import { CITIES, buildCity, seeThrough } from './cities.js'
import { Debris } from './damage.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { Pickups } from './pickups.js'
import { carPortraits } from './portraits.js'
import { GROUP_CAR, GROUP_PROP, GROUP_STATIC, STATIC_MASK, canvasTexture, clamp, damp, escapeHtml, harmless, reducedMotion, rng, smoothing } from './util.js'

const params = new URLSearchParams(location.search)
const DEBUG = params.has('debug')
const $ = (id) => document.getElementById(id)
const FIXED_DT = 1 / 60
const SMASH_SECONDS = 120
/** Once the first child finishes, everyone else has this long before the podium. */
const FINALE_SECONDS = 20
/** How long the host waits for slow devices to build the city before starting anyway. */
const READY_TIMEOUT = 12000
/** Seconds a respawned car drives through other cars, so it never lands inside one. */
const RESPAWN_GHOST = 2
const RESET_COOLDOWN = 3
/** Delivery Town: a slow, steady top speed (about 47 km/h) and how long the car rests at a doorstep. */
const TOWN_TOP_SPEED = 13
const HANDOVER_SECONDS = 2.4
const FIX_COOLDOWN = 8
const PLAYER_EMOJI = ['🦊', '🐼', '🐸', '🐯', '🐵', '🐰', '🐶', '🐨']
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
const MEDAL = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅', '🏅', '🏅']

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
  mode: 'town', // town (Delivery Town, the calm default) | race | smash
  townHold: 0, // race time until which the car rests at a doorstep while a parcel is handed over
  scores: new Map(), // id -> smash points
  laps: 2,
  players: new Map(), // id -> { id, emoji, model }
  hostId: null, // who runs the lobby and the bots (moves on if the host leaves)
  myModel: null, // the car this child picked in the lobby
  cars: new Map(), // id -> Car
  progress: new Map(), // id -> { lap, sector, hint, total, finished, proj }
  finishTimes: new Map(),
  stats: new Map(), // id -> { stars, air, flips, crashes, cones, boxes } (see newStats)
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
  lastSend: 0,
  lastStats: 0,
  fixCooldown: 0,
  resetCooldown: 0,
}

// Optional learning mission (race mode only): visit four numbered stops in map order.
function renderDeliveryProgress(goal, option, count) {
  if (!option.goal) return
  goal.replaceChildren()
  goal.setAttribute('aria-label', `${option.goal}. ${count} of 4 stops delivered.`)
  const caption = document.createElement('span')
  caption.textContent = count < 4 ? `🎁 Stop ${count + 1} · ${count} / 4` : '🎁 All 4 stops! · 4 / 4'
  const steps = document.createElement('span')
  steps.className = 'delivery-steps'
  for (let i = 0; i < 4; i++) {
    const number = document.createElement('span')
    number.textContent = String(i + 1)
    number.className = i < count ? 'done' : i === count ? 'next' : ''
    steps.append(number)
  }
  goal.append(caption, steps)
}

// One voice for the game. Directions queue; feedback on what the child just did replaces older words.
const voice = createVoice({ muted: audio.muted, rate: 0.82, pitch: 1 })

const adventure = createAdventure({
  id: 'crash-racers',
  // The racing mission chip belongs to Race: it sits after the mode buttons and only shows for Race.
  place: (button) => document.querySelector('.modes').append(button),
  hud: $('hud'),
  voice,
  celebrate: (text) => banner(text),
  renderProgress: renderDeliveryProgress,
  options: [
    { emoji: '🏎️', label: 'Free driving' },
    { label: 'Follow the delivery map', pictures: '🎁', caption: '1 → 2 → 3 → 4', goal: 'Deliver to stops 1 → 2 → 3 → 4', target: 4, reward: 'Four deliveries in map order!' },
  ],
})
function renderModeChoice() {
  adventure.enable(game.mode === 'race')
  document.querySelector('.laps').classList.toggle('hidden', game.mode !== 'race')
}
renderModeChoice()
const delivery = createDelivery(scene, () => {
  adventure.event()
  // Said after the mission's count, in the voice's queue
  if (deliveryOn() && game.raceOn && delivery.next < adventure.option.target) voice.say(`Now drive to stop ${delivery.next + 1}!`)
}, (next) => {
  if (game.raceOn && deliveryOn()) voice.sayNow(`Find stop ${next} on the map!`)
})
const deliveryOn = () => game.mode === 'race' && !!adventure.option.goal

// --- Delivery Town ------------------------------------------------------------------
// The calm default: no race, no bots. Four picture parcels go to four picture
// houses placed out of the parcel list's order; the child picks a parcel, finds
// its house on the big map and drives there. See town.js.

const town = createTown(scene)
const townOn = () => game.mode === 'town'

/** The parcels in the van, as big picture buttons: tap one to choose where to go next. */
function renderParcels() {
  const el = $('parcels')
  if (!townOn()) return el.replaceChildren()
  el.replaceChildren(
    ...town.tray.map((i) => {
      const { kind } = town.houses[i]
      const delivered = town.order.includes(i)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'parcel'
      button.classList.toggle('chosen', i === town.chosen)
      button.classList.toggle('delivered', delivered)
      button.disabled = delivered
      button.style.setProperty('--tint', kind.colour)
      button.innerHTML = `<span class="picture">${kind.emoji}</span>${delivered ? '<span class="tick">✓</span>' : ''}`
      button.setAttribute('aria-label', `${kind.parcel}${delivered ? ', delivered' : `, for ${kind.house}`}`)
      button.setAttribute('aria-pressed', String(i === town.chosen))
      button.onclick = () => chooseParcel(i)
      return button
    }),
  )
}

/** The child picked a parcel: it rides on the roof, its house glows on the map, and the voice says where it goes. */
function chooseParcel(i) {
  if (!townOn() || game.state !== 'race' || !game.player || town.order.includes(i)) return
  audio.unlock()
  // Already parked at the right house: hand it straight over.
  if (town.at === i) {
    town.choose(i, game.player)
    return deliverTo(i)
  }
  audio.beep()
  town.choose(i, game.player)
  renderParcels()
  const { kind } = town.houses[i]
  voice.sayNow(`${kind.parcel} goes to ${kind.house}. Can you find it on the map?`)
}

/** The car reached a house's doorstep (once per visit). */
function townArrive(i) {
  const here = town.houses[i].kind
  if (town.order.includes(i)) return town.waveAt(i)
  if (town.chosen === i) return deliverTo(i)
  if (town.chosen >= 0) {
    // The wrong house: say kindly whose house it is and where the parcel goes.
    const wanted = town.houses[town.chosen].kind
    banner(`🏠 ${here.emoji}  ·  📦 ${wanted.emoji}`, 2000)
    voice.sayNow(`This is ${here.house}. ${wanted.parcel} goes to ${wanted.house}.`)
    return
  }
  // No parcel chosen yet: the car rests here a moment so the child can find the matching parcel.
  game.townHold = game.raceTime + HANDOVER_SECONDS
  banner(`🏠 ${here.emoji}`, 2000)
  voice.sayNow(`This is ${here.house}. Which parcel goes here?`)
}

/** A calm handover: the car rests, the parcel hops to the doorstep, a doorbell, and the resident waves. */
function deliverTo(i) {
  const { kind } = town.houses[i]
  game.townHold = game.raceTime + HANDOVER_SECONDS
  town.deliver(i, game.player)
  audio.doorbell()
  renderParcels()
  banner(`${kind.resident} 👋 ${kind.emoji}`, 2400)
  voice.sayNow(kind.thanks)
  later(() => {
    if (!game.raceOn || !townOn()) return
    if (town.done) finishTown()
    else if (town.chosen < 0) voice.say('Which parcel next? Tap a parcel, then find its house on the map.')
  }, 3400)
}

/**
 * Jumps and kickers are built to be driven forwards: their steep back is a wall.
 * Turned round in town, the car hops gently over one instead of getting stuck behind it.
 */
function hopRampBackwards(car) {
  const proj = game.progress.get(car.id)?.proj
  if (!proj || travelDir(car, proj) > 0 || car.airTime > 0) return
  const ramp = game.track.ramps.find((r) => {
    const offset = game.track.offset(proj.dist, r.dist)
    return offset > 0 && offset < r.half + 4 && Math.abs(proj.lateral - r.lateral) < r.width / 2 + 1.5
  })
  if (!ramp) return
  const s = game.track.sampleAt(ramp.dist - ramp.half - 4)
  // The route recap follows the road over the ramp, not a break in the line.
  for (let d = proj.dist; game.track.offset(d, s.dist) > 0; d -= 2) town.record(game.track.sampleAt(d).p)
  const speed = Math.min(car.speed, 8)
  car.place(s.p.clone().addScaledVector(s.side, clamp(proj.lateral, -game.track.width / 2 + 1.5, game.track.width / 2 - 1.5)), game.track.headingAt(s) + Math.PI)
  // Keep rolling the way it was going, so the hop feels like part of the drive.
  car.body.velocity.set(-s.t.x * speed, 0, -s.t.z * speed)
  audio.whoosh()
}

/** Every parcel delivered: the drive ends with the route recap (no podium). */
function finishTown() {
  const car = game.player
  const prog = car && game.progress.get(car.id)
  if (!prog || prog.finished) return
  prog.finished = true
  game.finishTimes.set(car.id, game.raceTime)
  send({ t: 'done', r: raceId(), id: car.id, time: game.raceTime })
  // Alone (or the last friend home): the drive is over now, not after the race's pause.
  if (allFinished()) game.raceOn = false
  game.state = 'results'
  renderResults()
  show('results')
  voice.say(`You delivered ${town.order.length} parcels! You read the map to find every house.`)
  onCarFinished(car.id)
}

/** The results screen in Delivery Town: the map, the way the child drove, and each stop numbered in the order they chose. */
function renderRecap() {
  const map = $('recap-map')
  drawTownMap(map.getContext('2d'), map.width, game.track, town.houses, { route: town.route, order: town.order })
  $('recap-stops').innerHTML = town.order
    .map((i, n) => `<span class="stop" style="--tint:${town.houses[i].kind.colour}"><b>${n + 1}</b>${town.houses[i].kind.emoji}</span>`)
    .join('<span class="arrow">→</span>')
  map.setAttribute('aria-label', `Your route: ${town.order.map((i, n) => `${n + 1}, ${town.houses[i].kind.house}`).join('; ')}`)
}

const isHost = () => game.room && game.hostId === game.room.selfId
/** The current race's id: every race message carries it, so stragglers from the last race are ignored. */
const raceId = () => (game.pendingSetup ?? game.setup)?.seed ?? 0

/** A timer that belongs to this race: startRace() cancels whatever is still pending. */
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

// --- Assets -------------------------------------------------------------------------

const loader = new GLTFLoader()

/** The cars: enough for the lobby. Each is prepared for the road now, not when the first race starts. */
async function loadCars() {
  const models = Object.keys(CAR_MODELS)
  let done = 0
  await Promise.all(
    models.map(async (name) => {
      const gltf = await loader.loadAsync(`./models/car_${name}.glb`)
      const template = gltf.scene.getObjectByName(`car_${name}`) ?? gltf.scene
      prepareTemplate(template)
      game.templates[name] = template
      $('loading-text').textContent = `Building cars… ${++done}/${models.length}`
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
      return `<span class="player${p.id === self ? ' me' : ''}">${escapeHtml(p.emoji)}${car}${p.id === self ? ' (me)' : ''}</span>`
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
    (id) => `<button class="car-pick ${id === game.myModel ? 'selected' : ''}" data-car="${id}">
      ${carPic(id)}<span class="name">${CAR_MODELS[id].name}</span>${friends.has(id) ? `<span class="taken">${friends.get(id)}</span>` : ''}</button>`,
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
    .map(([id, c]) => `<button class="city ${id === game.city ? 'selected' : ''}" data-city="${id}" style="background:${c.color}">
        <span class="emoji">${c.emoji}</span><span class="name">${c.flag} ${c.name}</span><span class="blurb">${c.blurb}</span></button>`)
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
  for (const id of ['sound-btn', 'menu-sound']) $(id).onclick = () => setMuted(!audio.muted)
  renderSound()
  $('easy-gas').onclick = () => {
    input.easyGas = !input.easyGas
    $('easy-gas').classList.toggle('on', input.easyGas)
  }
  $('go').onclick = () => {
    audio.unlock()
    hostStartRace()
  }
  $('again').onclick = () => hostStartRace()
  $('change-city').onclick = () => {
    if (!isHost() || game.raceOn) return
    send({ t: 'menu' })
    enterLobbyScreen()
  }
}

/** One sound switch for the whole game (menu and race), remembered on this device. */
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
  voice.setMuted(muted)
  try {
    localStorage.setItem('crash-racers-sound', muted ? '0' : '1')
  } catch {}
  renderSound()
}
try {
  if (localStorage.getItem('crash-racers-sound') === '0') {
    audio.setMuted(true)
    voice.setMuted(true)
  }
} catch {}

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
    setWaitingText('Waiting for the race to start…')
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

const RACE_MESSAGES = new Set(['s', 'hit', 'score', 'done', 'stats', 'fix', 'ready', 'go', 'end', 'wave'])

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
      if (from === game.hostId && game.state === 'waiting') setWaitingText('🏁 A race is on! You can join the next one.')
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
    case 'score':
      if (game.cars.get(msg.id)?.remote) game.scores.set(msg.id, Math.max(game.scores.get(msg.id) ?? 0, Number(msg.n) || 0))
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
  // One race at a time: a double tap on GO (or Race again) does nothing the second time.
  if (!isHost() || !game.assetsReady || !['menu', 'results'].includes(game.state) || game.raceOn) return
  const seed = 1 + Math.floor(Math.random() * 1e9)
  const r = rng(seed)
  const entries = [...game.players.values()].map((p) => ({ id: p.id, model: validModel(p.model) ? p.model : null, bot: false, emoji: p.emoji }))
  const free = CAR_IDS.filter((m) => !entries.some((e) => e.model === m)).sort(() => r() - 0.5)
  const anyCar = () => free.shift() ?? CAR_IDS[Math.floor(r() * CAR_IDS.length)]
  for (const e of entries) e.model ??= anyCar()
  // Delivery Town has no bots: nobody to race, just the town.
  if (game.mode !== 'town') for (let i = entries.length; i < 4; i++) entries.push({ id: `bot${i}`, model: anyCar(), bot: true, emoji: '🤖' })
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
    $('loading-text').textContent = 'Building the city…'
    show('loading')
    return
  }
  game.pendingSetup = null
  clearTimers()
  game.setup = setup
  game.city = Object.hasOwn(CITIES, setup.city) ? setup.city : 'ubud'
  game.laps = clamp(Number(setup.laps) || 2, 1, 5)
  game.mode = ['smash', 'town'].includes(setup.mode) ? setup.mode : 'race'
  game.townHold = 0
  // A friend's device follows the host's mode: the racing mission only runs in Race.
  renderModeChoice()
  game.raceOn = false
  game.finaleAt = 0
  game.confetti = false
  game.scores = new Map(setup.entries.map((e) => [e.id, 0]))
  $('lap').classList.toggle('hidden', game.mode === 'smash')
  $('timer').classList.toggle('hidden', game.mode !== 'smash')
  // Tear down the previous race
  for (const car of game.cars.values()) car.dispose()
  game.cars.clear()
  game.progress.clear()
  game.finishTimes.clear()
  game.stats.clear()
  game.left.clear()
  game.player = null
  debris.clear()
  effects.reset()
  if (!setup.entries.some((e) => e.id === game.room.selfId)) {
    // This race started before we arrived: wait in the lobby for the next one.
    game.state = 'waiting'
    setWaitingText('🏁 A race is on! You can join the next one.')
    show('waiting')
    renderPlayers()
    return
  }
  game.track?.dispose()
  game.track = buildCity(game.city, env, game.props)
  adventure.begin()
  delivery.configure(game.track)
  town.clear()
  if (townOn()) town.configure(game.track, setup.seed)
  $('hud').classList.toggle('town', townOn())
  $('parcels').classList.toggle('hidden', !townOn())
  // The town map is drawn bigger and sharper than the racing minimap.
  const mapSize = townOn() ? 360 : 160
  if ($('minimap').width !== mapSize) $('minimap').width = $('minimap').height = mapSize
  minimap = null
  skyMaterial.uniforms.top.value.set(game.track.sky[0])
  skyMaterial.uniforms.bottom.value.set(game.track.sky[1])
  scene.fog = new THREE.Fog(game.track.fog, 120, 700)
  sun.color.set(game.track.sunColor)
  // Stars and mystery boxes are racing things; the town keeps its roads clear.
  if (townOn()) pickups.dispose()
  else pickups.build(game.track, setup.seed)

  const grid = game.track.grid4(setup.entries.length)
  setup.entries.forEach((entry, i) => {
    const local = entry.id === game.room.selfId || (entry.bot && isHost())
    const car = makeCar(entry, i, local)
    car.place(grid[i].position, grid[i].yaw)
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
  el.textContent = townOn() ? '📦' : '🚦'
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
  car.recovery = car.isPlayer ? PLAYER_RECOVERY : BOT_RECOVERY
  car.gentle = townOn()
  if (local) {
    car.onHit = (hit) => onLocalHit(car, hit)
    car.onLand = (land) => onLanding(car, land)
    car.controller = car.isPlayer ? humanController : botController(new Bot(car, game.track, 0.72 + i * 0.05, i + 1))
    car.body.addEventListener('collide', (e) => knockProp(car, e.body))
  }
  // Tags on everyone else's car; your own would only block your view.
  if (!car.isPlayer) {
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false, toneMapped: false, fog: false }))
  sprite.scale.set(0.14, 0.07, 1)
  sprite.renderOrder = 10
  return sprite
}

function fadeTags() {
  for (const car of game.cars.values()) {
    if (!car.tag) continue
    const d = camera.position.distanceTo(car.root.position)
    const o = clamp((d - 4) / 6, 0, 1)
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
  if (townOn()) {
    // No countdown in town: the van is simply ready to go.
    el.classList.add('hidden')
    game.state = 'race'
    game.raceOn = true
    show(null)
    renderParcels()
    banner(`📦 × ${town.houses.length}`, 2400)
    voice.say(`${town.houses.length} parcels to deliver! Tap a parcel, then find its house on the map.`)
    return
  }
  if (game.player) banner(`You drive ${game.player.spec.emoji} ${game.player.spec.name}!`, 2600)
  const steps = ['3', '2', '1', 'GO!']
  steps.forEach((text, i) =>
    later(() => {
      el.textContent = text
      audio.beep(i === 3)
      if (i === 3) {
        game.state = 'race'
        game.raceOn = true
        show(null)
        if (deliveryOn()) voice.say('Drive to stop 1!')
        later(() => el.classList.add('hidden'), 700)
      }
    }, i * 900),
  )
}

// --- Gameplay events -----------------------------------------------------------------------

const newStats = () => ({ stars: 0, air: 0, flips: 0, crashes: 0, cones: 0, boxes: 0 })
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

/** Smash points: this device scores the cars it drives and tells everyone. */
function addScore(car, n) {
  game.scores.set(car.id, (game.scores.get(car.id) ?? 0) + n)
  send({ t: 'score', r: raceId(), id: car.id, n: game.scores.get(car.id) })
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
  const pad = proj && !townOn() ? game.track.boostPadAt(proj) : null
  if (pad && car.boostPad !== pad) {
    car.boost({ free: true, seconds: 1.6 })
    if (car.isPlayer) audio.whoosh()
  }
  car.boostPad = pad ?? null
  // At the top of a jump (still going fast: a car that just rolled onto its roof isn't flying).
  if (car.isPlayer && !townOn() && car.airTime > 0.55 && !car.slowmoJump && car.body.velocity.y > -2 && car.speed > 6) {
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
  if (townOn()) return audio.thump(Math.min(0.35, airTime * 0.3))
  effects.addShake(Math.min(0.5, airTime * 0.3))
  audio.thump(Math.min(1, airTime * 0.8))
  if (airTime < 0.8 && !flips) return
  // Says what happened (a flip, or turbo filled up), without hype words or a cheer jingle.
  banner(flips ? `🌀 ${flips > 1 ? `${flips} flips` : 'Flip'} · 🔥 ready` : '🔥 Turbo ready', 1400)
  car.turboCooldown = 0
  if (game.mode === 'smash' && game.raceOn && flips) addScore(car, 2 * flips)
}

/** A car this device drives crashed (Car.applyHit has dented it): tell everyone, count it and show it. */
function onLocalHit(car, hit) {
  if (hit.gentle) {
    // Delivery Town: a friendly bump. A soft boing and a little dust, no dents to share.
    if (car.isPlayer) audio.bump(Math.min(1, hit.speed / 10))
    for (let i = 0; i < 3; i++) effects.puff(landingDust.set(hit.world.x, 0.4, hit.world.z), dustVelocity.set((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2), { color: '#efe6d2', size: 0.7, life: 0.9 })
    return
  }
  send({ t: 'hit', r: raceId(), id: car.id, l: hit.local.toArray().map((n) => +n.toFixed(3)), d: hit.dir.toArray().map((n) => +n.toFixed(3)), s: +hit.speed.toFixed(1), seed: hit.seed })
  if (hit.speed > 7) {
    addStat(car, 'crashes')
    // Each car scores its own crashes (2 for hitting a car, 1 for a wall). Both cars
    // in a smash see the hit, so each gets its 2 from its own side, local or not.
    if (game.mode === 'smash' && game.raceOn) addScore(car, hit.otherCar ? 2 : 1)
  }
  showHit(car, hit.world, hit.normal, hit.speed)
}

const UP = new THREE.Vector3(0, 1, 0)
/**
 * Sparks and a crunch for any car's crash, local or not; for the player a small shake (a real bump).
 * Calm pass: no slow-motion replay and no random "KABOOM!" banners; the dents tell the story.
 */
function showHit(car, point, normal, speed) {
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

const pickPoint = new THREE.Vector3()
const RAINBOW = ['#ff6b9d', '#ffbe0b', '#8ac926', '#2ec4b6', '#6c63ff']
/** What happens when a car touches a star or a mystery box (see Pickups.collect). */
const PICKUP_HANDLERS = {
  onStar(car, star, streak) {
    addStat(car, 'stars')
    if (car.isPlayer) {
      effects.sparkle(pickPoint.set(star.x, star.y, star.z))
      audio.coin(streak)
    }
  },
  onBox: openBox,
}

/** Mystery box: a turbo, a honk that pushes everything nearby away, a repair or five stars. Never a bad thing. */
function openBox(car, box) {
  addStat(car, 'boxes')
  let prize = box.prize
  // Bots don't get the shockwave (it would only ever push children around), and a car that's fine doesn't need fixing.
  if (prize === 'wave' && car.isBot) prize = 'turbo'
  if (prize === 'fix' && car.damage.level < 0.12) prize = car.isBot ? 'turbo' : 'stars'
  if (car.isPlayer) {
    effects.sparkle(pickPoint.set(box.x, box.y, box.z), RAINBOW)
    audio.box()
  }
  const p = car.body.position
  if (prize === 'turbo') {
    car.boost({ free: true, seconds: 2.5 })
    if (car.isPlayer) {
      banner('🎁 🔥 Turbo', 1100)
      audio.whoosh()
    }
  } else if (prize === 'wave') {
    shockwave(p.x, p.z, car.id)
    send({ t: 'wave', r: raceId(), id: car.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2) })
    if (car.isPlayer) banner('🎁 📯 Honk wave', 1300)
  } else if (prize === 'fix') {
    repairCar(car)
    if (car.isPlayer) banner('🎁 🔧 All fixed!', 1100)
  } else {
    addStat(car, 'stars', 5)
    if (car.isPlayer) banner('🎁 ⭐ 5 stars', 1100)
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
  // In town the car may be driving either way round: it comes back facing the way it was going.
  const dir = travelDir(car, proj)
  const s = game.track.sampleAt(game.track.clearOfRamps(proj.dist + ahead * dir, 3, dir))
  car.place(s.p, game.track.headingAt(s) + (dir < 0 ? Math.PI : 0))
  car.backOut = car.wedged = car.backOuts = 0
  // A car that lost a wheel can't get going again: it comes back with its wheels on.
  if (car.wheels.some((w) => w.state === 'gone')) repairCar(car)
  setGhost(car, true)
}

/**
 * Seconds before a car this device drives is put back on the road (see recover).
 * A child gets longer to sort it out themselves; only the child's car is rescued from far off the road.
 */
const PLAYER_RECOVERY = { offRoad: 2, roof: 2.5, stuck: 5, noHeadway: 12 }
const BOT_RECOVERY = { offRoad: Infinity, roof: 3, stuck: 3.5, noHeadway: 8 }

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
  // In town a child may stop on purpose (reading the map, at a doorstep): only pushing without moving is stuck.
  const resting = townOn() && car.isPlayer && !(car.controls?.throttle > 0)
  car.stuckTime = car.speed < 1.5 && !finished && !resting ? car.stuckTime + dt : 0
  if (!car.headway || finished || prog.total - car.headway.total > 4) car.headway = { total: prog?.total ?? 0, time: game.raceTime }
  const lost = car.offRoadTime > limits.offRoad || car.upsideDownTime > limits.roof || car.backOuts >= 2
  // The child is only rescued while still racing (not behind the podium).
  if (car.isPlayer && lost && game.state === 'race') {
    respawn(car)
    banner('🔄 Back on the road!')
    return
  }
  const noHeadway = game.mode === 'race' && game.raceTime - car.headway.time > limits.noHeadway
  if ((!car.isPlayer && lost) || car.stuckTime > limits.stuck || noHeadway) {
    respawn(car, 6)
    // Bots come back fixed so a wreck doesn't sit at the back forever.
    if (!car.isPlayer && car.damage.level > 0.6) repairCar(car)
    if (car.isPlayer) banner('🔄 Back on the road!')
  }
}

/** A ghost car passes through other cars (it still hits walls), and blinks so everyone can see why. */
function setGhost(car, on) {
  car.ghost = on ? RESPAWN_GHOST : 0
  if (on) car.body.collisionFilterMask &= ~GROUP_CAR
  else {
    car.body.collisionFilterMask |= GROUP_CAR
    car.root.visible = true
  }
}

function ghostTick(car, dt) {
  car.ghost -= dt
  if (car.ghost > 0) {
    car.root.visible = Math.floor(car.ghost * 8) % 2 === 0
    return
  }
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
  banner('🔧 Good as new!')
  audio.cheer()
}

/** In-race actions, by keyboard key and by on-screen button name. */
const ACTIONS = {
  reset: () => {
    if (!game.player || game.resetCooldown > 0) return
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
  // Delivery Town: turn round on the spot, for a house that is quicker to reach the other way.
  turn: () => {
    const car = game.player
    if (!car || game.resetCooldown > 0 || game.townHold > game.raceTime) return
    const proj = projOf(car)
    const s = game.track.sampleAt(proj.dist)
    const half = game.track.width / 2 - 1.5
    const lateral = clamp(proj.lateral, -half, half)
    car.place(s.p.clone().addScaledVector(s.side, lateral), game.track.headingAt(s) + (travelDir(car, proj) > 0 ? Math.PI : 0))
    if (!game.room.solo) setGhost(car, true)
    game.resetCooldown = 1.2
    audio.whoosh()
  },
}
const KEYS = { r: 'reset', f: 'fix', h: 'horn', c: 'camera', shift: 'turbo', u: 'turn' }
/** Delivery Town keeps only the calm actions: back on the road and turn round. */
const TOWN_ACTIONS = new Set(['reset', 'turn'])
function act(name) {
  audio.unlock()
  if (game.state !== 'race') return
  if (townOn() ? !TOWN_ACTIONS.has(name) : name === 'turn') return
  ACTIONS[name]?.()
}
input.on('key', (k) => (k === 'm' ? setMuted(!audio.muted) : act(KEYS[k])))
input.on('button', act)

function turbo() {
  if (game.player?.boost()) {
    audio.whoosh()
    banner('🔥 Turbo', 700)
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
        banner(prog.lap === game.laps - 1 ? '🔔 Last lap! ⭐ Stars are back!' : `Lap ${prog.lap + 1}! ⭐ Stars are back!`)
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
    banner('🏁 FINISH!', 2000)
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
  // Delivery Town has no finale clock: friends finish when their parcels are delivered.
  if (entry && !entry.bot && !game.finaleAt && game.raceOn && !townOn()) game.finaleAt = game.raceTime + FINALE_SECONDS
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
  if ((game.state === 'race' || game.state === 'countdown') && !townOn()) {
    banner('🏁 Everyone stops here', 1500)
    audio.cheer()
  }
  game.state = 'results'
  renderResults()
  show('results')
}

function standings() {
  const entries = game.setup.entries.map((e) => ({ ...e, prog: game.progress.get(e.id), time: game.finishTimes.get(e.id), score: game.scores.get(e.id) ?? 0, left: game.left.has(e.id) }))
  if (game.mode === 'smash') return entries.sort((a, b) => a.left - b.left || b.score - a.score)
  return entries.sort((a, b) => {
    if (a.left !== b.left) return a.left - b.left
    if (a.time != null && b.time != null) return a.time - b.time
    if (a.time != null) return -1
    if (b.time != null) return 1
    return (b.prog?.total ?? 0) - (a.prog?.total ?? 0)
  })
}

/** Everyone gets an award: each goes to whoever did the most of it and has no award yet (children first on a tie). */
const AWARDS = [
  { title: '✈️ Sky Star', stat: (s) => s.air, min: 0.5, text: (n) => `${n.toFixed(1)}s flying` },
  { title: '🌀 Flip Wizard', stat: (s) => s.flips, text: (n) => `${n} flip${n > 1 ? 's' : ''}` },
  { title: '⭐ Star Catcher', stat: (s) => s.stars, text: (n) => `${n} star${n === 1 ? '' : 's'}` },
  { title: '🚧 Cone Crusher', stat: (s) => s.cones, text: (n) => `${n} knocked over` },
  { title: '🎁 Lucky Dip', stat: (s) => s.boxes, text: (n) => `${n} mystery box${n > 1 ? 'es' : ''}` },
]
const KIND_AWARDS = ['😇 Careful Driver', '💪 Never Gave Up', '🌈 Happy Racer', '🎉 Super Fun']
function giveAwards(rows) {
  const out = new Map()
  const statsOf = (id) => game.stats.get(id) ?? newStats()
  if (game.mode === 'race' && rows[0]?.time != null) out.set(rows[0].id, '🏆 Speed Champ')
  if (game.mode === 'smash' && rows[0]?.score > 0) out.set(rows[0].id, '💥 Smash Champ')
  for (const award of AWARDS) {
    let best = null
    let bestN = award.min ?? 0
    for (const r of rows) {
      if (out.has(r.id) || r.left) continue
      const n = award.stat(statsOf(r.id))
      if (n > bestN || (best && n === bestN && best.bot && !r.bot)) {
        best = r
        bestN = n
      }
    }
    if (best) out.set(best.id, `${award.title} · ${award.text(bestN)}`)
  }
  let k = 0
  for (const r of rows) if (!out.has(r.id) && !r.left) out.set(r.id, KIND_AWARDS[k++ % KIND_AWARDS.length])
  return out
}

function renderResults() {
  if (!game.setup || !game.track) return
  const inTown = townOn()
  $('results-title').textContent = inTown ? '📦 All delivered!' : '🏁 Finish!'
  $('again').textContent = inTown ? '🔁 Deliver again' : '🔁 Race again'
  $('podium').classList.toggle('hidden', inTown)
  $('recap').classList.toggle('hidden', !inTown)
  if (inTown) renderRecap()
  const rows = inTown ? [] : standings()
  const awards = giveAwards(rows)
  const self = game.room.selfId
  $('podium').innerHTML = rows
    .map((e, i) => {
      const car = CAR_MODELS[validModel(e.model) ? e.model : CAR_IDS[0]]
      const extra =
        game.mode === 'smash' ? `💥 ${e.score}` : e.left ? '👋 left' : e.time != null ? `${e.time.toFixed(1)}s` : e.prog?.dnf ? '🏁 almost!' : '🏎️ still racing'
      const award = awards.get(e.id)
      return `<div class="place ${e.id === self ? 'me' : ''}"><span class="medal">${MEDAL[i]}</span>
      ${carPic(validModel(e.model) ? e.model : CAR_IDS[0], 'pic podium-pic')}
      <span class="who"><span>${escapeHtml(e.emoji)} ${car.name}</span>${award ? `<span class="award">${award}</span>` : ''}</span>
      <span class="extra">${extra}<small>⭐ ${game.stats.get(e.id)?.stars ?? 0}</small></span></div>`
    })
    .join('')
  // In a race with friends, the next one starts once everyone is home.
  const canRestart = isHost() && (!game.raceOn || game.room.solo)
  $('again').classList.toggle('hidden', !canRestart)
  $('change-city').classList.toggle('hidden', !canRestart || game.raceOn)
  $('results-wait').classList.toggle('hidden', canRestart && !game.raceOn)
  updateResultsWait()
  if (!game.confetti) {
    game.confetti = true
    softFinish()
  }
}

function updateResultsWait() {
  const el = $('results-wait')
  const text = game.raceOn
    ? townOn()
      ? '🚚 Friends are still delivering…'
      : game.finaleAt
      ? `⏱️ ${Math.max(0, Math.ceil(game.finaleAt - game.raceTime))} — everyone else is finishing…`
      : '🏎️ Everyone else is finishing…'
    : 'Waiting for the host to start the next race…'
  if (el.textContent !== text) el.textContent = text
}

function endSmash() {
  if (!game.raceOn) return
  game.raceOn = false
  game.state = 'results'
  if (isHost()) send({ t: 'end', r: raceId() })
  audio.cheer()
  banner('🏁 Time to park', 1800)
  later(() => {
    renderResults()
    show('results')
  }, 1800)
}

/**
 * The one soft moment on the results screen: a dozen paper petals drift down slowly, once.
 * (It used to be 46 paper pieces plus 60 rainbow sparks.)
 */
function softFinish() {
  document.querySelector('.party')?.remove()
  if (reducedMotion.matches) return
  const party = document.createElement('div')
  party.className = 'party'
  for (let i = 0; i < 12; i++) {
    const piece = document.createElement('i')
    const fall = 5 + Math.random() * 2
    piece.style.cssText = `left:${5 + Math.random() * 90}%;background:${RAINBOW[i % RAINBOW.length]};animation-duration:${fall}s;animation-delay:${Math.random() * 1.2}s;--dx:${(Math.random() - 0.5) * 80}px;--spin:${(Math.random() - 0.5) * 360}deg`
    party.append(piece)
  }
  document.body.append(party)
  setTimeout(() => party.remove(), 9000)
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
    // Delivery Town: the car rests at a doorstep while a parcel is handed over.
    if (townOn() && game.townHold > game.raceTime) return (car.controls = PARKED)
    const controls = input.read()
    if (!input.easyGas) return (car.controls = govern(car, controls))
    const gentle = { ...controls, steer: rampSteer(car, controls.steer, dt) * fastSteer(car) }
    car.controls = govern(car, backOut(car, steeringHelper(car, controls.cruise ? cruise(car, gentle) : gentle), dt))
  },
}
const PARKED = { steer: 0, throttle: 0, brake: 1, hold: true }

/** Delivery Town: never faster than a gentle town speed, even holding 🚀. */
function govern(car, controls) {
  if (!townOn() || car.speed <= TOWN_TOP_SPEED) return controls
  return { ...controls, throttle: 0, brake: car.speed > TOWN_TOP_SPEED + 2 ? 0.4 : 0 }
}

/**
 * Which way round the loop the car is pointing: 1 forwards, -1 backwards. Only
 * Delivery Town lets a child turn round, so racing is always forwards.
 */
const NOSE_AXIS = new CANNON.Vec3(0, 0, -1)
const noseScratch = new CANNON.Vec3()
function travelDir(car, proj) {
  if (!townOn() || !proj) return 1
  const t = game.track.sampleAt(proj.dist).t
  const nose = car.body.quaternion.vmult(NOSE_AXIS, noseScratch)
  return nose.x * t.x + nose.z * t.z >= 0 ? 1 : -1
}

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
/**
 * Easy mode: a car nosed into a wall (or a terrace, a tent, a parked tram)
 * backs out by itself, turning towards the road, and drives on, instead of
 * pushing at the wall until it's put back on the road.
 */
function backOut(car, controls, dt) {
  if (car.backOut > 0) {
    car.backOut -= dt
    const proj = game.progress.get(car.id)?.proj
    const s = proj && game.track.sampleAt(proj.dist + 10 * travelDir(car, proj))
    // Reversing, the wheel turns the other way: steer away from the road to swing the nose towards it.
    const toRoad = s ? Math.sign(car.angleTo(s.p.x, s.p.z)) : 0
    // A firmer reverse than the 🐢 pedal's, so the car really swings round.
    return { steer: -toRoad, throttle: 0, brake: 2.5, cruise: false }
  }
  const pushing = controls.throttle > 0 && !controls.brake && car.forwardSpeed < 1.2 && car.grounded && !car.upsideDownTime
  car.wedged = pushing ? (car.wedged ?? 0) + dt : 0
  if (car.wedged > WEDGED_SECONDS) {
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
  if (townOn()) {
    // A steady town pace, slower round bends and slower still beside a house still waiting, so its sign can be read.
    const nearHouse = town.houses.some((h, i) => !town.order.includes(i) && Math.hypot(h.x - car.body.position.x, h.z - car.body.position.z) < 26)
    const target = clamp(TOWN_TOP_SPEED - game.track.bendAt(proj.dist, 25) * 25, 7, nearHouse ? 8 : TOWN_TOP_SPEED)
    if (car.speed > target + 1.5) return { ...controls, throttle: 0, brake: 0.25 }
    return { ...controls, throttle: car.speed < target ? 0.8 : 0.25 }
  }
  const bend = game.track.bendAhead(proj.dist, game.track.lookAhead(car.speed))
  // Calm pass: a noticeably gentler cruise (was up to 30 m/s, about 108 km/h). Holding 🚀 still means full speed.
  const target = clamp(19 - bend * 35, 10, 19)
  if (car.speed > target + 3) return { ...controls, throttle: 0, brake: 0.3 }
  return { ...controls, throttle: car.speed < target ? 1 : 0.3 }
}

/** A computer driver; in Smash mode it hunts the nearest car. */
function botController(bot) {
  return {
    update(car, dt) {
      const proj = projOf(car)
      if (game.mode === 'smash') bot.update(dt, proj, Bot.nearest(car, game.cars.values()))
      else bot.update(dt, proj, null, leadOverLastHuman(car), game.cars.values())
    },
  }
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
      else if (game.progress.get(car.id)?.finished) townOn() ? (car.controls = BRAKE) : pullOver(car)
      else car.controller.update(car, dt)
    }
    car.drive(dt)
  }
  world.step(dt)
  for (const car of game.cars.values()) if (!car.remote) car.afterStep(dt)
}

/**
 * Easy mode's steering helper: leans the wheel towards the road ahead, less so
 * the more the child is steering themselves. It never fights a deliberate turn.
 */
function steeringHelper(car, controls) {
  const proj = game.progress.get(car.id)?.proj
  if (!proj) return controls
  const target = game.track.sampleAt(proj.dist + (8 + car.speed * 0.6) * travelDir(car, proj))
  const help = clamp(car.angleTo(target.p.x, target.p.z) * 1.6, -0.8, 0.8) * (1 - Math.abs(controls.steer) * 0.7)
  return { ...controls, steer: clamp(controls.steer + help, -1, 1) }
}

/** Everything that follows the physics: visuals, damage, progress and effects. Shared by the frame loop and sim(). */
function tick(dt, realDt) {
  if (game.raceOn) {
    game.raceTime += dt
    if (game.mode === 'smash' && game.raceTime >= SMASH_SECONDS) endSmash()
    else if (game.finaleAt && game.raceTime >= game.finaleAt) endRace()
  }
  game.fixCooldown = Math.max(0, game.fixCooldown - realDt)
  game.resetCooldown = Math.max(0, game.resetCooldown - realDt)
  for (const [id, car] of game.cars) {
    car.syncVisual(dt)
    car.damage.update(dt, car.accel)
    updateProgress(id, car)
    if (car.turboActive) exhaustFlames(car)
    if (car.ghost > 0) ghostTick(car, realDt)
    if (car.remote) continue
    const proj = game.progress.get(id)?.proj
    stunts(car, proj)
    if (game.raceOn && proj) pickups.collect(car, proj, game.raceTime, PICKUP_HANDLERS)
  }
  pickups.update(dt, game.room.selfId, game.raceTime)
  debris.update(dt)
  game.track.update(dt)
  if (game.raceOn && deliveryOn() && game.player) delivery.update(game.player.body.position, Math.max(8, game.track.width * 0.6))
  if (townOn() && game.raceOn && game.player && !game.progress.get(game.player.id)?.finished) {
    hopRampBackwards(game.player)
    town.record(game.player.body.position)
    // Noticed a few metres early, so the car comes to rest with the house still in view.
    const at = town.arrive(game.player.body.position, game.track.width / 2 + 9)
    if (at >= 0) townArrive(at)
  }
  town.update(dt)
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
  if (player && sparkTimer <= 0 && player.speed >= 5 && !townOn()) {
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
    camPos.lerp(want.applyQuaternion(headingQ).add(pos), smoothing(mode.stiffness, dt))
    want.copy(mode.look)
    if (tall) want.z *= 1.6
    camLook.lerp(want.applyQuaternion(headingQ).add(pos), smoothing(12, dt))
  }
  camera.position.copy(camPos)
  if (effects.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * effects.shake
    camera.position.y += (Math.random() - 0.5) * effects.shake
  }
  camera.lookAt(camLook)
  camera.fov = damp(camera.fov, (camera.aspect < 1 ? 75 : 62) + clamp(p.speed - 15, 0, 20) * 0.5, 3, dt)
  camera.updateProjectionMatrix()
  // Trees between the camera and the car thin out (see cities.js).
  seeThrough.camera.value.copy(camera.position)
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

let placeUpdatedAt = 0
function updateHud(now) {
  const p = game.player
  if (!p || !game.setup) return
  // Standings sort every car, so only a few times a second.
  if (now - placeUpdatedAt > 200) {
    placeUpdatedAt = now
    const place = standings().findIndex((e) => e.id === p.id)
    setText('position', `${MEDAL[place]} ${ORDINAL[place]}`)
    if (game.state === 'results') updateResultsWait()
  }
  const prog = game.progress.get(p.id)
  setText('lap', `Lap ${Math.min(game.laps, (prog?.lap ?? 0) + 1)}/${game.laps}`)
  setText('stars', `⭐ ${game.stats.get(p.id)?.stars ?? 0}`)
  if (game.mode === 'smash') {
    setText('crashes', `💥 ${game.scores.get(p.id) ?? 0}`)
    const left = Math.max(0, SMASH_SECONDS - game.raceTime)
    setText('timer', `⏱️ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`)
  } else setText('crashes', `💥 ${game.stats.get(p.id)?.crashes ?? 0}`)
  setCooldown($('turbo-btn'), (p.turboCooldown - now) / TURBO_COOLDOWN)
  setCooldown($('fix-btn'), game.fixCooldown / FIX_COOLDOWN)
  // A battered car (or one missing a wheel): 🔧 stays highlighted until it's tapped.
  const broken = game.fixCooldown <= 0 && (p.damage.level > 0.45 || p.wheels.some((w) => w.state === 'gone'))
  if (shown.get('broken') !== broken) {
    shown.set('broken', broken)
    $('fix-btn').classList.toggle('needed', broken)
  }
  setCooldown($('reset-btn'), game.resetCooldown / RESET_COOLDOWN)
  // The finale: a big countdown for whoever is still racing.
  const finale = game.raceOn && game.finaleAt && game.state === 'race'
  $('finale').classList.toggle('hidden', !finale)
  if (finale) {
    const left = Math.max(0, Math.ceil(game.finaleAt - game.raceTime))
    setText('finale', `🏁 ${left}`)
  }
  setText('speed', String(Math.round(p.speed * 3.6)))
  drawMinimap()
}

/** The track outline is drawn once per city; each frame only the car dots are drawn on top. */
let minimap = null
/** Delivery Town's paper map (road, houses, ticks) is redrawn only when a parcel is chosen or delivered. */
let townMap = null
const headingScratch = new CANNON.Vec3()
function drawMinimap() {
  const t = game.track
  if (townOn()) {
    // Delivery Town: a big paper map with every house as its picture and the van as an arrow.
    const canvas = $('minimap')
    const size = canvas.width
    const { houses, chosen, order } = town
    if (townMap?.track !== t || townMap.houses !== houses || townMap.size !== size || townMap.chosen !== chosen || townMap.delivered !== order.length) {
      const background = document.createElement('canvas')
      background.width = background.height = size
      const layout = townMapLayout(size, t, houses)
      drawTownMap(background.getContext('2d'), size, t, houses, { chosen, order, layout })
      townMap = { track: t, houses, size, chosen, delivered: order.length, layout, background, g: canvas.getContext('2d') }
    }
    const { g, layout } = townMap
    const p = game.player
    const nose = p.body.quaternion.vmult(NOSE_AXIS, headingScratch)
    g.clearRect(0, 0, size, size)
    g.drawImage(townMap.background, 0, 0)
    drawMapCar(g, size, layout, { x: p.body.position.x, z: p.body.position.z, colour: p.colour }, { x: nose.x, z: nose.z })
    return
  }
  if (minimap?.track !== t) {
    const xs = t.samples.map((s) => s.p.x), zs = t.samples.map((s) => s.p.z)
    const minX = Math.min(...xs), minZ = Math.min(...zs)
    const scale = 120 / Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ)
    const outline = new Path2D()
    t.samples.forEach((s, i) => outline[i ? 'lineTo' : 'moveTo'](20 + (s.p.x - minX) * scale, 20 + (s.p.z - minZ) * scale))
    outline.closePath()
    const background = document.createElement('canvas')
    background.width = background.height = 160
    const bg = background.getContext('2d')
    bg.lineJoin = 'round'
    // A dark edge under the white road, so it reads over bright scenery too.
    bg.strokeStyle = 'rgba(30,30,50,0.55)'
    bg.lineWidth = 11
    bg.stroke(outline)
    bg.strokeStyle = 'rgba(255,255,255,0.92)'
    bg.lineWidth = 6
    bg.stroke(outline)
    minimap = { track: t, minX, minZ, scale, background, g: $('minimap').getContext('2d') }
  }
  const { g, minX, minZ, scale } = minimap
  g.clearRect(0, 0, 160, 160)
  g.drawImage(minimap.background, 0, 0)
  if (deliveryOn()) {
    // The stops still to visit, numbered, with the next one highlighted.
    g.font = 'bold 14px system-ui'
    g.textAlign = 'center'
    delivery.points.forEach((point, i) => {
      if (i < delivery.next) return
      const x = 20 + (point.x - minX) * scale, y = 20 + (point.z - minZ) * scale
      g.beginPath()
      g.arc(x, y, 11, 0, Math.PI * 2)
      g.fillStyle = i === delivery.next ? '#ffe1a2' : '#bca3df'
      g.fill()
      g.fillStyle = '#34334d'
      g.fillText(String(i + 1), x, y + 5)
    })
  }
  // Each car is a dot in its own colour (the colour of its name tag). Everyone else
  // first, so the child's own dot, bigger and ringed in white, is always on top.
  g.strokeStyle = '#2b2d42'
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

function frame(now) {
  delivery.show(game.state === 'race' && deliveryOn())
  town.show(townOn() && ['race', 'results', 'syncing', 'countdown'].includes(game.state))
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
    audio.updateEngine(game.player.speed, game.player.controls.throttle)
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
    endRace, standings, giveAwards, renderResults, Car, env,
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
      scores: Object.fromEntries(game.scores),
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
  window.__adventure = { mission: adventure, game, delivery }
  window.__town = { town, game, chooseParcel, finishTown, act }
}

boot()
