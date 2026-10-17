import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Particles, Popups, makeBubbleTexture, makeGlowTexture } from './effects.js'
import { Sky } from './sky.js'
import { STOPS, World } from './world.js'

const $ = (id) => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const { clamp, damp } = THREE.MathUtils
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.05
renderer.autoClear = false // the star pictures are drawn as a second, flat pass (see frame)
const scene = new THREE.Scene()
scene.fog = new THREE.Fog('#2a1f66', 26, 85)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(0, 0, 16)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45
const hemi = new THREE.HemisphereLight('#d9d2ff', '#3a2a7a', 1.4)
hemi.layers.enableAll()
scene.add(hemi)
const key = new THREE.DirectionalLight('#fff3e0', 2.4)
key.position.set(4, 6, 10)
key.layers.enableAll()
scene.add(key)
const rim = new THREE.DirectionalLight('#8fd3ff', 1.6)
rim.position.set(-6, 4, -6)
rim.layers.enableAll()
scene.add(rim)

const audio = new Audio()
const particles = new Particles(scene)
// Kitty, the falling things and the sparkles are drawn after the star pictures, so a big woken
// animal never hides the rocket or what is falling toward it
const FRONT = 1
particles.points.layers.set(FRONT)
const popups = new Popups($('popups'), camera)
const glowTex = makeGlowTexture(false)
const sky = new Sky({ reducedMotion, onLit: (n) => audio.light(n), onComplete: (def) => wake(def) })
// A zoo friend gobbled a sparkle: its happy sound and a little burst
sky.onEat = (a) => {
  audio.voice(a.def.voice)
  sparkleAt(a.x, innerHeight - a.y, 12, 3)
}

// --- Game state ----------------------------------------------------------------------

// `k` is the visible height compared with a roomy screen: falling speeds scale with it, so a
// zoomed-in sideways phone gives little hands just as long to reach each star
const FULL_H = Math.tan((50 * Math.PI) / 360) * 16
// hudY: the lowest edge of the top HUD in world units; falling things appear below it, never through it
const view = { w: 10, h: 7.5, k: 1, xMin: -9, xMax: 9, yMin: -6, yMax: 1, hudY: 5 }
const game = {
  state: 'loading', // loading | title | play | finale
  // On each leg: 'build' (catching stars into the picture), 'alive' (the finished picture wakes up
  // and plays at the planet) or 'homeward' (the last flight home)
  phase: 'build',
  phaseTime: 0,
  stops: 0, // pictures finished on this trip, one per planet
  order: STOPS.map((_, i) => i), // the planets in this trip's order (see start)
  cometLeg: -1, // the leg where a comet sweeps past and rains stars (one surprise a trip)
  comet: null,
  spawnTimer: 0.5,
  sparkTimer: 0,
  rockTimer: 4,
  spawned: 0, // stars dropped on this leg
  combo: 0, // quick catches in a row (each one a note higher)
  lastCatch: -9,
  dizzy: 0,
  roll: 0,
  joy: 0,
  squash: 0, // the rocket's squash-and-stretch after a catch (1 → 0)
  cruise: 4,
  time: 0,
  idle: 0, // seconds since the player last steered (see the nudge)
  sinceCatch: 0,
  timers: [],
}

const ALIVE_TIME = 4.5 // seconds a woken picture plays on the stage before it joins the parade
const HOME_TIME = 4.5 // the last calm flight home

function later(fn, s) {
  game.timers.push(setTimeout(fn, s * 1000))
}
function clearTimers() {
  game.timers.forEach(clearTimeout)
  game.timers = []
}

const items = []
const pools = {}
const templates = {}
let models = {}
let world = null
let rocket = null

// Falling things: stars (each lights one star of the picture), now and then a big pink star that
// bursts into three, little sparkles to chase while a picture plays, and on two planets a few
// sleepy rocks that bump Kitty with a boing. Each planet has its own kind of star (see LEGS).
const KINDS = {
  star: { model: 'star', scale: 0.8, r: 0.7, glow: '#ffb52e', colors: ['#fff3a0', '#ffd23f', '#ffffff'] },
  pink: { model: 'star', scale: 1.15, r: 0.95, glow: '#ff7cc8', tint: '#ff9fd8', colors: ['#ff8fc7', '#ffd1e8', '#ffffff', '#c9b6ff'] },
  candyPink: { model: 'star', scale: 0.8, r: 0.7, glow: '#ff9fd8', tint: '#ff9fd8', colors: ['#ff8fc7', '#ffffff'] },
  candyMint: { model: 'star', scale: 0.8, r: 0.7, glow: '#8ef0c8', tint: '#8ef0c8', colors: ['#8ef0c8', '#ffffff'] },
  candyLemon: { model: 'star', scale: 0.8, r: 0.7, glow: '#fff07a', tint: '#fff07a', colors: ['#fff07a', '#ffffff'] },
  frost: { model: 'star', scale: 0.78, r: 0.7, glow: '#bfe6ff', tint: '#dff2ff', colors: ['#dff2ff', '#9fd8ff', '#ffffff'] },
  bubble: { model: 'star', scale: 0.62, r: 0.9, glow: '#ffd23f', bubble: true, colors: ['#bfefff', '#ffd1f0', '#ffffff'] },
  spark: { model: 'star', scale: 0.5, r: 0.6, glow: '#fff3a0', colors: ['#fff3a0', '#ffffff', '#ff8fc7'] },
  rock: { model: 'rock', scale: 0.8, r: 0.6, glow: null, colors: ['#c9b6ff', '#ffffff'] },
}
const CANDIES = ['candyPink', 'candyMint', 'candyLemon']

/**
 * Each planet's leg plays its own way (STOPS order: Moon, Ring Planet, Candy, Snowy, Jungle):
 *  fall: plain gold stars drifting down
 *  swirl: stars loop down in wide swirls, like little rings
 *  bounce: candy stars bounce off the bottom of the sky (a second, third chance)
 *  snow: frosty stars float sideways on a gentle, changing breeze
 *  rise: bubbles carrying stars float up from below and pop when caught
 */
const LEGS = [
  { move: 'fall', kind: () => 'star', rocks: false },
  { move: 'swirl', kind: () => 'star', rocks: false },
  { move: 'bounce', kind: () => CANDIES[(Math.random() * 3) | 0], rocks: true },
  { move: 'snow', kind: () => 'frost', rocks: false },
  { move: 'rise', kind: () => 'bubble', rocks: true },
]
/** The planet (STOPS index) the trip visits `n`th: each trip shuffles the order, so every trip plays out differently. */
const stopAt = (n) => game.order[n % game.order.length]
const legOf = () => LEGS[stopAt(game.stops)]

