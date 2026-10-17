import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { BIOME_LENGTH, BIOMES, HOME_X, biomeIndexAt, setTripLength, shuffleTrip } from './biomes.js'
import { Bunny, SPRING } from './bunny.js'
import { BALLOONS, Course, STOMP_BOUNCE, makeBalloon, makeHedgehog, makeRainbow, speedAt } from './course.js'
import { Effects, Glints, Weather } from './effects.js'
import { copy, loadModels } from './models.js'
import { clamp, easeStep, pick, rand } from './util.js'
import { MOODS, World } from './world.js'

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
  // (upright: a little less path, so Pip is a good size on a narrow phone)
  view.dist = clamp((aspect < 1 ? 4.5 : 9 - 3 * short - 1.7 * boxy) / (tan * aspect), 7, 24)
  // and short screens tilt up further with a high hop, so Pip's ears stay clear of the score
  view.follow = 0.3 + 0.6 * short
  view.halfW = view.dist * tan * aspect
  view.lead = aspect < 1 ? 0.54 + 0.18 * clamp((aspect - 0.75) / 0.25, 0, 1) : 0.45 + short * 0.15 // sideways phones: Pip further left, more path ahead
  // Aim so the path sits low on the screen (about 3/4 of the way down): the sky above holds the
  // HUD, the carrot arcs and the high golden carrots, with little empty grass below.
  view.height = 3.0 + view.dist * (aspect < 1 ? 0.2 : 0.1) // portrait looks down a little more: hills, not empty sky
  const pathBelow = Math.atan(view.height / view.dist) - Math.atan((aspect < 1 ? 0.64 : 0.48) * tan)
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
  golden: 0, // golden carrots caught this trip
  combo: 0, // carrots munched close together: the munch note climbs the scale
  comboTimer: 0,
  stomps: 0, // bounces off the top of things in a row: each bounce rings a note higher
  idle: 0, // seconds in play since the last tap: a long wait brings the hand back
  biome: 0,
  homeTime: 0,
  time: 0,
  shake: 0,
  gentle: false, // the 🐢 slow pace for the littlest hoppers
  garden: 0, // things grown in the burrow's garden on this device: one a trip, more for 🌟 golden carrots
  surprises: [], // this trip's rare moments (see SURPRISES)
  lastSurprises: [],
  trips: 0, // trips home on this device: every fourth is a party trip, full of surprises
  met: [], // the surprises met on trips so far: each leaves a keepsake at the burrow
  seen: {}, // how often each kind of surprise has come up: the rarer ones come up more
  metCount: {}, // how many times each surprise has been met: its keepsake grows (a hedgehog family, a bunch of balloons)
  marks: { lily: 0, frog: 0, stones: 0 }, // skill's marks at the burrow: a perfect stream's lily pad and frog, stomp chains' stone stack
  lastMood: null,
  balloon: null, // the balloon Pip is holding, while he floats
}
try {
  localStorage.removeItem('bunny-hop:gentle')
  game.garden = Number(localStorage.getItem('bunny-hop:garden')) || 0
  game.lastSurprises = (localStorage.getItem('bunny-hop:surprises') ?? '').split(',')
  game.trips = Number(localStorage.getItem('bunny-hop:trips')) || 0
  game.met = (localStorage.getItem('bunny-hop:met') ?? '').split(',').filter(Boolean)
  game.seen = JSON.parse(localStorage.getItem('bunny-hop:seen') ?? '{}') ?? {}
  game.metCount = JSON.parse(localStorage.getItem('bunny-hop:metCount') ?? '{}') ?? {}
  Object.assign(game.marks, JSON.parse(localStorage.getItem('bunny-hop:marks') ?? '{}'))
} catch {}
const remember = (key, value) => {
  try {
    localStorage.setItem(`bunny-hop:${key}`, String(value))
  } catch {}
}
/** The 🐢 pace. */
const GENTLE = 0.65
// the menu camera's distance from Pip: upright, sideways tablets, sideways phones (close, to fill the short view)
const menuZ = () => (innerWidth < innerHeight ? 8.5 : innerHeight > 480 ? 8 : 6.6)
const SURPRISES = ['friend', 'balloon', 'rainbow', 'stream', 'hedgehogs']
const HOLD_MS = 1000 // in play, 🏠 and 🔊 need a short press and hold, so a stray tap never quits or mutes
const IDLE_HINT = 6 // seconds with no tap (and a log coming) before the hand shows again
if (new URLSearchParams(location.search).has('debug')) window.game = game

function renderPace() {
  $('pace').setAttribute('aria-pressed', String(game.gentle))
  $('pace').classList.toggle('gentle', game.gentle)
}
renderPace()
function togglePace() {
  sound.unlock()
  game.gentle = !game.gentle
  renderPace()
  sound.pace(game.gentle)
}

let bunny, world, course, effects, weather, glints, babyModel
const camPos = new THREE.Vector3(1.2, 2, 8)
const camLook = new THREE.Vector3(0.3, 1.1, 0)
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

async function init() {
  const { bunny: model, templates } = await loadModels((k) => ($('load-bar').style.width = `${10 + k * 90}%`))
  babyModel = model.clone(true)
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
  world.camera = camera
  course = new Course(scene, templates)
  home.templates = templates
  effects = new Effects(scene)
  weather = new Weather(scene)
  weather.setKind(weatherOf(BIOMES[0]))
  glints = new Glints(scene)
  if (window.game) Object.assign(window, { course, view, camera, bunny, world, home, friend, BIOMES })
  applyQuality()
  toMenu()
  requestAnimationFrame(frame)
}

