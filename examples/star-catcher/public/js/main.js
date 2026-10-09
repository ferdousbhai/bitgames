import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Particles, Popups, Rings, makeGlowTexture } from './effects.js'
import { STOPS, World } from './world.js'

const $ = (id) => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const { clamp, damp } = THREE.MathUtils
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

// --- Saved bits (private windows may refuse storage, so everything is guarded) ------

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

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.05
const scene = new THREE.Scene()
scene.fog = new THREE.Fog('#2a1f66', 26, 85)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(0, 0, 16)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45
scene.add(new THREE.HemisphereLight('#d9d2ff', '#3a2a7a', 1.4))
const key = new THREE.DirectionalLight('#fff3e0', 2.4)
key.position.set(4, 6, 10)
scene.add(key)
const rim = new THREE.DirectionalLight('#8fd3ff', 1.6)
rim.position.set(-6, 4, -6)
scene.add(rim)

const audio = new Audio()
audio.muted = store.get('star-catcher-muted', false)
const particles = new Particles(scene)
const rings = new Rings(scene)
const popups = new Popups($('popups'), camera)
const glowTex = makeGlowTexture(false)

// --- Game state ----------------------------------------------------------------------

// `k` is the visible height compared with a roomy screen: falling speeds scale with it, so a
// zoomed-in sideways phone gives little hands just as long to reach each star
const FULL_H = Math.tan((50 * Math.PI) / 360) * 16
// hudY: the lowest edge of the top HUD in world units; falling things appear below it, never through it
const view = { w: 10, h: 7.5, k: 1, xMin: -9, xMax: 9, yMin: -6, yMax: 1, hudY: 5 }
const game = {
  state: 'loading', // loading | title | play
  score: 0,
  stops: 0, // planets reached
  legPoints: 0,
  spawnTimer: 1,
  magnet: 0,
  double: 0,
  dizzy: 0,
  roll: 0,
  joy: 0,
  cruise: 4,
  time: 0,
  idle: 0, // seconds since the player last steered (see the nudge in frame)
}
// The star-counting mission draws its progress as a five-star constellation,
// joining each caught star to the one before it.
const CONSTELLATION = [[10, 28], [42, 8], [74, 24], [106, 7], [140, 28]]
function drawConstellation(el, count) {
  const ns = 'http://www.w3.org/2000/svg'
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(ns, tag)
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    return node
  }
  const svg = svgEl('svg', { viewBox: '0 0 150 38', width: 150, height: 38, 'aria-label': `Constellation with ${count} of five stars` })
  CONSTELLATION.forEach(([x, y], i) => {
    if (i && i < count) {
      const [px, py] = CONSTELLATION[i - 1]
      svg.append(svgEl('line', { x1: px, y1: py, x2: x, y2: y, stroke: '#c49d45', 'stroke-width': 2 }))
    }
    const star = svgEl('text', { x, y: y + 5, 'text-anchor': 'middle', fill: i < count ? '#946418' : '#bdb9a8' })
    star.textContent = i < count ? '★' : '☆'
    svg.append(star)
  })
  el.append(svg)
}

function drawGemProgress(el, count) {
  const gems = document.createElement('span')
  gems.className = 'gem-steps'
  for (let i = 0; i < 3; i++) {
    const gem = document.createElement('span')
    gem.textContent = '💎'
    gem.className = i < count ? 'done' : i === count ? 'next' : ''
    gems.append(gem)
  }
  el.append(gems)
}

function renderMissionProgress(el, option, count) {
  if (!option.goal) return
  el.replaceChildren()
  const caption = document.createElement('span')
  caption.textContent = option.constellation ? `⭐ Catch stars · ${count} / 5` : `💎 Catch gems · ${count} / 3`
  el.append(caption)
  if (option.constellation) drawConstellation(el, count)
  else drawGemProgress(el, count)
}

