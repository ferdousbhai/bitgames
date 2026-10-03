import * as THREE from 'three'
import * as CANNON from 'cannon'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { joinRoom } from 'https://bitgames-store.ferdousbd.workers.dev/vendor/bitgames/multiplayer-1.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { CAR_MODELS, Car } from './car.js'
import { CITIES, buildCity } from './cities.js'
import { Debris } from './damage.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { GROUP_STATIC, STATIC_MASK, canvasTexture, clamp, damp, harmless, rng, smoothing } from './util.js'

const params = new URLSearchParams(location.search)
const DEBUG = params.has('debug')
const $ = (id) => document.getElementById(id)
const FIXED_DT = 1 / 60
const SMASH_SECONDS = 120
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
const env = { scene, world, effects, audio, debris, carMaterial, staticMaterial: groundMaterial }
const input = new Input(document.body)

// Adaptive quality: tablets that can't keep up lose shadows and resolution, not frame rate.
const quality = { level: params.has('lowgfx') ? 0 : 2, frames: 0, time: 0 }
function applyQuality() {
  renderer.setPixelRatio(quality.level === 2 ? Math.min(devicePixelRatio, 1.75) : quality.level === 1 ? 1 : 0.6)
  renderer.shadowMap.enabled = quality.level > 0
  sun.castShadow = quality.level > 0
  resize()
}
function measureQuality(realDt) {
  if (quality.level === 0) return
  quality.frames++
  quality.time += realDt
  if (quality.time < 3) return
  const fps = quality.frames / quality.time
  quality.frames = 0
  quality.time = 0
  if (fps < 28) {
    quality.level--
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
  props: {},
  state: 'loading', // loading | menu | waiting | countdown | race | results
  city: 'ubud',
  mode: 'race', // race | smash
  scores: new Map(), // id -> smash points
  laps: 2,
  players: new Map(), // id -> { id, emoji }
  cars: new Map(), // id -> Car
  progress: new Map(), // id -> { lap, sector, hint, total, finished, proj }
  finishTimes: new Map(),
  track: null,
  player: null,
  setup: null,
  raceTime: 0,
  crashes: 0,
  timeScale: 1,
  slowmoUntil: 0,
  cameraMode: 0,
  lastSend: 0,
  fixCooldown: 0,
  offRoadTime: 0,
}

// --- Assets -------------------------------------------------------------------------

async function loadAssets() {
  const loader = new GLTFLoader()
  const models = Object.keys(CAR_MODELS)
  let done = 0
  const cars = models.map(async (name) => {
    const gltf = await loader.loadAsync(`./models/car_${name}.glb`)
    game.templates[name] = gltf.scene.getObjectByName(`car_${name}`) ?? gltf.scene
    $('loading-text').textContent = `Building cars… ${++done}/${models.length}`
  })
  // Props are optional: the cities draw stand-ins without them.
  const props = loader.loadAsync('./models/props.glb').then(
    (gltf) => gltf.scene.children.forEach((child) => (game.props[child.name] = child)),
    () => {},
  )
  await Promise.all([...cars, props])
}

// --- Menu ---------------------------------------------------------------------------

function show(screen) {
  for (const id of ['loading', 'menu', 'waiting', 'results']) $(id).classList.toggle('hidden', id !== screen)
  $('hud').classList.toggle('hidden', !['race', 'countdown'].includes(game.state))
}

function renderPlayers() {
  const html = [...game.players.values()].map((p) => `<span class="player">${p.emoji}${p.id === game.room.selfId ? ' (me)' : ''}</span>`).join('')
  $('players').innerHTML = html
  $('players-waiting').innerHTML = html
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
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b === el))
      document.querySelector('.laps').classList.toggle('hidden', game.mode === 'smash')
      audio.beep()
    }
  }
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
    game.state = 'menu'
    send({ t: 'menu' })
    show('menu')
  }
}

function enterLobbyScreen() {
  if (game.room.isHost) {
    game.state = 'menu'
    show('menu')
  } else {
    game.state = 'waiting'
    show('waiting')
  }
  renderPlayers()
}

// --- Networking ------------------------------------------------------------------------

function send(msg, opts) {
  game.room?.send(msg, opts)
}

