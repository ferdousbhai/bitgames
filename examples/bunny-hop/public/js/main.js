import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { BIOME_LENGTH, BIOMES, HOME_X, biomeIndexAt } from './biomes.js'
import { Bunny } from './bunny.js'
import { Course, speedAt } from './course.js'
import { Effects, Popups, Weather } from './effects.js'
import { loadModels } from './models.js'
import { clamp, easeStep, pick } from './util.js'
import { World } from './world.js'

const $ = (id) => document.getElementById(id)

// --- Renderer and scene ---------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.type = THREE.PCFShadowMap
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.3
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700)

// Tablets that can't keep up lose shadows and resolution, not frame rate.
const quality = { level: 2, frames: 0, time: 0 }
function applyQuality() {
  renderer.setPixelRatio(quality.level === 2 ? Math.min(devicePixelRatio, 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 0.75)
  renderer.shadowMap.enabled = quality.level > 0
  resize()
}
function measureQuality(dt) {
  if (quality.level === 0 || game.state !== 'play') return
  quality.frames++
  quality.time += dt
  if (quality.time < 3) return
  const fps = quality.frames / quality.time
  quality.frames = quality.time = 0
  if (fps < 40) {
    quality.level--
    applyQuality()
  }
}

const view = { halfW: 8, dist: 14, lead: 0.45 }
function resize() {
  const aspect = innerWidth / innerHeight
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = aspect
  // Portrait phones get a wider lens so there's still room to see what's coming.
  camera.fov = aspect < 1 ? 58 : 42
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  // Show about this much path either side of the camera's centre: a phone held
  // upright gets less, so Pip stays big enough, and Pip sits further left.
  view.dist = clamp((aspect < 1 ? 5 : 9) / (tan * aspect), 9, 24)
  view.halfW = view.dist * tan * aspect
  view.lead = aspect < 1 ? 0.5 : 0.45
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

// --- Game ---------------------------------------------------------------------------

const sound = new Sound()
const game = {
  state: 'loading',
  x: 0,
  speed: 0,
  slow: 1,
  score: 0,
  combo: 0,
  comboTimer: 0,
  hops: 0,
  biome: 0,
  homeTime: 0,
  time: 0,
  best: 0,
  shake: 0,
}
if (new URLSearchParams(location.search).has('debug')) window.game = game
try {
  game.best = Number(localStorage.getItem('bunnyhop.best')) || 0
} catch {}

let bunny, world, course, effects, weather, popups
const camPos = new THREE.Vector3(1.2, 2, 8)
const camLook = new THREE.Vector3(0.3, 1.1, 0)
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

async function init() {
  const { bunny: model, templates } = await loadModels((k) => ($('load-bar').style.width = `${10 + k * 90}%`))
  bunny = new Bunny(model)
  scene.add(bunny.root)
  // a soft round shadow keeps the bunny's height readable
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.03
  blob.renderOrder = 1
  scene.add(blob)
  game.blob = blob
  world = new World(scene, templates)
  course = new Course(scene, templates)
  effects = new Effects(scene)
  weather = new Weather(scene)
  weather.setKind(BIOMES[0].weather)
  popups = new Popups($('popups'), camera)
  if (window.game) Object.assign(window, { course, view })
  applyQuality()
  toMenu()
  requestAnimationFrame(frame)
}

function show(id) {
  for (const s of ['loading', 'menu', 'results']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', id !== null)
  $('mute').classList.toggle('hidden', id === 'loading')
}

function toMenu() {
  game.state = 'menu'
  game.x = 0
  bunny.reset()
  world.reset()
  course.reset()
  $('best').textContent = `🏆 Best: ${game.best} 🥕`
  $('best').classList.toggle('hidden', game.best === 0)
  show('menu')
}

function start() {
  sound.unlock()
  sound.click()
  sound.music(true)
  game.state = 'play'
  game.speed = 0
  game.slow = 1
  game.score = 0
  game.combo = 0
  game.hops = 0
  game.time = 0
  // ?biome=2 starts further along the trip (for trying out the later places)
  const skip = clamp(Number(new URLSearchParams(location.search).get('biome')) || 0, 0, BIOMES.length - 1)
  game.x = skip ? skip * BIOME_LENGTH + 1 : 0
  game.biome = skip
  bunny.reset()
  world.reset(game.x)
  course.reset(game.x)
  // swoop out from a close-up of Pip (and never pan across the whole trip)
  camPos.set(game.x + 0.6, 1.6, 6.5)
  camLook.set(game.x + 0.1, 1.1, 0)
  weather.setKind(BIOMES[game.biome].weather)
  $('score-num').textContent = '0'
  $('tap-hint').classList.remove('gone')
  show(null)
  banner(`${BIOMES[game.biome].emoji} ${BIOMES[game.biome].name}`)
}

let bannerTimer
function banner(text, ms = 2200) {
  const el = $('banner')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

function bumpScore() {
  const el = $('score')
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
  $('score-num').textContent = game.score
}

function hop() {
  if (game.state !== 'play') return
  const kind = bunny.hop()
  if (!kind) return
  sound.hop(kind === 'double')
  tmp.set(game.x, 0, 0)
  if (kind === 'hop') effects.puff(tmp, 6, dustColor(), 0.9)
  else effects.sparkle(tmp.set(game.x, bunny.y + 0.5, 0), 8, ['#ffffff', '#bfe6ff'], 2.5)
  if (++game.hops >= 3) $('tap-hint').classList.add('gone')
}

const dustColor = () => BIOMES[game.biome].dust

function finish() {
  game.state = 'home'
  game.homeTime = 0
  sound.music(false)
  sound.finish()
  banner('🏡 Home!', 2600)
  $('tap-hint').classList.add('gone')
  tmp.set(HOME_X + 1, 1.5, -1)
  effects.confettiBurst(tmp, 90)
}

function showResults() {
  game.state = 'results'
  const possible = Math.max(1, course.possible)
  const f = game.score / possible
  const stars = 1 + (f > 0.35 ? 1 : 0) + (f > 0.65 ? 1 : 0)
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">⭐</span>`).join('')
  $('final').textContent = game.score
  const isBest = game.score > game.best
  if (isBest) {
    game.best = game.score
    try {
      localStorage.setItem('bunnyhop.best', String(game.best))
    } catch {}
  }
  $('new-best').classList.toggle('hidden', !isBest || game.score === 0)
  $('best-line').textContent = `🏆 Best: ${game.best} 🥕`
  $('best-line').classList.toggle('hidden', game.best === 0)
  show('results')
}

// --- Input: tap / click anywhere, or space, up arrow, W ---------------------------------

addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (e.target.closest('button')) return
  if (game.state === 'play') hop()
})
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) {
    e.preventDefault()
    if (e.repeat) return
    sound.unlock()
    if (game.state === 'menu' || game.state === 'results') start()
    else hop()
  } else if (e.code === 'KeyM') toggleMute()
})
addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend()
})
$('play').onclick = start
$('again').onclick = start
function toggleMute() {
  sound.unlock()
  sound.setMuted(!sound.muted)
  $('mute').textContent = sound.muted ? '🔇' : '🔊'
}
$('mute').onclick = toggleMute
$('mute').textContent = sound.muted ? '🔇' : '🔊'