function speakMission(text) {
  if (audio.muted || !('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const words = new SpeechSynthesisUtterance(text)
  words.lang = 'en-US'
  words.rate = 0.82
  speechSynthesis.speak(words)
}

let missionTimers = []
function clearMissionTimers() {
  missionTimers.forEach(clearTimeout)
  missionTimers = []
  $('adventure-goal')?.classList.remove('resolved')
}
const adventure = createAdventure({
  id: 'star-catcher',
  anchor: $('go'),
  hud: $('hud'),
  isMuted: () => audio.muted,
  celebrate: (text) => {
    banner('⭐ Mission complete!', text)
    // The finished card stays a moment so the child sees it full, then gently clears away
    clearMissionTimers()
    missionTimers.push(setTimeout(() => $('adventure-goal')?.classList.add('resolved'), 3500))
    missionTimers.push(setTimeout(() => ($('adventure-goal').hidden = true), 4300))
  },
  renderProgress: renderMissionProgress,
  options: [
    { emoji: '🚀', label: 'Free space flight' },
    { emoji: '🐢', label: 'Gentle star counting', pace: 0.6, goal: 'Catch 5 stars', target: 5, constellation: true, accept: (it) => ['star', 'pink', 'rainbow'].includes(it.kind), reward: 'Five stars for a new constellation!' },
    { emoji: '💎', label: 'Three-gem mission', pace: 0.65, goal: 'Catch 3 gems', target: 3, accept: (it) => it.kind === 'gem', reward: 'Three gems on your space journey!' },
  ],
})

function renderMissionChoice() {
  const option = adventure.option
  const button = $('adventure-choice')
  button.replaceChildren()
  const pictures = document.createElement('span')
  pictures.className = 'mission-choice-pictures'
  pictures.textContent = option.constellation ? '⭐ ⭐ ⭐ ⭐ ⭐' : option.goal ? '💎 💎 💎' : '🚀'
  const caption = document.createElement('span')
  caption.textContent = option.constellation ? 'Count 5 stars' : option.goal ? 'Catch 3 gems' : 'Free flight'
  const next = document.createElement('span')
  next.className = 'mission-choice-next'
  next.textContent = '↻'
  next.setAttribute('aria-hidden', 'true')
  button.append(pictures, caption, next)
}
renderMissionChoice()
$('adventure-choice').addEventListener('click', renderMissionChoice)

const items = []
const pools = {}
const templates = {}
const haloMats = {} // one glow material per kind, shared by every clone of it
let models = {}
let world = null
let rocket = null

/** How the trip feels on the way to stop `i`: a gentle ramp for little hands. */
function leg(i) {
  const d = Math.min(i, 6)
  return {
    need: 12 + 5 * Math.min(i, 5),
    // A constant gentle pace: later planets add variety, never speed
    speed: 2.3,
    interval: 1.0,
    gem: i >= 1 || adventure.option.label === 'Three-gem mission' ? 0.14 : 0,
    pink: i >= 2 ? 0.14 : 0,
    rainbow: i >= 3 ? 0.05 : 0,
    power: i >= 2 ? 0.05 : 0,
    rock: i >= 3 ? 0.06 : 0,
    wave: i >= 1 ? 0.1 : 0.04,
    ufo: i >= 1,
  }
}

const KINDS = {
  star: { model: 'star', points: 1, scale: 0.55, r: 0.55, glow: '#ffd23f', colors: ['#fff3a0', '#ffd23f', '#ffffff'] },
  pink: { model: 'star', points: 2, scale: 0.6, r: 0.6, glow: '#ff6bb5', colors: ['#ff8fc7', '#ffd1e8', '#ffffff'] },
  rainbow: { model: 'star', points: 5, scale: 0.7, r: 0.7, glow: '#ffffff', colors: ['#ff6b6b', '#ffd23f', '#8ef0c8', '#7cc6fe', '#c9b6ff'] },
  gem: { model: 'gem', points: 3, scale: 0.65, r: 0.55, glow: '#4cc9f0', colors: ['#7cc6fe', '#bdeaff', '#ffffff'] },
  magnet: { model: 'magnet', points: 0, scale: 0.62, r: 0.6, glow: '#ff5c7a', colors: ['#ff5c7a', '#ffffff', '#ffd23f'] },
  heart: { model: 'heart', points: 0, scale: 0.62, r: 0.6, glow: '#ff5c8a', colors: ['#ff8fab', '#ffd1e8', '#ffffff'] },
  rock: { model: 'rock', points: 0, scale: 0.8, r: 0.6, glow: null, colors: ['#c9b6ff', '#ffffff'] },
}


// --- Assets -------------------------------------------------------------------------

async function load() {
  const gltf = await new GLTFLoader().loadAsync('./models/space.glb')
  for (const child of [...gltf.scene.children]) models[child.name] = child

  // Star variants share the star mesh but swap its paint
  const body = models.star.getObjectByName('star_body')
  const pinkMat = body.material.clone()
  pinkMat.color.set('#ff7eb9')
  pinkMat.emissive.set('#ff2e88')
  pinkMat.emissiveIntensity = 0.35
  // A steady pearly lilac: special without cycling colours
  const rainbowMat = body.material.clone()
  rainbowMat.color.set('#c9b6ff')
  rainbowMat.emissive.set('#8f6bff')
  rainbowMat.emissiveIntensity = 0.35

  for (const [kind, k] of Object.entries(KINDS)) {
    const g = new THREE.Group()
    const m = models[k.model].clone()
    if (kind === 'pink' || kind === 'rainbow') {
      m.getObjectByName('star_body').material = kind === 'pink' ? pinkMat : rainbowMat
    }
    m.name = 'model'
    g.add(m)
    if (k.glow) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k.glow, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(3.4)
      halo.position.z = -0.6
      halo.name = 'halo'
      g.add(halo)
      haloMats[kind] = halo.material
    }
    g.scale.setScalar(k.scale)
    templates[kind] = g
    pools[kind] = []
  }

  world = new World(scene, models)
  buildRocket()
  buildUfo()
}

// --- Rocket ---------------------------------------------------------------------------

function buildRocket() {
  const root = new THREE.Group()
  const model = models.rocket
  model.scale.setScalar(0.62)
  root.add(model)
  const flame = model.getObjectByName('rocket_flame')
  const pilot = model.getObjectByName('rocket_pilot')
  const nozzle = model.getObjectByName('rocket_nozzle')
  // Warm glow behind the flame
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff9f43', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.position.set(0, -1.35, -0.2)
  glow.scale.setScalar(2.6)
  model.add(glow)
  // Magnet badge riding on the nose while the magnet works
  const badge = models.magnet.clone()
  badge.scale.setScalar(0.45)
  badge.position.set(0, 2.2, 0)
  badge.visible = false
  model.add(badge)
  // Pink bubble while stars count double
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ff8fc7') }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.5);
          gl_FragColor = vec4(uColor * (0.015 + f * 0.9) * uOpacity, 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  )
  bubble.position.y = 0.1
  bubble.renderOrder = 6
  root.add(bubble)
  scene.add(root)
  rocket = { root, model, flame, pilot, pilotZ: pilot.position.z, nozzle, glow, badge, bubble, vel: new THREE.Vector2(), target: new THREE.Vector2(0, -3), nozzleWorld: new THREE.Vector3() }
  root.position.set(0, -view.h * 0.62, 0)
}

const ufo = { obj: null, lights: null, lightMats: [], active: false, timerLeft: 12, dir: 1, dropTimer: 0, t: 0 }
function buildUfo() {
  ufo.obj = models.ufo.clone()
  ufo.obj.scale.setScalar(0.9)
  ufo.obj.visible = false
  ufo.lights = ufo.obj.getObjectByName('ufo_lights')
  // Own material so blinking doesn't touch anything else
  ufo.lights.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone()
      ufo.lightMats.push(o.material)
    }
  })
  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#8ef0c8', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
  beam.scale.set(2.2, 3, 1)
  beam.position.y = -1.2
  ufo.obj.add(beam)
  scene.add(ufo.obj)
}

