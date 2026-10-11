import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Balloons, COLORS, KINDS, PALETTE } from './balloons.js'
import { Effects } from './effects.js'
import { FRIENDS, SKY_COLOURS, WORD_COLOURS, YELLOW, colourName, dotLayout, makeRequest, scatterLayout } from './sky.js'
import { createVoice } from './speech.js'
import { World, halfSize as viewSize } from './world.js'

const $ = (id) => document.getElementById(id)
/** Every colour a balloon in the counting sky can be, yellow (for mixing) included. */
const HEX = { ...SKY_COLOURS, yellow: YELLOW }

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
// away just float away. Free popping shows no tally: only the friends met so far.

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
/** Free popping: seconds per unit of a level's goal before the next balloon friend comes (8 → 24 s, 15 → 45 s). */
const FRIEND_SECONDS = 3
const PARTY_EVERY = 3 // a calm Balloon Parade of friends after every third level

// --- Game state -------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | play
  level: 1,
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
  reach: 1, // the level the counts are sized by (see stepDown)
  streak: 0, // clean baskets in a row
  rough: 0, // bumpy baskets in a row
}

// Optional learning missions.

/** A small picture: an emoji, or a drawn balloon when `type` is a colour name. */
function picture(type, filled = true) {
  const slot = document.createElement('span')
  const colour = HEX[type]
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

/** An option's balloons, listed once: drawn on its menu button. */
const balloonRow = (balloons, filled) => ({ balloons, pictures: pictureRow(balloons, filled) })

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
  options: [
    // The calm default: every level is one spoken, pictured counting request (js/sky.js).
    // Its picture is a row of slots, two filled and one waiting.
    // A visit is eight friends; the picnic fills, everyone waves and the visit ends.
    { label: 'Counting sky', sky: true, visit: 8, ...balloonRow(['blue', 'blue', 'blue'], 2) },
    // Three shorter, focused skies: every friend wants exactly three (the youngest's first stop at a number), hearts,
    // or red balloons among pink, orange and purple ones. They use the same basket, Give, rests and let-go as the
    // counting sky, so every choice on the menu but free popping carries the stopping decision.
    { label: 'Three for friends', caption: 'Three', sky: true, focus: 'three', visit: 5, ...balloonRow(['🎈', '🎈', '🎈'], 2) },
    { label: 'Hearts for friends', caption: 'Hearts', sky: true, focus: 'heart', visit: 5, ...balloonRow(['💖', '💖', '💖'], 2) },
    { label: 'Red for friends', caption: 'Red', sky: true, focus: 'red', visit: 5, ...balloonRow(['red', 'red', 'red'], 2) },
    // For the youngest: every balloon pops, and new balloon friends are met along the way (no tally, no bar).
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
    if ([1, 2, 3].includes(saved?.tier)) return { tier: saved.tier, climb: Math.max(0, Math.min(7, saved.climb | 0)), visited: true }
  } catch {}
  return { tier: 1, climb: 0, visited: false }
}
/**
 * Only the Counting sky saves the tier: Three, Hearts and Red adapt within their own short visit, but a run of easy
 * "3 blue" baskets there never moves the Counting sky on to ten-frames.
 */
function saveTier() {
  if (adventure.option.focus) return
  try {
    localStorage.setItem(TIER_KEY, JSON.stringify({ tier: game.tier, climb: game.climb }))
  } catch {}
}

function newRequest() {
  game.recent = [...(game.recent ?? []), game.sky?.req].filter(Boolean).slice(-3)
  // The next friend is one not yet at the picnic, so a visit gathers everyone once.
  const away = (game.picnic ?? []).map((v) => v.face)
  game.taught ??= []
  game.bag ??= []
  const req = makeRequest(game.level, game.recent, Math.random, game.tier, game.climb, adventure.option.focus, away, game.taught, game.reach, game.bag)
  if (req.type === 'mix' && req.told && !game.taught.includes(req.target)) game.taught.push(req.target)
  // Dots belong to the dots request only: afterwards those balloons are plain balloons of their colour.
  if (req.type !== 'dots') balloons.list.forEach(undot)
  // A mixed colour has no balloon of its own: any still floating from the last friend drift quickly up and away
  // (not countable, see countPop), and any not yet in view never come, so the sky never shows the colour to be made.
  if (req.type === 'mix') {
    for (const b of [...balloons.list]) {
      if (b.leaving || colourName(b.color) !== req.target) continue
      if (b.group.position.y < -halfSize(b.group.position.z).h) balloons.remove(b)
      else Object.assign(b, { leaving: true, speed: 4.5 })
    }
  }
  // items: what is in the basket (colour, kind). slips: hand-overs not right yet and wrong dots;
  // fixes: balloons let go again; strays: other pops (run: in a row, guide: the finger comes back).
  // idle: seconds since the basket last changed; eased: softened in place for a child who is stuck;
  // tempt: matching balloons still to send once the basket is right, so stopping is a real choice.
  // asked: when the request was last said (now), so a quick tap on the friend or an empty Give never repeats it at once.
  // hinted / answered: the softened sky's strategy hint, then (stuck again) the answer, each said once.
  game.sky = { req, count: 0, done: false, items: [], slips: 0, fixes: 0, strays: 0, run: 0, guide: false, full: 0, told: '', reminders: 0, said: 0, restUntil: 0, over: false, asked: performance.now(), idle: 0, eased: false, hinted: false, answered: false, tempt: 0, tempted: false, repeats: 0, dry: 0, made: 0, overTold: false }
  renderSky()
  // A new tier is not announced: the slots without numbers (or the ten-frames) show what changed.
  voice.say(req.say)
}

/**
 * Four clean baskets in a row move up one tier (from level 3 to plain slots, from level 5 to ten-frames); two bumpy
 * ones move down one. Each step waits for a visit begun on the tier below: the Counting sky's first visit (or the first
 * after Start easy) stays on numbered slots all the way, so a careful three-year-old is not met with two-colour
 * baskets, mixing and which-has-most within half a minute; and ten-frames (one more, one less, the same) come only to
 * a child who began this visit on plain slots already. A focused sky (Three, Hearts, Red) adapts within its own visit.
 */
function adapt(clean) {
  if (game.tier === 3 && clean) game.climb = Math.min(7, game.climb + 1)
  game.streak = clean ? game.streak + 1 : 0
  game.rough = clean ? 0 : game.rough + 1
  const ready = game.tier === 1 ? game.level >= 3 && (game.visited || !!adventure.option.focus) : game.level >= 5 && game.startTier >= 2
  if (game.tier < 3 && game.streak >= 4 && ready) Object.assign(game, { tier: game.tier + 1, streak: 0, rough: 0 })
  else if (game.tier > 1 && game.rough >= 2) stepDown()
  saveTier()
}
/**
 * One tier down. The counts go back to the new tier's first level as well (2–4 in tier 1, 2–5 in tier 2), so a
 * child who was struggling is not asked for 9 bunnies with numbered slots: the support and the numbers ease together.
 */
