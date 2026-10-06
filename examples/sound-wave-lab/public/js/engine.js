import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import game from './game.js'
import { challenge } from './challenges.js'
import { AudioGuide } from './audio.js'
import { runActivity } from './activities.js'

const $ = (id) => document.getElementById(id)
const audio = new AudioGuide()
const params = new URLSearchParams(location.search)
const debug = params.has('debug')
const debugScale = debug ? Number(params.get('renderScale')) : 0
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
// Inside the BitGames store the store's own ✕ sits in the top-right corner; the header leaves it free.
let framed = false
try { framed = window.self !== window.top } catch { framed = true }
document.documentElement.classList.toggle('framed', framed)

const LEVEL_NAMES = ['Little steps', 'Growing', 'Explorer']
const PLAIN_TILE = '#fff6e6'
// Numbers, short capitals, single letters and marks are drawn large.
const GLYPH = /^(?:\d+|[A-Z]{1,3}|[a-z]|[✓?])$/
// Single lowercase letters (and an empty spelling space) are drawn as early-years print instead of the system font:
// a single-storey a and g, an l with a tail (never mistaken for a capital I), and b/d, p/q
// built from the same ball and stick. Each path is strokes in an 80-wide box with the
// x-height at 45, the baseline at 100, ascenders at 10 and descenders at 130.
const BALL_L = 'M60 72.5A24 27.5 0 1 1 12 72.5A24 27.5 0 1 1 60 72.5'
const BALL_R = 'M68 72.5A24 27.5 0 1 1 20 72.5A24 27.5 0 1 1 68 72.5'
const HUMP = (x, w) => `M${x} 64C${x + 2} 52 ${x + w * 0.3} 45 ${x + w * 0.55} 45C${x + w * 0.85} 45 ${x + w} 51 ${x + w} 62V100`
const LETTER_PATHS = {
  a: `${BALL_L}M60 45V100`,
  b: `M20 10V100${BALL_R}`,
  c: 'M58 54A25 27.5 0 1 0 58 91',
  d: `${BALL_L}M60 10V100`,
  e: 'M16 72.5H64A24 27.5 0 1 0 58 92',
  f: 'M60 16C56 9 50 8 46 8C38 8 34 14 34 24V100M20 45H52',
  g: `${BALL_L}M60 45V110C60 132 34 136 18 124`,
  h: `M20 10V100${HUMP(20, 40)}`,
  i: 'M40 45V100M40 23V25',
  j: 'M48 45V110C48 130 30 134 18 124M48 23V25',
  k: 'M22 10V100M58 45L22 79M35 67L60 100',
  l: 'M34 10V86C34 96 40 100 50 100',
  m: `M12 45V100${HUMP(12, 28)}${HUMP(40, 28)}`,
  n: `M20 45V100${HUMP(20, 40)}`,
  o: 'M65 72.5A25 27.5 0 1 1 15 72.5A25 27.5 0 1 1 65 72.5',
  p: `M20 45V130${BALL_R}`,
  q: `${BALL_L}M60 45V130`,
  r: 'M24 45V100M24 66C28 52 38 45 49 45C55 45 59 47 62 51',
  s: 'M58 53C54 47 47 45 40 45C30 45 22 50 22 58C22 67 30 69 40 72C51 75 59 78 59 87C59 96 50 100 40 100C31 100 24 97 20 91',
  t: 'M38 22V86C38 96 44 100 54 100M22 45H56',
  u: 'M20 45V80C20 93 28 100 40 100C52 100 60 93 60 80M60 45V100',
  v: 'M18 45L40 100L62 45',
  w: 'M8 45L23 100L40 56L57 100L72 45',
  x: 'M20 45L60 100M60 45L20 100',
  y: 'M18 45L41 99M63 45L32 130',
  z: 'M20 45H60L20 100H60',
  // An empty spelling space: the line its letter will sit on.
  _: 'M12 108H68',
}
const SVG_NS = 'http://www.w3.org/2000/svg'

