import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { Course, GEMS } from './course.js'
import { Dragon } from './dragon.js'
import { Particles, Popups, Rings } from './effects.js'
import { loadModels } from './models.js'
import { NEST_Y, World } from './world.js'
import { WORLDS, WORLD_LENGTH, worldAt } from './worlds.js'

const $ = (id) => document.getElementById(id)
const rand = THREE.MathUtils.randFloat
const { clamp, damp } = THREE.MathUtils
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const easeStep = (rate, dt) => 1 - Math.exp(-rate * dt)

// --- Saved bits (private windows may refuse storage, so everything is guarded) ---------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  },
}

// --- Renderer, scene, camera ------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.35
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900)

// Tablets that can't keep up lose resolution, not frame rate.
const quality = { level: 2, frames: 0, time: 0 }
function applyQuality() {
  renderer.setPixelRatio(quality.level === 2 ? Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 0.8)
  resize()
}
function measureQuality(dt) {
  if (quality.level === 0 || game.state !== 'play') return
  quality.frames++
  quality.time += dt
  if (quality.time < 3) return
  const fps = quality.frames / quality.time
  quality.frames = quality.time = 0
  if (fps < 42) {
    quality.level--
    world.density = quality.level === 1 ? 0.75 : 0.55
    applyQuality()
  }
}

/** Where Ember may fly: narrower when the screen is held upright. */
const lane = { x: 5.5, yMin: 0.6, yMax: 8.4 }
const view = { back: 9.5, portrait: false }
function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  view.portrait = camera.aspect < 1
  camera.fov = view.portrait ? 74 : camera.aspect < 1.4 ? 66 : 60
  camera.updateProjectionMatrix()
  lane.x = view.portrait ? 3.2 : camera.aspect < 1.4 ? 4.4 : 5.5
  view.back = view.portrait ? 8 : 7.6
  const hpx = h * renderer.getPixelRatio()
  sparks?.setScale(hpx, camera.fov)
  dots?.setScale(hpx, camera.fov)
}
addEventListener('resize', resize)

// --- Game state -----------------------------------------------------------------------

const sound = new Sound()
const game = {
  state: 'loading', // loading | title | play | nest | results
  z: 0, // distance flown
  speed: 0,
  slow: 1,
  score: 0,
  gemCombo: 0,
  gemComboT: 0,
  hoops: 0, // hoops in a row
  power: 0,
  invuln: 0,
  world: 0,
  startWorld: 0,
  nestT: 0,
  time: 0,
  fireCd: 0,
  shake: 0,
  flapT: 0,
  tipT: 0,
  fired: 0,
  steered: 0,
  best: store.get('dragon-glide-best', 0),
  done: new Set(store.get('dragon-glide-worlds', [])),
}
if (new URLSearchParams(location.search).has('debug')) window.game = game

// Optional learning missions: a slower flight, or counting rings (four in every world).
const adventure = createAdventure({
  id: 'dragon-glide',
  anchor: $('play'),
  hud: $('hud'),
  isMuted: () => sound.muted,
  // The reward is spoken; the screen shows the four rings and a party, no reading needed
  celebrate: () => {
    countParty()
    sound.counted()
    dragon.twirl()
    for (let i = 0; i < 3; i++) sparks.burst(tmp.set(pos.x + (i - 1) * 1.6, pos.y + 1.2, pos.z - 2), RAINBOW, 22, 7, 0.8, { vz: -game.speed * 0.5 })
  },
  // Rings to fill in as you count, so a child who can't read can follow along
  renderProgress: (el, option, count) => {
    if (!option.goal) return
    const row = document.createElement('span')
    row.className = 'goal-rings'
    row.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < option.target; i++) {
      const r = document.createElement('i')
      if (i < count) r.className = i === count - 1 ? 'got new' : 'got'
      row.append(r)
    }
    const n = document.createElement('b')
    n.textContent = count >= option.target ? '⭐' : `${count} / ${option.target}`
    el.replaceChildren(row, n)
    el.setAttribute('aria-label', `${option.goal}: ${count} of ${option.target}`)
    el.classList.toggle('done', count >= option.target)
  },
  options: [
    { emoji: '🐉', label: 'Free flight' },
    { emoji: '🐢', label: 'Gentle flight', pace: 0.6 },
    { emoji: '⭕', label: 'Count 4 rings', pace: 0.75, goal: 'Fly through 4 rings', target: 4, reward: 'One, two, three, four! Four rings!' },
  ],
})
document.body.classList.toggle('mission', !!adventure.option.goal)
$('adventure-choice').addEventListener('click', () => document.body.classList.toggle('mission', !!adventure.option.goal))

