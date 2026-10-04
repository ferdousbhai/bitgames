import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { CONFETTI, Effects } from './effects.js'
import { LANE, Lane, PENGUIN_R, PIN_H, PIN_SPOTS, Pins } from './lane.js'
import { Crowd, Penguin } from './penguin.js'
import { Scenery, THEMES } from './scenery.js'
import { FRAMES, ScoreCard } from './score.js'

const $ = (id) => document.getElementById(id)
const clamp = THREE.MathUtils.clamp
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
const store = {
  get(k) {
    try {
      return localStorage.getItem(`penguin-bowling-${k}`)
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`penguin-bowling-${k}`, String(v))
    } catch {}
  },
}

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600)
const hemi = new THREE.HemisphereLight('#e4f4ff', '#b8d4ff', 1)
scene.add(hemi)
const sun = new THREE.DirectionalLight('#fff4e0', 2.2)
sun.position.set(6, 14, 4)
sun.target.position.set(0, 0, -8)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 14, bottom: -14, near: 1, far: 45 })
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.02
scene.add(sun, sun.target)

const audio = new Audio()
const lane = new Lane(scene)
const pins = new Pins(lane, scene)
const penguin = new Penguin(scene, lane)
const crowd = new Crowd(scene)
const scenery = new Scenery(scene, { hemi, sun, renderer })
const effects = new Effects(scene, camera)
const card = new ScoreCard()
let penguinTemplate = null

// --- Settings -------------------------------------------------------------------------

const MIN_SPEED = 7.5
const MAX_SPEED = 13.5
const MAX_ANGLE = 0.15
const HOOK = 2.6 // sideways pull of a full curve, units/s²
const MAX_X = LANE.half - 0.45

const game = {
  state: 'loading', // loading | title | aim | roll | settle | result | over
  theme: store.get('lane') in THEMES ? store.get('lane') : 'village',
  bumpers: store.get('bumpers') !== '0',
  best: Number(store.get('best')) || 0,
  x: 0,
  angle: 0,
  curve: 0, // -1 left, 0 straight, 1 right
  timer: 0,
  standingBefore: 10,
  outcome: null,
  touchedPins: false,
  thrown: Number(store.get('thrown')) || 0,
  stuck: 0,
  hitSoundAt: 0,
  lastScore: null,
}

// --- Layout -----------------------------------------------------------------------------

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // Narrow screens see more upwards and downwards so the lane still fits across.
  camera.fov = w >= h ? 50 : clamp(50 / Math.pow(camera.aspect, 0.55), 50, 78)
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// --- Physics events: sounds and crowd -----------------------------------------------------

lane.world.addEventListener('preStep', () => penguin.pull())

penguin.onHit = (e) => {
  if (e.body.material !== lane.pinMat) return
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
  if (!game.touchedPins) {
    game.touchedPins = true
    effects.shake = Math.min(0.6, v * 0.05)
  }
  if (v > 1) audio.bonk(v / 10)
  pins.wake()
}
pins.onHit = (pin, e) => {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
  if (v < 0.8) return
  const now = performance.now()
  if (now - game.hitSoundAt < 35) return
  game.hitSoundAt = now
  if (e.body.material === lane.pinMat || e.body.material === lane.iceMat || e.body.material === lane.bumperMat) audio.clack(v / 6)
}
scenery.onSpout = (p) => {
  for (let i = 0; i < 14; i++) effects.sparkleAt(p, '#d6f6ff', 1, 2.5)
  effects.puff(p, 8, 1.6, '#e8f8ff')
}

// --- Aim ----------------------------------------------------------------------------------

/** Where the penguin will go: simple kinematics matching the physics pull. */
function predict(x, angle, speed, hook) {
  const pts = []
  let px = x
  let pz = LANE.start - 0.2
  let vx = Math.sin(angle) * speed
  const vz = -Math.cos(angle) * speed
  const dt = 0.02
  let next = 0.9
  let travelled = 0
  while (pz > LANE.headPin + 0.3 && pts.length < 14) {
    const ramp = clamp((LANE.start - pz) / 7, 0, 1)
    vx += hook * ramp * dt
    px += vx * dt
    pz += vz * dt
    travelled += Math.hypot(vx, vz) * dt
    if (game.bumpers && Math.abs(px) > LANE.half - 0.1 - PENGUIN_R) {
      px = Math.sign(px) * (LANE.half - 0.1 - PENGUIN_R)
      vx = -vx * 0.55
    }
    if (Math.abs(px) > LANE.half) break
    if (travelled >= next) {
      pts.push({ x: px, z: pz })
      next += 1.0
    }
  }
  return pts
}