function show(id) {
  for (const s of ['loading', 'menu', 'results']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', id !== null)
  $('mute').classList.toggle('hidden', id === 'loading')
  $('home').classList.toggle('hidden', id === 'loading' || id === 'menu')
}

/** Every way back (🏠, Escape) comes here. */
function toMenu() {
  game.state = 'menu'
  game.x = 0
  sound.music(false)
  clearTimeout(bannerTimer)
  $('banner').classList.remove('show')
  newTrip()
  bunny.reset()
  world.reset()
  course.reset()
  home.clear()
  friend.clear()
  dropBalloon()
  game.biome = 0
  weather.setKind(weatherOf(BIOMES[0]))
  // Coming home from a trip: cut straight to the close-up of Pip, never pan back across the whole trip.
  camPos.set(game.x + 0.6, 1.6, menuZ())
  camLook.set(game.x + 0.1, 1.2, 0)
  show('menu')
}

/** A place's weather: at night, fireflies come out everywhere but the snow. */
const weatherOf = (b) => (world.mood === 'night' && b.weather !== 'snow' ? 'fireflies' : b.weather)

/** The next trip's places in a new order, and its time of day: the menu shows where it starts. */
function newTrip() {
  shuffleTrip()
  // a new time of day too: the same one twice running only if it comes up twice
  const roll = () => {
    const r = Math.random()
    return r < 0.45 ? 'day' : r < 0.75 ? 'sunset' : 'night'
  }
  // (?mood=night tries one out)
  const asked = new URLSearchParams(location.search).get('mood')
  let mood = asked in MOODS ? asked : roll()
  if (mood === game.lastMood && !(asked in MOODS)) mood = roll()
  game.lastMood = mood
  world.setMood(mood)
  showStops()
}

function start() {
  if ((game.state === 'home' || game.state === 'results') && (home.sprouts.length || home.toDrop > 0)) return
  setTripLength(game.gentle)
  // "hop again" from home: a new route (the menu has already chosen one)
  if (game.state !== 'menu') newTrip()
  sound.unlock()
  sound.click()
  sound.music(true)
  game.state = 'play'
  game.speed = 0
  game.slow = 1
  game.score = 0
  game.golden = 0
  game.skill = 0 // golden carrots, flip-only 🌟, stomp chains and perfect streams: the garden grows with it
  game.chains = game.perfects = 0
  game.dizzy = 0
  game.bubbles = 0
  game.combo = game.comboTimer = game.stomps = 0
  game.idle = 0
  game.time = 0
  // ?biome=2 starts further along the trip (for trying out the later places)
  const skip = clamp(Number(new URLSearchParams(location.search).get('biome')) || 0, 0, BIOMES.length - 1)
  game.x = skip ? skip * BIOME_LENGTH + 1 : 0
  game.biome = skip
  bunny.reset()
  world.reset(game.x)
  course.reset(game.x)
  home.clear()
  friend.clear()
  dropBalloon()
  // two rare surprises a trip, one early and one late: never one of the last trip's two, and the
  // kinds met least often are the likeliest (?surprise=balloon tries one out first)
  const asked = new URLSearchParams(location.search).get('surprise')
  const draw = (count) => {
    const chosen = SURPRISES.includes(asked) ? [asked] : []
    while (chosen.length < count) {
      const left = SURPRISES.filter((k) => !chosen.includes(k))
      const fresh = left.filter((k) => !game.lastSurprises.includes(k))
      const pool = fresh.length ? fresh : left
      const weights = pool.map((k) => 1 / (1 + (game.seen[k] ?? 0)) ** 2)
      let r = Math.random() * weights.reduce((a, b) => a + b, 0)
      chosen.push(pool.find((_, i) => (r -= weights[i]) < 0) ?? pool[0])
    }
    return chosen
  }
  // every fourth trip is a party: four surprises, spread through all the places
  game.surprises = draw(game.trips % 4 === 3 ? 4 : 2)
  for (const k of game.surprises) game.seen[k] = (game.seen[k] ?? 0) + 1
  game.lastSurprises = game.surprises.slice(-2)
  remember('surprises', game.lastSurprises.join(','))
  remember('seen', JSON.stringify(game.seen))
  const n = game.surprises.length
  game.surprises.forEach((kind, i) => {
    const at = Math.max(game.x + 40, (0.6 + (i + rand(0.1, 0.8)) * (2.9 / n)) * BIOME_LENGTH)
    if (kind === 'friend') friend.at = at
    else course.surprises.push({ kind, x: at })
  })
  // and on about half the trips, one rare pattern: a heart of carrots over a spring, or stairs up to a flip-only 🌟
  if (Math.random() < 0.5) course.surprises.push({ kind: pick(['heart', 'goldstairs']), x: Math.max(game.x + 60, rand(0.4, 3.6) * BIOME_LENGTH) })
  course.surprises.sort((a, b) => a.x - b.x)
  // swoop out from a close-up of Pip (and never pan across the whole trip)
  camPos.set(game.x + 0.6, 1.6, 6.5)
  camLook.set(game.x + 0.1, 1.1, 0)
  weather.setKind(weatherOf(BIOMES[game.biome]))
  $('score-num').textContent = '0'
  $('tap-hint').classList.remove('gone')
  show(null)
  banner(BIOMES[game.biome].emoji)
}

/** The trip bar's stops: this trip's places in order, then home. */
function showStops() {
  $('trip-stops').replaceChildren(...[...BIOMES.map((b) => b.emoji), '🏡'].map((e) => Object.assign(document.createElement('span'), { textContent: e })))
}

/** A little bunny that joins Pip on some trips: it runs along just behind him, copying his hops. */
const friend = {
  at: Infinity, // where on the path it turns up
  root: null,
  x: 0,
  trail: [], // Pip's recent heights, so the friend hops a moment after him
  clear() {
    if (this.root) scene.remove(this.root)
    this.root = null
    this.at = Infinity
    this.trail = []
  },
  update(dt) {
    if (!this.root) {
      if (game.x < this.at) return
      this.root = new THREE.Group()
      const body = babyModel.clone(true)
      body.scale.setScalar(0.62)
      body.rotation.y = -0.6
      this.root.add(body)
      this.root.userData.kind = 'friend'
      this.x = game.x - view.halfW - 3
      this.root.position.set(this.x, 0, -1.7)
      scene.add(this.root)
      this.hello = false
    }
    this.trail.push(bunny.y)
    if (this.trail.length > 12) this.trail.shift()
    const goal = game.x - 1.9
    this.x = THREE.MathUtils.damp(this.x + game.speed * dt, goal, 1.2, dt)
    if (!this.hello && Math.abs(this.x - goal) < 0.4) {
      this.hello = true
      sound.giggle()
      effects.sparkle(tmp.set(this.x, 1, -1.7), 10, ['#ff9fba', '#ffffff', '#ffd23f'], 2.5)
    }
    // copies Pip's hops a beat later (a little lower), and skips along while running
    const skip = Math.abs(Math.sin(game.time * game.speed * 1.9)) * 0.12
    this.root.position.set(this.x, this.trail[0] * 0.85 + skip, -1.7)
  },
}

/** Lets go of the balloon (it floats off and pops with a sparkle). */
function dropBalloon(pop = false) {
  const b = game.balloon
  if (!b) return
  game.balloon = null
  scene.remove(b.obj)
  if (!pop) return
  sound.pop()
  effects.sparkle(tmp.copy(b.obj.position).setY(b.obj.position.y + 1.5), 18, [b.color, '#ffffff', '#ffd23f'], 3.5)
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

function hop(auto = false) {
  if (game.state !== 'play') return
  game.idle = 0
  const kind = bunny.hop(auto)
  if (!kind) return
  sound.hop(kind === 'double')
  tmp.set(game.x, 0, 0)
  if (kind === 'hop') effects.puff(tmp, 6, dustColor(), 0.9)
  else effects.sparkle(tmp.set(game.x, bunny.y + 0.5, 0), 8, ['#ffffff', '#bfe6ff'], 2.5)
  $('tap-hint').classList.add('gone')
}

const dustColor = () => BIOMES[game.biome].dust

function finish() {
  game.state = 'home'
  game.homeTime = 0
  bunny.celebrate(4)
  sound.music(false)
  sound.finish()
  clearTimeout(bannerTimer)
  $('banner').classList.remove('show')
  $('tap-hint').classList.add('gone')
  tmp.set(HOME_X + 1, 1.5, -1)
  effects.confettiBurst(tmp, 24, true)
  // the garden grows one thing for the trip, and more for skill: a 🌟 is 1, a flip-only 🌟, a stomp
  // chain or a perfect stream 2 or 3, and every 2 of those grow one more thing (up to 6 more)
  const grow = 1 + Math.min(6, Math.floor(game.skill / 2))
  game.garden += grow
  remember('garden', game.garden)
  game.trips++
  remember('trips', game.trips)
  // each surprise met leaves a keepsake at the burrow, which grows each time it is met again; and
  // skill leaves its marks: a perfect stream a lily pad (then a frog), each stomp chain a stone
  const metNow = game.surprises.filter((k) => k !== 'friend' || friend.root)
  for (const k of metNow) {
    if (!game.met.includes(k)) game.met.push(k)
    game.metCount[k] = (game.metCount[k] ?? 0) + 1
  }
  const before = { ...game.marks }
  for (let i = 0; i < game.perfects; i++) game.marks.lily ? (game.marks.frog = 1) : (game.marks.lily = 1)
  game.marks.stones = Math.min(5, game.marks.stones + game.chains)
  remember('met', game.met.join(','))
  remember('metCount', JSON.stringify(game.metCount))
  remember('marks', JSON.stringify(game.marks))
  home.arrive(grow, metNow, before)
  friend.clear()
  dropBalloon(true)
}

/** A 🌟 flies from the score (then the results card) to the thing it is about to grow. */
function flyStar(at) {
  const stars = [...$('haul-gold').children].filter((el) => !el.classList.contains('spent'))
  const from = (game.state === 'home' ? $('score') : stars[0] ?? $('haul')).getBoundingClientRect()
  stars[0]?.classList.add('spent')
  tmp.copy(at).setY(at.y + 0.6).project(camera)
  const to = { x: ((tmp.x + 1) / 2) * innerWidth, y: ((1 - tmp.y) / 2) * innerHeight }
  const star = Object.assign(document.createElement('div'), { className: 'flying-star', textContent: '🌟' })
  document.body.append(star)
  const sx = from.left + from.width / 2
  const sy = from.top + from.height / 2
  const mid = { x: (sx + to.x) / 2, y: Math.min(sy, to.y) - 80 }
  const anim = star.animate(
    [
      { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(1)` },
      { transform: `translate(${mid.x}px, ${mid.y}px) translate(-50%, -50%) scale(1.3)`, offset: 0.45 },
      { transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(0.5)`, opacity: 0.4 },
    ],
    { duration: 700, easing: 'ease-in-out' },
  )
  anim.onfinish = () => star.remove()
}

/** The results card: the carrots Pip brought home, and the golden ones. */
function showResults() {
  game.state = 'results'
  $('haul-num').textContent = game.score
  $('haul-gold').replaceChildren(...Array.from({ length: Math.min(game.golden, 12) }, () => Object.assign(document.createElement('span'), { textContent: '🌟' })))
  $('haul').setAttribute('aria-label', `${game.score} carrots, ${game.golden} golden`)
  show('results')
}

/**
 * The burrow's garden grows by one thing each trip home, and more for skill (kept on this device):
 * [model, x from home, z, scale]. First the scenery round the burrow, then a vegetable patch,
 * lanterns that glow at night, a swing and a few more flowers, all kept off the open lawn in front
 * of Pip. All of it stays in view on an upright phone. Snowy things grow only in the snow.
 */
const DECOR = [
  ['mushroom_red', 3.9, -2.3, 0.4],
  ['pumpkin', 4.1, -1.5, 0.75],
  ['fence', -3.3, -2.7, 1],
  ['flower', -0.5, -1.5, 1.3],
  ['tree_round', 4.7, -5.6, 0.7],
  ['mushroom_blue', -3.1, -1.3, 0.35],
  ['bush', -1.5, -3.1, 0.8],
  ['snowman', 4.6, -3.3, 0.7],
  ['flower', 0.3, -1.7, 1.2],
  ['mushroom_red', -2.4, -2.2, 0.3],
  ['tree_pine', -3.6, -4.4, 0.7],
  ['pumpkin', -2.0, -1.0, 0.5],
  ['flower', 4.4, -0.6, 1.2],
  ['mushroom_blue', 2.6, -3.6, 0.5],
  ['bush', 0.9, -4.2, 0.9],
  ['flower', -1.0, -1.2, 1.1],
  ['lantern', -3.0, -0.6, 1],
  ['veg', -2.6, -1.8, 0.65],
  ['veg', -2.1, -1.9, 0.65],
  ['swing', -2.4, -4.2, 1],
  ['veg', -1.6, -1.9, 0.65],
  ['lantern', 4.5, -0.2, 1],
  ['flower', -3.0, 1.6, 1.0],
  ['tree_pine', -1.0, -5.8, 0.8],
  ['flower', 4.3, 1.4, 1.0],
]
const SNOWLESS = { tree_round: 'tree_round', tree_pine: 'tree_pine', snowman: 'bush' }
const SNOWY = { tree_round: 'tree_round_snow', tree_pine: 'tree_pine_snow', snowman: 'snowman' }

/** Little garden things made from simple shapes: a lantern, a swing, a carrot growing in the patch. */
const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.8 })
function makeLantern() {
  const obj = new THREE.Group()
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.8, 6), wood)
  post.position.y = 0.4
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
  lamp.position.y = 0.92
  obj.add(post, lamp)
  return obj
}
function makeSwing() {
  const obj = new THREE.Group()
  for (const x of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), wood)
    leg.position.set(x, 0.85, 0)
    obj.add(leg)
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), wood)
  bar.rotation.z = Math.PI / 2
  bar.position.y = 1.7
  const seat = new THREE.Group() // swings from the bar
  seat.position.y = 1.7
  for (const x of [-0.25, 0.25]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4), new THREE.MeshBasicMaterial({ color: '#f3e2c0' }))
    rope.position.set(x, -0.6, 0)
    seat.add(rope)
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 0.25), new THREE.MeshStandardMaterial({ color: '#ff6b9d', roughness: 0.6 }))
  board.position.y = -1.2
  seat.add(board)
  obj.add(bar, seat)
  obj.userData.swing = seat
  return obj
}
function makeFrog() {
  const obj = new THREE.Group()
  const green = new THREE.MeshStandardMaterial({ color: '#6cc644', roughness: 0.6 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), green)
  body.scale.set(1.1, 0.75, 1)
  body.position.y = 0.11
  obj.add(body)
  for (const x of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), green)
    eye.position.set(x, 0.22, 0.06)
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: '#1d1d1d' }))
    dot.position.set(x, 0.23, 0.105)
    obj.add(eye, dot)
  }
  return obj
}
function makeVeg(carrot) {
  const obj = new THREE.Group()
  const top = copy(carrot)
  top.position.y = 0.12
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7a4f2c', roughness: 1 }))
  mound.scale.y = 0.35
  obj.add(top, mound)
  return obj
}

