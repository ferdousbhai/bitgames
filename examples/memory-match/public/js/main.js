import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Sound, VOICE_LENGTH } from './audio.js'
import { Talk } from './talk.js'
import { createVoice, listWords } from './speech.js'
import { Effects } from './effects.js'
import { tween, wait, clearTweens, updateTweens, ease } from './tween.js'

// --- Game data ------------------------------------------------------------------------

/** Every animal in models/animals.glb, with the colour of its card spot. */
const ANIMALS = {
  dog: { emoji: '🐶', color: '#ffbf7a' },
  cat: { emoji: '🐱', color: '#ffe08a' },
  frog: { emoji: '🐸', color: '#a8ec7a' },
  lion: { emoji: '🦁', color: '#ffcf5c' },
  panda: { emoji: '🐼', color: '#cfe0ee' },
  pig: { emoji: '🐷', color: '#ffb0d0' },
  bunny: { emoji: '🐰', color: '#d4c6ff' },
  chick: { emoji: '🐥', color: '#fff38f' },
  elephant: { emoji: '🐘', color: '#a8dcff' },
  fox: { emoji: '🦊', color: '#ffad85' },
  penguin: { emoji: '🐧', color: '#8fd3ff' },
  cow: { emoji: '🐮', color: '#bff2cf' },
  fish: { emoji: '🐠', color: '#9fe3ff' },
}
const NAMES = Object.keys(ANIMALS)

/**
 * Words for each animal: the plural, what its call is called, the call itself as children say it
 * (the sound card says it after the animal's voice and shows it written, so the sound is a real
 * word to know, "Moo!", and still works with the sound off), and its baby.
 */
const WORDS = {
  dog: { many: 'dogs', says: 'barks', call: 'Woof woof!', baby: 'puppy' },
  cat: { many: 'cats', says: 'meows', call: 'Meow!', baby: 'kitten' },
  frog: { many: 'frogs', says: 'croaks', call: 'Ribbit!' }, // a tadpole looks nothing like a small frog
  lion: { many: 'lions', says: 'roars', call: 'Roar!', baby: 'cub' },
  panda: { many: 'pandas', baby: 'cub' }, // no call a child knows: left out of Sounds
  pig: { many: 'pigs', says: 'oinks', call: 'Oink oink!', baby: 'piglet' },
  bunny: { many: 'bunnies', baby: 'kit' }, // a bunny is nearly silent: left out of Sounds
  chick: { many: 'chicks', says: 'cheeps', call: 'Cheep cheep!' }, // already a baby
  elephant: { many: 'elephants', says: 'trumpets', call: 'Toot toot!', baby: 'calf' },
  fox: { many: 'foxes', says: 'yips', call: 'Yip yip!', baby: 'kit' },
  penguin: { many: 'penguins', says: 'honks', call: 'Honk honk!', baby: 'chick' },
  cow: { many: 'cows', says: 'moos', call: 'Moo!', baby: 'calf' },
  fish: { many: 'fish' }, // no call to learn (it blows bubbles), and its baby (a fry) is not a word for 3–8
}
const WITH_BABIES = NAMES.filter((name) => WORDS[name].baby)
const WITH_CALLS = NAMES.filter((name) => WORDS[name].call)
/** "A calf is a cow's or an elephant's baby." */
const orWords = new Intl.ListFormat('en-GB', { type: 'disjunction' })
const cap = (word) => word[0].toUpperCase() + word.slice(1)
const an = (word) => (/^[aeiou]/.test(word) ? 'An' : 'A')

/**
 * Homes mode (for 6–8): no two cards are the same. The child sorts by knowledge, flipping the
 * animals that live together: every card of a turn must belong with the first, so careful
 * thinking ("a pig is a farm animal, the dog is a pet") is what keeps a turn going.
 * The homes do not overlap: wild means wild on land, and the frog, the penguin and the fish go
 * with the water animals. Where a child's own knowledge is right too (a penguin is wild, a fish can
 * be a pet) the game says so (see ALSO) instead of correcting them.
 */
const GROUPS = {
  farm: { icon: '🌾', members: ['cow', 'pig', 'chick'], word: 'farm animals', is: 'lives on a farm', together: 'live on the farm' },
  pets: { icon: '🏡', members: ['dog', 'cat', 'bunny'], word: 'pets', is: 'is a pet', together: 'are pets at home' },
  wild: { icon: '🌳', members: ['lion', 'elephant', 'fox', 'panda'], word: 'wild animals on land', is: 'is a wild animal on land', together: 'are wild animals on land' },
  water: { icon: '🌊', members: ['frog', 'penguin', 'fish'], word: 'water animals', is: 'lives in the water', together: 'live in the water' },
}
const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([id, g]) => g.members.map((name) => [name, id])))
/** Where an animal is said to live, when that says more than its group's line. */
const LIVES = { penguin: 'swims in the cold sea', frog: 'lives in a pond' }
/** True outside the game too: a second home an animal also fits, and how to say it kindly. */
const ALSO = {
  penguin: { home: 'wild', line: 'is wild too' },
  frog: { home: 'wild', line: 'is wild too' },
  fish: { home: 'pets', line: 'can be a pet too' },
  bunny: { home: 'wild', line: 'can live in the wild too' },
}

/**
 * What a pair is. twins: two of the same animal (the default). sound: an animal and a card that
 * only plays its call. baby: an animal and its baby, the same model made small and round.
 * groups: the animals that live together (farm, home or wild), three or four at a time.
 */
const MODES = {
  twins: { word: 'Twins!', goal: 'Find the animal twins!', banner: 'Find the twins!', hint: 'Find the animal twins! Tap an animal to say hello.' },
  sound: { word: 'Sounds! Who says that?', goal: 'Listen! Find the animal that makes each sound.', banner: 'Who says that?', hint: 'Listen, then find the animal that makes the sound!' },
  baby: { word: 'Babies!', goal: 'Find each animal’s baby!', banner: 'Find the babies!', hint: 'Find each animal’s baby!' },
  groups: { word: 'Homes! Who lives together?', goal: 'Find the animals that live together! Keep turning cards that belong with the first one.', banner: 'Who lives together?', hint: 'Farm, home, wild or water? Find who lives together.' },
}
/** The bigger boards change the rule a little, so they have their own goal instead of the mode's. */
const LEVEL_GOALS = {
  cradle: 'Sleeping babies! Listen to the baby’s name, then find its mum or dad.',
  looks: 'Look closely! Some twins wear a bow, and some wear a hat.',
}
/**
 * Twins from this level on (12 cards and up) have look-alikes: the same animal twice over, one
 * pair with a bow and one with a hat, so the child must look closely, not just remember "dog".
 * One look-alike animal at 12 cards, two at 16, three at 20.
 */
const LOOK_LEVEL = 3
const LOOKS = {
  bow: { icon: '🎀', a: 'a bow', many: 'bows', color: '#ff5c8a' },
  hat: { icon: '🧢', a: 'a hat', many: 'hats', color: '#4d8cff' },
}
/** Phrases said when a pair (or a group) is found. */
const MATCH_WORDS = {
  twins: (name, look) => `Two ${WORDS[name].many}${look ? ` with ${LOOKS[look].many}` : ''}!`,
  sound: (name) => `The ${name} ${WORDS[name].says}!`,
  baby: (name) => `${an(name)} ${name}’s baby is a ${WORDS[name].baby}!`,
  groups: (id, names) => `${cap(listWords.format(names))} ${GROUPS[id].together}!`,
}
/** Pairs per level: gentle for 3-year-olds, a real puzzle by the end. */
const LEVELS = [2, 3, 4, 6, 8, 10]
/**
 * Homes levels: cards in each group (a 4 is the wild group with all four of its animals). The top
 * two boards use all four homes, so the child keeps four groups in mind at once.
 */
const GROUP_LEVELS = [[3, 3], [3, 3, 3], [3, 3, 4], [3, 3, 3, 3], [3, 3, 4, 3]]
/**
 * Babies from this level on (12 cards and up) sleep in a basket under a blanket: the card only
 * says the baby's word ("Kitten!"), so the child must know whose baby a kitten is. Any parent with
 * that word matches ("cub" is a lion's or a panda's baby), and the baby that wakes up is theirs.
 */
const CRADLE_LEVEL = 3
/** Clue words ("Moo!", "Kit!") said across a board: at most this many in this many seconds. */
const CLUE_BURST = 3
const CLUE_WINDOW = 5
/**
 * Cards on each level a mode offers. Sounds stops at 8 pairs: ten identical loudspeakers is too
 * much to hold in mind for a young child. (An old Sounds save marking level 6 done is simply ignored.)
 */
const levelsFor = (mode) =>
  mode === 'groups' ? GROUP_LEVELS.map((g) => g.reduce((a, b) => a + b)) : (mode === 'sound' ? LEVELS.slice(0, 5) : LEVELS).map((p) => p * 2)
/** Seconds between each animal's hello when a board is finished, so only one voice plays at a time. */
const WIN_CALL_GAP = 0.9

const CARD_W = 1.0
const CARD_D = 1.3
const GAP_X = 0.24
const GAP_Z = 0.3
const MAT_TOP = 0.03
const REST_Y = MAT_TOP + 0.05 // card centre when lying on the mat
const FACE_TOP = 0.05 // top of the face-up spot above the card centre
const ANIMAL_SIZE = 0.8
const ANIMAL_H = 0.85 * ANIMAL_SIZE
const PARADE_GAP = 1.05

const $ = (id) => document.getElementById(id)
const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// --- Saved progress (finished levels per mode) ---------------------------------------

const SAVE_KEY = 'memory-match:v2'
// next: the level each mode suggests after the last win (see adaptNext), so Play moves on
// book: what the child has found out about each animal (see the animal book), e.g. { cow: { met: 1, call: 1, baby: 1, home: 1 } }
const progress = { muted: false, mode: 'twins', modeDone: {}, next: {}, book: {} }
try {
  Object.assign(progress, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {})
} catch {}
if (!MODES[progress.mode]) progress.mode = 'twins'
progress.modeDone = { twins: {}, sound: {}, baby: {}, groups: {}, ...progress.modeDone }
progress.next = { ...progress.next }
progress.book = { ...progress.book }
// Older saves kept twins' finished levels in `stars` (and an unused `best`): move them over once
Object.assign(progress.modeDone.twins, progress.stars)
delete progress.stars
delete progress.best
/** Finished levels for the chosen kind of matching. */
const doneLevels = () => progress.modeDone[progress.mode]
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress))
  } catch {}
}

// --- Scene ---------------------------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
const BG = new THREE.Color('#f3d7b0')
scene.background = BG
scene.fog = new THREE.Fog(BG, 20, 50)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45

scene.add(new THREE.HemisphereLight('#fff8ec', '#d9a874', 1.5))
const sun = new THREE.DirectionalLight('#fff3dc', 2.3)
sun.position.set(-3.5, 10, 5)
sun.castShadow = true
const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048
sun.shadow.mapSize.set(shadowSize, shadowSize)
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.02
sun.shadow.radius = 3
scene.add(sun, sun.target)

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120)
const fitCam = camera.clone()
const sound = new Sound()
sound.setMuted(progress.muted)
const voice = createVoice({ muted: progress.muted, rate: 0.85, pitch: 1.1 })
const talk = new Talk(sound, voice)
const effects = new Effects(scene)

const assets = { animals: {}, card: null, setting: {}, felt: null }
const room = { mat: null, felt: null, props: [] }
/** World size of one tile of the mat's checked felt (models/mat_felt.jpg, made by blender/mat_texture.py). */
const FELT_TILE = new THREE.Vector2(1.5, 1.5 * (864 / 1024))
const board = new THREE.Group()
const parade = new THREE.Group()
scene.add(board, parade)

