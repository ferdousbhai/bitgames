import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Balloons, COLORS, KINDS } from './balloons.js'
import { Effects } from './effects.js'
import { World, halfSize as viewSize } from './world.js'

const $ = (id) => document.getElementById(id)

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 0.95
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.6
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(0, 0, 14)
scene.add(new THREE.HemisphereLight('#e4f4ff', '#ffd9b0', 0.9))
const sun = new THREE.DirectionalLight('#fff4e0', 2.0)
sun.position.set(-6, 9, 10)
scene.add(sun)

const audio = new Audio()
const world = new World(scene, camera)
const balloons = new Balloons(scene)
const effects = new Effects(scene, camera)

// --- Levels -----------------------------------------------------------------------
// Each level adds one new friend. Nothing is ever lost: balloons that float
// away just float away, and every pop fills the level bar a little more.

const LEVELS = [
  { goal: 8, speed: 1.0, every: 1.3, kinds: { round: 3, smile: 2 } },
  { goal: 10, speed: 1.1, every: 1.2, kinds: { round: 3, smile: 2, heart: 2 }, intro: ['💖', 'Heart balloons!', 'They are worth 2'], show: 'heart' },
  { goal: 12, speed: 1.15, every: 1.1, kinds: { round: 3, smile: 2, heart: 1.5, gold: 0.7 }, intro: ['👑', 'Golden balloons!', 'They are worth 5'], show: 'gold' },
  { goal: 12, speed: 1.2, every: 1.05, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, bunny: 2 }, intro: ['🐰', 'Bunny balloons!', 'Boing boing! Worth 3'], show: 'bunny' },
  { goal: 14, speed: 1.25, every: 1.0, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, bunny: 1.2, star: 0.35 }, intro: ['⭐', 'Star balloon!', 'Pop it to pop them ALL'], show: 'star' },
  { goal: 15, speed: 1.3, every: 0.95, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, bunny: 1.2, star: 0.3, rainbow: 0.45 }, intro: ['🌈', 'Rainbow balloon!', 'It makes baby balloons'], show: 'rainbow' },
]
function level(n) {
  if (n <= LEVELS.length) return LEVELS[n - 1]
  const extra = n - LEVELS.length
  const last = LEVELS[LEVELS.length - 1]
  return { ...last, goal: Math.min(25, last.goal + extra), speed: Math.min(2.3, last.speed + extra * 0.08), every: Math.max(0.55, last.every - extra * 0.04) }
}
const PARTY_EVERY = 3 // a bonus Balloon Party after every third level

// --- Game state -------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | play
  level: 1,
  score: 0,
  progress: 0,
  spawnIn: 1,
  pause: 0, // seconds without spawning (between levels)
  party: 0, // seconds of Balloon Party left
  combo: 0,
  lastPop: -10,
  best: 0,
  forced: null,
  firstPop: false,
  lastLane: 0,
}
try {
  game.best = Number(localStorage.getItem('balloon-pop-best')) || 0
} catch {}

function saveBest() {
  if (game.score <= game.best) return false
  game.best = game.score
  try {
    localStorage.setItem('balloon-pop-best', String(game.best))
  } catch {}
  return true
}

// --- View helpers -------------------------------------------------------------------

const halfSize = (z = 0) => viewSize(camera, z)
/** Balloons shrink a little on narrow phone screens so a few fit side by side. */
const balloonScale = () => THREE.MathUtils.clamp(halfSize().w / 6.5, 0.62, 1)

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  world.layout()
}
addEventListener('resize', resize)
resize()

// --- Spawning -----------------------------------------------------------------------

function pickKind(kinds) {
  const total = Object.values(kinds).reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (const [k, w] of Object.entries(kinds)) if ((r -= w) <= 0) return k
  return 'round'
}

function spawn(kindName, opts = {}) {
  const lv = level(game.level)
  const s = balloonScale()
  const b = balloons.make(kindName, { scale: s, ...opts })
  const z = -1.5 + Math.random() * 2
  const { w, h } = halfSize(z)
  // Lanes keep new balloons from stacking on the last one.
  const lanes = Math.max(2, Math.floor((w * 2) / (2.3 * s)))
  let lane = (Math.random() * lanes) | 0
  if (lane === game.lastLane) lane = (lane + 1 + ((Math.random() * (lanes - 1)) | 0)) % lanes
  game.lastLane = lane
  const x = -w + (2 * w * (lane + 0.5)) / lanes + (Math.random() - 0.5) * 0.6
  b.group.position.set(x, -h - 1.6 * s, z)
  b.speed = (game.state === 'title' ? 0.8 : lv.speed) * (0.85 + Math.random() * 0.3) * (game.party > 0 ? 1.3 : 1)
  if (b.kind.power) b.speed *= 0.8
  return b
}

