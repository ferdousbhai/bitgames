import { createRecipeStudio } from './recipe-studio.js'
import { createAdventure } from './adventure.js'
import { createVoice } from './speech.js'
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
// Spoken words for pre-readers: one voice for the whole game, respecting its mute.
const voice = createVoice({ muted: sound.muted, rate: 0.85, pitch: 1 })
const recipeStudio = createRecipeStudio({ cakeKit, openButton: $('recipe-open'), sound, voice })

// --- Game state -----------------------------------------------------------------------------

// How far above the cake the next layer slides: close enough to judge where it will land (lower on wide screens,
// where a high layer would float in front of the back-wall shelves).
const hover = () => (camera.aspect > 1.2 ? 0.52 : 0.7)
const COUNTER_Z = 0.9 // the counter top runs from z -0.9 to 0.9
const FLOOR_Y = -1.2

const game = {
  state: 'loading', // loading | title | intro | play | party | candles | share | card
  run: 0, // bumps whenever a game starts or ends, so stale async steps stop
  level: 1,
  streak: 0,
  firstDrop: false,
  lastFlavour: null,
  order: null, // the friend's pictured order, bottom to top: { layers, groups, hidden }, or null when stacking freely
  misses: 0, // layers in a row that were not the next one in the order
  slips: 0, // taps on a layer the order did not need, this cake
  tried: [], // per layer of the order: taps on other flavours while it was the next one
  wrongAt: [], // per layer of the order: the flavours already tried there (dimmed in the pantry after two)
  choices: null, // the order's pantry: its flavours (and a decoy at the harder tiers), shuffled once per cake so they stay put
  chooseAll: false, // tier 1 and up: the child chooses every layer of the order from the pantry, not only the "?" ones
  pick: null, // the flavour the child chose from the pantry (free stacking and counting), or null for a surprise mix
  miscounts: 0, // counting: candles pressed at the wrong count this cake (two bring back the empty dots)
  counting: false, // counting: the friend is counting the cake aloud
  over: false, // counting: the cake had too many layers, and the extra ones tilt to come off one by one
  tier: 0, // 0–3: how hard the friends' orders and the party share are, from how carefully the child builds
  clean: 0, // cakes in a row built with no wrong layer (two step the tier up)
  landedAt: 0, // when the last layer landed (a double tap's second half is not a pantry choice)
  told: new Set(), // how-to sentences already said this visit: each is said once, not every cake
}
try {
  game.tier = clamp(Number(localStorage.getItem('cake-stack-tier')) || 0, 0, 3)
  game.clean = clamp(Number(localStorage.getItem('cake-stack-clean')) || 0, 0, 1)
} catch {}
/** A how-to sentence, said once per visit and queued after whatever the friend is saying. */
const tellOnce = (text) => !game.told.has(text) && (game.told.add(text), voice.say(text))

// Optional learning missions: count layers as they land.
const adventure = createAdventure({
  id: 'cake-stack',
  anchor: $('play'),
  hud: $('hud'),
  voice,
  celebrate: (text) => celebrateMission(text),
  // A row of slices to count along with the words, so non-readers can follow it too
  goalWords: true,
  // The friend counts the cake aloud when the child says it is ready (see checkCount), so the
  // mission's own per-layer count stays quiet; its reward line is still said.
  announce: (text, kind) => kind !== 'count' && voice.say(text, { interrupt: kind === 'choice' }),
  // Counting: the goal row is the friend's number as slices, with no "0 / 3" tally to contradict the cake.
  // Its slices light only when the friend has counted the cake and found it right.
  renderProgress: (goal, option, count) => {
    const row = document.createElement('span')
    row.className = 'adventure-steps'
    row.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < option.target; i++) row.append(Object.assign(document.createElement('span'), { className: `adventure-step${i < count ? ' adventure-got' : ''}`, textContent: option.icon }))
    goal.replaceChildren(row)
  },
  // The friend's order is the default; the counting missions and free stacking keep any flavour that lands.
  // Each counting cake asks for its own number (see countFor), so the first cake's number is only a start.
  options: [
    { emoji: '🧁', label: "Friend's order", order: true },
    { emoji: '🐢', label: 'Gentle layer counting', pace: 0.6, goal: 'Stack 3 layers', target: 3, base: 3, range: [2, 3, 4], icon: '🍰', reward: 'Three layers make your little cake!', praise: 'layers make your little cake!' },
    { emoji: '🧮', label: 'Count bigger cakes', pace: 0.65, goal: 'Stack 5 layers', target: 5, base: 5, range: [4, 5, 6, 7], icon: '🍰', reward: 'Five layers, counted one at a time!', praise: 'layers, counted one at a time!' },
    { emoji: '🎂', label: 'Free stacking' },
  ],
})
const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
/**
 * Counting: each friend wants their own number of layers. The first cake of a visit asks for the mission's
 * starting number; after that the number always changes (never the same twice running), so the child has to
 * count the cake rather than remember the last answer. A child who miscounted twice gets a smaller number next.
 */
function countFor(option, first) {
  let n = option.base
  if (!first) {
    const last = option.target
    let range = option.range.filter((k) => k !== last)
    if (game.lastMiscounts >= 2) range = range.filter((k) => k <= option.base).length ? range.filter((k) => k <= option.base) : range
    n = range[(Math.random() * range.length) | 0]
  }
  Object.assign(option, { target: n, goal: `Stack ${n} layers`, reward: `${NUMBER_WORDS[n]} ${option.praise}` })
}