// --- Items --------------------------------------------------------------------------

function spawn(kind, x, y, vy, extra = {}) {
  const k = KINDS[kind]
  const obj = pools[kind].pop() ?? templates[kind].clone()
  obj.position.set(x, y, 0)
  obj.rotation.set(0, 0, 0)
  obj.scale.setScalar(k.scale)
  obj.visible = true
  scene.add(obj)
  items.push({ obj, kind, k, x, vy, t: Math.random() * 10, sway: kind === 'rock' ? 0 : rand(0.15, 0.45), pulled: false, bounced: false, vx: 0, spin: 0, ...extra })
}

function recycle(i) {
  const it = items[i]
  scene.remove(it.obj)
  pools[it.kind].push(it.obj)
  items.splice(i, 1)
}

function spawnSomething() {
  const L = leg(game.stops)
  const x = rand(view.xMin + 0.5, view.xMax - 0.5)
  const y = view.h + 1.5
  const vy = -L.speed * view.k * rand(0.85, 1.15)
  const r = Math.random()
  let acc = 0
  if (r < (acc += L.wave)) return spawnWave(L)
  if (r < (acc += L.rock)) return spawn('rock', x, y, vy * 0.75)
  if (r < (acc += L.power)) {
    const kind = game.magnet > 0 ? 'heart' : game.double > 0 ? 'magnet' : Math.random() < 0.5 ? 'magnet' : 'heart'
    return spawn(kind, x, y, vy * 0.8)
  }
  if (r < (acc += L.rainbow)) return spawn('rainbow', x, y, vy * 0.9)
  if (r < (acc += L.gem)) return spawn('gem', x, y, vy)
  if (r < (acc += L.pink)) return spawn('pink', x, y, vy)
  spawn('star', x, y, vy)
}

/** A wiggly line of stars: lovely to swoop through. */
function spawnWave(L) {
  const n = 5
  const amp = Math.min(1.6, (view.xMax - view.xMin) * 0.2)
  const x0 = rand(view.xMin + amp + 0.5, view.xMax - amp - 0.5)
  const vy = -L.speed * view.k
  const phase = Math.random() * 6
  for (let i = 0; i < n; i++) spawn('star', x0 + Math.sin(phase + i * 0.9) * amp, view.h + 1.5 + i * 1.15, vy, { sway: 0 })
}

// --- Catching ---------------------------------------------------------------------------

const tmp = new THREE.Vector3()
const rocketCenter = new THREE.Vector3()

