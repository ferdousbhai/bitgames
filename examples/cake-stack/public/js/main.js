import { createRecipeStudio } from './recipe-studio.js'
import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { Effects } from './effects.js'
import { tween, wait, ease, updateTweens, clearTweens } from './tween.js'
import { CakeKit, FLAVOURS, STEP, STAND_TOP, START_W, MIN_W } from './cake.js'
import { AnimalKit, CUSTOMERS } from './animals.js'
import { orderFor, orderWords, animalName } from './orders.js'
import { createPartyShare } from './party-share.js'

const $ = (id) => document.getElementById(id)
const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp

// --- Renderer, scene, camera, lights --------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
const scene = new THREE.Scene()
scene.background = new THREE.Color('#ffe8ef')
scene.fog = new THREE.Fog('#ffe8ef', 30, 70)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.55
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120)
scene.add(new THREE.HemisphereLight('#fff6fb', '#f3c7a8', 1.25))
const sun = new THREE.DirectionalLight('#fff3e2', 2.1)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
sun.shadow.camera.left = -3.5
sun.shadow.camera.right = 3.5
sun.shadow.camera.top = 3.5
sun.shadow.camera.bottom = -3.5
sun.shadow.camera.near = 1
sun.shadow.camera.far = 20
sun.shadow.bias = -0.0008
sun.shadow.normalBias = 0.02
scene.add(sun, sun.target)
const SUN_OFFSET = new THREE.Vector3(-3, 7, 5)

const sound = new Sound()
const effects = new Effects(scene, camera)
const cakeKit = new CakeKit()
const animals = new AnimalKit()
const recipeStudio = createRecipeStudio({ cakeKit, openButton: $('recipe-open'), sound })

// --- Game state -----------------------------------------------------------------------------

const HOVER = 1.05 // how far above the cake the next layer slides
const COUNTER_Z = 0.9 // the counter top runs from z -0.9 to 0.9
const FLOOR_Y = -1.2

const game = {
  state: 'loading', // loading | title | intro | play | party | candles | share | card
  run: 0, // bumps whenever a game starts or ends, so stale async steps stop
  level: 1,
  streak: 0,
  firstDrop: false,
  lastFlavour: null,
  order: null, // the friend's pictured order, bottom to top: { layers, unit }, or null when stacking freely
  misses: 0, // layers in a row that were not the next one in the order
}

// Spoken words for pre-readers. They respect the game's mute.
const canSpeak = 'speechSynthesis' in window
function speak(text) {
  if (!canSpeak || sound.muted || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.85
  speechSynthesis.speak(u)
}
const hush = () => canSpeak && speechSynthesis.cancel()

// Optional learning missions: count layers as they land.
const adventure = createAdventure({
  id: 'cake-stack',
  anchor: $('play'),
  hud: $('hud'),
  isMuted: () => sound.muted,
  celebrate: (text) => celebrateMission(text),
  // A row of slices to count along with the words, so non-readers can follow it too
  renderProgress: (el, option, count) => {
    if (!option.goal) return
    el.replaceChildren()
    const row = document.createElement('span')
    row.className = 'goal-slices'
    row.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < option.target; i++) {
      const s = document.createElement('span')
      s.textContent = '🍰'
      if (i < count) s.className = 'got'
      row.append(s)
    }
    const words = document.createElement('span')
    words.className = 'goal-words'
    words.textContent = option.goal
    el.append(words, row, ` ${count} / ${option.target}`)
  },
  // The friend's order is the default; the counting missions and free stacking keep any flavour that lands.
  options: [
    { emoji: '🧁', label: "Friend's order", order: true },
    { emoji: '🐢', label: 'Gentle layer counting', pace: 0.6, goal: 'Stack 3 layers', target: 3, reward: 'Three layers make your little cake!' },
    { emoji: '🧮', label: 'Count five layers', pace: 0.65, goal: 'Stack 5 layers', target: 5, reward: 'Five layers, counted one at a time!' },
    { emoji: '🎂', label: 'Free stacking' },
  ],
})

let cake = null // { group, layers: [], candles: [] }
let mover = null // the layer sliding above the cake
let customer = null
const slivers = [] // trimmed bits of cake tumbling onto the counter
const view = { R: 1.6, custX: 2.1 }

const customerDef = (level) => {
  const def = CUSTOMERS[(level - 1) % CUSTOMERS.length]
  return { ...def, layers: level > CUSTOMERS.length ? 10 : def.layers }
}
const orderMode = () => !!game.order
/** How many layers this cake needs: the friend's order, or the friend's layer count when stacking freely. */
const targetLayers = () => (game.order ? game.order.layers.length : customerDef(game.level).layers)
const wanted = () => (game.order && cake ? game.order.layers[cake.layers.length] : null)
const unlockedFlavours = (level) => ['vanilla', ...CUSTOMERS.slice(0, Math.min(level, CUSTOMERS.length)).map((c) => c.unlock).filter(Boolean)]
const FLOOR_W = MIN_W + 0.12 // the slimmest a layer gets
const perfectWindow = (w) => Math.max(0.12, w * 0.12)
const topY = () => STAND_TOP + (cake ? cake.layers.length : 0) * STEP
const topLayer = () => (cake && cake.layers.length ? cake.layers[cake.layers.length - 1] : { x: 0, w: START_W })
// One calm, constant pace: no ramp by level or cake height, so patience and timing stay the skill.
const SLIDE_SPEED = 1.25
const speed = () => adventure.pace * SLIDE_SPEED

// --- Camera -----------------------------------------------------------------------------------

const camGoal = { x: 0, y: 1, halfW: 2.6, halfH: 2.2, pitch: 0.2 }
const camNow = { x: 0, y: 1, dist: 9, pitch: 0.2 }
const camTarget = new THREE.Vector3()
const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
const distFor = (halfW, halfH) => Math.max(halfH / tanHalf(), halfW / (tanHalf() * camera.aspect))

/** The visible half height once the width rule (wide cakes on narrow screens) is applied. */
const effHalfH = (halfW, halfH) => Math.max(halfH, halfW / camera.aspect)

/**
 * The title's birthday cake and friends fit the free band between the logo and the buttons,
 * so Play never covers the cake stand on short sideways phones, small phones or iPads.
 */
function aimTitle() {
  Object.assign(camGoal, { x: 0, y: 1.25, halfW: 2.8, halfH: 2.5, pitch: 0.16 })
  const top = document.querySelector('.title-top')
  const bottom = document.querySelector('.title-bottom')
  if ($('title').classList.contains('hidden') || !top?.offsetHeight) return
  const h = innerHeight
  const a = top.offsetTop + top.offsetHeight + 4
  const b = bottom.offsetTop - 6
  if (b - a < 60) return
  const y0 = -0.3 // the front of the doily and the friends' feet, which sit nearer the camera
  const y1 = 2.62 // the candle flames
  const halfH = Math.max(1.9, ((y1 - y0) * h) / (2 * (b - a)))
  const H = effHalfH(camGoal.halfW, halfH)
  camGoal.halfH = halfH
  camGoal.y = (y0 + y1) / 2 + (((a + b) / 2 - h / 2) / (h / 2)) * H
}