const game = {
  state: 'loading', // loading | menu | dealing | play | won
  level: 0,
  cards: [],
  open: [],
  matched: 0,
  turns: 0,
  peekUsed: false,
  round: 0,
  mode: 'twins', // twins | sound | baby | groups (see MODES)
  sets: [], // what each match is: an animal, or (Homes) a group id, in HUD order
  setSize: {}, // cards in each set: 2 for a pair, 3 or 4 for a group
  slips: 0, // turns missed although a match for the first card had already been seen
  named: new Set(), // words already said on a reveal this round (each name is said once)
  clueTimes: [], // when clue words were last said (see sayClue): a quick tapper hears at most a few
  goalSaid: null, // the mode whose goal was last spoken, so it is never said twice in a row
  busy: false,
  mismatch: null,
  layout: null,
  paradeAnimals: [],
  time: 0,
  idle: 0, // seconds since the last tap while playing
  cam: { pos: new THREE.Vector3(0, 9, 9), offset: new THREE.Vector2() }, // always looks at the origin
}

// --- Assets ------------------------------------------------------------------------------

const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 })
const GLOSSY = new Set(['eye', 'shine', 'nose', 'gold', 'card_star'])

/**
 * The models use one material per colour, which would mean dozens of draw calls per animal.
 * Merge each part into one matte and one glossy mesh, with the colours moved into the vertices.
 * Materials listed in keep stay as their own meshes (the card spot, which is tinted per card).
 */
function bake(part, keep = []) {
  const meshes = part.isMesh ? [part] : part.children.filter((c) => c.isMesh)
  const buckets = new Map([[matte, []], [glossy, []]])
  const out = new THREE.Group()
  out.name = part.name
  out.position.copy(part.position)
  out.quaternion.copy(part.quaternion)
  out.scale.copy(part.scale)
  for (const mesh of meshes) {
    const name = mesh.material.name
    if (keep.includes(name)) {
      out.add(mesh.clone())
      continue
    }
    const geo = mesh.geometry.clone()
    if (mesh !== part) geo.applyMatrix4(mesh.matrix)
    const n = geo.attributes.position.count
    const colors = new Float32Array(n * 3)
    const { r, g, b } = mesh.material.color
    for (let i = 0; i < n * 3; i += 3) {
      colors[i] = r
      colors[i + 1] = g
      colors[i + 2] = b
    }
    for (const key of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(key)) geo.deleteAttribute(key)
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    buckets.get(GLOSSY.has(name) ? glossy : matte).push(geo)
  }
  for (const [material, geos] of buckets) {
    if (!geos.length) continue
    const merged = new THREE.Mesh(mergeGeometries(geos), material)
    merged.castShadow = true
    out.add(merged)
  }
  part.parent.add(out)
  part.removeFromParent()
  return out
}

async function loadAssets() {
  const loader = new GLTFLoader()
  const files = ['animals', 'card', 'setting']
  const loaded = {}
  const bytes = {}
  const report = () => {
    const pct = Math.round((Object.values(bytes).reduce((a, b) => a + b, 0) / 1.1e6) * 100)
    $('loading-text').textContent = `Waking up the animals… ${Math.min(99, pct)}%`
  }
  const felt = new THREE.TextureLoader().loadAsync('./models/mat_felt.jpg').then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    assets.felt = tex
  })
  await Promise.all([
    felt,
    ...files.map(async (name) => {
      loaded[name] = await loader.loadAsync(`./models/${name}.glb`, (e) => {
        bytes[name] = e.loaded
        report()
      })
    }),
  ])
  for (const name of NAMES) {
    const root = loaded.animals.scene.getObjectByName(`animal_${name}`)
    root.position.set(0, 0, 0)
    for (const part of [...root.children]) bake(part)
    assets.animals[name] = root
  }
  assets.card = loaded.card.scene.getObjectByName('card')
  for (const part of [...assets.card.children]) bake(part, ['card_spot'])
  assets.card.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  for (const child of [...loaded.setting.scene.children]) assets.setting[child.name] = child
}

function buildRoom() {
  const { table, mat } = assets.setting
  table.traverse((o) => (o.receiveShadow = true))
  mat.traverse((o) => (o.receiveShadow = true))
  scene.add(table, mat)
  room.mat = mat
  // The felt gets a soft checked blanket texture. The mesh has no UVs, so map its top straight
  // down: one unit of UV per unit of the unstretched mat, scaled to the tile in placeRoom.
  mat.traverse((o) => {
    if (!o.isMesh || o.material.name !== 'mat_felt' || !assets.felt) return
    const pos = o.geometry.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i)
      uv[i * 2 + 1] = pos.getZ(i)
    }
    o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    o.material.map = assets.felt
    o.material.color.set('#ffffff')
    o.material.needsUpdate = true
    room.felt = assets.felt
  })
  for (const name of ['prop_blocks', 'prop_ball', 'prop_rings', 'prop_crayons', 'prop_bear']) {
    const prop = assets.setting[name]
    if (!prop) continue
    prop.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true
    })
    prop.userData.toy = { name, prop, busy: false, size: new THREE.Box3().setFromObject(prop).getSize(new THREE.Vector3()) }
    scene.add(prop)
    room.props.push(prop)
  }
}

/** Stretches the play mat around the area and sets the toys just outside it. */
function placeRoom(hw, hd) {
  const w = hw + 0.45
  const d = hd + 0.45
  room.mat.scale.set((w * 2) / 6, 1, (d * 2) / 6)
  // Keep the checks the same size however far the mat stretches, centred on the board.
  if (room.felt) {
    room.felt.repeat.set(room.mat.scale.x / FELT_TILE.x, room.mat.scale.z / FELT_TILE.y)
    room.felt.offset.set(0.5, 0.5)
  }
  // Wide screens: toys beside the mat. Tall screens (and the menu, whose parade leaves the table
  // behind it empty) have room above the mat instead, so the toys line up behind it.
  const back = game.state === 'menu' ? 0.35 : 0 // a step further back, so no toy looks perched on an animal's head
  const at = game.state === 'menu' || innerWidth / innerHeight < 0.8
    ? {
        prop_crayons: [-w + 0.45, -d - 0.75 - back, 0.3],
        prop_bear: [-w * 0.33, -d - 0.7 - back, 0.2],
        prop_ball: [w * 0.25, -d - 0.75 - back, 0],
        prop_rings: [w - 0.4, -d - 0.7 - back, 0],
        prop_blocks: [0, -d - 1.7 - back * 0.5, 0.5],
      }
    : {
        prop_blocks: [-w - 0.75, d - 0.1, 0.5],
        prop_ball: [w + 0.75, d - 0.2, 0],
        prop_rings: [w + 0.7, -d + 0.3, 0],
        prop_crayons: [-w - 0.8, -d + 0.4, 0.3],
        prop_bear: [-w - 0.8, 0.2, 0.5],
      }
  for (const prop of room.props) {
    const [x, z, yaw] = at[prop.name]
    prop.position.set(x, 0, z)
    prop.rotation.set(0, yaw, 0)
    prop.scale.setScalar(1)
    prop.userData.toy.busy = false
  }
  const span = Math.max(w, d) + 2.5
  const cam = sun.shadow.camera
  cam.left = cam.bottom = -span
  cam.right = cam.top = span
  cam.near = 1
  cam.far = 40
  cam.updateProjectionMatrix()
}

/**
 * Slides each toy in towards the mat until the whole toy is on screen (and below the HUD), so
 * none is cut off at the edge; a toy that still does not fit is hidden.
 */
const _box = new THREE.Box3()
const _corner = new THREE.Vector3()
function settleProps(view, w, d) {
  /** A world box's screen rectangle in NDC: [left, right, bottom, top]. */
  const ndcBox = (box) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(fitCam)
      x0 = Math.min(x0, _corner.x); x1 = Math.max(x1, _corner.x)
      y0 = Math.min(y0, _corner.y); y1 = Math.max(y1, _corner.y)
    }
    return [x0, x1, y0, y1]
  }
  fitCam.position.copy(view.pos)
  fitCam.lookAt(0, 0, 0)
  fitCam.setViewOffset(innerWidth, innerHeight, view.offset.x, view.offset.y, innerWidth, innerHeight)
  fitCam.updateProjectionMatrix()
  fitCam.updateMatrixWorld()
  // The HTML on top of the scene, in NDC: a toy may not hide behind it.
  const range = document.createRange()
  const blockers = []
  for (const el of document.querySelectorAll('#hud:not(.hidden) .hud-left, #hud:not(.hidden) .hud-center, #menu:not(.hidden) .logo, #menu:not(.hidden) .hint, #menu:not(.hidden) .book-btn, #menu:not(.hidden) #play, #menu:not(.hidden) .level, #menu:not(.hidden) .mode, #win:not(.hidden) .win-card')) {
    range.selectNodeContents(el) // the text itself, not the full-width paragraph around it
    const r = el.matches('.hint, .logo')
      ? range.getBoundingClientRect()
      : el.matches('.win-card') // its layout box: it is still scaled small by the pop-in
        ? { left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth, top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight }
        : el.getBoundingClientRect()
    // The HUD buttons get a margin, so a toy never crowds the home or sound button.
    const m = el.matches('.hud-left, .book-btn') ? 18 : 0
    // A toy peeking out from under the win card looks lost, so that one must be fully clear.
    const tol = el.matches('.win-card') ? 0.01 : 0.15
    blockers.push([((r.left - m) / innerWidth) * 2 - 1, ((r.right + m) / innerWidth) * 2 - 1, 1 - ((r.bottom + m) / innerHeight) * 2, 1 - ((r.top - m) / innerHeight) * 2, tol])
  }
  // The menu's animals too, with a little headroom, so no toy seems to sit on an animal's head
  // like a hat (they may still pop in, so use their full size).
  const animals = []
  for (const a of game.paradeAnimals) {
    _box.min.set(a.holder.position.x - 0.45 * a.size, 0, -0.3 * a.size)
    _box.max.set(a.holder.position.x + 0.45 * a.size, ANIMAL_H * a.size / ANIMAL_SIZE + 0.3, 0.3 * a.size)
    animals.push(ndcBox(_box))
  }
  const shown = (lo, hi, min, max) => Math.max(0, Math.min(hi, max) - Math.max(lo, min)) / (hi - lo)
  // Most of the toy (85%) must be on screen and clear of the HTML: enough to see what it is and tap it.
  const onScreen = (prop) => {
    prop.updateMatrixWorld(true)
    const [x0, x1, y0, y1] = ndcBox(_box.setFromObject(prop))
    if (shown(x0, x1, -1, 1) * shown(y0, y1, -1, 1) < 0.85) return false
    if (!animals.every(([l, r, b, t]) => shown(x0, x1, l, r) * shown(y0, y1, b, t) < 0.02)) return false
    return blockers.every(([l, r, b, t, tol]) => shown(x0, x1, l, r) * shown(y0, y1, b, t) < tol)
  }
  for (const prop of room.props) {
    const { size } = prop.userData.toy
    const side = Math.abs(prop.position.x) > w // beside the mat, so it can slide in sideways
    const inner = w + 0.08 + Math.max(size.x, size.z) / 2
    let ok = onScreen(prop)
    while (!ok && side && Math.abs(prop.position.x) - 0.1 >= inner) {
      prop.position.x -= Math.sign(prop.position.x) * 0.1
      ok = onScreen(prop)
    }
    // Behind the mat: step further back until it is clear of the animals in front.
    const z = prop.position.z
    while (!ok && !side && prop.position.z > z - 2) {
      prop.position.z -= 0.1
      ok = onScreen(prop)
    }
    if (!ok) prop.position.z = z
    prop.visible = ok
  }
  fitCam.clearViewOffset()
}

// --- Animals -------------------------------------------------------------------------------

