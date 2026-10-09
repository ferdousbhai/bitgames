import { createAdventure } from './adventure.js'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sound } from './audio.js'
import { BIOME_LENGTH, BIOMES, HOME_X, OBSTACLE_NAMES, OBSTACLE_NOTES, biomeIndexAt } from './biomes.js'
import { Bunny } from './bunny.js'
import { BEAT, Course, speedAt } from './course.js'
import { Effects, Glints, Popups, Weather } from './effects.js'
import { Cue, carrotWords, obstaclePictures, pantryWords, patternWords, renderPantry } from './learning.js'
import { loadModels } from './models.js'
import { createVoice } from './speech.js'
import { clamp, easeStep, pick } from './util.js'
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
  // Aim so the path sits low on the screen (about 3/4 of the way down): the sky
  // above holds the HUD and the high golden carrots, with little empty grass below.
  view.height = 3.0 + view.dist * 0.1
  const pathBelow = Math.atan(view.height / view.dist) - Math.atan((aspect < 1 ? 0.4 : 0.48) * tan)
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
}
try {
  game.gentle = localStorage.getItem('bunny-hop:gentle') === '1'
} catch {}
/** The 🐢 pace: the same gentle 0.6 the learning missions use. */
const GENTLE = 0.6
const CUE_LEAD = 16 // a row or rhythm is shown and named this far before it starts
const ASK_AT = 7 // Pip stops a few steps before the hidden obstacle, so its "?" is well in view
if (new URLSearchParams(location.search).has('debug')) window.game = game