/** Says the counting goal as each world starts, for children who can't read it yet. */
function sayGoal() {
  if (game.state !== 'play' || !adventure.option.goal || sound.muted || !('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance("Let's count four rings!")
  u.lang = 'en-US'
  u.rate = 0.85
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

let templates, dragon, world, course, sparks, dots, rings, popups
const pos = new THREE.Vector3(0, 4, 0) // Ember
const vel = new THREE.Vector2()
const target = new THREE.Vector2(0, 4)
const camPos = new THREE.Vector3(0, 5, 8)
const camLook = new THREE.Vector3(0, 4, 0)
let camRideZ = 0
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

async function init() {
  templates = await loadModels((k) => ($('load-bar').style.width = `${10 + k * 90}%`))
  sparks = new Particles(scene, { max: 900, glow: true })
  dots = new Particles(scene, { max: 500, glow: false })
  rings = new Rings(scene)
  popups = new Popups($('popups'), camera)
  dragon = new Dragon(templates.dragon)
  scene.add(dragon.root)
  world = new World(scene, templates)
  course = new Course(scene, templates, sparks)
  if (window.game) Object.assign(window, { course, world, dragon, pos, target, THREE, start, fire, renderer, scene, camera })
  buildTrip()
  buildWorldButtons()
  applyQuality()
  toTitle()
  renderer.setAnimationLoop(frame)
}

// --- Screens ----------------------------------------------------------------------------

function show(id) {
  for (const s of ['loading', 'title', 'results']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', id !== null)
  $('corner').classList.toggle('hidden', id === 'loading')
  document.body.dataset.screen = id ?? 'play'
}

function toTitle() {
  game.state = 'title'
  game.z = 0
  game.speed = 0
  pos.set(0, 4.3, 0)
  vel.set(0, 0)
  course.reset(0)
  world.reset(0)
  world.generate(200, lane)
  camPos.set(1.2, 4.9, 6)
  camLook.set(0, 4.3, 0)
  dragon.root.rotation.y = Math.PI
  sound.play(null)
  renderBest()
  show('title')
}

function renderBest() {
  $('best').textContent = `🏆 Best: ${game.best} 💎`
  $('best').classList.toggle('hidden', game.best === 0)
  document.querySelectorAll('#worlds button').forEach((b, i) => b.classList.toggle('done', game.done.has(i)))
}

function buildWorldButtons() {
  const el = $('worlds')
  WORLDS.forEach((w, i) => {
    const b = document.createElement('button')
    b.textContent = w.emoji
    b.title = w.name
    b.setAttribute('aria-label', `Start at ${w.name}`)
    b.onclick = () => start(i)
    el.append(b)
  })
}

function start(from = 0) {
  adventure.begin()
  sound.unlock()
  sound.click()
  game.state = 'play'
  game.startWorld = from
  game.world = from
  game.z = from * WORLD_LENGTH + 2
  game.speed = 4
  game.slow = 1
  game.score = 0
  game.hoops = 0
  game.gemCombo = 0
  game.power = 0
  game.invuln = 0
  game.time = 0
  game.tipT = 0
  game.fired = 0
  game.steered = 0
  pos.set(0, 4.3, -game.z)
  vel.set(0, 0)
  target.set(0, 4.3)
  course.reset(game.z)
  world.reset(game.z)
  world.addNest(from)
  // the camera swoops from Ember's face to behind
  camPos.set(1.2, 4.9, -game.z + 6)
  camLook.set(0, 4.3, -game.z)
  // the camera starts here, not at the title's spot (else a later world loses its first rings and its nest)
  camRideZ = pos.z
  $('score-num').textContent = '0'
  $('power').classList.add('hidden')
  updateCombo()
  show(null)
  $('hud').classList.remove('resting')
  const w = WORLDS[from]
  rings.setGlow(!!w.night)
  banner(`${w.emoji} ${w.name}`, 'Fly to the nest! 🪺')
  sound.play(w.music)
  tip('👆 Drag to fly!', 3.5)
  setTimeout(sayGoal, 900)
}

function finishTrip() {
  game.state = 'results'
  const nest = world.nestFor(game.world)
  if (nest) nest.cheer = 1e6
  const f = game.score / Math.max(1, course.possible)
  const stars = 1 + (f > 0.4 ? 1 : 0) + (f > 0.68 ? 1 : 0)
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">⭐</span>`).join('')
  $('final').textContent = game.score
  const isBest = game.score > game.best
  if (isBest) {
    game.best = game.score
    store.set('dragon-glide-best', game.best)
  }
  $('new-best').classList.toggle('hidden', !isBest || game.score === 0)
  $('best-line').textContent = `🏆 Best: ${game.best} 💎`
  sound.finish()
  show('results')
}

// --- HUD ----------------------------------------------------------------------------

let bannerTimer
let bannerHold = 0 // the counting party isn't cut short by a smaller message
function banner(text, small, ms = 2400, kind = '') {
  const now = performance.now()
  if (!kind && now < bannerHold && game.state === 'play') return
  bannerHold = kind === 'mission' ? now + ms : 0
  const el = $('banner')
  el.className = `banner ${kind}`
  const line = document.createElement('span')
  line.className = 'line'
  line.textContent = text
  el.replaceChildren(line)
  // the big line stays on one line (shrinking a little on narrow phones), so the second line never drops onto the family
  const room = el.clientWidth - 32
  if (text && line.offsetWidth > room) line.style.fontSize = `${Math.max(0.6, room / line.offsetWidth)}em`
  if (small) {
    const s = document.createElement('small')
    s.textContent = small
    el.append(s)
  }
  el.classList.add('show')
  $('hud').classList.add('bannering')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => {
    el.classList.remove('show')
    $('hud').classList.remove('bannering')
  }, ms)
}

/** The counting party: four gold rings pop in one by one, each with its number, in time with the chimes. */
function countParty() {
  banner('', null, 3400, 'mission')
  const row = document.createElement('div')
  row.className = 'count-row'
  for (let i = 0; i < 4; i++) {
    const s = document.createElement('span')
    s.style.animationDelay = `${COUNT_BEAT[0] + i * COUNT_BEAT[1]}s`
    s.innerHTML = `<i></i><b>${i + 1}</b>`
    row.append(s)
  }
  $('banner').append(row)
}
const COUNT_BEAT = [0.3, 0.42] // first ring, then one every beat (audio.js counted() uses the same)

let tipTimer
function tip(text, secs) {
  const el = $('tip')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => el.classList.remove('show'), secs * 1000)
}

function bumpScore() {
  const el = $('score')
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
  $('score-num').textContent = game.score
}

let comboTimer
function updateCombo() {
  const el = $('combo')
  clearTimeout(comboTimer)
  if (game.hoops >= 2) {
    el.textContent = `💫 ${game.hoops} rings in a row!`
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    // it goes again after a moment instead of hanging over the sky until the next miss
    comboTimer = setTimeout(() => el.classList.remove('show'), 2400)
  } else el.classList.remove('show')
}

function buildTrip() {
  $('trip-stops').innerHTML = [...WORLDS.map((w) => `<span>${w.emoji}</span>`), '<span>🪺</span>'].join('')
}
let tripShown = -1
function showTrip() {
  const p = Math.round(clamp(game.z / (WORLDS.length * WORLD_LENGTH), 0, 1) * 500) / 500
  if (p === tripShown) return
  tripShown = p
  $('trip-fill').style.transform = `scaleX(${p})`
  $('trip-dragon').style.transform = `translateX(${p * 100}%)`
}

let powerShown = -1
function showPower() {
  const el = $('power')
  el.classList.toggle('hidden', game.power <= 0)
  const f = Math.round((game.power / POWER_TIME) * 50) / 50
  if (f !== powerShown) {
    powerShown = f
    $('power-bar').style.transform = `scaleX(${f})`
  }
}

function renderToggles() {
  $('sound').textContent = sound.muted ? '🔇' : '🔊'
  $('music').classList.toggle('off', !sound.musicOn)
}

function toggleSound() {
  sound.unlock()
  sound.setMuted(!sound.muted)
  renderToggles()
}

function toggleMusic() {
  sound.unlock()
  sound.setMusic(!sound.musicOn)
  renderToggles()
}

// --- Input ------------------------------------------------------------------------------

const keys = new Set()
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const touch = { id: null, x: 0, y: 0, t: 0, moved: 0 }
let mouseAim = null // last mouse position, re-aimed every frame while the camera moves

function aimMouse(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  plane.constant = -pos.z // the plane Ember flies in (z = pos.z)
  if (!raycaster.ray.intersectPlane(plane, tmp)) return
  target.set(clamp(tmp.x, -lane.x, lane.x), clamp(tmp.y, lane.yMin, lane.yMax))
}

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (game.state !== 'play') return
  if (e.pointerType === 'mouse') {
    if (e.button === 0) fire()
    mouseAim = [e.clientX, e.clientY]
    return
  }
  if (touch.id === null) {
    touch.id = e.pointerId
    touch.x = e.clientX
    touch.y = e.clientY
    touch.t = performance.now()
    touch.moved = 0
  }
})
addEventListener('pointermove', (e) => {
  if (game.state !== 'play') return
  if (e.pointerType === 'mouse') {
    mouseAim = [e.clientX, e.clientY]
    game.steered = 1
    return
  }
  if (e.pointerId !== touch.id) return
  const dx = e.clientX - touch.x
  const dy = e.clientY - touch.y
  touch.x = e.clientX
  touch.y = e.clientY
  touch.moved += Math.abs(dx) + Math.abs(dy)
  // drag anywhere: Ember moves with the finger (a bit more, so small hands reach the edges)
  const k = (2.6 * lane.x) / Math.min(innerWidth, innerHeight * 1.3)
  target.x = clamp(target.x + dx * k, -lane.x, lane.x)
  target.y = clamp(target.y - dy * k, lane.yMin, lane.yMax)
  if (touch.moved > 30) game.steered = 1
})
function endTouch(e) {
  if (e.pointerId !== touch.id) return
  // a quick tap (not a drag) puffs fire
  if (touch.moved < 14 && performance.now() - touch.t < 350) fire()
  touch.id = null
}
addEventListener('pointerup', endTouch)
addEventListener('pointercancel', (e) => {
  if (e.pointerId === touch.id) touch.id = null
})
addEventListener('keydown', (e) => {
  sound.unlock()
  if (e.code === 'KeyM') return toggleSound()
  if (e.code === 'Escape') return game.state === 'play' || game.state === 'nest' ? toTitle() : undefined
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    if (e.repeat) return
    if (game.state === 'title') return start(0)
    if (game.state === 'results') return start(0)
    return fire()
  }
  if (e.code.startsWith('Arrow')) {
    e.preventDefault()
    game.steered = 1
  }
  keys.add(e.code)
})
addEventListener('keyup', (e) => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend()
  else if (sound.ctx) sound.unlock()
})

