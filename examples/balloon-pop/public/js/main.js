import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Balloons, COLORS, KINDS, PALETTE } from './balloons.js'
import { Effects } from './effects.js'
import { SKY_COLOURS, colourName, dotLayout, makeRequest, scatterLayout } from './sky.js'
import { createVoice } from './speech.js'
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
// One voice for the game: counts queue after each other instead of cutting each other off.
const voice = createVoice({ muted: audio.muted, rate: 0.82, pitch: 1 })
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
  // The tier (1 numbered slots, 2 plain slots, 3 ten-frames) and how far tier 3's counts have climbed; remembered.
  tier: 1,
  climb: 0,
  streak: 0, // clean baskets in a row
  rough: 0, // bumpy baskets in a row
}

// Optional learning missions.

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

/** A row of mission pictures; the first `filled` are bright, the rest wait. */
function pictureRow(types, filled = types.length) {
  const row = document.createElement('span')
  row.className = 'mission-choice-pictures'
  types.forEach((type, i) => row.append(picture(type, i < filled)))
  return row
}

/** An option's balloons, listed once: drawn on its button and in its progress slots. */
const balloonRow = (balloons, filled) => ({ balloons, pictures: pictureRow(balloons, filled) })

function renderMissionProgress(goal, option, count) {
  if (!option.goal) return
  goal.textContent = ''
  const caption = document.createElement('span')
  caption.className = 'mission-caption'
  caption.textContent = `${option.goal} · ${count} / ${option.target}`
  const slots = document.createElement('span')
  slots.className = 'mission-slots'
  option.balloons.forEach((type, i) => slots.append(picture(type, i < count)))
  goal.append(caption, slots)
}

let rewardTimer
function celebrateMission(text) {
  const reward = $('mission-reward')
  reward.replaceChildren()
  const pictures = document.createElement('span')
  pictures.className = 'mission-reward-pictures'
  adventure.option.balloons.forEach((type) => pictures.append(picture(type)))
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

/** The goal last said when the child chose it on the menu, so tapping Play does not say it again. */
let choiceSaid = null
const adventure = createAdventure({
  id: 'balloon-pop',
  anchor: $('play'),
  hud: $('hud'),
  voice,
  announce: (text, kind) => {
    if (kind === 'choice') choiceSaid = text
    voice.say(text, { interrupt: kind === 'choice' })
  },
  celebrate: celebrateMission,
  renderProgress: renderMissionProgress,
  options: [
    // The calm default: every level is one spoken, pictured counting request (js/sky.js).
    // Its picture is a row of slots, two filled and one waiting.
    // A visit is eight friends; the picnic fills, everyone waves and the visit ends.
    { label: 'Counting sky', sky: true, visit: 8, ...balloonRow(['blue', 'blue', 'blue'], 2) },
    { label: 'Count three balloons', caption: 'Count', ...balloonRow(['🎈', '🎈', '🎈']), pace: 0.6, goal: 'Pop three balloons', target: 3, reward: 'Three! You counted three balloons!' },
    // Two shorter, focused skies: every friend wants hearts, or red balloons among pink, orange and purple ones.
    // They use the same basket, Give and tiers, so every choice on the menu carries the stopping decision.
    { label: 'Hearts for friends', caption: 'Hearts', sky: true, focus: 'heart', visit: 5, ...balloonRow(['💖', '💖', '💖'], 2) },
    { label: 'Red for friends', caption: 'Red', sky: true, focus: 'red', visit: 5, ...balloonRow(['red', 'red', 'red'], 2) },
    // For the youngest: the Phase 1 sky where every balloon pops and fills the level bar.
    { label: 'Free popping', ...balloonRow(['🎈']) },
  ],
})


// --- Counting sky -------------------------------------------------------------------
// One calm request per level, for one friend. Matching pops go into the friend's basket and the
// child decides when it is right and hands it over: stopping at the number is the skill.
//
// Three tiers, moved one step at a time by how the child is doing (never a gate):
//   1. numbered slots, a glowing Give when the basket is full, counts spoken to five, the finger;
//   2. plain slots with no numbers and no glow: the child notices the slots are full;
//   3. ten-frames with no stopping line, one more / one less, numeral dots, counts climbing to the teens.

const counting = () => game.state === 'play' && !!adventure.option.sky
/** The most a basket holds past the number asked for; more matching pops just pop for fun. */
const SPARE = 3
/** After a hand-over that is not right yet, Give rests a while (longer after each one): repeat taps get a click and a tilt, no words. */
const giveRest = (slips) => Math.min(5000, 1500 + slips * 1000)
const TIER_KEY = 'balloon-pop-tier'

/** The tier (and how far tier 3 has climbed) is remembered, so a returning older child starts where they were. */
function loadTier() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIER_KEY))
    if ([1, 2, 3].includes(saved?.tier)) return { tier: saved.tier, climb: Math.max(0, Math.min(7, saved.climb | 0)) }
  } catch {}
  return { tier: 1, climb: 0 }
}
function saveTier() {
  try {
    localStorage.setItem(TIER_KEY, JSON.stringify({ tier: game.tier, climb: game.climb }))
  } catch {}
}

function newRequest() {
  game.recent = [...(game.recent ?? []), game.sky?.req].filter(Boolean).slice(-3)
  const req = makeRequest(game.level, game.recent, Math.random, game.tier, game.climb, adventure.option.focus)
  // Dots belong to the dots request only: afterwards those balloons are plain balloons of their colour.
  if (req.type !== 'dots') balloons.list.forEach(undot)
  // items: what is in the basket (colour, kind). slips: hand-overs not right yet and wrong dots;
  // fixes: balloons let go again; strays: other pops (run: in a row, guide: the finger comes back).
  // idle: seconds since the basket last changed; eased: softened in place for a child who is stuck;
  // tempt: matching balloons still to send once the basket is right, so stopping is a real choice.
  game.sky = { req, count: 0, done: false, items: [], slips: 0, fixes: 0, strays: 0, run: 0, guide: false, full: 0, told: '', reminders: 0, said: 0, restUntil: 0, over: false, asked: 0, idle: 0, eased: false, tempt: 0, tempted: false }
  renderSky()
  // A new tier is not announced: the slots without numbers (or the ten-frames) show what changed.
  voice.say(req.say)
}