function spawnTick(dt) {
  game.spawnIn -= dt
  if (game.spawnIn > 0) return
  if (game.state === 'title') {
    spawn(Math.random() < 0.15 ? 'heart' : Math.random() < 0.4 ? 'smile' : 'round')
    game.spawnIn = 1.6
    return
  }
  if (game.pause > 0) return
  if (game.forced) {
    spawn(game.forced)
    game.forced = null
  } else if (game.party > 0) {
    if (balloons.list.length >= 15) return
    spawn(pickKind({ round: 3, smile: 2, heart: 2, bunny: 1.5, gold: 0.8 }))
  } else {
    // Never more than a comfortable handful on screen at once
    if (balloons.list.length >= 9) return
    spawn(pickKind(level(game.level).kinds))
  }
  game.spawnIn = game.party > 0 ? 0.22 : level(game.level).every * (0.8 + Math.random() * 0.4)
}

// --- Popping ------------------------------------------------------------------------

const v3 = new THREE.Vector3()
const center = new THREE.Vector3()

/**
 * Forgiving hit test in screen space: little fingers don't have to be exact.
 * Each balloon is an oval around its whole shape (bunny ears and crown included), padded a little.
 */
function balloonAt(px, py) {
  let best = null
  let bestD = Infinity
  const rect = canvas.getBoundingClientRect()
  for (const b of balloons.list) {
    const shape = balloons.shapes[b.kind.model] ?? { x: 0, y: 0, rx: b.kind.hit, ry: b.kind.hit }
    center.copy(b.group.position)
    center.x += shape.x * b.scale
    center.y += shape.y * b.scale
    v3.copy(center).project(camera)
    const sx = rect.left + ((v3.x + 1) / 2) * rect.width
    const sy = rect.top + ((1 - v3.y) / 2) * rect.height
    const { h } = halfSize(center.z)
    const ppu = (b.scale * rect.height) / (2 * h) // pixels per model unit
    const rx = Math.max(30, shape.rx * ppu) * 1.2
    const ry = Math.max(30, shape.ry * ppu) * 1.15
    const d = Math.hypot((px - sx) / rx, (py - sy) / ry)
    if (d < 1 && d < bestD) {
      best = b
      bestD = d
    }
  }
  return best
}

function pop(b, { chain = false } = {}) {
  if (!b.alive) return
  const t = timer.getElapsed()
  const pos = b.group.position.clone()
  balloons.remove(b)
  if (b.string) effects.dropString(b.string)
  if (b.crown) effects.dropString(b.crown, 4)
  const playing = game.state === 'play'
  if (!chain) {
    game.combo = t - game.lastPop < 1.1 ? game.combo + 1 : 0
    game.lastPop = t
  }
  const big = !!b.kind.power
  effects.pop(pos, b.color, { big, gold: b.kind.gold })
  audio.pop(chain ? 3 + ((Math.random() * 6) | 0) : game.combo, b.scale < 0.6 ? 0.7 : b.kindName === 'bunny' ? 1.2 : 1)
  if (b.kind.gold) audio.sparkle()
  if (!game.firstPop) {
    game.firstPop = true
    $('hint').classList.add('hidden')
  }
  if (!playing) return

  let points = b.kind.points
  game.score += points
  effects.label(`+${points}`, pos, b.color === '#ffffff' ? '#ff6b9d' : b.color, points >= 3)
  if (!chain && game.combo >= 2 && game.combo % 3 === 2) {
    const bonus = Math.min(5, Math.ceil(game.combo / 3))
    game.score += bonus
    banner(`${['', 'Nice!', 'Super!', 'Wow!', 'Amazing!', 'Balloon boss!'][bonus]} +${bonus}`, 'combo')
  }

  if (b.kind.power === 'star') {
    effects.shake = 0.6
    audio.boom()
    banner('⭐ Star power! ⭐', 'combo')
    const others = [...balloons.list]
    others.sort((a, c) => a.group.position.distanceTo(pos) - c.group.position.distanceTo(pos))
    others.forEach((o, i) => setTimeout(() => pop(o, { chain: true }), 90 + i * 80))
  } else if (b.kind.power === 'rainbow') {
    audio.rainbow()
    for (let i = 0; i < 6; i++) {
      const m = balloons.make('mini', { color: COLORS[i], scale: balloonScale() })
      const a = (i / 6) * Math.PI * 2
      m.group.position.copy(pos)
      m.vx = Math.cos(a) * 6
      m.vy = Math.sin(a) * 4
      m.speed = 0.7 + Math.random() * 0.3
    }
  }

  game.progress += 1
  if (game.party <= 0 && game.progress >= level(game.level).goal) levelUp()
  updateHud()
}