const drag = { on: false, pts: [], id: null, aim: null }

/** Turn a swipe (screen points) into a throw: direction, power and curve. */
function swipeToThrow(pts) {
  const a = pts[0]
  const b = pts[pts.length - 1]
  let dx = b.x - a.x
  let dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 24) return null
  // Pulling back (downwards) works like a slingshot: flip it.
  const sling = dy > 0
  if (sling) {
    dx = -dx
    dy = -dy
  }
  if (dy > -len * 0.25) return null // mostly sideways: not a throw
  const angle = clamp(Math.atan2(dx, -dy) * 0.4, -MAX_ANGLE, MAX_ANGLE)
  const power = clamp(len / (Math.min(innerWidth, innerHeight) * 0.38), 0.3, 1)
  // Curve: how far the middle of the swipe bulged sideways from the straight line.
  let bulge = 0
  if (!sling && pts.length > 4) {
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    for (const p of pts) {
      const d = (p.x - a.x) * nx + (p.y - a.y) * ny
      if (Math.abs(d) > Math.abs(bulge)) bulge = d
    }
    // Positive bulge = the path swung out to the right
    bulge = clamp((bulge / len) * 4, -1, 1)
    if (Math.abs(bulge) < 0.2) bulge = 0
  }
  return { angle: clamp(angle + bulge * 0.05, -MAX_ANGLE, MAX_ANGLE), power, hook: -bulge * HOOK }
}

function currentAim() {
  if (drag.on && drag.aim) return drag.aim
  return { angle: game.angle, power: 0.8, hook: game.curve * HOOK }
}

function updateAimPreview() {
  if (game.state !== 'aim') return lane.hideAim()
  const a = currentAim()
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * a.power
  lane.showAim(predict(game.x, a.angle, speed, a.hook), drag.on ? '#ff6b9d' : '#ffca3a')
}

function throwPenguin({ angle, power, hook }) {
  if (game.state !== 'aim') return
  audio.unlock()
  game.state = 'roll'
  game.timer = 0
  game.stuck = 0
  game.touchedPins = false
  game.standingBefore = pins.countStanding()
  game.thrown += 1
  store.set('thrown', game.thrown)
  $('hint').classList.add('hidden')
  $('controls').classList.add('away')
  lane.hideAim()
  penguin.launch(angle, MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power, hook)
  audio.whoosh()
  audio.squeak(1.2)
  effects.puff(penguin.group.position, 6, 0.5)
  pins.wake()
}

// --- Rolls and frames -----------------------------------------------------------------

function standingSet() {
  return pins.list.map((p) => !p.removed && !pins.isDown(p))
}

function finishRoll() {
  const standing = pins.countStanding()
  const knocked = game.standingBefore - standing
  const r = card.add(knocked)
  game.outcome = { ...r, knocked }
  game.state = 'result'
  game.timer = 0
  penguin.hide()
  updateHud()
  updateRack(standingSet())

  const deck = new THREE.Vector3(0, 1.2, LANE.headPin - 0.8)
  if (r.strike) {
    banner('STRIKE!', 'strike')
    audio.fanfare()
    audio.cheer(true)
    crowd.start(true)
    game.dance = true
    effects.shower(new THREE.Vector3(0, 3.5, LANE.headPin - 0.8), 2.5, 140)
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        if (game.state !== 'result') return
        const from = new THREE.Vector3((Math.random() - 0.5) * 7, 0.5, LANE.headPin - 3 - Math.random() * 2)
        effects.firework(from, 4 + Math.random() * 2.5, () => audio.bang())
        audio.launch()
      }, 200 + i * 380)
    }
  } else if (r.spare) {
    banner('SPARE!', 'spare')
    audio.fanfare()
    audio.cheer(true)
    crowd.start(true)
    effects.toss(deck, 120)
  } else {
    const words = ['Wheee!', 'Nice!', 'Good!', 'Great!', 'Super!', 'Wow!', 'Amazing!', 'Fantastic!', 'So close!', 'So close!']
    banner(knocked === 0 ? 'Wheee! 🐧' : `${'⭐'.repeat(Math.min(3, Math.ceil(knocked / 3)))} ${words[knocked]}`)
    audio.jingle(knocked)
    audio.cheer(knocked >= 5)
    crowd.start(knocked >= 5)
    if (knocked) effects.toss(deck, 12 + knocked * 5)
    else effects.puff(new THREE.Vector3(0, 0.5, LANE.headPin), 10, 0.8, '#ffffff')
  }
  if (knocked > 0) effects.label(`+${knocked}`, deck.clone().setY(2), CONFETTI[knocked % 6], knocked >= 7)
}