// --- Main loop ----------------------------------------------------------------------

const YUM = ['Yum!', 'Crunch!', 'Munch!', 'Yummy!']
const OOPS = ['Boing!', 'Whoopsie!', 'Oopsy daisy!', 'Bonk!']
const NICE = ['Nice hop!', 'Wheee!', 'Super!', 'Great jump!']

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'carrot') {
      game.combo = game.comboTimer > 0 ? game.combo + 1 : 0
      game.comboTimer = 1.1
      game.score += ev.gold ? 5 : 1
      bumpScore()
      bunny.munch()
      if (ev.gold) {
        sound.gold()
        effects.sparkle(ev.pos, 24, ['#ffe066', '#ffffff', '#ffb000'], 4.5)
        popups.show('+5 ✨', ev.pos, 'gold')
      } else {
        sound.munch(game.combo)
        effects.crumbs(ev.pos)
        effects.sparkle(ev.pos, 5, undefined, 2)
        popups.show(game.combo >= 4 && game.combo % 2 === 0 ? pick(YUM) : '+1', ev.pos)
      }
    } else if (ev.type === 'bump') {
      bunny.bonk()
      game.slow = 0.35
      game.shake = 0.35
      sound.bonk()
      tmp.set(game.x, 1.6, 0)
      effects.dizzy(tmp)
      effects.puff(ev.pos, 8, dustColor(), 1.3)
      popups.show(pick(OOPS), tmp.set(game.x, 2.4, 0), 'oops')
    } else if (ev.type === 'cleared') {
      if (Math.random() < 0.45) {
        sound.nice()
        popups.show(pick(NICE), tmp.set(game.x, 2.6, 0), 'nice')
        effects.sparkle(tmp.set(ev.pos.x, 1.2, 0), 6, ['#bfe6ff', '#ffffff'], 2)
      }
    }
  }
}