// A label keeps its text (for screen readers and tests); a lowercase letter is shown drawn.
function fillLabel(text, value) {
  text.textContent = value
  const d = LETTER_PATHS[value]
  text.classList.toggle('glyph', GLYPH.test(value) || !!d)
  text.classList.toggle('letter', !!d)
  text.classList.toggle('blank', value === '_')
  if (!d) return
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 3 80 135')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  svg.append(path)
  const hidden = document.createElement('span')
  hidden.className = 'letter-text'
  hidden.textContent = value
  text.replaceChildren(svg, hidden)
}
// Blender toy materials that a `tint` may repaint.
const TINTABLE = ['#edab72', '#8bbddf']
const MAX_CONFETTI = 180

// Saved progress is optional: a blocked or corrupt store falls back to defaults.
const storageKey = `${game.id}:learning:v1`
const saved = { completed: [0, 0, 0], muted: false, level: 0 }
try {
  const old = JSON.parse(localStorage.getItem(storageKey))
  if (old) {
    if (Array.isArray(old.completed)) saved.completed = old.completed
    if (typeof old.muted === 'boolean') saved.muted = old.muted
    if ([0, 1, 2].includes(old.level)) saved.level = old.level
  }
} catch {}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved))
  } catch {}
}

const state = { screen: 'loading', level: saved.level, round: 0, seed: game.seed, challenge: null, solved: false, token: 0 }
const timers = new Set()
const targets = []
const owned = [] // geometries and materials disposed when the board clears
const listenerCleanup = []
const motions = []
const dots = []
let renderer, scene, camera, board, kit, confetti
let renderRequested = true

function requestRender() {
  renderRequested = true
  if (renderer) renderer.shadowMap.needsUpdate = true
}

// Bumping the token makes pending `later` callbacks and active traces stale.
function cancel() {
  for (const remove of listenerCleanup) remove()
  listenerCleanup.length = 0
  motions.length = 0
  state.token++
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  audio.stop()
}

function listen(element, handlers) {
  for (const [type, handler] of Object.entries(handlers)) element.addEventListener(type, handler)
  listenerCleanup.push(() => {
    for (const [type, handler] of Object.entries(handlers)) element.removeEventListener(type, handler)
  })
}

// Eased animation; a new motion with the same key replaces the old one.
function animate(seconds, update, key) {
  if (key) {
    for (let i = motions.length - 1; i >= 0; i--) if (motions[i].key === key) motions.splice(i, 1)
  }
  if (reduced) {
    update(1)
    requestRender()
    return
  }
  update(0)
  motions.push({ elapsed: 0, seconds, update, key })
  requestRender()
}

function later(fn, ms) {
  const token = state.token
  const timer = setTimeout(() => {
    timers.delete(timer)
    if (token === state.token) fn()
  }, ms)
  timers.add(timer)
  return timer
}

function material(colour) {
  const result = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, metalness: 0.03 })
  owned.push(result)
  return result
}

function mesh(geometry, colour) {
  owned.push(geometry)
  const result = new THREE.Mesh(geometry, material(colour))
  result.castShadow = result.receiveShadow = true
  return result
}

function line(geometry, colour) {
  const lineMaterial = new THREE.LineBasicMaterial({ color: colour })
  owned.push(geometry, lineMaterial)
  return new THREE.Line(geometry, lineMaterial)
}

function block(w, h, d, colour) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.09, h * 0.4)), colour)
}

// A copy of a Blender toy, scaled to fit `maxSize` and standing on y = 0.
function model(name, maxSize = 1) {
  const original = kit?.getObjectByName(name)
  if (!original) throw new Error(`Missing Blender toy: ${name}`)
  const copy = original.clone(true)
  copy.position.set(0, 0, 0)
  copy.rotation.set(0, 0, 0)
  copy.scale.setScalar(1)
  const box = new THREE.Box3().setFromObject(copy)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const scale = maxSize / Math.max(size.x, size.y, size.z)
  copy.scale.setScalar(scale)
  copy.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)
  copy.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  return copy
}

