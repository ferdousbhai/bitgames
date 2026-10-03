import * as THREE from 'three'
import * as CANNON from 'cannon'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { joinRoom } from '/vendor/bitgames/multiplayer-1.js'
import { Audio } from './audio.js'
import { Bot } from './bot.js'
import { CAR_MODELS, Car, GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC } from './car.js'
import { CITIES, buildCity } from './cities.js'
import { Debris } from './damage.js'
import { Effects } from './effects.js'
import { Input } from './input.js'
import { clamp, damp, rng } from './util.js'

const params = new URLSearchParams(location.search)
const DEBUG = params.has('debug')
const $ = (id) => document.getElementById(id)
const FIXED_DT = 1 / 60
const PLAYER_EMOJI = ['🦊', '🐼', '🐸', '🐯', '🐵', '🐰', '🐶', '🐨']
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
const MEDAL = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅', '🏅', '🏅']

// --- Renderer, scene, physics -------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
renderer.shadowMap.enabled = true
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
sun.castShadow = true
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
const ground = new CANNON.Body({ mass: 0, material: groundMaterial, collisionFilterGroup: GROUP_STATIC, collisionFilterMask: GROUP_CAR | GROUP_DEBRIS | GROUP_PROP })
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
  camera.fov = camera.aspect < 1 ? 75 : 62
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
  laps: 2,
  players: new Map(), // id -> { id, emoji }
  cars: new Map(), // id -> Car
  bots: new Map(), // id -> Bot (only on the device that runs them)
  progress: new Map(), // id -> { lap, sector, hint, total, finished, time }
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
window.__crashRacers = DEBUG ? game : undefined

// --- Assets -------------------------------------------------------------------------

async function loadAssets() {
  const loader = new GLTFLoader()
  const models = Object.keys(CAR_MODELS)
  let done = 0
  await Promise.all(
    models.map(async (name) => {
      const gltf = await loader.loadAsync(`./models/car_${name}.glb`)
      game.templates[name] = gltf.scene.getObjectByName(`car_${name}`) ?? gltf.scene
      $('loading-text').textContent = `Building cars… ${++done}/${models.length}`
    }),
  )
  try {
    const props = await loader.loadAsync('./models/props.glb')
    for (const child of props.scene.children) game.props[child.name] = child
  } catch {
    // Props are optional: the cities draw stand-ins without them.
  }
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
    if (room.isHost) send({ t: 'players', host: true, players: [...game.players.values()] })
  })
  room.on('leave', (id) => {
    game.players.delete(id)
    const car = game.cars.get(id)
    if (car) {
      car.dispose()
      game.cars.delete(id)
    }
    renderPlayers()
  })
  room.on('message', (msg, from) => onMessage(msg, from))
}

function onMessage(msg, from) {
  switch (msg.t) {
    case 'players':
      // Only the host's list counts, so everyone shows the same animal for each player.
      if (msg.host && !game.room.isHost) {
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
    case 's': {
      const car = game.cars.get(msg.id)
      if (car?.remote) car.pushSnapshot(msg)
      break
    }
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
  const setup = { t: 'setup', city: game.city, laps: game.laps, seed, entries, host: game.room.selfId }
  send(setup)
  startRace(setup)
}

function startRace(setup) {
  game.setup = setup
  game.city = setup.city
  game.laps = setup.laps
  // Tear down the previous race
  for (const car of game.cars.values()) car.dispose()
  game.cars.clear()
  game.bots.clear()
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
    const car = new Car({ id: entry.id, model: entry.model, template: game.templates[entry.model], env, remote: !local, label: entry.emoji })
    car.place(grid[i].position, grid[i].yaw)
    car.isPlayer = entry.id === game.room.selfId
    if (local) car.onHit = (hit) => onLocalHit(car, hit)
    game.cars.set(entry.id, car)
    if (entry.bot && isHost) game.bots.set(entry.id, new Bot(car, game.track, 0.72 + i * 0.05, i + 1))
    game.progress.set(entry.id, { lap: 0, sector: 0, hint: -1, total: 0, finished: false, time: 0 })
  })
  game.player = game.cars.get(game.room.selfId)
  game.crashes = 0
  game.raceTime = 0
  game.fixCooldown = 0
  audio.startEngine()
  game.state = 'countdown'
  show(null)
  runCountdown()
}