/**
 * Home at the burrow: little bunnies wait by the door and hop for joy when Pip arrives (and a friend
 * who came along joins them), the garden grows something new, and the carrots he brought tumble out
 * of the sky into a heap by the door, one soft note each.
 */
const home = {
  templates: null,
  babies: [],
  pile: [],
  decor: [],
  sprouts: [], // this trip's new things in the garden, popping up one after another
  toDrop: 0,
  dropTimer: 0,
  clear() {
    for (const b of this.babies) scene.remove(b.root)
    for (const c of this.pile) scene.remove(c.obj)
    for (const d of this.decor) scene.remove(d)
    this.babies = []
    this.pile = []
    this.decor = []
    this.sprouts = []
    this.toDrop = 0
  },
  /**
   * `grow`: how many garden things are new this trip; `metNow`: the surprises met on it (their
   * keepsakes grow); `before`: the skill marks as they were before it (the new ones pop up).
   */
  arrive(grow, metNow, before) {
    this.clear()
    // The garden: earlier trips stay, and new things begin growing before the card. Skill-earned
    // things each get a flying 🌟; once every spot is planted the
    // trees, bushes and mushrooms grow a little bigger (never so big they hide the burrow)
    const grown = Math.min(game.garden, DECOR.length)
    const bigger = 1 + Math.min(0.3, Math.max(0, game.garden - DECOR.length) * 0.05)
    const last = BIOMES[BIOMES.length - 1]
    const swap = last.weather === 'snow' ? SNOWY : SNOWLESS
    for (let i = 0; i < grown; i++) {
      const [kind, dx, dz, s] = DECOR[i]
      const name = swap[kind] ?? kind
      const obj =
        name === 'lantern' ? makeLantern()
        : name === 'swing' ? makeSwing()
        : name === 'veg' ? makeVeg(this.templates.carrot)
        : copy(this.templates[name], { recolor: name === 'flower' ? { petal: ['#ff6b9d', '#ffd23f', '#b28dff'] } : last.recolor, shadow: true })
      obj.position.set(HOME_X + dx, 0, dz)
      obj.rotation.y = name === 'fence' || name === 'swing' ? 0 : rand(-0.6, 0.6)
      obj.userData.s = s * (/tree|bush|mushroom/.test(name) ? bigger : 1)
      obj.scale.setScalar(obj.userData.s)
      this.add(obj)
    }
    // this trip's new spots; once the garden is full, the trip's growth goes to the trees, bushes and
    // mushrooms instead (each pops up a little bigger)
    const planted = Math.min(Math.max(0, game.garden - grow), DECOR.length)
    const newly = this.decor.slice(planted, grown)
    const extra = grow - newly.length
    const growing = extra > 0 ? this.decor.filter((_, i) => /tree|bush|mushroom/.test(DECOR[i][0])).slice(-extra) : []
    const fresh = [...newly, ...growing].map((obj, i) => ({ obj, star: i > 0 }))
    // keepsakes of the surprises met so far, bigger each time one is met again
    for (const kind of game.met) {
      const obj = this.keepsake(kind, game.metCount[kind] ?? 1)
      if (!obj) continue
      this.add(obj)
      if (metNow.includes(kind)) fresh.push({ obj, star: false })
    }
    // skill's marks: the stone stack from stomp chains, the lily pad and frog of perfect streams
    if (game.marks.stones) {
      const stack = this.cairn(game.marks.stones)
      this.add(stack)
      if (game.marks.stones > before.stones) fresh.push({ obj: stack, star: true })
    }
    if (game.marks.lily && !game.met.includes('stream')) {
      const pond = this.keepsake('stream', 1)
      this.add(pond)
      if (!before.lily) fresh.push({ obj: pond, star: true })
    } else if (game.marks.lily > before.lily || game.marks.frog > before.frog) {
      const pond = this.decor.find((d) => d.userData.pond)
      if (pond && !fresh.some((f) => f.obj === pond)) fresh.push({ obj: pond, star: true })
    }
    // Start with six flags, then add one each homecoming up to 48.
    // The garland colours turn with the seasons; the flower arch changes every trip.
    const colours = ['#ff6b9d', '#ffd23f', '#55bfc2', '#ad87e8', '#ff994d', '#89c94d']
    const flags = new THREE.Group()
    const countFlags = Math.min(48, game.trips + 5)
    const season = Math.floor(game.trips / 4)
    for (let i = 0; i < countFlags; i++) {
      const row = Math.floor(i / 12)
      const col = i % 12
      const shape = new THREE.Shape()
      shape.moveTo(-0.23, 0)
      shape.lineTo(0.23, 0)
      shape.lineTo(0, -0.55)
      shape.closePath()
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: colours[(i + season) % colours.length], side: THREE.DoubleSide, roughness: 0.8 }))
      flag.position.set(-3.1 + col * 0.56, 4.5 + row * 0.7 - Math.sin(col / 11 * Math.PI) * 0.25, 0)
      flags.add(flag)
    }
    // A rope makes this read as a party garland rather than floating triangles.
    const rope = new THREE.LineBasicMaterial({ color: '#775837' })
    for (let row = 0; row <= Math.floor((countFlags - 1) / 12); row++) {
      const points = Array.from({ length: 13 }, (_, j) => new THREE.Vector3(-3.4 + j * 0.56, 4.5 + row * 0.7 - Math.sin(j / 12 * Math.PI) * 0.25, 0))
      flags.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), rope))
    }
    flags.position.set(HOME_X, 0, -4.5)
    flags.userData.s = 1
    flags.userData.pennants = countFlags
    this.add(flags)
    fresh.push({ obj: flags, star: false })
    // A new seasonal flower arch each homecoming, even after every plot is full.
    const blossoms = new THREE.Group()
    const palette = [['#ff83b4', '#fff1a8'], ['#ffd23f', '#ff994d'], ['#b28dff', '#68d6df'], ['#f5fbff', '#9ecaff']][game.trips % 4]
    for (let i = 0; i < 9; i++) {
      const flower = copy(this.templates.flower, { recolor: { petal: palette }, shadow: true })
      const a = i / 8 * Math.PI
      flower.position.set(Math.cos(a) * 1.15, 0.05 + Math.sin(a) * 1.25, 0)
      flower.scale.setScalar(0.75)
      blossoms.add(flower)
    }
    blossoms.position.set(HOME_X + 1.6, 0, -1.2)
    blossoms.userData.s = 1
    blossoms.userData.season = game.trips % 4
    this.add(blossoms)
    fresh.push({ obj: blossoms, star: false })
    const neighbours = Math.min(3, Math.max(0, Math.floor((game.trips - 3) / 3)))
    for (let i = 0; i < neighbours; i++) {
      const h = makeHedgehog().obj
      h.position.set(HOME_X - 2.0 + i * 0.65, 0, 1.5)
      h.scale.multiplyScalar(innerWidth / innerHeight > 1.8 ? 0.28 : 0.36)
      h.userData.s = h.scale.x
      this.add(h)
      if (game.trips === 6 + i * 3) fresh.push({ obj: h, star: false })
    }
    // Growth begins before the card; replay waits for every sprout to settle.
    fresh.forEach((f, i) => {
      f.obj.scale.setScalar(0.001)
      this.sprouts.push({ ...f, t: -1.15 - i * 0.48 })
    })
    // more little bunnies as the garden grows, and the friend once it has come along (twice: two)
    const count = Math.min(5, 2 + Math.min(2, game.metCount.friend ?? 0) + Math.floor(game.garden / 8))
    const spots = [[2.3, -0.4, 0.55], [3.1, -0.9, 0.48], [1.6, 0.5, 0.6], [3.8, 0.1, 0.5], [2.9, 0.9, 0.45], [4.3, -1.2, 0.42]]
    for (const [dx, dz, s] of spots.slice(0, count)) {
      const root = new THREE.Group()
      const body = babyModel.clone(true)
      body.scale.setScalar(s)
      body.rotation.y = -1.3 + rand(-0.2, 0.2)
      root.add(body)
      root.position.set(HOME_X + dx, 0, dz)
      root.userData.kind = 'baby'
      scene.add(root)
      this.babies.push({ root, body, s, y: 0, vy: 0, wait: rand(0.2, 0.8) })
    }
    // the pile: up to 30 carrots (each one standing for more on a big haul)
    this.toDrop = Math.min(30, game.score)
    this.dropTimer = 1.2
  },
  add(obj) {
    scene.add(obj)
    this.decor.push(obj)
  },
  /**
   * What a surprise leaves at the burrow, grown by how often it has been met (`level`): a hedgehog
   * family, a bunch of balloons by the door, a double rainbow, a pond (with a lily pad and a frog
   * once a stream has been crossed perfectly).
   */
  keepsake(kind, level) {
    const obj = new THREE.Group()
    obj.userData.s = 1
    if (kind === 'hedgehogs') {
      // mum first, then little ones beside her
      ;[[0, 0, 0.9], [0.55, 0.25, 0.55], [-0.45, 0.35, 0.5]].slice(0, Math.min(3, level)).forEach(([dx, dz, s]) => {
        const h = makeHedgehog().obj
        h.rotation.y = Math.PI / 2 // face the child
        h.position.set(dx, 0, dz)
        h.scale.multiplyScalar(s)
        obj.add(h)
      })
      obj.position.set(HOME_X - 2.4, 0, 0.15)
      obj.userData.s = innerWidth / innerHeight > 1.8 ? 0.38 : 0.48
      obj.scale.setScalar(obj.userData.s)
    } else if (kind === 'balloon') {
      for (let i = 0; i < Math.min(4, level); i++) {
        const b = makeBalloon(BALLOONS[i % BALLOONS.length])
        b.scale.setScalar(0.8)
        b.position.set((i - (Math.min(4, level) - 1) / 2) * 0.5, i % 2 ? 0.25 : 0, -i * 0.1)
        b.rotation.z = (i - 1.5) * 0.12
        obj.add(b)
      }
      obj.position.set(HOME_X - 1.1, 0.5, -1.9)
      obj.userData.bob = true
    } else if (kind === 'rainbow') {
      obj.add(makeRainbow(10))
      if (level > 1) {
        const second = makeRainbow(14)
        second.position.z = -1
        second.children.forEach((band) => (band.material.opacity = 0.4))
        obj.add(second)
      }
      obj.position.set(HOME_X + 1.6, 0, -11)
    } else if (kind === 'stream') {
      // a little pond, with a stepping stone
      const pond = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32),
        new THREE.MeshStandardMaterial({ color: '#5fb6f0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9, depthWrite: false }),
      )
      pond.rotation.x = -Math.PI / 2
      pond.scale.set(1.0, 0.55, 1)
      pond.position.y = 0.04
      const stone = copy(this.templates.rock)
      stone.scale.set(0.4, 0.2, 0.4)
      stone.position.set(0.4, 0, 0.1)
      obj.add(pond, stone)
      if (game.marks.lily) {
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20, 0.3, Math.PI * 1.8), new THREE.MeshStandardMaterial({ color: '#5bb04a', roughness: 0.7 }))
        pad.rotation.x = -Math.PI / 2
        pad.position.set(-0.35, 0.06, 0.05)
        obj.add(pad)
        if (game.marks.frog) {
          const frog = makeFrog()
          frog.position.set(-0.35, 0.06, 0.05)
          obj.add(frog)
        }
      }
      obj.position.set(HOME_X - 1.6, 0, 1.5)
      obj.userData.s = 0.8
      obj.scale.setScalar(0.8)
      obj.userData.pond = true
    } else return null
    return obj
  },
  /** The stack of round stones that stomp chains build, one stone each (up to five). */
  cairn(count) {
    const obj = new THREE.Group()
    let y = 0
    for (let i = 0; i < count; i++) {
      const stone = copy(this.templates.rock, { recolor: { stone: ['#a3adb9', '#8f99a6'][i % 2], moss: ['#a3adb9'] } })
      const w = 0.5 - i * 0.07
      stone.scale.set(w, 0.32, w)
      stone.position.y = y
      stone.rotation.y = i * 0.9
      y += 0.62 * 0.32 + 0.02
      obj.add(stone)
    }
    obj.position.set(HOME_X - 0.5, 0, 1.6)
    obj.userData.s = 1
    return obj
  },
  /** This trip's new things in the garden spring up out of the ground, each with a twinkle. */
  grow(dt) {
    for (const sp of this.sprouts) this.sprout(sp, dt)
    this.sprouts = this.sprouts.filter((sp) => sp.t < 0.6)
  },
  sprout(sp, dt) {
    const was = sp.t
    sp.t += dt
    // The ones skill earned get a 🌟 from the score or card before sprouting.
    if (sp.star && was < -0.7 && sp.t >= -0.7) flyStar(sp.obj.position)
    if (was < 0 && sp.t >= 0) {
      sound.gold()
      effects.sparkle(tmp.copy(sp.obj.position).setY(0.6), 16, ['#ffe066', '#ffffff', '#8ac926'], 3)
    }
    if (sp.t < 0) return
    // overshoot a little and settle, like a spring
    const k = Math.min(1, sp.t / 0.6)
    const s = sp.obj.userData.s * (1 + Math.sin(k * Math.PI) * 0.35 * (1 - k * 0.5)) * Math.min(1, k * 2)
    sp.obj.scale.setScalar(Math.max(0.001, s))
    if (k >= 1) sp.obj.scale.setScalar(sp.obj.userData.s)
  },
  /** A little bunny tapped: it squeaks and hops. */
  tickle(b) {
    if (b.y > 0.01) return
    b.vy = 7
    sound.giggle()
    effects.sparkle(tmp.set(b.root.position.x, 1, b.root.position.z), 8, ['#ff9fba', '#ffffff', '#ffd23f'], 2.5)
  },
  update(dt) {
    this.grow(dt)
    for (const d of this.decor) {
      if (d.userData.bob) d.position.y = 0.5 + Math.sin(game.time * 1.6) * 0.1
      if (d.userData.swing) d.userData.swing.rotation.x = Math.sin(game.time * 1.8) * 0.35
    }
    for (const b of this.babies) {
      b.wait -= dt
      if (b.y <= 0 && b.wait <= 0) {
        b.vy = rand(5, 7)
        b.wait = game.homeTime < 4 ? rand(0.5, 0.9) : rand(1.5, 3.5)
      }
      b.vy -= 30 * dt
      b.y = Math.max(0, b.y + b.vy * dt)
      if (b.y === 0) b.vy = Math.max(0, b.vy)
      const stretch = b.y > 0 ? clamp(b.vy * 0.02, -0.1, 0.15) : 0
      b.root.position.y = b.y
      b.body.scale.set(b.s * (1 - stretch / 2), b.s * (1 + stretch), b.s * (1 - stretch / 2))
    }
    if (this.toDrop > 0 && (this.dropTimer -= dt) <= 0) {
      this.dropTimer = 0.11
      this.toDrop--
      const n = this.pile.length
      const obj = copy(this.templates.carrot, { shadow: true })
      // a little heap: a wide bottom layer, narrower above
      const layer = n < 12 ? 0 : n < 21 ? 1 : n < 27 ? 2 : 3
      const across = [12, 9, 6, 3][layer]
      const k = n - [0, 12, 21, 27][layer]
      const rest = { x: HOME_X - 0.8 + (k - across / 2) * 0.14 + rand(-0.05, 0.05), y: 0.12 + layer * 0.17, z: -0.4 + rand(-0.25, 0.25) }
      obj.position.set(rest.x, 2.0 + layer * 0.17, rest.z)
      obj.rotation.set(rand(-0.3, 0.3), rand(0, 6), Math.PI / 2 + rand(-0.4, 0.4))
      obj.scale.setScalar(0.85)
      scene.add(obj)
      this.pile.push({ obj, rest, vy: 0, landed: false, note: n })
    }
    for (const c of this.pile) {
      if (c.landed) continue
      c.vy -= 30 * dt
      c.obj.position.y += c.vy * dt
      if (c.obj.position.y <= c.rest.y) {
        c.obj.position.y = c.rest.y
        c.landed = true
        sound.munch(c.note % 10)
        effects.puff(tmp.set(c.rest.x, c.rest.y, c.rest.z), 3, '#f0dcb4', 0.5)
      }
    }
  },
}