const fireBtn = $('fire')
fireBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  sound.unlock()
  fire()
})
$('home').addEventListener('click', () => {
  sound.click()
  toTitle()
})
$('music').addEventListener('click', toggleMusic)
$('sound').addEventListener('click', toggleSound)
$('play').addEventListener('click', () => start(0))
$('again').addEventListener('click', () => start(game.startWorld))
$('to-title').addEventListener('click', () => {
  sound.click()
  toTitle()
})

const FIRE_COLORS = ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0', '#ff7eb9']
function fire() {
  if (game.state !== 'play' || game.fireCd > 0) return
  game.fireCd = 0.28
  game.fired++
  dragon.puff()
  dragon.mouth.getWorldPosition(tmp)
  course.shoot(tmp, game.speed)
  sound.fire()
  for (let i = 0; i < 14; i++) {
    sparks.emit(tmp.x, tmp.y, tmp.z, { vx: rand(-1.5, 1.5), vy: rand(-0.5, 1.5), vz: -game.speed - rand(4, 12), spread: 1, life: 0.4, size: rand(0.5, 0.9), color: pick(FIRE_COLORS), drag: 3 })
  }
  fireBtn.classList.remove('press')
  void fireBtn.offsetWidth
  fireBtn.classList.add('press')
  setTimeout(() => fireBtn.classList.remove('press'), 120)
}