let cake = null // { group, layers: [], candles: [] }
let mover = null // the layer sliding above the cake
let customer = null
const slivers = [] // trimmed bits of cake tumbling onto the counter
const view = { R: 1.6, custX: 2.1, custY: FLOOR_Y }

const customerDef = (level) => {
  const def = CUSTOMERS[(level - 1) % CUSTOMERS.length]
  return { ...def, layers: level > CUSTOMERS.length ? 10 : def.layers }
}
const orderMode = () => !!game.order
/** A counting mission: each cake is exactly the mission's number of layers, so the reward line and the cake agree. */
const missionTarget = () => (!game.order && adventure.option.target) || 0
/** How many layers this cake needs: the friend's order, the mission's count, or the friend's layer count when stacking freely. */
const targetLayers = () => (game.order ? game.order.layers.length : missionTarget() || customerDef(game.level).layers)
/** Layers that belong on the cake: a wrong layer sitting on top (waiting to be taken off) does not count. */
const built = () => (cake ? cake.layers.length - (cake.surprise ? 1 : 0) : 0)
const wanted = () => (game.order && cake ? game.order.layers[built()] : null)
/** The last layer of a made-up pattern's part, after all the same so far: it must be a different flavour. */
const sameSoFar = (i) => !!game.order?.design && i === game.order.design - 1 && game.order.layers[i] === null && game.order.layers.slice(0, i).every((f) => f === game.order.layers[0])
/** A made-up pattern whose repeating part the child is still choosing (any flavour is right). */
const designing = () => !!game.order?.design && game.order.layers[built()] === null
/** A layer of a pattern order still shown as "?": the child works out what it must be and chooses it. */
const isMystery = (i) => !!game.order && i < game.order.layers.length && i >= game.order.layers.length - game.order.hidden && i >= built() && !game.peeking && !(game.order.memory && (game.wrongAt[i] || []).length >= 2)
/** A layer of the order the child chooses from the pantry: every one from tier 1, only the "?" ones before. */
const choosing = (i) => orderMode() && (game.chooseAll || isMystery(i))
/** Counting: the cake can grow two past the friend's number, so a child who went over has to count it. */
const countCap = () => missionTarget() + 2
const unlockedFlavours = (level) => ['vanilla', ...CUSTOMERS.slice(0, Math.min(level, CUSTOMERS.length)).map((c) => c.unlock).filter(Boolean)]
const FLOOR_W = MIN_W + 0.12 // the slimmest a layer gets
const perfectWindow = (w) => Math.max(0.12, w * 0.12)
const topY = () => STAND_TOP + (cake ? cake.layers.length : 0) * STEP
const topLayer = () => (cake && cake.layers.length ? cake.layers[cake.layers.length - 1] : { x: 0, w: START_W })
// One calm, constant pace: no ramp by level or cake height, so patience and timing stay the skill.
const SLIDE_SPEED = 1.25
// In an order, a layer crosses this many times before it makes way for the next one.
const LEAVE_AFTER = 2
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
let pantryReserve = 90
function liftForDots(y) {
  const bar = $('pips').parentElement
  if (!bar.offsetHeight) return y
  const h = innerHeight
  const H = effHalfH(camGoal.halfW, camGoal.halfH)
  // The pantry sits just above the dots whenever this cake may use it, so the stand stays clear of it too.
  // (Its height is remembered from when it last showed, so the camera does not jump as it comes and goes.)
  const pantryEl = $('pantry')
  if (pantryEl.offsetHeight) pantryReserve = bar.offsetTop - pantryEl.offsetTop
  const usesPantry = !game.order || game.chooseAll || game.order.hidden > 0
  const pantryLow = usesPantry && getComputedStyle(pantryEl).flexDirection === 'row'
  const fB = (h - bar.offsetTop + (pantryLow ? pantryReserve : 0) + 6) / h
  const goal = document.getElementById('adventure-goal')
  const goalBottom = goal && !goal.hidden && goal.offsetHeight ? goal.offsetTop + goal.offsetHeight : 0
  const fT = (Math.max(goalBottom, 0.15 * h) + 6) / h
  const baseClear = H * (1 - 2 * fB) - 0.02 // the stand's foot sits just above the dots
  const moverClear = topY() + hover() + 0.2 - H * (1 - 2 * fT) // the sliding layer stays below the top HUD
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
  // Tall screens: the friend stands nearer the middle and a little taller behind the counter, so their whole
  // face shows above it (and fills some of the wall) instead of peeking in from the edge.
  view.custY = FLOOR_Y + 0.22
  if (camera.aspect < 0.8) {
    view.custX = 1.22
    view.custY = FLOOR_Y + 0.5
  }
  if (customer && !['party', 'candles', 'share', 'card'].includes(game.state)) {
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

function newCake(x = 0) {
  const group = new THREE.Group()
  group.position.set(x, 0, 0)
  group.add(cakeKit.stand())
  scene.add(group)
  return { group, layers: [], candles: [], wobble: 0, lean: 0 }
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
  // Older children spend their time deciding, not waiting: from tier 2 the wanted layer comes round more often.
  const quick = game.tier >= 2
  const match = !others.length || game.misses >= (quick ? 1 : 2) || Math.random() < (game.misses ? 0.55 : quick ? 0.5 : 0.4)
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

/**
 * The next layer slides in. In an order at tier 0 it is the bakery's choice (the child waits for the one
 * the dots need), except at a "?" of a pattern; from tier 1 the child chooses every layer from the pantry.
 * In free stacking and counting the child's pantry pick comes along (a surprise mix until they choose).
 */
function spawnMover(flavour, from = null) {
  if (!cake || cake.surprise || game.state !== 'play' || game.counting || (missionTarget() && built() >= countCap())) return
  const i = built()
  if (orderMode() && i >= targetLayers()) return
  const chosen = choosing(i)
  if (!flavour) {
    if (chosen) return askChoice()
    flavour = orderMode() ? pickOrderFlavour() : game.pick || pickFlavour()
  }
  const top = topLayer()
  const L = cakeKit.layer(flavour)
  L.w = top.w
  L.glow = cakeKit.glowCopy(L)
  L.side = cake.layers.length % 2 ? 1 : -1
  L.pos = from ? from.pos : L.side * view.R
  L.dir = from ? from.dir : -L.side
  L.x = top.x + L.pos
  L.appear = from ? 0.6 : 0
  L.body.scale.set(L.w, 1, L.w)
  L.group.position.set(L.x, topY() + hover(), 0)
  // At tier 0 the bakery sends the layers: each slides across and back once, then makes way for the next.
  // The wanted one looks and moves just like the others, so the child checks the picture against the dots.
  // A layer the child chose stays until it is dropped.
  L.leaves = orderMode() && !chosen
  L.turns = 0
  L.leaving = false
  L.fade = 0
  cake.group.add(L.group)
  mover = L
  if (!from) sound.appear()
  showMoverTag(flavour)
  renderPantry()
}

/**
 * The order's pantry, fixed for the whole cake so the buttons never swap places: the order's own flavours,
 * plus, from tier 1, one familiar flavour that is not in it, so even Bear's two-flavour order is a real
 * choice of three and guessing goes wrong more often than it goes right. (Before its friend brings it,
 * the decoy is chocolate, a flavour every child knows.)
 */
function orderPantry() {
  // A pattern the child makes up: every flavour met so far (at most five), to invent it from.
  if (game.order.design) return shuffle(unlockedFlavours(game.level)).slice(0, 5)
  const own = [...new Set(game.order.layers)]
  const known = unlockedFlavours(game.level).filter((f) => !own.includes(f))
  const extra = known.length ? known : ['chocolate', 'vanilla', 'strawberry'].filter((f) => !own.includes(f))
  const decoy = extra.length && own.length < 5 && game.tier >= 1
  const list = decoy ? [...own, extra[(Math.random() * extra.length) | 0]] : own
  return shuffle(list)
}
const shuffle = (list) => list.map((f) => [Math.random(), f]).sort((x, y) => x[0] - y[0]).map(([, f]) => f)

/** The child chooses the next layer: the pantry opens (the dots show what the order needs, or "?" to work out). */
function askChoice() {
  renderPantry()
  if (designing()) {
    if (sameSoFar(built())) tellOnce('A pattern needs two kinds. Choose a different one.')
    return pantry.classList.toggle('invite', !game.firstPick)
  }
  if (game.order.memory && isMystery(built())) tellOnce('What did they ask for next? You can tap the dots to peek.')
  else if (isMystery(built())) tellOnce('Choose the layer that comes next.')
  else tellOnce('Look at the dots, and choose the next layer.')
  // Until the very first choice, the whole pantry wears a soft steady ring (a finger on one button would
  // look like a suggestion of which flavour to take).
  pantry.classList.toggle('invite', !game.firstPick)
}

/** The child picks a flavour from the pantry: it becomes the sliding layer (or the next one). */
function choose(f) {
  // A second tap of a quick double tap, just after a layer landed, is not a choice for the next one.
  if (game.state !== 'play' || !cake || cake.surprise || (mover && mover.dropping) || game.counting || performance.now() - game.landedAt < 350) return
  if (missionTarget() && built() >= countCap()) return
  sound.unlock()
  sound.click()
  game.idle = 0
  if (orderMode() && !choosing(built())) return
  game.firstPick = true
  pantry.classList.remove('invite')
  if (!orderMode()) game.pick = f
  if (mover && mover.flavour === f) return renderPantry()
  if (mover) {
    // Swapping keeps the slide going, so the child can change their mind without starting over.
    const old = mover
    old.group.removeFromParent()
    mover = null
    spawnMover(f, old)
  } else spawnMover(f)
}

const pantry = $('pantry')
/** The flavour buttons: every flavour met so far (free stacking, counting) or the "?" choices of a pattern. */
function renderPantry() {
  const i = built()
  const full = missionTarget() && built() >= countCap()
  const finished = orderMode() && i >= targetLayers()
  const list = game.state !== 'play' || !cake || cake.surprise || game.counting || full || finished ? null : orderMode() ? (choosing(i) ? game.choices : null) : unlockedFlavours(game.level)
  pantry.classList.toggle('hidden', !list)
  pantry.classList.toggle('ask', !!list && isMystery(i))
  if (!list) return
  // A flavour that did not fit stays in play after one try, so guessing is not free; after two misses
  // at the same layer the tried ones dim, so the choice narrows instead of turning into a chore.
  const tried = (game.wrongAt[i] || []).length >= 2 ? game.wrongAt[i] : sameSoFar(i) ? [game.order.layers[0]] : []
  pantry.replaceChildren(...list.map((f) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'pick'
    const fl = FLAVOURS[f]
    b.style.setProperty('--icing', fl.rainbow ? '#ffe3ef' : fl.icing)
    b.style.setProperty('--sponge', fl.sponge)
    b.textContent = fl.emoji
    b.setAttribute('aria-label', f)
    b.title = f
    b.classList.toggle('picked', mover ? mover.flavour === f : game.pick === f)
    b.disabled = tried.includes(f)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      // A tap or click hands focus back, so Space drops the layer; keyboard users keep their place.
      if (e.detail) b.blur()
      choose(f)
    })
    return b
  }))
}