/** After the cheering: tidy the pins and get the penguin ready for the next roll. */
function nextRoll() {
  const r = game.outcome
  game.dance = false
  if (card.over) return gameOver()
  if (r.resetPins) {
    pins.reset()
    audio.drop()
    if (r.frameDone) showIntro(card.frame === FRAMES - 1 ? '🏁' : '🎳', card.frame === FRAMES - 1 ? 'Last frame!' : `Frame ${card.frame + 1}`)
  } else {
    for (const p of pins.clearFallen()) effects.puff(p, 5, 0.6)
    audio.poof()
  }
  updateRack(standingSet())
  toAim()
}

function toAim() {
  game.state = 'aim'
  penguin.ready(game.x)
  effects.puff(penguin.group.position.clone().setY(0.2), 6, 0.5)
  $('controls').classList.remove('away')
  if (game.thrown < 2) $('hint').classList.remove('hidden')
  updateHud()
}

function gameOver() {
  game.state = 'over'
  const total = card.total
  const newBest = total > game.best
  if (newBest) {
    game.best = total
    store.set('best', total)
  }
  game.lastScore = total
  $('final').textContent = total
  const stars = total >= 100 ? 3 : total >= 50 ? 2 : 1
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'dim'}">⭐</span>`).join('')
  $('new-best').classList.toggle('hidden', !newBest)
  show('results')
  audio.fanfare()
  audio.cheer(true)
  crowd.start(true)
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const from = new THREE.Vector3((Math.random() - 0.5) * 8, 0.5, LANE.headPin - 2)
      effects.firework(from, 4 + Math.random() * 3, () => audio.bang())
    }, 300 + i * 450)
  }
}

// --- HUD ------------------------------------------------------------------------------

function buildCard() {
  const el = $('card')
  el.innerHTML = ''
  for (let i = 0; i < FRAMES; i++) {
    const f = document.createElement('div')
    f.className = 'frame' + (i === FRAMES - 1 ? ' wide' : '')
    f.innerHTML = `<div class="rolls">${'<span></span>'.repeat(i === FRAMES - 1 ? 3 : 2)}</div><div class="tot"></div>`
    el.appendChild(f)
  }
}

function updateHud() {
  $('score').textContent = card.total
  const totals = card.totals()
  const frames = $('card').children
  for (let i = 0; i < FRAMES; i++) {
    const f = frames[i]
    const marks = card.marks(i)
    const spans = f.querySelectorAll('.rolls span')
    spans.forEach((s, k) => {
      let m = marks[k] ?? ''
      // A strike in frames 1-9 shows in the right-hand box, like a real score sheet
      if (i < FRAMES - 1 && marks[0] === 'X') m = k === 1 ? 'X' : ''
      s.textContent = m
      s.className = m === 'X' ? 'x' : m === '/' ? 's' : ''
    })
    f.querySelector('.tot').textContent = totals[i] ?? ''
    f.classList.toggle('now', i === card.frame && game.state !== 'over')
  }
}

function buildRack() {
  const el = $('rack')
  el.innerHTML = ''
  // Back row on top, the front pin at the bottom, as seen from the penguin
  for (let row = 3; row >= 0; row--) {
    const r = document.createElement('div')
    for (let i = 0; i < PIN_SPOTS.length; i++) if (PIN_SPOTS[i].row === row) r.appendChild(Object.assign(document.createElement('i'), { id: `rack-${i}` }))
    el.appendChild(r)
  }
}