function setupRoom(room) {
  game.room = room
  game.players.set(room.selfId, { id: room.selfId, emoji: PLAYER_EMOJI[0] })
  room.on('join', (id) => {
    if (!game.players.has(id)) game.players.set(id, { id, emoji: PLAYER_EMOJI[game.players.size % PLAYER_EMOJI.length] })
    renderPlayers()
    if (room.isHost) send({ t: 'players', players: [...game.players.values()] })
  })
  room.on('leave', (id) => {
    game.players.delete(id)
    game.cars.get(id)?.dispose()
    game.cars.delete(id)
    renderPlayers()
  })
  room.on('message', (msg, from) => onMessage(msg, from))
}

function onMessage(msg, from) {
  switch (msg.t) {
    case 'players':
      // Only the host's list counts, so everyone shows the same animal for each player.
      if (!game.room.isHost) {
        game.players = new Map(msg.players.map((p) => [p.id, p]))
        renderPlayers()
      }
      break
    case 'setup':
      startRace(msg)
      break
    case 'menu':
      if (game.state !== 'race') enterLobbyScreen()
      break
    case 's':
      for (const snap of msg.cars) {
        const car = game.cars.get(snap.id)
        if (car?.remote) car.pushSnapshot(snap)
      }
      break
    case 'hit': {
      const car = game.cars.get(msg.id)
      if (car?.remote) {
        car.damage.impact(new THREE.Vector3(...msg.l), new THREE.Vector3(...msg.d), msg.s, msg.seed)
        const world = new THREE.Vector3(...msg.l).applyMatrix4(car.root.matrixWorld)
        effects.sparkBurst(world, new THREE.Vector3(0, 1, 0), msg.s)
        audio.crash(msg.s, false)
      }
      break
    }
    case 'score':
      game.scores.set(msg.id, Math.max(game.scores.get(msg.id) ?? 0, msg.n))
      break
    case 'end':
      endSmash()
      break
    case 'fix':
      game.cars.get(msg.id)?.damage.repair()
      break
    case 'horn':
      audio.horn()
      break
    case 'done':
      game.finishTimes.set(msg.id, msg.time)
      if (game.state === 'results') renderResults()
      break
  }
}

// --- Race setup ------------------------------------------------------------------------

function hostStartRace() {
  const seed = Math.floor(Math.random() * 1e9)
  const r = rng(seed)
  const models = Object.keys(CAR_MODELS).sort(() => r() - 0.5)
  const humans = [...game.players.keys()]
  const entries = humans.map((id, i) => ({ id, model: models[i % models.length], bot: false, emoji: game.players.get(id).emoji }))
  for (let i = entries.length; i < 4; i++) entries.push({ id: `bot${i}`, model: models[i % models.length], bot: true, emoji: '🤖' })
  const setup = { t: 'setup', city: game.city, laps: game.laps, mode: game.mode, seed, entries, host: game.room.selfId }
  send(setup)
  startRace(setup)
}

function startRace(setup) {
  game.setup = setup
  game.city = setup.city
  game.laps = setup.laps
  game.mode = setup.mode ?? 'race'
  game.scores = new Map(setup.entries.map((e) => [e.id, 0]))
  $('lap').classList.toggle('hidden', game.mode === 'smash')
  $('timer').classList.toggle('hidden', game.mode !== 'smash')
  // Tear down the previous race
  for (const car of game.cars.values()) car.dispose()
  game.cars.clear()
  game.progress.clear()
  game.finishTimes.clear()
  debris.clear()
  effects.reset()
  game.track?.dispose()
  game.track = buildCity(setup.city, env, game.props)
  skyMaterial.uniforms.top.value.set(game.track.sky[0])
  skyMaterial.uniforms.bottom.value.set(game.track.sky[1])
  scene.fog = new THREE.Fog(game.track.fog, 120, 700)
  sun.color.set(game.track.sunColor)

  const isHost = setup.host === game.room.selfId
  const grid = game.track.grid4(setup.entries.length)
  setup.entries.forEach((entry, i) => {
    const local = entry.id === game.room.selfId || (entry.bot && isHost)
    const car = new Car({ id: entry.id, model: entry.model, template: game.templates[entry.model], env, remote: !local })
    car.place(grid[i].position, grid[i].yaw)
    car.isPlayer = entry.id === game.room.selfId
    if (local) {
      car.onHit = (hit) => onLocalHit(car, hit)
      car.controller = car.isPlayer ? humanController : botController(new Bot(car, game.track, 0.72 + i * 0.05, i + 1))
    }
    game.cars.set(entry.id, car)
    // Tags on everyone else's car; your own would only block your view.
    if (!car.isPlayer) {
      const tag = nameTag(entry.emoji)
      tag.position.set(0, car.dims.top + 0.9, 0)
      car.root.add(tag)
    }
    game.progress.set(entry.id, { lap: 0, sector: 0, hint: -1, total: 0, finished: false })
  })
  game.player = game.cars.get(game.room.selfId)
  game.crashes = 0
  game.raceTime = 0
  game.fixCooldown = 0
  game.state = 'countdown'
  show(null)
  runCountdown()
}