/**
 * Clean baskets in a row move up one tier (three to reach plain slots from level 3, four to reach ten-frames from level 5,
 * so tier 2 is explored first); two bumpy ones move down one.
 */
function adapt(clean) {
  if (game.tier === 3 && clean) game.climb = Math.min(7, game.climb + 1)
  game.streak = clean ? game.streak + 1 : 0
  game.rough = clean ? 0 : game.rough + 1
  if (game.tier < 3 && game.streak >= game.tier + 2 && game.level >= (game.tier === 1 ? 3 : 5)) Object.assign(game, { tier: game.tier + 1, streak: 0, rough: 0 })
  else if (game.tier > 1 && game.rough >= 2) stepDown()
  saveTier()
}
function stepDown() {
  Object.assign(game, { tier: Math.max(1, game.tier - 1), streak: 0, rough: 0, climb: Math.max(0, game.climb - 2) })
}

/** How the current sky is drawn and helped: its tier, or tier 1's numbered slots once it has been softened. */
const viewTier = () => (game.sky?.eased ? 1 : game.tier)

/**
 * A child who is stuck (two hand-overs not right, three wrong dots, or most of a minute with no change to the basket)
 * is helped in place: the sky softens to numbered slots, the glow and spoken counts, with one hint. It counts as a bumpy
 * basket at once, so two softened skies (or the first one of a visit, as when a younger child plays on a sibling's
 * tier) move the tier down without waiting for the basket to be finished. Tier 1 already has all of that: the finger comes back.
 */
function ease() {
  const sky = game.sky
  if (!sky || sky.done || sky.eased) return
  if (game.tier === 1) {
    sky.guide = true
    return
  }
  sky.eased = true
  game.streak = 0
  game.rough += 1
  if (game.rough >= 2 || game.skies === 0) stepDown()
  saveTier()
  renderSky()
  voice.sayNow(hintFor(sky.req))
}

/** The one spoken hint of a softened sky: how to think about it, not only the answer. */
function hintFor(req) {
  if (req.type === 'more' || req.type === 'less') return `${req.other.name} has ${req.ref}. One ${req.type} than ${req.ref} is ${req.total}.`
  if (req.type === 'same') return `${req.friend.name} has ${req.has}. Count on to ${req.ref}: one balloon for each slot.`
  if (req.type === 'dots') return `Count the dots on each balloon. ${req.friend.name} wants ${req.dots}.`
  return 'One balloon for each slot, then tap Give.'
}

// --- The basket ----------------------------------------------------------------------
// Most requests want one number of balloons. A two-colour basket ('pair') wants each colour right.

/** How many balloons of one colour are in the basket. */
const ofColour = (sky, colour) => sky.items.filter((item) => colourName(item.tint) === colour).length
/** For each part of the request, how many the basket holds (one part unless it is a two-colour basket). */
const basketParts = (sky) => (sky.req.colours ? sky.req.colours.map((c) => ofColour(sky, c)) : [sky.count])
const wanted = (req) => (req.colours ? req.parts : [req.total])
const basketRight = (sky) => basketParts(sky).every((n, g) => n === wanted(sky.req)[g])
/** The colour (or true) that has too many, or null. */
function basketOver(sky) {
  const parts = basketParts(sky)
  const g = parts.findIndex((n, i) => n > wanted(sky.req)[i])
  return g < 0 ? null : (sky.req.colours?.[g] ?? true)
}
/** "4 red and 1 blue", or just "4": what the friend is handed. */
const basketWords = (sky) => (sky.req.colours ? basketParts(sky).map((n, g) => `${n} ${sky.req.colours[g]}`).join(' and ') : String(sky.count))

/** A slot for one balloon of the request: its colour or shape, numbered once filled in tier 1. A filled one can be let go. */
function skySlot(req, n, item, index = n - 1) {
  const slot = picture(item ? (item.picture ?? req.colour) : (req.colour ?? req.picture), !!item)
  slot.classList.add('sky-slot')
  if (item?.color) {
    slot.classList.add('colour-balloon')
    slot.style.setProperty('--c', item.color)
  }
  if (item) {
    if (req.type === 'dots' || game.tier === 1) {
      const num = document.createElement('b')
      num.className = 'sky-num'
      num.textContent = req.type === 'dots' ? req.dots : n
      slot.append(num)
    }
    if (req.type !== 'dots') slot.dataset.i = index
    if (index === game.sky.items.length - 1) slot.classList.add('new')
  }
  return slot
}

/**
 * A ten-frame cell: empty, or holding one balloon. `i` is its place in the basket (a basket balloon can be let go);
 * 'own' marks a balloon the friend already held ('same'), which stays. `part` tints the two groups of an adding request.
 */
function frameCell(item, i, part) {
  const cell = document.createElement('span')
  cell.className = `sky-cell${part ? ` part${part}` : ''}`
  if (item) {
    const ball = picture(item.picture ?? 'red', true)
    if (item.color) {
      ball.classList.add('colour-balloon')
      ball.style.setProperty('--c', item.color)
    }
    if (i === 'own') cell.classList.add('own')
    else if (i != null) {
      if (i === game.sky.items.length - 1) ball.classList.add('new')
      cell.dataset.i = i
    }
    cell.append(ball)
  }
  return cell
}