function catchItem(it) {
  const pos = it.obj.position.clone()
  if (it.kind === 'magnet' || it.kind === 'heart') {
    if (it.kind === 'magnet') game.magnet = 9
    else game.double = 9
    audio.powerUp()
    particles.burst(pos, it.k.colors, 10, 3, 0.8)
    renderPowers()
    // The cheer pops out beside its timer bar, not over Kitty: it shows what the bar means
    const pill = $('powers').children[it.kind === 'magnet' ? 0 : game.magnet > 0 ? 1 : 0]
    if (pill) {
      const r = pill.getBoundingClientRect()
      popups.showAt(r.right + 8, r.top + r.height / 2, it.kind === 'magnet' ? '🧲 Magnet!' : '💖 Double stars!')
    }
    game.joy = 0.6
    return
  }
  adventure.event(it)
  const points = it.k.points * (game.double > 0 ? 2 : 1)
  game.score += points
  game.legPoints += points
  // The note follows where the star was caught (left is low, right is high), so it never climbs into a frenzy
  const across = clamp((pos.x - view.xMin) / Math.max(view.xMax - view.xMin, 1), 0, 1)
  audio.catch(Math.round(across * 5), it.kind === 'gem' ? 'gem' : it.kind === 'rainbow' ? 'rainbow' : 'star')
  particles.burst(pos, it.k.colors, it.kind === 'star' ? 6 : 10, 2.5, 0.6)
  game.joy = 0.35
  updateScore()
  if (game.legPoints >= leg(game.stops).need) arrive()
  else renderJourney()
}

function bumpRock(it) {
  it.bounced = true
  const dir = Math.sign(it.obj.position.x - rocket.root.position.x) || 1
  it.vx = dir * 4
  it.vy = 2.5
  it.spin = dir * -4
  game.dizzy = 1.2
  rocket.vel.x -= dir * 6
  audio.boing()
  popups.show(it.obj.position, '💫')
  for (let k = 0; k < 6; k++) {
    const a = (k / 10) * Math.PI * 2
    particles.emit(rocketCenter.x + Math.cos(a) * 0.9, rocketCenter.y + 1.2, 0.5, { vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, spread: 0.3, life: 1, size: 0.5, color: '#fff3a0', drag: 1 })
  }
}

function arrive() {
  const stop = STOPS[game.stops % STOPS.length]
  game.stops++
  game.legPoints = 0
  game.roll = reducedMotion ? 0 : 1
  const lap = Math.floor(game.stops / STOPS.length)
  const next = STOPS[game.stops % STOPS.length]
  const done = game.stops % STOPS.length === 0
  banner(done ? `🎉 You visited every planet!` : `${stop.emoji} Hello, ${stop.name}!`, done ? `Let's fly again! Trip ${lap + 1}` : `Next stop: ${next.emoji} ${next.name}`)
  audio.fanfare()
  world.setStop(game.stops)
  // One soft moment: a few slow, pale sparkles drift up around Kitty
  const p = rocket.root.position
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    particles.emit(p.x + Math.cos(a) * 1.2, p.y + 0.4 + Math.sin(a) * 1.2, 0.3, { vx: Math.cos(a) * 0.4, vy: 0.6 + Math.sin(a) * 0.3, spread: 0.2, life: 2.2, size: 0.45, endSize: 0, color: '#fff3c4', drag: 0.6 })
  }
  renderJourney()
}

// --- HUD ----------------------------------------------------------------------------

let bannerTimer = 0
function banner(text, small) {
  const el = $('banner')
  el.innerHTML = ''
  el.append(text)
  if (small) {
    const s = document.createElement('small')
    s.textContent = small
    el.append(s)
  }
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), 2600)
}

function updateScore() {
  const el = $('score')
  el.textContent = `⭐ ${game.score}`
}

function renderJourney() {
  const lap = Math.floor(game.stops / STOPS.length)
  const at = game.stops % STOPS.length
  const progress = Math.min(game.legPoints / leg(game.stops).need, 1)
  const parts = [`<span class="stop done">${lap ? `🔁${lap + 1}` : '🏠'}</span>`]
  STOPS.forEach((s, i) => {
    const fill = i < at ? 1 : i === at ? progress : 0
    // The ship stays inside its track so it never sits on top of the stop before it
    const ship = i === at ? `<span class="ship" style="left:${fill * 100}%;transform:translateX(-${fill * 100}%)">🚀</span>` : ''
    parts.push(`<span class="track"><b style="width:${fill * 100}%"></b>${ship}</span>`)
    parts.push(`<span class="stop ${i < at ? 'done' : i === at ? 'next' : ''}">${s.emoji}</span>`)
  })
  $('journey').innerHTML = parts.join('')
}

// Runs every frame while a power is active, so it only touches the DOM when something shows a change
let powersKey = ''
let powerBars = [] // { el, shown } for each timer bar on screen
function renderPowers() {
  const list = []
  if (game.magnet > 0) list.push(['🧲', game.magnet])
  if (game.double > 0) list.push(['💖', game.double])
  const keyNow = list.map((p) => p[0]).join('')
  if (keyNow !== powersKey) {
    powersKey = keyNow
    const el = $('powers')
    el.innerHTML = list.map(([e]) => `<div class="power">${e}<i><b></b></i></div>`).join('')
    powerBars = [...el.querySelectorAll('.power b')].map((b) => ({ el: b, shown: -1 }))
  }
  list.forEach(([, left], i) => {
    const bar = powerBars[i]
    const fill = Math.round((left / 9) * 100) / 100
    if (fill === bar.shown) return
    bar.shown = fill
    bar.el.style.transform = `scaleX(${fill})`
  })
}