// --- Assets -------------------------------------------------------------------------

async function load() {
  const gltf = await new GLTFLoader().loadAsync('./models/space.glb')
  for (const child of [...gltf.scene.children]) models[child.name] = child

  for (const [kind, k] of Object.entries(KINDS)) {
    const g = new THREE.Group()
    const m = models[k.model].clone()
    m.name = 'model'
    if (k.tint) {
      // Its own pink material (the star's face and smile keep theirs)
      const body = m.getObjectByName('star_body')
      body.material = body.material.clone()
      body.material.color.set(k.tint)
      if (body.material.emissive) body.material.emissive.set(k.tint).multiplyScalar(0.55)
    }
    g.add(m)
    if (k.bubble) {
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeBubbleTexture(), transparent: true, depthWrite: false }))
      bubble.scale.setScalar(3.6)
      bubble.position.z = 0.6
      bubble.name = 'bubble'
      g.add(bubble)
    }
    if (k.glow) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(3.4)
      halo.position.z = -0.6
      halo.name = 'halo'
      g.add(halo)
    }
    g.scale.setScalar(k.scale)
    g.traverse((o) => o.layers.set(FRONT))
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
  scene.add(root)
  root.traverse((o) => o.layers.set(FRONT))
  // Kitty's face reacts: a happy squint after each catch, wide eyes when a rock bumps her
  const face = ['pilot_eye_1', 'pilot_eye_-1', 'pilot_cheek_1', 'pilot_cheek_-1'].map((n) => {
    const o = pilot.getObjectByName(n)
    return { o, base: o.scale.clone(), cheek: n.includes('cheek') }
  })
  rocket = { root, model, flame, pilot, face, pilotZ: pilot.position.z, nozzle, glow, vel: new THREE.Vector2(), target: new THREE.Vector2(0, -3), nozzleWorld: new THREE.Vector3() }
  root.position.set(0, -view.h * 0.62, 0)
}

// A friendly UFO glides past now and then; tap it and it beeps and drops a few stars
const ufo = { obj: null, lightMats: [], active: false, timerLeft: rand(6, 22), dir: 1, t: 0, dropped: false }
function buildUfo() {
  ufo.obj = models.ufo.clone()
  ufo.obj.scale.setScalar(0.9)
  ufo.obj.visible = false
  // Own material so its glow doesn't touch anything else
  ufo.obj.getObjectByName('ufo_lights').traverse((o) => {
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
  const it = { obj, kind, k, x, vy, big: 1, t: Math.random() * 10, sway: kind === 'rock' ? 0 : rand(0.15, 0.45), bounced: false, vx: 0, spin: 0, ...extra }
  items.push(it)
  return it
}

function recycle(i) {
  const it = items[i]
  scene.remove(it.obj)
  pools[it.kind].push(it.obj)
  items.splice(i, 1)
}

/** One star comes, in this planet's own way; every so often it is a big pink one that bursts into three. */
function spawnStar() {
  game.spawned++
  const leg = legOf()
  const left = sky.total - sky.claimed
  const pink = game.spawned > 2 && left >= 3 && Math.random() < 0.22
  // Somewhere Kitty has to fly to: never straight above where she waits
  let x = rand(view.xMin + 0.3, view.xMax - 0.3)
  const kx = rocket.root.position.x
  for (let k = 0; k < 6 && Math.abs(x - kx) < Math.min(2.2, view.w * 0.35); k++) x = rand(view.xMin + 0.3, view.xMax - 0.3)
  const kind = pink ? 'pink' : leg.kind()
  const extra = { move: pink ? 'fall' : leg.move, big: pink ? 1 : rand(0.85, 1.15), phase: Math.random() * 6 }
  if (extra.move === 'rise') {
    // Bubbles float up from below the rocket's reach and wobble as they go
    return spawn(kind, x, -view.h - 1.5, rand(1.5, 2.1) * view.k, { ...extra, sway: 0.5 })
  }
  const speed = { fall: rand(1.8, 2.6), swirl: rand(1.5, 2), bounce: rand(2.2, 2.8), snow: rand(1.1, 1.5) }[extra.move] ?? 2
  spawn(kind, x, view.h + 1.5, -(pink ? 1.6 : speed) * view.k, { ...extra, sway: extra.move === 'swirl' ? rand(1.2, 1.8) : rand(0.15, 0.45), bounces: 0 })
}

/** While a picture plays, a shower of little sparkles falls for Kitty to fly through. */
function spawnSpark() {
  // Aimed around Kitty, and drawn gently toward her: a little steering catches a lot of them
  const x = clamp(rocket.root.position.x + rand(-3, 3), view.xMin, view.xMax)
  spawn('spark', x, view.h + 1, -rand(3, 4.2) * view.k, { move: 'spark', sway: rand(0.1, 0.3) })
}

function spawnRock() {
  spawn('rock', rand(view.xMin + 0.5, view.xMax - 0.5), view.h + 1.5, -1.6 * view.k)
}

const fallingStars = () => items.reduce((n, it) => n + (it.kind !== 'rock' && it.kind !== 'spark' && !it.bounced ? 1 : 0), 0)

// --- Catching ---------------------------------------------------------------------------

const tmp = new THREE.Vector3()
const rocketCenter = new THREE.Vector3()

/** A world point on the play plane as CSS pixels. */
function toScreen(pos) {
  tmp.copy(pos).project(camera)
  return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight }
}

/** A CSS pixel point as a world point on the play plane (for sparkles over the star pictures). */
const ray = new THREE.Raycaster()
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const ndc = new THREE.Vector2()
function toWorld(x, y, out = new THREE.Vector3()) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  return ray.ray.intersectPlane(plane, out) ?? out.set(0, 0, 0)
}

/** Kitty catches a star: a tink (a note higher for each quick catch), a sparkle, a squish, a happy
 * squint from Kitty, and the star swoops up into the picture. */