function levelUp() {
  game.level += 1
  game.progress = 0
  game.pause = 2.6
  audio.levelUp()
  const { w, h } = halfSize(0)
  effects.shower(w, h)
  const finished = game.level - 1
  if (finished % PARTY_EVERY === 0) {
    game.party = 7
    game.pause = 1.6
    showIntro('🎉', 'Balloon party!', 'Pop as many as you can!')
    return
  }
  introduceLevel()
}

/** Announce the level about to start: its new balloon (sent up first), or just its number. */
function introduceLevel() {
  const lv = level(game.level)
  if (lv.intro && game.level <= LEVELS.length) {
    showIntro(...lv.intro)
    game.forced = lv.show
  } else showIntro('🎈', `Level ${game.level}!`, 'Here come more balloons')
  updateHud()
}

// --- HUD & screens -----------------------------------------------------------------------

function updateHud() {
  $('score').textContent = game.score
  if (game.best > 0 && game.score > game.best) $('best-badge').classList.remove('hidden')
  $('level').textContent = game.party > 0 ? '🎉 Party!' : `Level ${game.level}`
  const goal = level(game.level).goal
  $('bar-fill').style.width = `${game.party > 0 ? 100 : Math.min(100, (game.progress / goal) * 100)}%`
}

let bannerTimer = 0
function banner(text, kind = '') {
  const el = $('banner')
  el.textContent = text
  el.className = `banner show ${kind}`
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => (el.className = 'banner'), 1300)
}

let introTimer = 0
function showIntro(emoji, title, sub) {
  $('intro-emoji').textContent = emoji
  $('intro-title').textContent = title
  $('intro-sub').textContent = sub
  const el = $('intro')
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(introTimer)
  introTimer = setTimeout(() => el.classList.remove('show'), 2600)
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play')
}

function toTitle() {
  const newBest = saveBest()
  game.state = 'title'
  game.party = 0
  $('best').textContent = game.best
  $('last').textContent = game.score ? (newBest ? `🎉 New best: ${game.score}!` : `Last time: ${game.score}`) : ''
  show('title')
}

function start() {
  audio.unlock()
  audio.click()
  balloons.clear()
  Object.assign(game, { state: 'play', level: 1, score: 0, progress: 0, spawnIn: 0.4, pause: 0, party: 0, combo: 0, forced: null })
  show('play')
  $('best-badge').classList.add('hidden')
  updateHud()
  showIntro('🎈', 'Pop the balloons!', 'Tap them before they fly away')
  if (!game.firstPop) $('hint').classList.remove('hidden')
}

$('play').addEventListener('click', start)
$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.click()
  toTitle()
})
const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
  try {
    localStorage.setItem('balloon-pop-sound', on ? '1' : '0')
  } catch {}
}
try {
  if (localStorage.getItem('balloon-pop-sound') === '0') setSound(false)
} catch {}
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
function setMusic(on) {
  audio.musicOn = on
  musicBtn.classList.toggle('off', !on)
  try {
    localStorage.setItem('balloon-pop-music', on ? '1' : '0')
  } catch {}
}
try {
  if (localStorage.getItem('balloon-pop-music') === '0') setMusic(false)
} catch {}
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setMusic(!audio.musicOn)
  audio.click()
})

// --- Input ------------------------------------------------------------------------

function tapAt(x, y) {
  audio.unlock()
  if (game.state === 'loading') return
  const b = balloonAt(x, y)
  if (b) return pop(b)
  const poked = world.poke(x, y)
  if (poked?.sun) audio.giggle()
  else if (poked?.sheep) audio.baa(poked.sheep)
  else if (poked?.windmill) audio.whirr()
  else if (poked?.hab) {
    audio.whoosh()
    for (let i = 0; i < 3; i++) setTimeout(() => effects.sparkleAt(poked.hab, ['#ffb347', '#ffe066', '#ff7b54'][i], 6, 4), i * 90)
  }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  tapAt(e.clientX, e.clientY)
})
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