// --- Events from the course ---------------------------------------------------------

const POWER_TIME = 7
const YAY = ['Wheee!', 'Yay!', 'Super!', 'Woo-hoo!', 'Sparkly!']
const OOPS = ['Bonk!', 'Boing!', 'Oopsie!', 'Bonk! 💫']
const RAINBOW = ['#ff6b6b', '#ffd23f', '#8ef0c8', '#7cc6fe', '#c9b6ff', '#ff8fc7']

function addScore(n) {
  game.score += n
  bumpScore()
}

function handle(events) {
  for (const ev of events) {
    if (ev.type === 'gem') {
      game.gemCombo = game.gemComboT > 0 ? game.gemCombo + 1 : 0
      game.gemComboT = 1.2
      addScore(ev.points)
      const big = ev.kind === 'big'
      sound.gem(game.gemCombo, big)
      sparks.burst(ev.pos, GEMS[ev.kind].colors, big ? 26 : 12, big ? 7 : 4.5, big ? 0.8 : 0.55, { vz: -game.speed * 0.6 })
      if (big) popups.show(ev.pos, `+${ev.points} ✨`, 'big')
      else if (game.gemCombo > 0 && game.gemCombo % 5 === 4) popups.show(ev.pos, pick(YAY))
    } else if (ev.type === 'hoop') {
      game.hoops++
      adventure.event()
      const pts = 2 + Math.min(game.hoops, 6)
      addScore(pts)
      sound.hoop(game.hoops)
      const c = WORLDS[game.world].hoop.hoop_cloud
      rings.spawn(ev.pos, typeof c === 'string' ? c : c.color, 4.5, 0.5)
      rings.spawn(ev.pos, '#fff3a0', 6.5, 0.7)
      sparks.burst(ev.pos, RAINBOW, 24, 8, 0.45, { vz: -game.speed * 0.5 })
      popups.show(tmp.set(ev.pos.x, ev.pos.y + 2.4, ev.pos.z), `+${pts}`, 'hoop')
      if (game.hoops >= 3) dragon.twirl()
      updateCombo()
    } else if (ev.type === 'hoopMiss') {
      if (game.hoops >= 2) sound.whiff()
      game.hoops = 0
      updateCombo()
    } else if (ev.type === 'bubble') {
      addScore(3)
      sound.pop()
      sparks.burst(ev.pos, RAINBOW, 26, 7, 0.65, { vz: -game.speed * 0.4 })
      rings.spawn(ev.pos, '#bdeaff', 3.5)
      popups.show(ev.pos, '+3 Pop!', 'big')
    } else if (ev.type === 'lantern') {
      addScore(2)
      sound.lantern()
      sparks.burst(ev.pos, ['#fff3a0', '#ffd23f', '#ff9f43'], 20, 5, 0.6, { vz: -game.speed * 0.3 })
      popups.show(ev.pos, '+2 ✨')
    } else if (ev.type === 'power') {
      game.power = POWER_TIME
      addScore(5)
      sound.power()
      dragon.twirl()
      sparks.burst(ev.pos, RAINBOW, 40, 9, 0.8)
      banner('🌈 Rainbow zoom!', 'Gems fly to you!', 1800)
    } else if (ev.type === 'bonk') {
      dragon.bonk()
      sound.bonk()
      game.slow = 0.4
      game.invuln = 1.4
      game.shake = 0.35
      game.hoops = 0
      updateCombo()
      // bounce away from whatever we bumped
      tmp2.set(pos.x - ev.pos.x, pos.y - ev.pos.y, 0)
      if (tmp2.lengthSq() < 0.01) tmp2.set(pos.x >= 0 ? -1 : 1, 0.3, 0)
      tmp2.normalize()
      vel.x += tmp2.x * 10
      vel.y += tmp2.y * 7
      target.x = clamp(pos.x + tmp2.x * 2.5, -lane.x, lane.x)
      target.y = clamp(pos.y + tmp2.y * 2, lane.yMin, lane.yMax)
      popups.show(tmp.set(pos.x, pos.y + 1.6, pos.z), pick(OOPS), 'oops')
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        sparks.emit(pos.x + Math.cos(a) * 0.9, pos.y + 1.1, pos.z + Math.sin(a) * 0.9, { vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5 - game.speed * 0.4, vy: 0.5, spread: 0.3, life: 1, size: 0.5, color: '#fff3a0', drag: 1 })
      }
    }
  }
}

