import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Balloons, COLORS, KINDS, PALETTE } from './balloons.js'
import { Effects } from './effects.js'
import { SKY_COLOURS, dotLayout, makeRequest } from './sky.js'
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

// --- Levels -----------------------------------------------------------------------
// Each level adds one new friend. Nothing is ever lost: balloons that float
// away just float away, and every pop fills the level bar a little more.

// Calm pass: one gentle, constant pace for every level. Levels only introduce new friends;
// they never speed up (the old ramp reached 2.3x speed and a balloon every 0.55 s).
const PACE = { speed: 1.0, every: 1.35 }
const LEVELS = [
  { goal: 8, ...PACE, kinds: { round: 3, smile: 2 } },
  { goal: 10, ...PACE, kinds: { round: 3, smile: 2, heart: 2 }, intro: ['💖', 'Heart balloons!', 'Can you find the hearts?'], show: 'heart' },
  { goal: 12, ...PACE, kinds: { round: 3, smile: 2, heart: 1.5, gold: 0.7 }, intro: ['👑', 'Golden balloons!', 'They wear a little crown'], show: 'gold' },
  { goal: 12, ...PACE, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, bunny: 2 }, intro: ['🐰', 'Bunny balloons!', 'Boing boing!'], show: 'bunny' },
  { goal: 14, ...PACE, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, bunny: 1.2, star: 0.35 }, intro: ['⭐', 'Star balloon!', 'Pop it to pop them all'], show: 'star' },
  { goal: 15, ...PACE, kinds: { round: 2.5, smile: 2, heart: 1, gold: 0.4, bunny: 1.2, star: 0.3, rainbow: 0.45 }, intro: ['🌈', 'Rainbow balloon!', 'It makes baby balloons'], show: 'rainbow' },
]
function level(n) {
  return LEVELS[Math.min(n, LEVELS.length) - 1]
}
const PARTY_EVERY = 3 // a calm Balloon Parade of friends after every third level

// --- Game state -------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | play
  level: 1,
  score: 0,
  progress: 0,
  spawnIn: 1,
  pause: 0, // seconds without spawning (between levels)
  party: 0, // seconds of Balloon Party left
  forced: null,
  firstPop: false,
  lastLane: 0,
  // Counting sky: the current request, how many are counted, and the calm pause after it is named.
  sky: null,
  skyWait: 0,
  skies: 0, // requests finished this visit
  biggest: 0, // the largest count finished this visit
}

// Optional learning missions. Hunts also make their balloons more common (see spawn).
const RED = '#ff595e'
const COOL_COLORS = ['#8ac926', '#2ec4b6', '#4d96ff', '#9b5de5']
const SKY = 'Counting sky'
const FREE = 'Free popping'
const missionPictures = {
  [SKY]: ['blue', 'blue', 'blue'],
  [FREE]: ['🎈'],
  'Count three balloons': ['🎈', '🎈', '🎈'],
  'Heart shape hunt': ['💖', '💖', '💖'],
  'Red colour hunt': ['red', 'red', 'red'],
}

/** A small picture: an emoji, or a drawn balloon when `type` is a colour name. */
function picture(type, filled = true) {
  const slot = document.createElement('span')
  const colour = SKY_COLOURS[type]
  slot.className = `mission-picture${filled ? ' filled' : ''}${colour ? ' colour-balloon' : ''}${type === 'red' ? ' red-balloon' : ''}`
  if (colour) slot.style.setProperty('--c', colour)
  else slot.textContent = type
  slot.setAttribute('aria-hidden', 'true')
  return slot
}

function renderMissionProgress(goal, option, count) {
  if (!option.goal) return
  goal.textContent = ''
  goal.setAttribute('aria-label', `${option.goal}. ${count} of ${option.target}.`)
  const caption = document.createElement('span')
  caption.className = 'mission-caption'
  caption.textContent = `${option.goal} · ${count} / ${option.target}`
  const slots = document.createElement('span')
  slots.className = 'mission-slots'
  missionPictures[option.label].forEach((type, i) => slots.append(picture(type, i < count)))
  goal.append(caption, slots)
}

let rewardTimer
function celebrateMission(text) {
  const reward = $('mission-reward')
  reward.replaceChildren()
  const pictures = document.createElement('span')
  pictures.className = 'mission-reward-pictures'
  missionPictures[adventure.option.label].forEach((type) => pictures.append(picture(type)))
  const words = document.createElement('span')
  words.textContent = `⭐ ${text} ⭐`
  reward.append(pictures, words)
  reward.classList.remove('show')
  void reward.offsetWidth
  reward.classList.add('show')
  const { w, h } = halfSize(0)
  effects.drift(w, h)
  audio.chord()
  clearTimeout(rewardTimer)
  rewardTimer = setTimeout(() => reward.classList.remove('show'), 3500)
}

