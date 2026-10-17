import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { Sim, newStats, GEYSER_WARN } from './sim.js'
import { DuckView, ItemView, ObstacleView, Rain, skyTexture } from './view.js'
import { makeWater } from './water.js'
import {
  R, ROUND_TIME, MAX_PLAYERS, DUCKS, DUCK_IDS, ARENAS, ARENA_IDS, POWERS, PLAYER_EMOJI, SURPRISES, SURPRISE_IDS,
  validDuck, validArena, escapeHtml, clamp,
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

/** Frame the whole pond: steeper from above on an upright screen, lower and wider when sideways. */
const camTarget = new THREE.Vector3()
const camBase = new THREE.Vector3()
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
  const top = clamp(1 - (2 * (sideHud ? 6 : innerWidth < 421 ? 150 : 124)) / innerHeight, 0.4, 0.97)
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
  // between the top bar and the bottom, instead of leaving the floor showing below it.
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

function resize() {
  const w = innerWidth
  const h = innerHeight
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
  partyShown: false,
  hinted: false,
  roundsPlayed: 0,
  me: null,
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
function clearTimers() {
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
        $('loading-text').textContent = '🫧'.repeat(++done)
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
    // (Front left, well away from the 🏠 in the top-left corner.)
    u.position.set(-14.5, 0.4, 5)
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
  // Sound and music stay off the screen during a round, so a mashing hand can't switch them off (M still works).
  for (const id of ['music', 'sound']) $(id).classList.toggle('hidden', inRound)
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
  // Playing alone: no chip of who's here (it would only ever show one).
  $('players').classList.toggle('hidden', !!game.room?.solo)
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
  $('go').onclick = () => {
    audio.unlock()
    audio.click()
    hostStartRound()
  }
  $('again').onclick = (e) => {
    // (A tap counts only when its press began after the guard; a key press is checked where it is read.)
    if (e.detail && !freshPress()) return
    audio.click()
    askAgain()
  }
  $('change').onclick = (e) => {
    if (!isHost() || (e.detail && !freshPress())) return
    audio.click()
    send({ t: 'menu' })
    enterLobbyScreen()
  }
}

/** Again! The host starts the next splash at once; a friend's tap asks the host's device to. */
/**
 * The results stay up for a moment before 🔁 or 🗺️ (or Enter) count, and only a fresh press that
 * started after they appeared does: a child dashing (Space) or dragging as the round ends never skips them.
 */
const RESULTS_GUARD = 1500
const resultsReady = (at = performance.now()) => game.state === 'results' && at - (game.resultsAt ?? 0) >= RESULTS_GUARD
for (const id of ['again', 'change']) $(id).addEventListener('pointerdown', () => (game.pressAt = performance.now()), true)
const freshPress = () => resultsReady(game.pressAt ?? 0)

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
  clearRound()
  if (game.assetsReady) buildArena(game.arena)
  $('countdown').classList.add('hidden')
  if (isHost()) show('menu')
  else {
    setWaitingText('⏳')
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
  game.bots.set(id, new Bot(d, 0.5, game.bots.size + 2))
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
      if (from === game.hostId && game.state === 'waiting') setWaitingText('💦⏳')
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
      break
    }
    case 'in': {
      if (!isHost() || !game.sim) return
      const d = game.sim.byId.get(from)
      if (!d) return
      d.ix = clamp(Number(msg.x) || 0, -1, 1)
      d.iz = clamp(Number(msg.z) || 0, -1, 1)
      if (msg.m) d.mashT = game.sim.time + 2
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
  // The surprises take turns (remembered between visits), so each splash brings a different one.
  // (A new device starts the turns at a random one.)
  const last = load('surprise')
  const turn = last == null ? Math.floor(Math.random() * SURPRISE_IDS.length) : ((Math.floor(Number(last)) || 0) + 1) % SURPRISE_IDS.length
  save('surprise', String(turn))
  const setup = { t: 'setup', arena: game.arena, seed, entries, host: game.room.selfId, surprise: SURPRISE_IDS[turn] }
  game.ready = new Set()
  send(setup)
  startRound(setup)
}

function startRound(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length || !validArena(setup.arena)) return
  clearTimers()
  clearRound()
  game.setup = setup
  game.arena = setup.arena
  game.results = null
  game.partyShown = false
  game.run = 0
  game.lastSteer = 0
  game.idleHinted = false
  game.kidHist = []
  game.childActive = 0
  game.lastZzz = -9
  const entries = setup.entries.slice(0, MAX_PLAYERS).map((e) => ({ ...e, duck: validDuck(e.duck) ? e.duck : 'sunny', emoji: String(e.emoji ?? '🙂').slice(0, 8) }))
  setup.entries = entries
  if (!entries.some((e) => e.id === game.room.selfId)) {
    game.setup = null
    game.state = 'waiting'
    setWaitingText('💦⏳')
    show('waiting')
    renderPlayers()
    return
  }
  buildArena(setup.arena)
  const sim = new Sim({ arena: setup.arena, entries, surprise: setup.surprise })
  game.sim = sim
  showObstacles(sim)
  entries.forEach((e) => {
    const me = e.id === game.room.selfId
    const v = new DuckView(game.models, e, { me, tint: Number(e.tint) || 0 })
    scene.add(v.root)
    game.views.set(e.id, v)
    if (me) game.me = sim.byId.get(e.id)
  })
  if (isHost()) entries.forEach((e, i) => e.bot && game.bots.set(e.id, new Bot(sim.byId.get(e.id), 0.32 + i * 0.04, i + 1)))
  renderScores()
  updateHud()
  game.state = 'syncing'
  show(null)
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
  const el = $('countdown')
  // The last beat shows this round's surprise: ⛲, 🐥 or 🫧.
  const steps = ['🐥🐥🐥', '🐥🐥', '🐥', SURPRISES[game.sim?.surprise]?.emoji ?? '💦']
  steps.forEach((s, i) =>
    later(() => {
      el.textContent = s
      el.className = 'countdown'
      void el.offsetWidth
      // (The surprise on the last beat is smaller and quick, so it never hides the pond once play starts.)
      el.className = i === 3 ? 'countdown tick go' : 'countdown tick'
      audio.beep(i === 3)
      // Your own duck hops on each beat, so a child spots which one is theirs.
      game.views.get(game.room.selfId)?.hello()
      if (i === 3) {
        game.state = 'play'
        audio.squeak(1.1)
        showHint()
        later(() => el.classList.add('hidden'), 320)
      }
    }, i * 800),
  )
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
 * A child who has not paddled for 10 s (or not at all, 3 s into a round) sees the steering hint once a
 * round, quietly (resting is fine, and the robots nap too).
 */
function idleHint() {
  const sim = game.sim
  if (game.state !== 'play' || !game.me || !sim || game.idleHinted) return
  // (A child who hasn't paddled at all yet this round gets it after 3 s, on every round.)
  if (sim.time - (game.lastSteer ?? 0) < (game.lastSteer ? 10 : 3)) return
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
    send({ t: 'end', r: roundId(), scores: game.sim.ducks.map((d) => d.score), stats: game.sim.ducks.map((d) => d.stats) })
  }
  for (const d of game.sim.ducks) d.ix = d.iz = 0
  // Calm pass: one soft moment (a gentle chord and a few slow stars), no alarm banner or confetti burst.
  audio.cheer()
  banner('🎉', 1600, true)
  later(() => {
    game.state = 'results'
    game.resultsAt = performance.now()
    renderResults()
    show('results')
    effects.confetti(R, 48)
    audio.fanfare()
  }, 1700)
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
    setWaitingText('⏳')
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

function playEvent(e) {
  const sim = game.sim
  if (!sim) return
  const meId = game.room.selfId
  const mine = e.id === meId
  switch (e.k) {
    case 'item':
      addItemView({ id: e.item, k: e.kind, x: e.x, z: e.z })
      if (e.kind !== 'bubble') audio.plop()
      water.ripple(e.x, e.z, e.kind === 'big' ? 1 : 0.3)
      if (e.from != null) {
        // A bump shook a bubble loose: it pops out with a little splash and a twinkle.
        effects.splash(e.x, e.z, 0.35)
        effects.sparkle(e.x, 1, e.z, '#c9f1ff', 6)
        audio.bubble(3)
      }
      break
    case 'got': {
      const v = game.items.get(e.item)
      const y = v ? v.body.position.y : 0.8
      removeItemView(e.item)
      const d = posOf(e.id)
      if (e.kind === 'big') {
        // The giant bubble bursts: a big splash, a sparkle ring and a happy run of notes.
        effects.pop(e.x, y, e.z)
        effects.splash(e.x, e.z, 1.1, '#e3f7ff')
        effects.sparkle(e.x, 1.6, e.z, '#ffffff', 16)
        water.ripple(e.x, e.z, 2)
        audio.splash(0.7)
        for (let i = 0; i < 5; i++) audio.bubble(i, i * 0.07)
        game.views.get(e.id)?.bonked(6)
      } else if (e.kind === 'bubble') {
        effects.pop(e.x, y, e.z)
        if (mine) {
          const now = performance.now() / 1000
          // A run of bubbles walks up and down a five-note scale instead of climbing like a combo.
          game.run = now - game.lastBubble < 1.6 ? game.run + 1 : 0
          game.lastBubble = now
          audio.bubble(game.run % 5)
        } else if (Math.random() < 0.5) audio.bubble(0)
      } else if (e.kind === 'chick') {
        // A duckling joins the line behind the duck that caught it.
        game.views.get(e.id)?.addChick()
        effects.sparkle(e.x, 1, e.z, '#ffe680', 10)
        audio.squeak(1.7)
        audio.squeak(1.9, 0.12)
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
      // Your own catch flies up from your duck into your score pill; everyone else's pill just bumps.
      const pick = { bubble: '🫧', big: '🫧', star: '⭐', chick: '🐥' }[e.kind]
      if (mine && pick && d) flyToScore(pick, d.x, d.z)
      else bumpScore(e.id)
      break
    }
    case 'bonk': {
      const s = Number(e.s) || 3
      game.views.get(e.a)?.bonked(s)
      game.views.get(e.b)?.bonked(s)
      effects.bonkStars(e.x, e.z, Math.min(2, s / 5))
      effects.splash(e.x, e.z, Math.min(1.2, s / 8))
      water.ripple(e.x, e.z, Math.min(2, s / 4))
      // Soft bonks in quick succession are quieter, so a scrum of ducks never clatters.
      const now = performance.now()
      const soft = s < 4 && now - (game.lastBonkSound ?? -1e9) < 600
      game.lastBonkSound = now
      audio.bonk((s / 6) * (soft ? 0.4 : s < 4 ? 0.7 : 1))
      // A bonk is a real bump, so a child's own duck still feels a small nudge on hard ones.
      if (s > 4) effects.label('💥', { x: e.x, y: 2.4, z: e.z }, { size: s > 8 ? 'big' : 'normal' })
      if ((e.a === meId || e.b === meId) && s > 6) effects.shake = Math.min(0.35, s / 30)
      break
    }
    case 'thud': {
      const o = game.obstacles[e.o]
      o?.bump()
      const ob = sim.obstacles[e.o]
      if (!ob) break
      water.ripple(ob.x, ob.z, 0.8)
      // Each obstacle sings at most every 1.5 s, so a duck nudging a frog doesn't ribbit on and on.
      const now = performance.now()
      if (now - (o?.soundAt ?? -1e9) < 1500) break
      if (o) o.soundAt = now
      if (ob.kind === 'mama') {
        audio.quack(0.75)
        effects.label('💛', { x: ob.x, y: 5.5, z: ob.z }, { size: 'big' })
      } else if (ob.kind === 'lily' && ob.frog) {
        audio.ribbit()
        effects.label('🎵', { x: ob.x, y: 2.5, z: ob.z })
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
      effects.label('💫', { x: d.x, y: 3, z: d.z }, { size: 'big' })
      if (e.by === meId) flyToScore('💦', d.x, d.z)
      else if (e.by) bumpScore(e.by)
      break
    }
    case 'gurgle':
      // The water bubbles where the fountain is about to burst.
      for (let i = 0; i < 5; i++)
        later(() => {
          if (game.sim !== sim) return
          water.ripple(e.x, e.z, 0.5 + i * 0.15)
          effects.sparkle(e.x, 0.3, e.z, '#e9fbff', 4)
          audio.bubble(i, 0)
        }, (i * GEYSER_WARN * 1000) / 5)
      break
    case 'geyser':
      effects.spout(e.x, e.z)
      water.ripple(e.x, e.z, 2.5)
      audio.splash(1.4)
      audio.whee()
      if (game.me && Math.hypot(game.me.x - e.x, game.me.z - e.z) < 5) effects.shake = 0.3
      break
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
      return `<div class="score${e.id === self ? ' me' : ''}" id="score-${escapeHtml(e.id)}" style="--c:${color}"><span class="dot">${escapeHtml(e.emoji)}</span>${jar(0)}</div>`
    })
    .join('')
  game.scoreEls = game.setup.entries.map((e) => document.getElementById(`score-${e.id}`))
  game.shownScores = game.setup.entries.map(() => -1)
  game.shownBest = -1
}

/** A little picture flies from a spot on the water up into your own score pill, which then bumps. */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
function flyToScore(emoji, x, z) {
  const self = game.room.selfId
  const target = game.scoreEls?.[game.setup?.entries.findIndex((e) => e.id === self)]
  if (!target || reduceMotion.matches || !Element.prototype.animate) return bumpScore(self)
  const v = new THREE.Vector3(x, 1.6, z).project(camera)
  const sx = ((v.x + 1) / 2) * innerWidth
  const sy = ((1 - v.y) / 2) * innerHeight
  const r = target.getBoundingClientRect()
  const dx = r.left + r.width / 2 - sx
  const dy = r.top + r.height / 2 - sy
  const el = document.createElement('div')
  el.className = 'fly-pick'
  el.textContent = emoji
  el.style.left = `${sx}px`
  el.style.top = `${sy}px`
  labels.appendChild(el)
  const at = (k, lift, s) => `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k - lift}px)) scale(${s})`
  const anim = el.animate(
    [{ transform: at(0, 0, 0.7) }, { transform: at(0.25, 50, 1.4), offset: 0.3 }, { transform: at(1, 0, 1) }],
    { duration: 700, easing: 'ease-in' },
  )
  anim.onfinish = () => {
    el.remove()
    bumpScore(self)
  }
}

/**
 * A duck's catch as a little jar of bubbles that fills (no digits): the fullest jar in the round is full,
 * and the rest are as full as their share of it.
 */
const jar = (k, big = false) => `<span class="jar${big ? ' big' : ''}" style="--fill:${clamp(k, 0, 1).toFixed(3)}"><i></i></span>`
// (A few bubbles don't fill a jar: it takes at least 20 to fill one.)
const jarFill = (score, best) => score / Math.max(20, best)

function bumpScore(id) {
  const i = game.setup?.entries.findIndex((e) => e.id === id)
  const el = game.scoreEls?.[i]
  if (!el) return
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
}

function updateHud() {
  const sim = game.sim
  if (!sim) return
  // The round's clock is a ring round the place's picture that slowly empties: no numbers to read,
  // and it never turns red or beeps. The last part is the bubble shower.
  const left = clamp(1 - sim.time / ROUND_TIME, 0, 1)
  $('clock-ring').style.strokeDashoffset = String(100 - left * 100)
  const pic = sim.party ? '🫧' : ARENAS[sim.arenaId].emoji
  if ($('clock-emoji').textContent !== pic) $('clock-emoji').textContent = pic
  const best = Math.max(...sim.ducks.map((d) => d.score))
  if (best !== game.shownBest) {
    game.shownBest = best
    game.shownScores.fill(-1)
  }
  sim.ducks.forEach((d, i) => {
    const el = game.scoreEls?.[i]
    if (!el || game.shownScores[i] === d.score) return
    game.shownScores[i] = d.score
    el.querySelector('.jar').style.setProperty('--fill', jarFill(d.score, best).toFixed(3))
  })
  idleHint()
  // A gentle bubble shower for the last seconds (calm pass: no shouting, no faster music).
  if (game.state === 'play' && sim.party && !game.partyShown) {
    game.partyShown = true
    banner('🫧🫧🫧', 2000)
    audio.gift()
  }
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

/**
 * Everyone gets an award: each goes to whoever did the most of it and has none yet (children first on a
 * tie). The 🏆 goes to the fullest jar (a child on a tie), so it always matches what the jars show.
 */
const AWARDS = [
  { title: '💥', stat: (s) => s.bonks, min: 1 },
  { title: '🌊', stat: (s) => s.splashes, min: 1 },
  { title: '⭐', stat: (s) => s.stars, min: 1 },
  { title: '🎁', stat: (s) => s.gifts, min: 1 },
  { title: '🫧', stat: (s) => s.bubbles, min: 1 },
  { title: '🤸', stat: (s) => s.flights, min: 1 },
  { title: '💨', stat: (s) => s.dashes, min: 1 },
  { title: '🐥', stat: (s) => s.chicks, min: 1 },
]
const KIND_AWARDS = ['😊', '🌈', '💛', '🎉']

export function giveAwards(rows) {
  const out = new Map()
  if (rows[0] && rows[0].score > 0) out.set(rows[0].id, '🏆')
  for (const award of AWARDS) {
    let best = null
    let bestN = (award.min ?? 1) - 1
    for (const r of rows) {
      if (out.has(r.id)) continue
      const n = award.stat(r.stats)
      if (n > bestN || (best && n === bestN && best.bot && !r.bot)) {
        best = r
        bestN = n
      }
    }
    if (best) out.set(best.id, award.title)
  }
  let k = 0
  // A child who just floated and watched gets a happy nap award.
  for (const r of rows) if (!out.has(r.id)) out.set(r.id, !r.bot && r.score === 0 ? '💤' : KIND_AWARDS[k++ % KIND_AWARDS.length])
  return out
}

function standings() {
  const sim = game.sim
  return game.setup.entries
    .map((e, i) => ({ ...e, score: sim.ducks[i].score, stats: sim.ducks[i].stats ?? newStats(), i }))
    .sort((a, b) => b.score - a.score || (a.bot === b.bot ? a.i - b.i : a.bot ? 1 : -1))
}

function renderResults() {
  if (!game.setup || !game.sim) return
  const rows = standings()
  const best = Math.max(0, ...rows.map((r) => r.score))
  const awards = giveAwards(rows)
  const self = game.room.selfId
  // Your own duck first and big with its award; everyone else smaller below, in the order they played
  // (not a ranking).
  const mine = rows.find((r) => r.id === self)
  const others = game.setup.entries.map((e) => rows.find((r) => r.id === e.id)).filter((r) => r && r !== mine)
  const hero = mine
    ? `<div class="hero"><span class="hero-award">${awards.get(mine.id)}</span>${duckPicture(mine.duck)}${jar(Math.max(0.18, jarFill(mine.score, best)), true)}</div>`
    : ''
  const chips = others
    .map((r) => `<div class="chip">${duckPicture(r.duck)}<span class="chip-who">${escapeHtml(r.emoji)}</span><span class="chip-award">${awards.get(r.id)}</span>${jar(Math.max(0.18, jarFill(r.score, best)))}</div>`)
    .join('')
  $('podium').innerHTML = `${hero}<div class="chips">${chips}</div>`
  // Everyone can tap Again (a friend's tap asks the host); only the host picks a new place.
  $('again').classList.remove('asked')
  $('change').classList.toggle('hidden', !isHost())
  later(() => audio.quack(1.2), 600)
}

// --- Main loop -------------------------------------------------------------------------------

let accumulator = 0
let last = performance.now()
const camShake = new THREE.Vector3()

/** The child at this device steers their own duck: screen right is +X, screen down is +Z. */
function readMyInput() {
  const me = game.me
  if (!me) return
  const playing = game.state === 'play'
  const { x, y } = playing ? input.read() : { x: 0, y: 0 }
  me.ix = x
  me.iz = y
  if (playing && Math.hypot(x, y) > 0.3) {
    game.lastSteer = game.sim.time
    if (game.hinted) for (const id of ['hint', 'keys-hint']) $(id).classList.add('hidden')
  }
  // The first real steer puts the hint away at once.
  if (playing && Math.hypot(x, y) > 0.3 && !game.hinted) hideHint()
  // Quick, mashing presses: the duck's magnet reaches a little further for a couple of seconds.
  if (input.takeMash() && playing) {
    me.mashT = game.sim.time + 2
    game.sendMash = true
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
    for (const d of sim.ducks) {
      if (game.bots.has(d.id)) continue
      kids = Math.max(kids, d.score)
      if (Math.hypot(d.ix, d.iz) > 0.1 || d.dashT > 0) game.childActive = sim.time
    }
    // Every child has stopped paddling: the robots float and nap until someone paddles again.
    napping = napping && kids >= 0 && sim.time - (game.childActive ?? 0) > NAP_AFTER
    // How fast the best child is catching over the last 20 s, as `match` (slow children under 1 a second
    // meet slow robots; above that the robots climb quickly, so a fast, skilled child gets a close race):
    // the robots paddle at that pace, so a slow or wild player meets equally slow robots.
    const hist = (game.kidHist ??= [])
    if (!hist.length || sim.time - hist[hist.length - 1][0] >= 1) hist.push([sim.time, Math.max(0, kids)])
    while (hist.length > 1 && sim.time - hist[0][0] > 20) hist.shift()
    const [t0, s0] = hist[0]
    const rate = sim.time - t0 > 4 ? (Math.max(0, kids) - s0) / (sim.time - t0) : 1.5
    // (A strong child, faster than that, gets keener robots too: a real race now and then.)
    const match = clamp(rate < 1 ? rate / 1.5 : 0.667 + (rate - 1) * 1.4, 0.25, 1.6)
    // The magnet is a help for little ones: it fades away for a child who is already catching fast.
    sim.magnet = clamp((1.3 - match) / 0.45, 0, 1)
    for (const bot of game.bots.values()) bot.update(sim, dt, kids < 0 ? 0 : bot.duck.score - kids, napping, match)
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
        send({ t: 'st', r, items: game.sim.itemList(), stats: game.sim.ducks.map((d) => d.stats) })
      }
    }
  } else if (game.me && game.state === 'play') {
    const key = `${game.me.ix.toFixed(2)},${game.me.iz.toFixed(2)}`
    if (key !== game.sentInput || now - game.lastInput > 250) {
      if (now - game.lastInput > 50) {
        game.sentInput = key
        game.lastInput = now
        send({ t: 'in', r, x: +game.me.ix.toFixed(2), z: +game.me.iz.toFixed(2), ...(game.sendMash ? { m: 1 } : {}) }, { fast: true })
        game.sendMash = false
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
    for (const v of game.items.values()) {
      v.update(t, dt, effects)
      // The gentle magnet: pickups close to your own duck lean toward it (the sim lets a child's duck
      // reach a little further, so they pop just as they touch).
      const me = game.me
      const it = v.item
      const dx = me ? me.x - it.x : 0
      const dz = me ? me.z - it.z : 0
      const dist = Math.hypot(dx, dz)
      const k = me && !me.fly && dist < 3.2 && dist > 0.01 ? ((1 - dist / 3.2) * 0.9 * (game.sim.magnet ?? 1)) / dist : 0
      v.root.position.set(it.x + dx * k, 0, it.z + dz * k)
    }
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
  audio.updateMusic(game.state !== 'loading', game.state === 'play' && !!game.sim?.party)
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
  enabled: () => game.state === 'play',
})

/**
 * 🏠, 🎵 and 🔊 are held for a moment (a ring fills round them), so a mashing hand never ends a splash or
 * switches the sound off. A quick tap just wiggles the button. A second finger landing (a palm) cancels
 * the whole hold, and no new hold starts until every finger has lifted. Escape holds 🏠 the same way.
 */
const HOLD_MS = 1000
const inRound = () => ['syncing', 'countdown', 'play', 'ending'].includes(game.state)
// Every pointer down anywhere on the page. A hold starts only when its finger is the only one down; any
// other finger landing (on a button or the water) spoils it, and no hold starts until every finger lifts.
const downPointers = new Set()
let holdSpoiled = false
const holds = []
document.addEventListener('pointerdown', (e) => {
  downPointers.add(e.pointerId)
  if (downPointers.size > 1) {
    holdSpoiled = true
    for (const h of holds) h.cancel()
  }
}, true)
for (const ev of ['pointerup', 'pointercancel'])
  document.addEventListener(ev, (e) => {
    downPointers.delete(e.pointerId)
    if (!downPointers.size) holdSpoiled = false
  }, true)

/**
 * After a hold fires with the finger still down, the screen changes under it (say, to the menu): the lift's
 * click would land on whatever is there now. The next click is swallowed once.
 */
function swallowNextClick() {
  const eat = (e) => {
    e.preventDefault()
    e.stopPropagation()
    stop()
  }
  const lifted = () => setTimeout(stop, 400)
  const stop = () => {
    removeEventListener('click', eat, true)
    removeEventListener('pointerup', lifted, true)
    clearTimeout(timer)
  }
  addEventListener('click', eat, true)
  // The lift's click follows its pointerup at once; a finger that lingers is waited for (up to 5 s).
  addEventListener('pointerup', lifted, true)
  const timer = setTimeout(stop, 5000)
}

function holdButton(btn, action) {
  let start = 0
  let raf = 0
  let owner = null // the pointer (or 'key') holding it
  function end({ nudge = true } = {}) {
    cancelAnimationFrame(raf)
    raf = 0
    if (nudge && start && performance.now() - start < HOLD_MS) {
      btn.classList.remove('nudge')
      void btn.offsetWidth
      btn.classList.add('nudge')
    }
    start = 0
    owner = null
    btn.classList.remove('holding')
    btn.style.setProperty('--hold', '0')
  }
  function step() {
    if (!start || owner == null) return // cancelled meanwhile
    const k = clamp((performance.now() - start) / HOLD_MS, 0, 1)
    btn.style.setProperty('--hold', k.toFixed(3))
    if (k < 1) raf = requestAnimationFrame(step)
    else {
      const byFinger = owner !== 'key'
      end({ nudge: false })
      if (byFinger) swallowNextClick()
      action()
    }
  }
  function begin(id) {
    const alone = id === 'key' ? downPointers.size === 0 : downPointers.size === 1 && downPointers.has(id)
    if (owner != null || holdSpoiled || !alone) return end({ nudge: false })
    cancelAnimationFrame(raf)
    owner = id
    start = performance.now()
    btn.classList.add('holding')
    raf = requestAnimationFrame(step)
  }
  function release(id) {
    if (start && owner === id) end()
  }
  holds.push({ cancel: () => owner != null && owner !== 'key' && end({ nudge: false }) })
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    audio.unlock()
    begin(e.pointerId)
  })
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, (e) => release(e.pointerId))
  btn.addEventListener('click', (e) => e.stopPropagation())
  return { begin: () => begin('key'), release: () => release('key') }
}

const homeHold = holdButton($('home'), () => {
  if (!inRound() && game.state !== 'results') return
  audio.click()
  abortToLobby()
})
addEventListener('keydown', (e) => {
  audio.unlock()
  if (e.key === 'Escape' && !e.repeat && (inRound() || game.state === 'results')) homeHold.begin()
  // Space is still a dash at round end, even when 🔁 has keyboard focus.
  if ((e.key === ' ' || e.key === 'Enter') && game.state === 'results') {
    e.preventDefault()
    if (e.key === ' ') return
  }
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
    if (game.state === 'menu') hostStartRound()
    else if (e.key === 'Enter' && resultsReady()) askAgain()
  }
})
addEventListener('keyup', (e) => {
  if (e.key === 'Escape') homeHold.release()
})
addEventListener('pointerdown', () => audio.unlock(), { capture: true })

// Sound and music are never remembered switched off: every visit starts with sound.
const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
}
holdButton(soundBtn, () => {
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
function setMusic(on) {
  audio.setMusic(on)
  musicBtn.classList.toggle('off', !on)
}
holdButton(musicBtn, () => {
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
    game, THREE, scene, camera, input, effects, audio, giveAwards, standings, renderResults, endRound,
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
