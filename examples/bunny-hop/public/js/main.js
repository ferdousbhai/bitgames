import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { BIOME_LENGTH, BIOMES, FLOWERS, HOME_X, OBSTACLE_NAMES, OBSTACLE_NOTES, biomeIndexAt } from './biomes.js'
import { Bunny } from './bunny.js'
import { BEAT, Course, ROW_STEP, speedAt } from './course.js'
import { Effects, Glints, Popups, Weather } from './effects.js'
import { Cue, carrotWords, foldPantry, groupOf, obstaclePictures, pantryWords, patternWords, renderGarden, renderPantry, repeatOf, showPantryTotal } from './learning.js'
import { loadModels } from './models.js'
import { createVoice } from './speech.js'
import { clamp, easeStep, pick, randInt } from './util.js'
import { World } from './world.js'

const $ = (id) => document.getElementById(id)

// --- Renderer and scene ---------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.type = THREE.PCFShadowMap
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.3
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700)

// Tablets that can't keep up lose shadows and resolution, not frame rate.
const quality = { level: 2, frames: 0, time: 0 }
function applyQuality() {
  renderer.setPixelRatio(quality.level === 2 ? Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 0.75)
  renderer.shadowMap.enabled = quality.level > 0
  resize()
}
function measureQuality(dt) {
  if (quality.level === 0 || game.state !== 'play') return
  quality.frames++
  quality.time += dt
  if (quality.time < 3) return
  const fps = quality.frames / quality.time
  quality.frames = quality.time = 0
  if (fps < 40) {
    quality.level--
    applyQuality()
  }
}

