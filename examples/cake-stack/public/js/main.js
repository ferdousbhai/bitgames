import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { Effects } from './effects.js'
import { tween, wait, ease, updateTweens, clearTweens } from './tween.js'
import { CakeKit, FLAVOURS, STEP, STAND_TOP, START_W, MIN_W } from './cake.js'
import { AnimalKit, CUSTOMERS, REMIX } from './animals.js'

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

// --- Game state -----------------------------------------------------------------------------

// How far above the cake the next layer slides: close enough to judge where it will land (lower on wide screens,
// where a high layer would float in front of the back-wall shelves).
const hover = () => (camera.aspect > 1.2 ? 0.52 : camera.aspect < 0.8 ? 0.95 : 0.7)
const COUNTER_Z = 0.9 // the counter top runs from z -0.9 to 0.9
const FLOOR_Y = -1.2

const game = {
  state: 'loading', // loading | title | intro | play | decorate | party | candles | bonus | card
  run: 0, // bumps whenever a game starts or ends, so stale async steps stop
  level: 1,
  streak: 0, // lined-up drops in a row: each one rings a note higher
  tumbles: 0, // layers in a row that toppled off the edge
  firstDrop: false,
  lastFlavour: null,
  idle: 0,
}

let cake = null // { group, layers: [], candles: [] }
let mover = null // the layer sliding above the cake
let customer = null // the birthday friend
let guests = [] // friends who pop up for the party
const slivers = [] // trimmed bits of cake tumbling onto the counter
const view = { R: 1.6, custX: 2.1, custY: FLOOR_Y }

const customerDef = (level) => {
  const def = CUSTOMERS[(level - 1) % CUSTOMERS.length]
  if (level <= CUSTOMERS.length) return def
  const remix = (level - CUSTOMERS.length - 1) % REMIX.length
  return { ...def, layers: 10, ...REMIX[remix], hat: BALLOON_COLOURS[(remix + 2) % BALLOON_COLOURS.length], costume: remix + 1 }
}
/** Whether this cake has a twist: jelly, butterfly, narrow or wide. */
const twisted = (t) => !!cake?.twists?.includes(t)
/** How many layers this friend's cake has: the dots along the bottom fill up as they land. */
const targetLayers = () => customerDef(game.level).layers
const unlockedFlavours = (level) => ['vanilla', ...CUSTOMERS.slice(0, Math.min(level, CUSTOMERS.length)).map((c) => c.unlock).filter(Boolean)]
const FLOOR_W = MIN_W + 0.12 // the slimmest a layer gets
const perfectWindow = (w) => Math.max(0.12, w * 0.12)
const topY = () => STAND_TOP + (cake ? cake.layers.length : 0) * STEP
const topLayer = () => (cake && cake.layers.length ? cake.layers[cake.layers.length - 1] : { x: 0, w: cake?.startW || START_W })
// A steady pace that picks up a little from the fourth friend, so older children still have to watch.
const SLIDE_SPEED = 1.25
const slideSpeed = () => SLIDE_SPEED * (1 + clamp(game.level - 3, 0, 5) * 0.06)
const PARTY = ['decorate', 'party', 'candles', 'bonus', 'card']

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


/** While stacking, keep the cake stand clear of the layer dots and the pantry along the bottom. */
let pantryReserve = 90
function liftForDots(y) {
  const bar = $('pips').parentElement
  if (!bar.offsetHeight) return y
  const h = innerHeight
  const H = effHalfH(camGoal.halfW, camGoal.halfH)
  // The pantry's height is remembered from when it last showed, so the camera does not jump as it comes and goes.
  const pantryEl = $('pantry')
  if (pantryEl.offsetHeight) pantryReserve = bar.offsetTop - pantryEl.offsetTop
  const pantryLow = getComputedStyle(pantryEl).flexDirection === 'row'
  const fB = (h - bar.offsetTop + (pantryLow ? pantryReserve : 0) + 6) / h
  const fT = (0.15 * h + 6) / h
  const baseClear = H * (1 - 2 * fB) - 0.02 // the stand's foot sits just above the dots
  const moverClear = topY() + hover() + 0.2 - H * (1 - 2 * fT) // the sliding layer stays below the top buttons
  return Math.min(y, Math.max(moverClear, baseClear))
}

function aimCamera(snap = false) {
  if (game.state === 'title' || game.state === 'loading') {
    aimTitle()
  } else if (PARTY.includes(game.state) && cake) {
    const top = topY() + 0.6
    const cx = cake.group.position.x
    // The party guests stand either side, so the frame widens to take them in.
    const left = cx - (guests.length ? 2.0 : 1.1)
    const right = customer ? customer.group.position.x + (guests.length > 1 ? 1.4 : 0.7) : cx + 1.1
    Object.assign(camGoal, { x: (left + right) / 2, y: (top + -0.2) / 2 + 0.1, halfW: Math.max(2.0, (right - left) / 2 + 0.3), halfH: Math.max(1.7, (top + 0.2) / 2 + 0.45), pitch: 0.14 })
    // Tall narrow phones: the width decides the zoom, which would leave a big empty floor. Frame tighter
    // (the outer guests may peek in from the edges) and sit the counter low, so the party fills the screen.
    if (camera.aspect < 0.6) {
      camGoal.halfW = Math.max(1.4, (right - left) / 2 - 0.45)
      camGoal.y += 0.15
    }
    // Room for the puff bubble above the candles (and, on short wide phones, for the top buttons and the piñata)
    const short = camera.aspect > 1.6
    camGoal.halfH += short ? 0.8 : 0.35
    camGoal.y += short ? 0.45 : 0.3
    if (game.state === 'decorate') {
      if (short) {
        camGoal.halfH = Math.max(1.45, (top + 0.2) / 2 + 0.15)
        camGoal.y = (top - 0.2) / 2
      }
      // The toppings tray stands along the left edge: the view slides over so the cake sits clear of it.
      const tray = $('toppings')
      if (tray.offsetWidth) {
        const shownHalfW = Math.max(camGoal.halfW, effHalfH(camGoal.halfW, camGoal.halfH) * camera.aspect)
        camGoal.x -= ((tray.offsetLeft + tray.offsetWidth + 8) / innerWidth) * shownHalfW
      }
    }
    if (game.state === 'card') {
      // Leave room for the party card: beside the cake on wide screens, below it on tall ones.
      if (camera.aspect > 1.2) {
        camGoal.halfW *= 1.9
        const shownHalfW = Math.max(camGoal.halfW, camGoal.halfH * camera.aspect)
        camGoal.x += shownHalfW * 0.45
      } else {
        camGoal.halfH *= 1.15
        camGoal.y -= camGoal.halfH * 0.48
      }
    }
  } else {
    const t = topLayer()
    // Sideways, the view sits a little right of the cake: the pantry stands along the left edge, and the
    // birthday friend on the right stays wholly in frame.
    const wide = camera.aspect > 1.2
    Object.assign(camGoal, { x: t.x * 0.4 + (wide ? 0.22 : 0), y: topY() + 0.3, halfW: view.R + Math.max(START_W, cake?.startW || 0) / 2 + (camera.aspect < 0.8 ? 0.12 : 0.25), halfH: 2.1, pitch: 0.22 })
    if (camera.aspect < 0.6) {
      camGoal.halfW *= 0.82
      camGoal.y += 0.45 // put the counter lower in the portrait frame
    }
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
  camTarget.set(camNow.x, camNow.y, 0)
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
  view.R = camera.aspect < 0.8 ? 1.0 : camera.aspect < 1.2 ? 1.4 : 1.6
  const dist = distFor(view.R + START_W / 2 + 0.25, 2.0)
  const halfWAtCustomer = (dist + 1.5) * tanHalf() * camera.aspect
  view.custX = clamp(halfWAtCustomer - 0.55, 1.25, 2.3)
  // Tall screens: the friend stands nearer the middle and a little taller behind the counter, so their whole
  // face shows above it (and fills some of the wall) instead of peeking in from the edge.
  view.custY = FLOOR_Y + 0.22
  if (camera.aspect < 0.8) {
    view.custX = 1.3
    view.custY = FLOOR_Y + 0.3
  }
  if (customer && !PARTY.includes(game.state)) {
    customer.group.position.x = view.custX
    if (game.state === 'play') customer.group.position.y = view.custY
  }
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

function newCake(x = 0, tint = null) {
  const group = new THREE.Group()
  group.position.set(x, 0, 0)
  const stand = cakeKit.stand()
  // Each friend's cake stand is washed with a little of their party-hat colour.
  if (tint) {
    stand.traverse((m) => {
      if (!m.isMesh) return
      m.material = m.material.clone()
      m.material.color.lerp(new THREE.Color(tint), 0.3)
    })
  }
  group.add(stand)
  scene.add(group)
  return { group, layers: [], candles: [], wobble: 0, lean: 0 }
}

function disposeCake(c) {
  if (!c) return
  c.group.removeFromParent()
  if (c.crown?.parent === scene) c.crown.removeFromParent()
}

/** A surprise mix of every flavour met so far (never the same twice running); a brand new one shows up early. */
function pickFlavour() {
  const list = unlockedFlavours(game.level)
  let f
  do f = list[(Math.random() * list.length) | 0]
  while (list.length > 1 && f === game.lastFlavour)
  const fresh = customerDef(game.level).unlock
  if (fresh && game.level <= CUSTOMERS.length && cake.layers.length === 1 && game.lastFlavour !== fresh) f = fresh
  game.lastFlavour = f
  return f
}

// Jelly layers: glossy and see-through, made once per flavour.
const jellyMats = new Map()
function jellify(L, shared = true) {
  L.body.traverse((m) => {
    if (!m.isMesh) return
    const key = `${L.flavour}:${m.material.name}`
    let mat = shared && jellyMats.get(key)
    if (!mat) {
      mat = m.material.clone()
      mat.transparent = true
      mat.opacity = 0.72
      mat.roughness = 0.06
      mat.metalness = 0
      mat.envMapIntensity = 1.1
      if (shared) jellyMats.set(key, mat)
    }
    m.material = mat
  })
}

function addLayer(c, flavour, x, w) {
  const L = cakeKit.layer(flavour)
  if (c.twists?.includes('jelly')) jellify(L)
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

/** The next layer pops in at one side and slides to and fro until the child taps. */
function spawnMover(flavour, from = null) {
  // Never a layer more than the friend's cake has (a late timer after a hurried tap would add one).
  if (!cake || game.state !== 'play' || mover || cake.layers.length >= targetLayers()) return
  game.canHurry = false
  clearTimeout(game.nextTimer)
  if (!flavour) flavour = pickFlavour()
  const top = topLayer()
  const L = cakeKit.layer(flavour)
  L.w = top.w
  L.glow = cakeKit.glowCopy(L)
  if (twisted('jelly')) jellify(L, false)
  L.side = cake.layers.length % 2 ? 1 : -1
  L.pos = from ? from.pos : L.side * view.R
  L.dir = from ? from.dir : -L.side
  L.x = top.x + L.pos
  L.appear = from ? 0.6 : 0
  L.body.scale.set(L.w, 1, L.w)
  L.group.position.set(L.x, topY() + hover(), 0)
  cake.group.add(L.group)
  mover = L
  if (!from) sound.appear()
  renderPantry()
}

/** A pantry tap turns the sliding layer into that flavour, without stopping it. */
function choose(f) {
  if (game.state !== 'play' || !cake || !mover || mover.dropping) return
  sound.unlock()
  game.idle = 0
  if (mover.flavour === f) return
  sound.pop(0, Object.keys(FLAVOURS).indexOf(f))
  const old = mover
  old.group.removeFromParent()
  mover = null
  spawnMover(f, old)
  // A little squish says "changed!"
  mover.appear = 0.55
}

const pantry = $('pantry')
/** The flavour buttons: every flavour met so far, each an icing-coloured cake button with its picture. */
function renderPantry() {
  const show = game.state === 'play' && !!cake
  pantry.classList.toggle('hidden', !show)
  if (!show) return
  const list = unlockedFlavours(game.level)
  if (pantry.dataset.list !== list.join()) {
    pantry.dataset.list = list.join()
    pantry.replaceChildren(...list.map((f) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'pick'
      b.dataset.flavour = f
      const fl = FLAVOURS[f]
      b.style.setProperty('--icing', fl.rainbow ? '#ffe3ef' : fl.icing)
      b.style.setProperty('--sponge', fl.sponge)
      b.textContent = fl.emoji
      b.setAttribute('aria-label', f)
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        choose(f)
      })
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        // Keyboard users press Enter on a focused flavour.
        if (!e.detail) choose(f)
      })
      return b
    }))
  }
  for (const b of pantry.children) b.classList.toggle('picked', mover?.flavour === b.dataset.flavour)
}