function catchItem(it) {
  const pos = it.obj.position
  game.combo = game.time - game.lastCatch < 1.5 ? game.combo + 1 : 0
  game.lastCatch = game.time
  game.joy = 0.6
  game.squash = 1
  game.sinceCatch = 0
  const note = Math.min(game.combo, 10)
  if (it.kind === 'spark') {
    // A sparkle from the shower: a note, a twinkle, and the friend on the stage does its trick
    audio.catch(note)
    particles.burst(pos.clone(), it.k.colors, 8, 2.6, 0.5)
    const star = sky.star
    if (star && sky.trick(star)) audio.voice(star.def.voice)
    return
  }
  const at = toScreen(pos)
  if (it.kind === 'pink') {
    // The big pink star bursts into three that swoop up one after another
    audio.sparkle()
    particles.burst(pos.clone(), it.k.colors, 26, 5.5, 0.85)
    for (let i = 0; i < 3; i++) sky.claim(at.x + (i - 1) * 30, at.y, '#ffb8e2', i * 0.14)
    return
  }
  if (it.k.bubble) audio.pop()
  audio.catch(note)
  particles.burst(pos.clone(), it.k.colors, it.k.bubble ? 16 : 10, 3.2, 0.6)
  sky.claim(at.x, at.y)
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

/** Sparkles over a screen point, in the colours of a star picture. */
function sparkleAt(x, y, count = 14, power = 3.5) {
  particles.burst(toWorld(x, y), ['#fff3a0', '#ffd23f', '#ff8fc7', '#8ef0c8', '#7cc6fe'], count, power, 0.65)
}

/**
 * The picture is whole: it leaps out of the panel onto the stage and wakes up (the bear walks,
 * the fish swims, the bird flaps), Kitty reaches the planet with a happy roll, and a shower of
 * sparkles falls to fly through: each one caught (or a tap on the picture) sets off its trick.
 * Then it shrinks and joins the parade of friends following Kitty for the rest of the trip.
 */
function wake(def) {
  if (game.state !== 'play' || game.phase !== 'build') return
  game.phase = 'alive'
  game.phaseTime = 0
  game.stops++
  game.roll = reducedMotion ? 0 : 1
  // Everything still falling drifts gently away and fades, rocks too
  for (const it of items) {
    it.bounced = true
    it.fading = true
    if (it.kind === 'rock') it.vy = 1.5
  }
  game.sparkTimer = 0.6
  const stage = $('stage')
  sky.wake(stage)
  audio.wake()
  later(() => audio.voice(def.voice), 0.9)
  // A burst of sparkles the moment it wakes
  const r = stage.getBoundingClientRect()
  sparkleAt(r.left + r.width / 2, r.top + r.height / 2, 22, 5)
  renderJourney()
}

/** A tap on the woken picture (or a zoo friend at home): its trick, its sound and a sparkle. */
function tapCreature(e) {
  const a = sky.actorAt(e.clientX, e.clientY)
  if (!a) return false
  audio.unlock()
  if (sky.trick(a)) {
    audio.voice(a.def.voice)
    sparkleAt(e.clientX, e.clientY, 10, 2.5)
  }
  return true
}

function afterAlive() {
  sky.toParade()
  audio.whoosh(0.8)
  if (game.stops >= STOPS.length) return flyHome()
  nextLeg()
}

function flyHome() {
  game.phaseTime = 0
  game.phase = 'homeward'
  const planet = world.current()
  if (planet) planet.userData.leaving = 0
  // Home is under a deep, quiet night sky (the world eases toward these colours)
  world.top.set('#060824')
  world.bottom.set('#1b1446')
  world.nebulae.forEach((n, i) => n.material.color.set(i % 2 ? '#3a2a8a' : '#24407a'))
  audio.whoosh(2)
  renderJourney()
}

function nextLeg() {
  game.phase = 'build'
  game.phaseTime = 0
  world.setStop(stopAt(game.stops))
  beginPicture(game.stops)
  audio.whoosh(1.2)
  renderJourney()
}

function beginPicture(i) {
  Object.assign(game, { spawned: 0, spawnTimer: 1.2, rockTimer: rand(3, 5), sinceCatch: 0 })
  // Now and then a leg brings a rare surprise: the planet sneezes stars, or a chain of shooting stars
  game.event = i > 0 && i !== game.cometLeg && Math.random() < 0.6 ? (Math.random() < 0.5 ? 'sneeze' : 'chain') : null
  game.eventAt = rand(0.25, 0.6)
  game.eventDone = false
  sky.begin(i, $('stage'))
  // The first two stars pop in close to Kitty, so the very first catch comes in a moment
  later(() => spawnNear(-1), 0.35)
  later(() => spawnNear(1), 0.9)
}

/** A slow, sparkly star that drifts down and steers itself onto Kitty (for a child who is stuck). */
function spawnGift() {
  const p = rocket.root.position
  const y = Math.min(p.y + 5, view.hudY - 0.8)
  spawn('star', clamp(p.x + rand(-1.5, 1.5), view.xMin, view.xMax), y, -1.3 * view.k, { move: 'gift', sway: 0.1, phase: 0, appear: 0, big: 1.15 })
  particles.burst(new THREE.Vector3(p.x, y, 0), ['#fff3a0', '#ffffff', '#ffd23f'], 10, 2, 0.5)
  audio.twinkle()
}

/** A star that pops into the sky a short reach from Kitty (`side` -1 left, 1 right). */
function spawnNear(side) {
  if (game.state !== 'play' || game.phase !== 'build' || sky.full) return
  const leg = legOf()
  const p = rocket.root.position
  const x = clamp(p.x + side * rand(1.4, 2.2), view.xMin + 0.3, view.xMax - 0.3)
  const rise = leg.move === 'rise'
  const y = rise ? p.y + 0.4 : Math.min(p.y + rand(3.5, 4.5), view.hudY - 0.8)
  const speed = rise ? 1.2 : 1.4
  spawn(leg.kind(), x, y, (rise ? speed : -speed) * view.k, { move: leg.move === 'rise' ? 'rise' : leg.move === 'bounce' ? 'bounce' : 'fall', sway: 0.15, phase: 0, bounces: 0, appear: 0 })
  particles.burst(new THREE.Vector3(x, y, 0), ['#fff3a0', '#ffffff'], 8, 2, 0.45)
  audio.twinkle()
}

/** Home: every star creature of the trip plays in the night sky, and each one does its trick when tapped. */
function showFinale() {
  game.state = 'finale'
  clearPlayfield()
  // Nothing drifts behind the star creatures at home
  world.calm(true)
  const screen = $('finale')
  screen.classList.remove('hidden')
  requestAnimationFrame(() => screen.classList.remove('fade'))
  // The friends play above where Kitty rests in the corner, never under her rocket
  sky.showZoo($('zoo'), toScreen(tmp.set(0, KITTY_HOME_Y + 1.6, 0)).y)
  audio.fanfare()
  // ▶ rests a moment (dimmed) while the friends arrive, then wakes up
  game.finaleAt = performance.now()
  const again = $('again')
  again.classList.add('resting')
  later(() => again.classList.remove('resting'), AGAIN_REST / 1000)
  sky.actors.forEach((a, i) => later(() => game.state === 'finale' && audio.voice(a.def.voice), 1 + i * 0.6))
}

// --- HUD ----------------------------------------------------------------------------

/** Progress toward the current planet: the share of its picture already lit. */
function legProgress() {
  return game.phase === 'build' ? (sky.total ? sky.lit / sky.total : 0) : 1
}

/**
 * Home, the five planets in this trip's order, and home again: a calm row of pictures. The one
 * being flown to stands a little bigger, with a gold ring that fills as its picture is caught.
 */
let journeyKey = ''
let journeyGoal = null
let journeyP = -1
function renderJourney() {
  const at = game.stops
  const homeward = game.phase === 'homeward'
  const building = game.phase === 'build'
  const trip = game.order.map((i) => STOPS[i])
  // Stops are numbered 0 (home), 1–5 (the planets), 6 (home again)
  const goal = homeward ? trip.length + 1 : building ? at + 1 : -1
  const key = `${at}:${goal}:${game.order.join('')}`
  if (key !== journeyKey) {
    journeyKey = key
    const icons = ['🏡', ...trip.map((s) => s.emoji), '🏡']
    const parts = icons.map((icon, k) => {
      const done = k === 0 || k <= at
      const cls = k === goal ? 'goal' : done ? 'done' : ''
      const line = k ? `<span class="line ${done || k === goal ? 'done' : ''}"></span>` : ''
      return `${line}<span class="stop ${cls}">${icon}</span>`
    })
    const journey = $('journey')
    journey.innerHTML = parts.join('')
    journeyGoal = journey.querySelector('.goal')
    journeyP = -1
  }
  if (!journeyGoal) return
  const p = Math.round(Math.min(1, homeward ? game.phaseTime / HOME_TIME : legProgress()) * 100) / 100
  if (p !== journeyP) {
    journeyP = p
    journeyGoal.style.setProperty('--p', p)
  }
}

function renderSound() {
  for (const id of ['sound', 'finale-sound']) $(id).textContent = audio.muted ? '🔇' : '🔊'
}

function toggleSound() {
  audio.unlock()
  // Never saved: a sibling's stray mute doesn't follow the next player
  audio.setMuted(!audio.muted)
  renderSound()
}

// --- Input --------------------------------------------------------------------------

const keys = new Set()
let pointerDown = false

function aim(e) {
  if (!rocket) return
  toWorld(e.clientX, e.clientY, tmp)
  game.idle = 0
  // Fingers cover what they touch, so the rocket flies a little above the finger
  const lift = e.pointerType === 'mouse' ? 0 : 1.4
  rocket.target.set(tmp.x, tmp.y + lift)
}

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true
  audio.unlock()
  if (game.state === 'finale') {
    // A tap on a friend sets off its trick; a tap on empty sky drops a sparkle for someone to gobble
    if (!tapCreature(e)) {
      sky.feed(e.clientX, e.clientY)
      audio.twinkle()
    }
    return
  }
  if (game.state === 'title') return pokeKitty(e)
  if (game.state !== 'play') return
  if (game.phase === 'alive' && tapCreature(e)) return
  // A tap on the UFO is for the UFO: Kitty stays put so its stars can be chased
  if (poke(e) === 'ufo') return
  aim(e)
})