const adventure = createAdventure({
  id: 'balloon-pop',
  anchor: $('play'),
  hud: $('hud'),
  isMuted: () => audio.muted,
  celebrate: celebrateMission,
  renderProgress: renderMissionProgress,
  options: [
    // The calm default: every level is one spoken, pictured counting request (js/sky.js).
    { emoji: '🔢', label: SKY },
    { emoji: '🐢', label: 'Count three balloons', pace: 0.6, goal: 'Pop three balloons', target: 3, reward: 'Three! You counted three balloons!' },
    { emoji: '❤️', label: 'Heart shape hunt', pace: 0.6, goal: 'Pop three heart balloons', target: 3, huntKind: 'heart', accept: (b) => b.kindName === 'heart', reward: 'Three! You found three hearts!' },
    { emoji: '🎨', label: 'Red colour hunt', pace: 0.6, goal: 'Pop three red balloons', target: 3, huntColor: RED, accept: (b) => ['round', 'smile', 'heart', 'mini'].includes(b.kindName) && b.color === RED, reward: 'Three! You found three red balloons!' },
    // For the youngest: the Phase 1 sky where every balloon pops and fills the level bar.
    { emoji: '🎈', label: FREE },
  ],
})

function renderMissionChoice() {
  const option = adventure.option
  const button = $('adventure-choice')
  button.replaceChildren()
  const pictures = document.createElement('span')
  pictures.className = 'mission-choice-pictures'
  const types = missionPictures[option.label] || ['🎈']
  // The counting sky's picture is a row of slots, two filled and one waiting.
  types.forEach((type, i) => pictures.append(picture(type, option.label !== SKY || i < types.length - 1)))
  const label = document.createElement('span')
  label.textContent = option.goal ? option.label.replace(' three balloons', '').replace(' shape hunt', 's').replace(' colour hunt', '') : option.label
  const next = document.createElement('span')
  next.className = 'mission-next'
  next.textContent = '↻'
  next.setAttribute('aria-hidden', 'true')
  button.append(pictures, label, next)
}
renderMissionChoice()
$('adventure-choice').addEventListener('click', renderMissionChoice)

