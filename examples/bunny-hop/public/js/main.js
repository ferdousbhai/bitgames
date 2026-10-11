import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { BIOME_LENGTH, BIOMES, FLOWERS, HOME_X, OBSTACLE_NAMES, OBSTACLE_NOTES, biomeIndexAt } from './biomes.js'
import { Bunny } from './bunny.js'
import { BEAT, Course, speedAt } from './course.js'
import { Effects, Glints, Popups, Weather } from './effects.js'
import { Cue, carrotWords, foldPantry, obstaclePictures, pantryWords, patternWords, renderGarden, renderPantry, repeatOf, showPantryTotal } from './learning.js'
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
  goal: 0, // carrots Pip needs in the pantry for winter (four in five of every row)
  justRight: 0, // "Just right!" is said once a trip; after that a soft bell and the basket speak for themselves
  baskets: 0, // basket rows cued this trip: "Pip needs 4." is said for the first two, then the 🧺4 speaks
  aways: 0, // "4 of 6. 2 got away." is said twice a trip; after that the tray shows it
  spills: 0, // over-full baskets this trip (each tips one carrot back out)
  homeAsk: null, // the question at the burrow, while it waits for an answer
  flowers: { blue: 0, yellow: 0, pink: 0 }, // wild flowers picked this trip, to plant by Pip's door
  gardenTimer: 0,
  // How the child is doing, remembered on this device (not a gate: it steps down as easily as up).
  // row 0: catch the whole row; 1: fill a basket (with empty places) from a longer row and let the
  // rest go by; 2: the basket shows only its number, so the child keeps count.
  // pattern 0: AB, AAB; 1: ABC, ABB with three answers; 2: growing patterns.
  // streak/right count good rows and right first answers; two in a row step up.
  tier: { row: 0, pattern: 0, streak: 0, slips: 0, right: 0 },
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
const CUE_LEAD = 16 // a row or rhythm is shown and named this far before it starts
const ASK_AT = 7 // Pip stops a few steps before the hidden obstacle, so its "?" is well in view
const PATTERN_CARROTS = 4 // about how many carrots grow in a pattern, for the winter goal
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
  if (window.game) Object.assign(window, { course, view, camera, bunny, cue })
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
  camPos.set(game.x + 0.6, 1.6, innerWidth < innerHeight ? 8.5 : 5.6)
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
  game.homeAsk = null
  clearTimeout(game.gardenTimer)
  game.flowers = { blue: 0, yellow: 0, pink: 0 }
  Object.assign(game.tier, { streak: 0, slips: 0, right: 0 })
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
  // no scenery pumpkins or snowmen beside a pattern, where one could pass for the hidden obstacle
  world.quiet = (x) => course.segments.some((seg) => seg.kind === 'rhythm' && x > seg.x - 10 && x < seg.end + 6)
  // Pip's winter goal: about four carrots in five of every row and pattern (a basket hopper, who
  // stops at full, needs a little more), so looking and counting get there and hopping at
  // everything falls short: it sails over the carrots in the grass and over-fills baskets
  const carrots = course.segments.reduce((sum, seg) => sum + (seg.kind === 'row' ? seg.n : PATTERN_CARROTS), 0)
  game.goal = Math.max(5, Math.floor((carrots * (game.tier.row > 0 ? 0.85 : 0.8)) / 5) * 5)
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
  voice.say(`Pip needs ${game.goal} carrots for winter.`)
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
  if (kind === 'hop') effects.puff(tmp, 6, dustColor(), 0.9)
  else effects.sparkle(tmp.set(game.x, bunny.y + 0.5, 0), 8, ['#ffffff', '#bfe6ff'], 2.5)
  if (++game.hops >= 3) $('tap-hint').classList.add('gone')
}

const dustColor = () => BIOMES[game.biome].dust

function finish() {
  game.state = 'home'
  game.homeTime = 0
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
  $('golden').textContent = game.golden ? '✨🥕'.repeat(Math.min(game.golden, 6)) : ''
  show('results')
  if (!askPantry(crates)) pantryTotal()
}

const pantryTotalOf = () => game.rows.reduce((sum, row) => sum + row.got, 0)
function pantryTotal() {
  game.homeAsk = null
  $('again').hidden = false
  const total = pantryTotalOf()
  showPantryTotal($('pantry'), total, game.goal)
  $('pantry').querySelectorAll('.pantry-shelf').forEach((el) => el.classList.remove('asked', 'quiet'))
  voice.say(pantryWords(total, game.goal, game.tier.row > 0))
  // a moment to see the full shelves and the total, then they fold into one line and the garden opens
  // (short sideways phones fold straight away: all four shelves and the total don't fit there)
  const short = matchMedia('(max-height: 480px)').matches
  if (short) foldPantry($('pantry'), game.rows)
  clearTimeout(game.gardenTimer)
  game.gardenTimer = setTimeout(openGarden, short ? 1600 : 3200)
}