const view = { halfW: 8, dist: 14, lead: 0.45, follow: 0.3 }
function resize() {
  const aspect = innerWidth / innerHeight
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = aspect
  // Portrait phones get a wider lens so there's still room to see what's coming.
  camera.fov = aspect < 1 ? 58 : 42
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  // Show about this much path either side of the camera's centre: a phone held
  // upright gets less, so Pip stays big enough, and Pip sits further left.
  // Phones held sideways are short, so they show a bit less path to keep Pip big.
  const short = aspect < 1 ? 0 : clamp((560 - innerHeight) / 200, 0, 1)
  // Boxier screens held sideways (iPads, 4:3) are tall, so they show a bit less
  // path too: otherwise Pip is a small bunny under a big sky.
  const boxy = aspect < 1 ? 0 : clamp((1.7 - aspect) / 0.37, 0, 1)
  view.dist = clamp((aspect < 1 ? 4.5 : 9 - 2 * short - 1.7 * boxy) / (tan * aspect), 7, 24)
  // and short screens tilt up further with a high double hop, so Pip's ears stay clear of the score
  view.follow = 0.3 + 0.4 * short
  view.halfW = view.dist * tan * aspect
  view.lead = aspect < 1 ? 0.62 : 0.45 + short * 0.07
  // Aim so the path sits low on the screen (about 3/4 of the way down; about 4/5 on a
  // tall portrait screen): the sky above holds the HUD, the carrots hanging at hop height
  // and the high golden ones, with just room for the cue below and little empty grass.
  view.height = 3.0 + view.dist * (aspect < 1 ? 0.24 : 0.1) // portrait looks down a little more: hills, not empty sky
  const pathBelow = Math.atan(view.height / view.dist) - Math.atan((aspect < 1 ? 0.56 : 0.48) * tan)
  view.aim = view.height - view.dist * Math.tan(pathBelow)
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

// --- Game ---------------------------------------------------------------------------

const sound = new Sound()
const game = {
  state: 'loading',
  x: 0,
  speed: 0,
  slow: 1,
  score: 0,
  hops: 0,
  biome: 0,
  homeTime: 0,
  time: 0,
  shake: 0,
  golden: 0, // golden carrots found this trip
  rows: [], // the counted carrot rows Pip brought home, for the burrow pantry
  patterns: [], // the obstacle rhythms hopped this trip
  seg: null, // the row or rhythm being cued now
  segIndex: 0,
  cueHold: 0, // a finished row stays in its tray for a moment
  asking: null, // the rhythm paused on "What comes next?"
  gentle: false, // the 🐢 slow pace for the littlest hoppers
  goal: 0, // carrots Pip wants in the pantry for winter (what careful play brings home, less a slip)
  justRight: 0, // "Just right!" is said once a trip; after that a soft bell and the basket speak for themselves
  baskets: 0, // basket rows cued this trip: "Pip needs 4." is said for the first two (each number once), then the 🧺4 speaks
  aways: 0, // "4 of 6. 2 got away." is said twice a trip; after that the tray shows it
  spills: 0, // over-full baskets this trip (every carrot past full tips one back out)
  spokeSpill: -1e9, // when "Too heavy!" was last said: the next basket's number waits a little after it
  homeAsk: null, // the question at the burrow, while it waits for an answer
  flowers: { blue: 0, yellow: 0, pink: 0 }, // wild flowers picked this trip, to plant by Pip's door
  flowerHint: false, // the flower hint waits while a pattern is hopped, so it never talks over "What comes next?"
  gardenTimer: 0,
  // How the child is doing, remembered on this device (not a gate: it steps down as easily as up).
  // row 0: catch the whole row; 1: fill a basket (with empty places) from a longer row and let the
  // rest go by; 2: the basket shows only its number, so the child keeps count.
  // pattern 0: AB, AAB; 1: ABC, ABB with three answers; 2: growing patterns.
  // streak/right count good rows and right first answers; two in a row step up. wrong counts
  // patterns in a row whose first answer missed: two step down, even when the second go was right.
  tier: { row: 0, pattern: 0, streak: 0, slips: 0, right: 0, wrong: 0 },
  // the highest tiers this trip can climb to: the 🐢 pace stays a little-ones mode (tier 1), unless
  // the child was already further along when the trip began
  top: { row: 2, pattern: 2 },
}
try {
  game.gentle = localStorage.getItem('bunny-hop:gentle') === '1'
  const saved = JSON.parse(localStorage.getItem('bunny-hop:tier') ?? '{}')
  game.tier.row = clamp(Number(saved.row) || 0, 0, 2)
  game.tier.pattern = clamp(Number(saved.pattern) || 0, 0, 2)
} catch {}
function saveTier() {
  try {
    localStorage.setItem('bunny-hop:tier', JSON.stringify({ row: game.tier.row, pattern: game.tier.pattern }))
  } catch {}
}
/** The 🐢 pace: the same gentle 0.6 the learning missions use. */
const GENTLE = 0.6
// the menu camera's distance from Pip: upright, sideways tablets, sideways phones (close, to fill the short view)
const menuZ = () => (innerWidth < innerHeight ? 8.5 : innerHeight > 480 ? 8 : 5.6)
const CUE_LEAD = 16 // a row or rhythm is shown and named this far before it starts
const ASK_AT = 7 // Pip stops a few steps before the hidden obstacle, so its "?" is well in view
if (new URLSearchParams(location.search).has('debug')) window.game = game

// Optional learning missions, counted from the trip's own lessons: whole rows (or clean baskets),
// and patterns hopped with no bumps and no carrot left behind.
/** The mission's steps as tiles: the first `count` done, the next one lit. */
function stepRow(symbols, count = symbols.length) {
  const row = document.createElement('span')
  row.className = 'mission-steps'
  symbols.forEach((symbol, i) => {
    const icon = document.createElement('span')
    icon.className = `mission-step ${i < count ? 'done' : i === count ? 'next' : ''}`
    icon.textContent = symbol
    icon.setAttribute('aria-hidden', 'true')
    row.append(icon)
  })
  return row
}

function renderMissionProgress(goal, option, count) {
  if (!option.goal) return
  goal.replaceChildren()
  goal.setAttribute('aria-label', `${option.goal}. ${count} of ${option.target}.`)
  const caption = document.createElement('span')
  caption.className = 'mission-caption'
  caption.textContent = `${option.caption} · ${count} / ${option.target}`
  goal.append(caption, stepRow(option.steps, count))
}

/** A mission's steps, listed once: drawn on its button and in its progress tiles. */
const missionSteps = (steps) => ({ steps, pictures: stepRow(steps) })

// One voice for the game and its missions: words wait their turn, so a mission never swallows a count.
const voice = createVoice({ muted: sound.muted, rate: 0.82, pitch: 1 })

const adventure = createAdventure({
  id: 'bunny-hop',
  // The mission choice and the 🐢 pace share one row on the menu.
  place: (button) => $('menu-options').prepend(button),
  hud: $('hud'),
  voice,
  // Progress is in the card's tiles, never said as a bare number: "2" straight after a row counted
  // aloud ("1, 2, 3") would sound like the count going backwards. The choice and the reward are said.
  announce: (text, kind) => kind !== 'count' && voice.say(text, { interrupt: kind === 'choice' }),
  celebrate: () => {
    // One soft moment: what the child made, a gentle chord and a few slow petals; then the card steps aside.
    banner(adventure.option.banner, 2600)
    sound.chord()
    effects.confettiBurst(new THREE.Vector3(game.x, bunny.y + 1, 0), 10, true)
    setTimeout(() => ($('adventure-goal').hidden = true), 2600)
  },
  renderProgress: renderMissionProgress,
  options: [
    { label: 'Free hopping', caption: 'Free hop', pictures: stepRow(['🐰']) },
    { label: 'Three whole rows', caption: 'Whole rows', ...missionSteps(['🥕', '🥕', '🥕']), goal: 'Catch three rows with no carrot left behind', target: 3, accept: (kind) => kind === 'row', banner: '🥕 🥕 🥕 Three whole rows!', reward: 'Three whole rows! Pip did not leave one behind.' },
    { label: 'Patterns with no bumps', caption: 'Smooth patterns', ...missionSteps(['🎵', '🎵']), goal: 'Hop two patterns with no bumps', target: 2, accept: (kind) => kind === 'pattern', banner: '🎵 🎵 Two smooth patterns!', reward: 'Two patterns, and not one bump!' },
  ],
})

function renderPace() {
  $('pace').setAttribute('aria-pressed', String(game.gentle))
  $('pace').classList.toggle('gentle', game.gentle)
}
renderPace()
$('pace').onclick = () => {
  sound.unlock()
  sound.click()
  game.gentle = !game.gentle
  try {
    localStorage.setItem('bunny-hop:gentle', game.gentle ? '1' : '0')
  } catch {}
  renderPace()
  voice.sayNow(game.gentle ? 'Slow and gentle, like a tortoise.' : 'Hopping along like a bunny.')
}

let bunny, world, course, effects, weather, glints, popups, cue
const camPos = new THREE.Vector3(1.2, 2, 8)
const camLook = new THREE.Vector3(0.3, 1.1, 0)
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

async function init() {
  const { bunny: model, templates } = await loadModels((k) => ($('load-bar').style.width = `${10 + k * 90}%`))
  bunny = new Bunny(model)
  scene.add(bunny.root)
  // a soft round shadow keeps the bunny's height readable
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.03
  blob.renderOrder = 1
  scene.add(blob)
  game.blob = blob
  world = new World(scene, templates)
  world.camera = camera
  course = new Course(scene, templates)
  effects = new Effects(scene)
  weather = new Weather(scene)
  weather.setKind(BIOMES[0].weather)
  glints = new Glints(scene)
  popups = new Popups($('popups'), camera)
  // The obstacle pictures need a second WebGL context for a moment: draw them once the menu is up.
  cue = new Cue($('cue'), $('ask'), {})
  const idle = window.requestIdleCallback?.bind(window) ?? ((fn) => setTimeout(fn, 300))
  idle(() => (cue.pictures = obstaclePictures(templates)), { timeout: 2000 })
  if (window.game) Object.assign(window, { course, view, camera, bunny, cue, world })
  applyQuality()
  toMenu()
  requestAnimationFrame(frame)
}

function show(id) {
  for (const s of ['loading', 'menu', 'results']) $(s).classList.toggle('hidden', s !== id)
  $('hud').classList.toggle('hidden', id !== null)
  $('mute').classList.toggle('hidden', id === 'loading')
  $('home').classList.toggle('hidden', id === 'loading' || id === 'menu')
}

/** Every way back (🏠, Escape) comes here: the trip's words stop with it. */
function toMenu() {
  voice.hush()
  game.state = 'menu'
  game.homeAsk = null
  clearTimeout(game.gardenTimer)
  game.x = 0
  sound.music(false)
  clearTimeout(bannerTimer)
  $('banner').classList.remove('show')
  bunny.reset()
  world.reset()
  course.reset()
  resetLessons()
  game.biome = 0
  weather.setKind(BIOMES[0].weather)
  // Coming home from a trip: cut straight to the close-up of Pip, never pan back across the whole trip.
  camPos.set(game.x + 0.6, 1.6, menuZ())
  camLook.set(game.x + 0.1, 1.2, 0)
  // Calm pass: the menu no longer shows a best score to beat.
  show('menu')
}

function start() {
  voice.hush() // Play and Again start afresh: earlier words give way to the new trip
  adventure.begin()
  sound.unlock()
  sound.click()
  sound.music(true)
  game.state = 'play'
  game.speed = 0
  game.slow = 1
  game.score = 0
  game.hops = 0
  game.golden = 0
  game.time = 0
  game.rows = []
  game.patterns = []
  game.justRight = game.baskets = game.aways = game.spills = 0
  game.spokeSpill = -1e9
  game.homeAsk = null
  clearTimeout(game.gardenTimer)
  game.flowers = { blue: 0, yellow: 0, pink: 0 }
  game.flowerHint = false
  Object.assign(game.tier, { streak: 0, slips: 0, right: 0, wrong: 0 })
  game.top = game.gentle ? { row: Math.max(1, game.tier.row), pattern: Math.max(1, game.tier.pattern) } : { row: 2, pattern: 2 }
  voice.newRound()
  told.clear()
  // ?biome=2 starts further along the trip (for trying out the later places)
  const skip = clamp(Number(new URLSearchParams(location.search).get('biome')) || 0, 0, BIOMES.length - 1)
  game.x = skip ? skip * BIOME_LENGTH + 1 : 0
  game.biome = skip
  bunny.reset()
  world.reset(game.x)
  // the 🐢 pace keeps every row to one ten-frame row of 5 or fewer; a basket hopper gets room for spares
  course.reset(game.x, game.gentle ? 5 : Infinity, game.tier.row > 0)
  // one fork a trip, in the autumn wood (counting hoppers: the snow, with bigger numbers), at its
  // longer row, where a basket hopper chooses the patch that makes Pip's number. A trip that starts
  // on whole rows keeps it for the autumn or the snow, in case the child has stepped up by then
  // (if not, it is an ordinary row).
  {
    const rows = (b) => course.segments.filter((seg) => seg.kind === 'row' && seg.biome === b && seg.room >= seg.planned + 2 && seg.planned >= 4)
    const places = game.tier.row >= 2 ? [3, 2, 1] : game.tier.row ? [2, 1, 3] : [2, 3]
    const fork = places.map(rows).find((list) => list.length)?.reduce((a, b) => (b.planned > a.planned ? b : a))
    if (fork) fork.fork = true
  }
  // no scenery pumpkins or snowmen beside a pattern, where one could pass for the hidden obstacle
  world.quiet = (x) => course.segments.some((seg) => seg.kind === 'rhythm' && x > seg.x - 10 && x < seg.end + 6)
  // and no scenery flowers in the near grass beside a flower to pick, so the one on its mound stands out
  world.flowerQuiet = (x) => course.flowers.some((f) => Math.abs(f.x - x) < 10)
  // Pip's winter goal: what careful play brings home from the rows (each shaped for the tier careful
  // play will be on when it is cued) and the pattern carrots it is sure to munch, less two for a slip
  // on the way (every pattern but one a trip has three carrots or more, see `shapeRhythm`). Careful
  // looking and counting get there, on any tier; hopping at everything falls
  // short, as it sails over the carrots in the grass and over-full baskets tip carrots out.
  const patterns = course.segments.filter((seg) => seg.kind === 'rhythm').length
  game.goal = Math.max(5, course.careful(game.tier.row, game.top.row) + 3 * Math.max(0, patterns - 1) - 2)
  $('score-goal').textContent = `/${game.goal}`
  resetLessons()
  // swoop out from a close-up of Pip (and never pan across the whole trip)
  camPos.set(game.x + 0.6, 1.6, 6.5)
  camLook.set(game.x + 0.1, 1.1, 0)
  weather.setKind(BIOMES[game.biome].weather)
  $('score-num').textContent = '0'
  $('score').classList.remove('met')
  $('tap-hint').classList.toggle('gone', !!adventure.option.goal)
  show(null)
  fitPopups()
  banner(`${BIOMES[game.biome].emoji} ${BIOMES[game.biome].name}`)
  if (adventure.option.goal) voice.say(adventure.option.goal)
  // (said apart from a basket's "Pip needs 3.": the trip's goal is the pantry's)
  voice.say(`Pip wants ${game.goal} carrots in his pantry for winter.`)
}

// Floating words start a little below the score and the trip bar, so a word
// floating up fades out before it reaches them (short sideways phones especially).
function fitPopups() {
  if (!popups || $('hud').classList.contains('hidden')) return
  const bottom = Math.max($('score').getBoundingClientRect().bottom, document.querySelector('.trip').getBoundingClientRect().bottom)
  popups.minTop = bottom + 56
}
addEventListener('resize', fitPopups)

let bannerTimer
function banner(text, ms = 2200) {
  const el = $('banner')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

function bumpScore() {
  const el = $('score')
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
  $('score-num').textContent = game.score
  el.classList.toggle('met', game.score >= game.goal)
}

function hop() {
  if (game.state !== 'play' || game.asking) return
  const kind = bunny.hop()
  if (!kind) return
  // hops along a row: hopping at everything is not the same as catching a whole row
  const seg = game.seg
  if (seg?.kind === 'row' && !seg.finished && game.x > seg.x - 4) seg.hops++
  sound.hop(kind === 'double')
  tmp.set(game.x, 0, 0)
  // a puff of dust from the ground; a hop higher in the air (for a golden carrot) is its own reward, with no sparkle
  if (kind === 'hop') effects.puff(tmp, 6, dustColor(), 0.9)
  if (++game.hops >= 3) $('tap-hint').classList.add('gone')
}

const dustColor = () => BIOMES[game.biome].dust

function finish() {
  game.state = 'home'
  game.homeTime = 0
  bunny.celebrate(3)
  resetLessons()
  sound.music(false)
  sound.finish()
  banner('🏡 Home!', 2600)
  $('tap-hint').classList.add('gone')
  // One soft moment at the burrow: a few slow petals (calm pass: was a 90-piece burst, then more every frame).
  tmp.set(HOME_X + 1, 1.5, -1)
  effects.confettiBurst(tmp, 16, true)
}

/**
 * Home: the burrow pantry has a shelf for each place, its two rows as crates. Pip asks one
 * question about a shelf (which crate has more, or, for older hoppers, how many altogether), then
 * the total shows beside his winter goal. No stars or best score (calm pass).
 */
function showResults() {
  game.state = 'results'
  const crates = renderPantry($('pantry'), game.rows)
  // the patterns hopped, as little pictures (one strip per place), named for screen readers
  const found = $('found')
  found.replaceChildren(...game.patterns.map(({ unit, biome }) => {
    const strip = document.createElement('span')
    strip.className = 'found-pattern'
    for (const name of unit) strip.append(cue.picture(biome, name))
    return strip
  }))
  found.setAttribute('aria-label', game.patterns.length ? `Patterns hopped: ${game.patterns.map(({ unit }) => patternWords(unit)).join('; ')}` : '')
  show('results')
  if (!askPantry(crates)) pantryTotal()
}

const pantryTotalOf = () => game.rows.reduce((sum, row) => sum + row.got, 0)
function pantryTotal() {
  game.homeAsk = null
  const total = pantryTotalOf()
  showPantryTotal($('pantry'), total, game.goal)
  $('pantry').querySelectorAll('.pantry-shelf').forEach((el) => el.classList.remove('asked', 'quiet', 'compare'))
  // basket hoppers work out the gap to the winter goal themselves (when it is 1 to 20: past ten,
  // the count-on line starts with a crate of ten)
  // (not on the 🐢 pace: there the total and the goal are enough)
  const gap = total - game.goal
  const winter = game.tier.row > 0 && !game.gentle && gap !== 0 && Math.abs(gap) <= 20
  if (!winter) {
    voice.say(pantryWords(total, game.goal, game.tier.row > 0))
    return gardenSoon()
  }
  // the total on screen speaks for itself: a breath to look at it, then the one question about it
  clearTimeout(game.gardenTimer)
  game.gardenTimer = setTimeout(() => game.state === 'results' && askWinter(total, game.goal), 1800)
}

/** A moment to see the full shelves and the total, then they fold into one line and the garden opens. */
function gardenSoon() {
  game.homeAsk = null
  $('again').hidden = false
  // (short sideways phones fold straight away: all four shelves and the total don't fit there)
  const short = matchMedia('(max-height: 480px)').matches
  if (short) foldPantry($('pantry'), game.rows)
  clearTimeout(game.gardenTimer)
  game.gardenTimer = setTimeout(openGarden, short ? 1600 : 3200)
}

const flowerNames = (colors) => colors.join(', ')
const capital = (words) => words[0].toUpperCase() + words.slice(1)

/**
 * Pip's door garden: the child plants the flowers picked on the trip, one tap each, in a row in
 * front of the burrow (in 3D, and in the pantry). When the row repeats (two whole goes of a group
 * of two or more colours), Pip names the group once and plays the row as a tune, each colour its
 * own note. Nothing is wrong here: it is the child's own pattern. Older pattern hoppers are asked
 * for one with three colours.
 */
function openGarden() {
  if (game.state !== 'results') return
  const counts = game.flowers
  const picked = Object.values(counts).reduce((a, b) => a + b, 0)
  foldPantry($('pantry'), game.rows)
  if (picked < 2) return
  // older pattern hoppers with two of every colour are asked for a three-colour pattern
  const three = game.tier.pattern > 0 && Object.values(counts).every((n) => n >= 2)
  const said = new Set()
  sound.wonder()
  // a pattern needs two goes of two colours: with fewer flowers they are simply planted
  voice.say(picked < 4 ? 'Plant your flowers by Pip’s door.' : three ? 'Plant a pattern with three colours, by Pip’s door.' : 'Plant your flowers in a pattern, by Pip’s door.')
  let wondered = false
  let nudged = false
  let wonder = 0
  const room = Math.min(8, picked)
  const garden = renderGarden($('pantry'), counts, cue, (row, color) => {
    world.plantRow(row, innerWidth < innerHeight)
    garden.lead(0)
    clearTimeout(wonder)
    if (!color) return
    sound.step(FLOWERS[color].note)
    bunny.happyHop()
    const unit = repeatOf(row)
    const key = unit?.join()
    if (!unit && !wondered && row.length >= (three ? 4 : 3) && row.length < room && picked >= 4) {
      // a row that doesn't repeat yet, and the child stops to think: once, Pip reads it back and
      // wonders what comes next, with the group it could go on from lit (pink, yellow, pink: the
      // pink and yellow), or the whole row
      wonder = setTimeout(() => {
        if (game.state !== 'results' || wondered) return
        wondered = true
        const group = groupOf(row)
        garden.lead(group ? group.length : row.length)
        voice.say(capital(`${flowerNames(row)}… what could come next?`))
      }, 4000)
      return
    }
    if (!unit || said.has(key) || row.length !== unit.length * 2) return
    said.add(key)
    // the row sung back, then its group named; asked for three colours, a two-colour pattern hears
    // (once) that one with all three is still to make
    row.forEach((c, i) => sound.step(FLOWERS[c].note, 0.5 + i * 0.32))
    const tri = new Set(unit).size === 3
    const more = three && !tri && !nudged && (nudged = true) ? ' Can you make one with three colours?' : ''
    voice.sayNow(capital(`${flowerNames(unit)}, again and again. ${tri ? 'Three colours!' : 'A pattern!'}${more}`))
  })
  garden.buttons[0]?.focus({ preventScroll: true })
}

/**
 * One question about a shelf. Little hoppers: which crate has more? (one go, then Pip shows it).
 * Basket hoppers: how many in two crates that differ altogether; counting hoppers (and anyone whose
 * shelves are all doubles) add the shelf's 🎵 crate too. Three numbers, with a second go after a
 * hint to count on. Returns false when there is nothing fair to ask.
 */
function askPantry(allCrates) {
  // the question is about the two counted rows of a place (and, for counting hoppers, its little 🎵 crate)
  const crates = allCrates.filter((c) => !c.row.pattern)
  const shelves = [...new Set(crates.map((c) => c.shelf))].filter((shelf) => crates.filter((c) => c.shelf === shelf).length === 2)
  const adding = game.tier.row > 0
  // the 🐢 pace adds two crates at most
  const three = game.tier.row >= 2 && !game.gentle
  const pair = (sh) => crates.filter((c) => c.shelf === sh)
  const tune = (sh) => allCrates.find((c) => c.shelf === sh && c.row.pattern && c.row.got > 0)
  let shelf, third
  if (adding) {
    // not a double when there is a choice (5 + 6, not 5 + 5); counting hoppers add the shelf's
    // 🎵 crate too, and so does anyone whose shelves are all doubles
    // (both crates with carrots in: 0 + 5 is no sum to work out)
    const sums = shelves.filter((sh) => pair(sh).every((c) => c.row.got > 0))
    const differ = sums.filter((sh) => pair(sh)[0].row.got !== pair(sh)[1].row.got)
    const threes = sums.filter(tune)
    if (three && threes.length) shelf = threes.filter((sh) => differ.includes(sh)).at(-1) ?? threes.at(-1)
    else shelf = differ.at(-1) ?? (game.gentle ? null : threes.at(-1)) ?? sums.at(-1)
    if (shelf && !game.gentle && (three || !differ.includes(shelf))) third = tune(shelf)
  } else {
    // two crates worth comparing: they differ, and each holds at least two (not 1 against 0)
    shelf = shelves.findLast((sh) => pair(sh)[0].row.got !== pair(sh)[1].row.got && pair(sh).every((c) => c.row.got >= 2))
  }
  if (!shelf) return false
  const [p, q] = pair(shelf)
  const [a, b] = [p.row.got, q.row.got]
  const pantry = $('pantry')
  pantry.querySelectorAll('.pantry-shelf').forEach((el) => el.classList.toggle(el === shelf ? 'asked' : 'quiet', true))
  // the shelf's 🎵 crate stays in view only when it is part of the sum
  shelf.classList.toggle('with-tune', !!third)
  const panel = pantry.querySelector('.pantry-ask')
  const title = document.createElement('p')
  title.className = 'ask-title'
  const choices = document.createElement('div')
  choices.className = 'pantry-choices'
  panel.replaceChildren(title, choices)
  panel.hidden = false
  // the one thing to do at home: 'Hop again' waits until Pip's question is answered
  $('again').hidden = true
  sound.wonder()
  if (!adding) {
    // only the carrots that came home, side by side with no plus between: the longer crate has more
    shelf.classList.add('compare')
    for (const { el, row } of [p, q]) {
      el.querySelectorAll('.away').forEach((c) => c.remove())
      el.querySelector('.pantry-crate').style.setProperty('--cols', String(Math.min(row.got, 5)))
    }
    title.textContent = 'Which has more?'
    voice.say('Which crate has more carrots?')
    game.homeAsk = { choices: [p.el, q.el] }
    const more = a > b ? p : q
    for (const crate of [p, q]) {
      crate.el.disabled = false
      // the two crates' numbers wait under the question: the carrots themselves are compared
      crate.el.classList.add('guess')
      crate.el.onclick = () => {
        p.el.disabled = q.el.disabled = true
        p.el.classList.remove('guess')
        q.el.classList.remove('guess')
        panel.hidden = true
        more.el.classList.add('more')
        sound.step(OBSTACLE_NOTES.snowman)
        bunny.happyHop()
        const [hi, lo] = [Math.max(a, b), Math.min(a, b)]
        voice.sayNow(`${crate === more ? 'Yes! ' : 'Look: '}${hi} is more than ${lo}.`)
        pantryTotal()
      }
    }
    p.el.focus({ preventScroll: true })
    return true
  }
  if (third) {
    // two crates, then the 🎵 crate: add the first two, then count on the third
    const c = third.row.got
    const sum = a + b + c
    title.textContent = `${a} + ${b} + ${c} = ?`
    voice.say('How many carrots on this shelf?')
    choices.replaceWith(numberChoices(panel, sum, () => {
      voice.sayNow(`${a} and ${b} make ${a + b}. Count on ${c}.`)
      panel.append(countOn(a + b, c))
    }, (first) => {
      voice.sayNow(`${first ? 'Yes! ' : ''}${a}, ${b} and ${c} make ${sum}.`)
      pantryTotal()
    }))
    return true
  }
  const sum = a + b
  title.textContent = `${a} + ${b} = ?`
  voice.say('How many carrots in these two crates?')
  // count on from the bigger crate: its number, then one more for each carrot in the other,
  // with a line of carrots to tap through, one number each
  const [big, small] = [Math.max(a, b), Math.min(a, b)]
  choices.replaceWith(numberChoices(panel, sum, () => {
    voice.sayNow(`Start at ${big}, and count on ${small}.`)
    panel.append(countOn(big, small))
  }, (first) => {
    voice.sayNow(`${first ? 'Yes! ' : ''}${a} and ${b} make ${sum}.`)
    pantryTotal()
  }))
  return true
}

/**
 * Three number buttons for a question at the burrow (the answer and two near it). A first miss
 * rests, faded, and `onHint` shows a way to work it out; then `onDone(first)` with whether the
 * first go was right.
 */
function numberChoices(panel, answer, onHint, onDone) {
  const row = document.createElement('div')
  row.className = 'pantry-choices'
  const options = new Set([answer])
  while (options.size < 3) {
    const n = answer + pick([-2, -1, 1, 2])
    if (n > 0) options.add(n)
  }
  let tried = false
  const buttons = [...options].sort(() => Math.random() - 0.5).map((n) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ask-choice pantry-number'
    button.textContent = String(n)
    button.onclick = () => {
      if (n !== answer && !tried) {
        tried = true
        button.disabled = true
        game.homeAsk.choices = buttons.filter((el) => !el.disabled)
        game.homeAsk.choices[0]?.focus({ preventScroll: true })
        onHint()
        return
      }
      for (const el of buttons) el.disabled = true
      panel.hidden = true
      sound.step(OBSTACLE_NOTES.snowman)
      bunny.happyHop()
      onDone(n === answer && !tried)
    }
    row.append(button)
    return button
  })
  game.homeAsk = { choices: buttons }
  requestAnimationFrame(() => buttons[0].focus({ preventScroll: true }))
  return row
}

/**
 * For basket hoppers, after the total: how far is it from the winter goal? Spares when Pip has
 * more, or how many more he needs. A first miss brings the count-on line, from the smaller number
 * up to the bigger: the carrots tapped are the answer.
 */
function askWinter(total, goal) {
  const panel = $('pantry').querySelector('.pantry-ask')
  const [lo, hi] = [Math.min(total, goal), Math.max(total, goal)]
  const gap = hi - lo
  const spare = total > goal
  // the shelves fold into one line of place totals first: the question is about the total, and Pip stays in view
  foldPantry($('pantry'), game.rows)
  const title = document.createElement('p')
  title.className = 'ask-title'
  title.textContent = spare ? `🥕 ${total} − ❄️ ${goal} = ?` : `❄️ ${goal} − 🥕 ${total} = ?`
  panel.replaceChildren(title)
  panel.hidden = false
  $('again').hidden = true
  voice.say(spare ? 'How many carrots to spare?' : 'How many more does Pip need?')
  panel.append(numberChoices(panel, gap, () => {
    voice.sayNow(gap > 10 ? `Start at ${lo}. Ten more, then count on to ${hi}.` : `Start at ${lo}, and count on to ${hi}.`)
    panel.append(countOn(lo, gap))
  }, (first) => {
    voice.sayNow(`${first ? 'Yes! ' : ''}${hi} is ${gap} more than ${lo}.`)
    gardenSoon()
  }))
}

/**
 * The count-on helper at the burrow: the bigger crate's number, then a carrot for each one in the
 * smaller crate. Each tap on the next carrot says and shows one more (8, 9, 10…).
 */
function countOn(big, small) {
  const line = document.createElement('div')
  line.className = 'count-on'
  const start = document.createElement('b')
  start.textContent = String(big)
  line.append(start)
  // more than ten to count on: a whole crate of ten comes first (23, then 33), then one at a time
  const sizes = small > 10 ? [10, ...Array(small - 10).fill(1)] : Array(small).fill(1)
  let next = 0
  let reached = big
  const steps = sizes.map((size, i) => {
    const step = document.createElement('button')
    step.type = 'button'
    step.className = `count-step${size > 1 ? ' ten' : ''}`
    step.textContent = size > 1 ? '🥕×10' : '🥕'
    step.setAttribute('aria-label', `count on${size > 1 ? ' ten' : ''}: ${big + sizes.slice(0, i + 1).reduce((a, b) => a + b, 0)}`)
    step.onclick = () => {
      // always the next step in the line, wherever the tap lands, so the count stays in order
      const at = steps[next]
      if (!at) return
      reached += sizes[next++]
      at.classList.add('counted')
      at.textContent = String(reached)
      sound.step(OBSTACLE_NOTES.carrot + Math.min(next, 7))
      voice.sayNow(String(reached))
    }
    line.append(step)
    return step
  })
  return line
}

// --- Counted rows and obstacle rhythms ------------------------------------------------

function resetLessons() {
  game.seg = null
  game.segIndex = 0
  game.cueHold = 0
  game.asking = null
  cue?.hide()
}

/** Each frame of play: cue the next row or rhythm, and pause to ask about a pattern. */
function updateLessons(dt) {
  const seg = game.seg
  if (!seg) {
    const next = course.segments[game.segIndex]
    if (next && game.x >= next.x - CUE_LEAD) beginSegment(next)
    return
  }
  if (seg.finished) {
    game.cueHold -= dt
    if (game.cueHold <= 0) {
      cue.hide()
      game.seg = null
      game.segIndex++
    }
    return
  }
  // Nothing in a row or rhythm can be skipped, but just in case, never leave a cue hanging.
  if (game.x > seg.end + 8) finishSegment(seg)
  else if (seg.kind === 'rhythm' && !seg.asked && !game.asking && game.x >= seg.x + seg.ask * BEAT - ASK_AT) askNext(seg)
}

/**
 * A hint said once per trip, joined to the line it belongs with ("2 carrots! Hop up to catch
 * them!"), so the voice says one thing at a time. Returns '' once it has been said.
 */
const told = new Set()
const fresh = (text) => (told.has(text) ? '' : (told.add(text), ` ${text}`))

/** A pattern's rule, said after a second miss: a growing one grows by one each time. */
const ruleWords = (seg) => (seg.growing ? `One more ${OBSTACLE_NAMES[seg.growing]} each time.` : capital(`${patternWords(seg.unit)}.`))

/** Hopped well: every carrot of a row caught (without hopping at everything), or a pattern with no bump and no carrot left. */
const smoothPattern = (seg) => !seg.bumps && !seg.missed

function beginSegment(seg) {
  game.seg = seg
  // a fork kept for a child still catching whole rows is an ordinary row
  if (seg.fork && game.tier.row === 0) [seg.fork, seg.shaped] = [false, null]
  // shaped again for the child's level right now, so a step up or down shows in this very row
  course.reshape(seg, game.tier)
  $('tap-hint').classList.add('gone')
  const grass = seg.kind === 'row' ? seg.low.slice(0, seg.count).some(Boolean) : seg.carrots > 0
  const grassWords = grass ? fresh('Carrots in the grass: stay down to munch them.') : ''
  let words = ''
  if (seg.fork) return askFork(seg)
  if (seg.kind === 'row') {
    cue.row(seg)
    if (seg.basket) {
      // the 🧺 number speaks for itself after the first two baskets, and a number is said once a trip
      const how = fresh(seg.counting ? 'Count them in, then let the rest go by.' : 'Fill the basket, then let the others go by.')
      const need = `Pip needs ${seg.n}.`
      // (a new way of filling it is still said, even for a number already heard: the 🧺 shows it;
      // and not just after "That's 6. Too heavy!", nor just before the fork asks for its own number,
      // so two different numbers never come back to back)
      const beforeFork = course.segments[course.segments.indexOf(seg) + 1]?.fork
      const said = told.has(need) || game.time - game.spokeSpill < 8 || beforeFork
      if (how || (++game.baskets <= 2 && !said)) words = `${said ? '' : need}${how}`.trim()
      if (!said) told.add(need)
    } else {
      // the number is said where the carrots are counted aloud; later the tray shows it
      const hop = fresh('Hop up to catch them!')
      const many = `${carrotWords(seg.n)}!`
      if ((seg.biome === 0 && !told.has(many)) || hop) words = `${many}${hop}`
      told.add(many)
    }
  } else {
    cue.rhythm(seg)
    course.shapes.push(seg.shape)
    // the music rests while a pattern is hopped, so its notes are the only tune
    sound.hushMusic(true)
    // hear the pattern's start once: each step's own note (a growing pattern's rule is for the child to find).
    // Little hoppers hear it named too; older ones have the notes and the pictures.
    seg.unit.forEach((name, i) => sound.step(OBSTACLE_NOTES[name], i * 0.45))
    if (game.tier.pattern === 0) words = capital(`${patternWords(seg.unit)}.`)
  }
  if (words || grassWords) voice.say(`${words}${grassWords}`.trim())
}

/** Splits a patch of `t` carrots into two little groups of at most five, neither a lone carrot (7: 4 and 3, or 5 and 2). */
function groupsOf(t) {
  const a = randInt(Math.ceil(t / 2), Math.min(5, t - (t >= 4 ? 2 : 1)))
  return [a, t - a]
}

/**
 * The fork: Pip stops where the path splits, and the child chooses one of two patches, each shown
 * as two little groups of carrots with no numbers. One makes Pip's number; the other has one more
 * or one less. The chosen patch is the row: too many, and the child stops hopping at full; too few,
 * and the basket can't be filled ("6 of 7"). Adding (or counting) the groups is how to choose well.
 */
function askFork(seg) {
  const n = seg.n
  const other = n + (n + 1 > Math.min(10, seg.room) ? -1 : n - 1 < 2 ? 1 : pick([-1, 1]))
  const patches = [groupsOf(n), groupsOf(other)].sort(() => Math.random() - 0.5)
  game.asking = seg
  cue.row(seg)
  sound.wonder()
  // (the number once a trip: after "Pip needs 3." earlier, just the question)
  voice.say(`${told.has(`Pip needs ${n}.`) ? '' : `Pip needs ${n}. `}Which patch has ${n}?`, { interrupt: true })
  told.add(`Pip needs ${n}.`)
  cue.fork(n, patches, (i) => {
    if (game.asking !== seg) return
    game.asking = null
    cue.closeAsk()
    const [a, b] = patches[i]
    const t = a + b
    course.layPatch(seg, t)
    cue.row(seg)
    // the carrots grow up in the chosen patch, with a soft sparkle where it starts
    effects.sparkle(tmp.set(seg.x + ROW_STEP, 1.2, 0), 8, ['#ffffff', '#ffd23f'], 2)
    sound.step(OBSTACLE_NOTES.snowman)
    if (t === n) voice.sayNow(`Yes! ${a} and ${b} make ${n}.`)
    else voice.sayNow(`${a} and ${b} make ${t}.${t > n ? ` Stop at ${n}!` : ` Pip needs ${n}.`}`)
  })
}

const flowerHint = () => voice.sayOnce('Flowers! Stay down to pick them for Pip’s door.')

function finishSegment(seg) {
  if (seg.finished) return
  seg.finished = true
  game.cueHold = 1
  // the pantry keeps what Pip needed: spare carrots went back to the field, and an over-full basket
  // lost two for every carrot past full (7 asked, 9 caught: 3 come home)
  if (seg.kind === 'row') game.rows.push({ got: keptIn(seg), n: seg.n, biome: seg.biome })
  else {
    // the results picture a growing pattern by its first two groups (a b, a a b)
    game.patterns.push({ unit: seg.growing ? seg.items.slice(0, seg.starts[2]) : seg.unit, biome: seg.biome })
    if (seg.carrots) game.rows.push({ got: seg.got, n: seg.carrots, biome: seg.biome, pattern: true })
    if (smoothPattern(seg)) adventure.event('pattern')
    // a slip in the mist: the strip sings what was hidden, note by note (no words), so the bump or
    // the carrot left behind is heard against the pattern
    if (seg.mistSlips) {
      cue.replay(seg.ask + 1, seg.items.length, (i, at) => sound.step(OBSTACLE_NOTES[seg.items[i]], at), 0.32)
      game.cueHold = 0.5 + (seg.items.length - seg.ask - 1) * 0.32
    }
    sound.hushMusic(false)
    if (game.flowerHint) {
      game.flowerHint = false
      flowerHint()
    }
  }
  saveTier()
}

/** Pip stops before the hidden obstacle and asks, in pictures, which one comes next. */
function askNext(seg) {
  seg.asked = true
  game.asking = seg
  sound.wonder()
  voice.sayOnce('What comes next?')
  cue.ask(seg, (name) => answer(seg, name))
}

/**
 * A first answer that doesn't fit rests, faded: the strip plays the pattern again up to the "?",
 * note by note, and the child has another go (with only two pictures, a third joins, so it is still a
 * choice). Two right first answers in a row step up the ladder; a second miss shows the answer and
 * its rule and steps it down, and so do two patterns in a row that needed a second go. Only a right
 * first answer hears "Yes".
 */
function answer(seg, name) {
  if (game.asking !== seg) return
  const real = seg.items[seg.ask]
  const tier = game.tier
  if (name !== real && !seg.tried) {
    seg.tried = true
    tier.right = 0
    cue.rest(name)
    if (seg.spare) cue.addChoice(seg.spare, randInt(0, cue.choiceRow.children.length))
    // listen again from the start of the last two groups, so the repeat (or the growth) can be heard
    const from = seg.starts[Math.max(0, seg.starts.findLastIndex((i) => i < seg.ask) - 1)]
    cue.replay(from, seg.ask, (i, at) => sound.step(OBSTACLE_NOTES[seg.items[i]], at))
    // little hoppers hear the steps named; older ones listen to the notes and watch the strip
    // ("Listen." once a trip: after that the notes and the faded picture say it)
    if (tier.pattern === 0) voice.sayNow(`Listen. ${capital(patternWords(seg.items.slice(from, seg.ask)))}…`)
    else voice.sayOnce('Listen.', { interrupt: true })
    return
  }
  game.asking = null
  course.answers.push(real)
  cue.closeAsk()
  const at = course.reveal(seg)
  cue.revealStep(seg)
  sound.step(OBSTACLE_NOTES[real])
  if (at) effects.sparkle(tmp.set(at.x, 1, 0), 10, ['#ffffff', '#ffd23f'], 2.5)
  const said = OBSTACLE_NAMES[real]
  if (name === real && !seg.tried) {
    // two right first answers in a row step up (a lucky tap on two pictures is not enough), and
    // each one after that while the run lasts, so a strong first trip meets a growing pattern
    tier.wrong = 0
    if (++tier.right >= 2) tier.pattern = Math.min(game.top.pattern, tier.pattern + 1)
    // "Yes, a carrot!" once a trip; after that the rule the child just read
    const yes = `Yes, a ${said}!`
    voice.sayNow(told.has(yes) ? `Yes! ${ruleWords(seg)}` : (told.add(yes), yes))
  } else if (name === real) {
    // right on the second go: the ladder follows first answers, so two of these in a row step down
    if (++tier.wrong >= 2) Object.assign(tier, { pattern: Math.max(0, tier.pattern - 1), wrong: 0 })
    const a = `A ${said}.`
    voice.sayNow(told.has(a) ? ruleWords(seg) : (told.add(a), a))
  } else {
    Object.assign(tier, { pattern: Math.max(0, tier.pattern - 1), wrong: 0 })
    voice.sayNow(`Look, a ${said}! ${ruleWords(seg)}`)
  }
  // the rest of the pattern waits under mist: the pattern tells Pip when to hop and when to stay down
  if (seg.ask < seg.items.length - 1) voice.sayOnce('The rest is in the mist: hop, or stay down?')
}

/**
 * A row carrot munched. Tier 0 counts it aloud in the meadow only (rows of 2–3); past
 * that the munch note, the number above Pip and the tray carry the count. On the basket tiers the
 * child counts: the voice stays quiet, and a carrot past a full basket goes back to the field.
 * Returns whether Pip keeps it.
 */
/** Where a floating number sits: just above Pip's ears (a little higher in portrait, where the lens is wider). */
const overPip = () => bunny.y + (innerWidth < innerHeight ? 2.45 : 1.9)

function lessonCarrot(ev) {
  const seg = ev.seg
  seg.got++
  cue.fill(seg.got)
  const kept = !seg.basket || seg.got <= seg.n
  if (kept) {
    // the count floats above Pip in one spot (not on the counting tier: there the child keeps it)
    if (!seg.counting) popups.show(String(seg.got), tmp.set(game.x + 0.4, overPip(), 0), '', true)
    if (!seg.basket && seg.biome === 0) voice.count(seg.got, { interrupt: false })
  } else {
    seg.over++
    effects.puff(ev.pos, 6, '#ffffff', 0.8)
    popups.show('↩', tmp.set(game.x + 0.4, overPip(), 0), 'oops', true)
    // too many: the basket is too heavy and, for every carrot past full, it wobbles and two that were
    // in it roll back out, so the further over it goes the less comes home, and stopping when it is
    // full wins (careful counting brings home more than hopping at everything)
    const lost = keptIn({ ...seg, over: seg.over - 1 }) - keptIn(seg)
    for (let i = 0; i < lost; i++) cue.spill()
    if (lost) {
      game.score = Math.max(0, game.score - lost)
      bumpScore()
    }
    // said for the first two over-full baskets, each line once a trip
    if (seg.over === 1 && ++game.spills <= 2) {
      voice.sayNow(game.spills === 1 ? `That's ${seg.got}. Too heavy! ${lost === 1 ? 'One' : 'Two'} rolled out.` : 'Too heavy again! Stop when the basket is full.')
      game.spokeSpill = game.time
    }
  }
  rowDone(seg)
  return kept
}

/** The carrots of a row that come home: up to the basket's number, less two for every carrot past full. */
const keptIn = (seg) => Math.max(0, Math.min(seg.got, seg.n) - 2 * seg.over)

/** A carrot growing in a pattern: munched (stayed down) or hopped over. Either way it is a step of the tune. */
function patternCarrot(ev, got) {
  const seg = ev.seg
  if (got) seg.got++
  else seg.missed++
  if (!got && ev.index > seg.ask) seg.mistSlips = (seg.mistSlips ?? 0) + 1
  sound.step(OBSTACLE_NOTES.carrot, got ? 0.05 : 0)
  cue.passed(ev.index, !got)
  if (++seg.passed >= seg.items.length) finishSegment(seg)
}

function lessonMiss(ev) {
  const seg = ev.seg
  seg.missed++
  // a carrot let go before the basket was full doesn't count as stopping on time
  if (seg.got < seg.n) seg.early++
  if (!seg.basket) cue.miss()
  rowDone(seg)
}

/**
 * Every carrot of the row is munched or gone by: say how it went (briefly) and follow the child's
 * level. A basket is "just right" only when Pip caught every carrot up to full and then let the
 * spares go by, which careful counting does and hopping at everything almost never does.
 */
function rowDone(seg) {
  if (seg.finished || seg.got + seg.missed < seg.count) return
  const tier = game.tier
  if (seg.basket) {
    const clean = seg.got === seg.n && !seg.early
    if (clean) {
      if (++game.justRight <= 1) voice.say(`Just right, ${seg.n}!`)
      else sound.step(OBSTACLE_NOTES.snowman, 0.1) // a soft bell does the job by now
      adventure.event('row')
      tier.slips = 0
      if (++tier.streak >= 2 && tier.row < game.top.row) Object.assign(tier, { row: tier.row + 1, streak: 0 })
    } else {
      tier.streak = 0
      // (the first two times, and never the same words twice in a trip)
      if (seg.got < seg.n && game.aways < 2 && voice.sayOnce(`${seg.got} of ${seg.n}.`)) game.aways++
    }
    // too many twice: a step back down (the counting basket gets its empty places back, then whole rows)
    if (seg.over && ++tier.slips >= 2) Object.assign(tier, { row: Math.max(0, tier.row - 1), slips: 0, streak: 0 })
  } else {
    // the tray shows what got away; Pip says it the first two times
    if (seg.missed && game.aways < 2 && voice.sayOnce(`${seg.got} of ${seg.n}. ${seg.missed} got away.`)) game.aways++
    // two whole rows of three or more, caught by looking (not by hopping at everything): next time
    // Pip's basket is smaller than the row. Hopping for the high carrots and staying down for the
    // ones in the grass takes about one hop per high carrot, and a row of only high ones doesn't count.
    const whole = !seg.missed && seg.hops <= seg.count + 2
    if (whole) adventure.event('row')
    // only a row that asked for looking (with carrots in the grass) shows the child is ready
    if (!whole) tier.streak = 0
    else if (seg.n >= 3 && seg.low.slice(0, seg.count).some(Boolean)) tier.streak++
    if (tier.streak >= 2) Object.assign(tier, { row: Math.max(tier.row, 1), streak: 0, slips: 0 })
  }
  finishSegment(seg)
}

function lessonObstacle(ev) {
  const seg = ev.seg
  sound.step(OBSTACLE_NOTES[ev.name])
  cue.passed(ev.index)
  if (++seg.passed >= seg.items.length) finishSegment(seg)
}

// --- Input: tap / click anywhere, or space, up arrow, W ---------------------------------

addEventListener('pointerdown', (e) => {
  sound.unlock()
  if (e.target.closest('button')) return
  if (game.state === 'play') hop()
  if (game.state !== 'loading') poke(e.clientX, e.clientY)
})

// Kids tap everything: Pip giggles and hops, and the scenery boings, rustles and flutters.
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const POKE = {
  tree_round: 'tree', tree_round_snow: 'tree', tree_pine: 'tree', tree_pine_snow: 'tree', bush: 'tree', grass: 'tree', flower: 'flower',
  mushroom_red: 'boing', mushroom_blue: 'boing', toadstool: 'boing', pumpkin: 'thud', rock: 'thud', stump: 'thud',
  snowman: 'snow', log: 'thud', fence: 'knock', burrow: 'knock', butterfly: 'flutter',
}
const LEAF_MATS = ['canopy', 'pine', 'bush', 'grass', 'petal', 'cap_red', 'cap_mushroom_red', 'cap_mushroom_blue', 'pumpkin', 'wing']
function colorOf(obj, fallback) {
  let c = null
  obj.traverse((o) => {
    if (!c && o.isMesh && LEAF_MATS.includes(o.material.name)) c = `#${o.material.color.getHexString()}`
  })
  return c ?? fallback
}
function poke(sx, sy) {
  ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (game.state !== 'play') {
    // Pip, on the menu and at home: the whole bunny counts, plus a little around him
    tmp.set(game.x, bunny.y + 0.8, 0).project(camera)
    const near = Math.hypot(((tmp.x + 1) / 2) * innerWidth - sx, ((1 - tmp.y) / 2) * innerHeight - sy) < Math.min(innerWidth, innerHeight) * 0.12
    if (near || raycaster.intersectObject(bunny.root, true).length) {
      const kind = bunny.tickle()
      if (kind) {
        sound.hop(kind === 'double')
        sound.giggle()
        effects.sparkle(tmp.set(game.x, bunny.y + 1.2, 0), 10, ['#ff9fba', '#ffffff', '#ffd23f'], 3)
      }
      return
    }
  }
  // While hopping along every tap is a hop, so scenery only wobbles when hit
  // squarely, and quietly: the hop makes the sound.
  const playing = game.state === 'play'
  const hit = world.poke(raycaster, camera, sx, sy, !playing, course.obstacles())
  if (!hit) return
  const kind = POKE[hit.kind] ?? 'boing'
  if (!playing) sound.poke(kind)
  if (kind === 'tree') effects.leaves(hit.top, hit.kind.endsWith('_snow') ? '#ffffff' : colorOf(hit.obj, '#7bd14b'))
  else if (kind === 'snow') effects.puff(hit.top, 10, '#ffffff', 1.2)
  else if (kind === 'knock' && hit.kind === 'burrow') effects.puff(world.chimney(tmp2), 6, '#ffffff', 1)
  else effects.sparkle(hit.top, 8, [colorOf(hit.obj, '#ffd23f'), '#ffffff'], 2.5)
}
/** The buttons of the question waiting for an answer (on the path or at the burrow), or null. */
function choiceList() {
  if (game.asking) return cue.choices
  if (game.state === 'results' && game.homeAsk) return game.homeAsk.choices.filter((b) => !b.disabled)
  return null
}
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) {
    e.preventDefault()
    if (e.repeat) return
    sound.unlock()
    const list = choiceList()
    if (list) {
      // the "What comes next?" pictures (or the pantry question): Space or Enter picks the one in focus
      const pick = list.find((b) => b === document.activeElement) ?? list[0]
      pick?.click()
    } else if (game.state === 'results' && document.activeElement?.matches?.('#pantry button:not(:disabled)')) {
      document.activeElement.click() // the garden's flowers and places
    } else if (game.state === 'menu' || game.state === 'results') start()
    else hop()
  } else if (choiceList() && /^Digit[1-3]$/.test(e.code)) {
    choiceList()[Number(e.code.slice(5)) - 1]?.click()
  } else if (choiceList() && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    const list = choiceList()
    const i = list.indexOf(document.activeElement)
    list[(i + (e.code === 'ArrowLeft' ? list.length - 1 : 1)) % list.length]?.focus()
  } else if (e.code === 'KeyM') toggleMute()
  else if (e.code === 'Escape' && game.state !== 'menu' && game.state !== 'loading') $('home').click()
})
addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend()
})
$('play').onclick = start
$('again').onclick = start
// Home: back to the menu (and its mission choice) from a trip or from the burrow.
$('home').onclick = () => {
  sound.unlock()
  sound.click()
  toMenu()
}
function toggleMute() {
  sound.unlock()
  sound.setMuted(!sound.muted)
  voice.setMuted(sound.muted)
  $('mute').textContent = sound.muted ? '🔇' : '🔊'
}
$('mute').onclick = toggleMute
$('mute').textContent = sound.muted ? '🔇' : '🔊'

