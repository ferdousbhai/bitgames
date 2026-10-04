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
import { HALF_D, HALF_W, PaintMap, RAINBOW, SEAT_COLORS } from './paint.js'
import { ANIMALS, ANIMAL_IDS, COLLIDE_AHEAD, COLLIDE_R, MAX_SPEED, Painter, newStats } from './painter.js'
import { clamp, damp, easeInOut, escapeHtml, store } from './util.js'

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
/** Seats start in the four corners, facing the middle. Seat 0 is nearest the camera on the left. */
const START = [[-11, 6.5], [11, 6.5], [-11, -6.5], [11, -6.5]]
const AWARDS = [
  ['🎨', 'Most paint!', (s) => s.pct],
  ['💥', 'Most splashes!', (s) => s.splash],
  ['🌀', 'Biggest swirl!', (s) => s.swirl],
  ['🌈', 'Rainbow roller!', (s) => s.rainbow],
  ['🔄', 'Colour swapper!', (s) => s.swap],
  ['💧', 'Splish splash!', (s) => s.water],
  ['🏃', 'Speedy roller!', (s) => s.dist],
]
const EXTRA_AWARDS = [['🌟', 'Super painter!'], ['😊', 'Happy helper!'], ['✨', 'Sparkly artist!'], ['🖌️', 'Busy brush!']]

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
const QUALITY_PIXELS = [0.7, 1, Math.min(devicePixelRatio, 2)]
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
  lastTick: 0,
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
  touched: false,
  build: 0,
}

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
    updateToggles()
  }
  $('voice').onclick = () => say()
  updateToggles()
  input.on('key', (k) => {
    audio.unlock()
    if (k === ' ' && game.state === 'play') say()
    if (k === 'escape') goHome()
  })
  input.on('touch', () => {
    audio.unlock()
    game.touched = true
    $('hint').classList.add('hidden')
  })
  addEventListener('pointerdown', () => audio.unlock())
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))
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

const ROUND_MESSAGES = new Set(['s', 'e', 'item', 'grab', 'gone', 'ready', 'go', 'end', 'stats', 'final', 'say'])

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
        p.setTarget(snap[1] / 100, snap[2] / 100, snap[3] / 100, snap[4] / 100, !!(snap[5] & 1))
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
    case 'stats':
      if (!isHost()) return
      for (const [seat, s] of Array.isArray(msg.list) ? msg.list : []) if (s && typeof s === 'object') game.stats.set(seat, cleanStats(s))
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
  for (let seat = entries.length; seat < 4; seat++) entries.push({ id: `bot${seat}`, seat, animal: free.shift() ?? ANIMAL_IDS[seat], bot: true })
  const setup = { t: 'setup', r: 1 + Math.floor(Math.random() * 1e9), place: game.place, seconds: ROUND_SECONDS, entries, host: game.room.selfId }
  game.ready = new Set()
  send(setup)
  startRound(setup)
}

/** Clears the last round away (paint, painters, pickups, timers). */
function stopRound() {
  clearTimers()
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
  input.enabled = false
  input.release()
  audio.roll(0)
  meMarker.visible = false
  $('countdown').classList.add('hidden')
  $('hint').classList.add('hidden')
}

async function startRound(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length) return
  stopRound()
  game.setup = setup
  game.setup.seconds = clamp(Number(setup.seconds) || ROUND_SECONDS, 10, 180)
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
  if (game.me) {
    meMarker.userData.mat.color.set(game.me.color)
    meMarker.userData.mat.emissive.set(game.me.color)
  }
  game.itemWait = { bucket: 1.5, rainbow: 9, water: 4 }
  game.lastStrokeAt = 0
  game.roundStart = now()
  placeCamera(true)
  updateBar()
  $('timer').textContent = `⏱️ ${game.setup.seconds}`
  $('timer').classList.remove('hurry')
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
  const steps = ['3', '2', '1', '🎨 GO!']
  steps.forEach((text, i) => {
    later(() => {
      el.textContent = text
      el.className = 'countdown'
      void el.offsetWidth
      el.classList.add('pop')
      audio.beep(i === steps.length - 1)
      if (i === steps.length - 1) startPainting()
    }, i * 800)
  })
}