/**
 * While stacking, keep the cake stand clear of the layer dots at the bottom (short sideways
 * phones), without pushing the sliding layer up under the top buttons or the mission line.
 */
function liftForDots(y) {
  const bar = $('pips').parentElement
  if (!bar.offsetHeight) return y
  const h = innerHeight
  const H = effHalfH(camGoal.halfW, camGoal.halfH)
  const fB = (h - bar.offsetTop + 6) / h
  const goal = document.getElementById('adventure-goal')
  const goalBottom = goal && !goal.hidden && goal.offsetHeight ? goal.offsetTop + goal.offsetHeight : 0
  const fT = (Math.max(goalBottom, 0.15 * h) + 6) / h
  const baseClear = H * (1 - 2 * fB) - 0.02 // the stand's foot sits just above the dots
  const moverClear = topY() + HOVER + 0.2 - H * (1 - 2 * fT) // the sliding layer stays below the top HUD
  return Math.min(y, Math.max(moverClear, baseClear))
}

function aimCamera(snap = false) {
  if (game.state === 'title' || game.state === 'loading') {
    aimTitle()
  } else if (['party', 'candles', 'share', 'card'].includes(game.state) && cake) {
    const top = topY() + 0.6
    const cx = cake.group.position.x
    const left = cx - 1.1
    const right = customer ? customer.group.position.x + 0.7 : cx + 1.1
    Object.assign(camGoal, { x: (left + right) / 2, y: (top + -0.2) / 2 + 0.1, halfW: Math.max(2.0, (right - left) / 2 + 0.3), halfH: Math.max(1.7, (top + 0.2) / 2 + 0.45), pitch: 0.14 })
    // Room for the "Make a wish" bubble above the candles
    camGoal.halfH += 0.35
    camGoal.y += 0.3
    if (game.state === 'card' || game.state === 'share') {
      // Leave room for the party card: beside the cake on wide screens, below it on tall ones
      if (camera.aspect > 1.2) {
        camGoal.halfW *= 1.9
        camGoal.x += camGoal.halfW * 0.45
      } else {
        camGoal.halfH *= 1.4
        camGoal.y -= camGoal.halfH * 0.3
      }
    }
  } else {
    const t = topLayer()
    Object.assign(camGoal, { x: t.x * 0.4, y: topY() + 0.3, halfW: view.R + START_W / 2 + 0.25, halfH: 2.1, pitch: 0.22 })
    camGoal.y = liftForDots(camGoal.y)
  }
  const dist = distFor(camGoal.halfW, camGoal.halfH)
  if (snap) Object.assign(camNow, { x: camGoal.x, y: camGoal.y, dist, pitch: camGoal.pitch })
  return dist
}

function updateCamera(dt) {
  const dist = aimCamera()
  const k = 1 - Math.exp(-dt * 2.6)
  camNow.x = lerp(camNow.x, camGoal.x, k)
  camNow.y = lerp(camNow.y, camGoal.y, k)
  camNow.dist = lerp(camNow.dist, dist, k)
  camNow.pitch = lerp(camNow.pitch, camGoal.pitch, k)
  const sh = effects.shake * effects.shake * 0.15
  camTarget.set(camNow.x + (Math.random() - 0.5) * sh, camNow.y, 0)
  camera.position.set(camTarget.x, camTarget.y + Math.sin(camNow.pitch) * camNow.dist, Math.cos(camNow.pitch) * camNow.dist)
  camera.lookAt(camTarget)
  // The shadow box follows the action
  sun.target.position.set(camNow.x, camNow.y - 0.8, 0)
  sun.position.copy(sun.target.position).add(SUN_OFFSET)
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  // Narrow phones get a shorter slide so the cake stays big
  view.R = camera.aspect < 0.8 ? 1.15 : camera.aspect < 1.2 ? 1.4 : 1.6
  const dist = distFor(view.R + START_W / 2 + 0.25, 2.0)
  const halfWAtCustomer = (dist + 1.5) * tanHalf() * camera.aspect
  view.custX = clamp(halfWAtCustomer - 0.55, 1.25, 2.3)
  if (customer && !['party', 'candles', 'share', 'card'].includes(game.state)) customer.group.position.x = view.custX
}
addEventListener('resize', resize)
resize()

// --- Bakery -----------------------------------------------------------------------------------

function attachBakery(gltf) {
  for (const name of ['bakery', 'counter']) {
    const o = gltf.scene.getObjectByName(name)
    if (!o) continue
    o.traverse((m) => {
      if (!m.isMesh) return
      m.receiveShadow = name === 'counter'
      m.material.envMapIntensity = 0.3
    })
    scene.add(o)
  }
}

// --- Building the cake ----------------------------------------------------------------------

function newCake(x = 0) {
  const group = new THREE.Group()
  group.position.set(x, 0, 0)
  group.add(cakeKit.stand())
  scene.add(group)
  return { group, layers: [], candles: [], wobble: 0 }
}

function disposeCake(c) {
  if (!c) return
  c.group.removeFromParent()
}

function pickFlavour() {
  const list = unlockedFlavours(game.level)
  let f
  do f = list[(Math.random() * list.length) | 0]
  while (list.length > 1 && f === game.lastFlavour)
  // A brand new flavour shows up early in its first cake
  const fresh = customerDef(game.level).unlock
  if (fresh && game.level <= CUSTOMERS.length && cake.layers.length === 1 && game.lastFlavour !== fresh) f = fresh
  game.lastFlavour = f
  return f
}

/**
 * The friend's order: the wanted flavour comes along often, and never more than two other
 * layers slide past in a row, so waiting for it takes patience but never too long.
 */
function pickOrderFlavour() {
  const want = wanted()
  const others = [...new Set([...game.order.layers, ...unlockedFlavours(game.level)])].filter((f) => f !== want && f !== game.lastFlavour)
  const match = !others.length || game.misses >= 2 || Math.random() < (game.misses ? 0.55 : 0.4)
  const f = match ? want : others[(Math.random() * others.length) | 0]
  game.misses = match ? 0 : game.misses + 1
  game.lastFlavour = f
  return f
}

function addLayer(c, flavour, x, w) {
  const L = cakeKit.layer(flavour)
  L.x = x
  L.w = w
  L.sq = 0
  L.sqv = 0
  L.group.position.set(x, STAND_TOP + c.layers.length * STEP, 0)
  L.body.scale.set(w, 1, w)
  c.group.add(L.group)
  c.layers.push(L)
  return L
}