/** A floating emoji tag above each car so little players can tell who is who. */
function nameTag(text) {
  const tex = canvasTexture(256, 128, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.roundRect(8, 8, 240, 112, 56)
    g.fill()
    g.font = '80px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 128, 70)
  })
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sprite.scale.set(1.6, 0.8, 1)
  sprite.renderOrder = 10
  return sprite
}

function runCountdown() {
  const el = $('countdown')
  el.classList.remove('hidden')
  const mine = game.setup.entries.find((e) => e.id === game.room.selfId)
  if (mine) banner(`You drive ${CAR_MODELS[mine.model].emoji} ${CAR_MODELS[mine.model].name}!`, 2600)
  const steps = ['3', '2', '1', 'GO!']
  steps.forEach((text, i) =>
    setTimeout(() => {
      el.textContent = text
      audio.beep(i === 3)
      if (i === 3) {
        game.state = 'race'
        setTimeout(() => el.classList.add('hidden'), 700)
      }
    }, i * 900),
  )
}

// --- Gameplay events -----------------------------------------------------------------------

function onLocalHit(car, hit) {
  send({ t: 'hit', id: car.id, l: hit.local.toArray().map((n) => +n.toFixed(3)), d: hit.dir.toArray().map((n) => +n.toFixed(3)), s: +hit.speed.toFixed(1), seed: hit.seed })
  if (game.mode === 'smash' && game.state === 'race' && hit.speed > 7) {
    const points = (game.scores.get(car.id) ?? 0) + (hit.otherCar ? 2 : 1)
    game.scores.set(car.id, points)
    send({ t: 'score', id: car.id, n: points })
    // The car that got hit scores too: a smash takes two.
    if (hit.otherCar) {
      const other = hit.otherCar.id
      if (!hit.otherCar.remote) {
        game.scores.set(other, (game.scores.get(other) ?? 0) + 1)
        send({ t: 'score', id: other, n: game.scores.get(other) })
      }
    }
  }
  if (!car.isPlayer) return
  if (hit.speed > 7) game.crashes++
  if (hit.speed > 14) {
    banner(['💥 CRASH!', '😱 WHOA!', '💥 KABOOM!', '🤯 WOW!'][Math.floor(Math.random() * 4)])
    // Slow motion only when playing alone, so nobody else's race slows down.
    if (game.room.solo) {
      game.slowmoUntil = performance.now() + 1400
      audio.whoosh()
    }
  }
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

function respawn(car, ahead = 0) {
  const proj = projOf(car)
  const s = game.track.sampleAt(proj.dist + ahead)
  car.place(s.p, game.track.headingAt(s))
  car.upsideDownTime = 0
}

function fixPlayer() {
  if (!game.player || game.fixCooldown > 0) return
  game.player.damage.repair()
  send({ t: 'fix', id: game.player.id })
  game.fixCooldown = 8
  banner('🔧 Good as new!')
  audio.cheer()
}

/** In-race actions, by keyboard key and by on-screen button name. */
const ACTIONS = {
  reset: () => respawn(game.player),
  fix: fixPlayer,
  horn: () => {
    audio.horn()
    send({ t: 'horn' })
  },
  camera: () => (game.cameraMode = (game.cameraMode + 1) % 3),
  turbo,
}
const KEYS = { r: 'reset', f: 'fix', h: 'horn', c: 'camera', shift: 'turbo' }
function act(name) {
  audio.unlock()
  if (game.state === 'race') ACTIONS[name]?.()
}
input.on('key', (k) => act(KEYS[k]))
input.on('button', act)

function turbo() {
  if (game.player?.boost()) {
    audio.whoosh()
    banner('🔥 TURBO!', 700)
  }
}
// Any tap or key unlocks sound (the engine starts by itself once it can).
addEventListener('pointerdown', () => audio.unlock())
addEventListener('keydown', () => audio.unlock())

// --- Race progress ----------------------------------------------------------------------------

const SECTORS = 8
function updateProgress(id, car) {
  const prog = game.progress.get(id)
  if (!prog || prog.finished) return
  const proj = game.track.project(car.body.position, prog.hint)
  prog.hint = proj.index
  prog.proj = proj
  if (game.mode === 'smash') return
  const sector = Math.floor((proj.dist / game.track.length) * SECTORS)
  // Sectors must come in order; crossing from the last sector to the first completes a lap.
  if (sector === (prog.sector + 1) % SECTORS) {
    if (sector === 0) {
      prog.lap++
      if (car.isPlayer && prog.lap < game.laps) {
        banner(prog.lap === game.laps - 1 ? '🔔 Last lap!' : `Lap ${prog.lap + 1}!`)
        audio.cheer()
      }
      if (prog.lap >= game.laps) finishCar(id, car)
    }
    prog.sector = sector
  }
  prog.total = prog.lap * game.track.length + proj.dist
}

function finishCar(id, car) {
  const prog = game.progress.get(id)
  prog.finished = true
  game.finishTimes.set(id, game.raceTime)
  send({ t: 'done', id, time: game.raceTime })
  if (car.isPlayer) {
    audio.cheer()
    banner('🏁 FINISH!', 2000)
    setTimeout(() => {
      game.state = 'results'
      renderResults()
      show('results')
    }, 2200)
  }
}

function standings() {
  const entries = game.setup.entries.map((e) => ({ ...e, prog: game.progress.get(e.id), time: game.finishTimes.get(e.id), score: game.scores.get(e.id) ?? 0 }))
  if (game.mode === 'smash') return entries.sort((a, b) => b.score - a.score)
  return entries.sort((a, b) => {
    if (a.time != null && b.time != null) return a.time - b.time
    if (a.time != null) return -1
    if (b.time != null) return 1
    return (b.prog?.total ?? 0) - (a.prog?.total ?? 0)
  })
}

function renderResults() {
  const isHost = game.setup.host === game.room.selfId
  $('podium').innerHTML = standings()
    .map((e, i) => `<div class="place ${e.id === game.room.selfId ? 'me' : ''}"><span class="medal">${MEDAL[i]}</span>
      <span>${e.emoji} ${CAR_MODELS[e.model].emoji} ${CAR_MODELS[e.model].name}</span>
      <span class="extra">${game.mode === 'smash' ? `💥 ${e.score}` : e.time != null ? e.time.toFixed(1) + 's' : '🏎️ still racing'}</span></div>`)
    .join('')
  $('again').classList.toggle('hidden', !isHost)
  $('change-city').classList.toggle('hidden', !isHost)
  $('results-wait').classList.toggle('hidden', isHost)
  confetti()
}

function endSmash() {
  if (game.state !== 'race') return
  game.state = 'results'
  if (game.setup.host === game.room.selfId) send({ t: 'end' })
  audio.cheer()
  banner('⏱️ TIME!', 1800)
  setTimeout(() => {
    renderResults()
    show('results')
  }, 1800)
}

function confetti() {
  for (let i = 0; i < 60; i++) {
    const p = game.player?.body.position ?? { x: 0, y: 0, z: 0 }
    effects.sparks.spawn(new THREE.Vector3(p.x, p.y + 4, p.z), new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 6, (Math.random() - 0.5) * 10), {
      life: 2.5,
      color: ['#ff6b9d', '#ffbe0b', '#8ac926', '#2ec4b6', '#6c63ff'][i % 5],
    })
  }
}