/** Ten-frames for a list of cells, another frame for each ten. */
function tenFrames(cells, least = 1) {
  const frames = []
  for (let f = 0; f < Math.max(least, Math.ceil(cells.length / 10)); f++) {
    const frame = document.createElement('span')
    frame.className = 'sky-frame'
    for (let k = f * 10; k < f * 10 + 10; k++) frame.append(cells[k] ?? frameCell())
    frames.push(frame)
  }
  return frames
}

/** Each colour word printed in its colour, so the caption also works as a picture. */
function colourCaption(el, text, colours) {
  if (!colours.length) return (el.textContent = text)
  el.replaceChildren(...text.split(new RegExp(`\\b(${colours.join('|')})\\b`)).map((part) => {
    if (!colours.includes(part)) return part
    const word = Object.assign(document.createElement('span'), { className: 'sky-word', textContent: part })
    word.style.setProperty('--c', SKY_COLOURS[part])
    return word
  }))
}

function renderSky() {
  const card = $('sky')
  const { req, count, done, items } = game.sky
  const tier = viewTier()
  card.classList.toggle('done', done)
  card.classList.toggle('tier2', tier === 2)
  card.classList.toggle('tier3', tier === 3)
  $('sky-friend').textContent = req.friend.face
  const caption = done ? req.named : req.ref ? req.want : req.say
  colourCaption($('sky-caption'), caption, req.colours ?? (req.colour ? [req.colour] : []))
  card.setAttribute('aria-label', `${done ? req.named : req.say} ${count} in the basket.`)
  // The basket is handed over by the child; a dots request finishes itself once three are found.
  const give = $('give')
  give.hidden = req.type === 'dots' || done
  give.disabled = done
  // Tier 1 shows when the basket is full with a steady glow; tiers 2 and 3 leave that to the child's counting.
  give.classList.toggle('full', tier === 1 && count === req.total && !done)
  const slots = $('sky-slots')
  slots.replaceChildren()
  // Handed over: the friend offers two treats for the picnic, and the child picks one (or none) to bring along.
  if (done && game.treats) {
    slots.append(treatChoice())
    placeSun()
    return
  }
  if (req.ref) {
    // One more, one less or the same: the other friend's bunch, to count first ('same' in a ten-frame, to compare row by row).
    const ref = document.createElement('span')
    ref.className = req.has ? 'sky-them' : 'sky-ref'
    const face = Object.assign(document.createElement('span'), { className: 'sky-ref-face', textContent: req.other.face })
    const theirs = { color: SKY_COLOURS[req.colour] }
    ref.append(face, ...(req.has ? tenFrames(Array.from({ length: req.ref }, () => frameCell(theirs))) : [rowsOfFive(Array.from({ length: req.ref }, () => picture(req.colour)))]))
    slots.append(ref)
  }
  if (req.type === 'dots') {
    // The number to match, on a gold balloon: as a dice face in the sky balloons' own dots, or (tier 3) a numeral.
    const gold = document.createElement('span')
    gold.className = `sky-gold${req.dots > 6 ? ' many' : ''}`
    if (tier < 3) dotLayout(req.dots).forEach(([x, y]) => {
      const dot = document.createElement('i')
      dot.style.left = `${x}%`
      dot.style.top = `${y}%`
      gold.append(dot)
    })
    else gold.append(Object.assign(document.createElement('b'), { className: 'sky-gold-num', textContent: req.dots }))
    const finds = []
    for (let i = 0; i < req.total; i++) finds.push(skySlot({ ...req, colour: 'orange' }, i + 1, items[i]))
    slots.append(gold, rowsOfFive(finds))
    placeSun()
    return
  }
  if (tier === 3 && req.colours) {
    // A two-colour basket in tier 3: an open ten-frame for each colour, with no slot or line to stop at.
    req.colours.forEach((colour, g) => {
      if (g) slots.append(Object.assign(document.createElement('span'), { className: 'sky-plus', textContent: '+' }))
      const mine = items.map((item, i) => ({ item, i })).filter(({ item }) => colourName(item.tint) === colour)
      const frames = tenFrames(mine.map(({ item, i }) => frameCell(item, i)))
      frames.forEach((f) => f.style.setProperty('--c', SKY_COLOURS[colour]))
      const group = Object.assign(document.createElement('span'), { className: 'sky-pair-frames' })
      group.append(...frames)
      slots.append(group)
    })
    placeSun()
    return
  }
  if (tier === 3) {
    // Ten-frames with no stopping line: two for the teens, another if the basket runs over.
    // 'same' starts with the balloons the friend already holds; an adding request tints its two groups' cells.
    const own = Array.from({ length: req.has ?? 0 }, () => frameCell({ color: SKY_COLOURS[req.colour] }, 'own'))
    const cells = [...own]
    for (let i = 0; i < Math.max(count, req.type === 'add' ? req.total : 0); i++) {
      const part = req.type === 'add' && i < req.total ? (i < req.parts[0] ? 1 : 2) : 0
      cells.push(frameCell(items[i], items[i] ? i : null, part))
    }
    // 'same' reads friend first: their frame, then the other friend's bunch to match.
    slots[req.has ? 'prepend' : 'append'](...tenFrames(cells, req.total > 10 ? 2 : 1))
    placeSun()
    return
  }
  if (req.colours) {
    // A two-colour basket: a group of slots for each colour, each balloon sorted into its colour's group.
    req.parts.forEach((part, g) => {
      if (g) slots.append(Object.assign(document.createElement('span'), { className: 'sky-plus', textContent: '+' }))
      const colour = req.colours[g]
      const mine = items.map((item, i) => ({ item, i })).filter(({ item }) => colourName(item.tint) === colour)
      const group = []
      for (let k = 0; k < part; k++) group.push(skySlot({ ...req, colour }, k + 1, mine[k]?.item, mine[k]?.i))
      slots.append(rowsOfFive(group))
      if (mine.length > part) {
        const extra = rowsOfFive(mine.slice(part).map(({ item, i }, k) => skySlot({ ...req, colour }, part + k + 1, item, i)))
        extra.classList.add('sky-extra')
        slots.append(extra)
      }
    })
    placeSun()
    return
  }
  // Tiers 1 and 2: a slot for each balloon asked for; an adding request shows its two groups apart.
  let n = 0
  req.parts.forEach((part, g) => {
    if (g) slots.append(Object.assign(document.createElement('span'), { className: 'sky-plus', textContent: '+' }))
    const group = []
    for (let i = 0; i < part; i++, n++) group.push(skySlot(req, n + 1, items[n]))
    slots.append(rowsOfFive(group))
  })
  // Balloons past the number wait outside the slots, until the child lets them go.
  if (count > req.total) {
    const extra = rowsOfFive(items.slice(req.total).map((item, i) => skySlot(req, req.total + i + 1, item)))
    extra.classList.add('sky-extra')
    slots.append(extra)
  }
  placeSun()
}