function spawnMover() {
  if (!cake) return
  const flavour = orderMode() ? pickOrderFlavour() : pickFlavour()
  const top = topLayer()
  const L = cakeKit.layer(flavour)
  L.w = top.w
  L.glow = cakeKit.glowCopy(L)
  L.side = cake.layers.length % 2 ? 1 : -1
  L.pos = L.side * view.R
  L.dir = -L.side
  L.x = top.x + L.pos
  L.appear = 0
  L.body.scale.set(L.w, 1, L.w)
  L.group.position.set(L.x, topY() + HOVER, 0)
  // A layer the order does not need yet slides past once; the wanted one waits, sliding to and fro.
  L.passing = orderMode() && flavour !== wanted()
  L.fade = 0
  cake.group.add(L.group)
  mover = L
  sound.appear()
  showMoverTag(flavour)
  // The friend perks up when the layer they are waiting for comes along
  if (orderMode() && !L.passing) customer?.hop(0.12)
}

function updateMover(dt, t) {
  if (!mover || mover.dropping) return
  const L = mover
  L.appear = Math.min(1, L.appear + dt * 4)
  L.pos += L.dir * speed() * dt
  if (L.passing && L.pos * L.dir > view.R) {
    // Past the far side: it shrinks away and the next layer comes along.
    L.fade = Math.min(1, L.fade + dt * 2.5)
    if (L.fade >= 1) {
      L.group.removeFromParent()
      mover = null
      hideMoverTag()
      const run = game.run
      setTimeout(() => run === game.run && game.state === 'play' && !mover && spawnMover(), 350)
      return
    }
  } else if (L.pos > view.R) {
    L.pos = view.R
    L.dir = -1
  } else if (L.pos < -view.R) {
    L.pos = -view.R
    L.dir = 1
  }
  const top = topLayer()
  L.x = top.x + L.pos
  const pop = ease.outBack(L.appear) * (1 - (L.fade || 0))
  L.group.position.set(L.x, topY() + HOVER + Math.sin(t * 3) * 0.04, 0)
  L.body.scale.set(L.w * pop, pop, L.w * pop)
  // Glows golden while it is lined up for a perfect drop
  const lined = !L.passing && Math.abs(L.pos) <= perfectWindow(top.w)
  // A steady warm glow, not a flicker
  const g = lined ? 0.35 : 0
  for (const m of L.glow) {
    m.emissive.set('#ffe28a')
    m.emissiveIntensity = lerp(m.emissiveIntensity, g, Math.min(1, dt * 20))
  }
}

async function drop() {
  if (game.state !== 'play' || !mover || mover.dropping || mover.appear < 0.6 || mover.fade > 0.5) return
  const run = game.run
  const L = mover
  if (L.passing) return notThisOne(L)
  L.dropping = true
  game.firstDrop = true
  game.idle = 0
  $('hint').classList.add('hidden')
  sound.whoosh()
  const y0 = L.group.position.y
  const y1 = topY()
  L.body.scale.set(L.w, 1, L.w)
  await tween(0.2, (t) => (L.group.position.y = lerp(y0, y1, ease.inCubic(t))))
  if (run !== game.run) return
  land(L)
}

/**
 * A layer the order does not need yet: it bounces softly on the cake and floats back up to slide
 * on. Nothing is lost; the friend says which flavour comes next.
 */
async function notThisOne(L) {
  const run = game.run
  L.dropping = true
  game.firstDrop = true
  game.idle = 0
  $('hint').classList.add('hidden')
  const want = wanted()
  speak(`That one is ${L.flavour}. Let's wait for ${want}!`)
  askPip()
  sound.whoosh()
  const y0 = L.group.position.y
  const y1 = topY() + 0.08
  await tween(0.2, (t) => (L.group.position.y = lerp(y0, y1, ease.inCubic(t))))
  if (run !== game.run || mover !== L) return
  sound.wobble()
  customer?.hop(0.1)
  await tween(0.55, (t) => {
    L.group.position.y = lerp(y1, topY() + HOVER, ease.outCubic(t))
    const s = 0.82 + 0.18 * ease.outBack(t)
    L.body.scale.set(L.w * (1 + (1 - s) * 0.6), s, L.w * (1 + (1 - s) * 0.6))
  })
  if (run !== game.run || mover !== L) return
  L.dropping = false
}

function land(L) {
  const run = game.run
  const top = topLayer()
  const dx = L.x - top.x
  const ad = Math.abs(dx)
  const dir = Math.sign(dx) || 1
  let kind
  let newX = top.x
  let newW = top.w
  let grew = false
  if (ad <= perfectWindow(top.w)) {
    kind = 'perfect'
    game.streak++
    if (game.streak >= 3 && top.w < START_W - 0.01) {
      newW = Math.min(START_W, top.w + 0.1)
      grew = true
    }
  } else {
    game.streak = 0
    const forgive = cake.layers.length === 0 ? 0.3 : 0.35
    const loss = Math.min(ad * forgive, top.w * 0.18)
    // Layers stop shrinking at a slim floor, so even a child who taps as fast as possible
    // always stacks every layer the birthday friend asked for.
    newW = Math.max(Math.min(top.w, FLOOR_W), top.w - loss)
    newX = top.x + (dir * (top.w - newW)) / 2
    kind = ad < top.w * 0.3 ? 'good' : 'squish'
  }
  mover = null
  hideMoverTag()
  L.group.removeFromParent()
  cakeKit.unglow(L)
  const layer = addLayer(cake, L.flavour, L.x, top.w)
  adventure.event(layer)
  layer.sq = 0.28
  sound.plop(cake.layers.length)
  const y = STAND_TOP + (cake.layers.length - 1) * STEP
  const at = new THREE.Vector3(newX + cake.group.position.x, y + STEP, 0.4)
  const icing = FLAVOURS[L.flavour].icing
  // Slide and squish into place
  const fromX = L.x
  const fromW = top.w
  tween(0.24, (t) => {
    const e = ease.outCubic(t)
    layer.x = lerp(fromX, newX, e)
    layer.w = lerp(fromW, newW, e)
  })
  if (kind === 'perfect') {
    // The soft golden ring and one chime say "lined up"; no score, streak or praise banner.
    sound.perfect()
    effects.perfect(new THREE.Vector3(newX + cake.group.position.x, y + 0.05, 0), newW)
    customer?.cheer(0.8)
    if (grew) {
      sound.grow()
      setTimeout(() => effects.label('↔️', at, '#ff6fae', true), 250)
    }
  } else {
    // The overhang squishes off with a splat of icing, and a little piece tumbles onto the counter
    const edge = new THREE.Vector3(fromX + dir * (fromW / 2) + cake.group.position.x, y + 0.18, 0.1)
    effects.splat(edge, icing, dir, kind === 'squish' ? 18 : 10)
    sound.splat()
    if (ad > 0.08) sliver(L.flavour, fromX + dir * (fromW / 2 - Math.min(0.2, ad) / 2), y, Math.min(0.32, ad * 0.9), dir)
    cake.wobble = Math.max(cake.wobble, kind === 'squish' ? 0.14 : 0.07)
    if (kind === 'squish') {
      sound.wobble()
      customer?.surprised()
    } else {
      sound.good()
      customer?.hop(0.15)
    }
  }
  updateHud()

  const n = cake.layers.length
  const target = targetLayers()
  // Each layer of the order is named as it lands, so the sequence is heard as well as seen.
  if (orderMode() && n < target) speak(L.flavour)
  if (n >= target) {
    setTimeout(() => run === game.run && finishCake('done'), 450)
    return
  }
  if (n >= 3 && !orderMode()) $('done').classList.remove('hidden')
  if (n % 3 === 0) setTimeout(() => run === game.run && decorateSide(layer, n / 3 - 1), 300)
  // A finished mission gets its moment: the next layer waits until the ribbon has gone, so it never slides hidden behind it.
  setTimeout(() => {
    if (run === game.run && game.state === 'play' && !mover) spawnMover()
  }, Math.max(320, missionUntil - performance.now() - 200))
}