// --- Input: tap / click anywhere, or space, up arrow, W ---------------------------------

// Holding a finger (or the key) down keeps Pip hopping each time he lands: for the littlest hoppers.
const held = { pointers: new Set(), key: false }
const holding = () => held.pointers.size > 0 || held.key
addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (e.target.closest('button')) return
  if (game.state === 'play') {
    held.pointers.add(e.pointerId)
    hop()
  }
  if (game.state !== 'loading') poke(e.clientX, e.clientY)
})
for (const type of ['pointerup', 'pointercancel']) addEventListener(type, (e) => held.pointers.delete(e.pointerId))
addEventListener('blur', () => {
  held.pointers.clear()
  held.key = false
})
addEventListener('keyup', (e) => {
  if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) held.key = false
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
const nearOnScreen = (point, sx, sy, reach) => {
  point.project(camera)
  return Math.hypot(((point.x + 1) / 2) * innerWidth - sx, ((1 - point.y) / 2) * innerHeight - sy) < Math.min(innerWidth, innerHeight) * reach
}
function poke(sx, sy) {
  ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (game.state !== 'play') {
    // Pip, on the menu and at home: the whole bunny counts, plus a little around him
    if (nearOnScreen(tmp.set(game.x, bunny.y + 0.8, 0), sx, sy, 0.12) || raycaster.intersectObject(bunny.root, true).length) {
      const kind = bunny.tickle()
      if (kind) {
        sound.hop(kind === 'double')
        sound.giggle()
        effects.sparkle(tmp.set(game.x, bunny.y + 1.2, 0), 10, ['#ff9fba', '#ffffff', '#ffd23f'], 3)
      }
      return
    }
    // and the little bunnies at the burrow
    const baby = home.babies.find((b) => nearOnScreen(tmp.copy(b.root.position).setY(b.y + 0.4), sx, sy, 0.08))
    if (baby) return home.tickle(baby)
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
    if (document.activeElement?.matches?.('button') && e.code !== 'ArrowUp' && e.code !== 'KeyW') return // the focused button presses itself
    e.preventDefault()
    if (e.repeat) return
    sound.unlock()
    if (game.state === 'menu' || game.state === 'results') start()
    else {
      held.key = true
      hop()
    }
  }
})
addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend()
})
$('play').onclick = start
$('again').onclick = () => {
  if ($('again').getAttribute('aria-disabled') === 'true') {
    sound.unlock()
    sound.click()
    $('again').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg) scale(0.94)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0)' }], { duration: 320 })
    return
  }
  start()
}
function toggleMute() {
  sound.unlock()
  sound.setMuted(!sound.muted)
  $('mute').textContent = sound.muted ? '🔇' : '🔊'
}