/** In portrait (or a narrow landscape card) the sun drifts down out from under the card. */
function placeSun() {
  const card = $('sky')
  world.layout(counting() && !card.hidden ? card.getBoundingClientRect() : null)
}

/** A group of slots in rows of at most five, like a ten-frame. */
function rowsOfFive(items) {
  const group = document.createElement('span')
  group.className = 'sky-group'
  for (let r = 0; r < items.length; r += 5) {
    const row = document.createElement('span')
    row.className = 'sky-row'
    row.append(...items.slice(r, r + 5))
    group.append(row)
  }
  return group
}

/** Replays a short CSS animation on the friend's face: 'ask' (a head tilt) or 'no' (a small shake). */
function friendFace(cls) {
  const friend = $('sky-friend')
  friend.classList.remove('ask', 'no')
  void friend.offsetWidth
  friend.classList.add(cls)
}

/** A pop in the counting sky. Returns true when the balloon went into the basket. */
function countPop(b, chain) {
  const sky = game.sky
  if (!sky || sky.done || b.leaving) return false
  const { req } = sky
  if (!req.accept(b)) {
    if (chain) return false
    // A dotted balloon with the wrong number of dots is gently named, once per number.
    if (req.type === 'dots' && b.dots) {
      sky.slips += 1
      voice.sayOnce(`That one had ${b.dots} ${b.dots === 1 ? 'dot' : 'dots'}.`)
      if (sky.slips >= 3) ease()
    } else {
      // Not one the friend asked for: a small head shake and a soft boop, no words.
      sky.strays += 1
      sky.run += 1
      later(() => audio.boop(), 60)
    }
    friendFace('no')
    // Three misses in a row: the finger comes back to show a balloon that matches (tiers 1 and 2).
    if (sky.run >= 3 && viewTier() < 3) sky.guide = true
    return false
  }
  // The star's chain pops are for fun: only the child's own taps fill the basket.
  if (chain) return false
  // A basket holds a few past the number asked for (per colour in a two-colour basket); more just pop for fun.
  const g = req.colours ? req.colours.indexOf(colourName(b.color)) : 0
  if (basketParts(sky)[g] >= wanted(req)[g] + (req.type === 'dots' ? 0 : SPARE)) return false
  sky.run = 0
  sky.guide = false
  sky.idle = 0
  sky.count += 1
  // tint: the balloon's own colour, kept for sorting and for the bunch the friend carries to the picnic.
  sky.items.push({ color: req.picture ? null : b.color, tint: b.color, picture: req.picture, kind: b.kindName })
  audio.count(Math.min(sky.count, 15))
  if (req.type === 'dots') {
    // The spoken number is always the dot number being matched, never a count of finds.
    if (sky.count === 1) voice.say(`${req.dots} dots!`, { interrupt: false })
  } else if (viewTier() === 1 && sky.count > sky.said && sky.count <= req.total) {
    // Tier 1 hears the count up to five, each number once per sky (refilling after letting one go is quiet).
    // The number asked for lands with a stop ("3. That's 3!"); past it the count goes quiet, so stopping is heard.
    sky.said = sky.count
    if (sky.count === req.total) voice.say(`${sky.count}. That's ${sky.count}!`, { interrupt: false })
    else voice.count(sky.count, { interrupt: false })
  }
  if (sky.count === req.total) sky.full = 0
  // Once the basket is just right, two or three more matching balloons drift up: stopping is the child's choice, not luck.
  if (req.type !== 'dots' && !sky.tempted && basketRight(sky)) {
    sky.tempted = true
    sky.tempt = 2 + (Math.random() < 0.5)
    game.spawnIn = Math.min(game.spawnIn, 0.6)
  }
  if (req.type === 'dots' && sky.count === req.total) finishSky()
  else renderSky()
  return true
}

/** The child hands the basket over: just right, too few (the friend asks again) or too many (the child lets some go). */
function give() {
  const sky = game.sky
  if (!counting() || !sky || sky.done || sky.req.type === 'dots') return
  audio.click()
  const { req, count } = sky
  // Resting after a hand-over that was not right: Give is dimmed and taps get the click and a tilt, never
  // more words, so tapping it again and again is slower than looking at the basket and counting.
  if (performance.now() < sky.restUntil) return friendFace('ask')
  if (basketRight(sky)) return finishSky()
  friendFace('ask')
  sky.slips += 1
  const rest = giveRest(sky.slips)
  sky.restUntil = performance.now() + rest
  const btn = $('give')
  btn.classList.add('rest')
  later(() => btn.classList.remove('rest'), rest)
  const over = basketOver(sky)
  sky.over = !!over
  // A second hand-over that is not right softens the sky (from tier 2), with its one hint instead of a reminder.
  if (sky.slips >= 2 && game.tier > 1 && !sky.eased) {
    if (over) voice.sayOnce('Tap a balloon in the basket to let it go.')
    return ease()
  }
  // The reminder is spoken only when the basket has changed since the last one, and at most three times a sky.
  const words = basketWords(sky)
  if (words === sky.told || sky.reminders >= 3) return
  sky.told = words
  sky.reminders += 1
  if (over) {
    voice.sayNow(`That's ${words}. Too many${over === true ? '' : ` ${over}`}! ${req.want}`)
    voice.sayOnce('Tap a balloon in the basket to let it go.')
  } else voice.sayNow(count ? `That's ${words}. ${req.want}` : req.want)
}