/** A trimmed piece of cake that flies off and plops onto the counter. */
function sliver(flavour, x, y, w, dir) {
  const L = cakeKit.layer(flavour)
  L.body.scale.set(w, 0.9, w)
  L.group.position.set(x + cake.group.position.x, y, 0)
  scene.add(L.group)
  slivers.push({ obj: L.group, v: new THREE.Vector3(dir * (1.4 + Math.random()), 1.6, 0.5 + Math.random() * 0.6), spin: dir * -(3 + Math.random() * 3), age: 0, landed: false })
}

function updateSlivers(dt) {
  for (let i = slivers.length - 1; i >= 0; i--) {
    const s = slivers[i]
    s.age += dt
    const o = s.obj
    if (!s.landed) {
      s.v.y -= 9.8 * dt
      o.position.addScaledVector(s.v, dt)
      o.rotation.z += s.spin * dt
      const onCounter = Math.abs(o.position.z) < COUNTER_Z && Math.abs(o.position.x) < 6
      const floor = onCounter ? 0 : FLOOR_Y
      if (o.position.y <= floor && s.v.y < 0) {
        o.position.y = floor
        s.landed = true
        s.age = 0
        o.rotation.z = 0
        o.scale.set(1.3, 0.6, 1.3)
        sound.blob()
      }
    } else {
      o.scale.y = lerp(o.scale.y, 0.8, dt * 8)
      if (s.age > 1.6) o.scale.multiplyScalar(Math.max(0, 1 - dt * 5))
      if (s.age > 2.4) {
        o.removeFromParent()
        slivers.splice(i, 1)
      }
    }
  }
}

function clearSlivers() {
  for (const s of slivers) s.obj.removeFromParent()
  slivers.length = 0
}

/** Jelly wobble and landing squish for every layer. */
function updateCake(dt, t) {
  if (!cake) return
  cake.wobble *= Math.exp(-dt * 2.2)
  const n = cake.layers.length
  cake.layers.forEach((L, i) => {
    // squish spring
    L.sqv += (-L.sq * 240 - L.sqv * 14) * dt
    L.sq += L.sqv * dt
    const sway = cake.wobble * Math.sin(t * 11 - i * 0.35) * ((i + 1) / Math.max(n, 1)) ** 1.3
    L.group.position.x = L.x + sway
    L.group.rotation.z = -sway * 0.5
    const s = 1 + L.sq * 0.5
    L.body.scale.set(L.w * s, 1 - L.sq, L.w * s)
  })
  for (const c of cake.candles) {
    if (!c.flame) continue
    const target = c.lit ? 1 + Math.sin(t * 23 + c.seed) * 0.12 + Math.sin(t * 37 + c.seed * 2) * 0.06 : 0
    c.flameScale = lerp(c.flameScale ?? 0, target, Math.min(1, dt * (c.lit ? 10 : 18)))
    c.flame.scale.set(c.flameScale, c.flameScale * (1 + (c.lit ? Math.sin(t * 17 + c.seed) * 0.1 : 0)), c.flameScale)
    c.flame.visible = c.flameScale > 0.02
  }
}

const SIDE_DECOR = [
  { name: 'topper_strawberry', tilt: 1.25, n: 8 },
  { name: 'topper_heart', tilt: 0, n: 8 },
  { name: 'topper_cherry', tilt: 1.15, n: 9 },
  { name: 'topper_star', tilt: 0, n: 8 },
]

/** Every third layer gets decorations stuck around its side. */
async function decorateSide(L, k) {
  const run = game.run
  const d = SIDE_DECOR[k % SIDE_DECOR.length]
  const items = []
  for (let i = 0; i < d.n; i++) {
    const pivot = new THREE.Group()
    pivot.rotation.y = (i / d.n) * Math.PI * 2 + 0.2
    const o = cakeKit.topper(d.name)
    o.position.set(0, d.tilt ? 0.13 : 0.06, L.w / 2 - (d.tilt ? 0.02 : 0.005))
    o.rotation.x = d.tilt
    o.scale.setScalar(0.001)
    pivot.add(o)
    L.decor.add(pivot)
    items.push(o)
  }
  const front = items.map((o, i) => ({ o, i })).sort((a, b) => Math.cos(a.o.parent.rotation.y) - Math.cos(b.o.parent.rotation.y))
  front.reverse()
  for (let j = 0; j < front.length; j++) {
    const { o } = front[j]
    sound.pop(0, j)
    tween(0.3, (t) => o.scale.setScalar(Math.max(0.001, ease.outBack(t))))
    await wait(0.06)
    if (run !== game.run) return
  }
  const p = new THREE.Vector3()
  L.group.getWorldPosition(p)
  p.y += 0.15
  p.z += L.w / 2
  effects.sparkleAt(p, '#fff3a0', 8)
}

// --- The birthday party ------------------------------------------------------------------------