function updateMover(dt, t) {
  if (!mover || mover.dropping) return
  const L = mover
  L.appear = Math.min(1, L.appear + dt * 4)
  L.pos += L.dir * speed() * dt
  if (L.leaving) {
    // It shrinks away past the edge and the next layer comes along.
    L.fade = Math.min(1, L.fade + dt * 2.5)
    if (L.fade >= 1) {
      L.group.removeFromParent()
      mover = null
      hideMoverTag()
      const run = game.run
      setTimeout(() => run === game.run && game.state === 'play' && !mover && spawnMover(), 350)
      return
    }
  } else if (L.pos * L.dir > view.R) {
    if (L.leaves && ++L.turns >= LEAVE_AFTER) L.leaving = true
    else {
      L.pos = L.dir * view.R
      L.dir = -L.dir
    }
  }
  const top = topLayer()
  L.x = top.x + L.pos
  const pop = ease.outBack(L.appear) * (1 - (L.fade || 0))
  // The sliding layer follows the lean of the cake's top, so lining it up still looks right on a tilted cake.
  L.group.position.set(L.x + leanAt(topY()), topY() + hover() + Math.sin(t * 3) * 0.04, 0)
  L.body.scale.set(L.w * pop, pop, L.w * pop)
  // Every layer glows golden while it is lined up for a perfect drop: the glow is about timing, never about which flavour
  const lined = !L.leaving && Math.abs(L.pos) <= perfectWindow(top.w)
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
  // Making up a pattern: the layer the child chose becomes part of it.
  if (designing()) game.order.layers[built()] = L.flavour
  if (orderMode() && L.flavour !== wanted()) landSurprise(L)
  else land(L)
  if (game.order?.design && built() === game.order.design && game.order.hidden === 0 && game.order.layers.includes(null)) setPattern()
}