/** Tapping Kitty gets a happy meow (on the title too). */
function pokeKitty(e) {
  const p = toWorld(e.clientX, e.clientY, tmp)
  const r = rocket.root.position
  if (Math.hypot(p.x - r.x, p.y - r.y - 0.3) > 1.4) return false
  if (game.joy < 0.2) audio.meow()
  game.joy = 0.6
  game.squash = 1
  return true
}

/** Kitty meows, the planet ahead giggles and wobbles, and the UFO beeps and drops stars. */
function poke(e) {
  if (pokeKitty(e)) return
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  if (ufo.active && !ufo.dropped && ray.intersectObject(ufo.obj, true).length) {
    ufoDrop()
    return 'ufo'
  }
  const planet = world.current()
  if (planet && ray.intersectObject(planet, true).length && world.boop(planet)) audio.boop()
}

function ufoDrop() {
  ufo.dropped = true
  audio.beep()
  const p = ufo.obj.position
  particles.burst(new THREE.Vector3(p.x, p.y - 0.6, 0), ['#8ef0c8', '#ffffff', '#fff3a0'], 12, 3, 0.55)
  if (game.phase !== 'build' || sky.full) return
  for (let i = 0; i < 3; i++) spawn('star', clamp(p.x + (i - 1) * 1.3, view.xMin, view.xMax), p.y - 1, -2 * view.k, { sway: 0.15 })
}