const flowerNames = (colors) => colors.join(', ')

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
  const garden = renderGarden($('pantry'), counts, cue, (row, color) => {
    world.plantRow(row)
    if (!color) return
    sound.step(FLOWERS[color].note)
    const unit = repeatOf(row)
    const key = unit?.join()
    if (!unit || said.has(key) || row.length !== unit.length * 2) return
    said.add(key)
    // the row sung back, then its group named
    row.forEach((c, i) => sound.step(FLOWERS[c].note, 0.5 + i * 0.32))
    const words = `${flowerNames(unit)}, again and again. ${three && new Set(unit).size === 3 ? 'Three colours!' : 'A pattern!'}`
    voice.sayNow(words[0].toUpperCase() + words.slice(1))
  })
  garden.buttons[0]?.focus({ preventScroll: true })
}

/**
 * One question about the last shelf with two crates. Little hoppers: which crate has more? (one
 * go, then Pip shows it). Basket hoppers: how many in the two crates altogether, from three numbers,
 * with a second go after a hint to count on. Returns false when there is nothing fair to ask.
 */
function askPantry(allCrates) {
  // the question is about the two counted rows of a place (not its little 🎵 crate of pattern carrots)
  const crates = allCrates.filter((c) => !c.row.pattern)
  const shelves = [...new Set(crates.map((c) => c.shelf))].filter((shelf) => crates.filter((c) => c.shelf === shelf).length === 2)
  const adding = game.tier.row > 0
  const shelf = shelves.findLast((sh) => {
    const [p, q] = crates.filter((c) => c.shelf === sh)
    return adding ? p.row.got + q.row.got > 0 : p.row.got !== q.row.got
  })
  if (!shelf) return false
  const [p, q] = crates.filter((c) => c.shelf === shelf)
  const [a, b] = [p.row.got, q.row.got]
  const pantry = $('pantry')
  pantry.querySelectorAll('.pantry-shelf').forEach((el) => el.classList.toggle(el === shelf ? 'asked' : 'quiet', true))
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
    title.textContent = 'Which has more?'
    voice.say('Which crate has more carrots?')
    game.homeAsk = { choices: [p.el, q.el] }
    const more = a > b ? p : q
    for (const crate of [p, q]) {
      crate.el.disabled = false
      crate.el.onclick = () => {
        p.el.disabled = q.el.disabled = true
        panel.hidden = true
        more.el.classList.add('more')
        sound.step(OBSTACLE_NOTES.snowman)
        const [hi, lo] = [Math.max(a, b), Math.min(a, b)]
        voice.sayNow(`${crate === more ? 'Yes! ' : 'Look: '}${hi} is more than ${lo}.`)
        pantryTotal()
      }
    }
    p.el.focus({ preventScroll: true })
    return true
  }
  const sum = a + b
  title.textContent = `${a} + ${b} = ?`
  voice.say('How many carrots in these two crates?')
  const options = new Set([sum])
  while (options.size < 3) {
    const n = sum + pick([-2, -1, 1, 2])
    if (n > 0) options.add(n)
  }
  let tried = false
  const buttons = [...options].sort(() => Math.random() - 0.5).map((n) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ask-choice pantry-number'
    button.textContent = String(n)
    button.onclick = () => {
      if (n !== sum && !tried) {
        tried = true
        button.disabled = true
        game.homeAsk.choices = buttons.filter((el) => !el.disabled)
        game.homeAsk.choices[0]?.focus({ preventScroll: true })
        // count on from the bigger crate: its number, then one more for each carrot in the other,
        // with a line of carrots to tap through, one number each
        const [big, small] = [Math.max(a, b), Math.min(a, b)]
        voice.sayNow(`Start at ${big}, and count on ${small}.`)
        panel.append(countOn(big, small))
        return
      }
      for (const el of buttons) el.disabled = true
      panel.hidden = true
      sound.step(OBSTACLE_NOTES.snowman)
      voice.sayNow(`${n === sum && !tried ? 'Yes! ' : ''}${a} and ${b} make ${sum}.`)
      pantryTotal()
    }
    choices.append(button)
    return button
  })
  game.homeAsk = { choices: buttons }
  buttons[0].focus({ preventScroll: true })
  return true
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
  let next = 0
  const steps = Array.from({ length: small }, (_, i) => {
    const step = document.createElement('button')
    step.type = 'button'
    step.className = 'count-step'
    step.textContent = '🥕'
    step.setAttribute('aria-label', `count on: ${big + i + 1}`)
    step.onclick = () => {
      // always the next carrot in the line, wherever the tap lands, so the count stays in order
      const at = steps[next]
      if (!at) return
      next++
      at.classList.add('counted')
      at.textContent = String(big + next)
      sound.step(OBSTACLE_NOTES.carrot + Math.min(next, 7))
      voice.sayNow(String(big + next))
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
const ruleWords = (seg) => (seg.growing ? `One more ${OBSTACLE_NAMES[seg.growing]} each time.` : `${patternWords(seg.unit)}.`)

/** Hopped well: every carrot of a row caught (without hopping at everything), or a pattern with no bump and no carrot left. */
const smoothPattern = (seg) => !seg.bumps && !seg.missed

function beginSegment(seg) {
  game.seg = seg
  // shaped again for the child's level right now, so a step up or down shows in this very row
  course.reshape(seg, game.tier)
  $('tap-hint').classList.add('gone')
  const grass = seg.kind === 'row' ? seg.low.slice(0, seg.count).some(Boolean) : seg.carrots > 0
  const grassWords = grass ? fresh('Carrots in the grass: stay down to munch them.') : ''
  let words = ''
  if (seg.kind === 'row') {
    cue.row(seg)
    if (seg.basket) {
      // the 🧺 number speaks for itself after the first two baskets
      const how = fresh(seg.counting ? 'Count them in, then let the rest go by.' : 'Fill the basket, then let the others go by.')
      if (++game.baskets <= 2 || how) words = `Pip needs ${seg.n}.${how}`
    } else {
      // the number is said where the carrots are counted aloud; later the tray shows it
      const hop = fresh('Hop up to catch them!')
      if (seg.biome <= (game.gentle ? 1 : 0) || hop) words = `${carrotWords(seg.n)}!${hop}`
    }
  } else {
    cue.rhythm(seg)
    // the music rests while a pattern is hopped, so its notes are the only tune
    sound.hushMusic(true)
    // hear the pattern's start once: each step's own note (a growing pattern's rule is for the child to find).
    // Little hoppers hear it named too; older ones have the notes and the pictures.
    seg.unit.forEach((name, i) => sound.step(OBSTACLE_NOTES[name], i * 0.45))
    if (game.tier.pattern === 0) words = `${patternWords(seg.unit)}.`
  }
  if (words || grassWords) voice.say(`${words}${grassWords}`.trim())
}

function finishSegment(seg) {
  if (seg.finished) return
  seg.finished = true
  game.cueHold = 1
  // the pantry keeps what Pip needed: spare carrots went back to the field, and an over-full basket lost one
  if (seg.kind === 'row') game.rows.push({ got: Math.min(seg.got, seg.n) - (seg.over ? 1 : 0), n: seg.n, biome: seg.biome })
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
 * note by note, and the child has another go (on tier 0 a third picture joins, so it is still a
 * choice). A right first answer steps tier 0 up, and two in a row step tier 1 up to growing patterns; a second miss shows the
 * answer and its rule and steps it down. Only a right first answer hears "Yes".
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
    voice.sayNow(tier.pattern === 0 ? `Listen. ${patternWords(seg.items.slice(from, seg.ask))}…` : 'Listen.')
    return
  }
  game.asking = null
  cue.closeAsk()
  const at = course.reveal(seg)
  cue.revealStep(seg)
  sound.step(OBSTACLE_NOTES[real])
  if (at) effects.sparkle(tmp.set(at.x, 1, 0), 10, ['#ffffff', '#ffd23f'], 2.5)
  const said = OBSTACLE_NAMES[real]
  if (name === real && !seg.tried) {
    // two right first answers in a row step up (a lucky tap on two pictures is not enough)
    if (++tier.right >= 2) Object.assign(tier, { pattern: Math.min(2, tier.pattern + 1), right: 0 })
    voice.sayNow(`Yes, a ${said}!`)
  } else if (name === real) {
    voice.sayNow(`A ${said}.`)
  } else {
    tier.pattern = Math.max(0, tier.pattern - 1)
    voice.sayNow(`Look, a ${said}! ${ruleWords(seg)}`)
  }
  // the rest of the pattern waits under mist: the pattern tells Pip when to hop and when to stay down
  if (seg.ask < seg.items.length - 1) voice.sayOnce('The rest is in the mist: hop, or stay down?')
}

/**
 * A row carrot munched. Tier 0 counts it aloud in the meadow (and the grove, on the 🐢 pace), up to five; past
 * that the munch note, the number above Pip and the tray carry the count. On the basket tiers the
 * child counts: the voice stays quiet, and a carrot past a full basket goes back to the field.
 * Returns whether Pip keeps it.
 */
function lessonCarrot(ev) {
  const seg = ev.seg
  seg.got++
  cue.fill(seg.got)
  const kept = !seg.basket || seg.got <= seg.n
  if (kept) {
    // the count floats above Pip in one spot (not on the counting tier: there the child keeps it)
    if (!seg.counting) popups.show(String(seg.got), tmp.set(game.x + 0.4, bunny.y + 1.9, 0), '', true)
    if (!seg.basket && seg.biome <= (game.gentle ? 1 : 0)) voice.count(seg.got, { interrupt: false })
  } else {
    seg.over++
    effects.puff(ev.pos, 6, '#ffffff', 0.8)
    popups.show('↩', tmp.set(game.x + 0.4, bunny.y + 1.9, 0), 'oops', true)
    if (seg.over === 1) {
      // too many: the basket is too heavy and one carrot that was in it rolls back out, so
      // hopping at everything brings home less than stopping when the basket is full
      cue.spill()
      game.score = Math.max(0, game.score - 1)
      bumpScore()
      if (++game.spills <= 2) voice.sayNow(`That's ${seg.got}. Too heavy! One rolled out.`)
    }
  }
  rowDone(seg)
  return kept
}

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
      if (++tier.streak >= 2 && tier.row < 2) Object.assign(tier, { row: tier.row + 1, streak: 0 })
    } else {
      tier.streak = 0
      if (seg.got < seg.n && ++game.aways <= 2) voice.say(`${seg.got} of ${seg.n}.`)
    }
    // too many twice: a step back down (the counting basket gets its empty places back, then whole rows)
    if (seg.over && ++tier.slips >= 2) Object.assign(tier, { row: Math.max(0, tier.row - 1), slips: 0, streak: 0 })
  } else {
    // the tray shows what got away; Pip says it the first two times
    if (seg.missed && ++game.aways <= 2) voice.say(`${seg.got} of ${seg.n}. ${seg.missed} got away.`)
    // two whole rows of three or more, caught by looking (not by hopping at everything): next time
    // Pip's basket is smaller than the row. Hopping for the high carrots and staying down for the
    // ones in the grass takes about one hop per high carrot, and a row of only high ones doesn't count.
    const whole = !seg.missed && seg.hops <= seg.count + 2
    if (whole) adventure.event('row')
    // only a row that asked for looking (with carrots in the grass) shows the child is ready
    if (!whole) tier.streak = 0
    else if (seg.n >= 3 && seg.low.slice(0, seg.count).some(Boolean)) tier.streak++
    if (tier.streak >= 2) Object.assign(tier, { row: 1, streak: 0, slips: 0 })
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
        continue // golden carrots are Pip's treat, shown at home, not pantry carrots
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
      popups.show('✿', tmp.set(game.x + 0.4, bunny.y + 1.6, 0), `flower ${ev.color}`)
    } else if (ev.type === 'flowerAhead') {
      voice.sayOnce('Flowers! Stay down to pick them for Pip’s door.')
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
    pz = portrait ? 8.5 : 5.6
    lx = game.x + 0.1
    ly = portrait ? 1.45 : 1.0
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

const probe = { x: 0, y: 0, tumbling: false } // where the bunny is, for the course's hit test
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
    probe.tumbling = bunny.tumbleT < 1
    handleEvents(course.update(dt, probe, game.time, game.x - view.halfW - 15))
    updateLessons(dt)
    if (game.x >= HOME_X - 1.4) finish()

    showTrip(clamp(game.x / HOME_X, 0, 1))
  } else if (game.state === 'home' || game.state === 'results') {
    mode = 'home'
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

  // waiting for an answer, Pip stops and turns to look at the child
  if (game.asking && game.speed < 0.6) mode = 'menu'
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
  // on the upright menu the view is narrow: butterflies stay close by Pip, where they can be seen
  world.flutterAhead = game.state === 'menu' && innerWidth < innerHeight ? 2 : Infinity
  world.update(dt, camera.position.x, game.x, game.time)
  weather.update(dt, camera.position, game.time)
  glints.update(dt, camera, game.time, weather.kind === 'snow' && game.state !== 'menu')
  effects.update(dt)
  renderer.render(scene, camera)
}

init().catch((err) => {
  console.error(err)
  $('load-bar').style.background = '#ff6b6b'
})

if (new URLSearchParams(location.search).has('debug')) window.__adventure = { mission: adventure, game }