function makeAnimal(name) {
  const root = assets.animals[name].clone(true)
  const holder = new THREE.Group()
  holder.add(root)
  const head = root.getObjectByName(`${name}_head`)
  const a = {
    name, holder, head,
    phase: Math.random() * 10,
    pop: 1, hop: 0, spin: 0, yaw: 0, squash: 0, nod: 0, shake: 0, tilt: 0, excited: false, baseY: 0, size: ANIMAL_SIZE,
    wide: 1, // a baby is a little rounder
    baby: false,
    busy: false,
  }
  holder.userData.animal = a // lets a tap find its animal (see tagged())
  return a
}

/** A baby tips its big head back to look up at the child (negative x turns the face up). */
const LOOK_UP = -0.45
/** Babies are softer and paler than their parents: a gentle cream glow lifts every colour. */
const babyMaterials = new Map(
  [matte, glossy].map((m) => [m, Object.assign(m.clone(), { emissive: new THREE.Color('#fff1e6'), emissiveIntensity: 0.1 })]),
)

/**
 * The same animal as a baby: smaller, rounder and paler, with a small body under a big head that
 * looks up, so it reads as a baby by shape and colour, not by size alone (far cards look small too).
 */
function babyfy(a) {
  a.baby = true
  a.size = ANIMAL_SIZE * 0.68
  a.wide = 1.1
  // A small body under a big head: the head sits lower on the neck and grows, the body shrinks
  if (a.head) {
    for (const part of a.head.parent.children) if (part !== a.head) part.scale.setScalar(0.78)
    a.head.position.multiplyScalar(0.78)
    a.head.scale.setScalar(1.35)
    a.lookUp = LOOK_UP
  }
  a.holder.traverse((o) => {
    if (o.isMesh && babyMaterials.has(o.material)) o.material = babyMaterials.get(o.material)
  })
  return a
}

/** Where the top of each animal's head is (in the head's own space), measured once. */
const headTops = {}
function headTop(a) {
  if (headTops[a.name]) return headTops[a.name]
  a.holder.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(a.head)
  const top = a.head.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2))
  return (headTops[a.name] = { top, width: box.max.x - box.min.x })
}

const lookParts = {
  loop: new THREE.ConeGeometry(0.075, 0.13, 14).rotateZ(Math.PI / 2),
  knot: new THREE.SphereGeometry(0.04, 12, 8),
  cap: new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  band: new THREE.TorusGeometry(0.12, 0.022, 8, 24).rotateX(Math.PI / 2),
  bobble: new THREE.SphereGeometry(0.045, 12, 8),
  white: new THREE.MeshStandardMaterial({ color: '#fff6e8', roughness: 0.8 }),
}
const lookMaterials = Object.fromEntries(Object.entries(LOOKS).map(([id, l]) => [id, new THREE.MeshStandardMaterial({ color: l.color, roughness: 0.6 })]))

/** A look-alike twin wears something on its head: a bow or a woolly hat (see LOOKS). */
function dressUp(a, look) {
  if (!a.head) return a
  a.look = look
  const { top, width } = headTop(a)
  const g = new THREE.Group()
  const m = lookMaterials[look]
  if (look === 'bow') {
    const left = new THREE.Mesh(lookParts.loop, m)
    left.position.x = -0.075
    const right = new THREE.Mesh(lookParts.loop, m)
    right.position.x = 0.075
    right.rotation.z = Math.PI
    g.add(left, right, new THREE.Mesh(lookParts.knot, m))
    g.position.copy(top).add(new THREE.Vector3(0, 0.02, 0.02))
  } else {
    g.add(new THREE.Mesh(lookParts.cap, m), new THREE.Mesh(lookParts.band, lookParts.white))
    const bobble = new THREE.Mesh(lookParts.bobble, lookParts.white)
    bobble.position.y = 0.13
    g.add(bobble)
    g.position.copy(top).add(new THREE.Vector3(0, -0.03, 0))
  }
  // A big head gets a bigger bow; the head's own scale is undone so every bow reads alike
  g.scale.setScalar(THREE.MathUtils.clamp(width / 0.5, 0.8, 1.4) / a.head.scale.x)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  a.head.add(g)
  return a
}

/** A small written label (a baby's word, a call): a cream paper tag drawn on a canvas, one per text. */
const tagTextures = {}
const tagMaterials = {}
const tagGeometry = new THREE.PlaneGeometry(0.66, 0.22)
function makeTag(text) {
  const tex = (tagTextures[text] ??= (() => {
    const c = document.createElement('canvas')
    c.width = 384
    c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = '#fffaf0'
    g.strokeStyle = '#b9adff'
    g.lineWidth = 8
    g.beginPath()
    g.roundRect(6, 6, 372, 116, 54)
    g.fill()
    g.stroke()
    g.fillStyle = '#5a3d7a'
    g.font = '900 64px ui-rounded, "Arial Rounded MT Bold", Nunito, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 64
    while (g.measureText(text).width > 340 && size > 30) g.font = `900 ${(size -= 4)}px ui-rounded, "Arial Rounded MT Bold", Nunito, system-ui, sans-serif`
    g.fillText(text, 192, 68)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  })())
  const tag = new THREE.Mesh(tagGeometry, (tagMaterials[text] ??= new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })))
  // Lies on the front of the card, tipped up towards the child
  tag.rotation.x = -Math.PI / 2 + 0.55
  tag.position.set(0, FACE_TOP + 0.1, 0.47)
  tag.visible = false
  return tag
}

/** What an animal is called: "Cow!", or for a baby "Calf!". */
const nameOf = (a) => `${cap(a.baby ? WORDS[a.name].baby : a.name)}${a.look ? ` with ${LOOKS[a.look].a}` : ''}!`

/**
 * Says an animal's name after its call. For a card being revealed (card), a name already said this
 * round is not said again (the call alone is enough), and both go stale (are skipped, never said
 * late) once the card has turned back; its name also once it is matched, as the match line says it.
 */
function callAndName(a, { card = null } = {}) {
  const word = nameOf(a)
  if (!card) {
    talk.call(a.name, { baby: a.baby, droppable: true })
    talk.say(word, { droppable: true })
    return
  }
  const down = () => card.state === 'down' || card.state === 'closing'
  talk.call(a.name, { baby: a.baby, stale: () => down() || (card.state === 'matched' && card.kind !== 'sound') })
  if (game.named.has(word) || talk.has(word)) return
  talk.say(word, { droppable: true, stale: () => card.state !== 'open' && card.state !== 'opening', onStart: () => game.named.add(word) })
}

function poseAnimal(a, time) {
  const t = time + a.phase
  const bounce = a.excited ? Math.abs(Math.sin(t * 6.5)) * 0.07 : 0
  a.holder.position.y = a.baseY + a.hop + bounce
  a.holder.rotation.y = a.yaw + a.spin
  const s = a.pop * a.size
  const breathe = Math.sin(t * 3) * 0.02
  const w = s * a.wide * (1 + a.squash * 0.5)
  a.holder.scale.set(w, s * (1 - a.squash + breathe), w)
  if (a.head) a.head.rotation.set((a.lookUp ?? 0) + a.nod + Math.sin(t * 2.3) * 0.05, a.shake + Math.sin(t * 0.9) * 0.12, a.tilt + Math.sin(t * 1.7) * 0.07)
}

/** A happy dance: three hops, a full spin and a wiggly head. */
function dance(a, { delay = 0, dur = 1.25, hops = 3, height = 0.45 } = {}) {
  a.busy = true
  return tween(dur, (t) => {
    const ph = (t * hops) % 1
    a.hop = Math.sin(ph * Math.PI) * height * (1 - t * 0.35)
    a.squash = ph < 0.12 ? (0.12 - ph) * 1.4 : ph > 0.9 ? (ph - 0.9) * 1.6 : -0.06
    a.spin = ease.inOutCubic(t) * Math.PI * 2
    a.tilt = Math.sin(t * Math.PI * hops * 2) * 0.28
    if (t >= 1) Object.assign(a, { hop: 0, squash: 0, spin: 0, tilt: 0, busy: false })
  }, { delay })
}

function hopOnce(a, height = 0.3) {
  if (a.busy) return
  a.busy = true
  tween(0.45, (t) => {
    a.hop = Math.sin(t * Math.PI) * height
    a.squash = t < 0.15 ? (0.15 - t) * 1.2 : 0
    a.nod = -Math.sin(t * Math.PI) * 0.2
    if (t >= 1) Object.assign(a, { hop: 0, squash: 0, nod: 0, busy: false })
  })
}

// --- Cards ------------------------------------------------------------------------------------

const ringGeometry = new THREE.TorusGeometry(0.37, 0.03, 8, 48)
const ringMaterial = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 })
/** One tinted card-spot material per animal, shared by every card that shows it. */
const spotMaterials = {}
/** A sound card's (or a sleeping baby's) spot stays plain until it is matched: its colour would give the animal away. */
let soundSpot = null

// The sound card's loudspeaker, made at runtime: a box, a cone and three sound waves, standing up
// and facing the child like the 🔊 picture on the menu.
const speakerParts = {
  box: new THREE.BoxGeometry(0.14, 0.2, 0.14),
  cone: new THREE.CylinderGeometry(0.07, 0.19, 0.16, 28, 1, true).rotateZ(Math.PI / 2),
  cap: new THREE.CircleGeometry(0.19, 28).rotateY(Math.PI / 2),
  wave: (r) => new THREE.TorusGeometry(r, 0.028, 8, 24, Math.PI / 2).rotateZ(-Math.PI / 4),
  body: new THREE.MeshStandardMaterial({ color: '#8c7cf0', roughness: 0.45 }),
  inside: new THREE.MeshStandardMaterial({ color: '#5a3d7a', roughness: 0.7, side: THREE.DoubleSide }),
}
const waveGeometries = [0.13, 0.23, 0.33].map((r) => speakerParts.wave(r))

function makeSpeaker() {
  const group = new THREE.Group()
  const lean = new THREE.Group() // leans back a little towards the camera
  lean.position.y = 0.32
  lean.rotation.x = -0.35
  group.add(lean)
  const box = new THREE.Mesh(speakerParts.box, speakerParts.body)
  box.position.x = -0.2
  const cone = new THREE.Mesh(speakerParts.cone, speakerParts.body)
  cone.position.x = -0.06
  const cap = new THREE.Mesh(speakerParts.cap, speakerParts.inside)
  cap.position.x = 0.02
  lean.add(box, cone, cap)
  const waves = waveGeometries.map((geo) => {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffbe0b', emissive: '#ff9f1c', emissiveIntensity: 0.15, roughness: 0.4 })
    const wave = new THREE.Mesh(geo, mat)
    wave.position.x = 0.04
    lean.add(wave)
    return wave
  })
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return { group, waves, pop: 0, yaw: 0 }
}

// A little wicker basket that every baby sits in, so a baby reads as a baby from above (not by
// size alone). On the bigger Babies boards (CRADLE_LEVEL) a blanket hides who is asleep in it.
const basketParts = {
  base: new THREE.CylinderGeometry(0.29, 0.24, 0.12, 32).translate(0, 0.06, 0),
  rim: new THREE.TorusGeometry(0.29, 0.05, 10, 36).rotateX(Math.PI / 2).translate(0, 0.12, 0),
  blanket: new THREE.SphereGeometry(0.27, 28, 14).scale(1, 0.5, 1).translate(0, 0.13, 0.02),
  pillow: new THREE.SphereGeometry(0.11, 18, 10).scale(1.5, 0.7, 0.9).translate(0, 0.17, -0.17),
  fold: new THREE.CapsuleGeometry(0.035, 0.38, 6, 12).rotateZ(Math.PI / 2).scale(1, 0.9, 1.5).translate(0, 0.235, -0.05),
  wicker: new THREE.MeshStandardMaterial({ color: '#c9945a', roughness: 0.8 }),
  rimWicker: new THREE.MeshStandardMaterial({ color: '#dcae72', roughness: 0.7 }),
  cloth: new THREE.MeshStandardMaterial({ color: '#ffc9dc', roughness: 0.9 }),
  pillowCloth: new THREE.MeshStandardMaterial({ color: '#fff4e4', roughness: 0.9 }),
}