/**
 * A layer the order does not need: it really lands on the cake, slightly askew, and the friend
 * tilts their head. The next layer waits until the child takes it off again (a tap lifts it away),
 * so a careless tap costs a moment and careful looking is quicker. Nothing breaks and nothing buzzes;
 * the first slip of a cake is put into words once.
 */
function landSurprise(L) {
  const i = built()
  const mystery = isMystery(i)
  game.slips++
  game.tried[i]++
  game.misses = 0
  ;(game.wrongAt[i] ||= []).push(L.flavour)
  mover = null
  game.landedAt = performance.now()
  hideMoverTag()
  L.group.removeFromParent()
  cakeKit.unglow(L)
  const top = topLayer()
  const layer = addLayer(cake, L.flavour, L.x, top.w)
  layer.surprise = true
  layer.sq = 0.28
  cake.surprise = layer
  const fromX = L.x
  tween(0.24, (t) => (layer.x = lerp(fromX, top.x + 0.05, ease.outCubic(t))))
  layer.group.rotation.z = 0.06
  cake.wobble = Math.max(cake.wobble, 0.08)
  sound.plop(cake.layers.length)
  sound.wobble()
  customer?.surprised()
  renderPantry()
  updateHud()
  askPip()
  if (mystery && game.order.memory) voice.sayOnce('Was that in the order? Tap to take it off.', { interrupt: true })
  else if (mystery) voice.sayOnce('Does that fit the pattern? Tap to take it off.', { interrupt: true })
  else voice.sayOnce('Oops, that layer is not in the order. Tap to take it off.', { interrupt: true })
  pointAtLater(layer)
}

/**
 * The child has chosen the repeating part of their own pattern: it fills the rest of the order, shown as "?",
 * and the friend says it back once, so the child keeps their own pattern going.
 */
function setPattern() {
  const o = game.order
  const unit = o.layers.slice(0, o.design)
  o.layers = o.layers.map((_, i) => unit[i % o.design])
  o.hidden = o.layers.length - o.design
  updateHud()
  voice.say(`Your pattern! ${orderWords(unit)}. Keep it going!`)
}

/** After a moment, the finger rests on the middle of a layer waiting to come off (itself, not the ones below). */
function pointAtLater(layer) {
  const run = game.run
  setTimeout(() => {
    if (run !== game.run || game.state !== 'play' || cake?.surprise !== layer || layer.lifting) return
    const p = new THREE.Vector3(0, STEP / 2, 0)
    layer.group.localToWorld(p)
    showHintAt(p)
  }, 1400)
}