// --- Main loop ----------------------------------------------------------------------

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'carrot') {
      bunny.munch()
      if (ev.gold) {
        game.golden++
        sound.gold()
        effects.sparkle(ev.pos, 10, ['#ffe066', '#ffffff', '#ffb000'], 2.5)
        continue // a golden carrot is Pip's treat on the way, eaten there: not a pantry carrot, and not tallied at home
      }
      effects.crumbs(ev.pos)
      if (ev.seg?.kind === 'rhythm') patternCarrot(ev, true)
      else {
        // the munch note walks up the scale with the row
        sound.munch(ev.seg ? ev.seg.got % 5 : 0)
        if (ev.seg && !lessonCarrot(ev)) continue
      }
      // one carrot is one carrot: the 🥕 count is the pantry's running total, towards the winter goal
      game.score += 1
      bumpScore()
    } else if (ev.type === 'missed') {
      if (ev.seg.kind === 'rhythm') patternCarrot(ev, false)
      else lessonMiss(ev)
    } else if (ev.type === 'unmist') {
      effects.puff(tmp.set(ev.pos.x, 0.9, 0.2), 6, '#ffffff', 0.9)
      cue.unveil(ev.seg, ev.index)
    } else if (ev.type === 'bump') {
      // a soft tumble and a puff of dust: no words or stars, Pip just picks himself up
      bunny.bonk()
      game.slow = 0.35
      game.shake = 0.15 // a real bump, so a small nudge (was 0.35)
      sound.bonk()
      effects.puff(ev.pos, 8, dustColor(), 1.3)
      if (ev.seg) {
        ev.seg.bumps++
        if (ev.index > ev.seg.ask) ev.seg.mistSlips = (ev.seg.mistSlips ?? 0) + 1
      }
    } else if (ev.type === 'flower') {
      // a wild flower for Pip's door: its own note, a little sparkle in its colour
      game.flowers[ev.color]++
      sound.step(FLOWERS[ev.color].note + 12)
      effects.sparkle(tmp.set(ev.pos.x, 0.8, 0), 6, [FLOWERS[ev.color].hex, '#ffffff'], 2)
      popups.show('✿', tmp.set(game.x + 0.4, overPip() - 0.3, 0), `flower ${ev.color}`)
    } else if (ev.type === 'flowerAhead') {
      // never over a pattern (its question, its answer, its mist): the hint waits for the pattern to end
      if (game.seg?.kind === 'rhythm' && !game.seg.finished) game.flowerHint = true
      else flowerHint()
    }
    // Each obstacle of a rhythm rings its own note as Pip passes it, bumped or cleared, so the pattern is heard.
    if ((ev.type === 'bump' || ev.type === 'cleared') && ev.seg) lessonObstacle(ev)
    // Calm pass: clearing a log is its own reward; no random "Nice hop!" praise.
  }
}