function makeBasket(covered) {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(basketParts.base, basketParts.wicker), new THREE.Mesh(basketParts.rim, basketParts.rimWicker))
  let blanket = null
  if (covered) {
    blanket = new THREE.Group()
    // A pink blanket turned down at the top, over a cream pillow: someone small is asleep in there
    blanket.add(new THREE.Mesh(basketParts.blanket, basketParts.cloth), new THREE.Mesh(basketParts.pillow, basketParts.pillowCloth), new THREE.Mesh(basketParts.fold, basketParts.pillowCloth))
    group.add(blanket)
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  return { group, blanket, pop: 0 }
}

class Card {
  /**
   * kind: 'animal', 'sound' (plays the call, shows a loudspeaker), 'baby' (in its basket) or
   * 'cradle' (a baby asleep under a blanket: only its word is heard until it is matched).
   * set: what it matches with (its animal, or in Homes the group it lives in). look: a look-alike
   * twin's bow or hat (see LOOKS).
   */
  constructor(animal, kind = 'animal', set = animal, look = null) {
    this.animal = animal
    this.kind = kind
    this.set = set
    this.seen = false // turned up at least once this round
    this.clues = 0 // times this clue card's word was said this round (see sayClue)
    this.state = 'down' // down | opening | open | closing | matched
    this.group = new THREE.Group()
    this.group.userData.card = this // a tap anywhere on the card, its animal or its ring finds the card
    this.pivot = new THREE.Group()
    this.group.add(this.pivot)
    const mesh = assets.card.clone(true)
    mesh.traverse((o) => {
      if (o.isMesh && o.material.name === 'card_spot') {
        this.spot = o
        this.base = o.material
        // A sound card or a sleeping baby keeps a plain spot until it is matched: its colour
        // would give the animal away.
        if (kind === 'sound' || kind === 'cradle') {
          o.material = soundSpot ??= o.material.clone()
          soundSpot.color.set('#efe9ff')
        } else this.tint()
      }
    })
    this.pivot.add(mesh)
    this.critter = makeAnimal(animal)
    this.critter.baseY = FACE_TOP
    if (look) dressUp(this.critter, look)
    if (kind === 'baby' || kind === 'cradle') {
      babyfy(this.critter)
      this.critter.baseY = FACE_TOP + 0.05 // sitting in the basket
      this.basket = makeBasket(kind === 'cradle')
      this.basket.group.position.y = FACE_TOP
      this.basket.group.visible = false
      this.group.add(this.basket.group)
    }
    this.critter.holder.position.z = 0.1
    this.critter.holder.visible = false
    this.critter.pop = 0
    this.group.add(this.critter.holder)
    if (kind === 'sound') {
      this.speaker = makeSpeaker()
      this.speaker.group.position.y = FACE_TOP
      this.speaker.group.visible = false
      this.group.add(this.speaker.group)
    }
    // A clue card's clue is also written on it ("Moo!", "kit"), so it still works with the sound off
    if (kind === 'sound' || kind === 'cradle') {
      this.tag = makeTag(kind === 'sound' ? WORDS[animal].call : WORDS[animal].baby)
      this.tagPop = 0
      this.group.add(this.tag)
    }
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = FACE_TOP + 0.01
    this.ring.visible = false
    this.group.add(this.ring)
    this.hover = 0
    this.hoverTarget = 0
    this.lift = 0
    this.waveUntil = 0
    this.hintUntil = 0
    this.revealed = null
  }

  /** Colours the spot in the animal's own colour. */
  tint() {
    if (!this.spot) return
    this.spot.material = spotMaterials[this.animal] ??= this.base.clone()
    this.spot.material.color.set(ANIMALS[this.animal].color)
  }

  /** Flips the card over with a little hop, then (face up) pops the animal out. */
  flipUp() {
    this.state = 'opening'
    this.seen = true
    sound.flip()
    this.revealed = this.reveal() // tapCard waits on this for both cards of a turn
    return this.revealed
  }

  async reveal() {
    await tween(0.42, (t) => {
      this.pivot.rotation.z = ease.inOutCubic(t) * Math.PI
      this.lift = Math.sin(t * Math.PI) * 0.6
    })
    this.lift = 0
    this.land()
    await this.popOut()
  }

  async popOut() {
    sound.pop()
    effects.sparkle(this.worldTop(), { count: 10, speed: 1.4, up: 1.6, size: 0.06 })
    if (this.kind === 'sound') {
      // Only the call ("Moo!"): the child must know or remember who makes it and find that animal.
      const sp = this.speaker
      sp.group.visible = true
      this.playCall()
      this.showTag()
      await tween(0.42, (t) => (sp.pop = ease.outBack(t)))
    } else if (this.kind === 'cradle') {
      // Only the word: the child must know whose baby a kitten is.
      talk.hurry()
      this.sayClue()
      this.showTag()
      await this.showBasket()
    } else {
      callAndName(this.critter, { card: this })
      if (this.basket) this.showBasket()
      await this.showAnimal()
    }
    if (this.state === 'opening') this.state = 'open'
  }

  showBasket() {
    const b = this.basket
    b.group.visible = true
    if (b.blanket) b.blanket.visible = this.state !== 'matched'
    return tween(0.42, (t) => (b.pop = ease.outBack(t)))
  }

  /**
   * A clue card's word ("Moo!", "Kitten!"), said first: older names waiting are dropped. Never late:
   * it goes stale once the card turns back. Said on the first two reveals of each card in a round;
   * after that the written tag carries it, and tapping the open card says it again (again = true).
   * Across the board, at most CLUE_BURST clue words in CLUE_WINDOW seconds: random tapping is
   * answered by the tags (and a sound card's call), not by a stream of words.
   */
  sayClue(again = false) {
    if (!again && this.clues >= 2) return
    const text = this.kind === 'sound' ? WORDS[this.animal].call : nameOf(this.critter)
    if (talk.has(text)) return
    game.clueTimes = game.clueTimes.filter((t) => game.time - t < CLUE_WINDOW)
    if (!again && game.clueTimes.length >= CLUE_BURST) return
    talk.say(text, {
      stale: () => this.clueStale(),
      onStart: () => {
        this.clues++
        game.clueTimes.push(game.time)
      },
    })
  }

  /**
   * A clue is never said late: it goes stale once its card turns back. A sound card's call and word
   * also outlast a quick match, so the child hears "Moo!" before "The cow moos!" answers it.
   */
  clueStale() {
    if (this.kind === 'sound') return this.state === 'down' || this.state === 'closing'
    return this.state !== 'open' && this.state !== 'opening'
  }

  showTag() {
    this.tag.visible = true
    tween(0.42, (t) => (this.tagPop = ease.outBack(t)))
  }

  /** A matched cradle: the blanket slides away and the baby sits up. */
  async wake() {
    const blanket = this.basket.blanket
    await tween(0.3, (t) => {
      blanket.scale.setScalar(Math.max(0.001, 1 - ease.inCubic(t)))
      blanket.position.y = t * 0.1
    })
    blanket.visible = false
    this.tint()
    effects.sparkle(this.worldTop(), { count: 8, speed: 1.2, up: 1.4, size: 0.06 })
    await this.showAnimal()
  }

  /** The sound card's call, with its waves pulsing while it plays. */
  playCall(again = false) {
    talk.hurry() // the sound is the clue: older names (and a goal still being said) give way
    talk.call(this.animal, { onStart: () => (this.waveUntil = game.time + (VOICE_LENGTH[this.animal] ?? 0.6) + 0.2), stale: () => this.clueStale() })
    this.sayClue(again)
  }

  async showAnimal() {
    const a = this.critter
    a.holder.visible = true
    await tween(0.42, (t) => {
      a.pop = ease.outBack(t)
      a.hop = Math.sin(t * Math.PI) * 0.35
    })
    a.hop = 0
  }

  /** A matched sound card: the loudspeaker shrinks away and the animal that made the sound pops out. */
  async becomeAnimal() {
    const sp = this.speaker
    await tween(0.25, (t) => (sp.pop = 1 - ease.inCubic(t)))
    sp.group.visible = false
    this.tint()
    effects.sparkle(this.worldTop(), { count: 8, speed: 1.2, up: 1.4, size: 0.06 })
    await this.showAnimal()
  }

  /** Animal ducks back into the card, which flips face down. */
  close(fast = false) {
    this.closing = this.shut(fast)
    return this.closing
  }

  async shut(fast) {
    this.state = 'closing'
    const a = this.critter
    const sp = this.speaker
    const b = this.basket
    a.excited = false
    await tween(fast ? 0.12 : 0.22, (t) => {
      a.pop = 1 - ease.inCubic(t)
      if (sp) sp.pop = a.pop
      if (b) b.pop = a.pop
      if (this.tag) this.tagPop = a.pop
    })
    a.holder.visible = false
    if (sp) sp.group.visible = false
    if (b) b.group.visible = false
    if (this.tag) this.tag.visible = false
    sound.flip()
    await tween(fast ? 0.28 : 0.38, (u) => {
      this.pivot.rotation.z = Math.PI * (1 - ease.inOutCubic(u))
      this.lift = Math.sin(u * Math.PI) * 0.5
    })
    this.lift = 0
    this.state = 'down'
    this.land(false)
  }

  land(puff = true) {
    if (puff) effects.puff(this.group.position.clone().setY(MAT_TOP), { count: 7, radius: 0.45, size: 0.06 })
    tween(0.25, (t) => (this.pivot.scale.y = 1 - Math.sin(t * Math.PI) * 0.25))
  }

  /** A soft hint: the card rises a little and settles again, once. */
  hint() {
    this.hintUntil = game.time + 1.6
  }

  showRing() {
    this.ring.visible = true
    tween(0.5, (t) => this.ring.scale.setScalar(ease.outBack(t) + 0.001))
  }

  worldTop() {
    return this.group.position.clone().setY(REST_Y + FACE_TOP + 0.45)
  }

  update(dt, time) {
    const hoverTarget = this.state === 'down' ? this.hoverTarget : 0
    this.hover = THREE.MathUtils.damp(this.hover, hoverTarget, 14, dt)
    // A hint (see hint()) is one slow rise and settle: no glow, no flashing
    const nudge = this.state === 'down' && time < this.hintUntil ? Math.sin(((this.hintUntil - time) / 1.6) * Math.PI) * 0.16 : 0
    this.pivot.position.y = this.lift + this.hover * 0.08 + nudge
    if (this.critter.holder.visible) poseAnimal(this.critter, time)
    if (this.speaker?.group.visible) this.poseSpeaker(time)
    if (this.basket?.group.visible) this.basket.group.scale.setScalar(Math.max(0.001, this.basket.pop))
    if (this.tag?.visible) this.tag.scale.setScalar(Math.max(0.001, this.tagPop))
    if (this.ring.visible) this.ring.rotation.z += dt * 0.6
  }

  /** The loudspeaker sways a little; its waves glow outwards one after another while it plays. */
  poseSpeaker(time) {
    const sp = this.speaker
    const playing = time < this.waveUntil
    sp.group.scale.setScalar(Math.max(0.001, sp.pop))
    sp.group.rotation.y = this.critter.yaw + Math.sin(time * 1.3) * 0.08
    sp.group.position.y = FACE_TOP + Math.sin(time * 2) * 0.015
    sp.waves.forEach((wave, i) => {
      const k = playing ? (Math.sin(time * 7 - i * 1.1) + 1) / 2 : 0
      wave.material.emissiveIntensity = 0.15 + k * 0.9
      wave.scale.setScalar(1 + k * 0.12)
    })
  }
}

// --- Layout and camera ---------------------------------------------------------------------------