function starGeometry(size) {
  const outline = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5
    const radius = i % 2 ? size * 0.24 : size * 0.53
    const x = Math.sin(angle) * radius
    const y = Math.cos(angle) * radius
    if (i === 0) outline.moveTo(x, y)
    else outline.lineTo(x, y)
  }
  outline.closePath()
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.14, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, steps: 1 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function shape(name, colour, size = 0.85) {
  let geometry
  if (name === 'Circle') geometry = new THREE.CylinderGeometry(size / 2, size / 2, 0.16, 48)
  else if (name === 'Triangle') geometry = new THREE.CylinderGeometry(size * 0.6, size * 0.6, 0.16, 3)
  else if (name === 'Square') geometry = new THREE.BoxGeometry(size, 0.16, size)
  else geometry = starGeometry(size)
  return mesh(geometry, colour)
}

// Adds an object to a parent (the board by default) at a position.
function place(object, x, y, z, parent = board) {
  object.position.set(x, y, z)
  parent.add(object)
  return object
}

// A Blender toy in its own group, so it can move and scale without touching the model's offsets.
function actor(name, size, x = 0, z = 0, y = 0.2, parent = board) {
  const root = new THREE.Group()
  root.add(model(name, size))
  return place(root, x, y, z, parent)
}

function polyline(points, colour) {
  return line(new THREE.BufferGeometry().setFromPoints(points), colour)
}

function clear() {
  requestRender()
  for (const t of targets) t.button.remove()
  targets.length = 0
  board.clear()
  for (const resource of owned) resource.dispose()
  owned.length = 0
  $('actions').replaceChildren()
  $('feedback').textContent = ''
  $('feedback').className = ''
}

// A 3D piece on the board with a native button positioned over it.
function tile({
  x = 0,
  z = 0,
  label = '',
  symbol = '',
  model: toy,
  colour = PLAIN_TILE,
  size = 1.35,
  depth = 1.35,
  onTap,
  visual = false,
  shape: shapeName,
  scale = 1,
  thin = false,
  tint,
} = {}) {
  requestRender()
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  board.add(group)

  const base = thin ? mesh(new THREE.CylinderGeometry(size / 2, size / 2, 0.1, 32), colour) : block(size, 0.16, depth, colour)
  base.position.y = 0.08
  group.add(base)

  let figure = null
  if (toy) figure = model(toy, Math.min(size * 0.8, 1) * scale)
  else if (shapeName) figure = shape(shapeName, colour === PLAIN_TILE ? game.accent : colour, size * 0.6)
  if (figure) {
    figure.position.y += 0.19
    group.add(figure)
    if (tint) {
      figure.traverse((o) => {
        if (o.isMesh && TINTABLE.includes(o.material.name)) o.material = material(tint)
      })
    }
  }

  const button = document.createElement('button')
  button.className = `world-action${visual ? ' visual' : ''}`
  button.type = 'button'
  button.setAttribute('aria-label', label || symbol || toy || 'Game piece')
  if (symbol) {
    const symbolText = document.createElement('span')
    symbolText.className = 'symbol'
    symbolText.textContent = symbol
    button.append(symbolText)
  }
  const text = document.createElement('span')
  text.className = 'label'
  fillLabel(text, label)
  if (label) button.append(text)
  if (visual) {
    button.tabIndex = -1
    button.setAttribute('aria-hidden', 'true')
  }
  $('targets').append(button)

  const t = {
    group,
    button,
    base,
    figure,
    x,
    z,
    size,
    depth,
    bounce: 0,
    label(value) {
      value = String(value)
      fillLabel(text, value)
      if (value) {
        if (!text.parentNode) button.append(text)
        button.setAttribute('aria-label', value)
      } else {
        text.remove()
      }
    },
    select(value) {
      requestRender()
      button.classList.toggle('selected', value)
      button.setAttribute('aria-pressed', String(value))
      base.material.color.set(value ? game.accent : colour)
    },
    flash(value) {
      button.classList.toggle('flash', value)
    },
    enable(value) {
      button.disabled = !value
    },
    hop() {
      requestRender()
      t.bounce = reduced ? 0 : 0.45
    },
    move(nx, nz) {
      requestRender()
      group.position.x = nx
      group.position.z = nz
    },
  }
  if (onTap) {
    button.addEventListener('click', (e) => {
      // A finished drag already acted; ignore its pointer click but not keyboard clicks (detail 0).
      const afterDrag = t.skipClick && e.detail !== 0
      t.skipClick = false
      if (afterDrag || state.screen !== 'play' || state.solved) return
      audio.unlock()
      t.hop()
      onTap(t)
    })
  }
  targets.push(t)
  return t
}