addEventListener('pointermove', (e) => {
  if (game.state === 'play' && (pointerDown || e.pointerType === 'mouse')) aim(e)
})
addEventListener('pointerup', () => (pointerDown = false))
addEventListener('pointercancel', () => (pointerDown = false))
addEventListener('keydown', (e) => {
  audio.unlock()
  // During a trip the keys can't mute or end it by accident (the buttons need a hold there too)
  if ((e.key === 'm' || e.key === 'M') && game.state !== 'play') return toggleSound()
  if (e.key === 'Escape' && game.state !== 'play') return goHome()
  if (game.state === 'finale' && e.key === 'Enter') return flyAgain()
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
// The sound switches need a short hold too (a stray tap never silences the game), in a trip and in the zoo
holdToPress($('sound'), toggleSound)
holdToPress($('finale-sound'), toggleSound)

function start() {
  if (game.state !== 'title') return
  clearTimers()
  // Every trip starts with sound on: a mute from the zoo (or a sibling) doesn't carry over
  if (audio.muted) {
    audio.setMuted(false)
    renderSound()
  }
  audio.unlock()
  audio.click()
  audio.whoosh(1)
  game.state = 'play'
  world.calm(false)
  $('start').classList.add('fade')
  later(() => $('start').classList.add('hidden'), 0.4)
  $('hud').classList.remove('hidden')
  rocket.target.set(0, view.yMin + 1.2)
  Object.assign(game, { phase: 'build', phaseTime: 0, stops: 0, idle: 0 })
  // A fresh order of planets every trip, and a comet surprise on one leg after the first
  game.order = STOPS.map((_, i) => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i)
  game.cometLeg = 1 + ((Math.random() * (STOPS.length - 1)) | 0)
  world.setStop(stopAt(0))
  resize() // the HUD is on screen now, so the band that things fade in below can be measured
  beginPicture(0)
  renderJourney()
}
$('go').addEventListener('click', start)
// Any tap on the title starts the trip, except a tap on Kitty (she meows instead)
$('start').addEventListener('pointerdown', (e) => {
  audio.unlock()
  if (game.state !== 'title' || (rocket && pokeKitty(e))) return
  start()
})

/** Back to the title. */
function goHome() {
  if (game.state !== 'play' && game.state !== 'finale') return
  resetTrip()
  const screen = $('start')
  screen.classList.remove('hidden')
  requestAnimationFrame(() => screen.classList.remove('fade'))
}
holdToPress($('home'), goHome)

/**
 * A button that needs a short press-and-hold (a ring fills around it), so a stray tap in the
 * middle of a trip never ends it. Letting go early just lets the ring drain away.
 */
function holdToPress(el, action, { ms = 800, disc = false } = {}) {
  const down = new Set() // every finger (or mouse) on the page right now
  let id = null // the finger holding this button
  let token = 0 // bumped on every start and cancel, so a stale animation frame never fires
  let raf = 0
  let blocked = false // a second finger cancelled the hold: nothing restarts until every finger lifts
  let ghost = null // the finger whose hold just fired: the click its lift makes is swallowed
  const set = (k) => el.style.setProperty('--hold', k)
  const stop = () => {
    token++
    cancelAnimationFrame(raf)
    raf = 0
    id = null
    set(0)
    el.classList.remove('holding')
  }
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    audio.unlock()
    down.add(e.pointerId)
    // A round button only answers on its visible disc, not the corners of its box
    if (disc) {
      const r = el.getBoundingClientRect()
      if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) > r.width / 2) return
    }
    // More than one finger (a palm, a sibling's hand) is never a press
    if (id !== null || blocked || down.size > 1) {
      stop()
      blocked = true
      return
    }
    cancelAnimationFrame(raf)
    id = e.pointerId
    const mine = ++token
    const start = performance.now()
    el.classList.add('holding')
    const step = () => {
      if (mine !== token) return
      const k = Math.min(1, (performance.now() - start) / ms)
      set(k)
      if (k < 1) raf = requestAnimationFrame(step)
      else {
        const finger = id
        stop()
        ghost = finger
        action()
      }
    }
    raf = requestAnimationFrame(step)
  })
  // Fingers anywhere on the page: another one landing cancels the hold
  addEventListener('pointerdown', (e) => {
    // The first finger of a new touch (or any mouse press) starts afresh, so a lift the page
    // never heard about cannot leave the button blocked
    if (e.isPrimary && id === null) {
      down.clear()
      blocked = false
    }
    down.add(e.pointerId)
    if (id !== null && e.pointerId !== id) {
      stop()
      blocked = true
    }
  }, true)
  const lift = (e) => {
    down.delete(e.pointerId)
    // The screen changed under a finger still down (to the title, say): the click its lift makes
    // must not press whatever is there now
    if (e.pointerId === ghost) {
      ghost = null
      const swallow = (c) => {
        c.preventDefault()
        c.stopPropagation()
      }
      addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => removeEventListener('click', swallow, true), 400)
    }
    if (e.pointerId === id) stop()
    if (!down.size) blocked = false
  }
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, lift, true)
  el.addEventListener('pointerleave', (e) => e.pointerId === id && stop())
}
holdToPress($('finale-home'), goHome)

/** From the sky zoo at home straight into a new trip. */
const AGAIN_REST = 2500 // ms after arriving home before ▶ answers, so zoo play never restarts by accident
function flyAgain() {
  if (game.state !== 'finale' || performance.now() - game.finaleAt < AGAIN_REST) return
  resetTrip()
  start()
}
// In the zoo, where little hands tap everywhere, ▶ needs a short press-and-hold on its disc;
// a keyboard press (Enter, or Space on the focused button) still flies at once
holdToPress($('again'), flyAgain, { ms: 600, disc: true })
$('again').addEventListener('click', (e) => e.detail === 0 && flyAgain())

function hideUfo() {
  ufo.active = false
  ufo.obj.visible = false
  ufo.timerLeft = rand(6, 22)
}

/** Clears the play: falling things, the UFO, the nudge and the HUD. */
function clearPlayfield() {
  for (let i = items.length - 1; i >= 0; i--) recycle(i)
  Object.assign(game, { dizzy: 0, roll: 0, comet: null })
  cometSprite.visible = false
  hideUfo()
  nudgeEl.classList.remove('show')
  nudgeShown = false
  $('hud').classList.add('hidden')
}

/** Everything back to the start of a trip. */
function resetTrip() {
  audio.click()
  clearTimers()
  game.state = 'title'
  clearPlayfield()
  Object.assign(game, { phase: 'build', phaseTime: 0, stops: 0, idle: 0 })
  world.setStop(0)
  // The title is calm: no planets drift behind the button, and the first planet waits low
  world.calm(true, { title: true })
  sky.reset()
  $('finale').classList.add('hidden', 'fade')
  keys.clear()
  pointerDown = false
}

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
  // Falling things grow in below the picture panel and the journey, not through them
  const hudBottom = Math.max(...['journey'].map((id) => {
    const r = $(id).getBoundingClientRect()
    return r.height ? r.bottom : 0
  })) + 12
  view.hudY = view.h - Math.min(hudBottom, h * 0.3) * px
  const hpx = h * renderer.getPixelRatio()
  particles.setScale(hpx, camera.fov)
  world?.setScale(hpx, camera.fov)
  sky.resize(w, h)
}
addEventListener('resize', resize)

// --- Main loop ----------------------------------------------------------------------

// Muted warm tones: the particles glow additively, so darker colours give a softer trail
const EXHAUST_COLORS = ['#a8862a', '#a5672c', '#8f4f4f', '#a89f6a'].map((c) => new THREE.Color(c))
const exhaust = { vx: 0, vy: 0, spread: 0.35, life: 0.55, size: 0, endSize: 0.05, color: EXHAUST_COLORS[0], drag: 1.5 }
const trail = { vy: -2, spread: 0.4, life: 0.6, size: 0.35, color: new THREE.Color('#ffffff'), drag: 1 }