// Where the sliding layer would land: a soft shadow on the cake top that turns gold and fills when it lines up.
const aim = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshBasicMaterial({ color: '#7a4a62', transparent: true, opacity: 0, depthWrite: false }))
aim.rotation.x = -Math.PI / 2
aim.renderOrder = 1
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.53, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
aim.add(aimRing)
aimRing.position.z = 0.001
let aimGold = 0

function updateAim(dt) {
  const show = mover && !mover.dropping && game.state === 'play' && cake
  if (!show) {
    aim.visible = false
    aimGold = 0
    if (customer) {
      customer.eager = lerp(customer.eager, 0, Math.min(1, dt * 8))
      customer.duck = lerp(customer.duck, 0, Math.min(1, dt * 8))
    }
    return
  }
  if (aim.parent !== cake.group) cake.group.add(aim)
  aim.visible = true
  const lined = Math.abs(mover.pos) <= perfectWindow(topLayer().w)
  aimGold = lerp(aimGold, lined ? 1 : 0, Math.min(1, dt * 14))
  aim.position.set(mover.x + leanAt(topY()), topY() + 0.006, 0)
  aim.scale.setScalar(mover.w * ease.outBack(mover.appear) * (1 + aimGold * 0.06))
  aim.material.color.lerpColors(SHADOW, GOLD, aimGold)
  // The shadow only shows where it falls on the cake: it fades out as the layer slides off past the edge.
  const over = clamp(1.25 - Math.abs(mover.pos) / topLayer().w, 0, 1)
  aim.material.opacity = (0.16 + aimGold * 0.34) * over
  aimRing.material.opacity = aimGold * 0.95
  // The friend leans in, wide-eyed, while it is lined up, and ducks when the layer slides right over its head.
  if (customer) {
    customer.eager = lerp(customer.eager, aimGold, Math.min(1, dt * 10))
    const over = Math.abs(mover.group.getWorldPosition(tmpV).x - customer.group.position.x) < 1.05 && mover.group.position.y < customer.group.position.y + 2.6
    customer.duck = lerp(customer.duck, over && camera.aspect < 1.2 ? 1 : 0, Math.min(1, dt * 9))
  }
}
const SHADOW = new THREE.Color('#7a4a62')
const GOLD = new THREE.Color('#ffd23f')
const tmpV = new THREE.Vector3()

function updateMover(dt) {
  if (!mover || mover.dropping) return
  const L = mover
  L.appear = Math.min(1, L.appear + dt * 4)
  L.pos += L.dir * slideSpeed() * dt
  if (L.pos * L.dir > view.R) {
    L.pos = L.dir * view.R
    L.dir = -L.dir
  }
  const top = topLayer()
  L.x = top.x + L.pos
  const pop = ease.outBack(L.appear)
  // The sliding layer follows the lean of the cake's top, so lining it up still looks right on a tilted cake.
  L.group.position.set(L.x + leanAt(topY()), topY() + hover(), 0)
  L.body.scale.set(L.w * pop, pop, L.w * pop)
  // A steady warm glow while it is lined up for a perfect drop
  const lined = Math.abs(L.pos) <= perfectWindow(top.w)
  const g = lined ? 0.35 : 0
  for (const m of L.glow) {
    m.emissive.set('#ffe28a')
    m.emissiveIntensity = lerp(m.emissiveIntensity, g, Math.min(1, dt * 20))
  }
}

async function drop() {
  if (game.state !== 'play' || !mover || mover.dropping || mover.appear < 0.6) return
  const run = game.run
  const L = mover
  L.dropping = true
  game.firstDrop = true
  game.idle = 0
  $('hint').classList.add('hidden')
  sound.whoosh()
  const y0 = L.group.position.y
  const y1 = topY()
  L.body.scale.set(L.w, 1, L.w)
  // It stretches tall as it falls, then squashes flat on landing.
  await tween(0.2, (t) => {
    L.group.position.y = lerp(y0, y1, ease.inCubic(t))
    L.body.scale.set(L.w * (1 - t * 0.12), 1 + t * 0.25, L.w * (1 - t * 0.12))
  })
  if (run !== game.run) return
  // A layer still falling when the party starts just melts away instead of landing.
  if (game.state !== 'play' || cake.layers.length >= targetLayers()) {
    L.group.removeFromParent()
    return
  }
  land(L)
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
  // Way off the edge: the layer topples off and splats on the counter. Nothing is lost but a moment,
  // and the friend can't help giggling.
  // After two tumbles in a row the next one holds on (squished), so a child who taps the moment each layer
  // appears still builds a cake, just a funnier, bumpier one.
  if (cake.layers.length > 0 && ad > top.w * 0.58 && game.tumbles < 2) return tumble(L, dir)
  game.tumbles = 0
  if (ad <= perfectWindow(top.w)) {
    kind = 'perfect'
    game.streak++
    if (game.streak >= 3 && top.w < cake.startW - 0.01 && !cake.taper) {
      newW = Math.min(cake.startW, top.w + 0.1)
      grew = true
    }
    // Some friends like a gently tapering tower: each lined-up layer is a touch smaller, like a wedding cake.
    if (cake.taper && cake.layers.length) newW = Math.max(cake.startW * 0.7, top.w - cake.taper)
  } else {
    game.streak = 0
    const forgive = cake.layers.length === 0 ? 0.3 : 0.35
    const loss = Math.min(ad * forgive, top.w * 0.18)
    // Layers stop shrinking at a slim floor, so every cake reaches the top.
    newW = Math.max(Math.min(top.w, FLOOR_W), top.w - loss)
    newX = top.x + (dir * (top.w - newW)) / 2
    kind = ad < top.w * 0.3 ? 'good' : 'squish'
  }
  mover = null
  L.group.removeFromParent()
  cakeKit.unglow(L)
  const layer = addLayer(cake, L.flavour, L.x, top.w)
  const n = cake.layers.length
  layer.sq = (kind === 'perfect' ? 0.36 : 0.28) * (twisted('jelly') ? 1.5 : 1)
  // The whole cake squashes a little under the new layer, and a tall cake wobbles more.
  for (const other of cake.layers) if (other !== layer) other.sq = Math.max(other.sq, 0.08)
  sound.plop(n)
  const y = STAND_TOP + (n - 1) * STEP
  const icing = FLAVOURS[L.flavour].icing
  const fromX = L.x
  const fromW = top.w
  tween(0.24, (t) => {
    const e = ease.outCubic(t)
    layer.x = lerp(fromX, newX, e)
    layer.w = lerp(fromW, newW, e)
  })
  const tall = (1 + n * 0.08) * (twisted('jelly') ? 1.7 : 1)
  if (kind === 'perfect') {
    // Lined up: a golden ring, a few sparkles and a chime that climbs a note with each one in a row.
    sound.perfect(Math.min(game.streak - 1, 7))
    cake.perfects = (cake.perfects || 0) + 1
    goldRim(layer)
    effects.perfect(new THREE.Vector3(newX + cake.group.position.x, y + 0.05, 0), newW)
    cake.wobble = Math.max(cake.wobble, 0.025 * tall)
    customer?.cheer(game.streak >= 3 ? 1.4 : 0.8)
    if (grew) sound.grow()
    // Three in a row and a friend pops up from behind the counter to cheer.
    if (game.streak % 3 === 0) peek(run)
  } else {
    // The overhang squishes off with a splat of icing, and a little piece tumbles onto the counter
    const edge = new THREE.Vector3(fromX + dir * (fromW / 2) + cake.group.position.x, y + 0.18, 0.1)
    // Crumbs flying toward the friend stay short, so none crosses their face.
    const room = dir > 0 ? clamp((view.custX - 0.8 - edge.x) / 0.6, 0.15, 1) : 1
    effects.splat(edge, icing, dir, kind === 'squish' ? 18 : 10, room)
    sound.splat()
    if (ad > 0.08) sliver(L.flavour, fromX + dir * (fromW / 2 - Math.min(0.2, ad) / 2), y, Math.min(0.32, ad * 0.9), dir)
    cake.wobble = Math.max(cake.wobble, (kind === 'squish' ? 0.14 : 0.07) * tall)
    if (kind === 'squish') {
      sound.wobble()
      customer?.surprised()
    } else {
      sound.good()
      customer?.hop(0.15)
    }
  }
  updateHud()
  // A lopsided tall cake teeters dramatically, then the bakery magic pulls it straight again.
  const tipping = n >= 4 && Math.abs(cake.layers.reduce((a, l) => a + l.x, 0) / n) > 0.15 && !cake.teeter
  if (tipping) teeter(run)
  if (n >= targetLayers()) {
    setTimeout(() => run === game.run && finishCake(), tipping ? 1900 : 450)
    return
  }
  if (n % 3 === 0 || layer.gold) setTimeout(() => run === game.run && decorateSide(layer, (n + game.level) % SIDE_DECOR.length), 300)
  setTimeout(() => run === game.run && game.state === 'play' && !mover && spawnMover(), tipping ? 1800 : 320)
}

// --- The butterfly twist: it flutters about where the layers slide, and a layer can bump it --------

let butterfly = null
function makeButterfly() {
  const group = new THREE.Group()
  const wingMat = new THREE.MeshStandardMaterial({ color: '#ffb347', roughness: 0.5, side: THREE.DoubleSide })
  const spotMat = new THREE.MeshStandardMaterial({ color: '#9b7cf7', roughness: 0.5, side: THREE.DoubleSide })
  const wings = []
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group()
    const big = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20).scale(1, 0.8, 1).translate(sx * 0.12, 0.05, 0), wingMat)
    const small = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16).translate(sx * 0.09, -0.08, 0), wingMat)
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12).translate(sx * 0.13, 0.06, 0.002), spotMat)
    pivot.add(big, small, spot)
    group.add(pivot)
    wings.push({ pivot, sx })
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 4, 8), new THREE.MeshStandardMaterial({ color: '#5a3a4a' }))
  group.add(body)
  group.rotation.x = -0.5
  group.scale.setScalar(1.2)
  group.position.set(-4, 1.5, 0.3)
  scene.add(group)
  return { group, wings, t: Math.random() * 6, flee: 0, x: -4, y: 1.5 }
}

function updateButterfly(dt, t) {
  const b = butterfly
  if (!b) return
  b.t += dt
  for (const w of b.wings) w.pivot.rotation.y = w.sx * Math.sin(t * (b.flee > 0 ? 30 : 16)) * 0.9
  const cx = cake ? cake.group.position.x : 0
  if (b.flee > 0) {
    // Bumped: it zooms up and away, then drifts back in a moment later.
    b.flee -= dt
    b.y += dt * 2.2
    b.x += dt * b.dir * 1.5
    if (b.flee <= 0) b.y = (cake ? topY() : 1) + 2.2
  } else {
    // A lazy figure of eight just above the slide, a little higher than the sliding layer.
    const home = (cake ? topY() + hover() : 1.6) + 0.42
    const gx = cx + Math.sin(b.t * 0.55) * (view.R + 0.3)
    const gy = home + Math.sin(b.t * 1.1) * 0.22
    b.x = lerp(b.x, gx, Math.min(1, dt * 1.8))
    b.y = lerp(b.y, gy, Math.min(1, dt * 1.8))
    // The sliding layer brushes it: a bump, a sparkle, and the friend giggles.
    if (mover && !mover.dropping && game.state === 'play') {
      const mx = cx + mover.x
      const my = topY() + hover()
      if (Math.abs(mx - b.x) < mover.w / 2 + 0.05 && Math.abs(my + 0.15 - b.y) < 0.32) {
        b.flee = 1.6
        b.dir = Math.sign(b.x - mx) || 1
        sound.pop(0, 8)
        effects.sparkleAt(b.group.position, '#fff3a0', 6)
        customer?.cheer(0.6)
      }
    }
  }
  // Tapped: a loop-the-loop on top of wherever it was going.
  let lx = 0
  let ly = 0
  if (b.loop > 0) {
    b.loop = Math.max(0, b.loop - dt)
    const a = (1 - b.loop / 1.1) * Math.PI * 2
    lx = Math.sin(a) * 0.4 * b.loopDir
    ly = (1 - Math.cos(a)) * 0.4
  }
  b.group.position.set(b.x + lx, b.y + ly, 0.35)
  b.group.rotation.z = Math.sin(b.t * 0.55 + Math.PI / 2) * 0.3 + (b.loop > 0 ? (1 - b.loop / 1.1) * Math.PI * 2 * b.loopDir : 0)
}

/** A tap right on the butterfly: it flutters a loop-the-loop and everyone giggles. */
function tapButterfly(e) {
  const b = butterfly
  if (!b || b.loop > 0 || e.clientX === undefined) return false
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(pointer, camera)
  if (ray.ray.distanceToPoint(b.group.position) > 0.32) return false
  b.loop = 1.1
  b.loopDir = Math.random() < 0.5 ? -1 : 1
  sound.flutter()
  effects.sparkleAt(b.group.position, '#ffe3a0', 8)
  if (customer) {
    customer.cheer(0.8)
    sound.voice(customer.def.animal, 0.25)
  }
  return true
}

