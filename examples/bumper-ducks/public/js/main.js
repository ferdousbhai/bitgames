import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { Sim, newStats } from './sim.js'
import { DuckView, ItemView, ObstacleView, Rain, skyTexture, cloneTinted } from './view.js'
import { makeWater } from './water.js'
import {
  R, ROUND_TIME, PARTY_TIME, MAX_PLAYERS, DUCKS, DUCK_IDS, ARENAS, ARENA_IDS, POWERS, PLAYER_EMOJI,
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
  const top = clamp(1 - (2 * (sideHud ? 6 : innerWidth < 421 ? 150 : 88)) / innerHeight, 0.4, 0.97)
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

// Optional learning missions count bubbles the children collect (all of them together; the robots'
// don't count). A bubble's 'got' event can arrive more than once, so each one is counted once per round.
const collectedBubbles = new Set()
const MISSIONS = [
  { emoji: '🦆', label: 'Free duck play' },
  { emoji: '3️⃣', label: 'Count 3 bubbles together', goal: 'Together: collect 3 bubbles', target: 3, reward: 'Your duck team collected three bubbles!' },
  { emoji: '6️⃣', label: 'Count 6 bubbles together', goal: 'Together: collect 6 bubbles', target: 6, reward: 'Six bubbles, collected by your whole team!' },
]
let quietMission = false
const adventure = createAdventure({
  id: 'bumper-ducks',
  anchor: $('go'),
  hud: $('hud'),
  isMuted: () => audio.muted || quietMission,
  celebrate: () => {
    const n = adventure.option.target
    banner(`🎉 ${n} 🫧 🎉`, 2400, true)
    audio.star()
    if (game.me) effects.sparkle(game.me.x, 1.6, game.me.z, '#ffd23f', 30)
  },
  // The goal as bubbles that fill in, one per bubble counted, so it reads without words.
  renderProgress: (goal, option, count) => {
    if (!option.goal) return
    goal.replaceChildren()
    for (let i = 0; i < option.target; i++) {
      const b = document.createElement('span')
      b.className = `goal-bubble${i < count ? '' : ' off'}${i === count - 1 ? ' new' : ''}`
      b.textContent = '🫧'
      goal.append(b)
    }
    const n = document.createElement('b')
    n.textContent = count >= option.target ? '⭐' : `${count} / ${option.target}`
    goal.append(n)
    goal.setAttribute('aria-label', `${option.goal}: ${count} of ${option.target}`)
  },
  options: MISSIONS,
})

/** A friend's device plays the counting mission the host picked (the choice lives on the host's menu). */
function useMission(i) {
  if (!Number.isInteger(i) || i < 0 || i >= MISSIONS.length) return
  quietMission = true
  for (let k = 0; k < MISSIONS.length && adventure.option !== MISSIONS[i]; k++) $('adventure-choice').click()
  quietMission = false
}
const isBotDuck = (id) => !!game.setup?.entries.find((e) => e.id === id)?.bot

/** Says the counting goal once the round starts, for children who can't read it yet. */
function sayGoal() {
  const goal = adventure.option.goal
  if (!goal || audio.muted || !('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(`Let's count ${adventure.option.target} bubbles together!`)
  u.lang = 'en-US'
  u.rate = 0.85
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
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
  if (isHost()) show('menu')
  else {
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
  const setup = { t: 'setup', arena: game.arena, seed, entries, host: game.room.selfId, mission: MISSIONS.indexOf(adventure.option) }
  game.ready = new Set()
  send(setup)
  startRound(setup)
}

function startRound(setup) {
  if (!Array.isArray(setup.entries) || !setup.entries.length || !validArena(setup.arena)) return
  if (setup.host !== game.room.selfId) useMission(setup.mission)
  adventure.begin()
  collectedBubbles.clear()
  clearTimers()
  clearRound()
  game.setup = setup
  game.arena = setup.arena
  game.results = null
  game.partyShown = false
  game.run = 0
  game.lastShake = 0
  game.lastSteer = 0
  game.childActive = 0
  game.lastZzz = -9
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
  const sim = new Sim({ arena: setup.arena, entries })
  game.sim = sim
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
  const steps = ['3', '2', '1', '💦 GO!']
  steps.forEach((s, i) =>
    later(() => {
      el.textContent = s
      el.className = 'countdown'
      void el.offsetWidth
      el.className = 'countdown tick'
      audio.beep(i === 3)
      if (i === 3) {
        game.state = 'play'
        audio.squeak(1.1)
        showHint()
        later(sayGoal, 700)
        later(() => el.classList.add('hidden'), 700)
      }
    }, i * 800),
  )
}

/** The first time: show how to steer (a dragging finger, or the arrow keys). */
function showHint() {
  if (game.hinted || game.roundsPlayed > 0) return
  const touch = matchMedia('(any-pointer: coarse)').matches
  $(touch ? 'hint' : 'keys-hint').classList.remove('hidden')
  later(hideHint, 6000)
}
function hideHint() {
  game.hinted = true
  $('hint').classList.add('hidden')
  $('keys-hint').classList.add('hidden')
}

/** A child who has stopped paddling for a while sees the steering hint again for a moment. */
function idleHint() {
  const sim = game.sim
  if (game.state !== 'play' || !game.me || game.sitOut || !sim) return
  if (sim.time - (game.lastSteer ?? 0) < 6 || sim.time > 88) return
  game.lastSteer = sim.time
  const el = $(matchMedia('(any-pointer: coarse)').matches ? 'hint' : 'keys-hint')
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
  audio.cheer()
  banner('⏰ TIME! ⏰', 1600)
  later(() => {
    game.state = 'results'
    renderResults()
    show('results')
    effects.confetti(R)
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

function playEvent(e) {
  const sim = game.sim
  if (!sim) return
  const meId = game.room.selfId
  const mine = e.id === meId
  switch (e.k) {
    case 'item':
      addItemView({ id: e.item, k: e.kind, x: e.x, z: e.z })
      if (e.kind !== 'bubble') audio.plop()
      water.ripple(e.x, e.z, 0.3)
      break
    case 'got': {
      if (e.kind === 'bubble' && !collectedBubbles.has(e.item)) {
        collectedBubbles.add(e.item)
        if (!isBotDuck(e.id)) adventure.event(e)
      }
      const v = game.items.get(e.item)
      const y = v ? v.body.position.y : 0.8
      removeItemView(e.item)
      const d = posOf(e.id)
      const color = mine ? '#ffffff' : game.views.get(e.id)?.color ?? '#fff'
      if (e.kind === 'bubble') {
        effects.pop(e.x, y, e.z)
        if (mine) {
          const now = performance.now() / 1000
          game.run = now - game.lastBubble < 1.6 ? game.run + 1 : 0
          game.lastBubble = now
          audio.bubble(game.run)
        } else if (Math.random() < 0.5) audio.bubble(0)
        effects.label('+1', { x: e.x, y: 1.6, z: e.z }, { color })
      } else if (e.kind === 'star') {
        effects.sparkle(e.x, 1.2, e.z, '#ffd23f', 18)
        audio.star()
        effects.label('⭐+3', { x: e.x, y: 2, z: e.z }, { color, size: mine ? 'big' : 'normal' })
      } else if (e.kind === 'gift' && e.p) {
        effects.sparkle(e.x, 1, e.z, '#c9a7ff', 20)
        audio.gift()
        later(() => audio.power(e.p), 250)
        effects.label(POWERS[e.p].emoji, { x: d?.x ?? e.x, y: 3, z: d?.z ?? e.z }, { size: 'big' })
        if (mine) banner({ giant: '🍄 BIG DUCK! 🍄', speedy: '⚡ ZOOM! ⚡', shield: '🛡️ BOING! 🛡️' }[e.p])
      }
      bumpScore(e.id)
      break
    }
    case 'bonk': {
      const s = Number(e.s) || 3
      game.views.get(e.a)?.bonked(s)
      game.views.get(e.b)?.bonked(s)
      effects.bonkStars(e.x, e.z, Math.min(2, s / 5))
      effects.splash(e.x, e.z, Math.min(1.2, s / 8))
      water.ripple(e.x, e.z, Math.min(2, s / 4))
      audio.bonk(s / 6)
      effects.label(s > 7 ? 'KA-BONK!' : 'BONK!', { x: e.x, y: 2.4, z: e.z }, { size: 'big' })
      if ((e.a === meId || e.b === meId) && s > 4) effects.shake = Math.min(1, s / 12)
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
        effects.label('QUACK!', { x: ob.x, y: 5.5, z: ob.z }, { size: 'big' })
      } else if (ob.kind === 'lily' && ob.frog) {
        audio.ribbit()
        effects.label('RIBBIT!', { x: ob.x, y: 2.5, z: ob.z })
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
      effects.label('WHEE!', { x: d.x, y: 3, z: d.z }, { size: 'big' })
      if (e.by) {
        const by = posOf(e.by)
        if (by) effects.label('💦+2', { x: by.x, y: 2.4, z: by.z }, { color: game.views.get(e.by)?.color, size: e.by === meId ? 'big' : 'normal' })
        bumpScore(e.by)
      }
      break
    }
    case 'land':
      audio.splash(1.2)
      effects.splash(e.x, e.z, 1.6)
      water.ripple(e.x, e.z, 2)
      game.views.get(e.id)?.bonked(8)
      if (mine) effects.shake = 0.5
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
      return `<div class="score${e.id === self ? ' me' : ''}" id="score-${escapeHtml(e.id)}" style="--c:${color}"><span class="dot">${escapeHtml(e.emoji)}</span><b>0</b></div>`
    })
    .join('')
  game.scoreEls = game.setup.entries.map((e) => document.getElementById(`score-${e.id}`))
  game.shownScores = game.setup.entries.map(() => -1)
}

function bumpScore(id) {
  const i = game.setup?.entries.findIndex((e) => e.id === id)
  const el = game.scoreEls?.[i]
  if (!el) return
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
}

let lastTimerText = ''
function updateHud() {
  const sim = game.sim
  if (!sim) return
  const left = Math.max(0, Math.ceil(ROUND_TIME - sim.time))
  const text = `⏱️ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  if (text !== lastTimerText) {
    lastTimerText = text
    $('timer').textContent = text
    $('timer').classList.toggle('hurry', left <= 10 && game.state === 'play')
    if (left <= 5 && left > 0 && game.state === 'play') audio.beep(false)
  }
  const best = Math.max(...sim.ducks.map((d) => d.score))
  sim.ducks.forEach((d, i) => {
    const el = game.scoreEls?.[i]
    if (!el) return
    if (game.shownScores[i] !== d.score) {
      game.shownScores[i] = d.score
      el.querySelector('b').textContent = d.score
    }
    el.classList.toggle('lead', best > 0 && d.score === best)
  })
  idleHint()
  // Bubble party for the last seconds.
  if (game.state === 'play' && sim.party && !game.partyShown) {
    game.partyShown = true
    banner('🫧 BUBBLE PARTY! 🫧', 2000)
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

const MEDALS = ['🥇', '🥈', '🥉', '🏅']
/** Everyone gets an award: each goes to whoever did the most of it and has none yet (children first on a tie). */
const AWARDS = [
  { title: '💥 Bonk Boss', stat: (s) => s.bonks, min: 1 },
  { title: '🌊 Big Splasher', stat: (s) => s.splashes, min: 1 },
  { title: '⭐ Star Catcher', stat: (s) => s.stars, min: 1 },
  { title: '🎁 Gift Grabber', stat: (s) => s.gifts, min: 1 },
  { title: '🫧 Bubble Hunter', stat: (s) => s.bubbles, min: 1 },
  { title: '🤸 Flying Duck', stat: (s) => s.flights, min: 1 },
  { title: '💨 Zoom Zoom', stat: (s) => s.dashes, min: 1 },
]
const KIND_AWARDS = ['😊 Happy Paddler', '🌈 Super Splashy', '💛 Best Buddy', '🎉 Party Duck']

export function giveAwards(rows) {
  const out = new Map()
  if (rows[0] && rows[0].score > 0) out.set(rows[0].id, '🏆 Bubble Champ')
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
  for (const r of rows) if (!out.has(r.id)) out.set(r.id, KIND_AWARDS[k++ % KIND_AWARDS.length])
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
  const awards = giveAwards(rows)
  const self = game.room.selfId
  // Ties share a medal.
  let place = 0
  $('podium').innerHTML = rows
    .map((r, i) => {
      if (i > 0 && r.score < rows[i - 1].score) place = i
      return `<div class="place ${r.id === self ? 'me' : ''}"><span class="medal">${MEDALS[Math.min(place, 3)]}</span>${duckPicture(r.duck)}
        <span class="who"><span>${escapeHtml(r.emoji)}${r.id === self ? ' ⬅️' : ''}</span><span class="award">${awards.get(r.id)}</span></span>
        <span class="pts">${r.score} 🫧</span></div>`
    })
    .join('')
  // Everyone can tap Again (a friend's tap asks the host); only the host picks a new place.
  $('again').classList.remove('asked')
  $('change').classList.toggle('hidden', !isHost())
  const meRow = rows.findIndex((r) => r.id === self)
  if (meRow === 0) later(() => audio.quack(1.2), 600)
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
    for (const d of sim.ducks) {
      if (game.bots.has(d.id)) continue
      kids = Math.max(kids, d.score)
      if (Math.hypot(d.ix, d.iz) > 0.1 || d.dashT > 0) game.childActive = sim.time
    }
    // Every child has stopped paddling: the robots float and nap until someone paddles again.
    napping = napping && kids >= 0 && sim.time - (game.childActive ?? 0) > NAP_AFTER
    for (const bot of game.bots.values()) bot.update(sim, dt, kids < 0 ? 0 : bot.duck.score - kids, napping)
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
    for (const v of game.items.values()) v.update(t, dt, effects)
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
  audio.updateMusic(game.state !== 'loading', game.sim?.party && game.state === 'play')
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
  if (e.key === 'Escape' && ['play', 'countdown', 'syncing', 'results'].includes(game.state)) $('home').click()
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
  window.__adventure = { mission: adventure, game }
}

boot()