function updateRack(standing) {
  standing.forEach((up, i) => {
    const d = $(`rack-${i}`)
    d.classList.toggle('down', !up)
    d.style.background = up ? pins.list[i]?.color ?? '' : ''
  })
}

let bannerTimer = 0
function banner(text, kind = '') {
  const el = $('banner')
  el.textContent = text
  el.className = `banner show ${kind}`
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => (el.className = 'banner'), kind === 'strike' ? 2600 : 1600)
}

let introTimer = 0
function showIntro(emoji, title) {
  $('intro-emoji').textContent = emoji
  $('intro-title').textContent = title
  const el = $('intro')
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(introTimer)
  introTimer = setTimeout(() => el.classList.remove('show'), 1800)
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play' && screen !== 'results')
  $('results').classList.toggle('hidden', screen !== 'results')
  $('controls').classList.toggle('hidden', screen !== 'play')
}

function updateCurveBtn() {
  $('curve').textContent = ['↖️', '⬆️', '↗️'][game.curve + 1]
}

// --- Screens ------------------------------------------------------------------------------

function setTheme(name) {
  game.theme = name
  store.set('lane', name)
  for (const b of document.querySelectorAll('.lane-btn')) b.classList.toggle('on', b.dataset.theme === name)
  scenery.setTheme(name)
  pins.build(THEMES[name].pins)
  pins.list.forEach((p) => (p.drop = 0))
  audio.setTune(name)
}

function setBumpers(on) {
  game.bumpers = on
  store.set('bumpers', on ? '1' : '0')
  lane.setBumpers(on)
  $('bumpers').classList.toggle('on', on)
  $('bumpers-state').textContent = on ? 'ON' : 'OFF'
}

function toTitle() {
  game.state = 'title'
  game.dance = false
  $('best').textContent = game.best
  $('last').textContent = game.lastScore !== null ? `Last time: ${game.lastScore}` : ''
  lane.hideAim()
  pins.reset()
  pins.list.forEach((p) => (p.drop = 0))
  game.x = 0
  penguin.ready(0)
  show('title')
}

function start() {
  audio.unlock()
  audio.click()
  card.reset()
  buildCard()
  pins.reset()
  game.x = 0
  game.angle = 0
  game.curve = 0
  updateCurveBtn()
  show('play')
  updateRack(standingSet())
  audio.drop()
  showIntro('🎳', 'Frame 1')
  toAim()
}

for (const b of document.querySelectorAll('.lane-btn')) {
  b.addEventListener('click', () => {
    audio.unlock()
    audio.squeak(1)
    setTheme(b.dataset.theme)
  })
}
$('bumpers').addEventListener('click', () => {
  audio.unlock()
  audio.click()
  setBumpers(!game.bumpers)
})
$('play').addEventListener('click', start)
$('again').addEventListener('click', start)
$('to-home').addEventListener('click', () => {
  audio.click()
  toTitle()
})
$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.click()
  toTitle()
})
const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
  store.set('sound', on ? '1' : '0')
}
if (store.get('sound') === '0') setSound(false)
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  setSound(audio.muted)
  audio.click()
})
const musicBtn = $('music')
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.unlock()
  audio.musicOn = !audio.musicOn
  musicBtn.classList.toggle('off', !audio.musicOn)
  audio.click()
})

// --- Input ----------------------------------------------------------------------------

function move(dir) {
  if (game.state !== 'aim') return
  game.x = clamp(game.x + dir * 0.35, -MAX_X, MAX_X)
  penguin.x = game.x
  penguin.hop = Math.max(penguin.hop, 0.5)
  audio.squeak(0.8 + Math.random() * 0.3)
}

function cycleCurve() {
  game.curve = game.curve === 0 ? 1 : game.curve === 1 ? -1 : 0
  updateCurveBtn()
  audio.click()
}