function clearButterfly() {
  butterfly?.group.removeFromParent()
  butterfly = null
}

/** A friend pops up from behind the counter on the other side, cheers a perfect run, and ducks away again. */
let peeker = null
function peek(run) {
  if (peeker || !cake) return
  const host = customerDef(game.level)
  const def = CUSTOMERS[(game.level + 2 + game.streak) % CUSTOMERS.length]
  if (def.animal === host.animal) return
  const f = animals.make(def)
  const x = -Math.max(1.25, view.custX - (camera.aspect < 0.8 ? 0.05 : 0.2))
  const low = FLOOR_Y - 1.9
  f.group.scale.setScalar(1.5)
  f.group.position.set(x, low, -1.6)
  f.group.rotation.y = 0.5
  scene.add(f.group)
  peeker = f
  sound.voice(def.animal)
  tween(0.45, (t) => (f.group.position.y = lerp(low, view.custY, ease.outBack(t)))).then(() => run === game.run && f.cheer(1.3))
  setTimeout(() => {
    if (run !== game.run) return
    tween(0.4, (t) => (f.group.position.y = lerp(view.custY, low, ease.inCubic(t)))).then(() => {
      f.group.removeFromParent()
      if (peeker === f) peeker = null
    })
  }, 2100)
}

/** A layer dropped way off the edge topples over the side, rolls off and splats onto the counter. */
function tumble(L, dir) {
  const run = game.run
  game.streak = 0
  game.tumbles++
  mover = null
  cakeKit.unglow(L)
  const p = new THREE.Vector3()
  L.group.getWorldPosition(p)
  L.group.removeFromParent()
  L.group.position.copy(p)
  scene.add(L.group)
  const icing = FLAVOURS[L.flavour].icing
  sound.wobble()
  cake.wobble = Math.max(cake.wobble, 0.1)
  // A tap hurries the next layer in, so a child who taps a lot is never kept waiting.
  game.canHurry = true
  const next = () => run === game.run && game.state === 'play' && !mover && spawnMover()
  if (dir > 0 && customer) {
    // Off the friend's side: it flies straight into their face. Splat! A creamy face, a shake, a giggle.
    const face = customer.mouthWorld.add(new THREE.Vector3(0, 0.05, 0.35))
    const from = p.clone()
    const w0 = L.body.scale.x
    customer.surprised()
    tween(0.42, (t) => {
      L.group.position.lerpVectors(from, face, t)
      L.group.position.y += Math.sin(t * Math.PI) * 0.5
      L.group.rotation.z = -t * 1.4
      L.body.scale.setScalar(Math.max(0.001, w0 * (1 - t * 0.55)))
    }).then(() => {
      if (run !== game.run) return
      sound.splat()
      sound.blob()
      effects.splat(face, icing, 1, 14)
      effects.splat(face, icing, -1, 10)
      creamFace(customer, icing)
      slivers.push({ obj: L.group, v: new THREE.Vector3(0.1, 0.2, 0.1), spin: -2, age: 0, landed: false, big: icing, dir: 1 })
      setTimeout(() => {
        if (run !== game.run || !customer) return
        customer.cheer(1)
        sound.voice(customer.def.animal)
      }, 450)
    })
    game.nextTimer = setTimeout(next, 700)
    return
  }
  // Off the other side: it tips over the edge and splats onto the counter.
  slivers.push({ obj: L.group, v: new THREE.Vector3(-1.1, 1.4, 0.2), spin: 5, age: 0, landed: false, big: icing, dir })
  customer?.surprised()
  setTimeout(() => {
    if (run !== game.run || !customer) return
    customer.cheer(0.7)
    sound.voice(customer.def.animal)
  }, 550)
  game.nextTimer = setTimeout(next, 380)
}

/** A few blobs of icing stuck on a friend's face, which slide off after a moment. */
function creamFace(f, icing) {
  const mat = new THREE.MeshStandardMaterial({ color: icing, roughness: 0.35 })
  const blobs = []
  for (const [x, y, r] of [[0, 0.12, 0.09], [0.1, 0.2, 0.06], [-0.11, 0.07, 0.07], [0.05, 0.02, 0.05]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8).scale(1, 0.8, 0.55), mat)
    b.position.set(x, y, 0.3)
    f.head.add(b)
    blobs.push(b)
  }
  setTimeout(() => {
    tween(0.6, (t) => blobs.forEach((b) => {
      b.position.y -= 0.004
      b.scale.setScalar(Math.max(0.001, 1 - t))
    })).then(() => blobs.forEach((b) => b.removeFromParent()))
  }, 2200)
}

/** The cake sways far over, holds its breath, then rights itself as its layers shuffle back to the middle. */
function teeter(run) {
  const n = cake.layers.length
  const off = cake.layers.reduce((a, l) => a + l.x, 0) / n
  const c = cake
  c.teeter = { t: 0, dir: Math.sign(off) }
  sound.wobble()
  customer?.surprised()
  setTimeout(() => run === game.run && sound.wobble(), 450)
  setTimeout(() => {
    if (run !== game.run || cake !== c) return
    // The layers slide back toward the middle, keeping their shape.
    const from = c.layers.map((l) => l.x)
    tween(0.55, (t) => c.layers.forEach((l, i) => (l.x = from[i] - off * 0.75 * ease.inOutCubic(t))))
    sound.grow()
    customer?.cheer(1)
  }, 900)
}

/** A trimmed piece of cake that flies off and plops onto the counter. */
function sliver(flavour, x, y, w, dir) {
  const L = cakeKit.layer(flavour)
  L.body.scale.set(w, 0.9, w)
  L.group.position.set(x + cake.group.position.x, y, 0)
  scene.add(L.group)
  // It tumbles sideways and lands on the counter close beside the cake, never toward the camera (where it
  // would loom large) and never as far as the birthday friend's face: its sideways speed is set from how
  // long it falls, so a tall cake's sliver lands just as near as a short one's.
  // Toward the friend (who stands to the right), it lands well short of their face, or slips straight
  // down without a hop when the cake's edge is already close to them.
  const room = dir > 0 ? view.custX - 0.8 - (x + cake.group.position.x) : 9
  const vy = room < 0.3 ? 0.2 : 1.5
  const fall = (vy + Math.sqrt(vy * vy + 2 * 9.8 * Math.max(0, y))) / 9.8
  const reach = Math.max(0.03, Math.min(0.3 + Math.random() * 0.3, room))
  slivers.push({ obj: L.group, v: new THREE.Vector3((dir * reach) / fall, vy, 0.1 + Math.random() * 0.2), spin: dir * -(2 + Math.random() * 2), age: 0, landed: false })
}

function updateSlivers(dt) {
  for (let i = slivers.length - 1; i >= 0; i--) {
    const s = slivers[i]
    s.age += dt
    const o = s.obj
    if (!s.landed) {
      s.v.y -= 9.8 * dt
      o.position.addScaledVector(s.v, dt)
      o.position.z = Math.min(o.position.z, COUNTER_Z * 0.6)
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
        if (s.big) {
          // A whole layer goes splat: icing everywhere and a big squash.
          o.scale.set(1.45, 0.45, 1.45)
          effects.splat(o.position.clone().setY(floor + 0.15), s.big, s.dir, 16)
          effects.splat(o.position.clone().setY(floor + 0.15), s.big, -s.dir, 10)
          sound.splat()
        }
      }
    } else {
      o.scale.y = lerp(o.scale.y, s.big ? 0.55 : 0.8, dt * 8)
      if (s.age > (s.big ? 2.2 : 1.6)) o.scale.multiplyScalar(Math.max(0, 1 - dt * 5))
      if (s.age > (s.big ? 3 : 2.4)) {
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

/** How far the leaning cake shifts sideways at height y (it tips about the foot of its stand). */
const leanAt = (y) => (cake ? Math.sin(cake.lean) * y : 0)

/** Jelly wobble and landing squish for every layer, and a gentle lean for a cake stacked off-centre. */
function updateCake(dt, t) {
  if (!cake) return
  const jelly = twisted('jelly')
  cake.wobble *= Math.exp(-dt * (jelly ? 1.1 : 2.2))
  const n = cake.layers.length
  // The further the layers sit from the middle of the stand, the more the cake leans (a few degrees at most,
  // and it never falls): a carefully lined-up cake stands straight, a hurried one tilts.
  const off = n ? cake.layers.reduce((a, L) => a + L.x, 0) / n : 0
  cake.baseLean = lerp(cake.baseLean || 0, clamp(off * 0.45, -0.075, 0.075), Math.min(1, dt * 3))
  cake.lean = cake.baseLean
  if (cake.teeter) {
    // A big slow sway out to the leaning side and back, settling as the layers move home.
    const T = cake.teeter
    T.t += dt
    const env = Math.sin(Math.min(1, T.t / 1.5) * Math.PI)
    cake.lean += T.dir * env * 0.2 * (0.8 + 0.2 * Math.sin(T.t * 9))
    if (T.t > 1.5) cake.teeter = null
  }
  if (cake.deco) {
    cake.deco.position.x = cake.decoLayer.x + leanAt(cake.deco.position.y)
    cake.deco.rotation.z = -cake.lean
  }
  // A tall cake never quite stops swaying: a tiny jelly sway that grows with its height.
  const tallSway = Math.max(0, n - 4) * 0.0035 * (jelly ? 2.5 : 1) + (jelly && n ? 0.006 : 0)
  cake.layers.forEach((L, i) => {
    // squish spring
    // Jelly layers are softer and bouncier.
    L.sqv += (jelly ? -L.sq * 150 - L.sqv * 5 : -L.sq * 240 - L.sqv * 14) * dt
    L.sq += L.sqv * dt
    const sway = (cake.wobble * Math.sin(t * 11 - i * 0.35) + tallSway * Math.sin(t * 2.6 - i * 0.2)) * ((i + 1) / Math.max(n, 1)) ** 1.3
    L.group.position.x = L.x + sway + leanAt(L.group.position.y)
    L.group.rotation.z = -sway * 0.5 - cake.lean
    // Jelly never sits still: a soft constant wobble-squash, each layer a little out of step.
    const jig = jelly ? Math.sin(t * 7 - i * 0.8) * 0.035 : 0
    const s = 1 + (L.sq + jig) * 0.5
    L.body.scale.set(L.w * s, 1 - L.sq - jig, L.w * s)
  })
  // A perfect cake keeps a slow ring of sparkles drifting round its crown.
  if (cake.halo && cake.crown && (cake.haloT = (cake.haloT || 0) + dt) > 0.12) {
    cake.haloT = 0
    const p = cake.crown.getWorldPosition(tmpV)
    const a = t * 1.5
    p.x += Math.cos(a) * 0.45
    p.z += Math.sin(a) * 0.45
    p.y += 0.15
    effects.sparkleAt(p, '#fff3a0', 1)
  }
  for (const c of cake.candles) {
    if (!c.flame) continue
    const flameSize = game.state === 'candles' && innerHeight > innerWidth ? 1.65 : 1
    const target = c.lit ? flameSize * (1 + Math.sin(t * 23 + c.seed) * 0.12 + Math.sin(t * 37 + c.seed * 2) * 0.06) : 0
    c.flameScale = lerp(c.flameScale ?? 0, target, Math.min(1, dt * (c.lit ? 10 : 18)))
    c.flame.scale.set(c.flameScale, c.flameScale * (1 + (c.lit ? Math.sin(t * 17 + c.seed) * 0.1 : 0)), c.flameScale)
    c.flame.visible = c.flameScale > 0.02
  }
}

const SIDE_DECOR = [
  { name: 'topper_strawberry', tilt: 1.25, n: 8, colour: '#ff4d6d' },
  { name: 'topper_heart', tilt: 0, n: 8, colour: '#ff6fae' },
  { name: 'topper_cherry', tilt: 1.15, n: 9, colour: '#d6223a' },
  { name: 'topper_star', tilt: 0, n: 8, colour: '#ffd23f' },
]

/** Every third layer gets decorations stuck around its side. */
async function decorateSide(L, k) {
  const run = game.run
  const d = SIDE_DECOR[k % SIDE_DECOR.length]
  const items = []
  for (let i = 0; i < d.n; i++) {
    const pivot = new THREE.Group()
    pivot.rotation.y = (i / d.n) * Math.PI * 2 + 0.2
    pivot.userData.colour = d.colour
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

async function topDecorations(run, quick = false) {
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
    if (flame) {
      flame.scale.setScalar(0.001)
      flame.traverse((m) => {
        if (!m.isMesh) return
        m.material = m.material.clone()
        m.material.emissive?.set('#ffbb40')
        m.material.emissiveIntensity = 0.85
      })
    }
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
    if (!quick || i % 5 === 0) sound.pop(0, i % 12)
    tween(0.32, (t) => o.scale.setScalar(Math.max(0.001, s * ease.outBack(t))))
    await wait(quick ? 0.025 : i === 0 ? 0.25 : 0.07)
    if (run !== game.run) return false
  }
  return true
}

const GOLD_MAT = new THREE.MeshStandardMaterial({ color: '#ffcf4a', roughness: 0.25, metalness: 0.75, emissive: '#7a4f00', emissiveIntensity: 0.25 })
/** A lined-up drop pipes a thin gold rim round its layer's top edge, so a careful cake shows every perfect. */
function goldRim(L) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 48), GOLD_MAT)
  ring.rotation.x = Math.PI / 2
  ring.position.y = STEP * 0.93
  ring.scale.setScalar(0.001)
  L.body.add(ring)
  L.gold = true
  tween(0.35, (t) => ring.scale.setScalar(Math.max(0.001, ease.outBack(t))))
}

async function crownMoment(run, friend) {
  const crown = makeCrown()
  const top = new THREE.Vector3(cake.group.position.x + topLayer().x, topY() + 0.3, 0)
  crown.position.copy(top)
  crown.scale.setScalar(0.001)
  scene.add(crown)
  cake.crown = crown
  sound.grow()
  // Up out of the cake, growing and spinning, with sparkles
  await tween(0.9, (t) => {
    crown.position.y = top.y + ease.outCubic(t) * 0.9
    crown.scale.setScalar(Math.max(0.001, 2 * ease.outBack(Math.min(1, t * 1.6))))
    crown.rotation.y = t * Math.PI * 3
  })
  if (run !== game.run) return false
  effects.sparkleAt(crown.position, '#ffe066', 14)
  sound.perfect(7)
  await wait(0.25)
  if (run !== game.run) return false
  // ...then over onto the friend's head, where the party hat was
  friend.head.updateWorldMatrix(true, false)
  const from = crown.position.clone()
  const headTop = new THREE.Vector3(0, 0.36, 0).applyMatrix4(friend.head.matrixWorld)
  const s0 = crown.scale.x
  const s1 = 1.05 * friend.group.scale.x
  await tween(0.6, (t) => {
    crown.position.lerpVectors(from, headTop, ease.inOutCubic(t))
    crown.position.y += Math.sin(t * Math.PI) * 0.5
    crown.scale.setScalar(lerp(s0, s1, t))
    crown.rotation.y = Math.PI * 3 + t * Math.PI
  })
  if (run !== game.run) return false
  if (friend.hat) friend.hat.visible = false
  friend.head.add(crown)
  crown.position.set(0, 0.34, 0)
  crown.rotation.set(0, 0, -0.1)
  crown.scale.setScalar(1.05)
  sound.plop()
  effects.sparkleAt(headTop, '#fff3a0', 12)
  friend.cheer(1.5)
  sound.voice(friend.def.animal)
  return true
}

/** A little golden crown with jewels. */
function makeCrown() {
  const g = new THREE.Group()
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 24, 1, true).translate(0, 0.045, 0), GOLD_MAT)
  band.material.side = THREE.DoubleSide
  g.add(band)
  const gems = ['#ff6fae', '#4fd1b5', '#9b7cf7', '#7bc8ff', '#ffb347']
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8).translate(0, 0.15, 0), GOLD_MAT)
    spike.position.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), GOLD_MAT)
    ball.position.set(Math.sin(a) * 0.15, 0.22, Math.cos(a) * 0.15)
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), shiny(gems[k]))
    gem.position.set(Math.sin(a + 0.63) * 0.172, 0.045, Math.cos(a + 0.63) * 0.172)
    g.add(spike, ball, gem)
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