/** Picks the grid (columns x rows) that makes the cards biggest on this screen. */
function chooseGrid(n, region) {
  const aspect = region.w / Math.max(1, region.h)
  const elev = elevation()
  let best = null
  for (let cols = 2; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const w = cols * CARD_W + (cols - 1) * GAP_X + 0.4
    const h = (rows * CARD_D + (rows - 1) * GAP_Z) * Math.sin(elev) + ANIMAL_H * Math.cos(elev) + 0.4
    const empty = cols * rows - n
    // A lone card on its own last row looks left over (see rowSizes, which avoids it when it can)
    const lone = rows > 1 && rowSizes(n, cols, rows).at(-1) === 1 ? 0.8 : 1
    const score = Math.min(aspect / w, 1 / h) * (1 - empty * 0.04) * lone
    if (!best || score > best.score) best = { cols, rows, score }
  }
  return best
}

function elevation() {
  return THREE.MathUtils.degToRad(game.state === 'menu' ? 34 : innerWidth / innerHeight < 0.8 ? 54 : 47)
}

/**
 * Cards in each row. The gaps are shared out over the last rows (4+3+3, not 4+4+2; 3+3+2+2, not
 * 3+3+3+1), so no card is left alone on a row; when there are too many gaps the last row is short.
 */
function rowSizes(n, cols, rows) {
  const empty = cols * rows - n
  if (empty < rows) return Array.from({ length: rows }, (_, r) => (r >= rows - empty ? cols - 1 : cols))
  return Array.from({ length: rows }, (_, r) => (r === rows - 1 ? n - cols * (rows - 1) : cols))
}

function slots(n, cols, rows) {
  const out = []
  const pitchX = CARD_W + GAP_X
  const pitchZ = CARD_D + GAP_Z
  rowSizes(n, cols, rows).forEach((inRow, r) => {
    for (let c = 0; c < inRow; c++) out.push(new THREE.Vector3((c - (inRow - 1) / 2) * pitchX, REST_Y, (r - (rows - 1) / 2) * pitchZ))
  })
  return { list: out, hw: (cols * pitchX - GAP_X) / 2, hd: (rows * pitchZ - GAP_Z) / 2 }
}

/** The part of the screen (in pixels) the 3D board may use, between the HTML bits. */
function freeRegion() {
  const w = innerWidth
  const h = innerHeight
  let top = 8
  let bottom = h - 8
  if (game.state === 'menu') {
    top = document.querySelector('.menu-top').getBoundingClientRect().bottom + 4
    bottom = document.querySelector('.menu-bottom').getBoundingClientRect().top - 4
  } else {
    for (const el of document.querySelectorAll('.hud-left, .hud-center')) top = Math.max(top, el.getBoundingClientRect().bottom + 6)
    bottom = h - 10 - safeBottom()
  }
  // The win card sits below the board (or beside it on short landscape screens), so the
  // dancing animals stay in view instead of hiding behind it.
  let left = 8
  let right = w - 8
  const el = document.querySelector('.win-card')
  if (!$('win').classList.contains('hidden')) {
    // Layout box, not getBoundingClientRect: the card is still scaled small by its pop-in.
    if (el.offsetLeft > w * 0.4) right = el.offsetLeft - 10
    else bottom = el.offsetTop - 24
  }
  if (bottom - top < h * 0.3) {
    top = Math.min(top, h * 0.35)
    bottom = Math.max(bottom, h * 0.85)
  }
  return { top, bottom, left, right, w: right - left, h: bottom - top }
}

const safeProbe = document.createElement('div')
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)'
document.body.appendChild(safeProbe)
function safeBottom() {
  return parseFloat(getComputedStyle(safeProbe).paddingBottom) || 0
}

/**
 * Frames the box (x within hw, z from -back to hd, up to height) in the free region, looking at
 * the origin.
 */
function frame(hw, hd, height, back = hd) {
  const w = innerWidth
  const h = innerHeight
  const region = freeRegion()
  const elev = elevation()
  const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev))
  fitCam.aspect = w / h
  fitCam.fov = camera.fov
  fitCam.clearViewOffset()
  fitCam.updateProjectionMatrix()
  const pts = []
  for (const x of [-hw, hw]) for (const z of [-back, hd]) for (const y of [0, height]) pts.push(new THREE.Vector3(x, y, z))
  const allowW = (region.w / w) * 2
  const allowH = (region.h / h) * 2
  const p = new THREE.Vector3()
  const measure = (d) => {
    fitCam.position.copy(dir).multiplyScalar(d)
    fitCam.lookAt(0, 0, 0)
    fitCam.updateMatrixWorld()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const q of pts) {
      p.copy(q).project(fitCam)
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    return { minX, maxX, minY, maxY }
  }
  let lo = 2
  let hi = 80
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const b = measure(mid)
    if (b.maxX - b.minX > allowW || b.maxY - b.minY > allowH) lo = mid
    else hi = mid
  }
  const b = measure(hi)
  // Shift the view so the board sits in the middle of the free region.
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const tx = ((region.left + region.right) / 2 / w) * 2 - 1
  const ty = 1 - ((region.top + region.bottom) / 2 / h) * 2
  return {
    pos: fitCam.position.clone(),
    offset: new THREE.Vector2(((cx - tx) / 2) * w, (-(cy - ty) / 2) * h),
    dist: hi,
  }
}

function applyCamera(view, animate = true) {
  const from = { pos: game.cam.pos.clone(), offset: game.cam.offset.clone() }
  const set = (t) => {
    game.cam.pos.lerpVectors(from.pos, view.pos, t)
    game.cam.offset.lerpVectors(from.offset, view.offset, t)
  }
  scene.fog.near = view.dist * 1.4
  scene.fog.far = view.dist * 3.2
  tween(animate ? 0.9 : 0, (t) => set(ease.inOutCubic(t)), { tag: 'camera' })
  if (!animate) set(1)
}

function syncCamera() {
  const w = innerWidth
  const h = innerHeight
  camera.aspect = w / h
  camera.position.copy(game.cam.pos)
  camera.lookAt(0, 0, 0)
  camera.setViewOffset(w, h, game.cam.offset.x, game.cam.offset.y, w, h)
  camera.updateProjectionMatrix()
}

function relayout(animate = true) {
  if (game.state === 'menu') {
    const hw = (game.paradeAnimals.length * PARADE_GAP) / 2
    placeRoom(hw, 0.9)
    // Tall screens: the toys line up behind the parade, so frame them too. That keeps the
    // table filled from the title down to the Play button instead of leaving an empty band.
    const view = frame(hw, 0.6, 1.05, innerWidth / innerHeight < 0.8 ? 3.4 : 0.6)
    settleProps(view, hw + 0.45, 0.9 + 0.45)
    applyCamera(view, animate)
    return
  }
  if (!game.cards.length) return
  // Once the level is won the cards stay where the child found them; only the camera moves
  // (pulled back so the win card fits). Re-gridding would teleport the dancing animals.
  const grid = game.state === 'won' && game.layout?.grid ? game.layout.grid : chooseGrid(game.cards.length, freeRegion())
  const s = slots(game.cards.length, grid.cols, grid.rows)
  game.layout = { hw: s.hw, hd: s.hd, grid }
  placeRoom(s.hw, s.hd)
  game.cards.forEach((card, i) => {
    card.slot = s.list[i]
    if (game.state !== 'dealing') card.group.position.copy(card.slot)
    card.critter.yaw = Math.atan2(-card.slot.x, 9) * 0.8
  })
  const view = frame(s.hw + 0.1, s.hd + 0.1, ANIMAL_H)
  settleProps(view, s.hw + 0.45, s.hd + 0.45)
  applyCamera(view, animate)
}

// --- Screens and HUD -----------------------------------------------------------------------------

function show(screen) {
  $('loading').classList.toggle('hidden', screen !== 'loading')
  $('menu').classList.toggle('hidden', screen !== 'menu')
  $('hud').classList.toggle('hidden', screen !== 'play')
  $('win').classList.toggle('hidden', screen !== 'win')
}

/**
 * The level Play starts: the one suggested after the last win in this mode (one step on, two after
 * a careful board, the same size after a hard one), else the first one not yet done.
 */
function nextLevel() {
  const levels = levelsFor(progress.mode)
  const suggested = progress.next[progress.mode]
  if (Number.isInteger(suggested)) return Math.min(levels.length - 1, Math.max(0, suggested))
  const done = doneLevels()
  const i = levels.findIndex((_, k) => !done[k])
  return i < 0 ? levels.length - 1 : i
}

function renderLevels() {
  const next = nextLevel()
  const done = doneLevels()
  $('levels').innerHTML = levelsFor(progress.mode).map((cards, i) => {
    // A finished level gets a paw print: no grading by turns
    const row = done[i] ? '<span aria-label="Done">🐾</span>' : ''
    // Babies asleep in baskets (only their word is heard) from CRADLE_LEVEL on
    // and twins with look-alikes from LOOK_LEVEL on
    const key = goalKey(progress.mode, i)
    const cradle = key === 'cradle' ? '<span class="cradle" aria-label="sleeping babies">🧺</span>' : key === 'looks' ? '<span class="cradle" aria-label="look-alike twins">🎀</span>' : ''
    return `<button class="level ${i === next ? 'next' : ''}" data-level="${i}"><span class="num">${i + 1}</span><span class="cards"><i class="mini"></i>${cards}${cradle}</span><span class="lstars">${row}</span></button>`
  }).join('')
  for (const el of document.querySelectorAll('[data-level]')) {
    el.addEventListener('click', () => {
      sound.tap()
      startLevel(Number(el.dataset.level))
    })
  }
}

/** The pictured choice of what makes a pair: twins, animal and sound, or animal and baby. */
function renderModes() {
  for (const el of document.querySelectorAll('[data-mode]')) {
    const on = el.dataset.mode === progress.mode
    el.classList.toggle('on', on)
    el.setAttribute('aria-pressed', on)
  }
  $('menu-hint').textContent = MODES[progress.mode].hint
}

function chooseMode(mode) {
  if (!MODES[mode]) return
  progress.mode = mode
  save()
  renderModes()
  renderLevels()
  relayout(true) // the hint's length changed: the toys settle clear of it again
  talk.clear()
  // Just the button's word: the round says its one goal (a sleeping-baby or look-alike board has its
  // own), so no board starts with two goals in a row.
  talk.say(MODES[mode].word, { droppable: true })
}

/** Which goal a board has: the mode's, or the bigger boards' own (sleeping babies, look-alikes). */
function goalKey(mode, level) {
  if (mode === 'baby' && level >= CRADLE_LEVEL) return 'cradle'
  if (mode === 'twins' && level >= LOOK_LEVEL) return 'looks'
  return mode
}

/** The round's goal, said once after the menu: never again on Next or 🔁 unless the rule changes. */
function sayGoal() {
  const key = goalKey(game.mode, game.level)
  if (game.goalSaid === key) return
  game.goalSaid = key
  // Droppable: a child already turning cards over may cut it short with a clue (see talk.hurry)
  talk.say(LEVEL_GOALS[key] ?? MODES[key].goal, { droppable: true, goal: true })
}

function renderPairs() {
  const found = [...new Set(game.cards.filter((c) => c.state === 'matched').map((c) => c.set))]
  if (game.mode === 'groups') {
    // Homes: every group's sign is there from the start (faded) with how many animals it holds,
    // so the child knows what to look for; a found group lights up.
    // Each sign can be tapped to hear its word: pre-readers learn what 🌾 means.
    $('pairs').innerHTML = game.sets.map((id) => `<button class="group ${found.includes(id) ? 'done' : ''}" data-group="${id}" aria-label="${GROUPS[id].word}: ${game.setSize[id]}">${GROUPS[id].icon}<b>${game.setSize[id]}</b></button>`).join('')
  } else {
    const emoji = (set) => {
      const card = game.cards.find((c) => c.set === set)
      return `${ANIMALS[card.animal].emoji}${card.critter.look ? `<sup>${LOOKS[card.critter.look].icon}</sup>` : ''}`
    }
    $('pairs').innerHTML = game.sets.map((_, i) => (found[i] ? `<span class="done">${emoji(found[i])}</span>` : '<span></span>')).join('')
  }
  $('level-pill').textContent = `Level ${game.level + 1}`
}