function updateCamera(dt) {
  let px, py, pz, lx, ly
  if (game.state === 'menu') {
    // close up on Pip, a little in front so the title sits above
    const portrait = innerWidth < innerHeight
    px = game.x + 0.6
    py = 1.6
    pz = portrait ? 8.5 : 5.6
    lx = game.x + 0.1
    ly = portrait ? 1.45 : 1.0
  } else if (game.state === 'home' || game.state === 'results') {
    px = HOME_X + 0.8
    py = 2.4
    pz = Math.min(view.dist, 13)
    lx = HOME_X + 0.6
    ly = 1.4
  } else {
    const lead = view.halfW * view.lead
    px = game.x + lead
    py = 3.0 + view.dist * 0.1 + bunny.y * 0.25
    pz = view.dist
    lx = game.x + lead
    ly = 1.3 + bunny.y * 0.3
  }
  if (game.state === 'play') {
    // move with the bunny first, so the easing below doesn't trail behind at speed
    camPos.x += game.speed * dt
    camLook.x += game.speed * dt
  }
  const k = easeStep(game.state === 'play' ? 4 : 2, dt)
  camPos.lerp(tmp.set(px, py, pz), k)
  camLook.lerp(tmp2.set(lx, ly, 0), k)
  camera.position.copy(camPos)
  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt)
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.5
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.5
  }
  camera.lookAt(camLook)
}

// The trip bar: moved with transforms, and only when it has moved a visible amount.
const tripFill = $('trip-fill')
const tripBunny = $('trip-bunny')
let tripShown = -1
function showTrip(progress) {
  const p = Math.round(progress * 1000) / 1000
  if (p === tripShown) return
  tripShown = p
  tripFill.style.transform = `scaleX(${p})`
  tripBunny.style.transform = `translateX(${p * 100}%)`
}

const probe = { x: 0, y: 0, tumbling: false } // where the bunny is, for the course's hit test
let last = performance.now()
let smokeTimer = 0
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  game.time += dt
  measureQuality(dt)

  let mode = 'menu'
  if (game.state === 'play') {
    mode = 'run'
    game.slow = Math.min(1, game.slow + dt * 0.7)
    const target = speedAt(game.x) * game.slow
    game.speed = THREE.MathUtils.damp(game.speed, target, 3, dt)
    game.x += game.speed * dt
    game.comboTimer -= dt

    const idx = biomeIndexAt(game.x)
    if (idx !== game.biome) {
      game.biome = idx
      const b = BIOMES[idx]
      banner(`${b.emoji} ${b.name}!`)
      sound.fanfare()
      weather.setKind(b.weather)
    }
    course.generate(game.x + view.halfW * 2 + 30)
    probe.x = game.x
    probe.y = bunny.y
    probe.tumbling = bunny.tumbleT < 1
    handleEvents(course.update(dt, probe, game.time, game.x - view.halfW - 15))
    if (game.x >= HOME_X - 1.4) finish()

    showTrip(clamp(game.x / HOME_X, 0, 1))
  } else if (game.state === 'home' || game.state === 'results') {
    mode = 'home'
    game.speed *= Math.pow(0.02, dt)
    game.x = Math.min(HOME_X, game.x + game.speed * dt)
    game.homeTime += dt
    if (game.state === 'home' && game.homeTime > 3) showResults()
    if (Math.random() < dt * 3) effects.confettiBurst(tmp.set(game.x + (Math.random() - 0.5) * 6, 5, -1), 8)
    smokeTimer -= dt
    if (world.home && smokeTimer <= 0) {
      smokeTimer = 0.35
      world.chimney(tmp)
      effects.dust.spawn(tmp, tmp2.set(0.3, 1.2, 0), { life: 1.6, size: 0.25, color: '#ffffff', spin: 0, shrink: true })
    }
    course.update(dt, null, game.time, game.x - view.halfW - 15)
  } else {
    course.update(dt, null, game.time, -1e9)
  }

  const landed = bunny.update(dt, game.state === 'play' ? game.speed : 0, mode)
  if (landed !== 0) {
    tmp.set(game.x, 0, 0)
    effects.puff(tmp, Math.abs(landed) > 9 ? 8 : 4, dustColor(), Math.min(1.3, Math.abs(landed) / 9))
    if (game.state === 'play' && landed > 4) sound.land()
    if (landed < 0) sound.hop(false) // landed and bounced straight into a buffered hop
  }
  bunny.root.position.x = game.x
  game.blob.position.x = game.x
  const lift = clamp(bunny.y / 3, 0, 0.8)
  game.blob.scale.setScalar(1 - lift * 0.6)
  game.blob.material.opacity = 0.22 * (1 - lift)

  updateCamera(dt)
  world.update(dt, camera.position.x, game.x, game.time)
  weather.update(dt, camera.position, game.time)
  effects.update(dt)
  renderer.render(scene, camera)
}

init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})