async function topDecorations(run) {
  const L = topLayer()
  const y = topY() + 0.003
  const deco = new THREE.Group()
  deco.position.set(L.x, y, 0)
  cake.group.add(deco)
  cake.deco = deco
  cake.decoLayer = cake.layers[cake.layers.length - 1]
  const pops = []
  const sprinkles = cakeKit.topper('topper_sprinkles')
  sprinkles.userData.s = L.w * 0.82
  pops.push(sprinkles)
  const nd = Math.max(5, Math.round(L.w * 9))
  for (let i = 0; i < nd; i++) {
    const a = (i / nd) * Math.PI * 2
    const o = cakeKit.topper('topper_cream')
    o.position.set(Math.cos(a) * L.w * 0.42, 0, Math.sin(a) * L.w * 0.42)
    o.rotation.y = a
    o.userData.s = clamp(L.w * 0.9, 0.6, 1.1)
    pops.push(o)
  }
  const nc = 3 + ((game.level - 1) % 5)
  const cols = ['#7bc8ff', '#ff8fab', '#ffd23f', '#8ce99a', '#b197fc', '#ffb347', '#4fd1c5']
  cake.candles = []
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * Math.PI * 2 + Math.PI / 2
    const o = cakeKit.topper('topper_candle', cols[i % cols.length])
    const r = L.w * (L.w > 0.75 ? 0.28 : 0.22)
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    o.userData.s = 1
    const flame = o.getObjectByName('candle_flame')
    if (flame) flame.scale.setScalar(0.001)
    cake.candles.push({ obj: o, flame, lit: false, seed: Math.random() * 10 })
    pops.push(o)
  }
  if (L.w > 0.72) {
    const fig = animals.make(customerDef(game.level), { hat: false })
    fig.group.userData.s = 0.26
    fig.group.position.set(0, 0, -0.02)
    fig.group.userData.figure = fig
    cake.figure = fig
    pops.push(fig.group)
  }
  for (let i = 0; i < pops.length; i++) {
    const o = pops[i]
    const s = o.userData.s
    o.scale.setScalar(0.001)
    deco.add(o)
    sound.pop(0, i % 12)
    tween(0.32, (t) => o.scale.setScalar(Math.max(0.001, s * ease.outBack(t))))
    await wait(i === 0 ? 0.25 : 0.07)
    if (run !== game.run) return false
  }
  return true
}

async function finishCake(reason) {
  if (!cake || !['play', 'intro'].includes(game.state)) return
  const run = game.run
  game.state = 'party'
  $('hud').classList.add('partying')
  $('done').classList.add('hidden')
  $('hint').classList.add('hidden')
  $('pips').classList.add('full')
  if (mover && !mover.dropping) {
    const m = mover
    mover = null
    tween(0.25, (t) => m.body.scale.setScalar(Math.max(0.001, 1 - t) * m.w)).then(() => m.group.removeFromParent())
  }
  if (cake.layers.length === 0) {
    // Nothing stacked yet: one free vanilla layer so there is always a cake to celebrate
    addLayer(cake, 'vanilla', 0, START_W).sq = 0.3
    sound.plop()
  }
  showIntro('🎂', reason === 'narrow' ? 'What a tall cake!' : 'The cake is ready!', customer?.def.emoji ?? '🎂')
  sound.fanfare()
  hideMoverTag()
  // Name what the child built: the order followed layer by layer, or the pattern finished.
  if (game.order && customer && cake.layers.length === game.order.layers.length) {
    const words = orderWords(game.order.layers)
    speak(game.order.unit ? `You finished the pattern! ${words}.` : `${words}. Just like ${animalName(customer.def.animal)}'s order!`)
  }
  await wait(0.5)
  if (run !== game.run) return
  if (!(await topDecorations(run))) return
  await wait(0.3)
  if (run !== game.run) return

  // The birthday friend hops onto the counter beside the cake
  const L = topLayer()
  const maxW = Math.max(...cake.layers.map((l) => l.w))
  const c = customer
  const from = c.group.position.clone()
  const to = new THREE.Vector3(cake.group.position.x + Math.max(maxW, L.w) / 2 + 0.75, 0, 0.25)
  const s0 = c.group.scale.x
  sound.voice(c.def.animal)
  c.group.rotation.y = 0
  await tween(0.7, (t) => {
    c.group.position.lerpVectors(from, to, t)
    c.group.position.y = lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * 1.6
    c.group.scale.setScalar(lerp(s0, 1.35, t))
  })
  if (run !== game.run) return
  sound.plop()
  c.hop(0.2)
  c.group.rotation.y = -0.35
  await wait(0.4)
  if (run !== game.run) return

  // Light the candles one by one
  for (const cd of cake.candles) {
    cd.lit = true
    sound.match()
    await wait(0.18)
    if (run !== game.run) return
  }
  game.state = 'candles'
  showIntro('🕯️', 'Make a wish!', '👆 Tap to blow!', true)
  // The friend waits for the child to blow: no timer takes the wish away.
  showHintAt(candleCenter())
}

function candleCenter() {
  const p = new THREE.Vector3()
  if (cake?.deco) cake.deco.getWorldPosition(p)
  p.y += 0.3
  return p
}

async function blowCandles() {
  if (game.state !== 'candles') return
  const run = game.run
  game.state = 'party'
  hideIntro()
  $('hint').classList.add('hidden')
  const c = customer
  const target = candleCenter()
  // Jump up to candle height, take a big breath and blow
  const base = c.group.position.clone()
  // A hop up toward tall cakes; the puff of breath carries the rest of the way.
  const peak = clamp(target.y - 1.0, 0, 0.7)
  c.hop(0)
  await tween(0.45, (t) => {
    c.group.position.y = base.y + peak * ease.outCubic(t)
    c.blow = t * 0.4
  })
  if (run !== game.run) return
  sound.blow()
  const mouth = c.mouthWorld
  for (let k = 0; k < 3; k++) setTimeout(() => run === game.run && effects.breath(c.mouthWorld, candleCenter()), k * 120)
  tween(0.3, (t) => (c.blow = 0.4 + t * 0.6))
  const order = [...cake.candles].sort((a, b) => b.obj.getWorldPosition(new THREE.Vector3()).distanceTo(mouth) - a.obj.getWorldPosition(new THREE.Vector3()).distanceTo(mouth)).reverse()
  await wait(0.25)
  for (let i = 0; i < order.length; i++) {
    const cd = order[i]
    cd.lit = false
    const p = new THREE.Vector3()
    cd.obj.getWorldPosition(p)
    p.y += 0.35
    effects.smoke(p)
    sound.puffOut(i)
    await wait(0.09)
    if (run !== game.run) return
  }
  await tween(0.45, (t) => {
    c.group.position.y = base.y + peak * (1 - ease.inCubic(t))
    c.blow = 1 - t
  })
  if (run !== game.run) return
  c.blow = 0
  sound.plop()

  // One soft moment: a few slow paper petals drift down while the music box plays Happy Birthday.
  const cx = cake.group.position.x
  effects.drift(2.2, topY() + 1.1, 28, cx)
  const tune = sound.birthday()
  c.cheer(Math.max(3, tune))
  c.group.rotation.y = 0
  if (cake.figure) cake.figure.cheer(3)
  banner('Happy Birthday!', 'gold')
  await wait(2.4)
  if (run !== game.run) return
  startShare()
}

// --- Sharing the cake --------------------------------------------------------------------------

const PLATES = ['#bedacc', '#bed4ed', '#e6caea', '#ffe3b8']
const share = createPartyShare({
  root: $('share'),
  speak,
  sound,
  onDone: (result) => {
    if (game.state !== 'share') return
    game.shared = result
    share.hide()
    showCard()
  },
})