let bannerTimer = 0
const _p = new THREE.Vector3()
/**
 * Big praise text. It goes just under the HUD, unless that would cover the animals it is
 * cheering for (the cards in avoid): then it moves to the bottom or the middle of the screen.
 */
function banner(text, ms = 900, avoid = []) {
  const el = $('banner')
  el.replaceChildren(Object.assign(document.createElement('span'), { textContent: text }))
  const textW = el.firstChild.offsetWidth // layout size, unaffected by the pop-in scale
  const h = el.offsetHeight
  const left = (innerWidth - textW) / 2 - 10
  const right = (innerWidth + textW) / 2 + 10
  // Screen boxes of the cards to keep clear, animal included.
  const boxes = avoid.map((card) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const dx of [-CARD_W / 2, CARD_W / 2]) for (const dz of [-CARD_D / 2, CARD_D / 2]) for (const y of [REST_Y, REST_Y + FACE_TOP + ANIMAL_H + 0.25]) {
      _p.set(card.group.position.x + dx, y, card.group.position.z + dz).project(camera)
      const sx = ((_p.x + 1) / 2) * innerWidth
      const sy = ((1 - _p.y) / 2) * innerHeight
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy)
    }
    return { x0, x1, y0, y1 }
  })
  const hudBottom = Math.max(0, ...[...document.querySelectorAll('.hud-left, .hud-center')].map((e) => e.getBoundingClientRect().bottom))
  const bottom = innerHeight - safeBottom() - h - 12
  const covered = (top) => boxes.reduce((sum, b) => sum + Math.max(0, Math.min(right, b.x1) - Math.max(left, b.x0)) * Math.max(0, Math.min(top + h, b.y1) - Math.max(top, b.y0)), 0)
  let best = hudBottom + 4
  for (let top = hudBottom + 4; top <= bottom; top += 8) {
    if (covered(top) < covered(best) - 1) best = top
    if (covered(best) === 0) break
  }
  if (covered(best) > 0 && covered(bottom) < covered(best)) best = bottom
  el.style.top = `${best}px`
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

function updateMute() {
  $('mute').textContent = progress.muted ? '🔇' : '🔊'
}

// --- Menu ---------------------------------------------------------------------------------------

function enterMenu() {
  resetScene()
  game.state = 'menu'
  game.goalSaid = null // back on the menu, the next round says its goal again
  show('menu')
  renderModes()
  renderLevels()
  const count = innerWidth / innerHeight < 0.8 ? 3 : 5
  game.paradeAnimals = shuffle([...NAMES]).slice(0, count).map((name, i) => {
    const a = makeAnimal(name)
    const x = (i - (count - 1) / 2) * PARADE_GAP
    a.holder.position.set(x, MAT_TOP, 0)
    a.baseY = MAT_TOP
    a.yaw = Math.atan2(-x, 8) * 0.7
    a.size = 0.95
    a.pop = 0
    parade.add(a.holder)
    tween(0.5, (t) => (a.pop = ease.outBack(t)), { delay: 0.25 + i * 0.12 })
    return a
  })
  relayout(true)
}

/** Empties the table: cards, menu animals, particles and every running tween. */
function resetScene() {
  game.round++ // anything still waiting for the old board checks this and gives up
  stopPeekSpeech()
  clearTweens() // also strands any pending waits from the old board, so they never resume
  effects.clear()
  parade.clear()
  game.paradeAnimals = []
  // Each loudspeaker's waves glow on their own, so their materials go with the board
  for (const card of game.cards) card.speaker?.waves.forEach((wave) => wave.material.dispose())
  board.clear()
  game.cards = []
  game.open = []
  game.mismatch = null
  game.busy = false
}

// --- Playing ------------------------------------------------------------------------------------

function startLevel(level) {
  resetScene()
  game.mode = progress.mode
  game.level = Math.min(level, levelsFor(game.mode).length - 1)
  game.matched = 0
  game.turns = 0
  game.slips = 0
  game.recalled = 0 // cards found again from memory: a seen card turned over as the match
  game.setSlips = {}
  game.named = new Set()
  game.clueTimes = []
  talk.newRound()
  game.peekUsed = false
  $('peek').disabled = false
  $('peek').setAttribute('aria-label', game.mode === 'groups' ? 'Peek at two animals that live together' : 'Peek at one matching pair')
  game.idle = 0
  game.state = 'dealing'
  show('play')
  // Each card: [animal, kind, set]. A pair is an animal and its twin, its sound card or its baby.
  let deck
  if (game.mode === 'groups') {
    const sizes = GROUP_LEVELS[game.level]
    // A 4 in the level is the wild group with all four animals; the other homes are picked at random.
    const order = Object.keys(GROUPS)
    const allWild = sizes.includes(4)
    const others = shuffle(order.filter((id) => !allWild || id !== 'wild')).slice(0, sizes.length - (allWild ? 1 : 0))
    const ids = (allWild ? ['wild', ...others] : others).sort((x, y) => order.indexOf(x) - order.indexOf(y))
    deck = ids.flatMap((id) => shuffle([...GROUPS[id].members]).slice(0, id === 'wild' && allWild ? 4 : 3).map((animal) => [animal, 'animal', id]))
    game.sets = ids
  } else {
    const pool = { twins: NAMES, sound: WITH_CALLS, baby: WITH_BABIES }[game.mode]
    const pairs = levelsFor(game.mode)[game.level] / 2
    // Look-alike twins: some animals come twice, one pair with a bow and one with a hat
    const doubles = game.mode === 'twins' && game.level >= LOOK_LEVEL ? game.level - LOOK_LEVEL + 1 : 0
    const picks = shuffle([...pool].filter((n) => !doubles || n !== 'fish')).slice(0, pairs - doubles)
    const sets = picks.flatMap((animal, i) => (i < doubles ? [[animal, 'bow'], [animal, 'hat']] : [[animal, null]]))
    const partner = { twins: 'animal', sound: 'sound', baby: game.level >= CRADLE_LEVEL ? 'cradle' : 'baby' }[game.mode]
    deck = sets.flatMap(([animal, look]) => {
      const set = look ? `${animal}-${look}` : animal
      return [[animal, 'animal', set, look], [animal, partner, set, look]]
    })
    game.sets = sets.map(([animal, look]) => (look ? `${animal}-${look}` : animal))
  }
  game.setSize = {}
  for (const [animal, , set = animal] of deck) game.setSize[set] = (game.setSize[set] ?? 0) + 1
  game.cards = shuffle(deck).map(([animal, kind, set, look]) => new Card(animal, kind, set, look))
  for (const card of game.cards) board.add(card.group)
  renderPairs()
  relayout(true)
  // Deal: cards fly in from a stack near the bottom with a spin, one after another.
  const from = new THREE.Vector3(0, 2.2, game.layout.hd + 2.5)
  game.cards.forEach((card, i) => {
    card.group.position.copy(from)
    card.group.scale.setScalar(0.001)
    tween(0.5, (t) => {
      const e = ease.outCubic(t)
      card.group.position.lerpVectors(from, card.slot, e)
      card.group.position.y += Math.sin(t * Math.PI) * 1.2
      card.group.rotation.y = (1 - e) * Math.PI * 1.5
      card.group.scale.setScalar(Math.min(1, 0.3 + t * 1.4))
      if (t >= 1) {
        card.group.position.copy(card.slot)
        card.group.rotation.y = 0
        card.land()
        sound.tick()
      }
    }, { delay: 0.35 + i * 0.06 })
  })
  wait(0.35 + game.cards.length * 0.06 + 0.5).then(() => {
    game.state = 'play'
    banner(MODES[game.mode].banner, 1400)
    sayGoal() // pre-readers hear the goal once: when the mode is chosen, or the first round after the menu
  })
}

/**
 * A turn is a pair, or in Homes a whole group: cards keep turning up while they belong with the
 * first one. A card that does not belong ends the turn, and they all turn back.
 */
async function tapCard(card) {
  if (game.state !== 'play') return
  if (card.state === 'matched' || card.state === 'open') {
    // Matched animals love attention; an open clue card says its clue again (a sleeping baby only
    // its word: its call, or a hop under the blanket, would give it away).
    if (card.state === 'open' && card.kind === 'sound') card.playCall(true)
    else if (card.state === 'open' && card.kind === 'cradle') card.sayClue(true)
    else {
      hopOnce(card.critter)
      callAndName(card.critter)
    }
    return
  }
  if (card.state === 'closing') {
    // Still flipping back after a miss: little fingers are quick, so flip it again once it lands.
    if (card.wanted) return
    card.wanted = true
    await card.closing
    card.wanted = false
    return tapCard(card)
  }
  if (card.state !== 'down' || game.busy) return
  talk.cutGoal() // a child already turning cards has heard enough of the goal; the card's words come next
  if (game.mismatch) closeMismatch(true)
  const first = game.open[0] ?? card
  // Did the child already see where a partner of the first card was? Then a miss is a slip.
  const knew = card !== first && game.cards.some((c) => c !== card && c !== first && c.state === 'down' && c.seen && belongs(c, first))
  const wasSeen = card.seen
  game.open.push(card)
  const revealing = card.flipUp()
  const fits = card === first || belongs(card, first)
  if (fits && card !== first && wasSeen) game.recalled++
  // Right outside the game too (a penguin is wild): said kindly, and never counted as a slip
  const kindMiss = !fits && game.mode === 'groups' && overlap(first, card)
  if (card === first && (game.setSlips[first.set] ?? 0) >= 2) {
    // This one has been missed twice although its partner was seen: that partner rises a little.
    for (const c of game.cards) if (c !== card && c.state === 'down' && c.seen && belongs(c, card)) c.hint()
  }
  if (fits && game.open.length < game.setSize[first.set]) {
    await revealing
    if (card.state === 'open') card.critter.excited = true
    return
  }
  const opened = [...game.open]
  game.busy = true
  game.turns++
  if (!fits && knew && !kindMiss) {
    game.slips++
    game.setSlips[first.set] = (game.setSlips[first.set] ?? 0) + 1
  }
  await Promise.all(opened.map((c) => c.revealed))
  game.busy = false
  game.open = []
  for (const c of opened) c.critter.excited = false
  if (fits) onMatch(opened)
  else onMismatch(opened, kindMiss)
}

/** Homes: does the odd card (or the first) also really fit the other's home? Returns who and how. */
function overlap(first, odd) {
  if (ALSO[odd.animal]?.home === first.set) return { animal: odd.animal, ...ALSO[odd.animal] }
  if (ALSO[first.animal]?.home === odd.set) return { animal: first.animal, ...ALSO[first.animal] }
  return null
}

/**
 * Does card go with first? The same set (a pair, or in Homes a group), except a sleeping baby: it
 * goes with any parent whose baby has its word (a cub is a lion's or a panda's), never with a baby.
 */
function belongs(card, first) {
  if (card.kind === 'cradle' || first.kind === 'cradle') return card.kind !== first.kind && WORDS[card.animal].baby === WORDS[first.animal].baby
  return card.set === first.set
}

/**
 * A sleeping baby matched with a parent that shares its word but not its animal (a "calf" card
 * given to the elephant, though it was dealt as the cow's): it swaps with the elephant's own
 * sleeping calf, which nobody has seen, so the baby that wakes up is the elephant's.
 */
function settleCradle(cards) {
  const cradle = cards.find((c) => c.kind === 'cradle')
  const parent = cards.find((c) => c !== cradle)
  if (!cradle || cradle.set === parent.set) return
  const other = game.cards.find((c) => c.kind === 'cradle' && c.set === parent.set)
  for (const key of ['animal', 'set', 'critter']) [cradle[key], other[key]] = [other[key], cradle[key]]
  for (const c of [cradle, other]) {
    c.group.add(c.critter.holder)
    c.critter.yaw = Math.atan2(-c.slot.x, 9) * 0.8
  }
}