function updateCamera(dt) {
  let px, py, pz, lx, ly
  if (game.state === 'menu') {
    // close up on Pip, a little in front so the title sits above
    const portrait = innerWidth < innerHeight
    px = game.x + 0.6
    py = 1.6
    pz = menuZ()
    lx = game.x + 0.1
    // sideways tablets: Pip stands a little further off, so his ears clear the words
    ly = portrait ? 1.45 : innerHeight > 480 ? 1.3 : 1.0
  } else if (game.state === 'home' || game.state === 'results') {
    px = HOME_X + 0.8
    py = 2.4
    pz = Math.min(view.dist, 13)
    lx = HOME_X + 0.6
    ly = 1.4
  } else {
    const lead = view.halfW * view.lead
    px = game.x + lead
    py = view.height + bunny.y * 0.25
    pz = view.dist
    lx = game.x + lead
    ly = view.aim + bunny.y * view.follow
  }
  if (game.state === 'play') {
    // move with the bunny first, so the easing below doesn't trail behind at speed
    camPos.x += game.speed * dt
    camLook.x += game.speed * dt
  }
  const k = easeStep(game.state === 'play' ? 4 : 2, dt)
  camPos.lerp(tmp.set(px, py, pz), k)
  camLook.lerp(tmp2.set(lx, ly, 0), k)
  camera.position.copy(camPos)
  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt)
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.5
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.5
  }
  camera.lookAt(camLook)
}