async function finishCake() {
  if (!cake || !['play', 'intro'].includes(game.state)) return
  const run = game.run
  game.state = 'party'
  $('hud').classList.add('partying')
  $('hint').classList.add('hidden')
  $('pips').classList.add('full')
  renderPantry()
  if (mover && !mover.dropping) {
    const m = mover
    mover = null
    tween(0.25, (t) => m.body.scale.setScalar(Math.max(0.001, 1 - t) * m.w)).then(() => m.group.removeFromParent())
  }
  sound.fanfare()
  customer?.cheer(1.2)
  if (butterfly) {
    // The butterfly flutters off to watch from the shelves.
    butterfly.flee = 99
    butterfly.dir = -1
  }
  await wait(0.5)
  if (run !== game.run) return
  // Decorating time: the child sticks fruit, hearts and stars all over the cake, then lights the candles.
  if (!(await decorate(run))) return
  game.state = 'party'
  // After the first two parties the toppers arrive faster, so the next cake comes sooner.
  const quick = game.cakes > 2
  if (!(await topDecorations(run, quick))) return
  await wait(quick ? 0.1 : 0.3)
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
  await tween(quick ? 0.45 : 0.7, (t) => {
    c.group.position.lerpVectors(from, to, t)
    c.group.position.y = lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * 1.6
    c.group.scale.setScalar(lerp(s0, 1.35, t))
  })
  if (run !== game.run) return
  sound.plop()
  c.hop(0.2)
  c.group.rotation.y = -0.35
  // Every full-height cake gets a crown, including squishy cakes made by fast little fingers.
  // Carefully lined-up cakes keep their gold rims, and perfect ones keep a halo of sparkles.
  const n = cake.layers.length
  if (cake.layers.length >= targetLayers()) {
    if (!(await crownMoment(run, c))) return
    cake.halo = cake.perfects >= n - 1
  }
  // Party guests pop up behind the counter, one each side, to see the cake.
  popGuests(run)
  await wait(quick ? 0.35 : 0.6)
  if (run !== game.run) return

  // Light the candles one by one (all together once the party is familiar)
  for (const cd of cake.candles) {
    cd.lit = true
    if (quick && cd !== cake.candles[0]) continue
    sound.match()
    if (quick) continue
    await wait(0.18)
    if (run !== game.run) return
  }
  game.idle = 0
  game.state = 'candles'
  // A puff bubble over the candles; the finger only comes if nobody taps for a little while.
  showIntro('', '🌬️🕯️', '', true)
  setTimeout(() => run === game.run && game.state === 'candles' && showHintAt(candleCenter()), 2500)
}

// --- Decorating ---------------------------------------------------------------------------------

// Every topping for decorating. Strawberries are there from the start; each friend brings one more.
const TOPPINGS = {
  strawberry: { name: 'topper_strawberry', emoji: '🍓', tilt: 1.25, y: 0.13, colour: '#ff4d6d' },
  heart: { name: 'topper_heart', emoji: '💗', tilt: 0, y: 0.06, colour: '#ff6fae' },
  cherry: { name: 'topper_cherry', emoji: '🍒', tilt: 1.15, y: 0.13, colour: '#d6223a' },
  star: { name: 'topper_star', emoji: '⭐', tilt: 0, y: 0.06, colour: '#ffd23f' },
  flower: { make: 'flower', emoji: '🌸', tilt: 0, y: 0.13, colour: '#ff9ecf' },
  pearl: { make: 'pearl', emoji: '🫧', tilt: 0, y: 0.13, colour: '#f4f0ff' },
  candy: { make: 'candy', emoji: '🍬', tilt: 0, y: 0.13, colour: '#7bc8ff' },
  cream: { name: 'topper_cream', emoji: '🍦', tilt: 1.35, y: 0.13, colour: '#fff3df' },
  sprinkle: { make: 'sprinkle', emoji: '🌈', tilt: 0, y: 0.13, colour: '#b197fc' },
}
/** The toppings met so far: strawberries, then one from each friend up to this one. */
const unlockedToppings = (level) => ['strawberry', ...CUSTOMERS.slice(0, Math.min(level, CUSTOMERS.length)).map((c) => c.topping)]

const SPRINKLES = ['#ff6fae', '#ffd23f', '#4fd1b5', '#9b7cf7', '#7bc8ff', '#ffffff']
const shiny = (colour) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.3, metalness: 0.1 })
/** Runtime toppings, built facing +z so they sit on a layer's side like the modelled ones. */
function makeTopping(key) {
  const d = TOPPINGS[key]
  if (d.name) return cakeKit.topper(d.name)
  const g = new THREE.Group()
  if (d.make === 'flower') {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8).scale(1, 1, 0.5), shiny(k % 2 ? '#ffb3d6' : '#ff8cc4'))
      petal.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.012)
      g.add(petal)
    }
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), shiny('#ffd23f'))
    mid.position.z = 0.022
    g.add(mid)
  } else if (d.make === 'pearl') {
    const m = new THREE.MeshStandardMaterial({ color: '#fff6ff', roughness: 0.15, metalness: 0.35 })
    for (const [x, y, r] of [[0, 0, 0.042], [0.055, -0.02, 0.026], [-0.05, 0.025, 0.022]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m)
      b.position.set(x, y, r * 0.6)
      g.add(b)
    }
  } else if (d.make === 'candy') {
    const c = SPRINKLES[(Math.random() * 5) | 0]
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), shiny(c))
    ball.position.z = 0.03
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 6, 20), shiny('#ffffff'))
    band.position.z = 0.03
    band.rotation.y = Math.PI / 2
    g.add(ball, band)
  } else {
    for (let k = 0; k < 9; k++) {
      const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.03, 3, 6), shiny(SPRINKLES[k % SPRINKLES.length]))
      sp.position.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1, 0.01)
      sp.rotation.z = Math.random() * Math.PI
      g.add(sp)
    }
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}
const MAX_TOPPINGS = 22
let decorating = null // { done, placed, pick, idle } while the tray is out

/**
 * The finished cake waits for its decorations: a tray of toppings, and the candle button to finish.
 * Every tap on a topping (or on the cake itself) pops one onto the side of the cake, facing the child.
 */
function decorate(run) {
  game.state = 'decorate'
  const tray = $('toppings')
  const keys = unlockedToppings(game.level)
  // The friend's favourite topping (the one they brought, or a remix friend's pick) is ringed and picked first.
  const fresh = customerDef(game.level).topping
  tray.replaceChildren(...keys.map((key, i) => {
    const d = TOPPINGS[key]
    const b = document.createElement('button')
    b.type = 'button'
    // The topping this friend brought arrives last, with a sparkle.
    b.className = `pick topping${key === fresh ? ' new' : ''}`
    b.textContent = d.emoji
    b.dataset.key = key
    b.setAttribute('aria-label', key)
    b.style.animationDelay = `${i * 70}ms`
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      selectTopping(i)
    })
    b.addEventListener('click', (e) => !e.detail && selectTopping(i))
    return b
  }))
  // One column, or two once there are more than five toppings
  tray.style.gridTemplateRows = `repeat(${keys.length > 5 ? Math.ceil(keys.length / 2) : keys.length}, auto)`
  tray.classList.remove('hidden')
  $('done').classList.remove('hidden', 'ready')
  $('done').setAttribute('aria-disabled', 'true')
  return new Promise((resolve) => {
    decorating = { since: performance.now(), placed: 0, idle: 0, quiet: 0, pick: fresh && keys.includes(fresh) ? keys.indexOf(fresh) : 0, keys, done: (ok) => {
      decorating = null
      tray.classList.add('hidden')
      $('done').classList.add('hidden')
      $('hint').classList.add('hidden')
      resolve(ok && run === game.run)
    } }
    renderTray()
  })
}

/** A tray tap picks and places a topping, without hiding the idle guidance. */
function selectTopping(i) {
  if (!decorating) return
  sound.unlock()
  decorating.pick = i
  renderTray()
  addTopping(null, 'tray')
}

function renderTray() {
  ;[...$('toppings').children].forEach((b, k) => b.classList.toggle('picked', decorating?.pick === k))
}

/**
 * A tap on the cake sticks the chosen topping right where the finger landed: on a layer's side, or standing
 * on the top. Without a point (a key press) it goes on the front of the least decorated layer.
 */