function startPainting() {
  game.state = 'play'
  game.roundStart = now()
  game.lastStrokeAt = 0
  for (const p of game.painters.values()) p.strokeFrom = p.rollerAt()
  input.enabled = true
  show(null)
  later(() => $('countdown').classList.add('hidden'), 700)
  if (!game.touched) {
    $('hint').classList.remove('hidden')
    later(() => $('hint').classList.add('hidden'), 4500)
  }
}

/** The time is up: everyone stops and the camera swoops up to look at the picture. */
function endRound() {
  if (game.state !== 'play') return
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
    send({ t: 'stats', r: roundId(), list: mine.map((p) => [p.seat, p.stats]) })
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
    audio.fanfare()
    effects.party([...SEAT_COLORS, ...RAINBOW], 220)
    if (game.final) showResults()
  }, REVEAL_MS)
}

function computeFinal() {
  const shares = paint.shares()
  const rows = game.setup.entries.map((e) => {
    const s = game.stats.get(e.seat) ?? newStats()
    return { seat: e.seat, pct: Math.round(shares[e.seat] * 100), stats: { ...s, pct: shares[e.seat] } }
  })
  // Everyone gets an award: each goes to the best painter who doesn't have one yet.
  const given = new Map()
  for (const [emoji, text, score] of AWARDS) {
    let best = null
    for (const r of rows) {
      if (given.has(r.seat) || !(score(r.stats) > 0)) continue
      if (!best || score(r.stats) > score(best.stats)) best = r
    }
    if (best) given.set(best.seat, [emoji, text])
  }
  let extra = 0
  for (const r of rows) if (!given.has(r.seat)) given.set(r.seat, EXTRA_AWARDS[extra++ % EXTRA_AWARDS.length])
  const total = Math.round((1 - paint.counts[0] / paint.paintable) * 100)
  return { t: 'final', r: roundId(), total, rows: rows.map((r) => ({ seat: r.seat, pct: r.pct, award: given.get(r.seat) })) }
}

function sendFinal() {
  if (!isHost() || !['reveal', 'results'].includes(game.state)) return
  game.final = computeFinal()
  send(game.final)
  if (game.state === 'reveal' && now() - game.revealAt > REVEAL_MS) showResults()
}

function showResults() {
  if (game.state !== 'reveal' && game.state !== 'results') return
  game.state = 'results'
  show(null)
  renderResults()
}