// The trip bar: moved with transforms, and only when it has moved a visible amount.
const tripFill = $('trip-fill')
const tripBunny = $('trip-bunny')
let tripShown = -1
function showTrip(progress) {
  const p = Math.round(progress * 1000) / 1000
  if (p === tripShown) return
  tripShown = p
  tripFill.style.transform = `scaleX(${p})`
  tripBunny.style.transform = `translateX(${p * 100}%)`
}

const probe = { x: 0, y: 0, grounded: true, tumbling: false } // where the bunny is, for the course's hit test
let last = performance.now()
let smokeTimer = 0
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  game.time += dt
  measureQuality(dt)

  let mode = 'menu'
  if (game.state === 'play') {
    mode = 'run'
    game.slow = Math.min(1, game.slow + dt * 0.7)
    // the 🐢 pace and a mission's pace never stack: the gentler one wins
    const pace = Math.min(adventure.pace, game.gentle ? GENTLE : 1)
    const target = game.asking ? 0 : speedAt(game.x) * game.slow * pace
    game.speed = THREE.MathUtils.damp(game.speed, target, 3, dt)
    game.x += game.speed * dt

    const idx = biomeIndexAt(game.x)
    if (idx !== game.biome) {
      game.biome = idx
      const b = BIOMES[idx]
      banner(`${b.emoji} ${b.name}!`)
      sound.fanfare()
      weather.setKind(b.weather)
    }
    course.generate(game.x + view.halfW * 2 + 30, game.tier)
    probe.x = game.x
    probe.y = bunny.y
    probe.grounded = bunny.grounded
    probe.tumbling = bunny.tumbleT < 1
    handleEvents(course.update(dt, probe, game.time, game.x - view.halfW - 15))
    updateLessons(dt)
    if (game.x >= HOME_X - 1.4) finish()

    showTrip(clamp(game.x / HOME_X, 0, 1))
  } else if (game.state === 'home' || game.state === 'results') {
    mode = 'still'
    game.speed *= Math.pow(0.02, dt)
    game.x = Math.min(HOME_X, game.x + game.speed * dt)
    game.homeTime += dt
    if (game.state === 'home' && game.homeTime > 3) showResults()
    smokeTimer -= dt
    if (world.home && smokeTimer <= 0) {
      smokeTimer = 0.35
      world.chimney(tmp)
      effects.dust.spawn(tmp, tmp2.set(0.3, 1.2, 0), { life: 1.6, size: 0.25, color: '#ffffff', spin: 0, shrink: true })
    }
    course.update(dt, null, game.time, game.x - view.halfW - 15)
  } else {
    course.update(dt, null, game.time, -1e9)
  }

  // waiting for an answer, Pip stops and turns to look at the child (and stays still while the child thinks)
  if (game.asking && game.speed < 0.6) mode = 'still'
  const landed = bunny.update(dt, game.state === 'play' ? game.speed : 0, mode)
  if (landed !== 0) {
    tmp.set(game.x, 0, 0)
    effects.puff(tmp, Math.abs(landed) > 9 ? 8 : 4, dustColor(), Math.min(1.3, Math.abs(landed) / 9))
    if (game.state === 'play' && landed > 4) sound.land()
    if (landed < 0) sound.hop(false) // landed and bounced straight into a buffered hop
  }
  bunny.root.position.x = game.x
  game.blob.position.x = game.x
  const lift = clamp(bunny.y / 3, 0, 0.8)
  game.blob.scale.setScalar(1 - lift * 0.6)
  game.blob.material.opacity = 0.22 * (1 - lift)

  updateCamera(dt)
  // on the menu butterflies stay close by Pip, inside the view
  // (upright: a little higher, round Pip's ears; sideways: to his right, where the view is open)
  const upright = innerWidth < innerHeight
  world.flutterSpan = game.state === 'menu' ? (upright ? [-2.4, 2.4] : [1.6, 4.8]) : null
  world.flutterHigh = game.state === 'play' ? 1 : game.state === 'menu' && upright ? 0.22 : 0
  // sideways, the title spans the top of the view: menu butterflies keep to Pip's height, under it
  world.flutterCeil = game.state === 'menu' && !upright && innerHeight > 480 ? 0.12 : 0.55
  world.update(dt, camera.position.x, game.x, game.time)
  weather.update(dt, camera.position, game.time)
  // (on the way only: the home questions and the garden have the snow to themselves)
  glints.update(dt, camera, weather.kind === 'snow' && game.state === 'play')
  effects.update(dt)
  renderer.render(scene, camera)
}

init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})

if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game }