// Where Kitty rests at home, low in the corner (world units)
let KITTY_HOME_Y = -5
function updateRocket(dt) {
  KITTY_HOME_Y = -view.h + 2.2
  const r = rocket
  const playing = game.state === 'play'
  if (playing) {
    const dx = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0)
    const dy = (keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0)
    r.target.x += dx * 11 * dt
    r.target.y += dy * 9 * dt
  } else {
    // At home Kitty rests low in the corner, clear of the star creatures and the buttons
    if (game.state === 'finale') r.target.set(view.w - 1.6, KITTY_HOME_Y + Math.sin(game.time * 1.3) * 0.15)
    // On the title Kitty bobs just under the big button
    else r.target.set(Math.sin(game.time * 0.7) * Math.min(2, view.w * 0.3), -view.h * 0.45 + Math.sin(game.time * 1.3) * 0.3)
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

  // Squash and stretch: a catch squishes the rocket wide, then it springs back tall
  game.squash = Math.max(0, game.squash - dt * 3)
  const sq = reducedMotion ? 0 : Math.sin((1 - game.squash) * Math.PI * 2.5) * game.squash * 0.16
  r.root.scale.set(1 + sq, 1 - sq, 1 + sq)

  // Flame grows when climbing, with a soft, slow breathing (no fast flicker)
  const climb = clamp(r.vel.y * 0.08, -0.3, 0.6)
  const f = 1 + climb + Math.sin(game.time * 4) * 0.04
  r.flame.scale.set(1 + Math.sin(game.time * 3) * 0.02, f, 1 + Math.sin(game.time * 3) * 0.02)
  r.glow.material.opacity = 0.4 + 0.03 * Math.sin(game.time * 2.5) + climb * 0.1
  r.glow.scale.setScalar(2.4 + climb * 1.2)

  // Kitty pilot: a happy bounce when catching things
  game.joy = Math.max(0, game.joy - dt)
  r.pilot.rotation.z = Math.sin(game.time * 2) * 0.12 + Math.sin(game.joy * 12) * game.joy * 0.3
  r.pilot.position.z = r.pilotZ + game.joy * 0.15
  const happy = clamp(game.joy * 2.5, 0, 1)
  const wide = clamp(game.dizzy, 0, 1)
  for (const { o, base, cheek } of r.face) {
    // The eyes face forward (-y), so their height is z: squeezing z makes a happy "^^" squint
    if (cheek) o.scale.set(base.x * (1 + happy * 0.5), base.y, base.z * (1 + happy * 0.6))
    else o.scale.set(base.x * (1 + wide * 0.35), base.y, base.z * (1 - happy * 0.65 + wide * 0.45))
  }

  // Exhaust trail (every frame, so it reuses one options object and pre-parsed colours)
  r.nozzle.getWorldPosition(r.nozzleWorld)
  const n = r.nozzleWorld
  if (Math.random() < dt * (game.state === 'finale' ? 5 : 18)) {
    exhaust.vx = rand(-0.3, 0.3) - r.vel.x * 0.1
    exhaust.vy = -game.cruise * 0.4 - 1
    exhaust.size = rand(0.35, 0.5)
    exhaust.color = EXHAUST_COLORS[(Math.random() * EXHAUST_COLORS.length) | 0]
    particles.emit(n.x + rand(-0.08, 0.08), n.y - 0.35, n.z - 0.1, exhaust)
  }
  // A swoosh of sparkles behind a fast swerve
  if (Math.abs(r.vel.x) > 4 && Math.random() < 0.3) {
    particles.emit(p.x + rand(-0.4, 0.4), p.y + rand(-0.5, 0.5), 0.2, trail)
  }

  rocketCenter.set(p.x, p.y + 0.3, 0)
  // The parade of star friends follows the rocket's path and keeps clear of it
  const at = toScreen(tmp.set(p.x, p.y - 0.2, 0))
  sky.leader.set(at.x, innerHeight - at.y)
  sky.leaderR = (1.25 / view.h) * innerHeight * 0.5
  if (Math.abs(r.vel.x) > 1) sky.leaderDir = Math.sign(r.vel.x)
}