function renderSound() {
  $('sound').textContent = audio.muted ? '🔇' : '🔊'
}

function toggleSound() {
  audio.unlock()
  audio.setMuted(!audio.muted)
  store.set('star-catcher-muted', audio.muted)
  renderSound()
}

// --- Input --------------------------------------------------------------------------

const keys = new Set()
const raycaster = new THREE.Raycaster()
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const ndc = new THREE.Vector2()
let pointerDown = false

function aim(e) {
  if (!rocket) return
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (!raycaster.ray.intersectPlane(plane, tmp)) return
  game.idle = 0
  // Fingers cover what they touch, so the rocket flies a little above the finger
  const lift = e.pointerType === 'mouse' ? 0 : 1.4
  rocket.target.set(tmp.x, tmp.y + lift)
}

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true
  audio.unlock()
  if (game.state !== 'play') return
  poke(e)
  aim(e)
})

/** Tapping Kitty gets a happy meow; tapping the planet ahead makes it giggle and wobble. */
function poke(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (!raycaster.ray.intersectPlane(plane, tmp)) return
  const p = rocket.root.position
  if (Math.hypot(tmp.x - p.x, tmp.y - p.y - 0.3) < 1.3) {
    if (game.joy < 0.2) audio.meow()
    game.joy = 0.6
    return
  }
  const planet = world.current()
  if (planet && raycaster.intersectObject(planet, true).length) {
    if (world.boop(planet)) audio.boop()
  }
}
addEventListener('pointermove', (e) => {
  if (game.state === 'play' && (pointerDown || e.pointerType === 'mouse')) aim(e)
})
addEventListener('pointerup', () => (pointerDown = false))
addEventListener('pointercancel', () => (pointerDown = false))
addEventListener('keydown', (e) => {
  audio.unlock()
  if (e.key === 'm' || e.key === 'M') return toggleSound()
  if (e.key === 'Escape') return goHome()
  if (game.state === 'title' && (e.key === 'Enter' || e.key === ' ')) return start()
  keys.add(e.key)
  game.idle = 0
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
})
addEventListener('keyup', (e) => keys.delete(e.key))
addEventListener('blur', () => keys.clear())
// No pinch-zoom, double-tap zoom or long-press menus
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('gesturestart', (e) => e.preventDefault())
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend()
  else if (audio.ctx) audio.unlock()
})
$('sound').addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  toggleSound()
})

function start() {
  if (game.state !== 'title') return
  clearMissionTimers()
  adventure.begin()
  audio.unlock()
  audio.click()
  game.state = 'play'
  $('start').classList.add('fade')
  setTimeout(() => $('start').classList.add('hidden'), 400)
  $('hud').classList.remove('hidden')
  rocket.target.set(0, view.yMin + 1.2)
  game.spawnTimer = 0.8
  game.idle = 0
  banner(`🚀 Blast off!`, `Fly to ${STOPS[0].emoji} ${STOPS[0].name}`)
  if (adventure.option.goal) speakMission(adventure.option.goal)
  renderJourney()
  updateScore()
  resize() // the HUD is on screen now, so the band that things fade in below can be measured
}
$('go').addEventListener('click', start)

/** Back to the title, where the child can choose another mission or just fly again. */
function goHome() {
  if (game.state !== 'play') return
  audio.click()
  clearMissionTimers()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  game.state = 'title'
  for (let i = items.length - 1; i >= 0; i--) recycle(i)
  Object.assign(game, { score: 0, stops: 0, legPoints: 0, magnet: 0, double: 0, dizzy: 0, roll: 0, idle: 0 })
  nudgeShown = false
  nudgeUsed = false
  nudgeEl.classList.remove('show')
  ufo.active = false
  ufo.obj.visible = false
  ufo.timerLeft = 12
  renderPowers()
  world.setStop(0)
  keys.clear()
  pointerDown = false
  $('banner').classList.remove('show')
  $('hud').classList.add('hidden')
  renderMissionChoice()
  const screen = $('start')
  screen.classList.remove('hidden')
  requestAnimationFrame(() => screen.classList.remove('fade'))
}
$('home').addEventListener('click', goHome)