// Optional learning missions. A flip is the bunny's 'double' hop.
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
  goal.setAttribute('aria-label', `${option.goal}. ${count} of ${option.target} steps.`)
  const caption = document.createElement('span')
  caption.className = 'mission-caption'
  caption.textContent = option.sequence
    ? count === option.target - 1 ? 'Hop, then tap to flip!' : count === option.target ? 'Pattern complete!' : '👆 Hop · hop · flip'
    : `👆 Tap to hop · ${count} / ${option.target}`
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
    // One soft moment: what the child made, a gentle chord and a few slow petals.
    banner(adventure.option.sequence ? '↑ ↑ ↻ Pattern!' : '↑ ↑ ↑ ↑ Four hops!', 2600)
    sound.chord()
    effects.confettiBurst(new THREE.Vector3(game.x, bunny.y + 1, 0), 10, true)
  },
  renderProgress: renderMissionProgress,
  options: [
    { label: 'Free hopping', caption: 'Free hop', pictures: stepRow(['🐰']) },
    { label: 'Gentle hop counting', caption: 'Count 4 hops', ...missionSteps(['↑', '↑', '↑', '↑']), pace: 0.6, goal: 'Make four hops', target: 4, reward: 'Four! You made four hops!' },
    // A plain hop where the flip belongs is turned away with a reminder to tap again in the air.
    { label: 'Hop, hop, flip pattern', caption: 'Hop, hop, flip', ...missionSteps(['↑', '↑', '↻']), pace: 0.6, goal: 'Hop twice, then hop and tap again in the air to flip', target: 3, sequence: ['hop', 'hop', 'flip'], accept: (kind, n) => n < 2 ? kind === 'hop' || kind === 'double' : kind === 'double', hint: () => 'Tap again in the air to flip!', reward: 'You made the hop, hop, flip pattern!' },
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
  voice.say(game.gentle ? 'Slow and gentle, like a tortoise.' : 'Hopping along like a bunny.', { interrupt: true })
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

function toMenu() {
  game.state = 'menu'
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
  // ?biome=2 starts further along the trip (for trying out the later places)
  const skip = clamp(Number(new URLSearchParams(location.search).get('biome')) || 0, 0, BIOMES.length - 1)
  game.x = skip ? skip * BIOME_LENGTH + 1 : 0
  game.biome = skip
  bunny.reset()
  world.reset(game.x)
  // the 🐢 pace keeps every row to one ten-frame row of 5 or fewer
  course.reset(game.x, game.gentle ? 5 : Infinity)
  resetLessons()
  // swoop out from a close-up of Pip (and never pan across the whole trip)
  camPos.set(game.x + 0.6, 1.6, 6.5)
  camLook.set(game.x + 0.1, 1.1, 0)
  weather.setKind(BIOMES[game.biome].weather)
  $('score-num').textContent = '0'
  $('tap-hint').classList.toggle('gone', !!adventure.option.goal)
  show(null)
  fitPopups()
  banner(`${BIOMES[game.biome].emoji} ${BIOMES[game.biome].name}`)
  if (adventure.option.goal) voice.say(adventure.option.goal, { interrupt: true })
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
}

function hop() {
  if (game.state !== 'play' || game.asking) return
  const kind = bunny.hop()
  if (!kind) return
  if (adventure.event(kind) === 'rejected') banner('👆 Tap again!', 900)
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
 * Home: the burrow pantry shows each counted row Pip brought home (3 + 4 + 5 = 12) and says the
 * total; the words underneath name the patterns hopped. No stars or best score (calm pass).
 */
function showResults() {
  game.state = 'results'
  const total = game.rows.reduce((sum, n) => sum + n, 0)
  renderPantry($('pantry'), game.rows, total)
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
  voice.say(pantryWords(game.rows, total))
  const n = game.patterns.length
  if (n) voice.say(n === 1 ? `And you hopped a ${patternWords(game.patterns[0].unit)} pattern!` : `And you hopped ${n} patterns!`)
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

function beginSegment(seg) {
  game.seg = seg
  $('tap-hint').classList.add('gone')
  if (seg.kind === 'row') {
    cue.row(seg.n)
    voice.say(`${carrotWords(seg.n)}!`)
  } else {
    cue.rhythm(seg)
    // hear the pattern once before it starts: each obstacle's own note
    seg.unit.forEach((name, i) => sound.step(OBSTACLE_NOTES[name], i * 0.45))
    voice.say(`${patternWords(seg.unit)}.`)
  }
}

function finishSegment(seg) {
  if (seg.finished) return
  seg.finished = true
  game.cueHold = 1
  if (seg.kind === 'row') game.rows.push(seg.got)
  else game.patterns.push({ unit: seg.unit, biome: seg.biome })
}

/** Pip stops before the hidden obstacle and asks, in pictures, which one comes next. */
function askNext(seg) {
  seg.asked = true
  game.asking = seg
  sound.wonder()
  voice.say('What comes next?')
  cue.ask(seg, (name) => answer(seg, name))
}

/** Any answer is fine: the obstacle appears, Pip says what it is, and carries on. */
function answer(seg, name) {
  if (game.asking !== seg) return
  game.asking = null
  cue.closeAsk()
  const real = seg.items[seg.ask]
  const at = course.reveal(seg)
  cue.revealStep(seg)
  sound.step(OBSTACLE_NOTES[real])
  if (at) effects.sparkle(tmp.set(at.x, 1, 0), 10, ['#ffffff', '#ffd23f'], 2.5)
  const said = OBSTACLE_NAMES[real]
  voice.say(name === real ? `Yes! A ${said} comes next.` : `Look, a ${said}! ${patternWords(seg.unit)}.`, { interrupt: true })
}

function lessonCarrot(ev) {
  const seg = ev.seg
  seg.got++
  cue.fill(seg.got)
  // the count, said aloud and floating above Pip in one spot
  popups.show(String(seg.got), tmp.set(game.x + 0.4, bunny.y + 1.9, 0), '', true)
  if (seg.got >= seg.n) {
    voice.say(`${carrotWords(seg.n)}!`)
    finishSegment(seg)
  } else voice.say(String(seg.got))
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
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) {
    e.preventDefault()
    if (e.repeat) return
    sound.unlock()
    if (game.state === 'menu' || game.state === 'results') start()
    else if (game.asking) {
      // the "What comes next?" pictures: Space or Enter picks the one in focus
      const pick = cue.choices.find((b) => b === document.activeElement) ?? cue.choices[0]
      pick?.click()
    } else hop()
  } else if (game.asking && /^Digit[1-3]$/.test(e.code)) {
    cue.choices[Number(e.code.slice(5)) - 1]?.click()
  } else if (game.asking && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    const list = cue.choices
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
  voice.hush()
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

const OOPS = ['Boing!', 'Whoopsie!', 'Oopsy daisy!', 'Bonk!']

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'carrot') {
      // one carrot is one carrot: the 🥕 count matches the carrots in the pantry (plus golden ones)
      game.score += 1
      if (ev.gold) game.golden++
      bumpScore()
      bunny.munch()
      if (ev.gold) {
        sound.gold()
        effects.sparkle(ev.pos, 10, ['#ffe066', '#ffffff', '#ffb000'], 2.5)
      } else {
        // the munch note walks up the scale with the row
        sound.munch(ev.seg ? ev.seg.got % 5 : 0)
        effects.crumbs(ev.pos)
        effects.sparkle(ev.pos, 3, undefined, 1.5)
        if (ev.seg) lessonCarrot(ev)
      }
    } else if (ev.type === 'bump') {
      bunny.bonk()
      game.slow = 0.35
      game.shake = 0.15 // a real bump, so a small nudge (was 0.35)
      sound.bonk()
      tmp.set(game.x, 1.6, 0)
      effects.dizzy(tmp)
      effects.puff(ev.pos, 8, dustColor(), 1.3)
      popups.show(pick(OOPS), tmp.set(game.x, 2.4, 0), 'oops')
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
    course.generate(game.x + view.halfW * 2 + 30)
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