// Keyboard: arrows (or WASD) steer a pin, Space or Enter pops.
const reticle = $('reticle')
const keys = new Set()
const pin = { x: innerWidth / 2, y: innerHeight / 2, on: false }
addEventListener('keydown', (e) => {
  audio.unlock()
  if (e.key === 'Escape' && game.state === 'play') return toTitle()
  if (game.state === 'title' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault()
    return start()
  }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    if (!pin.on) {
      // First press: show the pin on the nearest balloon.
      pin.on = true
      const near = balloons.list[0]
      if (near) {
        v3.copy(near.group.position).project(camera)
        pin.x = ((v3.x + 1) / 2) * innerWidth
        pin.y = ((1 - v3.y) / 2) * innerHeight
      }
    } else tapAt(pin.x, pin.y)
    return
  }
  const k = e.key.toLowerCase()
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
    e.preventDefault()
    keys.add(k)
    pin.on = true
  }
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())

function updatePin(dt) {
  const shown = pin.on && game.state === 'play'
  if (shown !== pin.shown) reticle.classList.toggle('hidden', !(pin.shown = shown))
  if (!pin.on) return
  const sp = Math.min(innerWidth, innerHeight) * 0.9 * dt
  if (keys.has('arrowleft') || keys.has('a')) pin.x -= sp
  if (keys.has('arrowright') || keys.has('d')) pin.x += sp
  if (keys.has('arrowup') || keys.has('w')) pin.y -= sp
  if (keys.has('arrowdown') || keys.has('s')) pin.y += sp
  pin.x = THREE.MathUtils.clamp(pin.x, 0, innerWidth)
  pin.y = THREE.MathUtils.clamp(pin.y, 0, innerHeight)
  // Only touch the style when the pin moved since it was last drawn
  if (pin.x !== pin.drawnX || pin.y !== pin.drawnY) {
    pin.drawnX = pin.x
    pin.drawnY = pin.y
    reticle.style.transform = `translate(${pin.x}px, ${pin.y}px)`
  }
}

// The "tap here" finger follows the first balloon until the first pop.
function updateHint() {
  const el = $('hint')
  if (game.firstPop || game.state !== 'play') return
  const b = balloons.list.find((x) => x.group.position.y > -halfSize().h * 0.6)
  if (!b) return el.classList.add('hidden')
  el.classList.remove('hidden')
  v3.copy(b.group.position).project(camera)
  el.style.transform = `translate(${((v3.x + 1) / 2) * innerWidth}px, ${((1 - v3.y) / 2) * innerHeight}px)`
}

// --- Loading ------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  let done = 0
  const step = () => ($('loading-text').textContent = `Blowing up balloons… ${++done}/2`)
  const [b, w] = await Promise.allSettled([
    loader.loadAsync('./models/balloons.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/world.glb').then((g) => (step(), g)),
  ])
  if (b.status === 'fulfilled') balloons.attach(b.value)
  else console.warn('balloons.glb failed', b.reason)
  if (w.status === 'fulfilled') world.attach(w.value)
  else console.warn('world.glb failed', w.reason)
  // Compile and upload every balloon kind now, so the first one on screen doesn't stutter.
  const warm = Object.keys(KINDS).map((k) => balloons.make(k))
  renderer.compile(scene, camera)
  for (const b of warm) balloons.remove(b)
  $('best').textContent = game.best
  game.state = 'title'
  game.spawnIn = 0.2
  show('title')
}

// --- Loop -----------------------------------------------------------------------------

const timer = new THREE.Timer()
timer.connect(document)
const camBase = camera.position.clone()
const twinkleAt = new THREE.Vector3()

renderer.setAnimationLoop(() => {
  timer.update()
  const dt = Math.min(timer.getDelta(), 1 / 20)
  const t = timer.getElapsed()
  if (game.state !== 'loading') {
    spawnTick(dt)
    if (game.state === 'play') {
      game.pause = Math.max(0, game.pause - dt)
      if (game.party > 0) {
        game.party -= dt
        if (game.party <= 0) {
          game.party = 0
          game.pause = 1.5
          introduceLevel()
        }
      }
    }
    balloons.update(dt, t, halfSize(-1.5).h)
    // Golden and star balloons twinkle as they rise
    for (const b of balloons.list) {
      if (!(b.kind.gold || b.kind.power === 'star') || Math.random() >= dt * 8) continue
      twinkleAt.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2, 0.6).add(b.group.position)
      effects.sparkleAt(twinkleAt, '#fff3b0', 1)
    }
  }
  world.update(dt, t)
  effects.update(dt)
  updatePin(dt)
  updateHint()
  audio.updateMusic(game.state !== 'loading')
  const sh = effects.shake * effects.shake * 0.5
  camera.position.set(camBase.x + (Math.random() - 0.5) * sh, camBase.y + (Math.random() - 0.5) * sh, camBase.z)
  renderer.render(scene, camera)
})

show('loading')
load()