/** The child taps a balloon in the basket: it is let go and floats back up into the sky. */
function release(i, el) {
  const sky = game.sky
  if (!counting() || !sky || sky.done || sky.req.type === 'dots' || !sky.items[i]) return
  const [item] = sky.items.splice(i, 1)
  sky.count -= 1
  sky.fixes += 1
  sky.idle = 0
  if (!basketOver(sky)) sky.over = false
  audio.release()
  const r = (el ?? $('give')).getBoundingClientRect()
  floatAway([item], r.left + r.width / 2, r.bottom + 30)
  renderSky()
}

/** Balloons let go from the basket drift up out of it and away. */
function floatAway(items, x, y) {
  items.forEach((item, i) => {
    const b = balloons.make(item.kind === 'mini' ? 'round' : item.kind, { color: item.color ?? undefined, scale: balloonScale() * 0.8 })
    b.group.position.copy(worldAt(x, y, 0))
    b.vx = (i - (items.length - 1) / 2) * 2
    b.speed = 1.4
    b.leaving = true // never counted again
  })
}

const ray = new THREE.Vector3()
/** The point on the plane z (world units) under a screen point. */
function worldAt(x, y, z) {
  ray.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
  return camera.position.clone().addScaledVector(ray, (z - camera.position.z) / ray.z)
}

function finishSky() {
  const sky = game.sky
  sky.done = true
  game.skies += 1
  game.biggest = Math.max(game.biggest, sky.req.total)
  // A softened sky has already counted as a bumpy one.
  if (!sky.eased) adapt(sky.slips === 0 && sky.fixes === 0 && sky.strays <= 2)
  game.finale = game.skies >= (adventure.option.visit ?? Infinity)
  // "Just right!" only when the first hand-over was exact; otherwise a plain thank you.
  const thanks = sky.req.type !== 'dots' && sky.slips === 0 ? 'Just right!' : 'Thank you!'
  voice.say(`${sky.req.named} ${thanks}`)
  const { w, h } = halfSize(0)
  effects.drift(w, h)
  later(() => audio.chord(), 500)
  // Two treats to choose from for the picnic; the next request waits for the choice (or a calm while without one).
  game.treats = pickTreats()
  game.skyWait = 9
  renderSky()
  toPicnic(sky)
}

// --- Picnic treats ---------------------------------------------------------------------
// After each hand-over the friend offers two treats and the child chooses one to bring to the picnic.
// It is the child's own small creation: no right answer, nothing counted, and it stays on the home screen.

const TREATS = ['🍓', '🧁', '🍎', '🍉', '🍪', '🥕', '🍌', '🫐', '🌼', '🪁', '🍩', '🧀', '🥨', '🍐']

function pickTreats() {
  const used = new Set(game.picnic.map((v) => v.treat))
  const fresh = TREATS.filter((t) => !used.has(t))
  const from = fresh.length >= 2 ? fresh : TREATS
  const a = from[(Math.random() * from.length) | 0]
  const rest = from.filter((t) => t !== a)
  return [a, rest[(Math.random() * rest.length) | 0]]
}

function treatChoice() {
  const row = Object.assign(document.createElement('span'), { className: 'sky-treats' })
  row.append(Object.assign(document.createElement('span'), { className: 'sky-treats-basket', textContent: '🧺' }))
  const chosen = game.sky.visitor?.treat
  for (const treat of game.treats) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: `sky-treat${treat === chosen ? ' chosen' : ''}`, textContent: treat })
    btn.dataset.treat = treat
    btn.disabled = !!chosen && treat !== chosen
    btn.setAttribute('aria-label', `Bring ${treat} to the picnic`)
    row.append(btn)
  }
  return row
}

function pickTreat(treat) {
  const sky = game.sky
  if (!counting() || !sky?.done || !sky.visitor || sky.visitor.treat || !game.treats?.includes(treat)) return
  sky.visitor.treat = treat
  audio.release()
  sky.seat?.append(treatEl(treat))
  game.skyWait = Math.min(game.skyWait, 3)
  renderSky()
}

const treatEl = (treat) => Object.assign(document.createElement('span'), { className: 'picnic-treat', textContent: treat })

// --- The picnic -----------------------------------------------------------------------
// Each friend the child helps floats down to a picnic on the hill holding the exact bunch they were given
// (and any balloons they already held). Over a visit the child builds the picnic; the home screen shows it.

/** A friend with their bunch of balloons: one small balloon for each, in rows of five. */
function picnicFriend({ face, tints, treat }) {
  const friend = Object.assign(document.createElement('span'), { className: 'picnic-friend' })
  const bunch = Object.assign(document.createElement('span'), { className: 'picnic-bunch' })
  for (const tint of tints) {
    const ball = document.createElement('i')
    ball.style.setProperty('--c', tint)
    bunch.append(ball)
  }
  friend.append(bunch, Object.assign(document.createElement('span'), { className: 'picnic-face', textContent: face }))
  if (treat) friend.append(treatEl(treat))
  friend.setAttribute('aria-label', `${tints.length} balloons`)
  return friend
}