function addTopping(e = null, source = 'cake') {
  if (!decorating || !cake) return
  sound.unlock()
  const D = decorating
  if (source !== 'shower' && D.placed >= MAX_TOPPINGS) return
  const key = D.keys[D.pick]
  const d = TOPPINGS[key]
  let L = null
  const local = new THREE.Vector3()
  if (e && e.clientX !== undefined) {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(pointer, camera)
    let best = Infinity
    for (const layer of cake.layers) {
      const hit = ray.intersectObject(layer.group, true)[0]
      if (hit && hit.distance < best) {
        best = hit.distance
        L = layer
        local.copy(hit.point)
      }
    }
    if (!L) {
      // A finger needn't hit a skinny tower exactly. Expand each layer's screen-space bounds
      // by 28 px, keeping taps near that layer on its front face.
      let nearest = Infinity
      for (const layer of cake.layers) {
        const box = new THREE.Box3().setFromObject(layer.group)
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const v = new THREE.Vector3(x, y, z).project(camera)
          const px = (v.x + 1) * innerWidth / 2, py = (1 - v.y) * innerHeight / 2
          left = Math.min(left, px); right = Math.max(right, px)
          top = Math.min(top, py); bottom = Math.max(bottom, py)
        }
        const distance = Math.hypot(Math.max(left - e.clientX, 0, e.clientX - right), Math.max(top - e.clientY, 0, e.clientY - bottom))
        if (distance <= 28 && distance < nearest) {
          nearest = distance
          L = layer
        }
      }
      if (L) local.copy(L.group.localToWorld(new THREE.Vector3(0, STEP * 0.5, L.w / 2)))
    }
    if (!L) {
      // A tap beside the cake: a little puff of sugar where it landed, nothing else.
      sound.click()
      return
    }
    L.group.worldToLocal(local)
  } else {
    const counts = cake.layers.map((l) => l.decor.children.length + Math.random() * 1.5)
    L = cake.layers[counts.indexOf(Math.min(...counts))]
    const a = (Math.random() - 0.5) * 2.4
    local.set(Math.sin(a) * L.w * 0.5, STEP * 0.5, Math.cos(a) * L.w * 0.5)
  }
  if (source === 'cake') {
    D.idle = 0
    $('hint').classList.add('hidden')
  }
  if (source !== 'shower') D.quiet = 0
  const o = makeTopping(key)
  const pivot = new THREE.Group()
  pivot.userData.colour = d.colour
  const r = Math.hypot(local.x, local.z)
  const onTop = L === cake.layers[cake.layers.length - 1] && local.y > STEP * 0.8 && r < L.w * 0.44
  if (onTop) {
    // Standing up on the top of the cake
    o.position.set(local.x, STEP * 0.97, local.z)
    pivot.userData.top = local.x / L.w
    o.rotation.y = Math.random() * Math.PI * 2
  } else {
    pivot.rotation.y = Math.atan2(local.x, local.z)
    o.position.set(0, clamp(local.y + d.y - 0.13, 0.02, STEP - 0.06), L.w / 2 - (d.tilt ? 0.02 : 0.005))
    o.rotation.x = d.tilt
    o.rotation.z = d.tilt ? 0 : (Math.random() - 0.5) * 0.6
  }
  o.scale.setScalar(0.001)
  pivot.add(o)
  L.decor.add(pivot)
  const size = 0.9 + Math.random() * 0.25
  tween(0.32, (t) => o.scale.setScalar(Math.max(0.001, size * ease.outBack(t))))
  L.sq = Math.max(L.sq, 0.12)
  cake.wobble = Math.max(cake.wobble, 0.03)
  sound.pop(0, D.placed % 10)
  const p = new THREE.Vector3()
  o.updateWorldMatrix(true, false)
  o.getWorldPosition(p)
  effects.sparkleAt(p, '#fff3a0', 4)
  if (source !== 'shower') D.placed++
  // The friend's own favourite (the topping they brought) always gets a happy hop.
  if (source !== 'shower' && key === customerDef(game.level).topping) {
    customer?.cheer(0.9)
    if (D.placed % 3 === 1) sound.voice(customer.def.animal)
  } else if (source !== 'shower' && D.placed % 4 === 0) customer?.cheer(0.8)
  // At the eighth topping, a surprise: a shower of toppings rains onto the cake by itself.
  if (D.placed === 8 && !D.shower) toppingShower(D)
  // The candle button grows a little once the cake is looking lovely.
  updateDecoratingReady()
  // The idle update finishes a full cake only after six seconds of decorating.
}

function toppingShower(D) {
  D.shower = true
  const run = game.run
  sound.grow()
  effects.drift(1.6, topY() + 1.2, 16, cake.group.position.x)
  const pick = D.pick
  for (let k = 0; k < 7; k++) {
    setTimeout(() => {
      if (run !== game.run || decorating !== D) return
      D.pick = (Math.random() * D.keys.length) | 0
      addTopping(null, 'shower')
      D.pick = pick
      renderTray()
    }, 250 + k * 160)
  }
  for (const f of [customer]) f?.cheer(2)
}

/** The candle button: decorating is finished. */
/** Two friends from other cakes, wearing their party hats. */
function popGuests(run) {
  const host = customerDef(game.level)
  const defs = []
  for (let k = 1; defs.length < 2; k++) {
    const f = CUSTOMERS[(game.level - 1 + k * 3) % CUSTOMERS.length]
    if (f.animal !== host.animal && !defs.includes(f)) defs.push(f)
  }
  const cx = cake.group.position.x
  const spots = [
    { x: cx - 1.45, z: -1.1, ry: 0.45 },
    { x: customer.group.position.x + 0.95, z: -1.5, ry: -0.55 },
  ]
  defs.forEach((def, i) => {
    const g = animals.make(def)
    const s = spots[i]
    g.group.scale.setScalar(1.55)
    g.group.position.set(s.x, FLOOR_Y - 1.9, s.z)
    g.group.rotation.y = s.ry
    scene.add(g.group)
    guests.push(g)
    setTimeout(() => {
      if (run !== game.run) return
      sound.voice(def.animal)
      tween(0.5, (t) => (g.group.position.y = lerp(FLOOR_Y - 1.9, FLOOR_Y + 0.62, ease.outBack(t))))
    }, i * 260)
  })
}

function clearGuests() {
  for (const g of guests) g.group.removeFromParent()
  guests = []
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
  // On some cakes a guest leans in and helps blow (on the second puff of trick candles, always).
  const helper = (cake.candleStyle === 'helper' || cake.relit) && guests[0]
  if (helper) {
    helper.blowDir = 1
    tween(0.3, (t) => (helper.blow = t)).then(() => tween(0.5, (t) => (helper.blow = 1 - t)))
    for (let k = 0; k < 3; k++) setTimeout(() => run === game.run && effects.breath(helper.mouthWorld, candleCenter()), 60 + k * 120)
  }
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
  // Trick candles: a moment later they flicker back on, one by one! Everyone gasps, and the child blows again.
  if (cake.candleStyle === 'trick' && !cake.relit) {
    cake.relit = true
    await wait(0.7)
    if (run !== game.run) return
    for (const cd of cake.candles) {
      cd.lit = true
      sound.match()
      await wait(0.16)
      if (run !== game.run) return
    }
    for (const f of [c, ...guests]) f.surprised()
    sound.wobble()
    game.idle = 0
    game.state = 'candles'
    showIntro('', '🌬️🕯️🌬️', '', true)
    setTimeout(() => run === game.run && game.state === 'candles' && showHintAt(candleCenter()), 2500)
    return
  }

  // Party poppers from both sides, slow paper petals, and Happy Birthday on the music box while everyone dances.
  const cx = cake.group.position.x
  const top = topY()
  sound.popper()
  effects.confetti(new THREE.Vector3(cx - 1.3, 0.2, 0.5), 1)
  setTimeout(() => {
    if (run !== game.run) return
    sound.popper(1)
    effects.confetti(new THREE.Vector3(cx + 1.3, 0.2, 0.5), -1)
  }, 180)
  effects.drift(2.2, top + 1.1, 24, cx)
  const tune = sound.birthday()
  c.cheer(Math.max(3, tune))
  c.group.rotation.y = 0
  for (const [i, g] of guests.entries()) setTimeout(() => run === game.run && g.cheer(Math.max(3, tune - 0.4)), 150 + i * 200)
  if (cake.figure) cake.figure.cheer(3)
  await wait(1.4)
  if (run !== game.run) return
  // The party bonus: balloons to pop for one friend, presents to open for the next.
  await partyBonus(run)
  if (run !== game.run) return
  showCard()
}

// --- Party bonus: balloons and presents ----------------------------------------------------------------

const BALLOON_COLOURS = ['#ff6fae', '#ffd23f', '#4fd1b5', '#9b7cf7', '#7bc8ff', '#ffb347', '#ff8f8f']
const balloonGeo = new THREE.SphereGeometry(0.22, 24, 16).scale(1, 1.18, 1)
const knotGeo = new THREE.ConeGeometry(0.04, 0.06, 10).translate(0, -0.27, 0)
const stringGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.55, 4).translate(0, -0.56, 0)
const stringMat = new THREE.MeshBasicMaterial({ color: '#c9a3b8' })
const bubbleGeo = new THREE.SphereGeometry(0.22, 24, 16)
const shineGeo = new THREE.SphereGeometry(0.045, 10, 8).scale(1, 0.6, 0.4)
const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 })
let balloons = [] // { group, v, phase }
let presents = [] // { group, lid, open }
let bonus = null // { run, done, idle }

function makeBalloon(pos, colour = BALLOON_COLOURS[(Math.random() * BALLOON_COLOURS.length) | 0]) {
  const bubble = colour === null
  const group = new THREE.Group()
  let body
  if (bubble) {
    body = new THREE.Mesh(bubbleGeo, bubbleMat)
    const shine = new THREE.Mesh(shineGeo, shineMat)
    shine.position.set(-0.07, 0.08, 0.15)
    group.add(body, shine)
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.3, metalness: 0.05 })
    body = new THREE.Mesh(balloonGeo, mat)
    body.castShadow = true
    group.add(body, new THREE.Mesh(knotGeo, mat), new THREE.Mesh(stringGeo, stringMat))
  }
  group.position.copy(pos)
  group.scale.setScalar(0.001)
  scene.add(group)
  const b = { group, body, bubble, size: bubble ? 0.6 + Math.random() * 0.45 : 1, colour: bubble ? '#cfefff' : colour, v: (bubble ? 0.35 : 0.5) + Math.random() * 0.25, phase: Math.random() * 6, age: 0 }
  balloons.push(b)
  return b
}

function makePresent(x, colour, ribbon) {
  const group = new THREE.Group()
  const boxMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 })
  const ribMat = new THREE.MeshStandardMaterial({ color: ribbon, roughness: 0.4 })
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34).translate(0, 0.14, 0), boxMat)
  const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.285, 0.345).translate(0, 0.14, 0), ribMat)
  const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.285, 0.07).translate(0, 0.14, 0), ribMat)
  const lid = new THREE.Group()
  lid.position.y = 0.28
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.38).translate(0, 0.035, 0), boxMat))
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.385).translate(0, 0.035, 0), ribMat))
  for (const sx of [-1, 1]) {
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8).scale(1.3, 0.8, 0.7), ribMat)
    bow.position.set(sx * 0.06, 0.1, 0)
    lid.add(bow)
  }
  group.add(box, band1, band2, lid)
  group.traverse((m) => m.isMesh && (m.castShadow = true))
  group.position.set(x, 3, 0.78)
  group.rotation.y = (Math.random() - 0.5) * 0.6
  scene.add(group)
  const p = { group, box, lid, open: false }
  presents.push(p)
  return p
}

/** The party bonus: each friend brings one or two (balloons, presents, bubbles, a piñata, fireworks, falling stars). */
function partyBonus(run) {
  game.state = 'bonus'
  // The dots step aside, so nothing covers the presents on the counter.
  $('hud').classList.add('carding')
  const kinds = customerDef(game.level).bonus
  return new Promise((resolve) => {
    bonus = { run, kinds, idle: 0, quiet: 0, age: 0, autos: 0, launched: 0, note: 0, toSpawn: 0, unstarted: kinds.length, done: () => {
      bonus = null
      resolve()
    } }
    kinds.forEach((kind, i) => setTimeout(() => bonus?.run === run && run === game.run && startBonus(kind, run), i * 700))
  })
}

const portrait = () => camera.aspect < 0.8
// Keep bonus centres inside the phone frame, with room for their edges.
const bonusX = (x) => {
  // Project the safe screen edges onto the presents' plane, including perspective and camera pitch.
  const edge = (nx) => {
    const v = new THREE.Vector3(nx, 0, 0.5).unproject(camera).sub(camera.position)
    return camera.position.x + v.x * ((0.78 - camera.position.z) / v.z)
  }
  return clamp(x, edge(-0.82) + 0.22, edge(0.82) - 0.22)
}
const onScreen = (pos) => {
  const v = pos.clone().project(camera)
  return Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.85 && Math.abs(v.z) < 1
}
/** Something this bonus will bring in a moment: it counts as still to come, so the party never ends early. */
function later(ms, run, fn) {
  bonus.toSpawn++
  setTimeout(() => {
    if (!bonus || run !== game.run) return
    bonus.toSpawn--
    fn()
  }, ms)
}