function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const o = it.obj
    it.t += dt
    if (it.bounced) {
      // A bumped rock tumbles away; things left over at a planet float softly back up and fade
      if (it.kind === 'rock' && !it.fading) it.vy -= 3 * dt
      else {
        it.vy = Math.min(it.vy + dt * 4, 1.5)
        it.fade = (it.fade ?? 1) - dt * 1.2
        if (it.fade <= 0) {
          recycle(i)
          continue
        }
      }
      it.x += it.vx * dt
      o.position.y += it.vy * dt
      o.rotation.z += it.spin * dt
    } else if (!moveItem(it, dt)) {
      recycle(i)
      continue
    }
    o.position.x = it.x + Math.sin(it.t * (it.move === 'swirl' ? 1.6 : 1.7) + (it.phase || 0)) * it.sway

    // Each kind moves in its own gentle way: stars twinkle as they turn, the pink one twirls
    const model = o.children[0]
    if (it.kind === 'rock') {
      if (!it.bounced) o.rotation.z = Math.sin(it.t * 0.9) * 0.25
    } else if (it.k.bubble) {
      model.rotation.y = Math.sin(it.t * 1.5) * 0.4
      const bubble = o.getObjectByName('bubble')
      bubble.scale.set(3.6 * (1 + Math.sin(it.t * 3.1) * 0.05), 3.6 * (1 - Math.sin(it.t * 3.1) * 0.05), 1)
    } else if (it.kind === 'pink') {
      model.rotation.y = it.t * 1.6
      model.rotation.z = Math.sin(it.t * 1.4) * 0.25
    } else {
      model.rotation.y = Math.sin(it.t * 2.2) * 0.55
      model.rotation.z = Math.sin(it.t * 1.4) * 0.2
    }

    // Things grow in just below the HUD band instead of sliding through the panel
    const tumbling = it.bounced && it.kind === 'rock' && !it.fading
    // Stars that pop in near Kitty grow from nothing in a blink
    if (it.appear < 1) it.appear = Math.min(1, it.appear + dt * 3.5)
    const grow = tumbling ? 1 : Math.min(it.appear ?? 1, clamp((view.hudY - o.position.y) / 0.8 + 0.001, 0, 1))
    const size = grow * (it.fade ?? 1)
    o.visible = size > 0
    if (!tumbling) {
      const sq = it.squish ? Math.sin(it.squish * Math.PI) * 0.35 : 0
      o.scale.set(it.k.scale * it.big * size * (1 + sq), it.k.scale * it.big * size * (1 - sq), it.k.scale * it.big * size)
    }

    // Catch!
    if (game.state === 'play' && !it.bounced && grow >= 1) {
      const d = Math.hypot(o.position.x - rocketCenter.x, o.position.y - rocketCenter.y)
      if (d < catchReach(it)) {
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

/** Moves a star the way its planet does (see LEGS). Returns false once it has left the sky. */
function moveItem(it, dt) {
  const o = it.obj
  if (it.move === 'bounce') {
    // Gentle gravity, and a springy bounce off the bottom of the sky (three times, then it drops away)
    it.vy -= 0.9 * view.k * dt
    o.position.y += it.vy * dt
    const floor = -view.h + 0.9
    if (o.position.y < floor && it.vy < 0 && it.bounces < 3) {
      o.position.y = floor
      it.vy = -it.vy * 0.82
      it.bounces++
      it.squish = 1
      if (game.state === 'play') audio.bip(it.bounces)
    }
    it.squish = Math.max(0, (it.squish || 0) - dt * 4)
  } else if (it.move === 'snow') {
    // A breeze that slowly changes its mind, and a little flutter of its own
    it.x += (Math.sin(game.time * 0.35) * 1.4 + Math.sin(it.t * 1.3 + it.phase) * 0.6) * view.k * dt
    if (it.x < view.xMin || it.x > view.xMax) it.x = clamp(it.x, view.xMin, view.xMax)
    o.position.y += it.vy * dt
  } else if (it.move === 'gift') {
    it.x += (rocket.root.position.x - it.x) * 1.4 * dt
    o.position.y += it.vy * dt
  } else if (it.move === 'spark') {
    it.x += (rocket.root.position.x - it.x) * 0.5 * dt
    o.position.y += it.vy * dt
  } else if (it.move === 'fling') {
    // Sneezed out of a planet: flung outward, then drifting down
    it.x += it.vx * dt
    it.vx *= Math.exp(-dt * 1.2)
    it.vy = Math.max(it.vy - 2.4 * view.k * dt, -1.8 * view.k)
    o.position.y += it.vy * dt
  } else if (it.move === 'streak') {
    // A shooting star of the chain, gliding across the sky on a slant
    it.x += it.vx * dt
    o.position.y += it.vy * dt
    if (Math.random() < dt * 20) particles.emit(o.position.x - Math.sign(it.vx) * 0.4, o.position.y + 0.2, 0.2, streakTrail)
  } else if (it.move === 'rise') {
    o.position.y += it.vy * dt
    // Bubbles float off under the top of the sky
    if (o.position.y > view.hudY) return false
  } else {
    o.position.y += it.vy * dt
  }
  return true
}

const streakTrail = { vx: 0, vy: 0, spread: 0.3, life: 0.6, size: 0.4, endSize: 0, color: '#fff3c4', drag: 1.5 }

/** The planet ahead puffs up and sneezes a spray of stars (a wobble, an "ah-choo", stars flying out). */
function sneeze() {
  const planet = world.current()
  if (!planet) return chain()
  world.boop(planet)
  const at = toScreen(planet.getWorldPosition(new THREE.Vector3()))
  const p = toWorld(clamp(at.x, 60, innerWidth - 60), clamp(at.y, innerHeight * 0.3, innerHeight * 0.6))
  audio.achoo()
  later(() => {
    if (game.phase !== 'build') return
    particles.burst(p.clone(), ['#fff3a0', '#ffd23f', '#ffffff'], 18, 4, 0.6)
    const toward = Math.sign(-p.x) || 1
    for (let k = 0; k < 5; k++) {
      spawn(legOf().kind(), p.x, p.y, rand(1.5, 3) * view.k, { move: 'fling', vx: toward * rand(1, 4.5) + rand(-1, 1), sway: 0.1, phase: 0, appear: 0 })
    }
  }, 0.55)
}

/** Five shooting stars glide across the sky one after another on a slant: catch them all in a row for a climbing tune. */
function chain() {
  const dir = Math.random() < 0.5 ? 1 : -1
  const y = view.hudY - 0.6
  audio.whoosh(1.6)
  for (let k = 0; k < 5; k++) {
    later(() => {
      if (game.phase !== 'build' || game.state !== 'play') return
      spawn('star', -dir * (view.w + 0.5), y, -1.1 * view.k, { move: 'streak', vx: dir * (view.w * 2) / 5.5, sway: 0, phase: 0, appear: 0 })
      audio.twinkle()
    }, k * 0.55)
  }
}

/**
 * The trip's surprise: a big friendly comet sweeps across the sky on one leg, trailing sparkles
 * and dropping a rain of stars behind it.
 */
const cometSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff1c4', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
cometSprite.visible = false
cometSprite.layers.set(FRONT)
scene.add(cometSprite)
const cometTrail = { vx: 0, vy: 0, spread: 0.5, life: 1, size: 0.55, endSize: 0, color: '#ffe9a8', drag: 1.2 }
function startComet() {
  const dir = Math.random() < 0.5 ? 1 : -1
  game.comet = { dir, t: 0, x: -dir * (view.w + 2), drops: 0 }
  cometSprite.visible = true
  audio.whoosh(3)
  later(() => audio.sparkle(), 0.4)
}

function updateComet(dt) {
  const c = game.comet
  if (!c || c.done) return
  if (game.state !== 'play') {
    c.done = true
    cometSprite.visible = false
    return
  }
  c.t += dt
  c.x += c.dir * ((view.w * 2 + 4) / 3.2) * dt
  const y = view.hudY - 1.2 - Math.sin(Math.min(1, c.t / 3.2) * Math.PI) * 1.2
  cometSprite.position.set(c.x, y, 0.5)
  cometSprite.scale.setScalar(3 + Math.sin(c.t * 6) * 0.2)
  for (let k = 0; k < 2; k++) {
    cometTrail.vx = -c.dir * rand(1, 2.5)
    cometTrail.vy = rand(-0.6, 0.6)
    cometTrail.color = ['#ffe9a8', '#ff9fd8', '#9fe8ff'][(Math.random() * 3) | 0]
    particles.emit(c.x - c.dir * 0.6, y, 0.4, cometTrail)
  }
  // A star rain behind it: one about every third of a screen
  const across = (c.x + view.w) / (view.w * 2)
  const due = c.dir > 0 ? across * 7 : (1 - across) * 7
  if (due > c.drops + 1 && c.drops < 7 && game.phase === 'build' && !sky.full) {
    c.drops++
    spawn('star', clamp(c.x, view.xMin, view.xMax), y - 0.5, -1.6 * view.k, { move: 'fall', sway: 0.2, phase: 0, appear: 0 })
  }
  if (Math.abs(c.x) > view.w + 3 && c.t > 1) {
    c.done = true
    cometSprite.visible = false
  }
}

/** True while Kitty's rocket is over (or just beside) the planet ahead, on screen. */
const planetAt = new THREE.Vector3()
function planetNearKitty() {
  const planet = world.current()
  if (!planet) return false
  planet.getWorldPosition(planetAt)
  const c = toScreen(planetAt)
  planetAt.x += planet.userData.reach * planet.scale.x
  const radius = Math.abs(toScreen(planetAt).x - c.x)
  const k = toScreen(rocket.root.position)
  // Once it has stepped aside it stays aside while Kitty is still about where it was
  const margin = 70 + (world.fade < 0.9 ? innerWidth * 0.25 : 0)
  return Math.hypot(k.x - c.x, k.y - c.y) < radius + margin
}

/**
 * How close Kitty must come to catch something: smaller on narrow (portrait) screens, where the
 * sky is only a few stars wide, and a little kinder while she is moving, so a child who steers is
 * forgiven a near miss but one who waits does not catch everything.
 */
function catchReach(it) {
  const narrow = clamp(view.w / 9, 0.72, 1)
  const moving = Math.hypot(rocket.vel.x, rocket.vel.y) > 1.2 ? 0.3 : 0
  return (0.6 + it.k.r * 0.7) * narrow + moving
}

function updateUfo(dt) {
  if (!ufo.obj) return
  // Slow, soft glow in turn: never a blink
  ufo.lightMats.forEach((m, i) => (m.emissiveIntensity = 0.8 + 0.3 * Math.sin(game.time * 1.2 + i * 2)))
  if (!ufo.active) {
    if (game.state !== 'play' || game.phase !== 'build') return
    ufo.timerLeft -= dt
    if (ufo.timerLeft > 0) return
    ufo.active = true
    ufo.dropped = false
    ufo.dir = Math.random() < 0.5 ? 1 : -1
    ufo.t = 0
    ufo.obj.visible = true
    ufo.obj.position.set(-ufo.dir * (view.w + 3), view.hudY - 1.4, -1)
    audio.whoosh(1.4)
    return
  }
  ufo.t += dt
  const o = ufo.obj
  const speed = Math.max(2, (view.w * 2 + 6) / 9)
  o.position.x += ufo.dir * speed * dt
  o.position.y = view.hudY - 1.4 + Math.sin(ufo.t * 1.2) * 0.2
  o.rotation.x = 0.3
  o.rotation.z = -ufo.dir * 0.15 + Math.sin(ufo.t * 3) * 0.05
  o.rotation.y += dt * (ufo.dropped ? 3 : 0.8)
  if (Math.abs(o.position.x) > view.w + 3.5 && ufo.t > 1) {
    ufo.active = false
    o.visible = false
    ufo.timerLeft = rand(12, 30)
  }
}

// A hand swipes under the rocket only when it has sat still and caught nothing for a while
const nudgeEl = $('nudge')
let nudgeShown = false
function updateNudge(dt) {
  game.idle += dt
  game.sinceCatch += dt
  const show = game.idle > 4 && game.sinceCatch > 4 && !pointerDown && game.phase === 'build'
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
    renderer.clear()
    renderer.render(scene, camera)
    return
  }
  const playing = game.state === 'play'
  // At home the sky stands still, so the star creatures are the thing to watch
  const finale = game.state === 'finale'
  game.cruise = damp(game.cruise, playing ? 5.3 : finale ? 0 : 2.5, finale ? 2 : 1, dt)

  if (playing) {
    game.phaseTime += dt
    if (game.phase === 'build') {
      // Stars keep drifting down, a few at a time, until the picture has all it needs
      game.spawnTimer -= dt
      if (game.spawnTimer <= 0 && !sky.full) {
        if (fallingStars() < 6) spawnStar()
        game.spawnTimer = rand(0.5, 0.9)
      }
      if (game.stops === game.cometLeg && !game.comet && sky.lit >= sky.total * 0.3) startComet()
      // A child who has caught nothing for a while still gets somewhere: one slow star drifts down onto Kitty
      if (game.sinceCatch > 20 && !sky.full) {
        game.sinceCatch = 10
        spawnGift()
      }
      if (game.event && !game.eventDone && sky.lit >= sky.total * game.eventAt) {
        game.eventDone = true
        ;({ sneeze, chain })[game.event]()
      }
      if (legOf().rocks) {
        game.rockTimer -= dt
        if (game.rockTimer <= 0) {
          spawnRock()
          game.rockTimer = rand(5, 8)
        }
      }
    } else if (game.phase === 'alive') {
      game.sparkTimer -= dt
      if (game.sparkTimer <= 0 && game.phaseTime < ALIVE_TIME - 1.2) {
        spawnSpark()
        game.sparkTimer = rand(0.12, 0.22)
      }
      if (game.phaseTime > ALIVE_TIME) afterAlive()
    } else if (game.phase === 'homeward') {
      renderJourney()
      if (game.phaseTime > HOME_TIME) showFinale()
    }
    if (game.phase === 'build') renderJourney()
    game.dizzy = Math.max(0, game.dizzy - dt)
    updateNudge(dt)
  }

  updateRocket(dt)
  updateItems(dt)
  updateUfo(dt)
  updateComet(dt)
  // The background twinkles dim and cool while stars are caught, so the catchable ones stand out
  world.dim = playing && game.phase === 'build' ? 0.4 : 1
  // The parade keeps out of the way of stars Kitty could catch
  sky.hazards.length = 0
  if (playing) {
    for (const it of items) {
      // Leftover stars drifting away count too, so nothing ever sits on a friend
      if (it.kind === 'rock' || !it.obj.visible) continue
      const at = toScreen(it.obj.position)
      sky.hazards.push({ x: at.x, y: innerHeight - at.y })
    }
  }
  // While a picture plays, or while Kitty flies near the planet ahead, the planets fade and step
  // aside, so the sky where Kitty plays stays clear
  if (playing && planetNearKitty()) game.planetNear = 1.5
  game.planetNear = Math.max(0, (game.planetNear || 0) - dt)
  world.quiet = playing && (game.phase === 'alive' || game.planetNear > 0)
  world.update(finale ? dt * 0.2 : dt, game.cruise, playing ? legProgress() : 0.15, view)
  particles.update(dt)
  audio.updateEngine(playing, Math.hypot(rocket.vel.x, rocket.vel.y))
  audio.updateMusic()

  // Fog follows the sky so distant things melt into it
  const skyColors = world.skyMat.uniforms
  fogMix.copy(skyColors.uTop.value).lerp(skyColors.uBottom.value, 0.55)
  scene.fog.color.copy(fogMix)

  // A gentle camera drift adds depth
  camera.position.x = damp(camera.position.x, rocket.root.position.x * 0.08, 3, dt)
  camera.position.y = damp(camera.position.y, rocket.root.position.y * 0.04, 3, dt)
  camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5, 0)

  renderer.clear()
  camera.layers.set(0)
  renderer.render(scene, camera)
  sky.update(dt)
  sky.render(renderer)
  renderer.clearDepth()
  camera.layers.set(FRONT)
  renderer.render(scene, camera)
  camera.layers.set(0)
}

resize()
renderer.setAnimationLoop(frame)
renderSound()

load()
  .then(() => {
    resize()
    game.state = 'title'
    world.calm(true, { title: true })
    $('go').disabled = false
  })
  .catch((err) => {
    console.error(err)
    const go = $('go')
    go.textContent = '🔄'
    go.disabled = false
    go.onclick = () => location.reload()
  })
if (new URLSearchParams(location.search).has('debug')) window.__game = { game, sky, items, camera, ufo, catchItem, toScreen, get rocket() { return rocket }, get world() { return world } }