// --- Nests ------------------------------------------------------------------------------

function arriveAtNest() {
  game.state = 'nest'
  game.nestT = 0
  game.power = 0
  game.hoops = 0
  updateCombo()
  const w = WORLDS[game.world]
  const nest = world.nestFor(game.world)
  if (nest) nest.cheer = 4.2
  game.done.add(game.world)
  store.set('dragon-glide-worlds', [...game.done])
  sound.fanfare()
  setTimeout(() => sound.rawr(0.8), 500)
  setTimeout(() => sound.rawr(1.3), 800)
  const last = game.world === WORLDS.length - 1
  banner('🎉 Home to the nest!', last ? 'You flew all the way! 🌟' : `${w.emoji} ${w.name} done!`, 3200)
  dragon.twirl()
}

function leaveNest() {
  game.world++
  game.state = 'play'
  game.speed = 2
  const w = WORLDS[game.world]
  world.addNest(game.world)
  rings.setGlow(!!w.night)
  $('hud').classList.remove('resting')
  adventure.begin()
  banner(`${w.emoji} ${w.name}`, 'Off we go! 🐉')
  setTimeout(sayGoal, 900)
  sound.play(w.music)
  target.set(0, 4.5)
}

// --- Main loop ----------------------------------------------------------------------------

const TRAIL = { vx: 0, vy: 0, vz: 0, spread: 0.3, life: 0.5, size: 0.45, color: '#ffffff', drag: 1 }
const AIR = { vx: 0, vy: 0, vz: 0, spread: 0.05, life: 1.6, size: 0.18, color: '#ffffff', drag: 0 }
let last = performance.now()