/** The child takes the wrong layer off: it floats up and away, and the next layer comes along. */
async function liftSurprise() {
  const layer = cake?.surprise
  if (!layer || layer.lifting) return
  const run = game.run
  layer.lifting = true
  game.idle = 0
  $('hint').classList.add('hidden')
  sound.whoosh()
  const y0 = layer.group.position.y
  const x0 = layer.x
  const dir = x0 >= 0 ? 1 : -1
  await tween(0.55, (t) => {
    const e = ease.inOutCubic(t)
    layer.group.position.y = y0 + e * 0.9
    layer.x = x0 + dir * e * 1.6
    layer.w = Math.max(0.001, layer.w * (1 - t * 0.08))
  })
  if (run !== game.run) return
  layer.group.removeFromParent()
  cake.layers.splice(cake.layers.indexOf(layer), 1)
  cake.surprise = null
  updateHud()
  // Counting, after too many: each extra layer tilts in turn until the cake has the friend's number again,
  // then the finger rests on the candle so the child can count it once more.
  if (game.over) {
    if (built() > missionTarget()) return tiltTop()
    game.over = false
    $('done').classList.remove('hidden')
    renderPantry()
    setTimeout(() => run === game.run && game.state === 'play' && !mover && !game.counting && showHintAt($('done')), 600)
    return
  }
  // In an order, the friend glances back at the dots before the pantry opens again: a slip costs a calm
  // moment, so looking first is quicker than guessing.
  const glance = choosing(built())
  if (glance) askPip()
  else renderPantry()
  setTimeout(() => run === game.run && game.state === 'play' && !mover && !game.counting && !(missionTarget() && built() >= countCap()) && spawnMover(), glance ? 850 : 250)
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
  game.landedAt = performance.now()
  hideMoverTag()
  L.group.removeFromParent()
  cakeKit.unglow(L)
  const layer = addLayer(cake, L.flavour, L.x, top.w)
  layer.sq = 0.28
  sound.plop(cake.layers.length)
  const y = STAND_TOP + (cake.layers.length - 1) * STEP
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
    // Three lined-up drops in a row quietly widen the cake again
    if (grew) sound.grow()
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
  renderPantry()

  const n = cake.layers.length
  const target = targetLayers()
  // Layers land quietly: the pictures on the dots and a soft plop carry the count.
  // Counting: the cake never ends by itself. The child decides it has the friend's number and taps the
  // candle; the friend then counts it aloud. Two past the number no more layers come, so it must be counted.
  if (missionTarget()) {
    $('done').classList.remove('hidden')
    if (n >= countCap()) {
      setTimeout(() => run === game.run && game.state === 'play' && !game.counting && showHintAt($('done')), 900)
      return
    }
  } else if (n >= target) {
    setTimeout(() => run === game.run && finishCake('done'), 450)
    return
  }
  // Free stacking can end early; an order owns its own ending.
  if (n >= 3 && !orderMode() && !missionTarget()) $('done').classList.remove('hidden')
  if (n % 3 === 0) setTimeout(() => run === game.run && decorateSide(layer, n / 3 - 1), 300)
  // A finished mission gets its moment: the next layer waits until the ribbon has gone, so it never slides hidden behind it.
  setTimeout(() => {
    if (run === game.run && game.state === 'play' && !mover && !game.counting) spawnMover()
  }, Math.max(320, missionUntil - performance.now() - 200))
}

