import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { BIOME_LENGTH, BIOMES, HOME_X, biomeIndexAt } from './biomes.js'
import { Bunny } from './bunny.js'
import { Course, speedAt } from './course.js'
import { Effects, Glints, Popups, Weather } from './effects.js'
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
  renderer.setPixelRatio(quality.level === 2 ? Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 0.75)
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

const view = { halfW: 8, dist: 14, lead: 0.45, follow: 0.3 }
function resize() {
  const aspect = innerWidth / innerHeight
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = aspect
  // Portrait phones get a wider lens so there's still room to see what's coming.
  camera.fov = aspect < 1 ? 58 : 42
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  // Show about this much path either side of the camera's centre: a phone held
  // upright gets less, so Pip stays big enough, and Pip sits further left.
  // Phones held sideways are short, so they show a bit less path to keep Pip big.
  const short = aspect < 1 ? 0 : clamp((560 - innerHeight) / 200, 0, 1)
  // Boxier screens held sideways (iPads, 4:3) are tall, so they show a bit less
  // path too: otherwise Pip is a small bunny under a big sky.
  const boxy = aspect < 1 ? 0 : clamp((1.7 - aspect) / 0.37, 0, 1)
  view.dist = clamp((aspect < 1 ? 4.5 : 9 - 2 * short - 1.7 * boxy) / (tan * aspect), 7, 24)
  // and short screens tilt up further with a high double hop, so Pip's ears stay clear of the score
  view.follow = 0.3 + 0.4 * short
  view.halfW = view.dist * tan * aspect
  view.lead = aspect < 1 ? 0.62 : 0.45 + short * 0.07
  // Aim so the path sits low on the screen (about 3/4 of the way down): the sky
  // above holds the HUD and the high golden carrots, with little empty grass below.
  view.height = 3.0 + view.dist * 0.1
  const pathBelow = Math.atan(view.height / view.dist) - Math.atan((aspect < 1 ? 0.4 : 0.48) * tan)
  view.aim = view.height - view.dist * Math.tan(pathBelow)
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
  streak: 0, // carrots munched in a row, for the counting pop-up
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

// Optional learning missions. A flip is the bunny's 'double' hop.
const missionSteps = {
  'Gentle hop counting': ['↑', '↑', '↑', '↑'],
  'Hop, hop, flip pattern': ['↑', '↑', '↻'],
}

function missionIcon(symbol, state = '') {
  const icon = document.createElement('span')
  icon.className = `mission-step ${state}`
  icon.textContent = symbol
  icon.setAttribute('aria-hidden', 'true')
  return icon
}

function renderMissionProgress(goal, option, count) {
  if (!option.goal) return
  goal.replaceChildren()
  goal.setAttribute('aria-label', `${option.goal}. ${count} of ${option.target} steps.`)
  const caption = document.createElement('span')
  caption.className = 'mission-caption'
  caption.textContent = option.sequence
    ? count === 2 ? 'Hop, then tap to flip!' : count === 3 ? 'Pattern complete!' : '👆 Hop · hop · flip'
    : `👆 Tap to hop · ${count} / 4`
  const steps = document.createElement('span')
  steps.className = 'mission-steps'
  missionSteps[option.label].forEach((symbol, i) => steps.append(missionIcon(symbol, i < count ? 'done' : i === count ? 'next' : '')))
  goal.append(caption, steps)
}

function speakMission(text) {
  if (sound.muted || !('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const words = new SpeechSynthesisUtterance(text)
  words.lang = 'en-US'
  words.rate = 0.82
  speechSynthesis.speak(words)
}

const adventure = createAdventure({
  id: 'bunny-hop',
  anchor: $('play'),
  hud: $('hud'),
  isMuted: () => sound.muted,
  celebrate: () => {
    banner(adventure.option.sequence ? '⭐ Pattern! ⭐' : '⭐ Four hops! ⭐', 2600)
    effects.confettiBurst(new THREE.Vector3(game.x, bunny.y + 1, 0), 35)
  },
  renderProgress: renderMissionProgress,
  options: [
    { emoji: '🐰', label: 'Free hopping' },
    { emoji: '🐢', label: 'Gentle hop counting', pace: 0.6, goal: 'Make four hops', target: 4, reward: 'Four! You made four hops!' },
    { emoji: '🎶', label: 'Hop, hop, flip pattern', pace: 0.6, goal: 'Hop twice, then hop and tap again in the air to flip', target: 3, sequence: ['hop', 'hop', 'flip'], accept: (kind, n) => kind === ['hop', 'hop', 'double'][n], reward: 'You made the hop, hop, flip pattern!' },
  ],
})

function renderMissionChoice() {
  const option = adventure.option
  const button = $('adventure-choice')
  button.replaceChildren()
  const steps = document.createElement('span')
  steps.className = 'mission-steps'
  for (const symbol of missionSteps[option.label] || ['🐰']) steps.append(missionIcon(symbol, 'done'))
  const caption = document.createElement('span')
  caption.textContent = option.sequence ? 'Hop, hop, flip' : option.goal ? 'Count 4 hops' : 'Free hop'
  const next = document.createElement('span')
  next.className = 'mission-next'
  next.textContent = '↻'
  next.setAttribute('aria-hidden', 'true')
  button.append(steps, caption, next)
}
renderMissionChoice()
$('adventure-choice').addEventListener('click', renderMissionChoice)

let bunny, world, course, effects, weather, glints, popups
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
  glints = new Glints(scene)
  popups = new Popups($('popups'), camera)
  if (window.game) Object.assign(window, { course, view, camera, bunny })
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
  adventure.begin()
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
  $('tap-hint').classList.toggle('gone', !!adventure.option.goal)
  show(null)
  fitPopups()
  banner(`${BIOMES[game.biome].emoji} ${BIOMES[game.biome].name}`)
  if (adventure.option.goal) speakMission(adventure.option.goal)
}

// Floating words start a little below the score and the trip bar, so a word
// floating up fades out before it reaches them (short sideways phones especially).
function fitPopups() {
  if (!popups || $('hud').classList.contains('hidden')) return
  const bottom = Math.max($('score').getBoundingClientRect().bottom, document.querySelector('.trip').getBoundingClientRect().bottom)
  popups.minTop = bottom + 56
}
addEventListener('resize', fitPopups)

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
  if (adventure.option.sequence && adventure.progress === 2 && kind === 'hop') {
    banner('👆 Tap again!', 900)
    speakMission('Tap again in the air to flip!')
  } else adventure.event(kind)
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
  // a new best already says so on the tally
  $('best-line').classList.toggle('hidden', game.best === 0 || (isBest && game.score > 0))
  show('results')
}

// --- Input: tap / click anywhere, or space, up arrow, W ---------------------------------

addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (e.target.closest('button')) return
  if (game.state === 'play') hop()
  if (game.state !== 'loading') poke(e.clientX, e.clientY)
})