function frame() {
  const now = performance.now()
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  tick(dt)
  renderer.render(scene, camera)
}

// ?debug: sim(seconds) runs the game forward without rendering (background tabs don't animate)
if (window.game) window.sim = (secs, draw = true, dt = 1 / 30) => {
  for (let t = 0; t < secs; t += dt) tick(dt)
  if (draw) renderer.render(scene, camera)
  return { z: game.z, state: game.state, score: game.score, world: game.world }
}

function tick(dt) {
  game.time += dt
  measureQuality(dt)

  const prevZ = pos.z
  const playing = game.state === 'play'
  if (playing) updatePlay(dt)
  else if (game.state === 'nest') updateNest(dt)
  else {
    // title: Ember hovers and smiles at the camera; at the end Ember bounces in the nest
    const home = game.state !== 'title'
    pos.x = damp(pos.x, home ? 0 : Math.sin(game.time * 0.6) * 0.4, 2, dt)
    pos.y = damp(pos.y, home ? NEST_Y + 1.5 + Math.abs(Math.sin(game.time * 2.5)) * 0.3 : 4.3 + Math.sin(game.time * 1.1) * 0.25, 2, dt)
    vel.set(0, Math.cos(game.time * 1.1) * 0.3)
  }

  // Ember
  dragon.root.position.copy(pos)
  const faceCamera = game.state === 'play' || (game.state === 'nest' && game.nestT < 0) ? 0 : Math.PI
  dragon.root.rotation.y += (faceCamera - dragon.root.rotation.y) * easeStep(5, dt)
  dragon.update(dt, { vx: playing ? vel.x : 0, vy: playing ? vel.y : 0, flap: playing ? 1 + (game.power > 0 ? 0.6 : 0) : 0.6 })
  // a soft whoosh on each big wing beat
  if (playing) {
    game.flapT += dt * dragon.flapRate
    if (game.flapT > Math.PI * 2) {
      game.flapT -= Math.PI * 2
      sound.flap()
    }
  }

  const behindZ = camera.position.z + 25
  handle(course.update(dt, pos, prevZ, game.time, { magnet: game.power > 0, invulnerable: game.invuln > 0 || game.power > 0, playing, behindZ }))
  world.generate(game.z + 185, lane)
  course.generate(game.z + 180, lane)

  updateCamera(dt)
  world.update(dt, camera, game.z)
  sparks.update(dt)
  dots.update(dt)
  rings.update(dt)
}