// --- Layout -------------------------------------------------------------------------

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // Short screens (sideways phones) zoom in so Kitty and the stars stay big enough to see and catch
  view.h = clamp(h / 70, 5.2, FULL_H)
  // Wide screens (desktops, sideways tablets) have width to spare: zoom in a little for chunkier stars and Kitty
  if (w / h > 1.25) view.h = Math.min(view.h, FULL_H * 0.84)
  view.k = view.h / FULL_H
  camera.fov = (Math.atan(view.h / camera.position.z) * 360) / Math.PI
  camera.updateProjectionMatrix()
  view.w = view.h * camera.aspect
  // Keep the rocket clear of notches and rounded corners
  const cs = getComputedStyle($('safe'))
  const px = (2 * view.w) / w
  const inset = (name) => parseFloat(cs[name]) * px || 0
  view.xMin = -view.w + inset('paddingLeft') + 0.8
  view.xMax = view.w - inset('paddingRight') - 0.8
  view.yMin = -view.h + inset('paddingBottom') + 1.5
  view.yMax = Math.min(view.h * 0.2, view.h - 3)
  // Falling things fade in below the score, journey and mission card, not through them
  const hudBottom = Math.max(...['journey', 'score', 'adventure-goal'].map((id) => {
    const el = $(id)
    const r = el && !el.hidden ? el.getBoundingClientRect() : null
    return r && r.top < h / 2 ? r.bottom : 0 // a card moved to the bottom on short screens does not count
  })) + 12
  view.hudY = view.h - Math.min(hudBottom, h * 0.3) * px
  const hpx = h * renderer.getPixelRatio()
  particles.setScale(hpx, camera.fov)
  world?.setScale(hpx, camera.fov)
}
addEventListener('resize', resize)

// --- Main loop ----------------------------------------------------------------------

const EXHAUST_COLORS = ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0'].map((c) => new THREE.Color(c))
const exhaust = { vx: 0, vy: 0, spread: 0.6, life: 0.45, size: 0, endSize: 0.1, color: EXHAUST_COLORS[0], drag: 1.5 }
const sparkle = { vy: 0.6, spread: 0.5, life: 0.7, size: 0.4, endSize: 0, color: '#ffffff', drag: 1 }
const trail = { vy: -2, spread: 0.4, life: 0.6, size: 0.35, color: new THREE.Color('#ffffff'), drag: 1 }

function updateRocket(dt) {
  const r = rocket
  const playing = game.state === 'play'
  if (playing) {
    const dx = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0)
    const dy = (keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0)
    r.target.x += dx * 11 * dt
    r.target.y += dy * 9 * dt
  } else {
    // On wide screens Kitty waits beside the title instead of hiding behind the Fly button
    const side = camera.aspect > 1.3 ? view.w * 0.68 : 0
    r.target.set(side + Math.sin(game.time * 0.7) * Math.min(side ? 0.8 : 2, view.w * 0.3), -view.h * 0.62 + Math.sin(game.time * 1.3) * 0.3)
  }
  r.target.x = clamp(r.target.x, view.xMin, view.xMax)
  r.target.y = clamp(r.target.y, playing ? view.yMin : -view.h, playing ? view.yMax : 3)
  // Springy follow: responsive but smooth; wobbly when dizzy
  const stiff = game.dizzy > 0 ? 18 : 60
  const damping = game.dizzy > 0 ? 6 : 13
  const p = r.root.position
  r.vel.x += ((r.target.x - p.x) * stiff - r.vel.x * damping) * dt
  r.vel.y += ((r.target.y - p.y) * stiff - r.vel.y * damping) * dt
  p.x += r.vel.x * dt
  p.y += r.vel.y * dt
  p.x = clamp(p.x, view.xMin - 0.5, view.xMax + 0.5)

  // Lean into turns and bank to show off the fins
  const lean = clamp(-r.vel.x * 0.045, -0.5, 0.5)
  r.root.rotation.z = damp(r.root.rotation.z, lean, 8, dt)
  let spin = clamp(-r.vel.x * 0.06, -0.8, 0.8)
  // Dizzy is a slow wobble, not a fast spin
  if (game.dizzy > 0 && !reducedMotion) spin += Math.sin((1 - game.dizzy / 1.2) * Math.PI * 2) * 0.6
  if (game.roll > 0) {
    game.roll = Math.max(0, game.roll - dt * 0.9)
    spin += (1 - game.roll) ** 2 * Math.PI * 2
  }
  r.model.rotation.y = spin
  r.model.position.y = Math.sin(game.time * 3.2) * 0.07

  // Flame flickers and grows when climbing
  const climb = clamp(r.vel.y * 0.08, -0.3, 0.6)
  // A soft, slow breathing flame: no fast flicker
  const f = 1 + climb + Math.sin(game.time * 4) * 0.04
  r.flame.scale.set(1 + Math.sin(game.time * 3) * 0.02, f, 1 + Math.sin(game.time * 3) * 0.02)
  r.glow.material.opacity = 0.6 + 0.05 * Math.sin(game.time * 2.5) + climb * 0.2
  r.glow.scale.setScalar(2.4 + climb * 1.2)

  // Kitty pilot: a happy bounce when catching things
  game.joy = Math.max(0, game.joy - dt)
  r.pilot.rotation.z = Math.sin(game.time * 2) * 0.12 + Math.sin(game.joy * 12) * game.joy * 0.3
  r.pilot.position.z = r.pilotZ + game.joy * 0.15

  // Exhaust trail (every frame, so it reuses one options object and pre-parsed colours)
  r.nozzle.getWorldPosition(r.nozzleWorld)
  const n = r.nozzleWorld
  const puffs = 2 + (climb > 0 ? 1 : 0)
  for (let i = 0; i < puffs; i++) {
    const x = n.x + rand(-0.12, 0.12)
    exhaust.vx = rand(-0.5, 0.5) - r.vel.x * 0.15
    exhaust.vy = -game.cruise * 0.9 - 2
    exhaust.size = rand(0.45, 0.7)
    exhaust.color = EXHAUST_COLORS[(Math.random() * EXHAUST_COLORS.length) | 0]
    particles.emit(x, n.y - 0.35, n.z - 0.1, exhaust)
  }
  if (Math.abs(r.vel.x) > 4 && Math.random() < 0.5) {
    particles.emit(p.x + rand(-0.4, 0.4), p.y + rand(-0.5, 0.5), 0.2, trail)
  }

  // Power-up visuals
  r.badge.visible = game.magnet > 0
  if (r.badge.visible) {
    r.badge.position.y = 2.25 + Math.sin(game.time * 2) * 0.08
    r.badge.rotation.z = Math.sin(game.time * 1.5) * 0.15
  }
  const bubbleTarget = game.double > 0 ? 0.55 + 0.05 * Math.sin(game.time * 2) : 0
  const u = r.bubble.material.uniforms.uOpacity
  u.value = damp(u.value, bubbleTarget, 6, dt)
  r.bubble.visible = u.value > 0.01
  r.bubble.scale.setScalar(1 + Math.sin(game.time * 1.5) * 0.02)

  rocketCenter.set(p.x, p.y + 0.3, 0)
}