function grid(values, callback, { columns = values.length > 4 ? 4 : values.length, spacing = 1.85, z = 0, ...options } = {}) {
  const rows = Math.ceil(values.length / columns)
  return values.map((value, i) =>
    tile({
      x: ((i % columns) - (columns - 1) / 2) * spacing,
      z: z + (Math.floor(i / columns) - (rows - 1) / 2) * spacing,
      ...options,
      ...callback(value, i),
    }),
  )
}

function action(label, fn, { primary = false, pressed, disabled = false } = {}) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.className = primary ? 'primary' : ''
  button.disabled = disabled
  if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed))
  button.addEventListener('click', () => {
    audio.unlock()
    fn(button)
  })
  $('actions').append(button)
  return button
}

function readout(text) {
  const element = document.createElement('span')
  element.className = 'readout'
  element.textContent = text
  $('actions').append(element)
  return element
}

// `spoken` replaces the words read aloud, e.g. a list of letter names.
function feedback(message, good = false, spoken = message) {
  $('feedback').textContent = message
  $('feedback').className = good ? 'good' : 'try'
  audio.speak(spoken)
}

function success(message = state.challenge.fact || 'Wonderful thinking!', spoken = message) {
  if (state.solved) return
  state.solved = true
  audio.happy()
  feedback(message, true, spoken)
  burst()
  for (const button of $('actions').querySelectorAll('button')) button.disabled = true
  const last = state.round === 4
  action(last ? 'Finish adventure ★' : 'Next adventure step →', () => (last ? finish() : startRound(state.round + 1)), { primary: true })
}

function check(ok, message) {
  if (ok) {
    success()
    return
  }
  audio.note(262, 0.13)
  feedback(message || 'Take another look. You can try again!')
}

function positionTargets() {
  if (!camera) return
  const { width: w, height: h } = $('stage').getBoundingClientRect()
  const position = new THREE.Vector3()
  const projected = new THREE.Vector3()
  const left = new THREE.Vector3()
  const right = new THREE.Vector3()
  for (const t of targets) {
    t.group.getWorldPosition(position)
    projected.set(position.x, position.y + 0.17, position.z).project(camera)
    t.button.style.left = `${((projected.x + 1) * w) / 2}px`
    t.button.style.top = `${((1 - projected.y) * h) / 2}px`
    left.set(position.x - t.size / 2, position.y + 0.1, position.z).project(camera)
    right.set(position.x + t.size / 2, position.y + 0.1, position.z).project(camera)
    t.button.style.width = `${Math.max(44, ((right.x - left.x) * w) / 2)}px`
    t.button.style.height = `${Math.max(44, ((t.depth * w) / (camera.right - camera.left)) * 0.85)}px`
  }
}

// Fit at least 10 world units across, more on wide screens.
function resize() {
  requestRender()
  if (!renderer) return
  const { width: w, height: h } = $('stage').getBoundingClientRect()
  if (!w || !h) return
  renderer.setSize(w, h, false)
  const aspect = w / h
  const halfWidth = Math.max(5, 3.6 * aspect)
  const halfHeight = halfWidth / aspect
  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.updateProjectionMatrix()
  // Letters and numbers on the pieces scale with them, so short wide windows don't crowd the board.
  $('targets').style.setProperty('--unit', `${w / (2 * halfWidth)}px`)
  positionTargets()
}

function show(screen) {
  state.screen = screen
  $('menu').hidden = screen !== 'menu'
  $('lesson').hidden = screen !== 'play'
  $('actions').hidden = screen !== 'play'
  $('win').hidden = screen !== 'win'
  $('footer').hidden = screen === 'win'
  requestAnimationFrame(resize)
}

function menu() {
  cancel()
  clear()
  show('menu')
  state.challenge = null
  tile({ model: game.hero || game.item || game.scenery[3], x: 0, z: 2, size: 1.8, visual: true })
  const completed = saved.completed.reduce((sum, count) => sum + count, 0)
  $('saved').textContent = completed ? `${completed} adventures completed. Keep exploring!` : ''
}