function toPicnic(sky) {
  const { req, items } = sky
  const tints = [...Array.from({ length: req.has ?? 0 }, () => SKY_COLOURS[req.colour]), ...items.map((item) => item.tint)]
  const visitor = { face: req.friend.face, tints }
  game.picnic.push(visitor)
  const strip = $('picnic')
  const seat = picnicFriend(visitor)
  seat.style.visibility = 'hidden'
  // The friend takes the next empty place on the blanket: the visit ends when every place is taken.
  const empty = strip.querySelector('.picnic-empty')
  if (empty) empty.replaceWith(seat)
  else strip.append(seat)
  while (strip.children.length > 9) strip.firstElementChild.remove()
  Object.assign(sky, { visitor, seat })
  // The friend floats from the card down to their seat, a little after the thank-you.
  later(() => {
    const from = $('sky-friend').getBoundingClientRect()
    const to = seat.getBoundingClientRect()
    const flyer = picnicFriend(visitor)
    flyer.classList.add('picnic-flyer')
    flyer.style.left = `${to.left}px`
    flyer.style.top = `${to.top}px`
    document.body.append(flyer)
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top - to.top
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    const flight = flyer.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'translate(0, 0)', opacity: 1 }],
      { duration: calm ? 1 : 2600, easing: 'ease-in-out', fill: 'forwards' },
    )
    const land = () => {
      flyer.remove()
      seat.style.visibility = ''
    }
    flight.onfinish = land
    flight.oncancel = land
  }, 900)
}

/** The blanket at the start of a visit: one empty place for each friend to come. */
function layPicnic(places) {
  const strip = $('picnic')
  strip.classList.remove('wave')
  strip.replaceChildren(...Array.from({ length: places }, () => Object.assign(document.createElement('span'), { className: 'picnic-empty' })))
  strip.hidden = !places
}

/** Every place is taken: the friends wave once, one closing line, and the visit gently returns home. */
function endVisit() {
  $('sky').hidden = true
  placeSun()
  later(() => {
    $('picnic').classList.add('wave')
    voice.say('Everyone is at the picnic!')
    const { w, h } = halfSize(0)
    effects.drift(w, h)
    audio.chord()
  }, 900)
  later(() => toTitle(true), 7000)
}

/** The home screen shows the picnic the child made this visit. */
function showPicnic() {
  const row = $('title-picnic')
  row.replaceChildren(...game.picnic.map(picnicFriend))
  row.classList.toggle('hidden', !game.picnic.length)
  $('picnic').replaceChildren()
  $('picnic').hidden = true
  for (const flyer of document.querySelectorAll('.picnic-flyer')) flyer.remove()
}

function nextSky() {
  game.level += 1
  game.treats = null
  const lv = level(game.level)
  // A new balloon friend is sent up first, without a card: the screen stays about the friend's request.
  if (lv.intro && game.level <= LEVELS.length) game.forced = lv.show
  newRequest()
}

// --- Dotted balloons -----------------------------------------------------------------

