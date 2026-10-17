import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Balloons, COLORS, KINDS, PALETTE } from './balloons.js'
import { Bird, Flock, makeBunny, makeDuck, makePiglet } from './critters.js'
import { Effects } from './effects.js'
import { World, halfSize as viewSize } from './world.js'

const $ = (id) => document.getElementById(id)

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
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
const flock = new Flock(scene, camera, world.sheep)
const bird = new Bird(scene, camera)

// --- Balloon friends ----------------------------------------------------------------
// Popping brings new friends: every few pops a new kind of balloon floats up first, shown by a big picture.
// Nothing is ever lost: balloons that float away just float away. After every third friend, a balloon party.

const LEVELS = [
  { goal: 6, kinds: { round: 3, smile: 2 } },
  { goal: 9, kinds: { round: 3, smile: 2, heart: 2 }, show: 'heart', pic: '💖' },
  { goal: 12, kinds: { round: 3, smile: 2, heart: 1.5, gold: 0.7 }, show: 'gold', pic: '👑' },
  { goal: 14, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.5, giant: 0.5 }, show: 'giant', pic: '🎈', big: true },
  { goal: 16, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, giant: 0.3, bunny: 2 }, show: 'bunny', pic: '🐰' },
  { goal: 18, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, giant: 0.3, bunny: 1.2, star: 0.35 }, show: 'star', pic: '⭐' },
  { goal: 20, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, giant: 0.3, bunny: 1.2, star: 0.3, rainbow: 0.45 }, show: 'rainbow', pic: '🌈' },
]
/**
 * Past the last friend the sky takes turns being one friend's day: a golden sky, a bunny parade, a sky of hearts,
 * a day of giants, a starry sky with rainbows. Each lasts one goal, and a surprise comes with every change.
 */
const SKIES = [
  { mood: 'gold', kinds: { gold: 3, round: 1, smile: 1, star: 0.3 } },
  { mood: 'bunny', kinds: { bunny: 4, round: 1, heart: 1 } },
  { mood: 'heart', kinds: { heart: 4, smile: 1.5, rainbow: 0.4 } },
  { mood: 'giant', kinds: { giant: 1.4, round: 2, smile: 1.5, rainbow: 0.3 } },
  { mood: 'dusk', kinds: { star: 0.9, rainbow: 0.9, round: 2, smile: 2, gold: 0.6 } },
]
function level(n) {
  if (n <= LEVELS.length) return { mood: 'day', ...LEVELS[n - 1] }
  return { goal: 18, ...SKIES[(n - LEVELS.length - 1) % SKIES.length] }
}
const PACE = { speed: 1.05, every: 1.15 }
const PARTY = { seconds: 8, every: 0.38, most: 14, speed: 1.15 }
const PARTY_EVERY = 3
/** Taps a giant balloon takes: it swells with each one, then bursts into babies. */
const GIANT_TAPS = 3
/** Seconds without a pop before the drawn finger shows a balloon to tap, and how many times it ever comes. */
const IDLE_HINT = 5
const HINTS = 3
/** Holding on empty sky blows up a balloon: after this long it starts, and past BLOW_MAX times its size it bursts. */
const BLOW_START = 0.28
const BLOW_MAX = 1.9
/** Past the last friend, every few pops brings one of these, in turn. */
const SURPRISES = ['sheep', 'bird', 'train', 'shower', 'hab', 'duck', 'bunny', 'piglet', 'sinker']
/** Friends that balloons carry down to the meadow. */
const CARRIED = ['duck', 'bunny', 'piglet']
/** Never more balloons than this on screen: bursts of babies and showers count, and regular balloons wait. */
const CROWD = 14

// --- Game state -------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | play
  level: 1,
  progress: 0,
  spawnIn: 1,
  pause: 0, // seconds without spawning (while a new friend is shown)
  party: 0, // seconds of balloon party left
  forced: null,
  lastLane: 0,
  combo: 0,
  lastPop: -10,
  idle: 0,
  started: false, // the level and friends met last for the whole visit to the page
  hints: 0,
  hinted: false, // the hint already counted for this idle stretch
  surprises: [], // the shuffled bag of surprises still to come
  pending: 0, // shower balloons on their way
}

// --- View helpers -------------------------------------------------------------------

const halfSize = (z = 0) => viewSize(camera, z)
/** Balloons shrink a little on narrow phone screens so a few fit side by side. */
const balloonScale = () => THREE.MathUtils.clamp(halfSize().w / 6.5, 0.62, 1)

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
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