function startBonus(kind, run) {
  bonus.unstarted--
  const cx = cake.group.position.x
  if (kind === 'balloons' || kind === 'bubbles') {
    const bubbles = kind === 'bubbles'
    const n = bubbles ? 10 : 7
    for (let i = 0; i < n; i++) {
      later(i * (bubbles ? 260 : 380), run, () => {
        const x = bonusX(camGoal.x + (((i * 0.37) % 1) * 2 - 1) * (camGoal.halfW - 0.3) * 0.75)
        const b = makeBalloon(new THREE.Vector3(x, bubbles ? 0.4 : -0.2, 1.0 + Math.random() * 0.4), bubbles ? null : undefined)
        tween(0.4, (t) => b.group.scale.setScalar(Math.max(0.001, ease.outBack(t) * b.size)))
      })
    }
  } else if (kind === 'presents') {
    // Five presents tumble onto the counter, each with a different surprise inside.
    const colours = [['#8ce99a', '#ff6fae'], ['#7bc8ff', '#ffd23f'], ['#ffb3d1', '#9b7cf7'], ['#ffd23f', '#4fd1b5'], ['#b197fc', '#ffffff']]
    const inside = shuffle(['balloon', 'friend', 'stars', 'bubbles', 'sweets'])
    ;[-1.6, -0.8, 0, 0.8, 1.6].forEach((dx, i) =>
      later(i * 240, run, () => {
        const p = makePresent(bonusX(camGoal.x + dx * Math.min(1, (camGoal.halfW - 0.5) / 1.6)), ...colours[i])
        p.inside = inside[i]
        tween(0.55, (t) => (p.group.position.y = 3 * (1 - ease.outBounce(t)))).then(() => run === game.run && sound.plop())
      }),
    )
  } else if (kind === 'pinata') {
    pinata = makePinata(bonusX(cx - (portrait() ? 0.62 : 1.0)), topY() + (portrait() ? 0.55 : 0.9))
  } else if (kind === 'stars') {
    // Stars drift down from the sky; each one caught rings the next note of a little tune.
    for (let i = 0; i < 9; i++) {
      later(i * 550, run, () => {
        const o = cakeKit.topper('topper_star')
        o.scale.setScalar(3)
        o.position.set(camGoal.x + (((i * 0.53) % 1) * 2 - 1) * (camGoal.halfW - 0.3) * 0.7, camNow.y + 2.6, 0.6)
        scene.add(o)
        skyStars.push({ obj: o, v: 0.55 + Math.random() * 0.2, phase: Math.random() * 6 })
      })
    }
  } else {
    // Gentle fireworks: five go up by themselves, and every tap on the sky sends up another.
    bonus.autos += 5
    for (let i = 0; i < 5; i++) {
      later(300 + i * 650, run, () => {
        bonus.autos--
        launch(camGoal.x + (((i * 0.43) % 1) * 2 - 1) * (camGoal.halfW - 0.3) * 0.7, true)
      })
    }
  }
}
const shuffle = (list) => list.map((f) => [Math.random(), f]).sort((x, y) => x[0] - y[0]).map(([, f]) => f)

// Bubbles: see-through, a soft shine, and a "bloop" when popped.
const bubbleMat = new THREE.MeshStandardMaterial({ color: '#cfefff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false })

// --- The piñata: a big star on a string over the party. Each tap swings it; the seventh bursts it. ---

const PINATA_HITS = 7
let pinata = null
function makePinata(x, y) {
  const group = new THREE.Group()
  const body = new THREE.Group()
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), shiny('#ffd23f'))
  body.add(core)
  const tips = ['#ff6fae', '#4fd1b5', '#9b7cf7', '#7bc8ff', '#ffb347']
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 12), shiny(tips[k]))
    cone.position.set(Math.sin(a) * 0.24, Math.cos(a) * 0.24, 0)
    cone.rotation.z = -a
    body.add(cone)
  }
  body.scale.setScalar(1.5)
  body.position.y = -0.75
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4).translate(0, -0.25, 0), stringMat)
  group.add(string, body)
  group.position.set(x, y + 3, 0.5)
  group.traverse((m) => m.isMesh && (m.castShadow = true))
  scene.add(group)
  const p = { group, body, hits: 0, angle: 0, v: 0, y }
  // It lowers in on its string.
  tween(0.8, (t) => (group.position.y = y + 3 * (1 - ease.outBack(t))))
  return p
}

function hitPinata() {
  const p = pinata
  p.hits++
  p.v += (Math.random() < 0.5 ? -1 : 1) * (2.6 + p.hits * 0.25)
  if (bonus) bonus.idle = 0
  $('hint').classList.add('hidden')
  const at = new THREE.Vector3()
  p.body.getWorldPosition(at)
  if (p.hits < PINATA_HITS) {
    sound.plop(4)
    sound.pop(0, p.hits * 2)
    effects.sparkleAt(at, '#fff3a0', 5)
    // A few sweets shake loose on the later hits
    if (p.hits >= 4) dropSweet(at)
    const s = 1.5
    p.body.scale.setScalar(s * 1.15)
    tween(0.25, (t) => p.body.scale.setScalar(s * lerp(1.15, 1, t)))
    ;[customer, ...guests][p.hits % (guests.length + 1)]?.hop(0.25)
    return
  }
  // Burst! Confetti both ways and a shower of sweets that bounce on the counter.
  sound.popper()
  sound.popper(1)
  effects.confetti(at, 1, 34)
  effects.confetti(at, -1, 34)
  for (let k = 0; k < 8; k++) dropSweet(at)
  p.group.removeFromParent()
  pinata = null
  for (const f of [customer, ...guests]) f?.cheer(1.6)
}

// --- Sweets: they bounce on the counter, and every tap bounces them again ---

let sweets = [] // { obj, v, spin }
function dropSweet(at, kind = 'candy') {
  const o = kind === 'star' ? cakeKit.topper('topper_star') : makeTopping('candy')
  o.scale.setScalar(kind === 'star' ? 2.4 : 2)
  o.position.copy(at)
  scene.add(o)
  sweets.push({ obj: o, v: new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2, 0.3 + Math.random() * 0.5), spin: (Math.random() - 0.5) * 8 })
}

function updateSweets(dt) {
  for (const sw of sweets) {
    const o = sw.obj
    sw.v.y -= 9.8 * dt
    o.position.addScaledVector(sw.v, dt)
    o.position.z = Math.min(o.position.z, COUNTER_Z * 0.75)
    o.rotation.z += sw.spin * dt
    o.rotation.x += sw.spin * 0.5 * dt
    if (o.position.y < 0.06 && sw.v.y < 0) {
      o.position.y = 0.06
      sw.v.y = -sw.v.y * 0.5
      sw.v.x *= 0.7
      sw.spin *= 0.7
      if (sw.v.y > 0.6) sound.blob()
      if (sw.v.y < 0.3) sw.v.set(0, 0, 0)
    }
  }
}

// --- Gentle fireworks: rich colour blooms that fade slowly, never a flash ---

let rockets = []
const FIREWORK = ['#ff3d8b', '#ffc300', '#22d39a', '#7b4dff', '#1e9bff', '#ff7a1a']
const FIREWORK_CAP = 25
function launch(x, auto = false) {
  if (!bonus || (!auto && (bonus.launched >= FIREWORK_CAP || bonus.age > 20))) return false
  bonus.launched++
  const top = camNow.y + 1.0 + Math.random() * 0.9
  rockets.push({ pos: new THREE.Vector3(bonusX(x), 0.2, -0.6), top, colour: FIREWORK[(Math.random() * FIREWORK.length) | 0], trail: 0 })
  sound.whistle()
  return true
}

function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]
    r.pos.y += dt * 3.4
    if ((r.trail -= dt) <= 0) {
      r.trail = 0.05
      effects.sparkleAt(r.pos, r.colour, 1)
    }
    if (r.pos.y >= r.top) {
      effects.bloom(r.pos, r.colour)
      sound.bloom()
      rockets.splice(i, 1)
      ;[customer, ...guests][(Math.random() * (guests.length + 1)) | 0]?.cheer(0.6)
    }
  }
}

// --- Falling stars to catch ---

let skyStars = [] // { obj, v, phase }
const TUNE = [0, 0, 4, 4, 5, 5, 4, 3, 3]
function catchStar(st) {
  skyStars.splice(skyStars.indexOf(st), 1)
  st.obj.removeFromParent()
  effects.bloom(st.obj.position, '#ffc300', 18)
  sound.perfect(TUNE[bonus ? bonus.note++ % TUNE.length : 0])
  if (bonus) bonus.idle = 0
  $('hint').classList.add('hidden')
  ;[customer, ...guests][(Math.random() * (guests.length + 1)) | 0]?.cheer(0.7)
}

// --- Bonus loop, hints and taps ---

const boxFriends = [] // little friends who popped out of presents
function updateBonus(dt, t) {
  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i]
    b.age += dt
    b.group.position.y += b.v * dt
    b.group.position.x = bonusX(b.group.position.x + Math.sin(t * (b.bubble ? 2.4 : 1.3) + b.phase) * (b.bubble ? 0.25 : 0.12) * dt)
    b.group.rotation.z = Math.sin(t * 1.6 + b.phase) * 0.12
    if (b.group.position.y > camNow.y + 4 || b.age > 16) {
      b.group.removeFromParent()
      balloons.splice(i, 1)
    }
  }
  for (let i = skyStars.length - 1; i >= 0; i--) {
    const st = skyStars[i]
    st.obj.position.y -= st.v * dt
    st.obj.position.x = bonusX(st.obj.position.x + Math.sin(t * 1.4 + st.phase) * 0.15 * dt)
    st.obj.rotation.z += dt * 1.5
    // A star nobody caught lands softly on the counter and fades.
    if (st.obj.position.y < 0.15) {
      st.obj.removeFromParent()
      skyStars.splice(i, 1)
    }
  }
  if (pinata) {
    // A swinging pendulum that slowly settles
    pinata.v += (-pinata.angle * 9 - pinata.v * 1.2) * dt
    pinata.angle += pinata.v * dt
    pinata.group.rotation.z = pinata.angle
    pinata.body.rotation.y += dt * 0.8
  }
  updateSweets(dt)
  updateRockets(dt)
  for (const f of boxFriends) f.update(dt, t, camera.position)
  if (!bonus) return
  bonus.idle += dt
  bonus.quiet += dt
  bonus.age += dt
  const shut = presents.filter((p) => !p.open)
  // Still to come counts too: items not yet spawned and bonuses not yet started.
  const pendingNow = () => balloons.length + presents.filter((p) => !p.open).length + (pinata ? 1 : 0) + rockets.length + bonus.autos + skyStars.length + bonus.toSpawn + bonus.unstarted
  const pending = pendingNow()
  if (pending) bonus.started = true
  // Everything popped, opened, caught or burst: the card comes after a moment (fireworks wait for a quiet sky).
  const fireworks = bonus.kinds.includes('fireworks')
  const settle = !fireworks || bonus.quiet > 2.2 || bonus.launched >= FIREWORK_CAP || bonus.age > 20
  if (game.state === 'bonus' && bonus.started && !pending && settle && !bonus.ending) {
    bonus.ending = true
    const run = bonus.run
    const b = bonus
    setTimeout(() => {
      if (run !== game.run || bonus !== b) return
      // Something new may have arrived meanwhile: then the party goes on.
      if (pendingNow()) b.ending = false
      else b.done()
    }, 900)
  }
  // A child who would rather watch gets the card anyway; whatever is left stays to play with.
  if (game.state === 'bonus' && bonus.idle > 9) {
    // Open the remaining gifts gently before the shelf arrives; automatic play isn't a productive tap.
    if (shut.length) {
      openPresent(shut[0])
      bonus.idle = 8.6
      bonus.autoOpening = true
    } else if (!bonus.autoOpening || bonus.idle > 11) return bonus.done()
  }
  if (bonus.idle > 3.5 && $('hint').classList.contains('hidden')) {
    const target = [...shut.map((p) => p.group.position), ...(pinata ? [pinata.body.getWorldPosition(new THREE.Vector3())] : []), ...skyStars.map((s) => s.obj.position), ...balloons.map((b) => b.group.position), ...(fireworks ? [new THREE.Vector3(camGoal.x, camNow.y + 1, 0)] : [])].find(onScreen)
    if (target) showHintAt(target)
  }
}

/**
 * A tap on a balloon or bubble pops it, on a present opens it, on the piñata whacks it, on a star catches it,
 * on a sweet bounces it; fireworks go up anywhere. Everything has a generous reach for small fingers.
 */