const dotFaces = new Map()
/** A face of n scattered dots, drawn once per number and shared by every balloon that carries it. */
function dotFace(n) {
  let material = dotFaces.get(n)
  if (!material) {
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
    const g = c.getContext('2d')
    const r = n > 6 ? 22 : 28
    g.lineWidth = 7
    g.fillStyle = '#fffdf0'
    g.strokeStyle = '#4a2f86'
    for (const [x, y] of scatterLayout(n)) {
      g.beginPath()
      g.arc(x * 256, y * 256, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    // Drawn over its own balloon from the balloon's middle: a face out in front would slide off it in perspective.
    material = new THREE.SpriteMaterial({ map, toneMapped: false, depthTest: false })
    dotFaces.set(n, material)
  }
  return material
}

/** Gives a plain round balloon a face of n dots. */
function addDots(b, n) {
  const shape = balloons.shapes[b.kind.model] ?? { x: 0, y: 0, rx: 1, ry: 1.1 }
  const face = new THREE.Sprite(dotFace(n))
  face.position.set(shape.x, shape.y + shape.ry * 0.05, 0)
  face.scale.setScalar(shape.rx * 1.75)
  face.renderOrder = 1
  b.group.add(face)
  b.face = face
  b.dots = n
}

/** A dotted balloon left over from an earlier request becomes a plain balloon again. */
function undot(b) {
  b.face?.removeFromParent()
  b.face = null
  b.dots = 0
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
  placeSun()
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

/** Everyday colours with teal left out: the counting sky's balloons and rainbow babies. */
const SKY_PALETTE = COLORS.filter((c) => c !== '#2ec4b6')
/** In the counting sky a heart is exactly the red, pink or purple of the round balloons, so its colour is never in doubt. */
const SKY_HEARTS = [SKY_COLOURS.red, SKY_COLOURS.pink, SKY_COLOURS.purple]
/** The red sky's other balloons are often the colours closest to red, so finding red takes a careful look. */
const NEAR_RED = [SKY_COLOURS.pink, SKY_COLOURS.orange, SKY_COLOURS.purple]
const any = (list) => list[(Math.random() * list.length) | 0]

/**
 * How likely a new balloon is to match the request: two in five, half in tier 3, and more while a big
 * number still has far to go, so a teen request never leaves a child waiting long for matches.
 */
function matchChance(sky) {
  if (game.tier < 3) return 0.4
  return sky.req.total - sky.count > 6 ? 0.65 : 0.5
}

/** The colour a matching balloon should be: the request's, or in a two-colour basket the one still short. */
function skyColourNeeded(sky) {
  const { req } = sky
  if (!req.colours) return req.colour
  const short = req.colours.filter((c, g) => ofColour(sky, c) < req.parts[g])
  const from = short.length ? short : req.colours
  return from[(Math.random() * from.length) | 0]
}

function spawn(kindName, opts = {}) {
  const lv = level(game.level)
  const sky = counting()
  // Counting sky: about two in five new balloons match the request, so there is always one to find.
  const req = sky && game.sky && !game.sky.done ? game.sky.req : null
  let dots = 0
  if (req?.type === 'dots' && !opts.color && kindName !== game.forced) {
    // Dotted balloons: about a third carry the number asked for, a third a near number, the rest none.
    const r = Math.random()
    if (r < 0.66) {
      kindName = 'round'
      const most = game.tier === 3 ? 9 : 7
      const near = [-2, -1, 1, 2].map((d) => req.dots + d).filter((n) => n >= 1 && n <= most)
      dots = r < 0.33 ? req.dots : near[(Math.random() * near.length) | 0]
    }
  } else if (req && !opts.color && kindName !== game.forced && (game.sky.tempt > 0 ? game.sky.tempt-- : Math.random() < matchChance(game.sky))) {
    if (req.kind) kindName = req.kind
    else {
      // A matching balloon is a plain or smiley one in the colour asked for.
      if (!['round', 'smile'].includes(kindName)) kindName = Math.random() < 0.6 ? 'round' : 'smile'
      opts = { ...opts, color: SKY_COLOURS[skyColourNeeded(game.sky)] }
    }
  }
  // Teal is never asked for and looks blue or green to young children, so the counting sky leaves it out,
  // between requests too: a balloon still floating when the next friend asks must read as one colour.
  if (sky && !opts.color) {
    if (KINDS[kindName].colors === COLORS) opts = { ...opts, color: adventure.option.focus === 'red' && Math.random() < 0.6 ? any(NEAR_RED) : any(SKY_PALETTE) }
    else if (kindName === 'heart') opts = { ...opts, color: any(SKY_HEARTS) }
  }
  const s = balloonScale()
  const b = balloons.make(kindName, { scale: s, ...opts })
  if (dots) addDots(b, dots)
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
    // Never more than a comfortable handful on screen at once (a couple more while a full basket's temptation drifts up)
    if (balloons.list.length >= (counting() && game.sky?.tempt > 0 ? 11 : 9)) return
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
  const counted = sky && countPop(b, chain)
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
    // In the counting sky the star leaves the friend's balloons floating, so it never pops away what the child is looking for.
    const keep = sky && game.sky && !game.sky.done ? game.sky.req.accept : () => false
    const others = balloons.list.filter((o) => !keep(o))
    others.sort((a, c) => a.group.position.distanceTo(pos) - c.group.position.distanceTo(pos))
    others.forEach((o, i) => later(() => pop(o, { chain: true }), 200 + i * 180))
  } else if (b.kind.power === 'rainbow') {
    audio.rainbow()
    for (let i = 0; i < 6; i++) {
      const m = balloons.make('mini', { color: (sky ? SKY_PALETTE : COLORS)[i], scale: balloonScale() })
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
// Play-time timers (star chains, the sky's chord) live here so every exit can cancel them.
const playTimers = new Set()
function later(fn, ms) {
  const id = setTimeout(() => {
    playTimers.delete(id)
    fn()
  }, ms)
  playTimers.add(id)
  return id
}
/** The one cleanup every exit and fresh start shares: words stop and no timer fires afterwards. */
function stopPlay() {
  voice.hush()
  for (const id of playTimers) clearTimeout(id)
  playTimers.clear()
  clearTimeout(rewardTimer)
  $('mission-reward').classList.remove('show')
  clearTimeout(introTimer)
  $('intro').classList.remove('show')
}

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

/** Back home. `finished`: the picnic filled and its closing line was already said, so home is quiet. */
function toTitle(finished = false) {
  if (!finished) stopPlay() // every way back (🏠, Escape) stops the sky's words and pending pops before the summary
  else {
    for (const id of playTimers) clearTimeout(id)
    playTimers.clear()
  }
  game.state = 'title'
  game.party = 0
  // Say what the child did, not how it ranks.
  let last = game.score ? `🎈 You popped ${game.score} balloon${game.score === 1 ? '' : 's'}!` : ''
  if (game.skies) {
    last = `🎈 You helped ${game.skies} friend${game.skies === 1 ? '' : 's'}, up to ${game.biggest} balloon${game.biggest === 1 ? '' : 's'}!`
    if (!finished) voice.say(`You helped ${game.skies} friend${game.skies === 1 ? '' : 's'}!`)
  }
  $('last').textContent = last
  $('last').classList.toggle('hidden', !last)
  showPicnic()
  $('sky').hidden = true
  game.sky = null
  // Dotted balloons belong to a request, and let-go ones to a basket: neither floats over the title.
  for (const b of [...balloons.list]) if (b.dots || b.leaving) balloons.remove(b)
  placeSun()
  show('title')
  showEasy()
}

/** A tier above 1 is remembered per device: the home screen offers a visible way to start easy (a younger sibling, a new day). */
function showEasy() {
  $('easy').classList.toggle('hidden', !(adventure.option.sky && loadTier().tier > 1))
}

function start() {
  stopPlay() // the tap starts afresh: earlier words and timers give way to the new request
  voice.newRound()
  adventure.begin()
  audio.unlock()
  audio.click()
  balloons.clear()
  Object.assign(game, { state: 'play', level: 1, score: 0, progress: 0, spawnIn: 0.4, pause: 0, party: 0, forced: null, sky: null, recent: [], skyWait: 0, skies: 0, biggest: 0, streak: 0, rough: 0, picnic: [], treats: null, finale: false })
  showPicnic()
  // A returning child keeps their tier: plain slots start a little further on, ten-frames further still.
  Object.assign(game, loadTier())
  if (adventure.option.sky) game.level = [1, 3, 5][game.tier - 1]
  show('play')
  const sky = counting()
  $('hud').classList.toggle('counting', sky)
  $('title-picnic').classList.add('hidden')
  $('sky').hidden = !sky
  if (sky) layPicnic(adventure.option.visit)
  updateHud()
  if (sky) {
    game.firstPop = false // the finger points at the first balloon to count
    newRequest()
  } else {
    showIntro('🎈', 'Pop the balloons!', 'Tap them before they fly away')
    // The goal is said once: on choosing it, or here if it was remembered from an earlier visit.
    if (adventure.option.goal && choiceSaid !== adventure.option.goal) voice.say(adventure.option.goal)
  }
  choiceSaid = null
  if (!game.firstPop || adventure.option.goal) $('hint').classList.remove('hidden')
}

$('play').addEventListener('click', start)
$('easy').addEventListener('click', () => {
  try {
    localStorage.removeItem(TIER_KEY)
  } catch {}
  start()
})
$('adventure-choice').addEventListener('click', showEasy)
$('give').addEventListener('click', (e) => {
  e.stopPropagation()
  give()
})
// The card takes every tap on it, so nothing hidden behind it is popped. A balloon in the basket
// (a slot or a ten-frame cell) is let go with a tap; the friend's face asks again.
$('sky').addEventListener('pointerdown', (e) => {
  if (e.target.closest('#give')) return
  e.preventDefault()
  const treat = e.target.closest('[data-treat]')
  if (treat) return pickTreat(treat.dataset.treat)
  const el = e.target.closest('#sky-slots [data-i]')
  if (el) release(+el.dataset.i, el)
  else if (e.target.closest('#sky-friend')) askAgain()
})

/** Tapping the friend repeats what they want, at most every six seconds; otherwise they just tilt their head. */
function askAgain() {
  const sky = game.sky
  if (!counting() || !sky || sky.done) return
  friendFace('ask')
  if (performance.now() - sky.asked < 6000) return
  sky.asked = performance.now()
  voice.sayNow(sky.req.type === 'dots' ? sky.req.say : sky.req.want)
}
$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.click()
  toTitle()
})
const soundBtn = $('sound')
function setSound(on) {
  audio.setMuted(!on)
  voice.setMuted(!on)
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
// The music box starts off, so the voice and the pops carry the game; a saved "on" turns it back on.
musicBtn.classList.add('off')
try {
  if (localStorage.getItem('balloon-pop-music') === '1') setMusic(true)
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
  // The keyboard pin can hand the basket over too.
  const over = document.elementFromPoint(x, y)
  if (over?.closest('#give')) return give()
  const treat = over?.closest('[data-treat]')
  if (treat) return pickTreat(treat.dataset.treat)
  const held = over?.closest('#sky-slots [data-i]')
  if (held) return release(+held.dataset.i, held)
  if (over?.closest('#sky-friend')) return askAgain()
  if (over?.closest('#sky')) return
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
  if (k === 'g' && counting()) return give()
  // Backspace lets the last balloon in the basket go.
  if ((k === 'backspace' || k === 'delete') && counting() && game.sky) {
    e.preventDefault()
    return release(game.sky.items.length - 1, $('sky-slots').querySelector(`[data-i="${game.sky.items.length - 1}"]`))
  }
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

/** The finger at a screen point. */
function pointAt(el, x, y) {
  el.classList.remove('hidden')
  el.style.transform = `translate(${x}px, ${y}px)`
}

// The "tap here" finger follows the first balloon until the first pop.
function updateHint() {
  const el = $('hint')
  if (game.state !== 'play') return el.classList.add('hidden')
  const sky = counting() && game.sky
  if (counting()) {
    if (!sky || sky.done) return el.classList.add('hidden')
    // An over-full basket handed over (tiers 1 and 2): the finger shows that a balloon in it can be let go.
    if (sky.over && viewTier() < 3) {
      const extra = [...$('sky-slots').querySelectorAll('.sky-extra [data-i]')].at(-1) ?? [...$('sky-slots').querySelectorAll('[data-i]')].at(-1)
      if (extra) {
        const r = extra.getBoundingClientRect()
        return pointAt(el, r.left + r.width / 2, r.top + r.height / 2)
      }
    }
    // The very first full basket: the finger shows where to hand it over (tier 1 only).
    if (viewTier() === 1 && game.skies === 0 && sky.req.type !== 'dots' && sky.count === sky.req.total) {
      const r = $('give').getBoundingClientRect()
      return pointAt(el, r.left + r.width / 2, r.top + r.height / 2)
    }
    // Tier 1 shows the first balloon to find; any tier but 3 brings the finger back after three misses in a row.
    if (!((game.tier === 1 && !game.firstPop) || sky.guide) || sky.count >= sky.req.total) return el.classList.add('hidden')
  } else if (adventure.option.goal ? adventure.progress > 0 : game.firstPop) return el.classList.add('hidden')
  const accept = counting() ? sky.req.accept : adventure.option.accept
  const b = balloons.list.find((x) => !x.leaving && x.group.position.y > -halfSize().h * 0.6 && (!accept || accept(x)))
  if (!b) return el.classList.add('hidden')
  v3.copy(b.group.position).project(camera)
  pointAt(el, ((v3.x + 1) / 2) * innerWidth, ((1 - v3.y) / 2) * innerHeight)
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
  showEasy()
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
      const sky = counting() && game.sky
      // A basket left just right a while (tier 1) gets one gentle reminder per visit; never an over-full one.
      if (sky && !sky.done && viewTier() === 1 && sky.req.type !== 'dots' && basketRight(sky) && (sky.full += dt) > 12) {
        voice.sayOnce(`Is it just right? Tap Give to hand it to ${sky.req.friend.name}.`)
      }
      // Most of a minute with no change to the basket: the sky softens in place (see ease).
      if (sky && !sky.done && (sky.idle += dt) > 50) {
        sky.idle = 0
        ease()
      }
      if (game.skyWait > 0 && (game.skyWait -= dt) <= 0) {
        game.skyWait = 0
        if (counting()) game.finale ? endVisit() : nextSky()
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
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game, balloons, camera, newRequest }