// Kids tap everything: Pip giggles and hops, and the scenery boings, rustles and flutters.
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const POKE = {
  tree_round: 'tree', tree_round_snow: 'tree', tree_pine: 'tree', tree_pine_snow: 'tree', bush: 'tree', grass: 'tree', flower: 'flower',
  mushroom_red: 'boing', mushroom_blue: 'boing', toadstool: 'boing', pumpkin: 'thud', rock: 'thud', stump: 'thud',
  snowman: 'snow', log: 'thud', fence: 'knock', burrow: 'knock', butterfly: 'flutter',
}
const LEAF_MATS = ['canopy', 'pine', 'bush', 'grass', 'petal', 'cap_red', 'cap_mushroom_red', 'cap_mushroom_blue', 'pumpkin', 'wing']
function colorOf(obj, fallback) {
  let c = null
  obj.traverse((o) => {
    if (!c && o.isMesh && LEAF_MATS.includes(o.material.name)) c = `#${o.material.color.getHexString()}`
  })
  return c ?? fallback
}
function poke(sx, sy) {
  ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (game.state !== 'play') {
    // Pip, on the menu and at home: the whole bunny counts, plus a little around him
    tmp.set(game.x, bunny.y + 0.8, 0).project(camera)
    const near = Math.hypot(((tmp.x + 1) / 2) * innerWidth - sx, ((1 - tmp.y) / 2) * innerHeight - sy) < Math.min(innerWidth, innerHeight) * 0.12
    if (near || raycaster.intersectObject(bunny.root, true).length) {
      const kind = bunny.tickle()
      if (kind) {
        sound.hop(kind === 'double')
        sound.giggle()
        effects.sparkle(tmp.set(game.x, bunny.y + 1.2, 0), 10, ['#ff9fba', '#ffffff', '#ffd23f'], 3)
      }
      return
    }
  }
  // While hopping along every tap is a hop, so scenery only wobbles when hit
  // squarely, and quietly: the hop makes the sound.
  const playing = game.state === 'play'
  const hit = world.poke(raycaster, camera, sx, sy, !playing, course.obstacles())
  if (!hit) return
  const kind = POKE[hit.kind] ?? 'boing'
  if (!playing) sound.poke(kind)
  if (kind === 'tree') effects.leaves(hit.top, hit.kind.endsWith('_snow') ? '#ffffff' : colorOf(hit.obj, '#7bd14b'))
  else if (kind === 'snow') effects.puff(hit.top, 10, '#ffffff', 1.2)
  else if (kind === 'knock' && hit.kind === 'burrow') effects.puff(world.chimney(tmp2), 6, '#ffffff', 1)
  else effects.sparkle(hit.top, 8, [colorOf(hit.obj, '#ffd23f'), '#ffffff'], 2.5)
}
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
      game.streak = game.combo && !ev.gold ? game.streak + 1 : ev.gold ? 0 : 1
      game.comboTimer = 1.1
      game.score += ev.gold ? 5 : 1
      bumpScore()
      bunny.munch()
      if (ev.gold) {
        sound.gold()
        effects.sparkle(ev.pos, 24, ['#ffe066', '#ffffff', '#ffb000'], 4.5)
        popups.show('+5', ev.pos.setY(ev.pos.y + 0.6), 'gold')
      } else {
        sound.munch(game.combo)
        effects.crumbs(ev.pos)
        effects.sparkle(ev.pos, 5, undefined, 2)
        // a row of carrots counts up in one spot above Pip: +1, +2, +3…
        popups.show(`+${game.streak}`, tmp.set(game.x + 0.4, bunny.y + 1.9, 0), '', true)
        if (game.combo >= 3 && game.combo % 2 === 1) popups.show(pick(YUM), tmp.set(game.x + 1.4, bunny.y + 2.9, 0), 'nice')
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
    py = view.height + bunny.y * 0.25
    pz = view.dist
    lx = game.x + lead
    ly = view.aim + bunny.y * view.follow
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
    const target = speedAt(game.x) * game.slow * adventure.pace
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
  glints.update(dt, camera, game.time, weather.kind === 'snow' && game.state !== 'menu')
  effects.update(dt)
  renderer.render(scene, camera)
}

init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})

if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game }