function updatePlay(dt) {
  game.fireCd -= dt
  game.gemComboT -= dt
  game.invuln = Math.max(0, game.invuln - dt)
  game.slow = Math.min(1, game.slow + dt * 0.6)
  game.tipT += dt
  if (game.power > 0) {
    game.power -= dt
    if (game.power <= 0) sound.powerDown()
    showPower()
  }
  if (game.tipT > 6 && game.tipT - dt <= 6 && !game.fired) tip('👆 Tap or 🔥 to puff fire!', 4)
  // a child who hasn't found out how to steer yet gets the hint again
  if (!game.steered && game.tipT > 12 && (game.tipT - 12) % 14 < dt) tip('👆 Drag to fly!', 3.5)

  // Speed: each world a little quicker; the rainbow star makes it zoom
  const w = WORLDS[game.world]
  const cruise = w.speed * game.slow * adventure.pace * (game.power > 0 ? 1.45 : 1)
  game.speed = damp(game.speed, cruise, 1.5, dt)
  game.z += game.speed * dt

  // Steering: keys nudge the target, mouse points at it, fingers drag it
  const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
  const ky = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0)
  if (kx || ky) {
    mouseAim = null
    target.x = clamp(target.x + kx * 9 * dt, -lane.x, lane.x)
    target.y = clamp(target.y + ky * 7 * dt, lane.yMin, lane.yMax)
  } else if (mouseAim) aimMouse(mouseAim[0], mouseAim[1])
  target.x = clamp(target.x, -lane.x, lane.x)
  const stiff = game.invuln > 0.8 ? 14 : 38
  const damping = game.invuln > 0.8 ? 5 : 10
  vel.x += ((target.x - pos.x) * stiff - vel.x * damping) * dt
  vel.y += ((target.y - pos.y) * stiff - vel.y * damping) * dt
  pos.x = clamp(pos.x + vel.x * dt, -lane.x - 0.8, lane.x + 0.8)
  pos.y = clamp(pos.y + vel.y * dt, lane.yMin - 0.4, lane.yMax + 0.6)
  pos.z = -game.z

  // Trails: wingtip wisps when going fast, rainbows when zooming
  if (game.power > 0) {
    for (let i = 0; i < 2; i++) {
      TRAIL.color = RAINBOW[(Math.random() * RAINBOW.length) | 0]
      TRAIL.vz = -game.speed * 0.7
      sparks.emit(pos.x + rand(-0.3, 0.3), pos.y + rand(-0.2, 0.3), pos.z + 1.3, TRAIL)
    }
  }
  // drifting air sparkles rush past and sell the speed
  if (Math.random() < dt * 30) {
    AIR.color = WORLDS[game.world].night ? '#fff6c9' : '#ffffff'
    sparks.emit(pos.x + rand(-14, 14), pos.y + rand(-6, 8), pos.z - rand(30, 60), AIR)
  }

  // Reached the nest?
  const nestZ = (game.world + 1) * WORLD_LENGTH
  if (game.z > nestZ - 55) {
    game.state = 'nest'
    $('hud').classList.add('resting') // 🔥 rests while the family celebrates
    game.nestT = -1 // flying in
  }
  sound.wind(clamp(game.speed / 25, 0, 1))
  showTrip()
}

/** Glide down into the nest, celebrate with the family, then fly on (or finish). */
function updateNest(dt) {
  const nestZ = (game.world + 1) * WORLD_LENGTH
  const seatY = NEST_Y + 1.5
  if (game.nestT < 0) {
    // flying in: slow down and line up with the nest
    const left = nestZ - game.z
    game.speed = damp(game.speed, Math.max(1.5, left * 0.9), 3, dt)
    game.z = Math.min(nestZ, game.z + game.speed * dt)
    pos.x = damp(pos.x, 0, 2.2, dt)
    pos.y = damp(pos.y, seatY + Math.min(3, left * 0.06), 2.2, dt)
    vel.set(-pos.x * 0.6, 0)
    pos.z = -game.z
    if (left < 0.4) arriveAtNest()
    sound.wind(clamp(game.speed / 25, 0, 1) * 0.6)
  } else {
    game.nestT += dt
    pos.x = damp(pos.x, 0, 3, dt)
    pos.y = damp(pos.y, seatY + Math.abs(Math.sin(game.nestT * 3.2)) * 0.35, 4, dt)
    vel.set(0, 0)
    if (Math.random() < dt * 6) {
      const c = RAINBOW[(Math.random() * RAINBOW.length) | 0]
      dots.emit(rand(-5, 5), NEST_Y + rand(7, 9), -nestZ + rand(-2, 2), { vx: rand(-1, 1), vy: rand(-1, -2.5), spread: 1, life: 2.5, size: rand(0.3, 0.45), endSize: 0.2, color: c, grav: -1.2, drag: 0.4 })
    }
    if (Math.random() < dt * 2) {
      sparks.emit(rand(-1.5, 1.5), seatY + 1.5, -nestZ + 0.5, { vx: 0, vy: 2, spread: 0.6, life: 1.2, size: 0.7, color: '#ff8fc7', drag: 0.5 })
    }
    if (game.nestT > 4.6) {
      if (game.world < WORLDS.length - 1) leaveNest()
      else if (game.state === 'nest') {
        game.state = 'done'
        sound.play(null)
        finishTrip()
      }
    }
  }
  showTrip()
}