function spawn(kindName) {
  // A giant is a big plain or smiley balloon that takes a few taps.
  const giant = kindName === 'giant'
  if (giant) kindName = Math.random() < 0.5 ? 'round' : 'smile'
  const s = balloonScale() * (giant ? 1.6 : 1)
  const b = balloons.make(kindName, { scale: s })
  const z = -1.5 + Math.random() * 2
  const { w, h } = halfSize(z)
  // Lanes keep new balloons from stacking on the last one.
  const lanes = Math.max(2, Math.floor((w * 2) / (2.3 * balloonScale())))
  let lane = (Math.random() * lanes) | 0
  if (lane === game.lastLane) lane = (lane + 1 + ((Math.random() * (lanes - 1)) | 0)) % lanes
  game.lastLane = lane
  const x = THREE.MathUtils.clamp(-w + (2 * w * (lane + 0.5)) / lanes + (Math.random() - 0.5) * 0.6, -w + 1.2 * s, w - 1.2 * s)
  // Now and then a balloon blooms part-way up, so the whole sky has something to pop.
  const bloom = game.state === 'play' && !giant && kindName !== game.forced && Math.random() < 0.3
  b.group.position.set(x, bloom ? h * (Math.random() * 0.7 - 0.5) : -h - 1.6 * s, z)
  const pace = game.state === 'title' ? 0.8 : game.party > 0 ? PARTY.speed : PACE.speed
  // Tall portrait screens have further to rise, so their balloons rise a little faster.
  b.speed = pace * THREE.MathUtils.clamp(halfSize().h / 5.5, 1, 1.35) * (0.85 + Math.random() * 0.3)
  if (b.kind.power) b.speed *= 0.8
  if (giant) {
    b.giant = GIANT_TAPS
    b.speed *= 0.6
  }
  return b
}