function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const o = it.obj
    it.t += dt
    if (it.bounced) {
      it.vy -= 3 * dt
      it.x += it.vx * dt
      o.position.y += it.vy * dt
      o.rotation.z += it.spin * dt
    } else {
      o.position.y += it.vy * dt * (game.state === 'play' ? adventure.pace : 1)
      // The magnet pulls every goodie (not rocks) toward the rocket
      if (game.magnet > 0 && it.kind !== 'rock' && game.state === 'play') {
        tmp.subVectors(rocketCenter, o.position)
        const d = tmp.length()
        if (d < 7.5) {
          it.pulled = true
          const pull = Math.min(d, (14 / Math.max(d, 1)) * dt + 6 * dt)
          tmp.multiplyScalar(pull / Math.max(d, 0.001))
          it.x += tmp.x
          o.position.y += tmp.y
        }
      }
    }
    o.position.x = it.x + (it.pulled ? 0 : Math.sin(it.t * 1.7) * it.sway)

    // Each kind moves in its own cheerful way
    const model = o.children[0]
    if (it.kind === 'gem') model.rotation.y += dt * 2.2
    else if (it.kind === 'rock') {
      if (!it.bounced) o.rotation.z = Math.sin(it.t * 0.9) * 0.25
    } else if (it.kind === 'magnet' || it.kind === 'heart') {
      model.rotation.y = Math.sin(it.t * 2) * 0.4
    } else {
      model.rotation.y = Math.sin(it.t * 2.2) * 0.55
      model.rotation.z = Math.sin(it.t * 1.4) * 0.2
      // Special stars leave a faint, occasional sparkle so they stand out from plain ones
      if (it.kind !== 'star' && !it.bounced) {
        if (Math.random() < dt * 2.5) {
          sparkle.color = it.k.colors[(Math.random() * it.k.colors.length) | 0]
          sparkle.size = rand(0.4, 0.7)
          particles.emit(o.position.x + rand(-0.35, 0.35), o.position.y + rand(0, 0.4), 0.1, sparkle)
        }
      }
    }

    // Things grow in just below the HUD band instead of sliding through the score and mission card
    const grow = it.bounced ? 1 : clamp((view.hudY - o.position.y) / 0.8 + 0.001, 0, 1)
    o.visible = grow > 0
    if (!it.bounced) o.scale.setScalar(it.k.scale * grow)

    // Catch!
    if (game.state === 'play' && !it.bounced && grow >= 1) {
      const d = Math.hypot(o.position.x - rocketCenter.x, o.position.y - rocketCenter.y)
      if (d < 0.95 + it.k.r * 0.9) {
        if (it.kind === 'rock') {
          if (game.dizzy <= 0) bumpRock(it)
        } else {
          catchItem(it)
          recycle(i)
          continue
        }
      }
    }
    if (o.position.y < -view.h - 2.5 || Math.abs(o.position.x) > view.w + 4) recycle(i)
  }
}