/** A trimmed piece of cake that flies off and plops onto the counter. */
function sliver(flavour, x, y, w, dir) {
  const L = cakeKit.layer(flavour)
  L.body.scale.set(w, 0.9, w)
  L.group.position.set(x + cake.group.position.x, y, 0)
  scene.add(L.group)
  // It tumbles sideways along the counter, never toward the camera, where it would loom large.
  slivers.push({ obj: L.group, v: new THREE.Vector3(dir * (1.1 + Math.random() * 0.6), 1.5, 0.1 + Math.random() * 0.25), spin: dir * -(3 + Math.random() * 3), age: 0, landed: false })
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

/** How far the leaning cake shifts sideways at height y (it tips about the foot of its stand). */
const leanAt = (y) => (cake ? Math.sin(cake.lean) * y : 0)

/** Jelly wobble and landing squish for every layer, and a gentle lean for a cake stacked off-centre. */
function updateCake(dt, t) {
  if (!cake) return
  cake.wobble *= Math.exp(-dt * 2.2)
  const n = cake.layers.length
  // The further the layers sit from the middle of the stand, the more the cake leans (a few degrees at most,
  // and it never falls): a carefully lined-up cake stands straight, a hurried one tilts.
  const off = n ? cake.layers.reduce((a, L) => a + L.x, 0) / n : 0
  cake.lean = lerp(cake.lean, clamp(off * 0.45, -0.075, 0.075), Math.min(1, dt * 3))
  if (cake.deco) {
    cake.deco.position.x = cake.decoLayer.x + leanAt(cake.deco.position.y)
    cake.deco.rotation.z = -cake.lean
  }
  cake.layers.forEach((L, i) => {
    // squish spring
    L.sqv += (-L.sq * 240 - L.sqv * 14) * dt
    L.sq += L.sqv * dt
    const sway = cake.wobble * Math.sin(t * 11 - i * 0.35) * ((i + 1) / Math.max(n, 1)) ** 1.3
    L.group.position.x = L.x + sway + leanAt(L.group.position.y)
    L.group.rotation.z = -sway * 0.5 - cake.lean + (L.surprise ? 0.07 : 0)
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
  game.counting = false
  game.over = false
  $('hud').classList.add('partying')
  $('done').classList.add('hidden')
  $('hint').classList.add('hidden')
  $('pips').classList.add('full')
  renderPantry()
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
    const name = animalName(customer.def.animal)
    // A cake lined up with care stands straight, and the friend notices (once, quietly; never a score).
    const straight = Math.abs(cake.lean) < 0.02 && topLayer().w > 1 && cake.layers.length >= 4 ? ' So straight!' : ''
    const remembered = game.order.memory && !game.peeks && !game.slips
    voice.sayNow(game.order.design ? `You made up a pattern for ${name}, and kept it going!${straight}` : game.order.groups.length ? `You finished ${name}'s pattern!${straight}` : remembered ? `You remembered ${name}'s whole order!${straight}` : `${orderWords(game.order.layers)}. Just like ${name}'s order!${straight}`)
    cake.straight = !!straight
    adaptTier()
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

/**
 * The next friends' orders follow how the cakes go: two cakes in a row built with no wrong layer step up
 * (choosing every layer, then patterns to finish, then harder patterns and sharing with leftovers); three
 * or more wrong layers in one cake step back down. It is never announced and never locks anything.
 */
function adaptTier() {
  if (game.slips === 0 && ++game.clean >= 2) {
    game.tier = Math.min(3, game.tier + 1)
    game.clean = 0
  } else if (game.slips) {
    game.clean = 0
    if (game.slips >= 3) game.tier = Math.max(0, game.tier - 1)
  }
  try {
    localStorage.setItem('cake-stack-tier', String(game.tier))
    localStorage.setItem('cake-stack-clean', String(game.clean))
  } catch {}
}

/**
 * Counting: the child says the cake is ready. The friend counts it aloud, layer by layer (each one bobs
 * and its dot grows). The right number finishes the cake; too few and the friend says their number
 * again; too many and the top layer tilts, ready to be tapped off. Nothing is lost either way.
 */
async function checkCount() {
  const run = game.run
  const want = missionTarget()
  game.counting = true
  game.idle = 0
  $('done').classList.add('hidden')
  $('hint').classList.add('hidden')
  if (mover && !mover.dropping) {
    const m = mover
    mover = null
    hideMoverTag()
    tween(0.25, (t) => m.body.scale.setScalar(Math.max(0.001, 1 - t) * m.w)).then(() => m.group.removeFromParent())
  }
  renderPantry()
  const n = built()
  const pips = $('pips').querySelectorAll('.pip')
  voice.hush()
  for (let k = 1; k <= n; k++) {
    cake.layers[k - 1].sq = 0.22
    // The number shows on each dot only as the friend says it: the dots never give the answer away.
    if (pips[k - 1]) {
      pips[k - 1].classList.add('counted')
      pips[k - 1].textContent = String(k)
    }
    // Counting is the lesson here, so the friend counts aloud all the way (the cakes stop at nine).
    if (!voice.count(k, { aloud: 10, interrupt: false })) sound.pop(0, k)
    await wait(0.62)
    if (run !== game.run) return
  }
  await wait(0.3)
  if (run !== game.run) return
  for (const p of pips) {
    p.classList.remove('counted')
    p.textContent = ''
  }
  const name = animalName(customer.def.animal)
  if (n === want) {
    // The mission counts the layers (quietly: the friend just did) and says its reward line.
    // The cake is finished: game.counting stays set until the party starts, so no layer, pantry or candle
    // can change the cake between the right count and its party.
    for (const L of cake.layers) adventure.event(L)
    $('done').classList.add('hidden')
    setTimeout(() => run === game.run && finishCake('done'), Math.max(450, missionUntil - performance.now()))
    return
  }
  game.miscounts++
  customer?.surprised()
  updateHud()
  if (n < want) {
    voice.say(`${name} wants ${want}.`)
  } else {
    // The top layer tilts, like a wrong layer: one tap takes it off.
    game.over = true
    tiltTop()
    if (!voice.sayOnce(`${name} wants ${want}. Tap to take one off.`)) voice.say(`${name} wants ${want}.`)
  }
  await wait(1.2)
  if (run !== game.run) return
  game.counting = false
  $('done').classList.toggle('hidden', !built() || !!cake.surprise)
  if (!cake.surprise && !mover && built() < countCap()) spawnMover()
}

/** Counting: the top layer tilts, marked to come off with one tap (as a wrong layer does in an order). */
function tiltTop() {
  const top = cake.layers[cake.layers.length - 1]
  top.surprise = true
  cake.surprise = top
  cake.wobble = Math.max(cake.wobble, 0.06)
  sound.wobble()
  updateHud()
  renderPantry()
  pointAtLater(top)
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
  speak: voice.sayNow,
  speakOnce: (text) => voice.sayOnce(text, { interrupt: true }),
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

/**
 * How the cake is cut for n friends: 4, 6, 8 or 12 slices. Early cakes share out exactly; once the
 * child builds carefully, some cakes leave a few slices that cannot go round (for the baker), and
 * the baker's plate is there either way, so the child decides when the sharing has to stop.
 */
function shareCut(n) {
  const most = game.tier >= 2 ? 4 : 3
  const exact = [4, 6, 8, 12].filter((s) => s % n === 0 && s / n <= most)
  const leftover = [4, 6, 8].filter((s) => s > n && s % n)
  const hard = game.tier >= 1 && game.order
  // The hardest tier chooses the cut: one way that goes round exactly, one that leaves slices over.
  if (game.tier >= 3 && game.order && leftover.length) {
    const cuts = [exact[(Math.random() * exact.length) | 0], leftover[(Math.random() * leftover.length) | 0]]
    return { cuts: Math.random() < 0.5 ? cuts : cuts.reverse(), withBaker: true }
  }
  const list = hard && leftover.length && Math.random() < 0.6 ? leftover : exact
  return { slices: list[(Math.random() * list.length) | 0], withBaker: !!hard && n > 2 }
}

function startShare() {
  game.state = 'share'
  game.shared = null
  $('hud').classList.add('carding')
  const guests = partyGuests()
  share.start(guests, cake.layers.map((l) => FLAVOURS[l.flavour]), shareCut(guests.length))
}

function showCard() {
  game.state = 'card'
  $('hint').classList.add('hidden')
  const def = customerDef(game.level)
  const next = customerDef(game.level + 1)
  $('card-emoji').textContent = `${def.emoji}🎂`
  // The card shows the cake the child made: its layers from the bottom up, and how many there are.
  const made = cake ? cake.layers.map((l) => FLAVOURS[l.flavour].emoji) : []
  $('card-cake').textContent = made.join('')
  $('card-count').textContent = String(made.length)
  // ...and how it was shared: every friend's plate with the same number of slices.
  // One unbreakable group per plate, so a friend's slices never wrap away from their face.
  const shared = game.shared
  const groups = shared ? [...shared.guests.map((g) => `${g.emoji}${'🍰'.repeat(shared.each)}`), ...(shared.left ? [`🧑‍🍳${'🍰'.repeat(shared.left)}`] : [])] : []
  $('card-share').replaceChildren(...groups.map((text) => Object.assign(document.createElement('span'), { textContent: text })))
  $('card-share').setAttribute('aria-label', shared ? `${shared.slices} slices, ${shared.guests.length} friends, ${shared.each} each${shared.left ? `, ${shared.left} for the baker` : ''}` : '')
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
  game.order = adventure.option.order ? orderFor(game.level, game.tier, { fresh: def.unlock, flavours: unlockedFlavours(game.level) }) : null
  game.tried = game.order ? game.order.layers.map(() => 0) : []
  game.wrongAt = []
  game.chooseAll = !!game.order && game.tier >= 1
  game.choices = game.order ? orderPantry() : null
  game.pick = null
  game.peeks = 0
  game.peeking = false
  game.lastMiscounts = game.miscounts
  game.miscounts = 0
  game.counting = false
  game.over = false
  // A counting mission counts each cake afresh, and each friend asks for their own number.
  if (missionTarget()) {
    countFor(adventure.option, !game.cakes)
    adventure.begin()
  }
  game.cakes = (game.cakes || 0) + 1
  game.slips = 0
  game.misses = 0
  voice.newRound()
  game.lastFlavour = null
  customer = animals.make(def)
  customer.group.scale.setScalar(1.85)
  customer.group.position.set(view.custX, FLOOR_Y - 1.9, -1.5)
  scene.add(customer.group)
  buildPips(missionTarget() ? countCap() : targetLayers())
  updateHud()
  // The new cake stand slides in and the birthday friend pops up behind the counter
  const c = cake
  tween(0.7, (t) => (c.group.position.x = -9 * (1 - ease.outCubic(t))))
  await wait(0.35)
  if (run !== game.run) return
  sound.voice(def.animal)
  tween(0.5, (t) => (customer.group.position.y = lerp(FLOOR_Y - 1.9, view.custY, ease.outBack(t))))
  const fresh = def.unlock && game.level <= CUSTOMERS.length ? FLAVOURS[def.unlock].emoji : ''
  if (game.order) {
    // The order is a picture, bottom to top, and it is spoken so a child who cannot read can follow it.
    const pics = game.order.design ? `${'🎨'.repeat(game.order.design)} 🔁` : game.order.layers.map((f, i) => (isMystery(i) ? '❓' : FLAVOURS[f].emoji)).join('')
    showIntro(`${def.emoji}🎂`, pics, game.order.design ? '✨' : game.order.memory ? '👀 ➜ ❓' : game.order.groups.length ? '🔁' : fresh ? `✨ ${fresh}` : '🎈🎈🎈')
    sayOrder()
    await wait(game.order.memory ? 4.6 : 2.4)
    if (run !== game.run) return
    // A memory order: the dots turn to "?" once the friend has said it, and the child builds it from memory.
    if (game.order.memory) {
      game.order.hidden = game.order.layers.length
      sound.whoosh()
      updateHud()
    }
  } else if (missionTarget()) {
    // Counting: the friend says their number once; the candle is the child's way to say "it has that many".
    showIntro(`${def.emoji}🎂`, `${missionTarget()} layers!`, '🍰 ➜ 🕯️')
    voice.sayNow(`${animalName(def.animal)} wants ${missionTarget()} layers.`)
    tellOnce('Tap the candle when the cake is ready.')
    await wait(2.2)
  } else {
    showIntro(`${def.emoji}🎂`, `${targetLayers()} layers!`, fresh ? `New flavour ${fresh}` : '🎈🎈🎈')
    await wait(1.6)
  }
  if (run !== game.run) return
  game.state = 'play'
  game.idle = 0
  spawnMover()
  if (!game.firstDrop) setTimeout(() => run === game.run && !game.firstDrop && game.state === 'play' && mover && showHintAt(null), 900)
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
  const groupStarts = new Set()
  for (let i = 0, at = 0; game.order && i < game.order.groups.length; at += game.order.groups[i++]) groupStarts.add(at)
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span')
    p.className = 'pip'
    p.setAttribute('aria-label', `Layer ${i + 1}`)
    if (game.order) {
      p.classList.add('want')
      // Patterns are grouped by their repeating part, so the repeat is easy to see.
      if (i > 0 && groupStarts.has(i)) p.classList.add('unit')
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
  const n = built()
  pips.forEach((p, i) => {
    const on = i < n
    p.classList.toggle('on', on)
    if (game.order) {
      // The friend's order is drawn on the dots, bottom layer first: each dot shows its flavour,
      // or "?" for the end of a pattern until the child has worked it out.
      // A made-up pattern: the part the child is still choosing shows as empty pencil dots.
      const blank = game.order.layers[i] === null
      // (the rest of the pattern, to keep going later, shows as faint "?" dots)
      p.classList.toggle('design', blank && i < game.order.design)
      if (blank) {
        p.classList.remove('mystery', 'oops')
        p.textContent = i < game.order.design ? '' : '?'
        p.style.setProperty('--want', '#fff')
        p.style.setProperty('--want-rim', '#d9a7c0')
        p.setAttribute('aria-label', `Layer ${i + 1}: your choice`)
        p.classList.toggle('next', i === n && game.state !== 'party')
        return
      }
      const mystery = isMystery(i)
      const f = FLAVOURS[game.order.layers[i]]
      // A wrong layer sitting on the cake shows on its dot, tilted, until the child takes it off.
      const oops = i === n && cake?.surprise ? cake.surprise.flavour : null
      p.classList.toggle('mystery', mystery)
      p.classList.toggle('oops', !!oops)
      p.textContent = oops ? FLAVOURS[oops].emoji : mystery ? '?' : f.emoji
      p.style.setProperty('--want', mystery ? '#fff' : f.rainbow ? '#ffe3ef' : f.icing)
      p.style.setProperty('--want-rim', mystery ? '#d9a7c0' : f.sponge)
      p.setAttribute('aria-label', `Layer ${i + 1}: ${oops ? `${oops} is on the cake, tap to take it off` : mystery ? 'what comes next?' : game.order.layers[i]}`)
      p.classList.toggle('next', i === n && game.state !== 'party')
      return
    }
    // Counting: only the layers on the cake have dots, so the child compares the cake with the friend's
    // number instead of filling empty slots. After two miscounts the friend's number of empty dots comes back.
    if (missionTarget()) p.classList.toggle('ghost', !on && !(game.miscounts >= 2 && i < missionTarget()))
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
  const name = animalName(customer.def.animal)
  if (game.order.layers.includes(null)) return voice.sayNow(`${name} wants a pattern that you make up! Choose ${game.order.design === 3 ? 'three' : 'two'} layers, then keep it going.`)
  if (game.order.design) return voice.sayNow(`Your pattern! ${orderWords(game.order.layers.slice(0, game.order.design))}. Keep it going!`)
  if (game.order.memory && !game.order.hidden) return voice.sayNow(`${name} wants ${orderWords(game.order.layers)}! Remember it!`)
  if (!game.order.groups.length) return voice.sayNow(`${name} wants ${orderWords(game.order.layers)}!`)
  // A pattern is said only as far as it is shown: the rest is the child's to work out.
  const shown = game.order.layers.filter((_, i) => !isMystery(i))
  voice.sayNow(shown.length < game.order.layers.length ? `${name} wants a pattern! ${orderWords(shown)}. What comes next?` : `${name} wants a pattern! ${orderWords(shown)}.`)
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
  if (game.state !== 'play' || (mover && mover.dropping) || cake?.surprise || game.counting) return
  game.idle = (game.idle || 0) + dt
  // A quiet reminder only after a long pause; a child who is simply watching is left to watch.
  if (game.idle > 30 && $('hint').classList.contains('hidden')) {
    if (mover) showHintAt(null)
    else pantry.classList.add('invite')
  }
}

function updateHint() {
  const el = $('hint')
  if (el.classList.contains('hidden')) return
  // The tap hint points at the top of the cake, where the sliding layer will land
  const pos = hintAt.pos || (cake && game.state === 'play' ? hintSpot.set(cake.group.position.x + topLayer().x + leanAt(topY()), topY(), 0) : null)
  let x = innerWidth / 2
  let y = innerHeight * 0.62
  if (pos instanceof Element) {
    // A button on screen (the pantry, the candle): the fingertip rests on its middle.
    const r = pos.getBoundingClientRect()
    x = r.left + r.width / 2
    y = r.top + r.height * 0.5
  } else if (pos) {
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
  pantry.classList.add('hidden')
  voice.hush()
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
  Object.assign(game, { level: debugLevel, streak: 0, lastFlavour: null, cakes: 0, miscounts: 0 })
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
  if (game.state !== 'play' || (mover && mover.dropping) || game.counting || cake?.surprise) return
  sound.click()
  if (missionTarget()) checkCount()
  else finishCake('done')
})
const soundBtn = $('sound')
function setSound(on) {
  sound.setMuted(!on)
  voice.setMuted(!on)
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
  if (game.state === 'play' && !game.counting) cake?.surprise ? liftSurprise() : drop()
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
    // A focused button (a plate, a slice, a pantry flavour) handles its own key.
    if (document.activeElement?.tagName === 'BUTTON' && document.activeElement !== document.body) return
    e.preventDefault()
    if (game.state === 'title') return start()
    if (game.state === 'card') return nextCake()
    if (game.state === 'share') return
    tap()
  }
  // At the party, 1–4 give a friend a slice and 0 gives the baker one; with Shift they put one back.
  const digit = /^Digit([0-4])$/.exec(e.code)
  if (game.state === 'share' && digit) {
    const i = digit[1] === '0' ? share.state.guests.length : Number(digit[1]) - 1
    if (e.shiftKey) share.takeBack(i)
    else share.give(i)
  }
})
// Tapping the order's dots says the order again.
$('pips').parentElement.addEventListener('click', (e) => {
  e.stopPropagation()
  if (!game.order || game.state !== 'play') return
  if (game.order.memory && game.order.hidden) return peek()
  sayOrder()
})

/** A memory order: tapping the dots shows the whole order again for a moment (it is never a mistake to look). */
let peekTimer = 0
function peek() {
  if (game.peeking) return
  game.peeking = true
  game.peeks++
  sound.click()
  updateHud()
  renderPantry()
  clearTimeout(peekTimer)
  const run = game.run
  peekTimer = setTimeout(() => {
    if (run !== game.run) return
    game.peeking = false
    updateHud()
    renderPantry()
  }, 2200)
}

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
  window.cakeStack = { game, frame, get cake() { return cake }, get mover() { return mover }, get customer() { return customer }, camera, scene, recipeStudio, share, drop, startShare, choose, checkCount, liftSurprise }
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