function startRound(round = 0) {
  cancel()
  clear()
  state.round = round
  state.solved = false
  show('play')
  state.challenge = challenge(game, state.level, round, state.seed)
  $('round').textContent = `Step ${round + 1} of 5 · ${LEVEL_NAMES[state.level]}`
  $('progress').textContent = '★'.repeat(round) + '☆'.repeat(5 - round)
  $('prompt').textContent = state.challenge.prompt
  $('hint').textContent = game.instructions
  runActivity(state.challenge, game, api)
  resize()
  later(() => audio.speak($('prompt').textContent), 250)
}

function begin() {
  state.seed = game.seed + Math.floor(Math.random() * 1e6)
  startRound(0)
}

function finish() {
  cancel()
  clear()
  show('win')
  saved.completed[state.level] = (saved.completed[state.level] || 0) + 1
  saved.level = state.level
  save()
  // Spelling adventures recap the five words the child built, with their pictures.
  const spelled = game.mode === 'spell'
    ? Array.from({ length: 5 }, (_, round) => challenge(game, state.level, round, state.seed))
    : []
  const list = (words) => `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
  $('win-text').textContent = spelled.length
    ? `You spelled ${list(spelled.map((c) => `${c.picture} ${c.word.toLowerCase()}`))}. Every try helped you learn!`
    : `You explored ${game.skill.toLowerCase()}. Every try helped you learn!`
  audio.happy()
  audio.speak(spelled.length
    ? ['A wonderful adventure!', `You spelled ${list(spelled.map((c) => c.word.toLowerCase()))}.`]
    : 'A wonderful adventure! Every try helped you learn.')
  tile({ model: game.hero || 'rabbit', size: 2, x: 0, z: 2, visual: true })
  burst()
}

function burst() {
  for (let i = 0; i < (reduced ? 12 : 42); i++) {
    dots.push({
      p: new THREE.Vector3((Math.random() - 0.5) * 6, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3),
      v: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2),
      life: 1.3,
    })
  }
}

// Where a pointer meets the horizontal plane at `height`, or null.
function pointFromEvent(e, height = 0.25) {
  const rect = $('stage').getBoundingClientRect()
  const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, (-(e.clientY - rect.top) / rect.height) * 2 + 1)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3())
}

function screenPoint(p) {
  const v = new THREE.Vector3(p.x, p.y, p.z).project(camera)
  const rect = $('stage').getBoundingClientRect()
  return { x: rect.left + ((v.x + 1) * rect.width) / 2, y: rect.top + ((1 - v.y) * rect.height) / 2 }
}

// Drag a tile's button across the board. A short press (under 8px) stays a tap.
function onDrag(target, { move, drop, cancel: abortDrag }) {
  const button = target.button
  let origin = null
  let dragged = false
  let pointer = null
  listen(button, {
    pointerdown(e) {
      if (origin || state.screen !== 'play' || state.solved || button.disabled) return
      pointer = e.pointerId
      origin = [e.clientX, e.clientY]
      dragged = false
      target.skipClick = false
      button.setPointerCapture(e.pointerId)
      audio.unlock()
    },
    pointermove(e) {
      if (!origin || e.pointerId !== pointer || state.solved) return
      if (Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 8) dragged = true
      if (!dragged) return
      const p = pointFromEvent(e)
      if (p) move?.(p)
      requestRender()
    },
    pointerup(e) {
      if (!origin || e.pointerId !== pointer) return
      origin = null
      if (!dragged) return
      target.skipClick = true
      const p = pointFromEvent(e)
      if (p && !state.solved) drop(p)
      requestRender()
    },
    pointercancel() {
      origin = null
      dragged = false
      abortDrag?.()
      requestRender()
    },
  })
}

// Report board points under a finger or mouse held down on the stage.
function onTrace(fn, { ignoreTargets = false, planeHeight = 0.25, onStart, onEnd } = {}) {
  const stage = $('stage')
  const token = state.token
  let down = false
  let pointer = null
  const end = (e) => {
    if (e.pointerId !== pointer) return
    down = false
    onEnd?.()
  }
  listen(stage, {
    pointerdown(e) {
      if (down || (ignoreTargets && e.target.closest('.world-action')) || state.token !== token || state.solved || state.screen !== 'play') return
      down = true
      pointer = e.pointerId
      stage.setPointerCapture(e.pointerId)
      audio.unlock()
      onStart?.()
      fn(pointFromEvent(e, planeHeight))
    },
    pointermove(e) {
      if (down && e.pointerId === pointer && state.token === token && !state.solved) fn(pointFromEvent(e, planeHeight))
    },
    pointerup: end,
    pointercancel: end,
  })
}

// The toolkit each activity module receives. `board` is set once the scene exists.
const api = {
  tile, grid, action, readout, feedback, success, check, later, audio, animate,
  shape, mesh, line, polyline, block, model, material, place, actor,
  screenPoint, onDrag, onTrace,
  invalidate: requestRender,
  hint(text) { $('hint').textContent = text },
  prompt(text) { $('prompt').textContent = text },
  reset() { startRound(state.round) },
}

$('play').disabled = true
$('menu-emoji').textContent = game.emoji
$('tagline').textContent = game.tagline
$('age').textContent = `AGES ${game.ages.join('–')} · ${game.skill.toUpperCase()}`
$('menu-instructions').textContent = game.instructions
$('skill').textContent = game.skill
document.documentElement.style.setProperty('--sky', game.sky)
document.documentElement.style.setProperty('--accent', game.accent)
document.body.classList.toggle('dark', Boolean(game.theme === 'space' || game.night || game.id === 'firefly-lanterns'))

const levelButtons = [...document.querySelectorAll('[data-level]')]
function chooseLevel(level) {
  state.level = level
  saved.level = level
  save()
  for (const button of levelButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.level) === level))
}
chooseLevel(state.level)
for (const button of levelButtons) {
  button.onclick = () => {
    audio.unlock()
    chooseLevel(Number(button.dataset.level))
  }
}

$('play').onclick = () => {
  audio.unlock()
  begin()
}
$('again').onclick = $('play').onclick
$('home').onclick = menu
$('win-home').onclick = menu
$('listen').onclick = () => {
  audio.unlock()
  audio.speak($('prompt').textContent || game.instructions)
}

function updateMute() {
  audio.mute(saved.muted)
  $('mute').textContent = saved.muted ? '♪̸' : '♫'
  $('mute').setAttribute('aria-pressed', String(saved.muted))
  $('mute').setAttribute('aria-label', saved.muted ? 'Enable sound' : 'Mute sound')
}
$('mute').onclick = () => {
  audio.unlock()
  saved.muted = !saved.muted
  updateMute()
  save()
}
updateMute()

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') menu()
  else if (e.key === 'Enter' && state.screen === 'menu' && !$('play').disabled) begin()
})
addEventListener('pagehide', () => {
  cancel()
  renderer?.setAnimationLoop(null)
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.stop()
  else requestRender()
})
$('targets').addEventListener('click', requestRender)
$('actions').addEventListener('click', requestRender)

// Exposed to the browser tests.
if (debug) {
  const metrics = () => {
    if (!renderer) return null
    const { render, memory } = renderer.info
    return { frame: render.frame, calls: render.calls, triangles: render.triangles, geometries: memory.geometries }
  }
  window.__learning = { game, state, api, targets, startRound, begin, metrics }
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true })
  renderer.setPixelRatio(debugScale > 0 ? Math.max(0.5, Math.min(1.5, debugScale)) : Math.min(devicePixelRatio, 1.5))
  // Shadows are redrawn only when something changes (see requestRender).
  renderer.shadowMap.enabled = true
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
}

function createScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(game.sky)
  camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 80)
  camera.position.set(0, 12, 10)
  camera.lookAt(0, 0, 0)
  board = new THREE.Group()
  scene.add(board)
  api.board = board

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.28
  pmrem.dispose()

  scene.add(new THREE.HemisphereLight('#fff3da', '#9496b5', 1.5))
  const light = new THREE.DirectionalLight('#fff2df', 2.1)
  light.position.set(-4, 10, 5)
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.camera.left = light.shadow.camera.bottom = -6
  light.shadow.camera.right = light.shadow.camera.top = 6
  light.shadow.normalBias = 0.04
  light.shadow.bias = -0.0002
  scene.add(light)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: game.sky, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.85
  ground.receiveShadow = true
  scene.add(ground)

  const particles = new THREE.BufferGeometry()
  particles.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CONFETTI * 3), 3))
  confetti = new THREE.Points(particles, new THREE.PointsMaterial({ color: game.accent, size: 0.1, transparent: true, opacity: 0.85 }))
  confetti.frustumCulled = false
  scene.add(confetti)
}

function prepareWorld(world) {
  const toyOf = (o) => {
    while (o.parent && o.parent !== world) o = o.parent
    return o
  }
  world.traverse((o) => {
    // Hide scenery copies of the counted toy, e.g. `acorn.003`.
    if (game.item && o.name.replace(/[._]?\d+(?:[._]\d+)*$/, '') === game.item) o.visible = false
    if (!o.isMesh) return
    o.castShadow = o.receiveShadow = true
    const bounds = new THREE.Box3().setFromObject(o)
    const centre = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    // Keep foreground pieces legible; decorative copies of a counted toy
    // would also make the visible quantity ambiguous.
    const intrudes = bounds.max.x > -3.7 && bounds.min.x < 3.7 && bounds.max.z > -2.6 && bounds.min.z < 3.5
    // Hide the whole toy, not just its tallest part: a fox's eyes must not stay behind on their own.
    if (bounds.min.y > -0.05 && size.y > 0.3 && (centre.z > 2.4 || intrudes)) toyOf(o).visible = false
  })
  scene.add(world)
}

// Draw only after a request or while something moves, so the GPU rests while the child thinks.
function frame(dt) {
  const moving = targets.some((t) => t.bounce > 0) || dots.length > 0 || motions.length > 0
  if (!renderRequested && !moving) return
  if (moving) renderer.shadowMap.needsUpdate = true

  for (let i = motions.length - 1; i >= 0; i--) {
    const motion = motions[i]
    motion.elapsed += dt
    const t = Math.min(1, motion.elapsed / motion.seconds)
    motion.update(t * t * (3 - 2 * t))
    if (t === 1) motions.splice(i, 1)
  }
  // A hop ends at sin(0) = 0, back on the board; tiles that are not hopping keep their own height
  // (an experiment lowers its object into the water).
  for (const t of targets) {
    if (t.bounce > 0) {
      t.bounce = Math.max(0, t.bounce - dt)
      t.group.position.y = Math.sin((t.bounce / 0.45) * Math.PI) * 0.28
    }
  }
  for (let i = dots.length - 1; i >= 0; i--) {
    const dot = dots[i]
    dot.life -= dt
    dot.v.y -= dt * 5
    dot.p.addScaledVector(dot.v, dt)
    if (dot.life <= 0) dots.splice(i, 1)
  }

  const positions = confetti.geometry.attributes.position
  const count = Math.min(dots.length, MAX_CONFETTI)
  for (let i = 0; i < count; i++) positions.setXYZ(i, dots[i].p.x, dots[i].p.y, dots[i].p.z)
  positions.needsUpdate = true
  confetti.geometry.setDrawRange(0, count)

  positionTargets()
  renderer.render(scene, camera)
  renderRequested = false
}

async function main() {
  try {
    createRenderer()
    createScene()
    const loader = new GLTFLoader()
    const [world, toybox] = await Promise.all([loader.loadAsync('./models/world.glb'), loader.loadAsync('./models/toybox.glb')])
    kit = toybox.scene
    prepareWorld(world.scene)

    let last = performance.now()
    renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!document.hidden) frame(dt)
    })
    new ResizeObserver(resize).observe($('stage'))
    $('loading').hidden = true
    $('play').disabled = false
    menu()
    resize()
  } catch (error) {
    console.error(error)
    $('loading').hidden = true
    $('error').hidden = false
    $('menu').hidden = true
    $('error-text').textContent = 'Please check your connection and use a browser with 3D graphics. Then try loading again.'
  }
}

main()