function spawnTick(dt) {
  game.spawnIn -= dt
  if (game.spawnIn > 0) return
  if (game.state === 'title') {
    if (balloons.list.length < 7) spawn(Math.random() < 0.15 ? 'heart' : Math.random() < 0.4 ? 'smile' : 'round')
    game.spawnIn = 1.5
    return
  }
  if (game.pause > 0) return
  const up = balloons.list.length + game.pending
  if (up >= CROWD) return
  if (game.forced) {
    spawn(game.forced)
    game.forced = null
  } else if (game.party > 0) {
    // Baby balloons count toward the party's cap, and short landscape screens hold fewer.
    if (up >= (halfSize().h > 6.5 ? PARTY.most : 11)) return
    spawn(pickKind({ round: 3, smile: 2, heart: 2, gold: 0.8, ...(game.level > 4 ? { giant: 0.4, bunny: 1.5 } : {}) }))
  } else {
    // A comfortable handful on screen at once (a couple more on tall screens), topped up quickly when few are left.
    if (up >= (halfSize().h > 6.5 ? 11 : 9)) return
    spawn(pickKind(level(game.level).kinds))
  }
  const few = game.party <= 0 && up < 5
  game.spawnIn = game.party > 0 ? PARTY.every : few ? 0.4 + Math.random() * 0.25 : PACE.every * (0.8 + Math.random() * 0.4)
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
    if (b.held) continue
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

/** A pop's puff of air nudges the balloons around it, which wobble and drift away. */
function shove(pos, strength = 1) {
  for (const o of balloons.list) {
    // Giants are too big to be pushed about (they would drift off the edge).
    if (o.giant) continue
    const dx = o.group.position.x - pos.x
    const dy = o.group.position.y - pos.y
    const d = Math.hypot(dx, dy)
    if (d > 4.5 * strength || d < 0.01) continue
    const push = (1 - d / (4.5 * strength)) * 5 * strength
    o.vx += (dx / d) * push
    o.vy += (dy / d) * push * 0.6
    o.squish = Math.max(o.squish, 0.6 * (1 - d / (4.5 * strength)))
  }
}

/** A tap on a giant: it swells and wobbles, and on the last tap it bursts. */
function poke(b) {
  b.giant -= 1
  game.idle = 0
  if (b.giant <= 0) return burstGiant(b)
  b.targetScale = b.scale * 1.18
  b.squish = 1
  audio.squeak(GIANT_TAPS - b.giant)
}

function burstGiant(b) {
  const pos = b.group.position.clone()
  pop(b, { giant: true })
  audio.boom()
  shove(pos, 1.6)
  effects.confetti(pos, 36)
  babies(pos, b.color)
}

/** Up to six baby balloons fly out of a rainbow (or giant) balloon and float up: fewer when the sky is busy. */
function babies(pos, colour) {
  const n = THREE.MathUtils.clamp(CROWD + 4 - balloons.list.length - game.pending, 3, 6)
  for (let i = 0; i < n; i++) {
    const m = balloons.make('mini', { color: colour && i % 2 ? colour : COLORS[i], scale: balloonScale() })
    const a = (i / n) * Math.PI * 2
    m.group.position.copy(pos)
    m.vx = Math.cos(a) * 6
    m.vy = Math.sin(a) * 4
    m.speed = 0.7 + Math.random() * 0.3
  }
}

function pop(b, { chain = -1, giant = false } = {}) {
  if (!b.alive) return
  const pos = b.group.position.clone()
  balloons.remove(b)
  if (b.string) effects.dropString(b.string)
  if (b.crown) effects.dropString(b.crown, 4)
  if (b.cargo) drop(b)
  const big = !!b.kind.power || giant
  effects.pop(pos, b.color, { big, gold: b.kind.gold })
  if (!giant) shove(pos)
  // Quick pops climb the scale, so a swipe across the sky plays a little run; a star's chain climbs too.
  const t = timer.getElapsed()
  if (chain < 0) {
    game.combo = t - game.lastPop < 0.9 ? game.combo + 1 : 0
    game.lastPop = t
  }
  const colourNote = Math.max(0, PALETTE.indexOf(b.color)) % 5
  const step = chain >= 0 ? 3 + chain : colourNote + game.combo
  audio.pop(step % 15, giant ? 1.6 : b.scale < 0.6 ? 0.7 : b.kindName === 'bunny' ? 1.2 : 1)
  if (b.kind.gold) audio.sparkle()
  game.idle = 0
  $('hint').classList.add('hidden')
  if (game.state !== 'play') return
  cheer(b.giant !== undefined ? 'giant' : b.kindName)

  if (b.kind.power === 'star') {
    audio.boom()
    const others = [...balloons.list]
    others.sort((a, c) => a.group.position.distanceTo(pos) - c.group.position.distanceTo(pos))
    others.forEach((o, i) => later(() => (o.giant ? burstGiant(o) : pop(o, { chain: i })), 180 + i * 130))
  } else if (b.kind.power === 'rainbow' || b.sinker) {
    audio.rainbow()
    babies(pos)
    if (b.sinker && Math.random() < 0.6) fallFriend(pos)
  }

  if (chain < 0 && game.party <= 0 && (game.progress += 1) >= level(game.level).goal) newFriend()
}

/** Enough pops: the next friend (or a party) is on its way. */
function newFriend() {
  game.level += 1
  game.progress = 0
  world.setMood(level(game.level).mood)
  updateHud()
  const party = (game.level - 1) % PARTY_EVERY === 0
  if (!party && game.level > LEVELS.length) return surprise(nextSurprise())
  game.pause = 2.2
  audio.levelUp()
  const { w, h } = halfSize(0)
  effects.drift(w, h)
  if (party) {
    game.party = PARTY.seconds
    game.pause = 1.2
    showIntro({ pic: '🎉' })
    // Past the last friend, every party brings someone down to the meadow too.
    if (game.level > LEVELS.length) later(() => carryDown(any(CARRIED)), 2500)
    return
  }
  introduceLevel()
}

// --- Surprises ----------------------------------------------------------------------
// Once every friend has been met, the sky keeps something new coming, in a shuffled order: a sheep carried off by
// balloons (pop it down and it bounces onto the meadow), a duck or a bunny carried down to the meadow, a bird that
// bumps balloons as it flutters by, a colour train, a wobbly balloon sinking down, a cloud that showers baby balloons,
// and the hot-air balloon dropping a few of its own. Everyone who comes down stays on the meadow.

/** The next surprise from a shuffled bag: every kind comes once before any comes again, and never twice in a row. */
function nextSurprise() {
  if (!game.surprises.length) {
    const bag = [...SURPRISES]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    if (bag[0] === game.lastSurprise) bag.push(bag.shift())
    game.surprises = bag
  }
  return (game.lastSurprise = game.surprises.shift())
}

function surprise(kind) {
  audio.surprise()
  if (kind === 'bird') return bird.fly(halfSize(0.4).w, halfSize(0.4).h * (0.1 + Math.random() * 0.35))
  if (kind === 'sheep' && sheepLift()) return
  if (CARRIED.includes(kind)) return carryDown(kind)
  if (kind === 'sinker') return sinker()
  if (kind === 'train') return colourTrain()
  const from = (kind === 'hab' && world.habOnScreen()) || world.cloudOnScreen()
  if (kind === 'hab' && from) audio.whoosh()
  shower(from ? worldAt(from.x, from.y) : null)
}

/** Three balloons in a bunch carry a sheep up from the hills. Pop the middle one and down it drops, baa-ing. */
function sheepLift() {
  const sheep = world.sheepCopy()
  if (!sheep) return false
  const { w, h } = halfSize(0)
  const x = (Math.random() - 0.5) * w * 1.2
  const s = balloonScale()
  const bunch = [-1, 0, 1].map((i) => {
    const b = balloons.make(i ? (Math.random() < 0.5 ? 'round' : 'heart') : 'smile', { scale: s })
    b.group.position.set(x + i * 1.3 * s, -h - 1.2 * s + Math.abs(i) * 0.5 * s, 0)
    b.speed = 1.05
    return b
  })
  const carrier = bunch[1]
  carry(carrier, sheep, 'sheep')
  later(() => audio.baa(1.1), 900)
  return true
}

/** The world scale of a friend on the meadow: the size of the landscape's own sheep (ducks and bunnies a hair bigger). */
const meadowSize = (kind) => world.sheepSizeAt(0.6) * (kind === 'sheep' ? 1 : 1.05)

/** Hangs a friend under a balloon's string, already at its meadow size. */
function carry(b, mesh, kind) {
  const size = meadowSize(kind)
  mesh.position.set(0, -3.1 - (kind === 'sheep' ? 0.4 : 1.2) * size, 0.2)
  mesh.scale.setScalar(size / b.scale)
  b.group.add(mesh)
  Object.assign(b, { cargo: mesh, cargoKind: kind, cargoSize: size })
}

/** A carried friend leaves its balloon: dropped by a pop it tumbles and bounces; carried all the way, it steps off. */
function drop(b, gentle = false) {
  const kind = b.cargoKind
  flock.land(b.cargo, { kind, size: b.cargoSize, gentle })
  b.cargo = null
  later(() => greet(kind), gentle ? 0 : 120)
}

/** Each meadow friend's own sound. */
const greet = (kind, pitch = 1.25) => ({ sheep: () => audio.baa(pitch), duck: () => audio.quack(), bunny: () => audio.boing(), piglet: () => audio.oink() })[kind]()

const MAKE = { duck: makeDuck, bunny: makeBunny, piglet: makePiglet }
const any = (list) => list[(Math.random() * list.length) | 0]

/** A balloon floats slowly down from the top carrying a duck, a bunny or a piglet to the meadow (pop it and down it drops). */
function carryDown(kind) {
  if (game.state !== 'play') return
  const { w, h } = halfSize(0)
  const b = balloons.make(kind === 'duck' ? 'round' : kind === 'piglet' ? 'smile' : 'heart', { scale: balloonScale() })
  b.group.position.set((Math.random() - 0.5) * w * 1.2, h + 1.5, 0)
  b.speed = -0.9
  b.descending = true
  carry(b, MAKE[kind](), kind)
}

/** A friend tumbles straight out of a popped sinking balloon. */
function fallFriend(pos) {
  const kind = any(CARRIED)
  const mesh = MAKE[kind]()
  mesh.position.copy(pos)
  mesh.scale.setScalar(meadowSize(kind))
  flock.land(mesh, { kind, size: meadowSize(kind) })
  later(() => greet(kind), 150)
}

/** A big, wobbly balloon drifts down from the top like jelly; popping it lets out babies, and often a friend. */
function sinker() {
  const { w, h } = halfSize(0)
  const b = balloons.make('smile', { scale: balloonScale() * 1.35 })
  b.group.position.set((Math.random() - 0.5) * w, h + 2, 0)
  b.speed = -0.6
  b.sinker = true
}

/** Seven balloons in rainbow order drift across the sky in a wavy line: popping them in a row plays a scale. */
function colourTrain() {
  const { w, h } = halfSize(0)
  const s = balloonScale()
  const fromLeft = Math.random() < 0.5
  const y = h * (Math.random() * 0.3 - 0.05)
  COLORS.forEach((color, i) => {
    const b = balloons.make(i % 2 ? 'smile' : 'round', { color, scale: s })
    b.group.position.set((fromLeft ? -1 : 1) * (w + 1.5 + i * 1.9 * s), y, 0)
    b.wind = (fromLeft ? 1 : -1) * 2.3
    b.speed = 0.06
    b.phase = i * 0.7
  })
}

/** Up to ten baby balloons tumble out of a cloud (or the hot-air balloon), dip, then float back up. */
function shower(at) {
  const { w, h } = halfSize(0)
  const x0 = at ? at.x : (Math.random() - 0.5) * w
  const y0 = at ? Math.min(at.y, h - 0.5) : h - 0.5
  // As many as there is room for: a busy sky gets a smaller shower.
  const n = THREE.MathUtils.clamp(CROWD + 2 - balloons.list.length - game.pending, 4, 10)
  game.pending += n
  for (let i = 0; i < n; i++) {
    later(() => {
      game.pending -= 1
      const m = balloons.make('mini', { color: COLORS[i % COLORS.length], scale: balloonScale() })
      m.group.position.set(x0 + (Math.random() - 0.5) * 3, y0, 0)
      m.vx = (Math.random() - 0.5) * 3
      m.vy = -6 - Math.random() * 3
      m.speed = 0.6 + Math.random() * 0.3
      effects.sparkleAt(m.group.position, '#ffffff', 2)
    }, i * 140)
  }
}

/** The friend about to arrive is shown big for a moment, then floats up first. */
function introduceLevel() {
  const lv = level(game.level)
  if (lv.show && game.level <= LEVELS.length) {
    showIntro(lv)
    game.forced = lv.show
  }
  updateHud()
}

// --- HUD & screens -----------------------------------------------------------------------

/** The balloon friends met so far: plain ones, then each new kind as it arrives. */
const metFriends = () => [LEVELS[0], ...LEVELS.slice(1, Math.min(game.level, LEVELS.length))]

/** The strip friend each themed sky belongs to, which bounces gently for as long as its sky lasts. */
const TODAY = { gold: 2, bunny: 4, heart: 1, giant: 3, dusk: 5 }

function updateHud() {
  const met = metFriends()
  const strip = $('met')
  if (strip.childElementCount !== met.length) {
    strip.replaceChildren(
      ...met.map((lv, i) => {
        const el = picture(lv)
        if (i === met.length - 1 && i) el.classList.add('new')
        return el
      }),
    )
  }
  const today = TODAY[level(game.level).mood]
  ;[...strip.children].forEach((el, i) => el.classList.toggle('today', i === today))
}

/** Which friend in the strip a popped balloon belongs to: plain, smiley and baby balloons are the first. */
const FRIEND_OF = { heart: 1, gold: 2, giant: 3, bunny: 4, star: 5, rainbow: 6 }
/** A pop makes its friend in the strip hop. */
function cheer(kind) {
  const el = $('met').children[FRIEND_OF[kind] ?? 0]
  if (!el) return
  el.classList.remove('hop', 'new')
  void el.offsetWidth
  el.classList.add('hop')
  el.addEventListener('animationend', () => el.classList.remove('hop'), { once: true })
}

/** A friend's picture: its emoji, or for the giant a puffed-up balloon with a burst. */
function picture(lv) {
  const el = Object.assign(document.createElement('span'), { textContent: lv.pic ?? '🎈' })
  if (lv.big) el.className = 'giant-pic'
  return el
}

let introTimer = 0
// Play-time timers (star chains) live here so going home cancels them.
const playTimers = new Set()
function later(fn, ms) {
  const id = setTimeout(() => {
    playTimers.delete(id)
    fn()
  }, ms)
  playTimers.add(id)
  return id
}
function stopPlay() {
  for (const id of playTimers) clearTimeout(id)
  playTimers.clear()
  clearTimeout(introTimer)
  $('intro').classList.remove('show')
}

function showIntro(lv) {
  const el = $('intro')
  el.replaceChildren(picture(lv))
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(introTimer)
  introTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play')
}

function toTitle() {
  stopPlay()
  endBlow(false)
  game.state = 'title'
  game.party = 0
  show('title')
}

function start() {
  stopPlay()
  audio.unlock()
  audio.click()
  balloons.clear()
  // The friends met (and the pops toward the next one) last for the whole visit: home and back carries on.
  if (!game.started) Object.assign(game, { started: true, level: 1, progress: 0 })
  world.setMood(level(game.level).mood)
  Object.assign(game, { state: 'play', spawnIn: 0.3, pause: 0, party: 0, forced: null, combo: 0, idle: 0 })
  show('play')
  updateHud()
  // A few balloons are already up, so the whole sky is ready to pop.
  const { h } = halfSize(0)
  for (let i = 0; i < 4; i++) spawn(pickKind(level(game.level).kinds)).group.position.y = h * (0.35 - i * 0.3)
}

$('play').addEventListener('click', start)
/**
 * 🏠, 🔊 and 🎵 act on a press-and-hold while a ring fills around them, so mashing the screen never sends a child
 * home or mutes the game. A short tap just wiggles the button; keyboard activation is ignored.
 *
 * A resting hand never acts either: every finger on the page is tracked, a hold starts only when its finger is the
 * only one down, and any other finger landing anywhere (another button or the sky) cancels it and spoils holding
 * until every finger has lifted.
 */
const fingers = new Set()
const holds = new Set() // the cancel function of each hold button
let spoiled = false
document.addEventListener(
  'pointerdown',
  (e) => {
    fingers.add(e.pointerId)
    if (fingers.size < 2) return
    spoiled = true
    for (const cancel of holds) cancel()
  },
  true,
)
for (const ev of ['pointerup', 'pointercancel']) {
  document.addEventListener(
    ev,
    (e) => {
      fingers.delete(e.pointerId)
      if (!fingers.size) spoiled = false
    },
    true,
  )
}

function holdButton(el, ms, act) {
  let held = 0
  let start = 0
  let owner = null // the one finger whose hold is running
  const stop = () => {
    cancelAnimationFrame(held)
    held = 0
    owner = null
    el.classList.remove('holding')
    el.style.setProperty('--p', 0)
  }
  holds.add(stop)
  const step = () => {
    if (owner === null) return
    const p = Math.min(1, (performance.now() - start) / ms)
    el.style.setProperty('--p', p)
    if (p < 1) return (held = requestAnimationFrame(step))
    stop()
    act()
  }
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    audio.unlock()
    el.setPointerCapture?.(e.pointerId)
    stop()
    if (spoiled || fingers.size !== 1) return
    owner = e.pointerId
    start = performance.now()
    el.classList.add('holding')
    held = requestAnimationFrame(step)
  })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.addEventListener(ev, (e) => {
      if (e.pointerId !== owner) return
      stop()
      el.classList.remove('nudge')
      void el.offsetWidth
      el.classList.add('nudge')
    })
  }
  // Native Enter/Space clicks have no pointer: only the pointer hold above may act.
  for (const ev of ['keydown', 'keyup']) {
    el.addEventListener(ev, (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      e.stopPropagation()
      stop()
    })
  }
  el.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  // Losing the page must not leave an animation callback armed.
  addEventListener('blur', stop)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
  })
}
holdButton($('home'), 800, () => {
  audio.click()
  toTitle()
})
// Sound is not remembered: every visit starts with sound on.
const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
}
holdButton(soundBtn, 500, () => {
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
// The music box starts off, so the pops carry the game; a saved "on" turns it back on.
musicBtn.classList.add('off')
try {
  if (localStorage.getItem('balloon-pop-music') === '1') setMusic(true)
} catch {}
holdButton(musicBtn, 500, () => {
  audio.unlock()
  setMusic(!audio.musicOn)
  audio.click()
})

// --- Input ------------------------------------------------------------------------

/** A tap (or the keyboard pin): pop a balloon, swell a giant, or poke a bird, a sheep or the countryside. */
function tapAt(x, y) {
  audio.unlock()
  if (game.state === 'loading') return
  const b = balloonAt(x, y)
  if (b) return b.giant ? poke(b) : pop(b)
  if (bird.tap(x, y)) {
    audio.tweet()
    return effects.sparkleAt(bird.mesh.position, '#ffffff', 6)
  }
  const friend = flock.at(x, y)
  if (friend) {
    friend.hop = 1
    return greet(friend.kind, 1.15)
  }
  const poked = world.poke(x, y)
  if (poked?.sun) audio.giggle()
  else if (poked?.sheep) audio.baa(poked.sheep)
  else if (poked?.windmill) audio.whirr()
  else if (poked?.house) {
    audio.dingDong()
    effects.smoke(poked.house)
  } else if (poked?.tree) {
    audio.tweet()
    effects.leaves(poked.tree)
  } else if (poked?.hab) {
    audio.whoosh()
    for (let i = 0; i < 3; i++) setTimeout(() => effects.sparkleAt(poked.hab, ['#ffb347', '#ffe066', '#ff7b54'][i], 6, 4), i * 90)
  } else {
    // Empty sky still answers: a little twinkle under the finger.
    audio.twinkle()
    effects.sparkleAt(worldAt(x, y), '#ffffff', 5)
  }
}

const ray = new THREE.Vector3()
/** The point in the scene (on the balloons' plane) under a screen point. */
function worldAt(x, y) {
  ray.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
  return camera.position.clone().addScaledVector(ray, -camera.position.z / ray.z)
}

// --- Blowing up a balloon -----------------------------------------------------------------
// Holding a finger still anywhere (after the pop or poke its first touch made) blows up a balloon under it.
// Let go and it floats off; hold too long and it bursts.

let blow = null // { id, x, y, t, b, puff }

function blowTick(dt) {
  if (!blow) return
  blow.t += dt
  if (!blow.b) {
    if (blow.t < BLOW_START || game.state === 'loading') return
    const kinds = ['round', 'smile', ...(game.level >= 2 ? ['heart'] : []), ...(game.level >= 5 ? ['bunny'] : [])]
    blow.b = balloons.make(kinds[(Math.random() * kinds.length) | 0], { scale: balloonScale() * 0.2 })
    Object.assign(blow.b, { held: true, speed: 0, base: balloonScale() })
  }
  const b = blow.b
  if (!b.alive) return (blow = null)
  b.targetScale = Math.min(b.base * BLOW_MAX, b.targetScale + b.base * 0.8 * dt)
  const p = worldAt(blow.x, blow.y)
  b.group.position.set(p.x, p.y + 1.1 * b.scale, 0)
  if ((blow.puff -= dt) <= 0) {
    blow.puff = 0.3
    audio.puff(b.targetScale / (b.base * BLOW_MAX))
    b.squish = Math.max(b.squish, 0.35)
  }
  if (b.targetScale >= b.base * BLOW_MAX) {
    // Too much air: bang!
    blow = null
    b.held = false
    const pos = b.group.position.clone()
    pop(b, { giant: true })
    audio.boom()
    shove(pos, 1.3)
    effects.confetti(pos, 24)
  }
}

/** The finger lifts: a blown balloon floats away (or, `free` false, simply goes). */
function endBlow(free = true) {
  const b = blow?.b
  blow = null
  if (!b?.alive) return
  if (!free) return balloons.remove(b)
  b.held = false
  b.targetScale = b.scale
  b.speed = 1.1
  b.vy = 2
  b.squish = 1
  audio.letGo()
}

// Swiping a finger across the sky pops every balloon it touches; a giant takes one poke per stroke.
const strokes = new Map()
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  canvas.setPointerCapture?.(e.pointerId)
  const b = balloonAt(e.clientX, e.clientY)
  strokes.set(e.pointerId, new Set(b?.giant ? [b] : []))
  tapAt(e.clientX, e.clientY)
  // A giant under the finger is being poked; anywhere else a still finger starts a breath.
  if (!b?.giant && !blow) blow = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: 0, b: null, puff: 0 }
})
canvas.addEventListener('pointermove', (e) => {
  if (blow?.id === e.pointerId) {
    // A finger that slides before the balloon starts is a swipe, not a breath.
    if (!blow.b && Math.hypot(e.clientX - blow.x0, e.clientY - blow.y0) > 24) blow = null
    else Object.assign(blow, { x: e.clientX, y: e.clientY })
  }
  const touched = strokes.get(e.pointerId)
  if (!touched || game.state === 'loading') return
  const b = balloonAt(e.clientX, e.clientY)
  if (!b || touched.has(b)) return
  if (b.giant) {
    touched.add(b)
    poke(b)
  } else pop(b)
})
for (const ev of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(ev, (e) => {
    strokes.delete(e.pointerId)
    if (blow?.id === e.pointerId) endBlow()
  })
}
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