function updateUfo(dt) {
  if (!ufo.obj) return
  // Slow, soft glow in turn: never a blink
  ufo.lightMats.forEach((m, i) => (m.emissiveIntensity = 0.8 + 0.3 * Math.sin(game.time * 1.2 + i * 2)))
  if (!ufo.active) {
    if (game.state !== 'play' || !leg(game.stops).ufo) return
    ufo.timerLeft -= dt
    if (ufo.timerLeft > 0) return
    ufo.active = true
    ufo.dir = Math.random() < 0.5 ? 1 : -1
    ufo.t = 0
    ufo.dropTimer = 0.8
    ufo.obj.visible = true
    ufo.obj.position.set(-ufo.dir * (view.w + 3), view.hudY - 1.4, -1)
    audio.whoosh(1.4)
    return
  }
  ufo.t += dt
  const o = ufo.obj
  const speed = Math.max(2.4, (view.w * 2 + 6) / 8)
  o.position.x += ufo.dir * speed * dt
  o.position.y = view.hudY - 1.4 + Math.sin(ufo.t * 1.2) * 0.2
  o.rotation.x = 0.3
  o.rotation.z = -ufo.dir * 0.15 + Math.sin(ufo.t * 3) * 0.05
  o.rotation.y += dt * 0.8
  ufo.dropTimer -= dt
  if (ufo.dropTimer <= 0 && o.position.x > view.xMin && o.position.x < view.xMax) {
    ufo.dropTimer = 0.75
    spawn(Math.random() < 0.2 ? 'gem' : 'star', o.position.x, o.position.y - 0.8, -leg(game.stops).speed * view.k * 0.9, { sway: 0.2 })
    audio.tone(900 + Math.random() * 200, { dur: 0.2, vol: 0.03, slide: 0.7, echo: false })
  }
  if (Math.abs(o.position.x) > view.w + 3.5 && ufo.t > 1) {
    ufo.active = false
    o.visible = false
    ufo.timerLeft = rand(20, 30)
  }
}

// A hand swipes under the rocket when it has not been steered for a while: no reading needed
const nudgeEl = $('nudge')
let nudgeShown = false
let nudgeUsed = false // one quiet hint per flight, after a long rest
function updateNudge(dt) {
  game.idle += dt
  if (nudgeShown && game.idle < 1) nudgeUsed = true
  const show = !nudgeUsed && game.idle > 30 && !pointerDown
  if (show !== nudgeShown) {
    nudgeShown = show
    nudgeEl.classList.toggle('show', show)
  }
  if (!show) return
  tmp.set(rocket.root.position.x, rocket.root.position.y - 1.3, 0).project(camera)
  nudgeEl.style.left = `${clamp((tmp.x * 0.5 + 0.5) * 100, 15, 85)}%`
  nudgeEl.style.top = `min(${(-tmp.y * 0.5 + 0.5) * 100}%, calc(100% - 82px))`
}

const timer = new THREE.Timer()
timer.connect(document)
const fogMix = new THREE.Color()

function frame() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 1 / 20)
  game.time += dt
  if (game.state === 'loading') {
    renderer.render(scene, camera)
    return
  }
  const playing = game.state === 'play'
  const L = leg(game.stops)
  game.cruise = damp(game.cruise, playing ? 3 + L.speed : 2.5, 1, dt)

  if (playing) {
    game.spawnTimer -= dt
    if (game.spawnTimer <= 0) {
      spawnSomething()
      game.spawnTimer = L.interval * rand(0.8, 1.2)
    }
    game.dizzy = Math.max(0, game.dizzy - dt)
    const hadPower = game.magnet > 0 || game.double > 0
    if (game.magnet > 0 && (game.magnet -= dt) <= 0) audio.powerDown()
    if (game.double > 0 && (game.double -= dt) <= 0) audio.powerDown()
    if (hadPower) renderPowers()
    updateNudge(dt)
  }

  updateRocket(dt)
  updateItems(dt)
  updateUfo(dt)
  world.update(dt, game.cruise, playing ? Math.min(game.legPoints / L.need, 1) : 0.15, view)
  particles.update(dt)
  rings.update(dt)
  audio.updateEngine(playing, Math.hypot(rocket.vel.x, rocket.vel.y))
  audio.updateMusic()

  // Fog follows the sky so distant things melt into it
  const sky = world.skyMat.uniforms
  fogMix.copy(sky.uTop.value).lerp(sky.uBottom.value, 0.55)
  scene.fog.color.copy(fogMix)

  // A gentle camera drift adds depth
  camera.position.x = damp(camera.position.x, rocket.root.position.x * 0.08, 3, dt)
  camera.position.y = damp(camera.position.y, rocket.root.position.y * 0.04, 3, dt)
  camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5, 0)

  renderer.render(scene, camera)
}

resize()
renderer.setAnimationLoop(frame)
renderSound()

load()
  .then(() => {
    resize()
    game.state = 'title'
    const go = $('go')
    go.disabled = false
    go.textContent = '🚀 Fly!'
  })
  .catch((err) => {
    console.error(err)
    $('go').textContent = 'Oops! Try again 🔄'
    $('go').disabled = false
    $('go').onclick = () => location.reload()
  })
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game }