function stepDown() {
  const tier = Math.max(1, game.tier - 1)
  Object.assign(game, { tier, streak: 0, rough: 0, climb: Math.max(0, game.climb - 2), reach: Math.min(game.reach, EASED_REACH[tier - 1]) })
}
/** The level each tier starts its counts at. */
const TIER_START = [1, 3, 5]
/** Where the counts go back to after a step down: 2–4 in tier 1, 2–5 in tier 2, then they grow again one level a friend. */
const EASED_REACH = [3, 4]

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
  if (!sky || sky.done) return
  if (game.tier === 1 || sky.eased) {
    // Already as easy as it gets: the finger comes back, and a child still stuck after the strategy hint hears the answer.
    sky.guide = true
    if (!sky.hinted) {
      // Tier 1, stuck for the first time this sky: the way out, once. An over-full basket hears how to let one go
      // (however many reminders were used up by early hand-overs); otherwise the sky's strategy hint.
      sky.hinted = true
      voice.sayNow(basketOver(sky) ? 'Too many in the basket. Tap one to let it go.' : hintFor(sky.req))
    } else if (!sky.answered) {
      sky.answered = true
      const answer = answerFor(sky.req)
      if (answer) voice.sayNow(answer)
    }
    return
  }
  sky.eased = true
  sky.hinted = true
  // Softened mid-basket: the spoken count would start part-way ("4, 5, 6"), so this basket stays quiet; the numbered
  // slots show the count (a mixing basket, its bowls).
  sky.said = sky.count ? Infinity : 0
  sky.made = sky.count ? Infinity : 0
  game.streak = 0
  game.rough += 1
  if (game.rough >= 2 || game.skies === 0) stepDown()
  saveTier()
  renderSky()
  voice.sayNow(hintFor(sky.req))
}

const cap = (word) => `${word[0].toUpperCase()}${word.slice(1)}`

/** The first spoken hint of a softened sky: the way to work it out, not the answer. */
function hintFor(req) {
  const who = req.friend.name
  const things = req.picture ? 'hearts' : 'balloons'
  if (req.type === 'more') return `Count ${req.other.name}'s ${things} first. One more goes one past them.`
  if (req.type === 'less') return `Count ${req.other.name}'s ${things} first. One less stops one before them.`
  if (req.type === 'same') return `Count ${req.other.name}'s ${things}. Then fill ${who}'s frame up to the same.`
  if (req.type === 'dots') return 'Count the dots on each balloon, one by one.'
  if (req.type === 'most') return `Count each colour in ${who}'s bunch. Which number is biggest?`
  if (req.type === 'mix') return `${req.recipe} One of each for every ${req.target} balloon.`
  if (req.type === 'add') return `Start at ${req.parts[0]}, then count on ${req.parts[1]} more.`
  if (req.type === 'pair') return `Count the ${req.colours[0]} ones, then the ${req.colours[1]} ones.`
  return 'One balloon for each slot, then tap Give.'
}

/** Said only if the child is still stuck after the hint: the answer, so nobody is left stuck. */
function answerFor(req) {
  if (req.type === 'more' || req.type === 'less') return `One ${req.type} than ${req.ref} is ${req.total}.`
  if (req.type === 'same') return `${req.has} and ${req.total} more make ${req.ref}.`
  if (req.type === 'most') return `${cap(req.colour)} is the most. Give ${req.total} ${req.colour}.`
  if (req.type === 'mix') return `${req.parts[0]} ${req.colours[0]} and ${req.parts[1]} ${req.colours[1]}.`
  if (req.type === 'add') return `${req.parts[0]} and ${req.parts[1]} more make ${req.parts[0] + req.parts[1]}.`
  if (req.type === 'dots') return `Look for balloons with ${req.dots} dots.`
  return null
}

// --- The basket ----------------------------------------------------------------------
// Most requests want one number of balloons. A two-colour basket ('pair') wants each colour right.

/** How many balloons of one colour are in the basket. */
const ofColour = (sky, colour) => sky.items.filter((item) => colourName(item.tint) === colour).length
/** For each part of the request, how many the basket holds (one part unless it is a two-colour basket). */
const basketParts = (sky) => (sky.req.colours ? sky.req.colours.map((c) => ofColour(sky, c)) : [sky.count])
const wanted = (req) => (req.colours ? req.parts : [req.total])
/** Balloons in the basket of a colour the request does not want (a guess in a which-has-most basket). */
const misfits = (sky) => (sky.req.colours ? sky.items.filter((item) => !sky.req.colours.includes(colourName(item.tint))) : [])
const basketRight = (sky) => basketParts(sky).every((n, g) => n === wanted(sky.req)[g]) && !misfits(sky).length
/** The colour (or true) that has too many, or a colour that does not belong, or null. */
function basketOver(sky) {
  const parts = basketParts(sky)
  const g = parts.findIndex((n, i) => n > wanted(sky.req)[i])
  if (g >= 0) return sky.req.colours?.[g] ?? true
  const stray = misfits(sky)[0]
  return stray ? colourName(stray.tint) : null
}
/** "4 red and 1 blue", or just "4": what the friend is handed. A which-has-most basket names the colours it holds. */
function basketWords(sky) {
  if (sky.req.type === 'most') {
    const names = [...new Set(sky.items.map((item) => colourName(item.tint)))]
    return names.map((c) => `${sky.items.filter((item) => colourName(item.tint) === c).length} ${c}`).join(' and ')
  }
  if (sky.req.colours) return basketParts(sky).map((n, g) => `${n} ${sky.req.colours[g]}`).join(' and ')
  // Counting on: the basket is what is added to the friend's own group.
  return sky.req.type === 'add' && sky.req.has ? `${sky.count} more` : String(sky.count)
}

/** The outline colour of a waiting shape slot. */
const SHAPE_TINT = { heart: '#ff6b9d', bunny: '#9b5de5' }

/**
 * A slot for one balloon of the request: its colour or shape, numbered once filled in tier 1. A filled one can be let go,
 * except one the friend already held (index null).
 */