const go = () => throwPenguin({ angle: game.angle, power: 0.8, hook: game.curve * HOOK })
const holdable = (id, fn) => {
  let iv = 0
  const el = $(id)
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    audio.unlock()
    fn()
    clearInterval(iv)
    iv = setInterval(fn, 180)
  })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => clearInterval(iv))
}
holdable('left', () => move(-1))
holdable('right', () => move(1))
$('curve').addEventListener('click', (e) => {
  e.stopPropagation()
  cycleCurve()
})
$('go').addEventListener('click', (e) => {
  e.stopPropagation()
  go()
})

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.unlock()
  if (game.state !== 'aim') return
  // Tapping the penguin makes it hop and squeak
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  drag.tapPenguin = raycaster.intersectObject(penguin.group, true).length > 0
  drag.on = true
  drag.id = e.pointerId
  drag.pts = [{ x: e.clientX, y: e.clientY }]
  drag.aim = null
  canvas.setPointerCapture?.(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
  if (!drag.on || e.pointerId !== drag.id) return
  drag.pts.push({ x: e.clientX, y: e.clientY })
  if (drag.pts.length > 80) drag.pts.splice(1, 1)
  drag.aim = swipeToThrow(drag.pts)
})
function endDrag(e) {
  if (!drag.on || e.pointerId !== drag.id) return
  drag.on = false
  drag.pts.push({ x: e.clientX, y: e.clientY })
  const t = swipeToThrow(drag.pts)
  drag.aim = null
  if (t) throwPenguin(t)
  else if (drag.tapPenguin && penguin.poke()) audio.squeak(1 + Math.random() * 0.3)
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', (e) => {
  drag.on = false
  drag.aim = null
})
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

const keys = new Set()
addEventListener('keydown', (e) => {
  audio.unlock()
  const k = e.key.toLowerCase()
  if (k === 'escape' && game.state !== 'title' && game.state !== 'loading') return toTitle()
  if ((game.state === 'title' || game.state === 'over') && (k === 'enter' || k === ' ')) {
    e.preventDefault()
    return start()
  }
  if (k === ' ' || k === 'enter' || k === 'arrowup' || k === 'w') {
    e.preventDefault()
    if (!e.repeat) go()
    return
  }
  if (k === 'c' && game.state === 'aim') return cycleCurve()
  if (k === 'a') return move(-1)
  if (k === 'd') return move(1)
  if (['arrowleft', 'arrowright'].includes(k)) {
    e.preventDefault()
    keys.add(k)
  }
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())

function updateKeys(dt) {
  if (game.state !== 'aim') return
  if (keys.has('arrowleft')) game.angle = clamp(game.angle - dt * 0.18, -MAX_ANGLE, MAX_ANGLE)
  if (keys.has('arrowright')) game.angle = clamp(game.angle + dt * 0.18, -MAX_ANGLE, MAX_ANGLE)
}

// --- Camera ------------------------------------------------------------------------------

const camPos = new THREE.Vector3(0, 2.4, 6)
const camLook = new THREE.Vector3(0, 0.4, -8)
const wantPos = new THREE.Vector3()
const wantLook = new THREE.Vector3()

function updateCamera(dt, t) {
  const portrait = camera.aspect < 1
  const back = portrait ? 5.4 : 4.4
  const up = portrait ? 3.0 : 2.5
  switch (game.state) {
    case 'loading':
    case 'title': {
      const a = Math.sin(t * 0.15) * 0.5
      wantPos.set(Math.sin(a) * 5, 2.6, LANE.start + 4 + Math.cos(a) * 1.5)
      wantLook.set(0, 0.5, -8)
      break
    }
    case 'aim':
      wantPos.set(game.x * 0.5, up, LANE.start + back)
      wantLook.set(game.x * 0.2, 0, -6.5)
      break
    case 'roll': {
      const z = Math.max(penguin.body.position.z + back, LANE.headPin + 4.6)
      wantPos.set(penguin.body.position.x * 0.4, up - 0.1, z)
      wantLook.set(penguin.body.position.x * 0.2, 0.2, Math.max(z - 10, LANE.headPin - 1.2))
      break
    }
    case 'settle':
    case 'result':
    case 'over':
      wantPos.set(0, up + 0.5, LANE.headPin + 5.4 + (game.dance ? 0.6 : 0))
      wantLook.set(0, game.dance ? 1.6 : 0.5, LANE.headPin - 1.2)
      break
  }
  const k = game.state === 'roll' ? 6 : 2.5
  camPos.x = damp(camPos.x, wantPos.x, k, dt)
  camPos.y = damp(camPos.y, wantPos.y, k, dt)
  camPos.z = damp(camPos.z, wantPos.z, k, dt)
  camLook.lerp(wantLook, 1 - Math.exp(-k * dt))
  const sh = effects.shake * effects.shake * 0.3
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z)
  camera.lookAt(camLook)
}