function onMatch(cards) {
  settleCradle(cards)
  const [a] = cards
  for (const card of cards) card.state = 'matched'
  game.matched++
  sound.match()
  // Name what was learned: "Two cows!", "The cow moos!", "A cow's baby is a calf!",
  // "Cow, pig and chick live on the farm!" Older names still waiting go stale (see callAndName).
  talk.say(game.mode === 'groups' ? MATCH_WORDS.groups(a.set, cards.map((c) => c.animal)) : MATCH_WORDS[game.mode](a.animal, a.critter.look))
  learn(cards)
  for (const card of cards) {
    if (card.kind === 'sound') card.becomeAnimal().then(() => dance(card.critter, { dur: 1.0, hops: 2, height: 0.35 }))
    else if (card.kind === 'cradle') card.wake().then(() => dance(card.critter, { dur: 1.0, hops: 2, height: 0.3 }))
    else dance(card.critter, { delay: 0.05 })
    card.showRing()
    effects.sparkle(card.worldTop(), { count: 8, speed: 1.2, up: 1.2 })
  }
  // The pair joins the row of found animals at the top (no praise banner).
  renderPairs()
  if (game.matched === game.sets.length) {
    // The party waits until the last pair has been named (that line teaches the last set; the
    // long cap is only for a voice that never says it has finished).
    const round = game.round
    Promise.all([wait(1.1), Promise.race([talk.idle(), wait(20)])]).then(() => round === game.round && winLevel())
  }
}

/** The animal book remembers what each match taught: met, its call, its baby, its home. */
function learn(cards) {
  const fact = { sound: 'call', baby: 'baby', groups: 'home' }[game.mode]
  for (const { animal } of cards) {
    const page = (progress.book[animal] ??= {})
    page.met = 1
    if (fact) page[fact] = 1
  }
  save()
}

function onMismatch(cards, kind = null) {
  sound.miss()
  for (const card of cards) {
    const c = card.critter
    // A kind miss (the child was right, the game sorts it elsewhere) nods instead of shaking its head
    tween(0.7, (t) => {
      if (kind) c.nod = Math.sin(t * Math.PI * 2) * 0.2 * (1 - t)
      else c.shake = Math.sin(t * Math.PI * 4) * 0.45 * (1 - t)
      c.tilt = Math.sin(t * Math.PI) * 0.15
      if (t >= 1) c.shake = c.tilt = c.nod = 0
    })
  }
  if (game.mode === 'groups') {
    if (kind) {
      // "A penguin is wild too! In this game, it goes with the water animals."
      talk.sayOnce(`${an(kind.animal)} ${kind.animal} ${kind.line}! In this game, it goes with the ${GROUPS[GROUP_OF[kind.animal]].word}.`)
    } else {
      // The one that did not belong says where it lives, once a round: "A dog is a pet."
      const odd = cards.at(-1).animal
      talk.sayOnce(`${an(odd)} ${odd} ${LIVES[odd] ?? GROUPS[GROUP_OF[odd]].is}.`)
    }
  } else if (game.mode === 'twins' && cards[0].animal === cards[1].animal) {
    // Look-alikes: the same animal, but not the same twin
    talk.sayOnce(`Look closely! One ${cards[0].animal} has ${LOOKS.bow.a}, and one has ${LOOKS.hat.a}.`)
  } else {
    // A sleeping baby that was missed says whose baby it is, once a round: "A cub is a lion's or a
    // panda's baby." Only the parents on this board are named.
    const cradle = cards.find((c) => c.kind === 'cradle')
    if (cradle) {
      const word = WORDS[cradle.animal].baby
      const parents = [...new Set(game.cards.filter((c) => c.kind === 'animal' && WORDS[c.animal].baby === word).map((c) => c.animal))]
      // Not droppable: the one corrective fact on this board is heard whole; the next clue waits
      talk.sayOnce(`${an(word)} ${word} is ${orWords.format(parents.map((p) => `${an(p).toLowerCase()} ${p}’s`))} baby.`)
    }
  }
  game.mismatch = { cards }
  // The cards stay open until their names (or sounds) have been heard, then turn back over.
  // Big boards need less time to look: the names were already said the first time.
  const round = game.round
  const look = game.cards.length >= 12 ? 0.8 : 1.25
  Promise.all([wait(look), Promise.race([talk.idle(), wait(4)])]).then(() => {
    if (round === game.round && game.mismatch?.cards === cards) closeMismatch(false)
  })
}

function closeMismatch(fast) {
  const { cards } = game.mismatch
  game.mismatch = null
  for (const card of cards) {
    card.critter.shake = card.critter.tilt = 0
    card.close(fast)
  }
}

/**
 * The board that comes next adapts to how this one went, without locking anything (every level
 * stays on the menu): a careful board (hardly a slip) steps up two sizes, a hard one (many slips)
 * stays the same size with new animals, anything else steps up one.
 */
function adaptNext() {
  const last = levelsFor(game.mode).length - 1
  // Careful means remembering, not luck: few slips, and some cards found again from memory (a
  // small board matched first time by chance has no memory in it, so it only steps up one).
  const careful = game.slips <= Math.max(1, Math.floor(game.sets.length / 4)) && game.recalled >= Math.max(1, Math.ceil(game.sets.length / 3))
  const hard = game.slips >= Math.ceil(game.sets.length / 2) + 1
  const step = hard ? 0 : careful && game.level >= 1 ? 2 : 1
  const next = Math.min(last, game.level + step)
  progress.next[game.mode] = next
  return { next, step: next - game.level, hard }
}

function winLevel() {
  game.state = 'won'
  const sets = game.sets.length
  // A finished level is remembered as done (1). Saves from before the calm pass may hold 2 or 3.
  const done = doneLevels()
  done[game.level] = Math.max(done[game.level] ?? 0, 1)
  const { next, step, hard } = adaptNext()
  save()

  // One soft moment: a gentle chord, a few slow pieces drifting down, then each
  // animal waves and says hello in turn, one voice at a time (WIN_CALL_GAP apart).
  sound.fanfare()
  const { hw, hd } = game.layout
  effects.rain(new THREE.Vector3(0, 0, 0), hw + 0.6, hd + 0.6, 24)
  const byPlace = [...game.cards].sort((a, b) => a.slot.z - b.slot.z || a.slot.x - b.slot.x)
  // Homes: group by group, so the farm animals call together, then the pets…
  if (game.mode === 'groups') byPlace.sort((a, b) => game.sets.indexOf(a.set) - game.sets.indexOf(b.set))
  const found = []
  for (const card of byPlace) if (!found.includes(card.animal)) found.push(card.animal)
  talk.trim() // only what is droppable: a match line still waiting is heard
  const round = game.round
  found.forEach((animal, i) => {
    const delay = 0.6 + i * WIN_CALL_GAP
    for (const card of game.cards) if (card.animal === animal) dance(card.critter, { delay, dur: 1.0, hops: 2, height: 0.35 })
    // Waited on the game clock (not booked ahead on the AudioContext), so leaving strands it
    wait(delay).then(() => round === game.round && sound.voice(animal))
  })
  // After the last hello, name what was found: the animals on a small board, just the line on a
  // big one (every name was already said while playing).
  const names = (list) => (list.length <= 4 ? `${cap(listWords.format(list))}. ` : '')
  const recap = {
    twins: () => `${names(found)}You found all the twins!`,
    sound: () => `${names(found)}You know all their sounds!`,
    baby: () => `${names(found.map((name) => WORDS[name].baby))}You found every baby!`,
    groups: () => `${cap(listWords.format(game.sets.map((id) => GROUPS[id].word)))}. You know who lives together!`,
  }[game.mode]()
  wait(0.6 + found.length * WIN_CALL_GAP + 0.5).then(() => talk.say(recap))

  wait(1.6).then(() => {
    const last = game.level === levelsFor(game.mode).length - 1
    $('win-title').textContent = 'You found them all!'
    $('win-text').textContent = {
      twins: `${sets} pairs of animal twins`,
      sound: `${sets} animals and their sounds`,
      baby: `${sets} animals and their babies`,
      groups: `${sets} groups that live together`,
    }[game.mode]
    // What comes next, and why: a quiet line, never a grade.
    $('win-next').textContent = last
      ? ''
      : step >= 2
        ? 'You remembered where they were! Next is a bigger board.'
        : hard
          ? 'Next: the same size, with new animals.'
          : ''
    $('next').classList.toggle('hidden', last)
    $('next').dataset.level = next
    // Show what the child found, in the order they say hello. Each can be tapped to hear it again.
    const entries = game.mode === 'groups'
      ? game.sets.map((id) => ({ animals: found.filter((n) => GROUP_OF[n] === id), html: `<i>${GROUPS[id].icon}</i>${found.filter((n) => GROUP_OF[n] === id).map((n) => ANIMALS[n].emoji).join('')}`, label: GROUPS[id].word, line: () => MATCH_WORDS.groups(id, found.filter((n) => GROUP_OF[n] === id)) }))
      : [...new Set(byPlace.map((c) => c.set))].map((set) => {
          const { animal, critter: { look } } = game.cards.find((c) => c.set === set)
          return {
            animals: [animal],
            look,
            html: game.mode === 'baby' ? `${ANIMALS[animal].emoji}<small>${ANIMALS[animal].emoji}</small>` : `${ANIMALS[animal].emoji}${look ? `<sup>${LOOKS[look].icon}</sup>` : ''}`,
            label: game.mode === 'baby' ? `${animal} and ${WORDS[animal].baby}` : look ? `${animal} with ${LOOKS[look].a}` : animal,
            line: () => (game.mode === 'baby' ? MATCH_WORDS.baby(animal) : `${cap(animal)}${look ? ` with ${LOOKS[look].a}` : ''}!`),
          }
        })
    $('win-stars').classList.toggle('grouped', game.mode === 'groups')
    $('win-stars').replaceChildren(...entries.map((entry) => {
      const el = document.createElement('button')
      el.className = 'found'
      el.innerHTML = entry.html
      el.setAttribute('aria-label', entry.label)
      // Fades in as its first animal says hello
      el.style.animationDelay = `${(0.6 + found.indexOf(entry.animals[0]) * WIN_CALL_GAP - 1.6).toFixed(2)}s`
      el.addEventListener('click', () => {
        for (const card of game.cards) if (entry.animals.includes(card.animal) && (card.critter.look ?? null) === (entry.look ?? null)) hopOnce(card.critter, 0.35)
        if (entry.animals.length === 1) talk.call(entry.animals[0], { droppable: true })
        talk.say(entry.line(), { droppable: true })
      })
      return el
    }))
    $('win-stars').setAttribute('aria-label', entries.map((e) => e.label).join(', '))
    show('win')
    relayout(true) // the camera pulls back so the animals stay in view above the card
  })
}

// --- Input ------------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function pick(e, objects) {
  return pickAll(e, objects)[0]
}

function pickAll(e, objects) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObjects(objects, true)
}

const cardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -REST_Y)
const _onPlane = new THREE.Vector3()
/**
 * The card under a tap. A face-down card wins over an animal standing in front of it (a bunny's
 * ears would otherwise steal the tap), and a tap just outside a card, in the gap, still counts.
 */
function pickCard(e) {
  let first = null
  for (const hit of pickAll(e, board.children)) {
    const card = tagged(hit.object, 'card')
    if (!card) continue
    first ??= card
    if (card.state === 'down' && !tagged(hit.object, 'animal')) return card
  }
  if (first) return first
  if (!raycaster.ray.intersectPlane(cardPlane, _onPlane)) return null
  let best = null
  let bestD = Infinity
  for (const card of game.cards) {
    const dx = Math.abs(_onPlane.x - card.group.position.x) - CARD_W / 2
    const dz = Math.abs(_onPlane.z - card.group.position.z) - CARD_D / 2
    const d = Math.max(dx, dz)
    if (d < 0.2 && d < bestD) [best, bestD] = [card, d]
  }
  return best
}