// Keyboard: arrows (or WASD) steer a pin, Space or Enter pops.
const reticle = $('reticle')
const keys = new Set()
const pin = { x: innerWidth / 2, y: innerHeight / 2, on: false }
addEventListener('keydown', (e) => {
  audio.unlock()
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

/** A child who has not popped for a few seconds sees a drawn finger tapping on a balloon. */
function updateHint() {
  const el = $('hint')
  if (game.idle < IDLE_HINT) game.hinted = false
  if (game.state !== 'play' || game.idle < IDLE_HINT || pin.on || blow || (game.hints >= HINTS && !game.hinted)) return el.classList.add('hidden')
  const { h } = halfSize()
  const b = balloons.list.find((x) => !x.held && x.group.position.y > -h * 0.6 && x.group.position.y < h * 0.5)
  if (!b) return el.classList.add('hidden')
  // It comes back in at most a few idle stretches a visit: a child who has played knows.
  if (!game.hinted) {
    game.hinted = true
    game.hints += 1
  }
  el.classList.remove('hidden')
  v3.copy(b.group.position).project(camera)
  el.style.transform = `translate(${((v3.x + 1) / 2) * innerWidth}px, ${((1 - v3.y) / 2) * innerHeight}px)`
}

// --- Loading ------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  const [b, w] = await Promise.allSettled([loader.loadAsync('./models/balloons.glb'), loader.loadAsync('./models/world.glb')])
  if (b.status === 'fulfilled') balloons.attach(b.value)
  else console.warn('balloons.glb failed', b.reason)
  if (w.status === 'fulfilled') world.attach(w.value)
  else console.warn('world.glb failed', w.reason)
  // Compile and upload every balloon kind now, so the first one on screen doesn't stutter.
  const warm = Object.keys(KINDS).map((k) => balloons.make(k))
  renderer.compile(scene, camera)
  for (const b of warm) balloons.remove(b)
  game.state = 'title'
  game.spawnIn = 0.2
  show('title')
}

// --- Loop -----------------------------------------------------------------------------

const timer = new THREE.Timer()
timer.connect(document)
const twinkleAt = new THREE.Vector3()

renderer.setAnimationLoop(() => {
  timer.update()
  const dt = Math.min(timer.getDelta(), 1 / 20)
  const t = timer.getElapsed()
  if (game.state !== 'loading') {
    spawnTick(dt)
    if (game.state === 'play') {
      game.idle += dt
      game.pause = Math.max(0, game.pause - dt)
      if (game.party > 0 && (game.party -= dt) <= 0) {
        game.party = 0
        game.pause = 1.2
        introduceLevel()
      }
    }
    balloons.update(dt, t, halfSize(-1.5).h)
    blowTick(dt)
    for (const b of balloons.list) {
      // A sinking balloon wobbles all the way down; a carried friend steps off at the grass and its balloon floats home.
      if (b.sinker) b.squish = Math.max(b.squish, 0.45)
      // A giant stays wholly on screen, however big it has grown.
      if (b.giant !== undefined) {
        const room = halfSize(b.group.position.z).w - 1.35 * b.targetScale
        const x = b.group.position.x
        if (Math.abs(x) > room) b.group.position.x += (Math.sign(x) * Math.max(0, room) - x) * Math.min(1, dt * 4)
      }
      if (b.descending && b.cargo && b.cargo.getWorldPosition(twinkleAt).y <= -halfSize(0).h * 0.62) {
        drop(b, true)
        Object.assign(b, { descending: false, speed: 1.1, squish: 1 })
        audio.letGo()
      }
    }
    flock.update(dt, t, (c, hard) => {
      if (hard) audio.thud()
      effects.sparkleAt(c.mesh.position, '#ffffff', hard ? 4 : 2)
    })
    bird.update(dt, t, (at) => {
      for (const b of balloons.list) if (!b.held && !b.giant && b.group.position.distanceTo(at) < 1.1 * b.scale + 0.3) pop(b)
    })
    // Golden and star balloons shimmer softly as they rise
    for (const b of balloons.list) {
      if (!(b.kind.gold || b.kind.power === 'star') || Math.random() >= dt * 2.5) continue
      twinkleAt.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2, 0.6).add(b.group.position)
      effects.sparkleAt(twinkleAt, '#fff3b0', 1)
    }
  }
  world.update(dt, t)
  effects.update(dt)
  updatePin(dt)
  updateHint()
  audio.updateMusic(game.state !== 'loading')
  renderer.render(scene, camera)
})

show('loading')
load()
if (new URLSearchParams(location.search).has('debug')) window.__balloonPop = { game, balloons, camera, world, spawn, surprise, nextSurprise, flock, bird, pop }