/** Every finger (or pointer) down anywhere on the page: a hold starts only with one alone. */
const pointersDown = new Set()
document.addEventListener('pointerdown', (e) => pointersDown.add(e.pointerId), true)
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, (e) => pointersDown.delete(e.pointerId), true)
addEventListener('blur', () => pointersDown.clear())

/**
 * 🏠 and 🔊 need a press held for HOLD_MS while a ring fills, on every screen, so a stray or
 * mashing tap (or a resting hand) never quits or mutes; while hopping, a tap on them is a hop.
 * A hold starts only when its finger is the only one down; any other finger landing cancels it and
 * spoils it until every finger has lifted. Keyboard focus requires a full hold and release too.
 */
function holdable(el, action, menuTap = false) {
  let frame = 0
  let pointer = null // the one finger holding
  let spoiled = false
  const keys = new Set()
  let keyStart = null
  let keySpoiled = false
  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
    pointer = null
    el.classList.remove('holding')
    el.style.removeProperty('--p')
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (pointer !== null && e.pointerId !== pointer) {
        spoiled = true
        stop()
      }
    },
    true,
  )
  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, (e) => {
      if (e.target === el || e.pointerId === pointer) el.blur()
      if (e.pointerId === pointer) {
        const tap = menuTap && game.state === 'menu' && type === 'pointerup' && !spoiled && pointersDown.size === 0
        stop()
        if (tap) action()
      }
      if (pointersDown.size === 0) spoiled = false
    })
  }
  el.addEventListener('pointerdown', (e) => {
    keyStart = null
    keySpoiled = keys.size > 0
    sound.unlock()
    hop()
    stop() // never two holds at once
    if (spoiled || pointersDown.size !== 1) {
      spoiled = true
      return
    }
    pointer = e.pointerId
    const t0 = performance.now()
    el.classList.add('holding')
    const step = () => {
      if (pointer === null) return // cancelled meanwhile
      const p = (performance.now() - t0) / HOLD_MS
      el.style.setProperty('--p', Math.min(1, p))
      if (p < 1) frame = requestAnimationFrame(step)
      else {
        stop()
        const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); document.removeEventListener('click', swallow, true) }
        document.addEventListener('click', swallow, true)
        setTimeout(() => document.removeEventListener('click', swallow, true), 500)
        action()
      }
    }
    frame = requestAnimationFrame(step)
  })
  el.addEventListener('pointerleave', (e) => e.pointerId === pointer && stop())
  // Native keyboard clicks have no duration and must never invoke a hold action.
  el.addEventListener('click', (e) => {
    e.preventDefault()
    if (e.detail > 0) el.blur() // touch compatibility mouse events can focus after pointerup
  })
  document.addEventListener('keydown', (e) => {
    if (!['Enter', 'Space'].includes(e.code)) return
    const fresh = keys.size === 0
    keys.add(e.code)
    if (document.activeElement !== el || !el.matches(':focus-visible')) return
    e.preventDefault()
    if (e.repeat) return
    if (!fresh) { keySpoiled = true; keyStart = null; return }
    keySpoiled = false
    keyStart = performance.now()
    el.classList.add('holding')
    const progress = () => {
      if (keyStart === null) return
      el.style.setProperty('--p', Math.min(1, (performance.now() - keyStart) / HOLD_MS))
      frame = requestAnimationFrame(progress)
    }
    frame = requestAnimationFrame(progress)
  })
  document.addEventListener('keyup', (e) => {
    if (!keys.delete(e.code)) return
    const complete = !keySpoiled && keyStart !== null && keys.size === 0 &&
      document.activeElement === el && el.matches(':focus-visible') && performance.now() - keyStart >= HOLD_MS
    keyStart = null
    cancelAnimationFrame(frame)
    el.classList.remove('holding')
    el.style.removeProperty('--p')
    if (keys.size === 0) keySpoiled = false
    if (complete) action()
  })
  el.addEventListener('blur', () => { keyStart = null; el.classList.remove('holding') })
  addEventListener('blur', () => { keys.clear(); keyStart = null; keySpoiled = false; stop() })
}
holdable($('home'), () => {
  sound.click()
  toMenu()
})
holdable($('mute'), toggleMute)
holdable($('pace'), togglePace, true)
$('mute').textContent = sound.muted ? '🔇' : '🔊'