/** Who came to the party: the birthday friend and one, two or three friends from earlier cakes. */
function partyGuests() {
  const n = 2 + ((game.level - 1) % 3)
  const host = customerDef(game.level)
  const list = [host]
  for (let k = 1; list.length < n; k++) {
    const f = CUSTOMERS[(game.level - 1 + k) % CUSTOMERS.length]
    if (f.animal !== host.animal) list.push(f)
  }
  return list.map((f, i) => ({ emoji: f.emoji, name: animalName(f.animal), plate: PLATES[i] }))
}

function startShare() {
  game.state = 'share'
  game.shared = null
  $('hud').classList.add('carding')
  share.start(partyGuests(), cake.layers.map((l) => FLAVOURS[l.flavour]))
}

function showCard() {
  game.state = 'card'
  const def = customerDef(game.level)
  const next = customerDef(game.level + 1)
  $('card-emoji').textContent = `${def.emoji}🎂`
  // The card shows the cake the child made: its layers from the bottom up, and how many there are.
  const made = cake ? cake.layers.map((l) => FLAVOURS[l.flavour].emoji) : []
  $('card-cake').textContent = made.join('')
  $('card-count').textContent = String(made.length)
  // ...and how it was shared: every friend's plate with the same number of slices.
  const shared = game.shared
  $('card-share').textContent = shared ? shared.guests.map((g) => `${g.emoji}${'🍰'.repeat(shared.each)}`).join('  ') : ''
  $('card-share').setAttribute('aria-label', shared ? `${shared.guests.length} friends, ${shared.each} slices each` : '')
  const fresh = next.unlock && game.level + 1 <= CUSTOMERS.length ? ` ${FLAVOURS[next.unlock].emoji}` : ''
  $('card-next').textContent = `➡️ ${next.emoji}${fresh}`
  $('card').classList.remove('hidden')
  $('hud').classList.add('carding')
}

/** Deliver the finished cake (it slides away with its friend) and bring in the next one. */
async function nextCake() {
  if (game.state !== 'card') return
  const run = game.run
  sound.click()
  $('card').classList.add('hidden')
  $('hud').classList.remove('carding')
  game.state = 'intro'
  const old = cake
  const oldC = customer
  const x0 = old.group.position.x
  const cx0 = oldC.group.position.x
  oldC.cheer(1.2)
  await tween(1.0, (t) => {
    const e = ease.inCubic(t)
    old.group.position.x = x0 + e * 9
    oldC.group.position.x = cx0 + e * 9
  })
  if (run !== game.run) return
  disposeCake(old)
  oldC.group.removeFromParent()
  game.level += 1
  startLevel(run)
}

async function startLevel(run) {
  game.state = 'intro'
  $('hud').classList.remove('partying')
  game.streak = 0
  cake = newCake(-9)
  const def = customerDef(game.level)
  game.order = adventure.option.order ? orderFor(game.level) : null
  game.misses = 0
  game.lastFlavour = null
  customer = animals.make(def)
  customer.group.scale.setScalar(1.85)
  customer.group.position.set(view.custX, FLOOR_Y - 1.9, -1.5)
  scene.add(customer.group)
  buildPips(targetLayers())
  updateHud()
  // The new cake stand slides in and the birthday friend pops up behind the counter
  const c = cake
  tween(0.7, (t) => (c.group.position.x = -9 * (1 - ease.outCubic(t))))
  await wait(0.35)
  if (run !== game.run) return
  sound.voice(def.animal)
  tween(0.5, (t) => (customer.group.position.y = FLOOR_Y - 1.9 * (1 - ease.outBack(t))))
  const fresh = def.unlock && game.level <= CUSTOMERS.length ? FLAVOURS[def.unlock].emoji : ''
  if (game.order) {
    // The order is a picture, bottom to top, and it is spoken so a child who cannot read can follow it.
    const pics = game.order.layers.map((f) => FLAVOURS[f].emoji).join('')
    showIntro(`${def.emoji}🎂`, pics, game.order.unit ? '🔁' : fresh ? `✨ ${fresh}` : '🎈🎈🎈')
    sayOrder()
    await wait(2.4)
  } else {
    showIntro(`${def.emoji}🎂`, `${def.layers} layers!`, fresh ? `New flavour ${fresh}` : '🎈🎈🎈')
    await wait(1.6)
  }
  if (run !== game.run) return
  game.state = 'play'
  game.idle = 0
  spawnMover()
  if (!game.firstDrop) setTimeout(() => run === game.run && !game.firstDrop && game.state === 'play' && showHintAt(null), 900)
}

// --- Title screen ------------------------------------------------------------------------------

let demo = null

function buildDemo() {
  clearDemo()
  const c = newCake(0)
  const flavours = ['vanilla', 'strawberry', 'chocolate', 'mint', 'lemon', 'blueberry']
  const widths = [1.3, 1.24, 1.2, 1.12, 1.04, 0.98]
  flavours.forEach((f, i) => addLayer(c, f, Math.sin(i * 2.1) * 0.02, widths[i]))
  const prevCake = cake
  cake = c
  // Decorate it like a finished cake
  const L = topLayer()
  const deco = new THREE.Group()
  deco.position.set(L.x, topY() + 0.003, 0)
  c.group.add(deco)
  const sp = cakeKit.topper('topper_sprinkles')
  sp.scale.setScalar(L.w * 0.82)
  deco.add(sp)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const o = cakeKit.topper('topper_cream')
    o.position.set(Math.cos(a) * L.w * 0.42, 0, Math.sin(a) * L.w * 0.42)
    deco.add(o)
  }
  const cols = ['#7bc8ff', '#ff8fab', '#ffd23f', '#8ce99a', '#b197fc']
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2
    const o = cakeKit.topper('topper_candle', cols[i])
    o.position.set(Math.cos(a) * L.w * 0.28, 0, Math.sin(a) * L.w * 0.28)
    deco.add(o)
    c.candles.push({ obj: o, flame: o.getObjectByName('candle_flame'), lit: true, seed: i * 3 })
  }
  const heart = []
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group()
    pivot.rotation.y = (i / 8) * Math.PI * 2 + 0.2
    const o = cakeKit.topper(i % 2 ? 'topper_heart' : 'topper_strawberry')
    o.position.set(0, i % 2 ? 0.06 : 0.13, c.layers[2].w / 2 - 0.02)
    o.rotation.x = i % 2 ? 0 : 1.25
    pivot.add(o)
    c.layers[2].decor.add(pivot)
    heart.push(o)
  }
  cake = prevCake
  const friends = [animals.make(CUSTOMERS[0]), animals.make(CUSTOMERS[1])]
  friends[0].group.position.set(1.55, 0, 0.25)
  friends[0].group.rotation.y = -0.35
  friends[1].group.position.set(-1.55, 0, 0.25)
  friends[1].group.rotation.y = 0.35
  for (const f of friends) {
    f.group.scale.setScalar(1.3)
    scene.add(f.group)
  }
  demo = { cake: c, friends, cheerIn: 2 }
}