// --- Loading ----------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  let done = 0
  const step = () => ($('loading-text').textContent = `Polishing the ice… ${++done}/3`)
  const [pg, pn, wd] = await Promise.allSettled([
    loader.loadAsync('./models/penguin.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/pins.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/world.glb').then((g) => (step(), g)),
  ])
  if (pg.status === 'fulfilled') {
    penguinTemplate = pg.value.scene.getObjectByName('penguin')
    const me = penguinTemplate.clone(true)
    penguin.setModel(me)
  } else console.warn('penguin.glb failed', pg.reason)
  if (pn.status === 'fulfilled') pins.attach(pn.value)
  else console.warn('pins.glb failed', pn.reason)
  if (wd.status === 'fulfilled') scenery.attach(wd.value)
  else console.warn('world.glb failed', wd.reason)
  crowd.build(penguinTemplate, ['#ffca3a', '#4cc9f0', '#8ac926', '#9b5de5', '#ff9f1c', '#2ec4b6', '#ff6b9d', '#1982c4'])
  buildRack()
  buildCard()
  setTheme(game.theme)
  setBumpers(game.bumpers)
  toTitle()
  renderer.compile(scene, camera)
}

// --- Loop -----------------------------------------------------------------------------

const timer = new THREE.Timer()
timer.connect(document)

let simT = 0
function frame(fixedDt) {
  timer.update()
  const dt = fixedDt ?? Math.min(timer.getDelta(), 1 / 20)
  simT += dt
  const t = simT
  game.timer += dt
  updateKeys(dt)

  if (game.state === 'roll' || game.state === 'settle' || game.state === 'aim' || game.state === 'title') lane.world.step(1 / 120, dt, 4)

  if (game.state === 'roll') {
    const b = penguin.body
    const speed = Math.hypot(b.velocity.x, b.velocity.z)
    audio.slide(b.position.y > 0 ? speed : speed * 0.5)
    if (speed > 2 && b.position.y > -0.1 && Math.random() < 0.8) effects.spray(penguin.group.position.clone().setY(0.1), speed)
    game.stuck = speed < 0.4 ? game.stuck + dt : 0
    if (b.position.z < LANE.deckEnd - 0.6 || b.position.y < -0.4 || game.stuck > 0.6 || game.timer > 7) {
      game.state = 'settle'
      game.timer = 0
      audio.slide(0)
      if (b.position.z < LANE.deckEnd) effects.puff(new THREE.Vector3(b.position.x, 0, LANE.deckEnd - 1), 8, 0.9)
    }
  } else if (game.state === 'settle') {
    if (penguin.state === 'slide' && penguin.body.position.y < -0.3) penguin.hide()
    if ((game.timer > 1.1 && !pins.moving()) || game.timer > 3.4) finishRoll()
  } else if (game.state === 'result') {
    const wait = game.dance ? 3.4 : 2.0
    if (game.timer > wait) nextRoll()
  }

  if (game.state === 'result' && game.dance && game.timer > 0.7) {
    if (game.timer < 0.75) {
      for (const p of pins.list) effects.puff(new THREE.Vector3(p.spot.x, 0.3, p.spot.z), 2, 0.5)
      audio.drop()
    }
    pins.dance(game.timer)
  } else pins.sync(dt)

  penguin.update(dt, t)
  crowd.update(dt, t)
  scenery.update(dt, t)
  effects.update(dt)
  updateAimPreview()
  updateCamera(dt, t)
  audio.updateMusic(game.state !== 'loading')
  renderer.render(scene, camera)
}
renderer.setAnimationLoop(() => frame())

show('loading')
load()
if (new URLSearchParams(location.search).has('debug')) window.__pb = { frame, scene, camera, effects, game, lane, pins, penguin, card, throwPenguin, renderer }