// --- Main loop ----------------------------------------------------------------------

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'carrot') {
      game.combo = game.comboTimer > 0 ? game.combo + 1 : 0
      game.comboTimer = 1.1
      game.score += 1
      bumpScore()
      bunny.munch()
      if (ev.gold) {
        // a golden carrot's surprise: a shower of carrots tumbles onto the path ahead
        game.golden++
        game.skill += ev.flip ? 2 : 1
        sound.gold()
        sound.shower()
        effects.sparkle(ev.pos, ev.flip ? 40 : 24, ['#ffe066', '#ffffff', '#ffb000'], ev.flip ? 6 : 4.5)
        // the very high one, that only a flip reaches, rains twice as many
        course.shower(game.x, speedAt(game.x), ev.flip ? 14 : 8)
      } else {
        sound.munch(game.combo)
        effects.crumbs(ev.pos)
        effects.sparkle(ev.pos, 5, undefined, 2)
      }
    } else if (ev.type === 'bump') {
      // a soft tumble and a puff of dust: Pip just picks himself up
      // (a short dizzy stop first, so careful hopping pays, then a slow start)
      bunny.bonk()
      game.dizzy = 0.6
      game.slow = 0.25
      game.shake = 0.15
      game.stomps = 0
      sound.bonk()
      // two carrots tumble out of the basket onto the path ahead: stay down to munch them back
      const spill = Math.min(2, game.score)
      if (spill) {
        game.score -= spill
        $('score-num').textContent = game.score
        course.scatter(game.x, spill)
      }
      effects.dizzy(tmp.set(game.x, 1.6, 0))
      effects.puff(ev.pos, 8, dustColor(), 1.3)
    } else if (ev.type === 'stomp') {
      // dropping onto the top of a log, rock, snowman or hedgehog: a squishy bounce off it, each one
      // a note higher; three in a row without touching the ground and carrots rain down
      bunny.bounce(STOMP_BOUNCE)
      sound.stomp(game.stomps++)
      tmp.set(ev.pos.x, ev.h, 0)
      if (ev.name === 'snowman') effects.puff(tmp, 10, '#ffffff', 1.2)
      else effects.sparkle(tmp, 10, ['#ffffff', '#ffd23f', '#bfe6ff'], 3)
      if (ev.name === 'hedgehog') sound.giggle()
      if (game.stomps === 3 && bunny.tapHop) {
        game.skill += 2
        game.chains++
        sound.shower()
        effects.sparkle(tmp.set(game.x, bunny.y + 1, 0), 20, ['#ffe066', '#ffffff', '#ff8a1f'], 4)
        course.shower(game.x, speedAt(game.x), 10)
      }
    } else if (ev.type === 'splash') {
      // water: a splash of drops (a big one for hopping in)
      sound.splash(ev.big)
      effects.splash(ev.pos, ev.big ? 26 : 10, BIOMES[game.biome].weather === 'snow' ? '#e6f4ff' : '#8fd0ff')
    } else if (ev.type === 'perfect') {
      // every stepping stone and not a splash: a rising chime and a twinkle of every colour
      game.skill += 3
      game.perfects++
      sound.gold()
      effects.sparkle(tmp.set(game.x, bunny.y + 1.2, 0), 26, ['#ff6b9d', '#ffd23f', '#36a8ff', '#8ac926', '#ffffff'], 4)
    } else if (ev.type === 'bubble') {
      // a soap bubble popped: a pop and a note, climbing with each one in a row
      sound.bubble(game.bubbles++)
      effects.sparkle(ev.pos, 8, ['#ffffff', '#bfe6ff', '#ffc8f0'], 2.2)
    } else if (ev.type === 'stone') {
      // landing on a stepping stone: a plink, a note higher each stone
      sound.stomp(ev.step + 2)
      effects.splash(ev.pos, 6, '#bfe6ff')
      effects.sparkle(ev.pos, 6, ['#ffffff', '#ffd23f'], 2)
    } else if (ev.type === 'spring') {
      // a springy mushroom: boiiing, sky high, with a flip
      bunny.bounce(SPRING, true)
      sound.spring()
      effects.puff(tmp.set(ev.pos.x, 0.5, 0), 10, '#d9ccff', 1.3)
      effects.sparkle(tmp.set(ev.pos.x, 0.8, 0), 12, ['#b28dff', '#ffffff', '#7ad3ff'], 3.5)
    } else if (ev.type === 'balloon') {
      // a balloon! Pip grabs the string and floats up over a line of carrots, then it pops
      game.balloon = { obj: ev.obj, color: ev.color }
      bunny.float(4.6, 2.55)
      sound.float()
      effects.sparkle(tmp.set(game.x, 1.6, 0), 12, [ev.color, '#ffffff'], 3)
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
    pz = menuZ()
    lx = game.x + 0.1
    // sideways tablets: Pip stands a little further off, so his ears clear the title; sideways
    // phones look up a little, so he stands low, under it
    ly = portrait ? 1.45 : 1.3
  } else if (game.state === 'home' || game.state === 'results') {
    // far enough back that the carrot heap (left), Pip, the burrow and the little bunnies all show
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    px = HOME_X + 0.8
    py = 2.0
    pz = innerWidth < innerHeight ? clamp(3.5 / (tan * camera.aspect), 8, 15) : Math.min(view.dist, 10.5)
    lx = HOME_X + 0.6
    ly = innerWidth < innerHeight ? 1.6 : 1.3
  } else {
    const lead = view.halfW * view.lead
    px = game.x + lead
    // a spring's bounce goes higher than any hop: the view rises a little more with it
    py = view.height + bunny.y * 0.25
    pz = view.dist
    lx = game.x + lead
    const short = clamp((560 - innerHeight) / 200, 0, 1)
    ly = view.aim + bunny.y * view.follow + Math.max(0, bunny.y - 2.4) * (0.35 + short * 0.5)
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

const probe = { x: 0, y: 0, vy: 0, jumps: 0, grounded: true, tumbling: false } // where the bunny is, for the course's hit test
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
    game.dizzy = Math.max(0, game.dizzy - dt)
    const target = game.dizzy > 0 ? 0 : speedAt(game.x) * game.slow * (game.gentle ? GENTLE : 1)
    game.speed = THREE.MathUtils.damp(game.speed, target, 3, dt)
    game.x += game.speed * dt
    game.comboTimer -= dt
    if (bunny.grounded && bunny.tumbleT >= 1) game.stomps = 0
    // no tap for a while with something to hop over coming: the hand comes back, quietly, until the next hop
    game.idle += dt
    if (game.idle > IDLE_HINT && course.items.some((it) => it.kind === 'obstacle' && it.x > game.x && it.x - game.x < 14)) $('tap-hint').classList.remove('gone')

    const idx = biomeIndexAt(game.x)
    if (idx !== game.biome) {
      game.biome = idx
      const b = BIOMES[idx]
      banner(b.emoji)
      sound.fanfare()
      weather.setKind(weatherOf(b))
    }
    course.generate(game.x + view.halfW * 2 + 30)
    // Holding repeats a calm wave; the third hop doubles at its apex.
    if (!holding()) bunny.holdChain = 0
    if (holding() && (bunny.grounded || (bunny.holdChain > 0 && bunny.holdChain % 3 === 0 && bunny.jumps === 1 && bunny.vy <= 0))) hop(true)
    friend.update(dt)
    if (game.balloon) {
      game.balloon.obj.position.set(game.x + 0.15, bunny.y + 1.35, 0.1)
      game.balloon.obj.rotation.z = Math.sin(game.time * 2) * 0.1
      if (bunny.floatT === 0) dropBalloon(true)
    }
    probe.x = game.x
    probe.y = bunny.y
    probe.vy = bunny.vy
    probe.jumps = bunny.jumps
    probe.grounded = bunny.grounded
    probe.tumbling = bunny.tumbleT < 1
    probe.rapidFlip = bunny.rapidTap && bunny.jumps === 2
    handleEvents(course.update(dt, probe, game.time, game.x - view.halfW - 15))
    if (game.x >= HOME_X - 1.4) finish()

    showTrip(clamp(game.x / HOME_X, 0, 1))
  } else if (game.state === 'home' || game.state === 'results') {
    mode = 'home'
    game.speed *= Math.pow(0.02, dt)
    game.x = Math.min(HOME_X, game.x + game.speed * dt)
    game.homeTime += dt
    if (game.state === 'home' && game.homeTime > 2.5) showResults()
    const growing = home.sprouts.length > 0 || home.toDrop > 0
    $('again').setAttribute('aria-disabled', String(growing))
    $('again').style.opacity = growing ? '0.55' : '1'
    smokeTimer -= dt
    if (world.home && smokeTimer <= 0) {
      smokeTimer = 0.35
      world.chimney(tmp)
      effects.dust.spawn(tmp, tmp2.set(0.3, 1.2, 0), { life: 1.6, size: 0.25, color: '#ffffff', spin: 0, shrink: true })
    }
    home.update(dt)
    course.update(dt, null, game.time, game.x - view.halfW - 15)
  } else {
    course.update(dt, null, game.time, -1e9)
  }

  const landed = bunny.update(dt, game.state === 'play' ? game.speed : 0, mode)
  if (landed !== 0) {
    tmp.set(game.x, 0, 0)
    effects.puff(tmp, Math.abs(landed) > 9 ? 8 : 4, dustColor(), Math.min(1.3, Math.abs(landed) / 9))
    if (game.state === 'play' && landed > 4) sound.land()
    // water underfoot: a plink on a stepping stone, or a big splash
    const wet = game.state === 'play' && course.landing(game.x)
    if (wet) handleEvents([wet])
    if (landed < 0) sound.hop(false) // landed and bounced straight into a buffered hop
  }
  bunny.root.position.x = game.x
  game.blob.position.x = game.x
  const lift = clamp(bunny.y / 3, 0, 0.8)
  game.blob.scale.setScalar(1 - lift * 0.6)
  game.blob.material.opacity = 0.22 * (1 - lift)

  updateCamera(dt)
  // on the menu butterflies stay close by Pip, inside the view
  // (upright: a little higher, round Pip's ears; sideways: to his right, where the view is open)
  const upright = innerWidth < innerHeight
  world.flutterSpan = game.state === 'menu' ? (upright ? [-2.4, 2.4] : [1.6, 4.8]) : null
  world.flutterHigh = game.state === 'play' ? 1 : game.state === 'menu' && upright ? 0.22 : 0
  // sideways, the title spans the top of the view: menu butterflies keep to Pip's height, under it
  world.flutterCeil = game.state === 'menu' && !upright ? 0.12 : 0.55
  world.update(dt, camera.position.x, game.x, game.time)
  weather.update(dt, camera.position, game.time)
  glints.update(dt, camera, weather.kind === 'snow' && game.state !== 'menu')
  effects.update(dt)
  const atHome = game.state === 'home' || game.state === 'results'
  for (const prop of world.items) {
    const projected = tmp.copy(prop.position).project(camera)
    prop.visible = !atHome || prop.userData.kind === 'burrow' || (prop.position.z < 1 && projected.y > -0.25)
  }
  renderer.render(scene, camera)
}

init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})