/** How far (in world units) to slide the nest picture right, past the end card on sideways phones. */
const sideResults = matchMedia('(max-height: 480px) and (orientation: landscape)')
function sideShift() {
  if (!sideResults.matches) return 0
  const card = document.querySelector('#results .menu-bottom').getBoundingClientRect()
  if (!card.width) return 0
  // the middle of the space between the card and the sound buttons, as a fraction of half the screen
  const mid = (card.right + innerWidth - 66) / 2
  const ndc = mid / innerWidth * 2 - 1
  return ndc * 8.4 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
}

function updateCamera(dt) {
  let px, py, pz, lx, ly, lz, rate
  const s = game.state
  const atNest = (s === 'nest' && game.nestT >= 0) || ((s === 'results' || s === 'done') && world.nestFor(game.world))
  if (s === 'title' || (!atNest && (s === 'results' || s === 'done'))) {
    // in front of Ember's face; Ember is turned toward us
    const portrait = view.portrait
    px = pos.x + 1.1
    py = pos.y + (portrait ? 1.2 : 0.7)
    pz = pos.z + (portrait ? 8.5 : 5.4)
    lx = pos.x + 0.1
    ly = pos.y + (portrait ? 0.3 : -0.25)
    lz = pos.z
    rate = 2.5
  } else if (atNest) {
    const nestZ = -(game.world + 1) * WORLD_LENGTH
    // on sideways phones the end card stands on the left, so the family moves over to the right
    const side = s === 'results' ? sideShift() : 0
    px = 1.6 - side
    py = NEST_Y + 3.6
    pz = nestZ + (view.portrait ? 11 : side ? 8.4 : 7.2)
    lx = -side
    // while the banner shows, the family sits lower in the picture, under it
    ly = NEST_Y + (s === 'nest' ? (view.portrait ? 3.1 : 2.7) : 1.9)
    lz = nestZ
    rate = 2
  } else {
    px = pos.x * 0.55
    py = pos.y * 0.6 + 2.7
    pz = pos.z + view.back
    lx = pos.x * 0.8
    ly = pos.y * 0.75 + 1.4
    lz = pos.z - 14
    rate = s === 'play' && game.time > 1.5 ? 6 : 2.2
  }
  if (s === 'play' || s === 'nest') {
    // ride along with the flight first, so easing doesn't trail behind at speed
    const dz = pos.z - camRideZ
    camPos.z += dz
    camLook.z += dz
  }
  camRideZ = pos.z
  const k = easeStep(rate, dt)
  camPos.lerp(tmp.set(px, py, pz), k)
  camLook.lerp(tmp2.set(lx, ly, lz), k)
  camera.position.copy(camPos)
  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt)
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.6
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.6
  }
  camera.lookAt(camLook)
  // a little wider when zooming
  const fov = (view.portrait ? 74 : camera.aspect < 1.4 ? 66 : 60) + (game.power > 0 && s === 'play' ? 8 : 0) + (s === 'play' ? clamp((game.speed - 15) * 0.4, 0, 3) : 0)
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = damp(camera.fov, fov, 3, dt)
    camera.updateProjectionMatrix()
  }
}

// --- Go ---------------------------------------------------------------------------------

resize()
renderToggles()
init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game }