function clearDemo() {
  if (!demo) return
  disposeCake(demo.cake)
  for (const f of demo.friends) f.group.removeFromParent()
  demo = null
}

function updateDemo(dt, t) {
  if (!demo) return
  const saved = cake
  cake = demo.cake
  updateCake(dt, t)
  cake = saved
  const focus = new THREE.Vector3(0, 2.2, 0)
  for (const f of demo.friends) f.update(dt, t, focus)
  demo.cheerIn -= dt
  if (demo.cheerIn <= 0) {
    demo.cheerIn = 2.5 + Math.random() * 2
    demo.friends[(Math.random() * 2) | 0].cheer(0.8)
  }
}

// --- HUD & screens -----------------------------------------------------------------------------

function buildPips(n) {
  const el = $('pips')
  el.classList.remove('full')
  el.classList.toggle('order', orderMode())
  el.innerHTML = ''
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span')
    p.className = 'pip'
    p.textContent = String(i + 1)
    p.setAttribute('aria-label', `Layer ${i + 1}`)
    if (game.order) {
      // The friend's order is drawn on the dots: each dot shows its flavour, bottom layer first.
      const f = FLAVOURS[game.order.layers[i]]
      p.classList.add('want')
      p.textContent = f.emoji
      p.style.setProperty('--want', f.rainbow ? '#ffe3ef' : f.icing)
      p.style.setProperty('--want-rim', f.sponge)
      p.setAttribute('aria-label', `Layer ${i + 1}: ${game.order.layers[i]}`)
      // Patterns are grouped by their repeating unit, so the repeat is easy to see.
      if (game.order.unit && i > 0 && i % game.order.unit === 0) p.classList.add('unit')
    }
    el.appendChild(p)
  }
  const goal = document.createElement('span')
  goal.className = 'pip-goal'
  goal.textContent = customerDef(game.level).emoji
  el.appendChild(goal)
}

function updateHud() {
  const pips = $('pips').querySelectorAll('.pip')
  const layers = cake ? cake.layers : []
  pips.forEach((p, i) => {
    const on = i < layers.length
    p.classList.toggle('on', on)
    if (game.order) {
      p.classList.toggle('next', i === layers.length && game.state !== 'party')
      return
    }
    const f = on ? FLAVOURS[layers[i].flavour] : null
    p.style.background = f ? (f.rainbow ? 'conic-gradient(#ff6b6b, #ffe066, #69db7c, #74c0fc, #b197fc, #ff6b6b)' : f.icing) : ''
    // The sponge colour rings each landed layer, so pale icings (vanilla) still read as filled
    p.style.borderColor = f ? f.sponge : ''
    // Dark icing (chocolate) gets a white number so it can still be counted
    p.style.color = f && !f.rainbow && new THREE.Color(f.icing).getHSL({}).l < 0.35 ? '#fff' : ''
  })
}

/** Say the friend's order aloud, from the bottom layer to the top. */
function sayOrder() {
  if (!game.order || !customer) return
  const words = orderWords(game.order.layers)
  speak(game.order.unit ? `${animalName(customer.def.animal)} wants a pattern! ${words}.` : `${animalName(customer.def.animal)} wants ${words}!`)
}

/** Point at the next dot of the order for a moment, after a layer it did not need yet. */
let askTimer = 0
function askPip() {
  const p = $('pips').querySelector('.pip.next')
  if (!p) return
  p.classList.add('ask')
  clearTimeout(askTimer)
  askTimer = setTimeout(() => p.classList.remove('ask'), 1600)
}