function skySlot(req, n, item, index = n - 1) {
  const slot = picture(item ? (item.picture ?? req.colour) : (req.colour ?? req.picture), !!item)
  slot.classList.add('sky-slot')
  if (item?.color) {
    slot.classList.add('colour-balloon')
    slot.style.setProperty('--c', item.color)
  }
  // A waiting heart or bunny slot: a soft silhouette of the shape inside a dashed outline in its colour, like a colour slot.
  if (!item && req.kind) {
    slot.classList.add('shape-wait')
    slot.style.setProperty('--c', SHAPE_TINT[req.kind])
  }
  if (item) {
    if (req.type === 'dots' || viewTier() === 1) {
      const num = document.createElement('b')
      num.className = 'sky-num'
      num.textContent = req.type === 'dots' ? req.dots : n
      slot.append(num)
    }
    if (index == null) slot.classList.add('own')
    else {
      slot.dataset.i = index
      if (index === game.sky.items.length - 1) slot.classList.add('new')
    }
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

/** A balloon a friend already holds, drawn in a frame: its colour, or a heart in Hearts for friends. */
const heldLook = (req) => (req.picture ? { picture: req.picture } : { color: SKY_COLOURS[req.colour] })

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
  el.replaceChildren(...text.split(new RegExp(`\\b(${colours.join('|')})\\b`, 'i')).map((part) => {
    const name = part.toLowerCase()
    if (!colours.includes(name)) return part
    const word = Object.assign(document.createElement('span'), { className: 'sky-word', textContent: part })
    word.style.setProperty('--c', WORD_COLOURS[name])
    return word
  }))
}

function renderSky() {
  const card = $('sky')
  const { req, count, done, items } = game.sky
  const tier = viewTier()
  card.classList.toggle('done', done)
  card.classList.toggle('over', !!game.sky.over && !done)
  card.classList.toggle('tier2', tier === 2)
  card.classList.toggle('tier3', tier === 3)
  $('sky-friend').textContent = req.friend.face
  showStep()
  const caption = done ? req.named : (req.caption ?? (req.ref ? req.want : req.say))
  // A mix not named in its request keeps its two colours out of colour until it is done.
  const inColour = req.type === 'most' ? req.bunchColours : req.type === 'mix' ? (req.told || done ? [...req.colours, req.target] : [req.target]) : (req.colours ?? (req.colour ? [req.colour] : []))
  colourCaption($('sky-caption'), caption, inColour)
  card.setAttribute('aria-label', `${done ? req.named : req.say} ${count} in the basket.`)
  // Every basket is handed over by the child.
  const give = $('give')
  give.hidden = done
  give.disabled = done
  // Tier 1 shows when the basket is full with a steady glow; tiers 2 and 3 leave that to the child's counting.
  give.classList.toggle('full', tier === 1 && basketRight(game.sky) && !done)
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
    ref.append(face, ...(req.has ? tenFrames(Array.from({ length: req.ref }, () => frameCell(heldLook(req)))) : [rowsOfFive(Array.from({ length: req.ref }, () => picture(req.picture ?? req.colour)))]))
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
    appendExtra(slots, req, items, req.total)
    placeSun()
    return
  }
  if (req.type === 'most') {
    // The friend's own bunch, jumbled so each colour has to be found and counted, then plain slots for the few more:
    // a guess goes in like any balloon and is only found out at the hand-over.
    // Softened for a stuck child, the bunch is sorted into one row per colour, so the longest row shows the most.
    const bunch = Object.assign(document.createElement('span'), { className: `sky-bunch${tier === 1 ? ' sorted' : req.bunchColours.length > 2 ? ' four' : ''}` })
    const ball = (hex) => {
      const b = picture('red', true)
      b.style.setProperty('--c', hex)
      return b
    }
    if (tier === 1) {
      for (const c of req.bunchColours) {
        const row = Object.assign(document.createElement('span'), { className: 'sky-row' })
        row.append(...req.held.filter((hex) => hex === SKY_COLOURS[c]).map(ball))
        bunch.append(row)
      }
    } else bunch.append(...req.held.map(ball))
    const given = []
    for (let i = 0; i < req.total; i++) given.push(items[i] ? skySlot(req, i + 1, items[i], i) : blankSlot())
    slots.append(bunch, Object.assign(document.createElement('span'), { className: 'sky-plus', textContent: '+' }), rowsOfFive(given))
    appendExtra(slots, req, items, req.total)
    placeSun()
    return
  }
  if (req.type === 'mix') {
    // A bowl for each balloon to mix: one of each colour goes in, and the mixed balloon appears beside it.
    // Tier 2 (and a mix named this visit) tints the empty halves; otherwise they wait blank.
    const [a, b] = req.colours
    const ofEach = req.colours.map((c) => items.map((item, i) => ({ item, i })).filter(({ item }) => colourName(item.tint) === c))
    const bowls = []
    for (let k = 0; k < req.parts[0]; k++) {
      const bowl = Object.assign(document.createElement('span'), { className: 'sky-mix' })
      ;[a, b].forEach((c, g) => {
        const got = ofEach[g][k]
        bowl.append(got ? skySlot({ ...req, colour: c }, k + 1, got.item, got.i) : req.told ? skySlot({ ...req, colour: c }, k + 1) : blankSlot())
      })
      const mixed = !!(ofEach[0][k] && ofEach[1][k])
      const made = picture(req.target, mixed)
      made.classList.add('sky-made')
      // The moment a bowl gets its second colour, the new balloon starts as the two colours side by side and blends
      // into the mixed one (about a second), so "red and blue make purple" is seen as well as heard. Once per bowl.
      game.sky.blended ??= new Set()
      if (!mixed) game.sky.blended.delete(k)
      else if (!game.sky.blended.has(k)) {
        game.sky.blended.add(k)
        made.classList.add('mixing')
        made.style.setProperty('--a', HEX[a])
        made.style.setProperty('--b', HEX[b])
      }
      bowl.append(Object.assign(document.createElement('span'), { className: 'sky-arrow', textContent: '→' }), made)
      bowls.push(bowl)
    }
    const grid = Object.assign(document.createElement('span'), { className: 'sky-bowls' })
    grid.append(...bowls)
    slots.append(grid)
    // More of one colour than bowls: they wait outside, to be let go.
    const extra = ofEach.flatMap((list) => list.slice(req.parts[0]))
    if (extra.length) {
      const row = rowsOfFive(extra.map(({ item, i }, k) => skySlot({ ...req, colour: colourName(item.tint) }, req.parts[0] + k + 1, item, i)))
      row.classList.add('sky-extra')
      slots.append(row)
    }
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
    const own = Array.from({ length: req.has ?? 0 }, () => frameCell(heldLook(req), 'own'))
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
  // Tiers 1 and 2: a slot for each balloon asked for; an adding request shows its two groups apart. Counting on, the
  // first group is the friend's own, already filled, and the basket's balloons number on from it (4, 5 after 3).
  const has = req.type === 'add' ? (req.has ?? 0) : 0
  let n = 0
  req.parts.forEach((part, g) => {
    if (g) slots.append(Object.assign(document.createElement('span'), { className: 'sky-plus', textContent: '+' }))
    const group = []
    for (let i = 0; i < part; i++, n++) group.push(n < has ? skySlot(req, n + 1, heldLook(req), null) : skySlot(req, n + 1, items[n - has], n - has))
    const row = rowsOfFive(group)
    if (!g && has) row.classList.add('own') // the friend's own group, on the soft ground their ten-frame cells use
    slots.append(row)
  })
  // Balloons past the number wait outside the slots, until the child lets them go.
  if (count > req.total) {
    const extra = rowsOfFive(items.slice(req.total).map((item, i) => skySlot(req, has + req.total + i + 1, item, req.total + i)))
    extra.classList.add('sky-extra')
    slots.append(extra)
  }
  placeSun()
}

/**
 * The tier as a small plant under the friend, for a grown-up to see the game adapt: a sprout (numbered slots),
 * a leafy stem (plain slots), a tree (ten-frames). When the tier moves up or down it changes once, softly, with no words.
 */
const STEPS = { 1: ['🌱', 'Numbered slots'], 2: ['🌿', 'Plain slots'], 3: ['🌳', 'Ten-frames'] }
function showStep() {
  const el = $('sky-step')
  const was = el.dataset.tier
  if (was === String(game.tier)) return
  el.dataset.tier = game.tier
  el.textContent = STEPS[game.tier][0]
  el.title = STEPS[game.tier][1]
  if (!was) return
  el.classList.remove('moved')
  void el.offsetWidth
  el.classList.add('moved')
}

/** An empty slot that gives nothing away: no colour, no number. */
function blankSlot() {
  const slot = picture('blue', false)
  slot.classList.add('sky-slot', 'blank')
  slot.style.setProperty('--c', '#b9b0cc')
  return slot
}

/** Balloons past the number wait outside the slots, until the child lets them go. */
function appendExtra(slots, req, items, from) {
  if (items.length <= from) return
  const extra = rowsOfFive(items.slice(from).map((item, k) => skySlot({ ...req, colour: colourName(item.tint) ?? req.colour }, from + k + 1, item, from + k)))
  extra.classList.add('sky-extra')
  slots.append(extra)
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
      if (sky.slips === 3 || sky.slips === 6) ease()
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
  // A basket holds a few past the number asked for (per colour in a two-colour basket, and a few guesses in a
  // which-has-most basket); more just pop for fun.
  const g = req.colours ? req.colours.indexOf(colourName(b.color)) : 0
  if (g < 0 ? misfits(sky).length >= SPARE : basketParts(sky)[g] >= wanted(req)[g] + SPARE) return false
  sky.run = 0
  sky.guide = false
  sky.idle = 0
  sky.count += 1
  // tint: the balloon's own colour, kept for sorting and for the bunch the friend carries to the picnic.
  sky.items.push({ color: req.picture ? null : b.color, tint: b.color, picture: req.picture, kind: b.kindName })
  audio.count(Math.min(sky.count, 15))
  if (viewTier() === 1 && req.type === 'mix') {
    // A mixing basket counts the new balloons made (a bowl with both colours), not the colours put in: "1", "2. That's 2!".
    const made = Math.min(req.parts[0], ...req.colours.map((c) => ofColour(sky, c)))
    if (made > sky.made) {
      sky.made = made
      if (made === req.parts[0]) voice.say(`${made} ${req.target}. That's ${made}!`, { interrupt: false })
      else voice.count(made, { aloud: 10, interrupt: false })
    }
  } else if (viewTier() === 1 && req.type !== 'most' && sky.count > sky.said && sky.count <= req.total) {
    // Tier 1 is where counting is the lesson: it hears every number up to the one asked for (at most ten), each once
    // per sky (refilling after letting one go is quiet). The number asked for lands with a stop ("7. That's 7!");
    // past it the count goes quiet, so stopping is heard. A which-has-most basket is not counted aloud: a guess would be.
    // Counting on (tiers 1–2 adding) starts from the friend's own group: "4, 5. That's 5!".
    sky.said = sky.count
    const n = sky.count + (req.type === 'add' ? (req.has ?? 0) : 0)
    if (sky.count === req.total) voice.say(`${n}. That's ${n}!`, { interrupt: false })
    else voice.count(n, { aloud: 10, interrupt: false })
  }
  if (sky.count === req.total) sky.full = 0
  // Once the basket is just right, two or three more matching balloons drift up: stopping is the child's choice, not luck.
  if (!sky.tempted && basketRight(sky)) {
    sky.tempted = true
    sky.tempt = 2 + (Math.random() < 0.5)
    game.spawnIn = Math.min(game.spawnIn, 0.6)
  }
  renderSky()
  return true
}

/** The child hands the basket over: just right, too few (the friend asks again) or too many (the child lets some go). */
function give() {
  const sky = game.sky
  if (!counting() || !sky || sky.done) return
  audio.click()
  const { req, count } = sky
  // Resting after a hand-over that was not right: Give is dimmed and taps get the click and a tilt, never
  // more words, so tapping it again and again is slower than looking at the basket and counting.
  if (performance.now() < sky.restUntil) return friendFace('ask')
  if (basketRight(sky)) return finishSky()
  friendFace('ask')
  // An empty basket is not a counting mistake: the friend tilts their head, and says again what they want
  // only if they have not just said it (so a quick tap never cuts the request off to start it over).
  if (!count) return repeatGoal(req.want)
  sky.slips += 1
  const rest = giveRest(sky.slips)
  sky.restUntil = performance.now() + rest
  const btn = $('give')
  btn.classList.add('rest')
  later(() => btn.classList.remove('rest'), rest)
  const over = basketOver(sky)
  sky.over = !!over
  $('sky').classList.toggle('over', sky.over)
  // A second hand-over that is not right softens the sky (from tier 2), with its hint instead of a reminder; in tier 1
  // (already as soft as it gets) a third brings the strategy hint; a fourth, still not right, brings the answer.
  const stuck = game.tier > 1 ? sky.slips >= 2 && !sky.eased : sky.slips >= 3 && !sky.hinted
  if (stuck || (sky.slips >= 4 && sky.hinted && !sky.answered)) {
    if (over) voice.sayOnce('Tap a balloon in the basket to let it go.')
    return ease()
  }
  // The reminder is spoken only when the basket has changed since the last one, and at most twice a sky.
  // It names only what was handed over: the goal stays on the card, and tapping the friend says it again.
  // The first over-full hand-over is always named, even after two early ones: too many is the decision taught here.
  const words = basketWords(sky)
  const firstOver = !!over && !sky.overTold
  if (words === sky.told || (sky.reminders >= 2 && !firstOver)) return
  if (over) sky.overTold = true
  sky.told = words
  sky.reminders += 1
  sky.asked = performance.now()
  if (req.type === 'most' && misfits(sky).length) {
    // A guess at the colour: the friend says only that this one is not the most, so the child counts again.
    voice.sayNow(`That's ${words}. ${req.friend.name} has fewer ${colourName(misfits(sky)[0].tint)}. Count each colour again.`)
    voice.sayOnce('Tap a balloon in the basket to let it go.')
  } else if (over) {
    voice.sayNow(`That's ${words}. Too many${over === true ? '' : ` ${over}`}!`)
    voice.sayOnce('Tap a balloon in the basket to let it go.')
  } else voice.sayNow(`That's ${words}.`)
}

/** Balloons let go in one sky before the friend offers the strategy hint (a careful fix of an over-full basket is fewer). */
const CHURN = 5
/** The child taps a balloon in the basket: it is let go and floats back up into the sky. */
function release(i, el) {
  const sky = game.sky
  if (!counting() || !sky || sky.done || !sky.items[i]) return
  const [item] = sky.items.splice(i, 1)
  sky.count -= 1
  sky.fixes += 1
  sky.idle = 0
  if (!basketOver(sky)) sky.over = false
  audio.release()
  $('sky').classList.toggle('over', sky.over)
  const r = (el ?? $('give')).getBoundingClientRect()
  floatAway([item], r.left + r.width / 2, r.bottom + 30)
  renderSky()
  // Popping in and letting go again and again, never handing over, is being stuck too (it keeps the idle clock at zero):
  // once the basket is no longer over-full, the friend offers the way to work it out, once.
  if (sky.fixes >= CHURN && !sky.hinted && !basketOver(sky)) ease()
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
  // The whole bunch the friend carries away (any they already held too), so the home line tells the real size.
  game.biggest = Math.max(game.biggest, bunchOf(sky).length)
  // A softened sky has already counted as a bumpy one.
  if (!sky.eased) adapt(sky.slips === 0 && sky.fixes === 0 && sky.strays <= 2)
  game.finale = game.skies >= (adventure.option.visit ?? Infinity)
  // "Just right!" only for an exact basket, first time, with nothing let go; a child who saw too many and let some go
  // before handing over hears that fixing it was the good part; a basket handed over more than once, a plain thank you.
  const thanks = sky.slips === 0 && sky.fixes === 0 ? 'Just right!' : sky.slips === 0 ? 'You fixed it! Thank you!' : 'Thank you!'
  voice.say(`${sky.req.named} ${thanks}`)
  const { w, h } = halfSize(0)
  effects.drift(w, h)
  later(() => audio.chord(), 500)
  // Two treats to choose from for the picnic; the next request waits for the choice (or a calm while without one).
  const bunch = bunchOf(sky)
  game.treats = pickTreats(bunch)
  game.skyWait = game.treats.counts ? 14 : 9
  if (game.treats.counts) voice.sayOnce('One treat for each balloon!')
  renderSky()
  toPicnic(sky, bunch)
}

// --- Picnic treats ---------------------------------------------------------------------
// After each hand-over the friend offers two treats and the child chooses one to bring to the picnic.
// In tier 1 it is the child's own small creation: no right answer, nothing counted. From tier 2 the treats come on
// plates, "one treat for each balloon": one plate has as many as the friend's bunch (shown beside them, in rows of
// five), the other a little more or less, so the choice is a one-to-one match. The chosen treat stays on the home screen.

const TREATS = ['🍓', '🧁', '🍎', '🍉', '🍪', '🥕', '🍌', '🫐', '🌼', '🪁', '🍩', '🧀', '🥨', '🍐']

/** The balloons the friend carries away: any they already held, then the basket (a mix: the colour it made). */
function bunchOf(sky) {
  const { req, items } = sky
  if (req.type === 'mix') return Array(req.parts[0]).fill(HEX[req.target])
  const held = req.held ?? Array.from({ length: req.has ?? 0 }, () => SKY_COLOURS[req.colour ?? 'pink'])
  return [...held, ...items.map((item) => item.tint)]
}

/** Two treats, and from tier 2 a count for each plate: one matching the bunch, one 2 off (tier 2) or 1 off (tier 3). */
function pickTreats(bunch) {
  const used = new Set(game.picnic.map((v) => v.treat))
  const fresh = TREATS.filter((t) => !used.has(t))
  const from = fresh.length >= 2 ? fresh : TREATS
  const a = from[(Math.random() * from.length) | 0]
  const rest = from.filter((t) => t !== a)
  const list = [a, rest[(Math.random() * rest.length) | 0]]
  // A softened sky keeps the plain treat choice: the child was just helped, so no new counting challenge follows.
  const tier = viewTier()
  const want = tier > 1 && bunch.length <= 10 ? bunch.length : 0
  if (!want) return { list, counts: null, tried: [] }
  const step = tier === 2 ? 2 : 1
  const off = want - step >= 1 && Math.random() < 0.5 ? want - step : want + step
  return { list, counts: Math.random() < 0.5 ? [want, off] : [off, want], want, tried: [] }
}

/** A row of small things in rows of five, like the friend's bunch beside it. */
function fives(things, className) {
  const box = Object.assign(document.createElement('span'), { className })
  for (let r = 0; r < things.length; r += 5) {
    const row = Object.assign(document.createElement('span'), { className: 'fives-row' })
    row.append(...things.slice(r, r + 5))
    box.append(row)
  }
  return box
}

function treatChoice() {
  const row = Object.assign(document.createElement('span'), { className: 'sky-treats' })
  const { list, counts, tried } = game.treats
  if (counts) {
    // The friend's bunch, to count against each plate.
    const balls = bunchOf(game.sky).map((hex) => {
      const ball = Object.assign(document.createElement('i'), { className: 'treat-ball' })
      ball.style.setProperty('--c', hex)
      return ball
    })
    row.append(fives(balls, 'sky-treat-bunch'))
  } else row.append(Object.assign(document.createElement('span'), { className: 'sky-treats-basket', textContent: '🧺' }))
  const chosen = game.sky.visitor?.treat
  list.forEach((treat, i) => {
    const n = counts?.[i]
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: `sky-treat${n ? ' plate' : ''}${treat === chosen ? ' chosen' : ''}` })
    if (n) btn.append(fives(Array.from({ length: n }, () => Object.assign(document.createElement('span'), { textContent: treat })), 'plate-treats'))
    else btn.textContent = treat
    btn.dataset.treat = i
    btn.disabled = (!!chosen && treat !== chosen) || tried.includes(i)
    btn.setAttribute('aria-label', n ? `A plate of ${n} ${treat}` : `Bring ${treat} to the picnic`)
    row.append(btn)
  })
  return row
}