function renderResults() {
  const final = game.final
  if (!final) return
  const self = game.room.selfId
  $('together').textContent = `🤝 Together: ${clamp(final.total | 0, 0, 100)}% painted!`
  $('cards').innerHTML = final.rows
    .map((row, i) => {
      const entry = game.setup.entries.find((e) => e.seat === row.seat)
      if (!entry) return ''
      const award = Array.isArray(row.award) ? row.award : EXTRA_AWARDS[0]
      const animal = validAnimal(entry.animal) ? ANIMALS[entry.animal].emoji : '🙂'
      return `<div class="card${entry.id === self ? ' me' : ''}" style="--c:${SEAT_COLORS[row.seat] ?? '#999'}; animation-delay:${0.15 * i}s">
        <span class="who">${animal}${entry.bot ? '<small>🤖</small>' : ''}${entry.id === self ? '<small>⭐</small>' : ''}</span>
        <span class="pct">${clamp(row.pct | 0, 0, 100)}%</span>
        <span class="award"><b>${escapeHtml(award[0])}</b> ${escapeHtml(award[1])}</span></div>`
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
  for (const [kind, def] of Object.entries(ITEM_KINDS)) {
    if (items.count(kind) >= def.max) continue
    game.itemWait[kind] -= dt
    if (game.itemWait[kind] > 0) continue
    const spot = freeSpot()
    if (!spot) continue
    game.itemWait[kind] = kind === 'rainbow' ? 9 + Math.random() * 6 : 2.5 + Math.random() * 3.5
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
  if (!it || game.state !== 'play' || !paintersBySeat()[seat]) return
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
    emit([1, p.seat, t, q(p.x + Math.sin(p.yaw) * 0.6), q(p.z + Math.cos(p.yaw) * 0.6), seed])
    if (p === game.me) banner('💥 SPLASH!')
  } else if (kind === 'water') {
    p.stats.water++
    emit([2, p.seat, t, q(x), q(z), seed])
    if (p === game.me) banner('💧 Splish splash!')
  } else if (kind === 'rainbow') {
    p.rainbowUntil = now() + RAINBOW_MS
    if (p === game.me) banner('🌈 Rainbow!')
  }
}

// --- Paint events -------------------------------------------------------------------------------

const q = (v) => Math.round(v * 100)

/** Applies a paint event here and queues it for everyone else. */
function emit(e) {
  const swaps = applyEvent(e)
  game.outbox.push(e)
  return swaps
}

/**
 * Paint events: [0 stroke, seat, t, x0, z0, x1, z1, rainbow] [1 splat, seat, t, x, z, seed]
 * [2 wash, seat, t, x, z, seed], positions in cm. Every device applies the same list.
 */
function applyEvent(e) {
  const [kind, seat, t] = e
  if (!(seat >= 0 && seat < 4) || !Number.isInteger(t) || t < 1 || !e.slice(3, kind === 0 ? 7 : 6).every(Number.isFinite)) return 0
  const x = e[3] / 100, z = e[4] / 100
  if (kind === 0) return paint.stroke(t, seat, x, z, e[5] / 100, e[6] / 100, !!e[7])
  const near = game.me ? clamp(1 - Math.hypot(game.me.x - x, game.me.z - z) / 30, 0.3, 1) : 1
  if (kind === 1) {
    const swaps = paint.splat(t, seat, x, z, e[5] >>> 0)
    if (game.state === 'play') {
      effects.splash(x, z, SEAT_COLORS[seat], 60, 1.2)
      audio.splash(near)
    }
    return swaps
  }
  if (kind === 2) {
    paint.wash(t, x, z, e[5] >>> 0)
    if (game.state === 'play') {
      effects.splash(x, z, '#7cc8ff', 45, 0.9)
      effects.splash(x, z, '#ffffff', 15, 0.7)
      audio.water(near)
    }
  }
  return 0
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
    const e = [0, p.seat, t, q(from.x), q(from.z), q(r.x), q(r.z), p.rainbow ? 1 : 0]
    p.stats.swap += emit(e)
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
    const v = input.read()
    game.me.controls = { x: v.x, z: v.y }
  }
  const world = { paint, items, obstacles: game.arena.obstacles, painters: [...game.painters.values()] }
  if (playing) for (const bot of game.bots) if (bot.p.local && game.painters.has(bot.p.id)) bot.update(dt, world)
  for (const p of game.painters.values()) {
    if (p.local) {
      if (playing) {
        p.drive(dt, p.bot ? 0.8 : 1)
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
    if (p.speed > 1 && Math.random() < dt * 6) {
      const r = p.rollerAt()
      effects.drip(r.x, r.z, p.rainbow ? RAINBOW[Math.floor(Math.random() * 6)] : p.color)
    }
    if (p.rainbow && Math.random() < dt * 10) effects.sparkle(p.x, 1.2, p.z, RAINBOW[Math.floor(Math.random() * 6)], 1, 1.6)
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

/** Follow view: from above and behind (south), never turning, so up on the screen is always the same way. */
function followTarget(pos, look) {
  const me = game.me
  const aspect = innerWidth / innerHeight
  const k = aspect < 0.8 ? 1.55 : aspect < 1.3 ? 1.25 : 1
  const tx = clamp(me?.x ?? 0, -HALF_W + 7 * Math.min(aspect, 1.6) / 1.6, HALF_W - 7 * Math.min(aspect, 1.6) / 1.6)
  const tz = clamp(me?.z ?? 0, -HALF_D + 3, HALF_D - 4)
  look.set(tx, 0, tz)
  pos.set(tx, 15 * k, tz + 11.5 * k)
}

/** Top view that fits the whole picture between the title and the cards. */
function revealTarget(pos, look) {
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const shown = game.state === 'results'
  const top = shown ? $('together').getBoundingClientRect().bottom + 8 : innerHeight * 0.16
  const bottom = shown ? $('cards').getBoundingClientRect().top - 8 : innerHeight * 0.62
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

function banner(text, ms = 1300) {
  const el = $('banner')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(banner.timer)
  banner.timer = setTimeout(() => el.classList.remove('show'), ms)
}

function updateBar() {
  const shares = paint.shares()
  $('bar').innerHTML = shares.map((s, i) => `<i style="width:${(s * 100).toFixed(1)}%;background:${SEAT_COLORS[i]}"></i>`).join('')
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
  const left = Math.max(0, Math.ceil(game.setup.seconds - (t - game.roundStart) / 1000))
  $('timer').textContent = `⏱️ ${left}`
  $('timer').classList.toggle('hurry', left <= 10)
  if (left <= 10 && left > 0 && left !== game.lastTick) {
    game.lastTick = left
    audio.tick()
  }
}

// --- Loop ------------------------------------------------------------------------------------------

/** One step of the game: everything but drawing. */
function step(dt, realDt, t) {
  const inRound = ['syncing', 'countdown', 'play', 'reveal', 'results'].includes(game.state) && game.arena
  if (inRound) {
    updatePainters(dt, t)
    if (game.state === 'play') {
      if (isHost()) hostItems(dt)
      const elapsed = (t - game.roundStart) / 1000
      if (isHost() && elapsed >= game.setup.seconds) endRound()
      else if (!isHost() && elapsed >= game.setup.seconds + 3) endRound()
    }
    items.update(dt, t)
    updateCamera(realDt, t)
    updateHud(t)
    if (game.me && (game.state === 'play' || game.state === 'countdown' || game.state === 'syncing')) {
      meMarker.visible = true
      meMarker.position.set(game.me.x, 2.6 + Math.abs(Math.sin(t / 250)) * 0.35, game.me.z)
      meMarker.rotation.y = t / 500
    } else meMarker.visible = false
    if (game.arena.sails) game.arena.sails.rotation.z = -t / 900
    if (!game.room.solo) {
      if (t - game.lastSnap > SNAP_MS && ['play', 'countdown', 'reveal'].includes(game.state)) {
        game.lastSnap = t
        const p = [...game.painters.values()].filter((x) => x.local).map((x) => [x.seat, q(x.x), q(x.z), q(x.yaw), q(x.speed), x.rainbow ? 1 : 0])
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
    paint.upload()
    if (game.state === 'play') measureQuality(realDt, t)
  }
  audio.updateMusic(game.state !== 'loading', game.state === 'play' && game.setup && (t - game.roundStart) / 1000 > game.setup.seconds - 10)
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
    game, paint, items, audio, effects, camera, renderer, scene, THREE,
    end: () => (isHost() ? endRound() : null),
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
      shares: paint.shares().map((s) => +(s * 100).toFixed(1)),
      counts: [...paint.counts],
      items: [...items.values()].map((i) => `${i.kind}@${i.x.toFixed(1)},${i.z.toFixed(1)}`),
      painters: [...game.painters.values()].map((p) => ({ seat: p.seat, animal: p.animal, local: p.local, x: +p.x.toFixed(2), z: +p.z.toFixed(2) })),
      final: game.final,
    }),
    /** Runs `seconds` of game time right away (tabs in the background get no frames). */
    sim(seconds, fps = 30) {
      for (let i = Math.round(seconds * fps); i > 0; i--) {
        clockSkew += 1000 / fps
        last = now()
        step(1 / fps, 1 / fps, now())
      }
      paint.upload()
      renderer.render(scene, camera)
      return this.state()
    },
    /** A checksum of the picture, to compare devices. */
    hash() {
      let h = 0
      for (let i = 0; i < paint.color.length; i++) h = (h * 31 + paint.color[i]) | 0
      return h
    },
  }
}

boot()