function announceMission() {
  if (!adventure.option.goal || audio.muted || !('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const words = new SpeechSynthesisUtterance(adventure.option.goal)
  words.lang = 'en-US'
  words.rate = 0.82
  speechSynthesis.speak(words)
}

/** Speak aloud (respecting mute). `queue` lets a count finish before the next word instead of cutting it off. */
function say(text, { queue = false } = {}) {
  if (audio.muted || !('speechSynthesis' in window)) return
  if (!queue) speechSynthesis.cancel()
  const words = new SpeechSynthesisUtterance(text)
  words.lang = 'en-US'
  words.rate = 0.82
  speechSynthesis.speak(words)
}

// --- Counting sky -------------------------------------------------------------------
// One calm request per level: picture slots fill with each matching pop and are counted aloud.

const counting = () => game.state === 'play' && adventure.option.label === SKY

function newRequest() {
  game.recent = [...(game.recent ?? []), game.sky?.req].filter(Boolean).slice(-3)
  game.sky = { req: makeRequest(game.level, game.recent), count: 0, done: false, colours: [] }
  renderSky()
  say(game.sky.req.say)
}

/** A slot for one balloon of the request: its colour or shape, numbered once it is filled. */
function skySlot(req, n, filled) {
  const slot = picture(req.colour ?? req.picture, filled)
  slot.classList.add('sky-slot')
  if (filled) {
    const num = document.createElement('b')
    num.className = 'sky-num'
    num.textContent = n
    slot.append(num)
    if (n === game.sky.count) slot.classList.add('new')
  }
  return slot
}

function renderSky() {
  const card = $('sky')
  const { req, count, done } = game.sky
  card.classList.toggle('done', done)
  // The colour word is printed in its colour, so the caption also works as a picture.
  const caption = $('sky-caption')
  const text = done ? req.named : req.say.replace('Look at the gold balloon. ', '')
  if (req.colour) {
    const [before, ...after] = text.split(req.colour)
    const word = Object.assign(document.createElement('span'), { className: 'sky-word', textContent: req.colour })
    word.style.setProperty('--c', SKY_COLOURS[req.colour])
    caption.replaceChildren(before, word, after.join(req.colour))
  } else caption.textContent = text
  card.setAttribute('aria-label', `${done ? req.named : req.say} ${count} of ${req.total}.`)
  const slots = $('sky-slots')
  slots.replaceChildren()
  if (req.type === 'dots') {
    // A gold balloon carrying dots: each pop lights one dot (one balloon for each dot).
    const gold = document.createElement('span')
    gold.className = 'sky-gold'
    dotLayout(req.total).forEach(([x, y], i) => {
      const dot = document.createElement('i')
      dot.className = i < count ? 'lit' : ''
      dot.style.left = `${x}%`
      dot.style.top = `${y}%`
      gold.append(dot)
    })
    // Beside it, the balloons popped so far, each in its own colour and numbered, in rows of five.
    const tally = document.createElement('span')
    tally.className = 'sky-group'
    game.sky.colours.forEach((hex, i) => {
      if (i % 5 === 0) tally.append(Object.assign(document.createElement('span'), { className: 'sky-row' }))
      const slot = skySlot({ picture: '' }, i + 1, true)
      slot.classList.add('colour-balloon')
      slot.style.setProperty('--c', hex)
      tally.lastChild.append(slot)
    })
    slots.append(gold, tally)
    return
  }
  // Rows of at most five, like a ten-frame; an adding request shows its two groups apart.
  let n = 0
  req.parts.forEach((part, g) => {
    if (g) {
      const plus = document.createElement('span')
      plus.className = 'sky-plus'
      plus.textContent = '+'
      slots.append(plus)
    }
    const group = document.createElement('span')
    group.className = 'sky-group'
    for (let r = 0; r < part; r += 5) {
      const row = document.createElement('span')
      row.className = 'sky-row'
      for (let i = r; i < Math.min(part, r + 5); i++, n++) row.append(skySlot(req, n + 1, n < count))
      group.append(row)
    }
    slots.append(group)
  })
}

/** A pop in the counting sky. Returns true when the balloon filled a slot. */
function countPop(b) {
  const sky = game.sky
  if (!sky || sky.done || !sky.req.accept(b)) return false
  sky.count += 1
  sky.colours.push(b.color)
  audio.count(sky.count)
  if (sky.count === sky.req.total) {
    sky.done = true
    game.skies += 1
    game.biggest = Math.max(game.biggest, sky.req.total)
    say(String(sky.count), { queue: true })
    say(sky.req.named, { queue: true })
    const { w, h } = halfSize(0)
    effects.drift(w, h)
    setTimeout(() => audio.chord(), 500)
    game.skyWait = 4.5 // a calm pause before the next request
  } else say(String(sky.count), { queue: true })
  renderSky()
  return true
}

function nextSky() {
  game.level += 1
  const lv = level(game.level)
  // A new balloon friend is still introduced (and sent up first), as in free popping.
  if (lv.intro && game.level <= LEVELS.length) {
    showIntro(...lv.intro)
    game.forced = lv.show
  }
  newRequest()
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
  const mission = game.state === 'play' ? adventure.option : {}
  const targetSpawn = Math.random() < 0.55
  if (targetSpawn && mission.huntKind) kindName = mission.huntKind
  // Counting sky: about two in five new balloons match the request, so there is always one to find.
  const req = counting() && game.sky && !game.sky.done ? game.sky.req : null
  if (req && !opts.color && Math.random() < 0.4) {
    if (req.kind) kindName = req.kind
    else if (req.colour && ['round', 'smile'].includes(kindName)) opts = { ...opts, color: SKY_COLOURS[req.colour] }
  }
  if (mission.huntColor && ['round', 'smile', 'heart'].includes(kindName)) {
    opts = { ...opts, color: targetSpawn ? mission.huntColor : COOL_COLORS[(Math.random() * COOL_COLORS.length) | 0] }
  }
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
  b.speed = (game.state === 'title' ? 0.8 : lv.speed * adventure.pace) * (0.85 + Math.random() * 0.3)
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
    if (balloons.list.length >= 9) return
    spawn(pickKind({ round: 3, smile: 2, heart: 2, bunny: 1.5, gold: 0.8 }))
  } else {
    // Never more than a comfortable handful on screen at once
    if (balloons.list.length >= 9) return
    spawn(pickKind(level(game.level).kinds))
  }
  game.spawnIn = (game.party > 0 ? 0.9 : level(game.level).every) * (0.8 + Math.random() * 0.4)
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
  const pos = b.group.position.clone()
  balloons.remove(b)
  if (b.string) effects.dropString(b.string)
  if (b.crown) effects.dropString(b.crown, 4)
  const playing = game.state === 'play'
  const big = !!b.kind.power
  effects.pop(pos, b.color, { big, gold: b.kind.gold })
  // Counting sky: a matching balloon fills a slot; any other one still pops, just more softly.
  const sky = counting()
  const counted = sky && countPop(b)
  // Each colour sings its own note, so pops make a little tune instead of a climbing combo.
  const colourNote = Math.max(0, PALETTE.indexOf(b.color))
  audio.pop(chain ? 3 + ((Math.random() * 6) | 0) : colourNote, b.scale < 0.6 ? 0.7 : b.kindName === 'bunny' ? 1.2 : 1, sky && !counted ? 0.55 : 1)
  if (b.kind.gold) audio.sparkle()
  if (!game.firstPop && (!sky || counted)) {
    game.firstPop = true
    $('hint').classList.add('hidden')
  }
  if (!playing) return
  if (!chain) adventure.event(b)

  // The counter shows how many balloons the child popped (no points, combos or bonuses).
  game.score += 1

  if (b.kind.power === 'star') {
    audio.boom()
    const others = [...balloons.list]
    others.sort((a, c) => a.group.position.distanceTo(pos) - c.group.position.distanceTo(pos))
    others.forEach((o, i) => setTimeout(() => pop(o, { chain: true }), 200 + i * 180))
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

  if (sky) return updateHud()
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
  effects.drift(w, h)
  const finished = game.level - 1
  if (finished % PARTY_EVERY === 0) {
    game.party = 9
    game.pause = 1.6
    showIntro('🎈', 'Balloon parade!', 'All your friends float by')
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
  $('level').textContent = game.party > 0 ? '🎈 Parade' : `Level ${game.level}`
  const goal = level(game.level).goal
  $('bar-fill').style.width = `${game.party > 0 ? 100 : Math.min(100, (game.progress / goal) * 100)}%`
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
  game.state = 'title'
  game.party = 0
  clearTimeout(rewardTimer)
  $('mission-reward').classList.remove('show')
  // Say what the child did, not how it ranks.
  let last = game.score ? `🎈 You popped ${game.score} balloon${game.score === 1 ? '' : 's'}!` : ''
  if (game.skies) {
    last = `🎈 You counted ${game.skies} sk${game.skies === 1 ? 'y' : 'ies'}, up to ${game.biggest} balloon${game.biggest === 1 ? '' : 's'}!`
    say(`You counted up to ${game.biggest}!`)
  }
  $('last').textContent = last
  $('last').classList.toggle('hidden', !last)
  $('sky').hidden = true
  game.sky = null
  show('title')
  renderMissionChoice() // adventure.begin() rewrote the choice as text; bring its pictures back
}

function start() {
  adventure.begin()
  clearTimeout(rewardTimer)
  $('mission-reward').classList.remove('show')
  audio.unlock()
  audio.click()
  balloons.clear()
  Object.assign(game, { state: 'play', level: 1, score: 0, progress: 0, spawnIn: 0.4, pause: 0, party: 0, forced: null, sky: null, recent: [], skyWait: 0, skies: 0, biggest: 0 })
  show('play')
  const sky = counting()
  $('hud').classList.toggle('counting', sky)
  $('sky').hidden = !sky
  updateHud()
  if (sky) {
    game.firstPop = false // the finger points at the first balloon to count
    newRequest()
  } else {
    showIntro('🎈', 'Pop the balloons!', 'Tap them before they fly away')
    announceMission()
  }
  if (!game.firstPop || adventure.option.goal) $('hint').classList.remove('hidden')
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
  else if (poked?.house) {
    audio.dingDong()
    effects.smoke(poked.house)
  } else if (poked?.tree) {
    audio.tweet()
    effects.leaves(poked.tree)
  } else if (poked?.hab) {
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
  if (game.state !== 'play' || (adventure.option.goal ? adventure.progress > 0 : game.firstPop)) return el.classList.add('hidden')
  const accept = counting() ? game.sky && !game.sky.done && game.sky.req.accept : adventure.option.accept
  const b = balloons.list.find((x) => x.group.position.y > -halfSize().h * 0.6 && (!accept || accept(x)))
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
      game.pause = Math.max(0, game.pause - dt)
      if (game.skyWait > 0 && (game.skyWait -= dt) <= 0) {
        game.skyWait = 0
        if (counting()) nextSky()
      }
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
      if (!(b.kind.gold || b.kind.power === 'star') || Math.random() >= dt * 2) continue
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
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game, balloons, camera }