function pickTreat(i) {
  const sky = game.sky
  const t = game.treats
  i = +i
  if (!counting() || !sky?.done || !sky.visitor || sky.visitor.treat || !t?.list[i] || t.tried.includes(i)) return
  if (t.counts && t.counts[i] !== t.want) {
    // Not one for each balloon: that plate is set aside with a small head shake, and the child counts again.
    t.tried.push(i)
    friendFace('no')
    audio.boop()
    voice.sayOnce('Count the balloons, then the treats on each plate.')
    game.skyWait = Math.max(game.skyWait, 8)
    return renderSky()
  }
  const treat = t.list[i]
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

/**
 * A friend with their bunch of balloons: one small balloon for each, in rows of five. `most` (the home screen) draws
 * at most two rows and a small "+n", so a big bunch never runs into its neighbour.
 */
function picnicFriend({ face, tints, treat }, most = Infinity) {
  const friend = Object.assign(document.createElement('span'), { className: 'picnic-friend' })
  const bunch = Object.assign(document.createElement('span'), { className: 'picnic-bunch' })
  if (tints.length > most) bunch.append(Object.assign(document.createElement('b'), { className: 'picnic-more', textContent: `+${tints.length - most}` }))
  for (const tint of tints.slice(0, most)) {
    const ball = document.createElement('i')
    ball.style.setProperty('--c', tint)
    bunch.append(ball)
  }
  friend.append(bunch, Object.assign(document.createElement('span'), { className: 'picnic-face', textContent: face }))
  if (treat) friend.append(treatEl(treat))
  friend.setAttribute('aria-label', `${tints.length} balloons`)
  return friend
}

function toPicnic(sky, tints) {
  const { req } = sky
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
  row.replaceChildren(...game.picnic.map((visitor) => picnicFriend(visitor, 10)))
  row.classList.toggle('hidden', !game.picnic.length)
  $('picnic').replaceChildren()
  $('picnic').hidden = true
  for (const flyer of document.querySelectorAll('.picnic-flyer')) flyer.remove()
}

function nextSky() {
  game.level += 1
  game.reach += 1
  game.treats = null
  const lv = level(game.level)
  // A new balloon friend is sent up first, without a card: the screen stays about the friend's request.
  if (lv.intro && game.level <= LEVELS.length) game.forced = lv.show
  newRequest()
}

// --- Dotted balloons -----------------------------------------------------------------

const dotFaces = new Map()
/** How many different scatters each number has: enough that a child counts rather than recognising a picture. */
const DOT_VARIANTS = 4
/** A face of n scattered dots in one of its arrangements, drawn once and shared by every balloon that carries it. */
function dotFace(n, variant) {
  const key = `${n}:${variant}`
  let material = dotFaces.get(key)
  if (!material) {
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
    const g = c.getContext('2d')
    const r = n > 6 ? 22 : 28
    g.lineWidth = 7
    g.fillStyle = '#fffdf0'
    g.strokeStyle = '#4a2f86'
    for (const [x, y] of scatterLayout(n, variant)) {
      g.beginPath()
      g.arc(x * 256, y * 256, r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    // Drawn over its own balloon from the balloon's middle: a face out in front would slide off it in perspective.
    material = new THREE.SpriteMaterial({ map, toneMapped: false, depthTest: false })
    dotFaces.set(key, material)
  }
  return material
}

/** Gives a plain round balloon a face of n dots. */
function addDots(b, n) {
  const shape = balloons.shapes[b.kind.model] ?? { x: 0, y: 0, rx: 1, ry: 1.1 }
  const face = new THREE.Sprite(dotFace(n, (Math.random() * DOT_VARIANTS) | 0))
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
 * The everyday colours of the sky right now. While a friend wants a mixed colour, there is no balloon of that colour
 * (it has to be mixed) and yellow joins in, so the two colours that make it are found among others.
 */
function skyPalette() {
  const req = game.sky && !game.sky.done ? game.sky.req : null
  return req?.type === 'mix' ? [...SKY_PALETTE.filter((c) => c !== HEX[req.target]), YELLOW] : SKY_PALETTE
}

/**
 * How likely a new balloon is to match the request: two in five, half in tier 3, and more while a big
 * number still has far to go, so a teen request never leaves a child waiting long for matches.
 */
function matchChance(sky) {
  // The youngest's first friends: half the new balloons match, so the next one is never far away.
  if (game.tier === 1 && game.level <= 3) return 0.5
  if (game.tier < 3) return 0.4
  return sky.req.total - sky.count > 6 ? 0.65 : 0.5
}

/** Seconds a sky may go without sending a matching balloon before one is sent anyway: shorter for the youngest. */
const dryLimit = () => (game.tier === 1 ? 6 : 8)

/** The colour a matching balloon should be: the request's, or in a two-colour basket the one still short. */
function skyColourNeeded(sky) {
  const { req } = sky
  if (!req.colours) return req.colour
  // Which-has-most: any of the friend's colours until the basket is right, so the child has to choose (the right
  // one half the time, so a child who has worked it out is not kept waiting for it).
  if (req.bunchColours && !basketRight(sky)) return Math.random() < 0.5 ? req.colour : any(req.bunchColours)
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
    // Dotted balloons: a third carry the number asked for (nearly half while two or more are still to find, so the
    // wait stays short), a third a near number, the rest none.
    // Once the basket is right, the next few are the very ones asked for: stopping is the child's choice.
    const exact = req.total - game.sky.count >= 2 ? 0.45 : 0.33
    const r = game.sky.tempt > 0 ? (game.sky.tempt--, 0) : game.sky.dry > dryLimit() ? 0 : Math.random()
    if (r < exact) game.sky.dry = 0
    if (r < exact + 0.33) {
      kindName = 'round'
      const most = game.tier === 3 ? 9 : 7
      const near = [-2, -1, 1, 2].map((d) => req.dots + d).filter((n) => n >= 1 && n <= most)
      dots = r < exact ? req.dots : near[(Math.random() * near.length) | 0]
    }
  } else if (req && !opts.color && kindName !== game.forced && (game.sky.tempt > 0 ? game.sky.tempt-- : game.sky.dry > dryLimit() || Math.random() < matchChance(game.sky))) {
    // (A sky that has sent no matching balloon for six to eight seconds sends one now: no long waits for the next green.)
    game.sky.dry = 0
    if (req.kind) kindName = req.kind
    else {
      // A matching balloon is a plain or smiley one in the colour asked for.
      if (!['round', 'smile'].includes(kindName)) kindName = Math.random() < 0.6 ? 'round' : 'smile'
      opts = { ...opts, color: HEX[skyColourNeeded(game.sky)] }
    }
  }
  // Free popping: a wished-for balloon comes along now and then (and surely within about eight seconds).
  const wish = !sky && game.state === 'play' && game.party <= 0 && game.wish && !game.wish.met ? game.wish : null
  if (wish && !opts.color && kindName !== game.forced && (wish.dry > 8 || Math.random() < 0.25)) {
    wish.dry = 0
    if (['heart', 'gold', 'bunny'].includes(wish.key)) kindName = wish.key
    else {
      kindName = Math.random() < 0.6 ? 'round' : 'smile'
      opts = { ...opts, color: HEX[wish.key] }
    }
  }
  // Teal is never asked for and looks blue or green to young children, so the counting sky leaves it out,
  // between requests too: a balloon still floating when the next friend asks must read as one colour.
  if (sky && !opts.color) {
    if (KINDS[kindName].colors === COLORS) opts = { ...opts, color: adventure.option.focus === 'red' && Math.random() < 0.6 ? any(NEAR_RED) : any(skyPalette()) }
    else if (kindName === 'heart') opts = { ...opts, color: any(SKY_HEARTS.filter((c) => skyPalette().includes(c))) }
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
    // Never more than a comfortable handful on screen at once: a couple more while a full basket's temptation drifts up,
    // or while a sky has had no matching balloon for a while (that one is sent even on a full screen).
    const owed = counting() && game.sky && !game.sky.done && (game.sky.tempt > 0 || game.sky.dry > dryLimit())
    if (balloons.list.length >= (owed ? 11 : 9)) return
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
  game.popped = true
  if (!chain) adventure.event(b)
  if (!sky && !chain) wishPop(b)

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
      // The rainbow's babies are the sky's colours: in a mixing sky, yellow and the colours that make the new one.
      const m = balloons.make('mini', { color: (sky ? skyPalette() : COLORS)[i], scale: balloonScale() })
      const a = (i / 6) * Math.PI * 2
      m.group.position.copy(pos)
      m.vx = Math.cos(a) * 6
      m.vy = Math.sin(a) * 4
      m.speed = 0.7 + Math.random() * 0.3
    }
  }

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
  } else showIntro('🎈', 'More balloons!', 'Here they come')
  updateHud()
}

// --- Free popping's wishes ------------------------------------------------------------------
// Free popping stays free: every balloon pops and nothing is counted. Now and then one friend would like one kind of
// balloon (a heart, a bunny, a crowned one, or a colour), shown as a picture and said once. Finding it among the
// others is the youngest's first look-before-you-tap; the wish waits patiently, with no timer, until it is found.

/** Seconds before the first wish of a visit, and between a wish found and the next one. */
const WISH_FIRST = 10
const WISH_AFTER = 12
/** Colours a wish can name: plain or smiley balloons (and hearts) of that colour count. */
const WISH_COLOURS = ['red', 'blue', 'green', 'orange', 'purple']

function wishFor(lv) {
  const kinds = [...(lv >= 2 ? ['heart'] : []), ...(lv >= 3 ? ['gold'] : []), ...(lv >= 4 ? ['bunny'] : [])]
  const options = [...kinds, ...WISH_COLOURS].filter((k) => k !== game.wish?.key)
  const key = options[(Math.random() * options.length) | 0]
  const friend = any(FRIENDS.filter((f) => f.face !== game.wish?.friend.face))
  const kind = { heart: ['💖', 'a heart', 'A heart'], gold: ['👑', 'a balloon with a crown', 'A crown balloon'], bunny: ['🐰', 'a bunny balloon', 'A bunny'] }[key]
  const accept = kind ? (b) => b.kindName === key : (b) => ['round', 'smile', 'mini'].includes(b.kindName) && colourName(b.color) === key
  const an = key === 'orange' ? 'an' : 'a'
  const [pic, words, named] = kind ?? [key, `${an} ${key} balloon`, `${cap(an)} ${key} balloon`]
  return { key, friend, pic, say: `${friend.name} would like ${words}.`, named, accept, met: false, up: 0, dry: 0, repeated: false }
}

function showWish() {
  const wish = game.wish
  const el = $('wish')
  el.hidden = !wish
  if (!wish) return
  el.classList.toggle('met', wish.met)
  el.classList.remove('leave')
  $('wish-friend').textContent = wish.friend.face
  $('wish-pic').replaceChildren(picture(wish.pic, true))
  el.setAttribute('aria-label', wish.met ? `${wish.named}! Thank you!` : wish.say)
}

function newWish() {
  game.wish = wishFor(game.level)
  showWish()
  voice.say(game.wish.say)
}

/** Free popping: a popped balloon that is the one wished for. */
function wishPop(b) {
  const wish = game.wish
  if (!wish || wish.met || b.leaving || !wish.accept(b)) return
  wish.met = true
  game.wishes += 1
  game.wishIn = WISH_AFTER
  showWish()
  voice.say(`${wish.named}! Thank you!`)
  later(() => audio.chord(), 400)
  later(() => $('wish').classList.add('leave'), 3200)
  later(() => {
    if (game.wish === wish) game.wish = null
    showWish()
  }, 4000)
}

function wishTick(dt) {
  const wish = game.wish
  if (!wish) {
    if (game.party <= 0 && (game.wishIn -= dt) <= 0) newWish()
    return
  }
  if (!wish.met) {
    wish.up += dt
    wish.dry += dt
  }
}

// --- HUD & screens -----------------------------------------------------------------------

/** The balloon friends met so far in free popping: plain ones, then each new kind as it is introduced. */
const metPictures = () => ['🎈', ...LEVELS.slice(1, Math.min(game.level, LEVELS.length)).map((lv) => lv.intro[0])]

/**
 * Free popping keeps no tally and no level bar: a small strip shows the balloon friends met so far, and a new one
 * joins it when it is introduced. Nothing counts up, so there is nothing to chase.
 */
function updateHud() {
  const met = metPictures()
  const strip = $('met')
  if (strip.childElementCount === met.length) return
  strip.replaceChildren(...met.map((pic, i) => Object.assign(document.createElement('span'), { textContent: pic, className: i === met.length - 1 && i ? 'new' : '' })))
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
  // Free popping names the balloon friends met, not a number of pops. A counting sky starts its levels further on
  // (TIER_START), so it never shows that line: it names only the friends helped, or nothing.
  const met = metPictures()
  const helped = game.wishes ? ` and helped ${game.wishes} friend${game.wishes === 1 ? '' : 's'}` : ''
  let last = game.popped && !adventure.option.goal && !adventure.option.sky ? (met.length > 1 ? `You met ${met.join(' ')}${helped}` : `🎈 Lovely popping${helped}!`) : ''
  if (game.skies) {
    last = `🎈 You helped ${game.skies} friend${game.skies === 1 ? '' : 's'}, up to ${game.biggest} balloon${game.biggest === 1 ? '' : 's'}!`
    if (!finished) voice.say(`You helped ${game.skies} friend${game.skies === 1 ? '' : 's'}!`)
  }
  $('last').textContent = last
  $('last').classList.toggle('hidden', !last)
  showPicnic()
  $('sky').hidden = true
  game.sky = null
  game.wish = null
  showWish()
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
  Object.assign(game, { state: 'play', level: 1, popped: false, progress: 0, spawnIn: 0.4, pause: 0, party: 0, forced: null, sky: null, recent: [], skyWait: 0, skies: 0, biggest: 0, streak: 0, rough: 0, picnic: [], treats: null, finale: false, taught: [], bag: [], wish: null, wishIn: WISH_FIRST, wishes: 0 })
  showWish()
  showPicnic()
  // A returning child keeps their tier: plain slots start a little further on, ten-frames further still.
  Object.assign(game, loadTier())
  game.startTier = game.tier
  if (adventure.option.sky) game.level = TIER_START[game.tier - 1]
  game.reach = game.level
  show('play')
  const sky = counting()
  $('hud').classList.toggle('counting', sky)
  $('title-picnic').classList.add('hidden')
  $('sky').hidden = !sky
  if (sky) layPicnic(adventure.option.visit)
  delete $('sky-step').dataset.tier // the first card of a visit shows the tier without the change cue
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

/** Tapping the friend repeats what they want; otherwise they just tilt their head. */
function askAgain() {
  const sky = game.sky
  if (!counting() || !sky || sky.done) return
  friendFace('ask')
  repeatGoal(sky.req.type === 'dots' ? sky.req.say : sky.req.want)
}

/** Tapping the wishing friend says the wish once more (once per wish); otherwise nothing. */
function askWish() {
  const wish = game.wish
  if (!wish || wish.met || wish.repeated) return
  wish.repeated = true
  voice.sayNow(wish.say)
}
$('wish').addEventListener('pointerdown', (e) => {
  e.preventDefault()
  askWish()
})

/** How many times a sky's goal is said again (a friend tap or an empty Give); after that the card carries it. */
const REPEATS = 2
/** Says the goal again, at most every six seconds and REPEATS times a sky: more taps get only the head tilt. */
function repeatGoal(words) {
  const sky = game.sky
  if (performance.now() - sky.asked < 6000 || sky.repeats >= REPEATS) return
  sky.asked = performance.now()
  sky.repeats += 1
  voice.sayNow(words)
}
/**
 * 🏠 during a counting visit with a picnic under way asks for a second tap (the house waits, ringed, for 3 s), so a
 * stray tap from a small hand never ends the visit. Escape (a grown-up's key) still goes home at once.
 */
let homeArmed = 0
$('home').addEventListener('click', (e) => {
  e.stopPropagation()
  audio.click()
  const home = $('home')
  if (counting() && (game.skies || game.sky?.count) && !home.classList.contains('sure')) {
    home.classList.add('sure')
    clearTimeout(homeArmed)
    homeArmed = setTimeout(() => home.classList.remove('sure'), 3000)
    return
  }
  clearTimeout(homeArmed)
  home.classList.remove('sure')
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
  if (over?.closest('#wish')) return askWish()
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

/** A free-popping wish still waiting after twenty seconds: the finger shows one of the wished balloons. */
const longWish = () => (game.wish && !game.wish.met && game.wish.up > 20 ? game.wish : null)

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
    if (viewTier() === 1 && game.skies === 0 && basketRight(sky)) {
      const r = $('give').getBoundingClientRect()
      return pointAt(el, r.left + r.width / 2, r.top + r.height / 2)
    }
    // Tier 1 shows the first balloon to find; any tier but 3 brings the finger back after three misses in a row.
    if (!((game.tier === 1 && !game.firstPop) || sky.guide) || sky.count >= sky.req.total) return el.classList.add('hidden')
  } else if (!longWish() && (adventure.option.goal ? adventure.progress > 0 : game.firstPop)) return el.classList.add('hidden')
  // In a which-has-most sky the finger shows the colour there is most of; a wish waiting a long while, the wished balloon.
  const accept = counting() ? (x) => sky.req.accept(x) && (sky.req.type !== 'most' || colourName(x.color) === sky.req.colour) : longWish()?.accept ?? adventure.option.accept
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
      if (sky && !sky.done) sky.dry += dt
      // A basket left just right a while (tier 1) gets one gentle reminder per visit; never an over-full one.
      if (sky && !sky.done && viewTier() === 1 && basketRight(sky) && (sky.full += dt) > 12) {
        voice.sayOnce(`Is it just right? Tap Give to hand it to ${sky.req.friend.name}.`)
      }
      // Most of a minute with no change to the basket: the sky softens in place (see ease). A basket that is already
      // just right is a slow, correct child, not a stuck one: it never softens.
      if (sky && !sky.done && !basketRight(sky) && (sky.idle += dt) > 50) {
        sky.idle = 0
        ease()
      }
      if (game.skyWait > 0 && (game.skyWait -= dt) <= 0) {
        game.skyWait = 0
        if (counting()) game.finale ? endVisit() : nextSky()
      }
      // Free popping meets a new balloon friend on a slow clock (about half a minute), not after a number of pops,
      // so nothing is earned by tapping faster.
      if (!counting() && game.party <= 0 && game.pause <= 0 && (game.progress += dt) >= level(game.level).goal * FRIEND_SECONDS) levelUp()
      if (!counting()) wishTick(dt)
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
    // A golden or star balloon gives one small twinkle as it comes into view, then rises quietly: no glitter while counting.
    const low = -halfSize().h * 0.55
    for (const b of balloons.list) {
      if (b.twinkled || !(b.kind.gold || b.kind.power === 'star') || b.group.position.y < low) continue
      b.twinkled = true
      for (let i = 0; i < 3; i++) {
        twinkleAt.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2, 0.6).add(b.group.position)
        effects.sparkleAt(twinkleAt, '#fff3b0', 1)
      }
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
if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game, balloons, camera, newRequest, world }