// The sliding layer carries its flavour picture, so it can be matched to the order's dots.
const moverTag = $('mover-tag')
function showMoverTag(flavour) {
  if (!orderMode()) return
  moverTag.textContent = FLAVOURS[flavour].emoji
  moverTag.classList.remove('hidden')
}
function hideMoverTag() {
  moverTag.classList.add('hidden')
}
const tagSpot = new THREE.Vector3()
function updateMoverTag() {
  if (moverTag.classList.contains('hidden')) return
  if (!mover || !cake || game.state !== 'play') return hideMoverTag()
  mover.group.getWorldPosition(tagSpot)
  tagSpot.y += 0.32
  const v = tagSpot.project(camera)
  const x = ((v.x + 1) / 2) * innerWidth
  const y = ((1 - v.y) / 2) * innerHeight
  const s = Math.max(0.001, mover.appear * (1 - (mover.fade || 0)))
  moverTag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${Math.min(1, s)})`
}

let bannerTimer = 0
let missionUntil = 0
function banner(text, kind = '') {
  const mission = kind.includes('mission')
  // A finished mission keeps the stage for a moment: 'Yummy!' and 'Perfect!' wait their turn.
  if (!mission && performance.now() < missionUntil) return
  const el = $('banner')
  el.textContent = text
  el.className = `banner show ${kind}`
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => (el.className = 'banner'), mission ? 2600 : 1100)
}

/** The counting mission is done: a big wrapped banner, a cheer and a little confetti. */
function celebrateMission(text) {
  banner(`🎉 ${text}`, 'gold mission')
  missionUntil = performance.now() + 2600
  sound.grow()
  if (cake) effects.drift(1.6, topY() + 1, 14, cake.group.position.x)
  customer?.cheer(1.5)
}

let introTimer = 0
function showIntro(emoji, title, sub, stay = false) {
  $('intro-emoji').textContent = emoji
  $('intro-title').textContent = title
  $('intro-sub').textContent = sub
  const el = $('intro')
  el.className = 'intro'
  void el.offsetWidth
  el.classList.add(stay ? 'stay' : 'show')
  clearTimeout(introTimer)
  if (!stay) introTimer = setTimeout(() => (el.className = 'intro'), 2000)
}
function hideIntro() {
  $('intro').className = 'intro'
}

const hintAt = { pos: null }
const hintSpot = new THREE.Vector3()
function showHintAt(pos) {
  hintAt.pos = pos
  $('hint').classList.remove('hidden')
}
/** A child who stops tapping gets the finger again, pointing just under the sliding layer. */
function updateIdle(dt) {
  if (game.state !== 'play' || !mover || mover.dropping) return
  game.idle = (game.idle || 0) + dt
  // A quiet reminder only after a long pause; a child who is simply watching is left to watch.
  if (game.idle > 30 && $('hint').classList.contains('hidden')) showHintAt(null)
}

function updateHint() {
  const el = $('hint')
  if (el.classList.contains('hidden')) return
  // The tap hint points at the top of the cake, where the sliding layer will land
  const pos = hintAt.pos || (cake && game.state === 'play' ? hintSpot.set(cake.group.position.x + topLayer().x, topY(), 0) : null)
  let x = innerWidth / 2
  let y = innerHeight * 0.62
  if (pos) {
    const v = pos.clone().project(camera)
    x = ((v.x + 1) / 2) * innerWidth
    y = ((1 - v.y) / 2) * innerHeight + (hintAt.pos ? 20 : 2)
  }
  // ...and stays clear of the layer dots, even on very short sideways phones
  const bar = $('pips').parentElement
  if (game.state === 'play' && bar.offsetHeight) y = Math.min(y, bar.offsetTop - el.offsetHeight - 22)
  el.style.transform = `translate(${x}px, ${y}px)`
}

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('title').classList.toggle('hidden', screen !== 'title')
  $('hud').classList.toggle('hidden', screen !== 'play')
  if (screen !== 'play') $('card').classList.add('hidden')
}

function endRun() {
  game.run++
  missionUntil = 0
  $('hud').classList.remove('partying', 'carding')
  clearTweens()
  disposeCake(cake)
  cake = null
  mover = null
  customer?.group.removeFromParent()
  customer = null
  clearSlivers()
  share.hide()
  hideMoverTag()
  hush()
  game.order = null
  hideIntro()
  $('hint').classList.add('hidden')
  $('done').classList.add('hidden')
}

function toTitle() {
  endRun()
  game.state = 'title'
  buildDemo()
  show('title')
  aimCamera(true)
}

function start() {
  adventure.begin()
  sound.unlock()
  sound.click()
  endRun()
  clearDemo()
  const debugLevel = Number(new URLSearchParams(location.search).get('level')) || 1
  Object.assign(game, { level: debugLevel, streak: 0, lastFlavour: null })
  show('play')
  startLevel(game.run)
}

$('play').addEventListener('click', start)
$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  sound.click()
  toTitle()
})
$('card-home').addEventListener('click', () => {
  sound.click()
  toTitle()
})
$('next').addEventListener('click', nextCake)
$('done').addEventListener('click', (e) => {
  e.stopPropagation()
  if (game.state !== 'play' || (mover && mover.dropping)) return
  sound.click()
  finishCake('done')
})
const soundBtn = $('sound')
function setSound(on) {
  sound.setMuted(!on)
  soundBtn.textContent = on ? '🔊' : '🔇'
  try {
    localStorage.setItem('cake-stack-sound', on ? '1' : '0')
  } catch {}
}
try {
  if (localStorage.getItem('cake-stack-sound') === '0') setSound(false)
} catch {}
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  sound.unlock()
  setSound(sound.muted)
  sound.click()
})
const musicBtn = $('music')
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  sound.unlock()
  sound.musicOn = !sound.musicOn
  musicBtn.classList.toggle('off', !sound.musicOn)
  sound.click()
})

// --- Input ---------------------------------------------------------------------------------------

function tap() {
  sound.unlock()
  if (game.state === 'play') drop()
  else if (game.state === 'candles') blowCandles()
  else if (game.state === 'title' && demo) {
    demo.friends[(Math.random() * 2) | 0].cheer(0.8)
    sound.voice(Math.random() < 0.5 ? 'bear' : 'bunny')
  }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  tap()
})
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => { if (!recipeStudio.open) e.preventDefault() }, { passive: false })

addEventListener('keydown', (e) => {
  sound.unlock()
  if (e.repeat) return
  if (e.key === 'Escape' && game.state !== 'title' && game.state !== 'loading') return toTitle()
  if (e.key === ' ' || e.key === 'Enter') {
    // A focused plate button handles its own key; otherwise the next waiting friend gets a slice.
    if (game.state === 'share' && document.activeElement?.classList.contains('share-plate')) return
    e.preventDefault()
    if (game.state === 'title') return start()
    if (game.state === 'card') return nextCake()
    if (game.state === 'share') return share.giveNext()
    tap()
  }
  if (game.state === 'share' && /^[1-4]$/.test(e.key)) share.give(Number(e.key) - 1)
})
// Tapping the order's dots says the order again.
$('pips').parentElement.addEventListener('click', (e) => {
  e.stopPropagation()
  if (game.order && game.state === 'play') sayOrder()
})

// --- Loading ---------------------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  let done = 0
  const step = () => ($('loading-text').textContent = `Warming up the oven… ${++done}/3`)
  const [c, a, b] = await Promise.allSettled([
    loader.loadAsync('./models/cake.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/animals.glb').then((g) => (step(), g)),
    loader.loadAsync('./models/bakery.glb').then((g) => (step(), g)),
  ])
  if (c.status === 'fulfilled') cakeKit.attach(c.value)
  else console.warn('cake.glb failed', c.reason)
  if (a.status === 'fulfilled') animals.attach(a.value)
  else console.warn('animals.glb failed', a.reason)
  if (b.status === 'fulfilled') attachBakery(b.value)
  else console.warn('bakery.glb failed', b.reason)
  game.state = 'title'
  buildDemo()
  aimCamera(true)
  // Upload everything now so the first drop doesn't stutter
  renderer.compile(scene, camera)
  show('title')
}

// --- Loop ----------------------------------------------------------------------------------------------

const timer = new THREE.Timer()
timer.connect(document)
const focus = new THREE.Vector3()

let simTime = 0
function frame(dt) {
  if (recipeStudio.open) return
  simTime += dt
  const t = simTime
  updateTweens(dt)
  updateMover(dt, t)
  updateCake(dt, t)
  updateDemo(dt, t)
  updateSlivers(dt)
  if (customer) {
    if (mover) focus.set(mover.group.position.x + (cake?.group.position.x ?? 0), mover.group.position.y, 0)
    else if (cake) focus.set(cake.group.position.x, topY(), 0)
    customer.update(dt, t, focus)
  }
  if (cake?.figure) cake.figure.update(dt, t, camera.position)
  updateCamera(dt)
  effects.update(dt)
  updateIdle(dt)
  updateHint()
  updateMoverTag()
  sound.updateMusic(game.state !== 'loading')
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(() => {
  timer.update()
  frame(Math.min(timer.getDelta(), 1 / 20))
})

show('loading')
load()

// ?debug exposes the game for testing in the console
if (new URLSearchParams(location.search).has('debug')) {
  window.cakeStack = { game, frame, get cake() { return cake }, get mover() { return mover }, get customer() { return customer }, camera, scene, recipeStudio, share, drop, startShare }
  window.__adventure = { mission: adventure, game }
}
// Background test tabs get no animation frames, so keep time moving there too.
if (new URLSearchParams(location.search).has('debug')) {
  let last = performance.now()
  setInterval(() => {
    const now = performance.now()
    let left = Math.min((now - last) / 1000, 2)
    last = now
    if (!document.hidden) return
    while (left > 0) {
      frame(Math.min(left, 1 / 30))
      left -= 1 / 30
    }
  }, 33)
}