/** Toys around the mat react when tapped, each in its own way. */
function tapToy(e) {
  const hit = pick(e, room.props.filter((p) => p.visible))
  const toy = hit && tagged(hit.object, 'toy')
  if (!toy || toy.busy) return !!toy
  toy.busy = true
  const { prop, name } = toy
  const top = prop.position.clone().setY(toy.size.y + 0.15)
  sound.toy(name)
  effects.sparkle(top, { count: 12, speed: 1.6, up: 1.8, size: 0.07 })
  const done = () => {
    prop.position.y = 0
    prop.rotation.x = prop.rotation.z = 0
    prop.scale.setScalar(1)
    toy.busy = false
  }
  const yaw = prop.rotation.y
  const anims = {
    // Bounces high, three times, a little lower each time.
    prop_ball: [1.3, (t) => {
      const k = Math.min(2, Math.floor(t * 3))
      const ph = t * 3 - k
      prop.position.y = Math.sin(ph * Math.PI) * 0.9 * 0.5 ** k
      prop.rotation.y = yaw + t * Math.PI * 3
      const squash = ph < 0.1 ? (0.1 - ph) * 2.5 : 0
      prop.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
    }],
    // A happy hop with a full twirl.
    prop_bear: [0.9, (t) => {
      prop.position.y = Math.sin(t * Math.PI) * 0.45
      prop.rotation.y = yaw + ease.inOutCubic(t) * Math.PI * 2
      prop.rotation.z = Math.sin(t * Math.PI * 4) * 0.15 * (1 - t)
    }],
    // Wobbles like a jelly on its base.
    prop_rings: [1.0, (t) => {
      prop.rotation.z = Math.sin(t * Math.PI * 6) * 0.22 * (1 - t)
      prop.rotation.x = Math.sin(t * Math.PI * 6 + 1.3) * 0.12 * (1 - t)
      const s = 1 + Math.sin(t * Math.PI * 4) * 0.08 * (1 - t)
      prop.scale.set(1 / s, s, 1 / s)
    }],
    // Jump up and clack back down.
    prop_blocks: [0.7, (t) => {
      prop.position.y = Math.sin(t * Math.PI) * 0.4
      prop.rotation.z = Math.sin(t * Math.PI * 2) * 0.12
      prop.rotation.y = yaw + Math.sin(t * Math.PI) * 0.3
    }],
    // A jiggle, like someone is about to draw.
    prop_crayons: [0.8, (t) => {
      prop.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.12 * (1 - t)
      prop.rotation.y = yaw + Math.sin(t * Math.PI * 4) * 0.25 * (1 - t)
    }],
  }
  const [dur, step] = anims[name]
  tween(dur, (t) => {
    step(t)
    if (t >= 1) {
      done()
      prop.rotation.y = yaw
    }
  })
  return true
}

addEventListener('pointerdown', () => sound.unlock(), { capture: true })
canvas.addEventListener('pointerdown', (e) => {
  game.idle = 0
  if (game.state === 'menu') {
    const hit = pick(e, parade.children)
    const a = hit && tagged(hit.object, 'animal')
    if (a) {
      if (!a.busy) {
        dance(a, { dur: 0.9, hops: 2, height: 0.4 })
        callAndName(a)
        effects.sparkle(a.holder.position.clone().setY(1.0), { count: 14 })
      }
      return
    }
    tapToy(e)
    return
  }
  if (game.state === 'loading') return
  if (game.state === 'won') {
    // The party goes on under the win card: tapped animals hop and say hello.
    const card = pickCard(e)
    if (card) {
      hopOnce(card.critter, 0.35)
      callAndName(card.critter)
    } else tapToy(e)
    return
  }
  const card = game.state === 'play' && pickCard(e)
  if (card) tapCard(card)
  else tapToy(e)
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return
  let hovered = null
  if (game.state === 'play') hovered = pickCard(e)
  if (!hovered && game.state !== 'loading') hovered = pick(e, [...parade.children, ...room.props.filter((p) => p.visible)]) ? true : null
  for (const card of game.cards) card.hoverTarget = card === hovered && card.state === 'down' ? 1 : 0
  canvas.style.cursor = hovered ? 'pointer' : ''
})

/** Walks up from a picked mesh to the first parent tagged with userData[key] ('card' or 'animal'). */
function tagged(obj, key) {
  for (let o = obj; o; o = o.parent) if (o.userData[key]) return o.userData[key]
  return null
}

$('play').addEventListener('click', () => {
  sound.tap()
  startLevel(nextLevel())
})
$('home').addEventListener('click', () => {
  sound.tap()
  enterMenu()
})
$('win-home').addEventListener('click', () => {
  sound.tap()
  enterMenu()
})
$('again').addEventListener('click', () => {
  sound.tap()
  startLevel(game.level)
})
$('next').addEventListener('click', () => {
  sound.tap()
  // The board winLevel chose from how this one went (see adaptNext)
  startLevel(Number($('next').dataset.level ?? game.level + 1))
})
// Homes: a tapped sign says its word ("Water animals: 3"), or once found, who lives there.
$('pairs').addEventListener('click', (e) => {
  const id = e.target.closest('[data-group]')?.dataset.group
  if (!id || (game.state !== 'play' && game.state !== 'dealing')) return
  const home = game.cards.filter((c) => c.set === id && c.state === 'matched').map((c) => c.animal)
  const line = home.length ? MATCH_WORDS.groups(id, home) : `${cap(GROUPS[id].word)}: ${game.setSize[id]}`
  if (!talk.has(line)) talk.say(line, { droppable: true })
})
// --- The animal book -------------------------------------------------------------------------------

/** What the book says about an animal: only what the child has found out. */
function pageWords(name) {
  const page = progress.book[name] ?? {}
  const w = WORDS[name]
  return [
    `${cap(name)}!`,
    page.call && w.call ? `It says ${w.call}` : '',
    page.baby && w.baby ? `Its baby is ${an(w.baby).toLowerCase()} ${w.baby}.` : '',
    page.home ? `It ${LIVES[name] ?? GROUPS[GROUP_OF[name]].is}.` : '',
  ].filter(Boolean).join(' ')
}

/**
 * A page for every animal. A page fills in as the child finds the animal (any mode), its call
 * (Sounds), its baby (Babies) and its home (Homes); the dashed spaces show what is still to find.
 */
function openBook() {
  $('book-grid').replaceChildren(...NAMES.map((name) => {
    const page = progress.book[name] ?? {}
    const w = WORDS[name]
    const fact = (known, icon, text) => (known ? `<span>${icon} ${text}</span>` : `<span class="todo">${icon} ?</span>`)
    const el = document.createElement('button')
    el.className = `page ${page.met ? '' : 'unmet'}`
    el.innerHTML = `<span class="face">${ANIMALS[name].emoji}</span><span class="name">${page.met ? cap(name) : '?'}</span><span class="facts">${[
      w.call ? fact(page.call, '🔊', w.call.replace(/!$/, '')) : '',
      w.baby ? fact(page.baby, '🍼', w.baby) : '',
      fact(page.home, GROUPS[GROUP_OF[name]].icon, { farm: 'farm', pets: 'home', wild: 'wild', water: 'water' }[GROUP_OF[name]]),
    ].join('')}</span>`
    el.setAttribute('aria-label', page.met ? pageWords(name) : 'Not found yet')
    el.addEventListener('click', () => {
      sound.tap()
      if (!page.met) return
      talk.clear()
      talk.call(name, { droppable: true })
      talk.say(pageWords(name), { droppable: true })
    })
    return el
  }))
  $('book-page').classList.remove('hidden')
}

function closeBook() {
  talk.clear()
  $('book-page').classList.add('hidden')
}

$('book').addEventListener('click', () => {
  sound.tap()
  openBook()
})
$('book-close').addEventListener('click', () => {
  sound.tap()
  closeBook()
})

for (const el of document.querySelectorAll('[data-mode]')) {
  el.addEventListener('click', () => {
    sound.tap()
    chooseMode(el.dataset.mode)
  })
}
$('mute').addEventListener('click', () => {
  progress.muted = !progress.muted
  sound.setMuted(progress.muted)
  voice.setMuted(progress.muted)
  if (progress.muted) stopPeekSpeech()
  updateMute()
  save()
})
addEventListener('keydown', (e) => {
  if (!$('book-page').classList.contains('hidden')) {
    if (e.key === 'Escape') closeBook()
    return
  }
  if (e.key === 'Enter' && game.state === 'menu') startLevel(nextLevel())
  else if (e.key === 'Escape' && game.state !== 'menu' && game.state !== 'loading') enterMenu()
})
// Block pinch zoom and double-tap zoom on iOS.
for (const type of ['gesturestart', 'dblclick']) document.addEventListener(type, (e) => e.preventDefault())

let resizeTimer = 0
function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => game.state !== 'loading' && relayout(false), 60)
}
addEventListener('resize', resize)

// --- Main loop ----------------------------------------------------------------------------------

const timer = new THREE.Timer()
function frameLoop() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  game.time += dt
  updateTweens(dt)
  for (const card of game.cards) card.update(dt, game.time)
  for (const a of game.paradeAnimals) {
    poseAnimal(a, game.time)
    if (!a.busy && Math.random() < dt * 0.08) hopOnce(a, 0.2)
  }
  if (game.state === 'play' || game.state === 'won') {
    // Matched animals hop now and then, quietly.
    const rate = game.state === 'won' ? 0.08 : 0.04
    for (const card of game.cards) {
      if (card.state === 'matched' && !card.critter.busy && Math.random() < dt * rate) hopOnce(card.critter, 0.2)
    }
  }
  // No idle nudges: a child who is thinking is left to think (calm pass 2026-10-09).
  effects.update(dt, camera)
  syncCamera()
  renderer.render(scene, camera)
}

async function main() {
  updateMute()
  resize()
  try {
    await loadAssets()
  } catch (err) {
    console.error(err)
    $('loading-text').textContent = 'Oops, the animals are hiding. Please reload!'
    return
  }
  buildRoom()
  syncCamera()
  renderer.setAnimationLoop(frameLoop)
  // Start high above the table and swoop down to the menu.
  game.cam.pos.set(0, 16, 10)
  enterMenu()
}

main()

function stopPeekSpeech() {
  talk.clear()
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPeekSpeech()
})
addEventListener('pagehide', stopPeekSpeech)

// One demonstration per round supports memory without solving the whole board.
$('peek').onclick = async () => {
  if (game.state !== 'play' || game.busy || game.open.length || game.peekUsed) return
  // A pair (or in Homes a group) whose cards are all face down
  const first = game.cards.find((card) => card.state === 'down' && game.cards.every((c) => c.set !== card.set || c.state === 'down'))
  if (!first) return
  // Two cards: the whole pair, or two of a group (the rest of the group is still to find)
  const shown = game.cards.filter((c) => c.set === first.set).slice(0, 2)
  game.peekUsed = true
  $('peek').disabled = true
  $('peek').setAttribute('aria-label', 'Peek used for this round')
  game.busy = true
  const round = game.round
  talk.clear()
  const revealing = Promise.all(shown.map((card) => card.flipUp()))
  talk.say(game.mode === 'groups' ? 'These two live together. Remember where they are.' : 'These two match. Remember where they are.')
  await revealing
  banner(game.mode === 'twins' ? 'Look! Twins!' : game.mode === 'groups' ? `Look! ${cap(GROUPS[first.set].word)}!` : 'Look! A pair!', 2200, shown)
  await Promise.all([wait(2.4), Promise.race([talk.idle(), wait(6)])])
  if (game.state !== 'play' || round !== game.round) return
  await Promise.all(shown.map((card) => card.close()))
  game.busy = false
}
if (new URLSearchParams(location.search).has('debug')) window.__memory = { game, camera, talk, chooseMode, belongs }