function runCountdown() {
  const el = $('countdown')
  el.classList.remove('hidden')
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

function respawn(car, ahead = 0) {
  const prog = game.progress.get(car.id)
  const proj = game.track.project(car.body.position, prog?.hint ?? -1)
  const s = game.track.sampleAt(proj.dist + ahead)
  car.place(s.p, Math.atan2(-s.t.x, -s.t.z))
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

input.on('key', (k) => {
  audio.unlock()
  if (game.state !== 'race') return
  if (k === 'r') respawn(game.player)
  if (k === 'f') fixPlayer()
  if (k === 'h') {
    audio.horn()
    send({ t: 'horn', id: game.room.selfId })
  }
  if (k === 'c') game.cameraMode = (game.cameraMode + 1) % 3
})
input.on('button', (name) => {
  audio.unlock()
  if (game.state !== 'race') return
  if (name === 'reset') respawn(game.player)
  if (name === 'fix') fixPlayer()
  if (name === 'horn') {
    audio.horn()
    send({ t: 'horn', id: game.room.selfId })
  }
  if (name === 'camera') game.cameraMode = (game.cameraMode + 1) % 3
})
addEventListener('pointerdown', () => audio.unlock())

// --- Race progress ----------------------------------------------------------------------------

const SECTORS = 8
function updateProgress(id, car) {
  const prog = game.progress.get(id)
  if (!prog || prog.finished) return
  const proj = game.track.project(car.body.position, prog.hint)
  prog.hint = proj.index
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
  prog.proj = proj
}

function finishCar(id, car) {
  const prog = game.progress.get(id)
  prog.finished = true
  prog.time = game.raceTime
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
  const entries = game.setup.entries.map((e) => ({ ...e, prog: game.progress.get(e.id), time: game.finishTimes.get(e.id) }))
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
      <span class="extra">${e.time != null ? e.time.toFixed(1) + 's' : '🏎️ still racing'}</span></div>`)
    .join('')
  $('again').classList.toggle('hidden', !isHost)
  $('change-city').classList.toggle('hidden', !isHost)
  $('results-wait').classList.toggle('hidden', isHost)
  confetti()
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

function step(dt) {
  const racing = game.state === 'race'
  for (const [id, car] of game.cars) {
    if (car.remote) {
      car.drive(dt)
      continue
    }
    if (!racing) {
      car.controls = { steer: 0, throttle: 0, brake: 1 }
    } else if (car.isPlayer) {
      if (game.autopilot) {
        game.autopilot.car !== car && (game.autopilot = new Bot(car, game.track, 0.85, 7))
        game.autopilot.think(dt)
      } else car.controls = game.progress.get(id)?.finished ? { steer: 0, throttle: 0, brake: 0.3 } : input.read()
    } else {
      game.bots.get(id)?.think(dt)
    }
    car.drive(dt)
  }
  world.step(dt)
  for (const car of game.cars.values()) if (!car.remote) car.afterStep(dt)
}

function scrapeAndSkid(dt) {
  const player = game.player
  if (!player) return
  // Sparks where the body grinds against walls, other cars or the road.
  sparkTimer -= dt
  for (const c of world.contacts) {
    const mine = c.bi === player.body || c.bj === player.body
    if (!mine || sparkTimer > 0) continue
    const other = c.bi === player.body ? c.bj : c.bi
    if (other.isDebris) continue
    const speed = player.speed
    if (speed < 5) continue
    const r = c.bi === player.body ? c.ri : c.rj
    const p = new THREE.Vector3(player.body.position.x + r.x, player.body.position.y + r.y, player.body.position.z + r.z)
    effects.sparkBurst(p, new THREE.Vector3(0, 1, 0), speed * 0.25)
    audio.scrape(Math.min(1, speed / 20))
    sparkTimer = 0.05
  }
  // Skid marks and tyre smoke for every locally simulated car.
  for (const car of game.cars.values()) {
    if (!car.vehicle) continue
    car.vehicle.wheelInfos.forEach((w, i) => {
      if (car.wheels[i].state === 'gone' || !w.isInContact) {
        effects.skids.mark(`${car.id}${i}`, null, null, 0)
        return
      }
      const slip = 1 - w.skidInfo
      const hit = w.raycastResult.hitPointWorld
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(car.root.quaternion)
      effects.skids.mark(`${car.id}${i}`, new THREE.Vector3(hit.x, hit.y, hit.z), side, slip > 0.35 && car.speed > 5 ? slip : 0)
      if (slip > 0.6 && car.speed > 8 && Math.random() < 0.3) {
        effects.puff(new THREE.Vector3(hit.x, 0.3, hit.z), new THREE.Vector3(0, 0.8, 0), { color: '#e8e8e8', size: 0.5, life: 1.2, kind: 'dust' })
      }
    })
  }
}

function offRoadEffects(dt) {
  const p = game.player
  if (!p || game.state !== 'race') return
  const prog = game.progress.get(p.id)
  const proj = prog?.proj
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
    const limit = car.isPlayer && !game.autopilot ? 5 : 3.5
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

function updateCamera(dt) {
  const p = game.player
  if (!p) return
  const pos = p.root.position
  const q = p.root.quaternion
  const slowmo = performance.now() < game.slowmoUntil
  let offset, lookAhead
  if (game.debugCam) {
    const { yaw, dist, height } = game.debugCam
    camPos.copy(pos).add(new THREE.Vector3(Math.sin(yaw) * dist, height, Math.cos(yaw) * dist))
    camLook.copy(pos).add(new THREE.Vector3(0, 0.6, 0))
  } else if (slowmo) {
    // Swing around the car for a dramatic replay angle.
    const a = performance.now() / 600
    offset = new THREE.Vector3(Math.cos(a) * 7, 2.5, Math.sin(a) * 7)
    camPos.lerp(pos.clone().add(offset), 1 - Math.exp(-4 * dt))
    camLook.lerp(pos, 1 - Math.exp(-6 * dt))
  } else {
    const modes = [new THREE.Vector3(0, 2.6, 6.8), new THREE.Vector3(0, 5, 12), new THREE.Vector3(0, 1.4, -0.4)]
    offset = modes[game.cameraMode].clone()
    lookAhead = game.cameraMode === 2 ? new THREE.Vector3(0, 1.2, -10) : new THREE.Vector3(0, 1, -4)
    // Use only the car's heading, so the camera doesn't flip with a rolling car.
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y
    const yq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    const want = pos.clone().add(offset.applyQuaternion(yq))
    const stiffness = game.cameraMode === 2 ? 30 : 7
    camPos.lerp(want, 1 - Math.exp(-stiffness * dt))
    camLook.lerp(pos.clone().add(lookAhead.applyQuaternion(yq)), 1 - Math.exp(-12 * dt))
  }
  camera.position.copy(camPos)
  if (effects.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * effects.shake, (Math.random() - 0.5) * effects.shake, 0))
  camera.lookAt(camLook)
  camera.fov = damp(camera.fov, (camera.aspect < 1 ? 75 : 62) + clamp(p.speed - 15, 0, 20) * 0.5, 3, dt)
  camera.updateProjectionMatrix()
  sun.position.set(pos.x + 40, 80, pos.z + 25)
  sun.target.position.copy(pos)
  sky.position.copy(camera.position)
}

function updateHud() {
  const p = game.player
  if (!p || !game.setup) return
  const order = standings()
  const place = order.findIndex((e) => e.id === p.id)
  $('position').textContent = `${MEDAL[place]} ${ORDINAL[place]}`
  const prog = game.progress.get(p.id)
  $('lap').textContent = `Lap ${Math.min(game.laps, (prog?.lap ?? 0) + 1)}/${game.laps}`
  $('crashes').textContent = `💥 ${game.crashes}`
  $('speed').innerHTML = `${Math.round(p.speed * 3.6)}<small>km/h</small>`
  drawMinimap()
}

let minimapPath = null
function drawMinimap() {
  const c = $('minimap')
  const g = c.getContext('2d')
  const t = game.track
  if (!minimapPath || minimapPath.track !== t) {
    const xs = t.samples.map((s) => s.p.x), zs = t.samples.map((s) => s.p.z)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
    const scale = 120 / Math.max(maxX - minX, maxZ - minZ)
    const map = (x, z) => [20 + (x - minX) * scale, 20 + (z - minZ) * scale]
    minimapPath = { track: t, map }
  }
  g.clearRect(0, 0, 160, 160)
  g.strokeStyle = 'rgba(255,255,255,0.85)'
  g.lineWidth = 6
  g.lineJoin = 'round'
  g.beginPath()
  t.samples.forEach((s, i) => {
    const [x, y] = minimapPath.map(s.p.x, s.p.z)
    i ? g.lineTo(x, y) : g.moveTo(x, y)
  })
  g.closePath()
  g.stroke()
  for (const car of game.cars.values()) {
    const [x, y] = minimapPath.map(car.body.position.x, car.body.position.z)
    g.fillStyle = car.isPlayer ? '#ffbe0b' : '#ff6b9d'
    g.beginPath()
    g.arc(x, y, car.isPlayer ? 7 : 5, 0, Math.PI * 2)
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
    if (game.state === 'race') game.raceTime += dt
    game.fixCooldown = Math.max(0, game.fixCooldown - realDt)
    for (const [id, car] of game.cars) {
      car.syncVisual(dt)
      car.damage.update(dt, car.accel)
      updateProgress(id, car)
    }
    debris.update(dt)
    game.track.update()
    scrapeAndSkid(dt)
    offRoadEffects(dt)
    updateCamera(realDt)
    updateHud()
    if (game.player) audio.updateEngine(game.player.speed, game.player.controls.throttle)
    // Send our cars ~20 times a second; bots too if we run them.
    if (now - game.lastSend > 50 && !game.room.solo) {
      game.lastSend = now
      for (const car of game.cars.values()) if (!car.remote) send({ t: 's', id: car.id, ...car.snapshot() }, { fast: true })
    }
  }
  effects.update(realDt, camera)
  if (game.state === 'race') measureQuality(realDt)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// --- Boot ------------------------------------------------------------------------------------------------

async function boot() {
  buildMenu()
  await loadAssets()
  $('loading-text').textContent = 'Who is playing?'
  const room = await joinRoom({ maxPlayers: 4 })
  setupRoom(room)
  if (DEBUG && params.get('city')) {
    game.city = params.get('city')
    game.laps = Number(params.get('laps') ?? 2)
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
      impacts: game.player?.damage.log,
      glassAt: game.player?.damage.glass.map((g) => [g.object.name, g.center.toArray().map((n) => +n.toFixed(2)), +g.radius.toFixed(2)]),
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
    autopilot(on = true) {
      game.autopilot = on ? { car: null } : null
    },
    race: () => ({
      time: game.raceTime,
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
      const steps = Math.round(seconds / FIXED_DT)
      for (let i = 0; i < steps; i++) {
        if (controls) input.override = controls
        step(FIXED_DT)
        if (game.state === 'race') game.raceTime += FIXED_DT
        for (const [id, car] of game.cars) {
          car.syncVisual(FIXED_DT)
          car.damage.update(FIXED_DT, car.accel)
          updateProgress(id, car)
        }
        debris.update(FIXED_DT)
        game.track.update()
        offRoadEffects(FIXED_DT)
      }
      input.override = null
      updateCamera(1)
      return this.state()
    },
  }
}

boot()