function tapBonus(e) {
  if (e.clientX === undefined) {
    // Keyboard: the first thing still waiting.
    const p = presents.find((q) => !q.open)
    if (p) return openPresent(p), true
    if (pinata) return hitPinata(), true
    if (skyStars[0]) return catchStar(skyStars[0]), true
    if (balloons[0]) return popBalloon(balloons[0]), true
    if (bonus?.kinds.includes('fireworks') && launch(camGoal.x + (Math.random() - 0.5) * 2)) return (bonus.idle = bonus.quiet = 0), true
    return false
  }
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(pointer, camera)
  const pt = new THREE.Vector3()
  let best = null
  let bestD = Infinity
  const consider = (item, centre, reach) => {
    if (ray.ray.distanceToPoint(centre) > reach) return
    const d = ray.ray.origin.distanceTo(centre)
    if (d < bestD) [best, bestD] = [item, d]
  }
  for (const b of balloons) consider(b, b.group.position, 0.38 * b.size)
  for (const p of presents) if (!p.open) consider(p, pt.copy(p.group.position).setY(p.group.position.y + 0.18).clone(), 0.32)
  if (pinata) consider(pinata, pinata.body.getWorldPosition(new THREE.Vector3()), 0.55)
  for (const st of skyStars) consider(st, st.obj.position, 0.45)
  for (const sw of sweets) consider(sw, sw.obj.position, 0.3)
  if (best) {
    if (bonus) bonus.idle = 0
    if (best === pinata) hitPinata()
    else if (best.lid) openPresent(best)
    else if (skyStars.includes(best)) catchStar(best)
    else if (sweets.includes(best)) {
      best.v.set((Math.random() - 0.5) * 1.5, 3.4, 0)
      best.spin = (Math.random() - 0.5) * 10
      sound.pop(0, 6)
      effects.sparkleAt(best.obj.position, '#fff3a0', 3)
    } else popBalloon(best)
    return true
  }
  // Fireworks: a tap on the sky sends one up right there.
  if (bonus?.kinds.includes('fireworks')) {
    const p = ray.ray.at((0.6 - ray.ray.origin.z) / ray.ray.direction.z, new THREE.Vector3())
    if (!launch(p.x)) return false
    bonus.idle = bonus.quiet = 0
    return true
  }
  return false
}

function popBalloon(b) {
  balloons.splice(balloons.indexOf(b), 1)
  b.group.removeFromParent()
  if (b.bubble) {
    sound.bloop()
    effects.sparkleAt(b.group.position, '#dff6ff', 8)
  } else {
    sound.balloonPop()
    effects.confetti(b.group.position, Math.random() < 0.5 ? 1 : -1, 14)
  }
  effects.sparkleAt(b.group.position, '#ffffff', 5)
  if (bonus) bonus.idle = 0
  $('hint').classList.add('hidden')
  ;[customer, ...guests][(Math.random() * (guests.length + 1)) | 0]?.cheer(0.8)
}

function openPresent(p) {
  p.open = true
  if (bonus) bonus.idle = 0
  $('hint').classList.add('hidden')
  sound.popper()
  const lid = p.lid
  const spin = (Math.random() - 0.5) * 6
  tween(0.8, (t) => {
    lid.position.y = 0.28 + Math.sin(t * Math.PI * 0.9) * 0.9 + t * 0.2
    lid.position.x = t * spin * 0.08
    lid.rotation.z = t * spin
  }).then(() => lid.removeFromParent())
  p.box.scale.set(1.15, 0.8, 1.15)
  tween(0.3, (t) => p.box.scale.set(lerp(1.15, 1, t), lerp(0.8, 1, t), lerp(1.15, 1, t)))
  const at = p.group.position.clone().add(new THREE.Vector3(0, 0.35, 0))
  effects.confetti(at, -1, 10)
  effects.confetti(at, 1, 10)
  customer?.cheer(1)
  // What's inside?
  if (p.inside === 'friend') {
    // A little friend jumps up out of the box and waves.
    const def = CUSTOMERS[(Math.random() * CUSTOMERS.length) | 0]
    const f = animals.make(def)
    f.group.scale.setScalar(0.001)
    f.group.position.set(0, 0.1, 0)
    p.group.add(f.group)
    boxFriends.push(f)
    tween(0.5, (t) => {
      f.group.scale.setScalar(Math.max(0.001, 0.62 * ease.outBack(t)))
      f.group.position.y = 0.1 + ease.outBack(t) * 0.12
    }).then(() => f.cheer(2.5))
    sound.voice(def.animal, 0.15)
  } else if (p.inside === 'stars') {
    for (let k = 0; k < 6; k++) dropSweet(at, 'star')
    effects.bloom(at, '#ffc300', 16)
    sound.grow()
  } else if (p.inside === 'bubbles') {
    for (let k = 0; k < 4; k++) {
      const b = makeBalloon(at.clone().add(new THREE.Vector3((k - 1.5) * 0.12, 0.1 + k * 0.08, 0.05)), null)
      tween(0.4, (t) => b.group.scale.setScalar(Math.max(0.001, ease.outBack(t) * b.size)))
    }
    sound.bloop()
  } else if (p.inside === 'sweets') {
    for (let k = 0; k < 6; k++) dropSweet(at)
  } else {
    const b = makeBalloon(at.clone().add(new THREE.Vector3(0, 0.3, 0.05)))
    b.v = 0.4
    tween(0.5, (t) => b.group.scale.setScalar(Math.max(0.001, ease.outBack(t))))
  }
}

function clearBonus() {
  for (const b of balloons) b.group.removeFromParent()
  for (const p of presents) p.group.removeFromParent()
  for (const sw of sweets) sw.obj.removeFromParent()
  for (const st of skyStars) st.obj.removeFromParent()
  pinata?.group.removeFromParent()
  pinata = null
  rockets = []
  balloons = []
  presents = []
  sweets = []
  skyStars = []
  boxFriends.length = 0
  bonus = null
}

// Every finished cake goes on the bakery shelf, kept between visits (the newest twelve).
const SHELF_KEY = 'cake-stack-shelf'
let shelf = []
try {
  shelf = JSON.parse(localStorage.getItem(SHELF_KEY) || '[]').filter((c) => c && Array.isArray(c.l)).slice(-12)
} catch {}

/** A small drawn cake: its real layers at their real widths, gold rims, topping dots, a crown, the friend on top. */
function miniCake(c, fresh) {
  const el = document.createElement('div')
  el.className = `mini${fresh ? ' fresh' : ''}`
  const face = Object.assign(document.createElement('span'), { className: 'mini-face', textContent: c.c ? `👑` : c.e })
  if (c.c) face.dataset.friend = c.e
  const stack = document.createElement('div')
  stack.className = 'mini-stack'
  c.l.forEach((f, k) => {
    const fl = FLAVOURS[f] || FLAVOURS.vanilla
    const layer = document.createElement('i')
    layer.style.width = `${Math.round(clamp((c.w?.[k] ?? 1) / 1.55, 0.3, 1) * 100)}%`
    layer.style.background = fl.rainbow ? 'linear-gradient(90deg, #ff6b6b, #ffe066, #69db7c, #74c0fc, #b197fc)' : fl.icing
    layer.style.borderBottomColor = fl.sponge
    if (c.g?.[k]) layer.classList.add('gold')
    // Each topping as a coloured dot where it sits round the front of the layer
    for (const [x, colour] of c.t?.[k] || []) {
      const dot = document.createElement('b')
      dot.style.left = `${x}%`
      dot.style.background = colour
      layer.append(dot)
    }
    stack.prepend(layer)
  })
  el.append(face, stack)
  return el
}

/** The toppings on a layer's front half, as [left %, colour] for the shelf. */
function layerDots(L) {
  const dots = []
  for (const pivot of L.decor.children) {
    const a = pivot.rotation.y
    const top = pivot.userData.top
    // Side toppings sit at their angle (the back ones are out of sight); ones standing on top at their x.
    if (top === undefined && Math.cos(a) < -0.1) continue
    const x = top ?? Math.sin(a) / 2
    dots.push([Math.round(clamp(50 + x * 90, 4, 96)), pivot.userData.colour || '#ff6fae'])
  }
  return dots.slice(0, 10)
}

function showCard() {
  game.state = 'card'
  $('hint').classList.add('hidden')
  const def = customerDef(game.level)
  $('card-emoji').textContent = `${def.emoji}🎂`
  if (cake && !cake.shelved) {
    cake.shelved = true
    shelf.push({
      e: def.emoji,
      l: cake.layers.map((l) => l.flavour),
      w: cake.layers.map((l) => Math.round(l.w * 100) / 100),
      g: cake.layers.map((l) => (l.gold ? 1 : 0)),
      t: cake.layers.map(layerDots),
      c: cake.crown ? 1 : 0,
    })
    shelf = shelf.slice(-12)
    try {
      localStorage.setItem(SHELF_KEY, JSON.stringify(shelf))
    } catch {}
  }
  // The shelf of cakes, the newest one bigger, popping on at the end with a sparkle.
  const shown = shelf.slice(camera.aspect > 1.2 || innerWidth > 560 ? -6 : -4)
  $('shelf').replaceChildren(...shown.map((c, i) => miniCake(c, i === shown.length - 1)))
  // A peek of who comes next, on the ▶ button
  $('next-peek').textContent = customerDef(game.level + 1).emoji
  sound.grow()
  $('card').classList.remove('hidden')
  $('hud').classList.add('carding', 'card-up')
}

/** Deliver the finished cake (it slides away with its friends) and bring in the next one. */
async function nextCake() {
  if (game.state !== 'card') return
  const run = game.run
  sound.click()
  $('card').classList.add('hidden')
  $('hud').classList.remove('carding', 'card-up')
  game.state = 'intro'
  const old = cake
  const oldC = customer
  const movers = [old.group, oldC.group, ...guests.map((g) => g.group), ...presents.map((p) => p.group)]
  const x0 = movers.map((g) => g.position.x)
  oldC.cheer(1.2)
  for (const g of guests) g.cheer(1.2)
  await tween(0.8, (t) => {
    const e = ease.inCubic(t)
    movers.forEach((g, i) => (g.position.x = x0[i] + e * 9))
  })
  if (run !== game.run) return
  disposeCake(old)
  oldC.group.removeFromParent()
  clearGuests()
  clearBonus()
  clearButterfly()
  game.level += 1
  startLevel(run)
}

async function startLevel(run) {
  game.state = 'intro'
  $('hud').classList.remove('partying')
  game.streak = 0
  game.tumbles = 0
  game.cakes = (game.cakes || 0) + 1
  game.lastFlavour = null
  const def = customerDef(game.level)
  cake = newCake(-9, def.hat)
  // This friend's twist: a wobbly jelly cake, a slim tower, a big wide cake, or a butterfly to bump.
  cake.twists = def.twists
  // Candles vary from cake to cake: plain, trick candles that relight once, or a guest who helps blow.
  cake.candleStyle = game.level === 1 ? 'plain' : ['trick', 'helper', 'plain'][game.level % 3]
  cake.startW = twisted('narrow') ? 0.85 : twisted('wide') ? 1.75 : START_W
  // Every other friend's careful cake tapers a little toward the top (none for the slim towers).
  cake.taper = game.level % 2 === 0 && !twisted('narrow') ? 0.035 : 0
  if (twisted('butterfly')) butterfly = makeButterfly()
  customer = animals.make(def)
  customer.group.scale.setScalar(1.85)
  customer.group.position.set(view.custX, FLOOR_Y - 1.9, -1.5)
  scene.add(customer.group)
  buildPips(targetLayers())
  updateHud()
  // The new cake stand slides in and the birthday friend pops up behind the counter
  const c = cake
  // The new stand slides in and lands with a little bounce.
  tween(0.8, (t) => {
    c.group.position.x = -9 * (1 - ease.outCubic(Math.min(1, t * 1.25)))
    c.group.position.y = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.18 : 0
  }).then(() => run === game.run && (sound.plop(), effects.sparkleAt(new THREE.Vector3(0, STAND_TOP, 0.4), '#ffffff', 4)))
  await wait(0.35)
  if (run !== game.run) return
  sound.voice(def.animal)
  tween(0.5, (t) => (customer.group.position.y = lerp(FLOOR_Y - 1.9, view.custY, ease.outBack(t))))
  // The intro bubble: the friend, the new flavour and topping they bring, and their twist.
  const firstVisit = game.level <= CUSTOMERS.length
  const fresh = (firstVisit && def.unlock ? FLAVOURS[def.unlock].emoji : '') + (def.topping ? TOPPINGS[def.topping].emoji : '')
  const TWIST = { jelly: '🍮', butterfly: '🦋', narrow: '🗼', wide: '↔️' }
  showIntro(`${def.emoji}🎂`, fresh ? `✨${fresh}✨` : '🎈🎈🎈', def.twists.map((t) => TWIST[t]).join(''))
  await wait(1.4)
  if (run !== game.run) return
  game.state = 'play'
  game.idle = 0
  spawnMover()
  // A child who has never dropped a layer gets the finger after a few seconds of not tapping.
  if (!game.firstDrop) setTimeout(() => run === game.run && !game.firstDrop && game.state === 'play' && mover && showHintAt(null), 4000)
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

/** One dot per layer the friend's cake will have, then the friend's face at the top. */
function buildPips(n) {
  const el = $('pips')
  el.classList.remove('full')
  el.innerHTML = ''
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span')
    p.className = 'pip'
    el.appendChild(p)
  }
  const goal = document.createElement('span')
  goal.className = 'pip-goal'
  goal.textContent = customerDef(game.level).emoji
  el.appendChild(goal)
}