// --- Main loop ------------------------------------------------------------------------------------

let accumulator = 0
let last = performance.now()
const camPos = new THREE.Vector3(0, 10, 20)
const camLook = new THREE.Vector3()
let sparkTimer = 0
const BRAKE = { steer: 0, throttle: 0, brake: 1 }
const COAST = { steer: 0, throttle: 0, brake: 0.3 }

/** The child at this device: keyboard, touch or gamepad, with Easy mode's helper. */
const humanController = {
  update(car) {
    if (game.progress.get(car.id)?.finished) car.controls = COAST
    else car.controls = input.easyGas ? steeringHelper(car, input.read()) : input.read()
  },
}

/** A computer driver; in Smash mode it hunts the nearest car. */
function botController(bot) {
  return {
    update(car, dt) {
      const proj = projOf(car)
      bot.update(dt, proj, game.mode === 'smash' ? Bot.nearest(car, game.cars.values()) : null)
    },
  }
}

function step(dt) {
  const racing = game.state === 'race'
  for (const car of game.cars.values()) {
    if (!car.remote) {
      if (racing) car.controller.update(car, dt)
      else car.controls = BRAKE
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
  const target = game.track.sampleAt(proj.dist + 8 + car.speed * 0.6)
  const help = clamp(car.angleTo(target.p.x, target.p.z) * 1.6, -0.8, 0.8) * (1 - Math.abs(controls.steer) * 0.7)
  return { ...controls, steer: clamp(controls.steer + help, -1, 1) }
}

/** Everything that follows the physics: visuals, damage, progress and effects. Shared by the frame loop and sim(). */
function tick(dt, realDt) {
  if (game.state === 'race') {
    game.raceTime += dt
    if (game.mode === 'smash' && game.raceTime >= SMASH_SECONDS) endSmash()
  }
  game.fixCooldown = Math.max(0, game.fixCooldown - realDt)
  for (const [id, car] of game.cars) {
    car.syncVisual(dt)
    car.damage.update(dt, car.accel)
    updateProgress(id, car)
    if (car.turboActive) exhaustFlames(car)
  }
  debris.update(dt)
  game.track.update()
  scrapeAndSkid(dt)
  offRoadEffects(dt)
}

const sparkPoint = new THREE.Vector3()
const sparkUp = new THREE.Vector3(0, 1, 0)
const smokeVelocity = new THREE.Vector3(0, 0.8, 0)
const tyreSmoke = { color: '#e8e8e8', size: 0.5, life: 1.2, kind: 'dust' }
function scrapeAndSkid(dt) {
  const player = game.player
  // Sparks where the player's body grinds against walls, other cars or the road.
  sparkTimer -= dt
  if (player && sparkTimer <= 0 && player.speed >= 5) {
    for (const c of world.contacts) {
      const mine = c.bi === player.body
      if (!mine && c.bj !== player.body) continue
      if (harmless(mine ? c.bj : c.bi)) continue
      const r = mine ? c.ri : c.rj
      sparkPoint.set(player.body.position.x + r.x, player.body.position.y + r.y, player.body.position.z + r.z)
      effects.sparkBurst(sparkPoint, sparkUp, player.speed * 0.25)
      audio.scrape(Math.min(1, player.speed / 20))
      sparkTimer = 0.05
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
  if (!p || game.state !== 'race') return
  const proj = game.progress.get(p.id)?.proj
  if (!proj) return
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
  // Far off the road, stuck or upside down: pop back onto the road.
  game.offRoadTime = proj.distance > game.track.width / 2 + 30 ? game.offRoadTime + dt : 0
  if (game.offRoadTime > 2 || p.upsideDownTime > 2.5) {
    game.offRoadTime = 0
    respawn(p)
    banner('🔄 Back on the road!')
  }
  for (const car of game.cars.values()) {
    if (car.remote) continue
    // Wedged against something mid-race: put the car back on the road a little further on.
    const finished = game.progress.get(car.id)?.finished
    car.stuckTime = car.speed < 1.5 && !finished ? (car.stuckTime ?? 0) + dt : 0
    const limit = car.isPlayer ? 5 : 3.5
    if ((!car.isPlayer && car.upsideDownTime > 3) || car.stuckTime > limit) {
      respawn(car, 6)
      car.stuckTime = 0
      // Bots come back fixed so a wreck doesn't sit at the back forever.
      if (!car.isPlayer && car.damage.level > 0.6) {
        car.damage.repair()
        send({ t: 'fix', id: car.id })
      }
      if (car.isPlayer) banner('🔄 Back on the road!')
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
    camPos.lerp(want.copy(mode.offset).applyQuaternion(headingQ).add(pos), smoothing(mode.stiffness, dt))
    camLook.lerp(want.copy(mode.look).applyQuaternion(headingQ).add(pos), smoothing(12, dt))
  }
  camera.position.copy(camPos)
  if (effects.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * effects.shake
    camera.position.y += (Math.random() - 0.5) * effects.shake
  }
  camera.lookAt(camLook)
  camera.fov = damp(camera.fov, (camera.aspect < 1 ? 75 : 62) + clamp(p.speed - 15, 0, 20) * 0.5, 3, dt)
  camera.updateProjectionMatrix()
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

let placeUpdatedAt = 0
function updateHud(now) {
  const p = game.player
  if (!p || !game.setup) return
  // Standings sort every car, so only a few times a second.
  if (now - placeUpdatedAt > 200) {
    placeUpdatedAt = now
    const place = standings().findIndex((e) => e.id === p.id)
    setText('position', `${MEDAL[place]} ${ORDINAL[place]}`)
  }
  const prog = game.progress.get(p.id)
  setText('lap', `Lap ${Math.min(game.laps, (prog?.lap ?? 0) + 1)}/${game.laps}`)
  if (game.mode === 'smash') {
    setText('crashes', `💥 ${game.scores.get(p.id) ?? 0}`)
    const left = Math.max(0, SMASH_SECONDS - game.raceTime)
    setText('timer', `⏱️ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`)
  } else setText('crashes', `💥 ${game.crashes}`)
  $('turbo-btn').classList.toggle('cooling', p.turboCooldown > now)
  setText('speed', String(Math.round(p.speed * 3.6)))
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
    const background = document.createElement('canvas')
    background.width = background.height = 160
    const bg = background.getContext('2d')
    bg.strokeStyle = 'rgba(255,255,255,0.85)'
    bg.lineWidth = 6
    bg.lineJoin = 'round'
    bg.stroke(outline)
    minimap = { track: t, minX, minZ, scale, background, g: $('minimap').getContext('2d') }
  }
  const { g, minX, minZ, scale } = minimap
  g.clearRect(0, 0, 160, 160)
  g.drawImage(minimap.background, 0, 0)
  for (const car of game.cars.values()) {
    g.fillStyle = car.isPlayer ? '#ffbe0b' : '#ff6b9d'
    g.beginPath()
    g.arc(20 + (car.body.position.x - minX) * scale, 20 + (car.body.position.z - minZ) * scale, car.isPlayer ? 7 : 5, 0, Math.PI * 2)
    g.fill()
  }
}

function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000)
  last = now
  game.timeScale = now < game.slowmoUntil ? 0.28 : damp(game.timeScale, 1, 5, realDt)
  const dt = realDt * game.timeScale
  if (game.track && ['race', 'countdown', 'results'].includes(game.state)) {
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
    updateHud(now)
    if (game.player) audio.updateEngine(game.player.speed, game.player.controls.throttle)
    // Send our cars ~20 times a second (bots too if we run them), in one message.
    if (now - game.lastSend > 50 && !game.room.solo) {
      game.lastSend = now
      const cars = [...game.cars.values()].filter((c) => !c.remote).map((c) => ({ id: c.id, ...c.snapshot() }))
      send({ t: 's', cars }, { fast: true })
    }
  } else audio.idleEngine()
  effects.update(realDt, camera)
  if (game.state === 'race') measureQuality(realDt)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// --- Boot ------------------------------------------------------------------------------------------------

async function boot() {
  buildMenu()
  // The "Who's playing?" lobby can be answered while the cars load.
  const [room] = await Promise.all([joinRoom({ maxPlayers: 4 }), loadAssets()])
  setupRoom(room)
  if (DEBUG && params.get('city')) {
    game.city = params.get('city')
    game.laps = Number(params.get('laps') ?? 2)
    game.mode = params.get('mode') ?? 'race'
    hostStartRace()
  } else enterLobbyScreen()
  requestAnimationFrame(frame)
}

if (DEBUG) {
  // Hooks for automated tests: drive, crash and inspect.
  window.__crash = {
    game, THREE, CANNON, effects, world,
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
    autopilot(on = true) {
      game.player.controller = on ? botController(new Bot(game.player, game.track, 0.85, 7)) : humanController
    },
    race: () => ({
      time: game.raceTime,
      scores: Object.fromEntries(game.scores),
      state: game.state,
      cars: [...game.cars.values()].map((c) => {
        const p = game.progress.get(c.id)
        return { id: c.id, model: c.model, lap: p.lap, sector: p.sector, total: Math.round(p.total), finished: p.finished, damage: +c.damage.level.toFixed(2), speed: +c.speed.toFixed(1) }
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
}

boot()