/** Each landed layer fills its dot with its own icing colour. */
function updateHud() {
  const pips = $('pips').querySelectorAll('.pip')
  const layers = cake ? cake.layers : []
  pips.forEach((p, i) => {
    const f = i < layers.length ? FLAVOURS[layers[i].flavour] : null
    p.classList.toggle('on', !!f)
    p.style.background = f ? (f.rainbow ? 'conic-gradient(#ff6b6b, #ffe066, #69db7c, #74c0fc, #b197fc, #ff6b6b)' : f.icing) : ''
    // The sponge colour rings each landed layer, so pale icings (vanilla) still read as filled
    p.style.borderColor = f ? f.sponge : ''
  })
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
/** A child who stops tapping for a while gets the finger again, pointing at the top of the cake. */
function updateDecoratingReady() {
  const ready = !!decorating && decorating.placed > 0 && performance.now() - decorating.since >= 2000
  if (ready && !decorating.ready) {
    decorating.ready = true
    sound.grow()
    $('done').animate([{ scale: 1 }, { scale: 1.16 }, { scale: 1 }], { duration: 450, easing: 'ease-out' })
  }
  $('done').classList.toggle('ready', ready)
  $('done').setAttribute('aria-disabled', String(!ready))
  return ready
}
function updateIdle(dt) {
  if (decorating) {
    const D = decorating
    D.idle += dt
    D.quiet += dt
    const ready = updateDecoratingReady()
    if ((D.placed >= MAX_TOPPINGS && performance.now() - D.since >= 6000) || D.quiet > (D.placed >= 10 ? 6 : 14)) {
      sound.grow()
      D.done(true)
      return
    }
    if ($('hint').classList.contains('hidden') && D.idle > (D.placed ? 5 : 2.5)) {
      showHintAt(ready ? $('done') : new THREE.Vector3(cake.group.position.x, topY() * 0.55, 0.65))
    }
    return
  }
  if (game.state === 'candles') {
    game.idle += dt
    if (game.idle >= 10) blowCandles()
    return
  }
  if (game.state !== 'play' || (mover && mover.dropping)) return
  game.idle += dt
  if (game.idle > 12 && mover && $('hint').classList.contains('hidden')) showHintAt(null)
}

function updateHint() {
  const el = $('hint')
  if (el.classList.contains('hidden')) return
  // The tap hint points at the top of the cake, where the sliding layer will land
  const pos = hintAt.pos || (cake && game.state === 'play' ? hintSpot.set(cake.group.position.x + topLayer().x + leanAt(topY()), topY(), 0) : null)
  let x = innerWidth / 2
  let y = innerHeight * 0.62
  if (pos instanceof Element) {
    // A button on screen (a topping, the candle): the fingertip rests on its middle.
    const r = pos.getBoundingClientRect()
    x = r.left + r.width / 2
    y = r.top + r.height * 0.5
  } else if (pos) {
    if (game.state === 'bonus' && !onScreen(pos)) { el.classList.add('hidden'); return }
    const v = pos.clone().project(camera)
    x = ((v.x + 1) / 2) * innerWidth
    y = ((1 - v.y) / 2) * innerHeight + 2
  }
  // ...and stays clear of the layer dots, even on very short sideways phones
  const bar = $('pips').parentElement
  if (game.state === 'play' && bar.offsetHeight && !(pos instanceof Element)) y = Math.min(y, bar.offsetTop - el.offsetHeight - 22)
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
  $('hud').classList.remove('partying', 'carding', 'card-up')
  clearTweens()
  disposeCake(cake)
  cake = null
  mover = null
  customer?.group.removeFromParent()
  customer = null
  decorating?.done(false)
  clearGuests()
  clearBonus()
  clearButterfly()
  peeker?.group.removeFromParent()
  peeker = null
  clearSlivers()
  pantry.classList.add('hidden')
  hideIntro()
  $('hint').classList.add('hidden')
}

function toTitle() {
  endRun()
  game.state = 'title'
  buildDemo()
  show('title')
  aimCamera(true)
}

function start() {
  sound.unlock()
  sound.click()
  endRun()
  clearDemo()
  const debugLevel = Number(new URLSearchParams(location.search).get('level')) || 1
  Object.assign(game, { level: debugLevel, streak: 0, lastFlavour: null, cakes: 0 })
  show('play')
  startLevel(game.run)
}

/**
 * The big ▶ buttons answer a finger that wiggles a little on the way: one pointer down and up on the
 * button, moved less than 40 px, counts as a press (a plain click from the keyboard still works).
 */
const activePointers = new Set()
const pointerCancels = new Set()
let pointersSpoiled = false
document.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId)
  if (activePointers.size > 1) {
    pointersSpoiled = true
    for (const cancel of pointerCancels) cancel()
  }
}, true)
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, (e) => {
  activePointers.delete(e.pointerId)
  if (!activePointers.size) pointersSpoiled = false
}, true)

function pressButton(btn, action) {
  let id = null
  let x0 = 0
  let y0 = 0
  let pressed = 0
  pointerCancels.add(() => { id = null })
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (pointersSpoiled || activePointers.size !== 1 || id !== null) return (id = null)
    id = e.pointerId
    x0 = e.clientX
    y0 = e.clientY
    btn.setPointerCapture?.(e.pointerId)
  })
  btn.addEventListener('pointerup', (e) => {
    e.stopPropagation()
    const ok = e.pointerId === id && Math.hypot(e.clientX - x0, e.clientY - y0) < 40
    id = null
    if (!ok) return
    pressed = performance.now()
    action()
  })
  btn.addEventListener('pointercancel', () => (id = null))
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    // The click that follows a press is the same press.
    if (!e.detail && !activePointers.size && performance.now() - pressed > 600) action()
  })
}
pressButton($('play'), start)
pressButton($('done'), () => {
  if (!decorating) return
  sound.unlock()
  sound.click()
  if (!updateDecoratingReady()) {
    $('done').animate([{ rotate: '0deg' }, { rotate: '-5deg' }, { rotate: '5deg' }, { rotate: '0deg' }], { duration: 280 })
    return
  }
  decorating.done(true)
})
// The round buttons over play (🏠, 🎵, 🔊) are press-and-hold: a ring fills round the button, so the
// stray taps of an excited child never end the cake or silence the game. Keyboard Enter works at once.
const HOLD = 0.6
function holdButton(btn, action) {
  // One finger, held still: a second finger anywhere cancels the hold, and nothing new starts until
  // every finger is up, so a palm or a quick flurry of fingers can never exit or mute.
  let id = null // the pointer that started the hold
  let start = 0
  let raf = 0
  let blocked = false
  const down = activePointers // shared document-level pointers
  const cancel = () => {
    id = null
    start = 0
    cancelAnimationFrame(raf)
    raf = 0
    btn.style.setProperty('--hold', '0')
  }
  const tick = () => {
    raf = 0
    if (id === null || !start) return
    const k = Math.min(1, (performance.now() - start) / 1000 / HOLD)
    btn.style.setProperty('--hold', k.toFixed(3))
    if (k < 1) {
      raf = requestAnimationFrame(tick)
      return
    }
    cancel()
    const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); cleanup() }
    const cleanup = () => document.removeEventListener('click', swallow, true)
    document.addEventListener('click', swallow, true)
    setTimeout(cleanup, 500)
    action()
  }
  pointerCancels.add(() => { cancel(); blocked = true })
  const lift = (e) => {
    down.delete(e.pointerId)
    if (e.pointerId === id) cancel()
    if (!down.size) blocked = false
  }
  addEventListener('pointerup', lift, true)
  addEventListener('pointercancel', lift, true)
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    e.preventDefault()
    sound.unlock()
    if (blocked || pointersSpoiled || down.size !== 1 || id !== null) return
    cancel()
    id = e.pointerId
    start = performance.now()
    raf = requestAnimationFrame(tick)
  })
  btn.addEventListener('pointerleave', (e) => e.pointerId === id && cancel())
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    // Keyboard Enter or Space (a click with no pointer behind it) acts at once.
    if (!e.detail && !down.size) action()
  })
}
holdButton($('home'), () => {
  sound.click()
  toTitle()
})
// The card's 🏠 is small, set apart from ▶, and held too, so a tapping spree carries on to the next friend.
holdButton($('card-home'), () => {
  sound.click()
  toTitle()
})
pressButton($('next'), nextCake)
// Sound and music last for this visit only: a mute is never saved, so the next visit always has sound.
const soundBtn = $('sound')
holdButton(soundBtn, () => {
  sound.setMuted(!sound.muted)
  soundBtn.textContent = sound.muted ? '🔇' : '🔊'
  sound.click()
})
const musicBtn = $('music')
holdButton(musicBtn, () => {
  sound.musicOn = !sound.musicOn
  musicBtn.classList.toggle('off', !sound.musicOn)
  sound.click()
})

// --- Input ---------------------------------------------------------------------------------------

const ray = new THREE.Raycaster()
const pointer = new THREE.Vector2()
/** The animal under the pointer, if any: every friend giggles and hops when poked. */
function friendAt(e) {
  if (e.clientX === undefined) return null
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(pointer, camera)
  const list = [customer, ...guests, cake?.figure, ...(demo ? demo.friends : [])].filter(Boolean)
  let best = null
  let bestD = Infinity
  for (const f of list) {
    const hit = ray.intersectObject(f.group, true)[0]
    if (hit && hit.distance < bestD) {
      best = f
      bestD = hit.distance
    }
  }
  return best
}

function poke(f) {
  f.cheer(0.9)
  f.surprised()
  sound.voice(f.def.animal)
}

function tap(e = {}) {
  sound.unlock()
  // A tap on the butterfly makes it loop; during stacking the same tap still drops the layer.
  if (tapButterfly(e) && game.state !== 'play') return
  if (game.state === 'play') {
    // Straight after a tumble a tap brings the next layer at once.
    if (!mover && game.canHurry) return spawnMover()
    return drop()
  }
  if (game.state === 'decorate') return addTopping(e.clientX === undefined ? null : e)
  if ((game.state === 'bonus' || game.state === 'card') && tapBonus(e)) return
  const f = friendAt(e)
  if (game.state === 'candles' && !(f && f !== customer)) return blowCandles()
  if (f) return poke(f)
  if (game.state === 'title' && demo) poke(demo.friends[(Math.random() * 2) | 0])
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  tap(e)
})
for (const ev of ['touchmove', 'gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

addEventListener('keydown', (e) => {
  sound.unlock()
  if (e.repeat) return
  if (e.key === 'Escape' && game.state === 'card') return toTitle()
  if (e.key === ' ' || e.key === 'Enter') {
    // A focused button handles its own key.
    if (document.activeElement?.tagName === 'BUTTON' && document.activeElement !== document.body) return
    e.preventDefault()
    if (game.state === 'title') return start()
    if (game.state === 'card') return nextCake()
    tap()
  }
})

// --- Loading ---------------------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  const [c, a, b] = await Promise.allSettled([loader.loadAsync('./models/cake.glb'), loader.loadAsync('./models/animals.glb'), loader.loadAsync('./models/bakery.glb')])
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
  simTime += dt
  const t = simTime
  updateTweens(dt)
  updateMover(dt)
  updateAim(dt)
  updateCake(dt, t)
  updateDemo(dt, t)
  updateSlivers(dt)
  if (mover) focus.set(mover.group.position.x + (cake?.group.position.x ?? 0), mover.group.position.y, 0)
  else if (cake) focus.set(cake.group.position.x, topY(), 0)
  customer?.update(dt, t, focus)
  for (const g of guests) g.update(dt, t, focus)
  peeker?.update(dt, t, focus)
  updateButterfly(dt, t)
  updateBonus(dt, t)
  if (cake?.figure) cake.figure.update(dt, t, camera.position)
  updateCamera(dt)
  effects.update(dt)
  updateIdle(dt)
  updateHint()
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
  window.cakeStack = { game, frame, get cake() { return cake }, get mover() { return mover }, get customer() { return customer }, get guests() { return guests }, get balloons() { return balloons }, get presents() { return presents }, get pinata() { return pinata }, get skyStars() { return skyStars }, get butterfly() { return butterfly }, THREE, camera, scene, drop, choose, finishCake }
  // Background test tabs get no animation frames, so keep time moving there too.
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
