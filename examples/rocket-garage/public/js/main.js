import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Particles, Popups, Rings, makeGlowTexture } from './effects.js'
import { COLORS, DESTS, PARTS, SLOTS, flops, isSteady, isUnlocked, modelName, part, reach, sanitize, unlocksAt, wobble } from './parts.js'
import { Rocket } from './rocket.js'
import { Thumbs } from './thumbs.js'
import { STARS_PER_DOT, makeEventModels, pictureAt } from './events.js'

const $ = (id) => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const { clamp, damp, smoothstep, lerp } = THREE.MathUtils

// --- Saved bits (private windows may refuse storage, so everything is guarded) ------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  },
}

const SAVE = 'rocket-garage'
const saved = store.get(SAVE, {}) || {}
const visited = DESTS.map((_, i) => !!(Array.isArray(saved.visited) && saved.visited[i]))
// Gifts found so far ("slot:id"). Older saves had every gift of each planet they had been to.
const got = new Set(Array.isArray(saved.got) ? saved.got.filter((s) => typeof s === 'string') : DESTS.flatMap((_, i) => (visited[i] ? unlocksAt(i).map((n) => `${n.slot}:${n.id}`) : [])))
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0)
const save = {
  visited,
  got,
  rocket: sanitize(saved.rocket, got),
  fresh: new Set(Array.isArray(saved.fresh) ? saved.fresh.filter((s) => typeof s === 'string') : []),
  stars: Number.isFinite(saved.stars) ? saved.stars : 0,
  flights: Number.isFinite(saved.flights) ? saved.flights : 0,
  picked: !!saved.picked,
  // Where the last flight landed: the reach bar wears a little 🚀 under it
  landed: Number.isInteger(saved.landed) && saved.landed >= 0 && saved.landed < DESTS.length ? saved.landed : -1,
  // Stars caught for the star picture on the garage wall, and how many of them it already shows
  sky: count(saved.sky ?? saved.stars),
  skyShown: count(saved.skyShown ?? saved.sky ?? saved.stars),
  // Planet souvenirs already on the shelf, and the alien friend who came home from the Alien Planet
  shelf: DESTS.map((_, i) => !!(Array.isArray(saved.shelf) ? saved.shelf[i] : visited[i])),
  friend: !!saved.friend,
  friendHome: !!(saved.friendHome ?? saved.friend),
  // Places flown past (they leave a souvenir too), and the place picked on the reach bar
  waved: DESTS.map((_, i) => !!(Array.isArray(saved.waved) && saved.waved[i])),
  // A place picked on the reach bar lasts one trip, and is never brought back from the save
  aim: null,
}
function persist() {
  store.set(SAVE, { visited: save.visited, got: [...save.got], rocket: save.rocket, fresh: [...save.fresh], stars: save.stars, flights: save.flights, picked: save.picked, landed: save.landed, sky: save.sky, skyShown: save.skyShown, shelf: save.shelf, friend: save.friend, friendHome: save.friendHome, waved: save.waved })
}

// --- Renderer, scene, camera --------------------------------------------------------

const canvas = $('view')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// iPad touch displays: fewer pixels preserve battery and keep play responsive.
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.05
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400)
const TAN = Math.tan((camera.fov * Math.PI) / 360)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

// A lost WebGL context (an iPad short of memory) never leaves a blank garage: three.js takes the
// context back when the browser allows, and the room light is rebuilt. If it does not come back,
// a calm button opens the garage again (the save is kept).
let wakeTimer = 0
canvas.addEventListener('webglcontextlost', () => {
  persist()
  clearTimeout(wakeTimer)
  wakeTimer = setTimeout(() => show('wake'), 2500)
})
canvas.addEventListener('webglcontextrestored', () => {
  clearTimeout(wakeTimer)
  show('wake', false)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
})
$('wake-go').addEventListener('click', () => {
  persist()
  location.reload()
})
scene.environmentIntensity = 0.45
const hemi = new THREE.HemisphereLight('#eaf4ff', '#7a6aa8', 1.5)
scene.add(hemi)
const key = new THREE.DirectionalLight('#fff3e0', 2.5)
key.position.set(4, 8, 10)
scene.add(key, key.target)
const rim = new THREE.DirectionalLight('#8fd3ff', 1.2)
rim.position.set(-6, 4, -6)
scene.add(rim)

// Sky: a full-screen gradient drawn first
const SKY = {
  day: [new THREE.Color('#5fbfff'), new THREE.Color('#d4f1ff')],
  dusk: [new THREE.Color('#7a5cd6'), new THREE.Color('#ffb3c8')],
}
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uTop: { value: SKY.day[0].clone() }, uBottom: { value: SKY.day[1].clone() } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uTop; uniform vec3 uBottom; varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y)), 1.0);
      #include <colorspace_fragment>
    }`,
  depthWrite: false,
  depthTest: false,
})
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat)
sky.frustumCulled = false
sky.renderOrder = -10
scene.add(sky)

// Far stars that wrap around the camera as it climbs
const starField = (() => {
  const n = 380
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rand(-110, 110)
    pos[i * 3 + 1] = rand(0, 140)
    pos[i * 3 + 2] = rand(-110, -50)
    seed[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: makeGlowTexture(true) }, uCam: { value: 0 }, uTime: { value: 0 }, uAlpha: { value: 0 }, uScale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uCam; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        vec3 p = position;
        p.y = uCam + mod(p.y - uCam * 0.12, 140.0) - 70.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.35 + seed * 0.75) * uScale / -mv.z;
        vA = 0.55 + 0.45 * sin(uTime * (1.0 + seed * 3.0) + seed * 40.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uAlpha; varying float vA;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(t.rgb * t.a * vA * uAlpha * 0.85, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  pts.renderOrder = -5
  scene.add(pts)
  return pts
})()

const audio = new Audio()
// Sound and music start on with every visit (a muted game must never greet a returning child
// with silence); turning either off takes a press-and-hold, like 🏠 away from the garage.
const glowTex = makeGlowTexture(false)
const sparks = new Particles(scene, 900)
const smoke = new Particles(scene, 500, true)
const rings = new Rings(scene)
const popups = new Popups($('popups'), camera)

// --- Game state ----------------------------------------------------------------------

// Turbo needs three groups of five stars (stars are counted in fives)
const LAND = new THREE.Vector3(0, -2000, 0)
const PLANET_R = 4
const game = {
  state: 'loading', // loading | title | garage | countdown | flop | flight | arrive | landing | party
  t: 0,
  time: 0,
  tab: 'nose',
  count: 3,
  busy: false,
}
let models = {}
let rocket = null
let garage = null
let padTop = 0.24
let robot = null
let thumbs = null
const thumbCache = {}
const v3 = new THREE.Vector3()
const v3b = new THREE.Vector3()

// --- Assets -------------------------------------------------------------------------

async function load() {
  const loader = new GLTFLoader()
  const [p, w] = await Promise.all([loader.loadAsync('./models/parts.glb'), loader.loadAsync('./models/world.glb')])
  for (const g of [p, w]) for (const child of [...g.scene.children]) models[child.name] = child

  garage = models.garage
  scene.add(garage)
  padTop = 0.24
  // Arrange the helpers so they stay in view beside the rocket
  robot = {
    obj: garage.getObjectByName('garage_robot'),
    arm: garage.getObjectByName('garage_robot_arm'),
    armL: garage.getObjectByName('garage_robot_arm_l'),
    toolbox: garage.getObjectByName('garage_toolbox'),
    turn: 0.35,
    wave: 2,
    spin: 0,
  }
  placeHelpers()
  garage.traverse((o) => {
    if (o.isMesh && o.material.name === 'pad_light') {
      o.material = o.material.clone()
      padLights.push(o.material)
    }
  })
  doors.l = garage.getObjectByName('garage_door_l')
  doors.r = garage.getObjectByName('garage_door_r')
  doors.arm = garage.getObjectByName('garage_gantry_arm')
  doors.armX = doors.arm.position.x

  // The comet's glowing tail used to stream straight away from the camera, hidden behind the
  // comet. Swing it out to the left and up a little, so it fans out beside the comet everywhere.
  const comet = models.dest_comet
  for (const [i, t] of comet.children.filter((c) => c.name.startsWith('comet_tail')).entries()) {
    const spread = (i - 1) * 0.22
    t.quaternion.setFromUnitVectors(v3.set(0, 1, 0), v3b.set(-1, 0.75 + spread, -0.6).normalize())
    t.position.set(-0.3, 0.05 + spread * 0.6, -0.35)
    t.scale.set(1, 0.62, 1)
    t.traverse((o) => {
      if (o.isMesh && !o.material.userData.glow) {
        o.material.userData.glow = true
        o.material.opacity = Math.min(0.7, o.material.opacity * 1.4)
        o.material.emissiveIntensity *= 1.6
      }
    })
  }

  Object.assign(models, makeEventModels(models, glowTex))
  buildWall()

  rocket = new Rocket(models, glowTex)
  scene.add(rocket.root)
  rocket.build(save.rocket)
  placeOnPad()
  scene.add(shadow)

  thumbs = new Thumbs(128)
  const allThumbs = () => { for (const slot of SLOTS) for (const pt of PARTS[slot.id]) makeThumb(slot.id, pt.id) }
  allThumbs()
  // Pictures drawn while the thumbnail context was lost are blank: draw them all again
  thumbs.canvas.addEventListener('webglcontextrestored', () => {
    allThumbs()
    renderTray()
  })
}

/**
 * The robot and the toolbox stand beside the rocket. The 🎲 and 🚀 buttons sit at the bottom
 * left on every screen, so the robot always stands on the right (in view and tappable) and the
 * toolbox takes the left.
 */
const ROBOT_X = 2.1
function placeHelpers() {
  if (!robot) return
  robot.obj.position.set(ROBOT_X, 0, 1.2) // close enough that the tray's edge never cuts it off
  robot.turn = -0.35
  robot.obj.rotation.y = robot.turn
  robot.toolbox.position.set(-2.5, 0, 1.5)
  robot.toolbox.rotation.y = 0.4
  // The alien friend stands back behind the pad on the left, under the star picture, where the
  // 🎲 and 🚀 buttons never cover it (they sit low in the corner)
  if (wall.friend) wall.friend.position.set(-1.75, wall.friend.userData.feet, -1.25)
}

const padLights = []
const doors = { l: null, r: null, arm: null, armX: 0, open: 0 }

/** Soft round shadow under the rocket on the pad. */
const shadow = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(40,30,80,0.45)')
  grad.addColorStop(1, 'rgba(40,30,80,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  return m
})()

const thumbPaint = {}
// Boosters are pictured nearly to one shared scale, so bigger ones look bigger, but the scale is
// eased (not true size) so the small booster still reads clearly in the tray
const BOOSTER_R = 0.84
const boosterRadius = (id) => BOOSTER_R * (0.6 + 0.4 * (part('booster', id).r ?? 0.32) / 0.32)
function makeThumb(slot, id) {
  if (id === 'none') return null
  const obj = models[modelName(slot, id)].clone()
  if (slot === 'pilot') {
    obj.getObjectByName(`${id}_body`).visible = false
    obj.getObjectByName(`${id}_helmet`).visible = false
  }
  const colors = save.rocket.colors
  if (slot in colors) {
    thumbPaint[slot] ??= (() => {
      let base = null
      obj.traverse((o) => {
        if (!base && o.isMesh && o.material.name.startsWith('paint')) base = o.material
      })
      return base ? base.clone() : null
    })()
    if (thumbPaint[slot]) {
      thumbPaint[slot].color.set(colors[slot])
      obj.traverse((o) => {
        if (o.isMesh && o.material.name.startsWith('paint')) o.material = thumbPaint[slot]
      })
    }
  }
  const opts = slot === 'sticker' ? { turn: 0, tilt: 0, fill: 0.78 } : slot === 'pilot' ? { turn: -0.15, tilt: 0.05, fill: 0.86 } : slot === 'booster' ? { turn: -0.3, fill: 0.8, radius: boosterRadius(id) } : {}
  thumbCache[`${slot}:${id}`] = thumbs.shot(obj, opts)
  return thumbCache[`${slot}:${id}`]
}

function thumbOf(slot, id) {
  if (id === 'none') return thumbCache[`${slot}:${PARTS[slot][1].id}`]
  return thumbCache[`${slot}:${id}`] ?? makeThumb(slot, id)
}

/**
 * A wobbly rocket rocks gently on its feet for a few seconds after a part goes on, then settles;
 * a steady one stands still. So the child sees what a nose, tank or fins does before flying.
 */
const PAD_SWAY = 3.6
let padSway = 0
function swayOnPad() {
  padSway = isSteady(save.rocket) ? 0 : PAD_SWAY
}
function updatePadSway(dt) {
  if (padSway <= 0 || (game.state !== 'garage' && game.state !== 'title')) return
  padSway = Math.max(0, padSway - dt)
  const u = 1 - padSway / PAD_SWAY
  // Rises, then fades: three slow rocks, pivoting on the fins so it never slides off the pad
  const a = Math.sin(u * Math.PI * 6) * 0.09 * Math.sin(u * Math.PI) * (0.6 + wobble(save.rocket) * 0.6)
  rocket.wobbler.rotation.z = a
  rocket.wobbler.position.x = -rocket.half * Math.sin(a)
}

function placeOnPad() {
  rocket.root.scale.setScalar(1)
  rocket.root.position.set(0, padTop + rocket.half, 0)
  rocket.root.rotation.set(0, 0, 0)
  rocket.wobbler.rotation.set(0, 0, 0)
  rocket.wobbler.position.set(0, 0, 0)
  shadow.position.set(0, padTop + 0.01, 0)
  shadow.scale.setScalar(rocket.width * 1.4 + 0.6)
  shadow.visible = true
  if (rocket.pilot) rocket.pilot.visible = true
}

// --- Layout & camera ----------------------------------------------------------------

const cam = { x: 0, y: 2.5, d: 14, ox: 0, oy: 0, tilt: 0.12, snap: true }
const view = { w: 1, h: 1, hw: 5, hh: 5, landscape: true }

function freeRect() {
  const r = { x: 0, y: 0, w: innerWidth, h: innerHeight }
  const top = $('topbar').classList.contains('hidden') ? 0 : innerHeight <= 500 ? 56 : 70
  r.y = top
  r.h -= top
  if (game.state === 'title') {
    const a = document.querySelector('.title-top').getBoundingClientRect()
    const b = document.querySelector('.title-bottom').getBoundingClientRect()
    r.y = a.bottom
    if (view.landscape && innerHeight <= 500) {
      // Short sideways screens: the Play button sits in the corner, beside the rocket
      r.h = innerHeight - a.bottom - 6
      r.w = b.left - 8
    } else r.h = Math.max(120, b.top - a.bottom)
  } else if (game.state === 'garage') {
    const t = $('tray').getBoundingClientRect()
    if (view.landscape) {
      r.w = t.left - 10
      if (innerHeight <= 500) {
        // The buttons stack in the bottom-left corner: keep the rocket to their right
        const a = $('actions').getBoundingClientRect()
        r.x = a.right + 2
        r.w = t.left - 6 - r.x
      }
    } else {
      r.h = t.top - r.y
      // The launch column sits on the left, just above the tray
      const a = $('actions').getBoundingClientRect()
      r.x = a.right + 4
      r.w = innerWidth - r.x - 4
    }
  } else if (game.state === 'party' && !$('reward').classList.contains('hidden')) {
    const c = $('reward').querySelector('.card').getBoundingClientRect()
    if (view.landscape) r.w = Math.max(160, c.left - 10)
    else r.h = Math.max(120, c.top - r.y)
  }
  return r
}

/** Where the camera wants to be for the current state. */
function camTarget(out) {
  const aspect = innerWidth / innerHeight
  if (game.state === 'title' || game.state === 'garage' || game.state === 'countdown' || game.state === 'loading') {
    const f = game.state === 'countdown' ? { x: 0, y: 0, w: innerWidth, h: innerHeight } : freeRect()
    const H = rocket ? rocket.half * 2 + 0.7 : 5
    const W = rocket ? Math.max(rocket.width, 1.8) + 1.0 : 3
    let d = Math.max((H * innerHeight) / (0.72 * f.h * 2 * TAN), (W * innerHeight) / (0.6 * f.w * 2 * TAN))
    // In the garage the robot beside the rocket stays in the picture too (not under the tray)
    if (game.state === 'garage') d = Math.max(d, (2 * (ROBOT_X + 0.65) * innerHeight) / (0.97 * f.w * 2 * TAN))
    d = clamp(d, 8, 60)
    out.x = 0
    out.y = padTop + (rocket ? rocket.half : 2.4)
    out.d = d
    out.ox = innerWidth / 2 - (f.x + f.w / 2)
    out.oy = innerHeight / 2 - (f.y + f.h / 2)
    out.tilt = 0.12
    if (game.state === 'title') out.x = Math.sin(game.time * 0.3) * 0.4
    return out
  }
  if (game.state === 'flop') {
    // Pulled back a little, so the whole sputtering hop and the bounces stay in the picture
    const H = (rocket ? rocket.half * 2 : 5) + FLOP_UP + 1.6
    const d = clamp(Math.max((H * innerHeight) / (0.86 * innerHeight * 2 * TAN), (6 * innerHeight) / (0.7 * innerWidth * 2 * TAN)), 10, 70)
    out.x = 0
    out.y = padTop + H * 0.48
    out.d = d
    out.ox = 0
    out.oy = 0
    out.tilt = 0.08
    return out
  }
  if (game.state === 'flight' || game.state === 'arrive') {
    const d = Math.max(15, 5.4 / (TAN * aspect))
    out.d = d
    out.x = rocket.root.position.x * 0.25
    out.y = rocket.root.position.y + d * TAN * 0.32
    out.ox = 0
    out.oy = 0
    out.tilt = 0.04
    return out
  }
  // Landing and party on a little planet
  // Frame from just above the rocket's nose down to the planet's smile, so the landing party
  // fills the free space (the lower half of the little planet can fall off the bottom).
  const f = freeRect()
  const top = LAND.y - 1.4 + (rocket ? rocket.half * 1.6 : 3.6) + 0.5
  const bottom = LAND.y - 6
  const H = top - bottom
  const W = 9
  const d = clamp(Math.max((H * innerHeight) / (f.h * 2 * TAN), (W * innerHeight) / (f.w * 2 * TAN)), 10, 70)
  out.d = d
  out.x = 0
  out.y = (top + bottom) / 2 - 0.4
  out.ox = innerWidth / 2 - (f.x + f.w / 2)
  out.oy = innerHeight / 2 - (f.y + f.h / 2)
  out.tilt = 0.16
  return out
}

const camGoal = { x: 0, y: 0, d: 0, ox: 0, oy: 0, tilt: 0 }
function updateCamera(dt) {
  camTarget(camGoal)
  const follow = game.state === 'flight' || game.state === 'arrive'
  if (cam.snap) {
    Object.assign(cam, camGoal)
    cam.snap = false
  } else {
    const k = 4
    cam.x = damp(cam.x, camGoal.x, k, dt)
    cam.y = follow ? damp(cam.y, camGoal.y, game.state === 'flight' && game.t < 3 ? 3 : 12, dt) : damp(cam.y, camGoal.y, k, dt)
    cam.d = damp(cam.d, camGoal.d, follow ? 1.5 : k, dt)
    cam.ox = damp(cam.ox, camGoal.ox, k, dt)
    cam.oy = damp(cam.oy, camGoal.oy, k, dt)
    cam.tilt = damp(cam.tilt, camGoal.tilt, 2, dt)
  }
  camera.position.set(cam.x, cam.y + cam.d * cam.tilt, cam.d)
  camera.lookAt(cam.x, cam.y, 0)
  camera.setViewOffset(innerWidth, innerHeight, cam.ox, cam.oy, innerWidth, innerHeight)
  view.hh = TAN * cam.d
  view.hw = view.hh * (innerWidth / innerHeight)
  // The key light follows so shadows of the sun feel the same everywhere
  key.position.set(cam.x + 4, cam.y + 8, 10)
  key.target.position.set(cam.x, cam.y, 0)
}

/** In portrait the launch button sits just above the tray. */
function layoutActions() {
  const a = $('actions')
  if (view.landscape || $('tray').classList.contains('hidden')) {
    a.style.bottom = ''
    return
  }
  const t = $('tray').getBoundingClientRect()
  a.style.bottom = `${innerHeight - t.top + 12}px`
}

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  view.landscape = w > h * 1.05
  document.body.classList.toggle('landscape', view.landscape)
  document.body.classList.toggle('portrait', !view.landscape)
  const hpx = h * renderer.getPixelRatio()
  sparks.setScale(hpx, camera.fov)
  smoke.setScale(hpx, camera.fov)
  starField.material.uniforms.uScale.value = hpx / (2 * TAN)
  if (!$('tray').classList.contains('hidden')) fitItems()
  layoutActions()
  placeHelpers()
  placeFinger()
}
addEventListener('resize', resize)

// --- Screens & HUD --------------------------------------------------------------------

function show(id, on = true) {
  $(id).classList.toggle('hidden', !on)
}

let bannerTimer = 0
function banner(text, ms = 2200, top = false) {
  const el = $('banner')
  el.textContent = text
  // Celebrations sit up in the top bar, clear of the rocket and the dancing pilot
  el.classList.toggle('top', top)
  // In the garage, pop up over the rocket's side of the screen rather than over the tray
  if (game.state === 'garage' && !top) {
    const f = freeRect()
    el.style.left = `${f.x + f.w / 2}px`
  } else el.style.left = ''
  el.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms)
}

function renderSound() {
  $('sound').textContent = audio.muted ? '🔇' : '🔊'
  $('music').classList.toggle('off', !audio.musicOn)
}

/**
 * The journey bar in the garage: every place, a 🚩 where you have landed, and the 🚀 under the
 * place this rocket will fly to. Its boosters reach so far; tapping a nearer place flies there
 * instead (a farther one shakes no, and the booster tab wiggles).
 */
function aimAt() {
  const far = reach(save.rocket)
  return save.aim !== null && save.aim <= far ? save.aim : far
}
function renderReach(ping = -1) {
  const r = aimAt()
  const far = reach(save.rocket)
  const el = $('reach')
  el.innerHTML = ''
  DESTS.forEach((d, i) => {
    if (i > 0) {
      const dash = document.createElement('span')
      dash.className = 'dash' + (i <= r ? ' lit' : '')
      el.append(dash)
    }
    const s = document.createElement('button')
    // Places never landed on are dark silhouettes; places past the boosters' reach are faded
    s.className = 'd' + (save.visited[i] ? '' : ' far') + (i > far ? ' out' : '') + (i === r ? ' goal' : '') + (i === ping ? ' ping' : '')
    s.dataset.i = i
    s.setAttribute('aria-label', d.name)
    s.textContent = d.emoji
    if (save.visited[i]) {
      const f = document.createElement('span')
      f.className = 'flag'
      f.textContent = '🚩'
      s.append(f)
    }
    el.append(s)
  })
}
const reachDot = (i) => $('reach').querySelector(`.d[data-i="${i}"]`)
$('reach').addEventListener('click', (e) => {
  const b = e.target.closest('.d')
  if (!b || game.state !== 'garage') return
  audio.unlock()
  const i = Number(b.dataset.i)
  if (i > reach(save.rocket)) {
    // Too far for these boosters: a soft no, and the booster tab wiggles
    audio.nope()
    renderReach()
    reachDot(i)?.classList.add('no')
    const tab = $('tabs').querySelector('[data-slot="booster"]')
    tab.classList.remove('shake')
    void tab.offsetWidth
    tab.classList.add('shake')
    return
  }
  save.aim = i === reach(save.rocket) ? null : i
  audio.snap(i)
  robot.wave = 1.5
  renderReach(i)
  persist()
})

function renderVisited() {
  const el = $('visited')
  el.innerHTML = save.visited.some(Boolean) ? DESTS.map((d, i) => `<span class="${save.visited[i] ? '' : 'no'}">${d.emoji}</span>`).join('') : ''
}

// --- Tray ---------------------------------------------------------------------------

function slotDef(id) {
  return SLOTS.find((s) => s.id === id)
}

function renderTray() {
  const tabs = $('tabs')
  tabs.innerHTML = ''
  // Only the tab holding the newest gift wears a ✨ (seven sparkles at once would mean nothing)
  const newest = [...save.fresh].pop()?.split(':')[0]
  for (const s of SLOTS) {
    const b = document.createElement('button')
    b.className = 'tab' + (s.id === game.tab ? ' on' : '')
    b.dataset.slot = s.id
    b.setAttribute('aria-label', s.id)
    const img = document.createElement('img')
    img.src = thumbOf(s.id, save.rocket[s.id]) ?? ''
    img.alt = ''
    b.append(img)
    if (s.id === newest) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      dot.textContent = '✨'
      b.append(dot)
    }
    tabs.append(b)
  }
  renderItems()
  renderPaints()
  fitItems()
  layoutActions()
  renderReach()
}

function renderItems() {
  const el = $('items')
  el.innerHTML = ''
  const slot = game.tab
  // Only the newest gift wears a ✨, like the tabs
  const newest = [...save.fresh].pop()
  for (const p of PARTS[slot]) {
    const b = document.createElement('button')
    const open = isUnlocked(p, save.got)
    b.className = 'item' + (save.rocket[slot] === p.id ? ' on' : '') + (open ? '' : ' locked')
    b.dataset.id = p.id
    b.setAttribute('aria-label', `${slot} ${p.id}`)
    if (p.id === 'none') {
      const n = document.createElement('span')
      n.className = 'none'
      n.textContent = '🚫'
      b.append(n)
    } else {
      const img = document.createElement('img')
      img.src = thumbOf(slot, p.id) ?? ''
      img.alt = ''
      b.append(img)
    }
    if (!open) {
      b.insertAdjacentHTML('beforeend', `<span class="lock">🔒</span><span class="where">${DESTS[p.at].emoji}</span>`)
    } else if (newest === `${slot}:${p.id}`) {
      b.insertAdjacentHTML('beforeend', '<span class="new">✨</span>')
    }
    el.append(b)
  }
}

/**
 * Every part stays in view without scrolling (a hidden second row of locked parts was easy to
 * miss on short phones): when the tray's own grid would overflow, pick the column count that
 * gives the biggest squares that all fit.
 */
function fitItems() {
  const el = $('items')
  el.style.gridTemplateColumns = ''
  el.style.justifyContent = ''
  const n = el.children.length
  if (!n || !el.clientHeight) return
  const overflow = el.scrollHeight > el.clientHeight + 2
  const cs = getComputedStyle(el)
  const gap = parseFloat(cs.columnGap) || 6
  const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const H = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4
  // Big trays (tablets, desktops) used to show small parts above a large empty space: the parts
  // grow into it (up to a chunky 168px, keeping as many in a row as fit), so they are easier to see and tap.
  const cap = overflow ? Infinity : 168
  let best = 0
  let cols = n
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c)
    const size = Math.min(cap, (W - (c - 1) * gap) / c, (H - (r - 1) * gap) / r)
    if (size > best + 0.5 || (size > best - 0.5 && cap < Infinity)) {
      best = size
      cols = c
    }
  }
  if (!overflow && best < el.children[0].offsetWidth + 12) return
  el.style.gridTemplateColumns = `repeat(${cols}, ${Math.floor(best)}px)`
  el.style.justifyContent = 'center'
}

function renderPaints() {
  const el = $('paints')
  el.innerHTML = ''
  if (!slotDef(game.tab).paint) return
  for (const c of COLORS) {
    const b = document.createElement('button')
    b.className = 'swatch' + (save.rocket.colors[game.tab] === c ? ' on' : '')
    b.style.setProperty('--c', c)
    b.dataset.color = c
    b.setAttribute('aria-label', `paint ${c}`)
    el.append(b)
  }
}

function setTab(slot) {
  if (game.tab === slot) return
  game.tab = slot
  renderTray()
}

/** Put a part on the rocket. */
function choose(slot, id, { quiet = false } = {}) {
  const p = part(slot, id)
  if (!isUnlocked(p, save.got)) return nope(slot, id)
  const same = save.rocket[slot] === id
  save.rocket[slot] = id
  save.fresh.delete(`${slot}:${id}`)
  if (slot === 'booster' && !same) save.aim = null
  if (!save.picked) {
    save.picked = true
    hintStep()
  }
  rocket.build(save.rocket, slot)
  if (game.state === 'garage' || game.state === 'title') placeOnPad()
  if (!same) swayOnPad()
  if (!quiet) {
    audio.snap(PARTS[slot].indexOf(p))
    sparkleAt(slot)
    if (slot === 'pilot') audio.whistle(true)
  }
  if (!same || slot === game.tab) renderTray()
  persist()
}

function nope(slot, id) {
  audio.nope()
  const b = [...$('items').children].find((x) => x.dataset.id === id)
  if (b) {
    b.classList.remove('shake')
    void b.offsetWidth
    b.classList.add('shake')
  }
  const p = part(slot, id)
  if (p.at >= 0) renderReach(p.at)
}

function sparkleAt(slot) {
  const o = slot === 'booster' ? rocket.boosters[0] : rocket.parts[slot]
  if (!o) return
  o.updateWorldMatrix(true, true)
  const b = new THREE.Box3().setFromObject(o)
  b.getCenter(v3)
  v3.z += 0.6
  sparks.burst(v3, ['#fff3a0', '#ffd23f', '#ffffff', '#8ef0c8'], 9, 2.4, 0.55)
  rings.spawn(v3, '#fff3a0', 2.4, 0.4)
}

function nextUnlocked(slot) {
  const list = PARTS[slot].filter((p) => isUnlocked(p, save.got))
  const i = list.findIndex((p) => p.id === save.rocket[slot])
  return list[(i + 1) % list.length].id
}

function paint(color) {
  const slot = game.tab
  if (!slotDef(slot).paint) return
  save.rocket.colors[slot] = color
  rocket.setColors(save.rocket.colors)
  const targets = slot === 'booster' ? rocket.boosters : [rocket.parts[slot]]
  for (const o of targets) if (o) rocket.pops.push({ o, t: 0, base: o.scale.x })
  rocket.squash = 0.6
  audio.paint()
  const o = targets[0]
  if (o) {
    o.updateWorldMatrix(true, true)
    new THREE.Box3().setFromObject(o).getCenter(v3)
    v3.z += 0.6
    sparks.burst(v3, [color, color, '#ffffff'], 11, 2.4, 0.55)
  }
  for (const p of PARTS[slot]) if (p.id !== 'none') makeThumb(slot, p.id)
  renderTray()
  persist()
}

function surprise() {
  audio.rattle()
  for (const slot of SLOTS) {
    const list = PARTS[slot.id].filter((p) => isUnlocked(p, save.got))
    save.rocket[slot.id] = pick(list).id
    if (slot.paint) save.rocket.colors[slot.id] = pick(COLORS.slice(0, 8))
  }
  rocket.build(save.rocket)
  placeOnPad()
  const order = ['fins', 'tank', 'cabin', 'nose', 'pilot', 'sticker', 'booster']
  order.forEach((slot, i) => {
    const targets = slot === 'booster' ? rocket.boosters : [rocket.parts[slot]]
    for (const o of targets) if (o) rocket.pops.push({ o, t: -i * 0.09, base: o.scale.x })
    setTimeout(() => audio.snap(i), 120 + i * 90)
  })
  rocket.squash = 1
  for (const s of SLOTS) if (s.paint) for (const p of PARTS[s.id]) if (p.id !== 'none') makeThumb(s.id, p.id)
  renderTray()
  persist()
}

// Tray input: tap a part to snap it on, or drag it onto the rocket
let drag = null
$('items').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.item')
  if (!b) return
  audio.unlock()
  drag = { slot: game.tab, id: b.dataset.id, x0: e.clientX, y0: e.clientY, moved: false }
})
addEventListener('pointermove', (e) => {
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 14) {
      if (!isUnlocked(part(drag.slot, drag.id), save.got)) return
      drag.moved = true
      const g = $('ghost')
      const src = drag.id === 'none' ? null : thumbOf(drag.slot, drag.id)
      g.innerHTML = src ? `<img src="${src}" alt="">` : '<span style="font-size:60px">🚫</span>'
      show('ghost')
      audio.tone(660, { dur: 0.1, vol: 0.06, echo: false })
    }
    if (drag.moved) {
      $('ghost').style.left = `${e.clientX}px`
      $('ghost').style.top = `${e.clientY}px`
    }
  }
  if (game.state === 'flight') steerPointer(e)
})
addEventListener('pointerup', (e) => {
  pointerHeld = false
  if (!drag) return
  const d = drag
  drag = null
  show('ghost', false)
  if (!isUnlocked(part(d.slot, d.id), save.got)) return nope(d.slot, d.id)
  if (!d.moved) return choose(d.slot, d.id)
  const t = $('tray').getBoundingClientRect()
  const overTray = e.clientX >= t.left && e.clientX <= t.right && e.clientY >= t.top && e.clientY <= t.bottom
  if (!overTray) choose(d.slot, d.id)
})
addEventListener('pointercancel', () => {
  drag = null
  pointerHeld = false
  show('ghost', false)
})
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab')
  if (!b) return
  audio.unlock()
  audio.click()
  setTab(b.dataset.slot)
})
$('paints').addEventListener('click', (e) => {
  const b = e.target.closest('.swatch')
  if (b) paint(b.dataset.color)
})
$('dice').addEventListener('click', () => {
  audio.unlock()
  if (game.state === 'garage') surprise()
})
$('launch').addEventListener('click', () => {
  audio.unlock()
  launch()
})

// --- First-time hints (a pointing finger, no reading needed) ------------------------

// Children who stop for a while get a gentle nudge toward the next fun thing
let lastInput = performance.now()
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => (lastInput = performance.now()), true)
const idle = () => (performance.now() - lastInput) / 1000

function hintTarget() {
  if (game.state === 'party') {
    if (party.pilot && !party.trick && !party.tricks && idle() > 4 && game.t > 3) return onScreen(party.pilot.position, 0.8)
    return !$('reward').classList.contains('hidden') && idle() > 20 ? $('again') : null
  }
  if (game.state !== 'garage') return null
  const items = [...$('items').children]
  // Two flops in a row, then a pause: the finger shows the booster tab, then a bigger booster
  // (or, with the biggest one already on, the tab of the wobbliest part to swap)
  if (flopRun >= 2 && idle() > 3) {
    const strong = strongerBooster()
    const slot = strong ? 'booster' : wobbliestSlot()
    if (game.tab !== slot) return $('tabs').querySelector(`[data-slot="${slot}"]`)
    const want = strong ?? PARTS[slot].find((p) => !p.wobble && isUnlocked(p, save.got))?.id
    return items.find((b) => b.dataset.id === want) ?? $('tabs').querySelector(`[data-slot="${slot}"]`)
  }
  // A child who has not touched a part yet: after a still moment the finger shows one
  if (!save.picked) return idle() > 5 ? items.find((b) => !b.classList.contains('on') && !b.classList.contains('locked')) ?? null : null
  if ((save.flights === 0 && idle() > 6) || idle() > 30) return $('launch')
  return null
}
/** A screen box around a point in the scene, so the finger can point at the pilot. */
const screenAt = new THREE.Vector3()
function onScreen(pos, up = 0) {
  screenAt.copy(pos)
  screenAt.y += up
  screenAt.project(camera)
  const x = (screenAt.x * 0.5 + 0.5) * innerWidth
  const y = (-screenAt.y * 0.5 + 0.5) * innerHeight
  return { getBoundingClientRect: () => ({ left: x - 30, right: x + 30, top: y - 30, bottom: y + 30, width: 60, height: 60 }) }
}
/** The next unlocked booster up from the one on the rocket (none when it already has the biggest). */
function strongerBooster() {
  const now = part('booster', save.rocket.booster).power
  return PARTS.booster.find((p) => p.power > now && isUnlocked(p, save.got))?.id ?? null
}
/** The nose, tank or fins doing the most wobbling. */
function wobbliestSlot() {
  return ['fins', 'tank', 'nose'].reduce((a, b) => ((part(b, save.rocket[b]).wobble ?? 0) > (part(a, save.rocket[a]).wobble ?? 0) ? b : a))
}
/** Flops in a row (a real flight resets it). */
let flopRun = 0
function placeFinger() {
  const el = game.state === 'garage' || game.state === 'party' ? hintTarget() : null
  const f = $('finger')
  if (!el) return f.classList.add('hidden')
  // The fingertip rests on the lower-right edge of the target, so its picture and label stay visible
  const r = el.getBoundingClientRect()
  f.style.left = `${Math.min(r.right - 26, innerWidth - 60)}px`
  f.style.top = `${Math.min(r.top + r.height * 0.62, innerHeight - 64)}px`
  f.classList.remove('hidden')
}
function hintStep() {
  requestAnimationFrame(placeFinger)
}

// --- Title & garage -------------------------------------------------------------------

function toTitle() {
  game.state = 'title'
  show('title')
  show('topbar', false)
  show('tray', false)
  show('actions', false)
  show('reward', false)
  show('journey', false)
  $('finger').classList.add('hidden')
  renderVisited()
  audio.playSong('garage')
}

function toGarage({ snap = false, keepFx = false } = {}) {
  clearFlight()
  clearParty()
  if (!keepFx) {
    smoke.clear()
    sparks.clear()
  }
  game.state = 'garage'
  rocket.root.visible = true
  rocket.setFlame(0)
  placeOnPad()
  garage.visible = true
  doors.open = 0
  show('title', false)
  show('topbar')
  show('reach')
  show('flightbar', false)
  show('tray')
  show('actions')
  // A wobbly rocket rocks once as the garage comes back
  swayOnPad()
  show('reward', false)
  show('journey', false)
  $('tray').classList.remove('away')
  $('actions').classList.remove('away')
  renderTray()
  renderReach()
  layoutActions()
  audio.playSong('garage')
  audio.setEngine(0)
  if (snap) cam.snap = true
  robot.wave = 2
  // Stillness is counted from here, so a long flight never brings the finger straight back
  lastInput = performance.now()
  hintStep()
  showHomecoming()
}

$('play').addEventListener('click', () => {
  audio.unlock()
  audio.click()
  toGarage()
})

// --- The garage wall: a star picture, a shelf of planet souvenirs, and the alien friend --------

/**
 * Stars caught on every flight light the dots of a picture on the garage wall (a rocket, a cat,
 * a heart...). Back in the garage the new dots pop on one by one; a whole picture joins up its
 * lines and glows, and the next one starts. Each place visited leaves a little souvenir planet
 * on the shelf below (tap one to make it bounce and sing), and after the Alien Planet the pink
 * friend comes home to stand beside the rocket.
 */
const wall = { board: null, dots: [], lines: [], shownPic: -1, shelf: [], friend: null, toys: [], queue: [] }
const BOARD = { x: -2.2, y: 3.7, z: -3.27, w: 1.95, h: 1.6 }
function buildWall() {
  const g = new THREE.Group()
  garage.add(g)
  const navy = new THREE.MeshStandardMaterial({ color: '#2a2266', roughness: 0.8 })
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5 })
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.h, 0.05), navy)
  board.position.set(BOARD.x, BOARD.y, BOARD.z)
  g.add(board)
  for (const [w, h, x, y] of [[BOARD.w + 0.12, 0.08, 0, BOARD.h / 2], [BOARD.w + 0.12, 0.08, 0, -BOARD.h / 2], [0.08, BOARD.h, BOARD.w / 2, 0], [0.08, BOARD.h, -BOARD.w / 2, 0]]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), gold)
    edge.position.set(BOARD.x + x, BOARD.y + y, BOARD.z + 0.02)
    g.add(edge)
  }
  wall.board = g
  // The souvenir shelf under it
  const wood = new THREE.MeshStandardMaterial({ color: '#e3b27a', roughness: 0.8 })
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.5), wood)
  plank.position.set(BOARD.x, 2.25, -3.1)
  g.add(plank)
  DESTS.forEach((d, i) => {
    const mini = models[d.model].clone()
    mini.scale.setScalar(0.2)
    for (const n of ['dest_ringed_band', 'dest_ringed_band2']) mini.getObjectByName(n)?.rotateX(0.85)
    mini.position.set(BOARD.x - 0.86 + i * 0.43, 2.25 + 0.045 + 0.2, -3.05)
    mini.visible = save.shelf[i]
    mini.userData = { i, hop: 0, y: mini.position.y }
    g.add(mini)
    wall.shelf.push(mini)
    wall.toys.push(mini)
  })
  wall.friend = makeFriend(0.9)
  wall.friend.rotation.y = 0.35
  wall.friend.visible = save.friendHome
  wall.friend.userData.hop = 0
  g.add(wall.friend)
  wall.toys.push(wall.friend)
  placeHelpers()
  drawPicture(pictureAt(save.skyShown))
}

const dotAt = (pic, k) => new THREE.Vector3(BOARD.x + (pic.dots[k][0] - 0.5) * BOARD.w * 0.82, BOARD.y + (pic.dots[k][1] - 0.5) * BOARD.h * 0.82, BOARD.z + 0.05)
function drawPicture(at) {
  for (const o of [...wall.dots, ...wall.lines]) wall.board.remove(o)
  wall.dots = []
  wall.lines = []
  wall.shownPic = at.n
  const { pic } = at
  pic.dots.forEach((_, k) => {
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }))
    dot.position.copy(dotAt(pic, k))
    wall.board.add(dot)
    wall.dots.push(dot)
    lightDot(k, k < at.lit, pic)
  })
  for (const [a, b] of pic.lines) {
    const pa = dotAt(pic, a)
    const pb = dotAt(pic, b)
    const len = pa.distanceTo(pb)
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), new THREE.MeshBasicMaterial({ color: pic.color }))
    line.position.copy(pa).add(pb).multiplyScalar(0.5)
    line.quaternion.setFromUnitVectors(v3.set(0, 1, 0), v3b.copy(pb).sub(pa).normalize())
    line.visible = at.lit >= pic.dots.length
    wall.board.add(line)
    wall.lines.push(line)
  }
}
function lightDot(k, on, pic) {
  const dot = wall.dots[k]
  dot.material.color.set(on ? pic.color : '#7c74b8')
  dot.material.opacity = on ? 1 : 0.55
  dot.scale.setScalar(on ? 0.46 : 0.16)
}

/** Back in the garage: new star dots pop on, a new souvenir hops onto the shelf, the friend waves. */
let homeTimers = []
function showHomecoming() {
  for (const t of homeTimers) clearTimeout(t)
  homeTimers = []
  // First the wall catches up with what it already showed (a visit cut short leaves nothing behind)
  wall.shelf.forEach((mini, i) => (mini.visible = save.shelf[i]))
  wall.friend.visible = save.friendHome
  drawPicture(pictureAt(save.skyShown))
  const later = (ms, fn) => homeTimers.push(setTimeout(() => game.state === 'garage' && fn(), ms))
  let ms = 700
  DESTS.forEach((_, i) => {
    if (!(save.visited[i] || save.waved[i]) || save.shelf[i]) return
    save.shelf[i] = true
    const mini = wall.shelf[i]
    later(ms, () => {
      mini.visible = true
      mini.userData.hop = 1
      sparks.burst(mini.getWorldPosition(v3), ['#fff3a0', '#ffd23f', '#ffffff'], 10, 2, 0.4)
      audio.unlock1(i)
    })
    ms += 450
  })
  if (save.friend && !save.friendHome) {
    save.friendHome = true
    later(ms, () => {
      wall.friend.visible = true
      wall.friend.userData.hop = 1
      audio.whistle(true)
    })
    ms += 600
  }
  // Star dots pop on one at a time. A picture that comes whole stays up, joined, for this visit:
  // the stars left over start the next picture after the next flight.
  const from = pictureAt(save.skyShown)
  const to = pictureAt(save.sky)
  const whole = from.pic.dots.length
  let upTo = save.sky
  if (from.lit >= whole && to.n > from.n) {
    // The last visit finished a picture: now the next one begins
    later(ms, () => drawPicture({ n: to.n, pic: to.pic, lit: 0 }))
    ms += 300
    for (let k = 0; k < to.lit; k++) {
      later(ms, () => popDot(k, to.pic))
      ms += 220
    }
    if (to.lit >= to.pic.dots.length) later(ms, () => joinUp(to.pic))
  } else {
    const end = to.n > from.n ? whole : to.lit
    for (let k = from.lit; k < end; k++) {
      later(ms, () => popDot(k, from.pic))
      ms += 220
    }
    if (end >= whole && from.lit < whole) later(ms, () => joinUp(from.pic))
    if (to.n > from.n) upTo = save.skyShown + (whole - from.lit) * STARS_PER_DOT - (save.skyShown % STARS_PER_DOT)
  }
  save.skyShown = Math.min(save.sky, upTo)
  persist()
}
function popDot(k, pic) {
  if (!wall.dots[k]) return
  lightDot(k, true, pic)
  wall.dots[k].scale.setScalar(0.7)
  wall.dots[k].userData.pop = 1
  audio.unlock1(k)
  sparks.burst(wall.dots[k].position.clone().applyMatrix4(garage.matrixWorld), [pic.color, '#ffffff'], 6, 1.4, 0.3)
}
/** A whole picture: its lines join up one by one, then a ta-da and a wave from Robot. */
function joinUp(pic) {
  wall.lines.forEach((l, i) => homeTimers.push(setTimeout(() => (l.visible = true), i * 90)))
  homeTimers.push(setTimeout(() => {
    audio.fanfare()
    robot.wave = 2.5
    sparks.burst(v3.set(BOARD.x, BOARD.y, BOARD.z + 0.3), [pic.color, '#ffffff', '#fff3a0'], 22, 3, 0.5)
  }, wall.lines.length * 90 + 100))
}
function updateWall(dt) {
  const t = game.time
  for (const d of wall.dots) {
    if (!d.userData.pop) continue
    d.userData.pop = Math.max(0, d.userData.pop - dt * 3)
    d.scale.setScalar(0.46 + 0.24 * d.userData.pop)
  }
  for (const m of wall.shelf) {
    m.rotation.y += dt * 0.4
    if (m.userData.hop > 0) {
      m.userData.hop = Math.max(0, m.userData.hop - dt * 1.6)
      m.position.y = m.userData.y + Math.abs(Math.sin(m.userData.hop * Math.PI * 2)) * 0.35 * m.userData.hop
    }
  }
  const f = wall.friend
  if (f?.visible) {
    const [al, ar] = f.userData.arms
    f.userData.hop = Math.max(0, f.userData.hop - dt * 1.4)
    f.position.y = f.userData.feet + Math.abs(Math.sin(f.userData.hop * Math.PI * 3)) * 0.4 * f.userData.hop
    ar.rotation.z = f.userData.hop > 0 ? 2.4 + Math.sin(t * 9) * 0.4 : damp(ar.rotation.z, 0.2 + Math.sin(t * 1.3) * 0.1, 4, dt)
    al.rotation.z = damp(al.rotation.z, -0.2, 4, dt)
    f.userData.head.rotation.z = Math.sin(t * 1.1) * 0.12
  }
}
/** Tapping a souvenir or the friend in the garage. */
function tapToy(raycaster) {
  const hit = raycaster.intersectObjects(wall.toys.filter((o) => o.visible), true)[0]
  if (!hit) return false
  let o = hit.object
  while (o && !wall.toys.includes(o)) o = o.parent
  if (!o) return false
  o.userData.hop = 1
  if (o === wall.friend) {
    audio.tone(700, { dur: 0.18, vol: 0.08, type: 'sine', slide: 1.6 })
    audio.tone(900, { when: 0.16, dur: 0.22, vol: 0.07, type: 'sine', slide: 1.4 })
  } else audio.unlock1(o.userData.i * 2)
  return true
}

// --- Countdown and lift-off ------------------------------------------------------------

/** The big 🚀: a 3-2-1 with rumble and smoke, then up it goes (or, far too wobbly for its boosters, a goofy flop). */
function launch() {
  if (game.state !== 'garage' || game.busy) return
  padSway = 0
  game.state = 'countdown'
  game.t = 0
  game.count = 3
  $('tray').classList.add('away')
  $('actions').classList.add('away')
  show('reach', false)
  $('finger').classList.add('hidden')
  robot.wave = 4
  showCount('3')
  audio.beep()
}

function showCount(text) {
  const el = $('countdown')
  el.textContent = text
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
}

function updateCountdown(dt) {
  game.t += dt
  const k = game.t / 3
  // A small engine rumble that builds (a wobbly rocket already shivers a little more)
  const w = wobble(save.rocket)
  rocket.wobbler.position.x = Math.sin(game.time * 20) * (0.01 + 0.03 * w) * k
  rocket.wobbler.rotation.z = Math.sin(game.time * 14) * (0.008 + 0.04 * w) * k
  doors.open = Math.min(1, doors.open + dt * 0.5)
  if (game.t > 1) rocket.setFlame(0.15 + Math.random() * 0.1 * k)
  audio.setEngine(k * 0.5)
  for (let i = 0; i < 1 + k * 4; i++) {
    const a = Math.random() * Math.PI * 2
    smoke.emit(Math.cos(a) * 0.6, padTop + 0.2, Math.sin(a) * 0.6, { vx: Math.cos(a) * rand(1, 3) * k, vy: rand(0.2, 1.2), vz: Math.sin(a) * rand(0.5, 1.5), spread: 0.6, life: 1.6, size: rand(0.8, 1.6) * (0.5 + k), endSize: 2.5, color: '#ffffff', drag: 1.2 })
  }
  // The pad lights brighten steadily toward lift-off: a slow glow, never a strobe
  padLights.forEach((m) => (m.emissiveIntensity = 1 + k * 1.2))
  const n = 3 - Math.floor(game.t)
  if (n !== game.count && n >= 1) {
    game.count = n
    showCount(String(n))
    audio.beep()
  }
  if (game.t >= 3) flops(save.rocket) ? flopOff() : liftoff()
}

// --- Flight ---------------------------------------------------------------------------

const flight = {
  target: 0,
  base: 0,
  start: 0,
  alt: 0,
  speed: 0,
  cruise: 10,
  dist: 100,
  stars: 0,
  turbo: false,
  canTurbo: false,
  boost: 0,
  x: 0,
  vx: 0,
  tx: 0,
  spin: 0,
  dizzy: 0,
  wob: 0,
  nextSpawn: 0,
  nextCloud: 0,
  passed: new Set(),
  flyby: [],
  cheer: 0,
  whirl: 0,
  rainbow: false,
  rainbowAt: -1,
  ufo: null,
  need: 20,
}
const items = []
const pools = {}
let goalPlanet = null
let pointerHeld = false
let tilt = null
const keys = new Set()

function liftoff() {
  game.state = 'flight'
  game.t = 0
  showCount('🚀')
  audio.liftoff()
  audio.playSong('flight')
  rocket.wobbler.position.set(0, 0, 0)
  const base = aimAt()
  flopRun = 0
  Object.assign(flight, {
    base,
    target: base,
    start: rocket.root.position.y,
    alt: rocket.root.position.y,
    speed: 0,
    cruise: 10 + base * 1.3,
    stars: 0,
    turbo: false,
    boost: 0,
    x: 0,
    vx: 0,
    tx: 0,
    spin: 0,
    dizzy: 0,
    wob: wobble(save.rocket),
    nextSpawn: rocket.root.position.y + 10,
    nextCloud: 5,
    cheer: 0,
    whirl: 0,
    rainbow: false,
    ufo: null,
    // Now and then (never on the first two flights) a rainbow shooting star crosses the sky
    rainbowAt: save.flights >= 2 && Math.random() < 0.3 ? rand(0.3, 0.7) : -1,
  })
  flight.passed.clear()
  flight.flyby = []
  flight.dist = flight.cruise * (12 + base * 3.2)
  // About two seconds between star groups on short flights; nine groups at most on long ones
  flight.gap = Math.max(flight.cruise * 1.6, (flight.dist - 24) / 9)
  // The ⚡ needs about a third of what this trip can hold (perfect steering catches about five stars
  // per group, bonuses included; long trips ask a little less per group, since their stars are
  // spread out), so a child who steers roughly toward the stars earns it in time
  const groups = Math.max(1, Math.floor((flight.dist - 22) / flight.gap) + 1)
  flight.need = Math.round(groups * (base >= 2 ? 1.6 : 1.8))
  flight.lit = false
  flight.side = 0
  shadow.visible = false
  show('flightbar')
  show('journey')
  // Enough stars light the ⚡ turbo, which carries the rocket one stop farther (the child's choice)
  flight.picked = save.aim !== null && base < reach(save.rocket)
  flight.canTurbo = base < DESTS.length - 1 && !flight.picked
  $('turbo').classList.toggle('hidden', !flight.canTurbo)
  $('turbo').classList.remove('full', 'used')
  $('turbo').disabled = true
  $('turbo-to').textContent = flight.canTurbo ? DESTS[base + 1].emoji : ''
  $('turbo').setAttribute('aria-label', 'Turbo')
  show('turbo-cue', false)
  renderStars()
  renderJourney()
  // A big ring of smoke rolls out across the pad, and the rocket stretches as it leaps
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    smoke.emit(Math.cos(a) * 0.8, padTop + 0.2, Math.sin(a) * 0.8, { vx: Math.cos(a) * rand(3, 6.5), vy: rand(0.2, 1.4), vz: Math.sin(a) * rand(1.5, 3), spread: 0.4, life: 1.9, size: rand(1, 1.7), endSize: 3.2, color: '#ffffff', drag: 1.6 })
  }
  rocket.squash = 1
}

/** The ⚡ bar fills with the stars caught, up to what this trip's turbo needs. */
function renderStars() {
  $('turbo-fill').style.width = `${Math.min(1, flight.stars / flight.need) * 100}%`
}

function passAlt(i) {
  // The first stretch is short on long trips, so every trip does not open the same way
  return flight.start + flight.dist * (0.12 + (0.76 * (i + 1)) / (flight.target + 1))
}

let journeyMe = null
const journeyFill = $('journey-fill')
/** Sets a marker's height on the journey track (0 to 1), skipping writes that would not move it. */
function setTrackAt(marker, f) {
  const at = Math.round(f * 2000) / 2000
  if (marker.trackAt === at) return
  marker.trackAt = at
  marker.style.bottom = `calc(18px + (100% - 36px) * ${at})`
}
function renderJourney() {
  const track = $('journey')
  track.querySelectorAll('.stop, .me').forEach((e) => e.remove())
  const pct = (f) => `calc(18px + (100% - 36px) * ${f})`
  const stopAt = (i) => (i === flight.target ? 1 : (passAlt(i) - flight.start) / flight.dist)
  const add = (className, text, f) => {
    const s = document.createElement('span')
    s.className = className
    s.textContent = text
    s.style.bottom = pct(f)
    track.append(s)
    return s
  }
  add('stop', '🏠', 0)
  for (let i = 0; i <= flight.target; i++) add('stop' + (i === flight.target ? ' goal' : ''), DESTS[i].emoji, stopAt(i))
  journeyMe = document.createElement('span')
  journeyMe.className = 'me'
  journeyMe.textContent = '🚀'
  track.append(journeyMe)
}

function spawn(kind, x, y, z = 0, extra = {}) {
  pools[kind] ??= []
  const obj = pools[kind].pop() ?? models[kind].clone()
  obj.position.set(x, y, z)
  obj.rotation.set(0, 0, 0)
  obj.visible = true
  scene.add(obj)
  const it = { obj, kind, t: Math.random() * 10, vx: 0, vy: 0, spin: 0, hit: false, scale: 1, ...extra }
  obj.scale.setScalar(it.scale)
  items.push(it)
  return it
}

function recycle(i) {
  const it = items[i]
  scene.remove(it.obj)
  if (it.kind.startsWith('dest_')) {
    // Planet clones are dropped (they're only made a few times per flight)
  } else pools[it.kind].push(it.obj)
  items.splice(i, 1)
}

function clearFlight() {
  for (let i = items.length - 1; i >= 0; i--) recycle(i)
  if (goalPlanet) {
    scene.remove(goalPlanet)
    goalPlanet = null
  }
}

/**
 * Stars come in small groups of three, spaced out along the flight and mostly out to the sides,
 * so the ⚡ turbo is earned by steering. Each stretch of the trip has its own things to meet on
 * the way to the place ahead: smiling moonlets to bounce off near the Moon, dust swirls that spin
 * the rocket near Mars, hoops to fly through near the Ring Planet, ice crystals (worth two) near
 * the Comet, and a flying saucer that drops stars near the Alien Planet. Now and then a piece of
 * space junk drifts in between (bumping it makes the rocket dizzy for a moment).
 */
const STAR_SCALE = 0.62
function zoneAt(y) {
  for (let i = 0; i < flight.target; i++) if (y < passAlt(i)) return i
  return flight.target
}
function spawnPattern(y) {
  const f = flight
  const xm = Math.max(1.5, view.hw - 1.4)
  const zone = zoneAt(y)
  if (f.alt - f.start > 60 && Math.random() < 0.18) {
    const kind = pick(['junk_satellite', 'junk_boot', 'junk_teapot', 'junk_duck'])
    spawn(kind, rand(-xm, xm), y + f.gap * 0.5, 0, { scale: rand(0.8, 1.05), spin: rand(-0.8, 0.8), vx: rand(-0.4, 0.4), junk: true })
  }
  // Each group sits on the other side from the last one more often than not, so steering goes back and forth
  const side = Math.random() < 0.2 ? 0 : Math.random() < 0.7 ? -(f.side || 1) : f.side || 1
  if (side) f.side = side
  const near = Math.min(xm * 0.9, Math.max(rocket.width * 0.5 + 1.2, xm * 0.5))
  const x = side ? side * rand(near, xm * 0.92) : rand(-0.4, 0.4)
  // A short column, or a diagonal leaning outward (never in toward a rocket that is not steering)
  let lean = Math.random() < 0.5 ? 0 : 0.55 * (side || pick([-1, 1]))
  if (zone === 0 && Math.random() < 0.6) {
    // A moonlet floats on the other side: bump it for a boing and two stars
    const mx = clamp(-(side || pick([-1, 1])) * rand(0.6, xm * 0.7), -xm, xm)
    spawn('moonlet', mx, y + f.gap * 0.55, 0, { scale: rand(0.62, 0.8), moonlet: true, spin: rand(-0.6, 0.6), vx: rand(-0.4, 0.4) })
  } else if (zone === 1 && Math.random() < 0.55) {
    // A Mars dust swirl with its stars going round inside: fly in and the rocket twirls
    const cx = clamp(x, -xm + 0.6, xm - 0.6)
    spawn('swirl', cx, y + 1.3, 0, { swirl: true })
    for (let i = 0; i < 3; i++) spawn('star', cx, y + 1.3, 0, { scale: STAR_SCALE, star: true, orbit: { cx, cy: y + 1.3, a: (i / 3) * Math.PI * 2, r: 0.9 } })
    return f.gap
  } else if (zone === 2 && Math.random() < 0.6) {
    // A hoop from the Ring Planet, with its stars going straight up through the middle
    lean = 0
    spawn('hoop', clamp(x, -xm, xm), y + 1.3, 0, { hoop: true, below: true })
  }
  const ice = zone === 3 && Math.random() < 0.65
  for (let i = 0; i < 3; i++) spawn(ice ? 'ice' : 'star', clamp(x + lean * i, -xm, xm), y + i * 1.3, 0, { scale: ice ? 0.78 : STAR_SCALE, star: true, worth: ice ? 2 : 1, ice })
  return f.gap
}

function steerPointer(e) {
  if (!pointerHeld && e.pointerType !== 'mouse') return
  const nx = (e.clientX / innerWidth) * 2 - 1
  flight.tx = cam.x + nx * view.hw
  tilt = null
}

addEventListener('deviceorientation', (e) => {
  if (e.gamma === null || e.beta === null) return
  const angle = screen.orientation?.angle ?? 0
  const v = angle === 90 ? e.beta : angle === 270 || angle === -90 ? -e.beta : e.gamma
  tilt = clamp(v / 22, -1, 1)
})

function catchStar(it) {
  const at = it.obj.position
  // The note follows where the star was (left low, right high): it never climbs with streaks
  const step = Math.round(clamp((at.x - cam.x) / (view.hw * 2) + 0.5, 0, 1) * 5)
  if (it.ice) {
    audio.ice(step)
    sparks.burst(at, ['#c9f6ff', '#9fe8ff', '#ffffff'], 10, 2.8, 0.55)
  } else {
    audio.catch(step)
    sparks.burst(at, ['#fff3a0', '#ffd23f', '#ffffff'], 8, 2.8, 0.55)
  }
  giveStars(it.worth ?? 1)
}

/**
 * Stars always show what they bought: every five, the pilot jumps for joy and the exhaust takes
 * on new colours; enough of them light the ⚡ turbo; and each lights the star picture in the garage.
 */
function giveStars(n) {
  const before = Math.floor(flight.stars / 5)
  flight.stars += n
  save.stars += n
  save.sky += n
  renderStars()
  if (Math.floor(flight.stars / 5) > before && game.state === 'flight') {
    flight.cheer = 0.7
    audio.cheer()
    rings.spawn(rocket.root.position, pick(exhaust()), 4, 0.5)
  }
}

/**
 * Checked every frame: once enough stars are caught, the ⚡ lights up and waits for a tap, up top
 * and floating beside the rocket. Never in the last stretch of a trip, where there is no time
 * left to use it; and never when the child picked a nearer place on purpose, so a deliberate
 * Moon trip lands on the Moon.
 */
function checkTurbo() {
  const f = flight
  // (a place picked on purpose is where the trip goes: no turbo past it)
  if (!f.canTurbo || f.picked || f.turbo || f.lit || game.state !== 'flight' || f.stars < f.need) return
  if ((f.alt - f.start) / f.dist > 0.85) return
  f.lit = true
  $('turbo').classList.add('full')
  $('turbo').disabled = false
  show('turbo-cue')
  audio.reach()
}

/** The exhaust grows more colourful with every five stars (and goes rainbow after a rainbow star). */
const EXHAUSTS = [
  ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0'],
  ['#ffd23f', '#ff8fc7', '#ff6b6b', '#fff3a0', '#ffb3e0'],
  ['#8ef0c8', '#3bb5ff', '#ff8fc7', '#fff3a0', '#c9b6ff'],
  ['#ff4f6d', '#ff9f43', '#ffd23f', '#5cd65c', '#3bb5ff', '#9b5de5'],
]
const exhaust = () => EXHAUSTS[flight.rainbow ? 3 : Math.min(3, Math.floor(flight.stars / 5))]

/** The child's in-flight choice: spend the stars on one more planet, or land where the rocket was going. */
function useTurbo() {
  if (game.state !== 'flight' || flight.turbo || !flight.canTurbo || !flight.lit) return
  flight.turbo = true
  flight.target++
  flight.dist += flight.cruise * 4.5
  flight.boost = 2.5
  audio.turbo()
  banner(`⚡ ${DESTS[flight.target].emoji}`, 2000)
  $('turbo').disabled = true
  $('turbo').classList.add('used')
  show('turbo-cue', false)
  renderJourney()
  sparks.burst(rocket.root.position, ['#8ef0c8', '#3bb5ff', '#c9b6ff', '#ffd23f'], 12, 3, 0.8)
}
for (const id of ['turbo', 'turbo-cue']) {
  $(id).addEventListener('pointerdown', (e) => e.stopPropagation())
  $(id).addEventListener('click', () => useTurbo())
}
/** The floating ⚡ rides just beside the rocket's nose while the turbo is ready. */
const cueAt = new THREE.Vector3()
function placeTurboCue() {
  const cue = $('turbo-cue')
  if (cue.classList.contains('hidden')) return
  if (game.state !== 'flight') return show('turbo-cue', false)
  const side = rocket.root.position.x > cam.x ? -1 : 1
  cueAt.set(rocket.root.position.x + side * (rocket.width * 0.5 + 1.1), rocket.root.position.y + rocket.half * 0.5, 0).project(camera)
  cue.style.left = `${(cueAt.x * 0.5 + 0.5) * innerWidth}px`
  cue.style.top = `${(-cueAt.y * 0.5 + 0.5) * innerHeight}px`
}

/**
 * Flying past a planet still counts: it waves, and if it has gifts left it hands over one of
 * them (the rest wait for a landing there). So a child who always fits big boosters still finds
 * every part in time, and one long trip never pours out two planets' gifts at once.
 */
function giftsLeft(i) {
  return unlocksAt(i).filter((n) => !save.got.has(`${n.slot}:${n.id}`))
}
function flyBy(i, pos) {
  audio.reach()
  save.waved[i] = true
  const gift = giftsLeft(i)[0]
  if (!gift) {
    persist()
    return popups.show(pos, `👋 ${DESTS[i].emoji}`, true)
  }
  save.got.add(`${gift.slot}:${gift.id}`)
  save.fresh.add(`${gift.slot}:${gift.id}`)
  flight.flyby.push({ ...gift, from: i })
  persist()
  popups.show(pos, `👋 ${DESTS[i].emoji} 🎁`, true)
  setTimeout(() => audio.unlock1(0), 250)
  sparks.burst(rocket.root.position, ['#fff3a0', '#ffd23f', '#ff8fc7', '#8ef0c8'], 10, 3, 0.8)
}

/** A moonlet bump: a springy boing that pushes the rocket aside, and two stars pop out. */
function bounceMoonlet(it, dx) {
  it.hit = true
  const dir = Math.sign(dx) || 1
  flight.vx += dir * 7
  it.vx = -dir * 3.5
  it.vy = 1.5
  it.spin = -dir * 3
  it.squash = 1
  rocket.squash = 0.8
  audio.boing()
  sparks.burst(it.obj.position, ['#e9e4f5', '#fff3a0', '#ffd23f'], 10, 3, 0.6)
  giveStars(2)
}

function bumpJunk(it) {
  it.hit = true
  const dir = Math.sign(it.obj.position.x - rocket.root.position.x) || 1
  it.vx = dir * 5
  it.vy = 3
  it.spin = dir * -5
  flight.dizzy = 1.1
  flight.vx -= dir * 5
  audio.boing()
  popups.show(it.obj.position, '💫')
}

function updateFlight(dt) {
  game.t += dt
  const f = flight
  // Speed: a dramatic slow start, then cruise; turbo gives a burst
  f.boost = Math.max(0, f.boost - dt)
  const want = f.cruise * smoothstep(game.t, 0, 2.6) * (1 + (f.boost > 0 ? 0.6 : 0))
  f.speed = damp(f.speed, want, 3, dt)
  f.alt += f.speed * dt
  rocket.setFlame(0.6 + (f.boost > 0 ? 0.6 : 0) + smoothstep(game.t, 0, 1) * 0.2)
  audio.setEngine(0.55 + (f.boost > 0 ? 0.3 : 0))

  // Steering
  const xm = Math.max(1.2, view.hw - rocket.width * 0.5 - 0.3)
  const kx = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0)
  if (kx) f.tx += kx * 10 * dt
  else if (tilt !== null && !pointerHeld) f.tx = tilt * xm
  f.tx = clamp(f.tx, -xm, xm)
  const stiff = f.dizzy > 0 ? 10 : 28
  f.vx += ((f.tx - f.x) * stiff - f.vx * 8) * dt
  f.x += f.vx * dt
  f.x = clamp(f.x, -xm - 0.4, xm + 0.4)
  rocket.root.position.set(f.x, f.alt, 0)

  // Lean, wobble (wacky rockets wobble more) and dizzy spins
  f.dizzy = Math.max(0, f.dizzy - dt)
  const t = game.time
  const W = f.wob
  // Steady is 0.05 and any wobbly part at least 0.5, so the two kinds of flight look plainly different
  rocket.wobbler.rotation.z = clamp(-f.vx * 0.05, -0.45, 0.45) + W * (0.3 * Math.sin(t * 2.6) + 0.07 * Math.sin(t * 7.7))
  rocket.wobbler.rotation.x = W * 0.14 * Math.sin(t * 2.1)
  rocket.wobbler.position.x = W * 0.35 * Math.sin(t * 1.5)
  // Dizzy after junk, a happy twirl in a Mars swirl, or settling back to face the front
  f.whirl = Math.max(0, f.whirl - dt)
  f.spin = f.dizzy > 0 ? f.spin + dt * 14 * (f.dizzy / 1.1 + 0.2) : f.whirl > 0 ? f.spin + dt * 9 : damp(f.spin, Math.round(f.spin / (Math.PI * 2)) * Math.PI * 2, 6, dt)
  rocket.wobbler.rotation.y = f.spin
  // The pilot jumps for joy at every five stars
  f.cheer = Math.max(0, f.cheer - dt)
  if (rocket.pilot) {
    const p = rocket.pilot
    p.userData.y0 ??= p.position.y
    p.position.y = p.userData.y0 + Math.sin((1 - f.cheer / 0.7) * Math.PI * 2) ** 2 * (f.cheer > 0 ? 0.3 : 0)
  }

  // Exhaust: smoke billows near the ground, sparks all the way
  const nz = rocket.nozzles(nozzleList)
  const low = 1 - smoothstep(f.alt - f.start, 0, 30)
  for (const n of nz) {
    for (let i = 0; i < 2; i++) {
      sparks.emit(n.x + rand(-0.1, 0.1), n.y - 0.6 * rocket.root.scale.y, n.z, { vx: rand(-0.4, 0.4) - f.vx * 0.1, vy: -f.speed * 0.5 - 2, spread: 0.6, life: 0.4, size: rand(0.45, 0.7), endSize: 0.1, color: pick(exhaust()), drag: 1.5 })
    }
    if (Math.random() < 0.35 + low * 0.6) {
      smoke.emit(n.x, n.y - 0.9, n.z - 0.2, { vx: rand(-1, 1) * (1 + low * 3), vy: -f.speed * 0.25 - 1, spread: 0.8, life: 1.2 + low, size: rand(0.6, 1) * (1 + low), endSize: 2.4 + low * 2, color: f.boost > 0 || f.rainbow ? pick(exhaust()) : '#ffffff', drag: 1 })
    }
  }

  // Garage falls away below
  garage.visible = cam.y - view.hh < 14
  doors.open = 1

  // Clouds early on
  const top = cam.y + view.hh + 4
  if (f.alt < 80 && top > f.nextCloud) {
    const front = Math.random() < 0.2
    const c = spawn(Math.random() < 0.5 ? 'cloud_a' : 'cloud_b', rand(-view.hw - 2, view.hw + 2), top + 3, front ? rand(2, 4) : rand(-14, -3), { scale: front ? rand(0.6, 0.9) : rand(1.3, 2.6), cloud: true })
    c.obj.rotation.y = rand(-0.3, 0.3)
    f.nextCloud = top + rand(3, 7)
  }
  // Stars and junk ahead, but not in the last stretch
  const end = f.start + f.dist
  if (top > f.nextSpawn && f.nextSpawn < end - 12) f.nextSpawn += spawnPattern(f.nextSpawn + 2)
  // Earlier destinations float past in the background
  for (let i = 0; i < f.target; i++) {
    if (f.passed.has(i)) continue
    if (f.alt + 30 < passAlt(i)) continue
    f.passed.add(i)
    // Always on the left: the journey track runs down the right edge
    const p = spawn(DESTS[i].model, -(view.hw * 1.1 + 2), passAlt(i) + 10, -18, { scale: 3, planet: true, hello: i })
    p.obj.rotation.x = -0.2
  }

  updateItems(dt)
  updateVisitors(dt)
  checkTurbo()
  placeTurboCue()

  // Journey marker
  const prog = clamp((f.alt - f.start) / f.dist, 0, 1)
  if (journeyMe) setTrackAt(journeyMe, prog)
  const filled = Math.round(prog * 2000) / 20
  if (journeyFill.filled !== filled) {
    journeyFill.filled = filled
    journeyFill.style.height = `${filled}%`
  }
  if (prog >= 1) arrive()
}
/**
 * Near the Alien Planet a flying saucer comes alongside, its friend waving, and drops stars for
 * the rocket to catch. On a few flights a rainbow shooting star crosses the sky: catching it is
 * five stars and a rainbow exhaust for the rest of the trip.
 */
function updateVisitors(dt) {
  const f = flight
  const rp = rocket.root.position
  if (!f.ufo && f.target === DESTS.length - 1 && game.state === 'flight' && zoneAt(f.alt + view.hh) === DESTS.length - 1) {
    const from = pick([-1, 1])
    f.ufo = spawn('ufo', from * (view.hw + 3), rp.y + view.hh * 0.7, -0.5, { ufo: true, drop: 1.2, from })
    audio.ufo()
  }
  if (f.rainbowAt > 0 && game.state === 'flight' && (f.alt - f.start) / f.dist > f.rainbowAt) {
    f.rainbowAt = -1
    const from = pick([-1, 1])
    spawn('rainbow', from * (view.hw + 1.5), rp.y + view.hh * 0.55, 0.3, { rainbow: true, vx: -from * 4.2, scale: 1 })
    audio.sparkle()
  }
}
function updateUfo(it, dt) {
  const o = it.obj
  const rp = rocket.root.position
  if (game.state !== 'flight') {
    // Zooms off upward when the rocket arrives
    it.vy += dt * 30
    o.position.y += it.vy * dt
    return
  }
  const gx = Math.sin(it.t * 0.8) * Math.max(1.5, view.hw - 2)
  const gy = rp.y + 4 + Math.sin(it.t * 1.7) * 0.5
  const px = o.position.x
  // Keeps pace with the rocket, then eases to its spot just ahead
  o.position.x = damp(o.position.x, gx, 1.5, dt)
  o.position.y = damp(o.position.y + flight.speed * dt, gy, 3, dt)
  o.rotation.z = clamp((px - o.position.x) * 4, -0.3, 0.3)
  o.rotation.y += dt * 0.6
  // (a clone keeps its own lights and arm, so they are looked up on it once)
  o.userData.lights ??= o.children.filter((c) => c.name === 'ufo_light')
  o.userData.arm ??= o.getObjectByName('alien_arm_r') ?? null
  const { lights, arm } = o.userData
  lights.forEach((l, i) => l.material.emissive.setHSL((it.t * 0.08 + i / 8) % 1, 0.8, 0.6))
  if (arm) arm.rotation.z = 2.4 + Math.sin(it.t * 8) * 0.4
  it.drop -= dt
  if (it.drop <= 0) {
    it.drop = 0.7
    spawn('star', o.position.x, o.position.y - 0.9, 0, { scale: STAR_SCALE, star: true })
    audio.tone(1320, { dur: 0.12, vol: 0.04, type: 'sine', slide: 0.7, echo: false })
  }
}
function updateRainbow(it, dt) {
  const o = it.obj
  o.position.x += it.vx * dt
  o.position.y += flight.speed * dt * 0.8
  o.rotation.z += dt * 3
  const c = EXHAUSTS[3]
  sparks.emit(o.position.x, o.position.y, 0.2, { vx: -it.vx * 0.3, vy: rand(-0.5, 0.5), spread: 0.4, life: 0.8, size: 0.55, endSize: 0.1, color: c[(it.t * 12 | 0) % c.length], drag: 1 })
  const rp = rocket.root.position
  if (!it.hit && game.state === 'flight' && Math.abs(rp.x - o.position.x) < rocket.width * 0.5 + 0.9 && Math.abs(rp.y - o.position.y) < rocket.half + 0.6) {
    it.hit = true
    o.visible = false
    flight.rainbow = true
    audio.turbo()
    banner('🌈', 1600)
    sparks.burst(o.position, EXHAUSTS[3], 18, 4, 0.7)
    giveStars(5)
  }
}

const nozzleList = []

function updateItems(dt) {
  const rp = rocket.root.position
  const rw = rocket.width * 0.5 + 0.35
  const rh = rocket.half * 0.9 + 0.4
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const o = it.obj
    it.t += dt
    if (it.star) {
      o.rotation.y = Math.sin(it.t * 2.2) * 0.6 + (it.ice ? it.t * 1.5 : 0)
      o.rotation.z = Math.sin(it.t * 1.4) * 0.2
      if (it.orbit) {
        // Going round inside a dust swirl
        it.orbit.a += dt * 2.4
        o.position.set(it.orbit.cx + Math.cos(it.orbit.a) * it.orbit.r, it.orbit.cy + Math.sin(it.orbit.a) * it.orbit.r * 0.8, 0)
      }
      // Stars that only just miss drift in, so steering matters but a near miss still counts
      const dx = rp.x - o.position.x
      const dy = rp.y - o.position.y
      const close = Math.abs(dx) < rw + 0.6 && Math.abs(dy) < rh + 0.6 && game.state === 'flight'
      if (close) {
        o.position.x += dx * dt * 1.6
        o.position.y += dy * dt * 1.2
      }
      // Squishy: a slow breathing pulse, and a stretch toward a rocket that comes close
      const b = 1 + Math.sin(it.t * 4) * 0.07
      const pull = close ? 1.18 : 1
      o.scale.set(it.scale * b / Math.sqrt(pull), it.scale * b * pull, it.scale * b)
      if (Math.abs(dx) < rw && Math.abs(dy) < rh && game.state === 'flight') {
        catchStar(it)
        recycle(i)
        continue
      }
    } else if (it.moonlet) {
      o.rotation.z += it.spin * dt
      o.position.x += it.vx * dt
      o.position.y += it.vy * dt
      it.squash = Math.max(0, (it.squash ?? 0) - dt * 2.5)
      const sq = 1 - 0.3 * it.squash * Math.cos(it.t * 22)
      o.scale.set(it.scale / sq, it.scale * sq, it.scale)
      const dx = rp.x - o.position.x
      const dy = rp.y - o.position.y
      if (!it.hit && game.state === 'flight' && Math.abs(dx) < rw + it.scale * 0.8 && Math.abs(dy) < rh + it.scale * 0.6) bounceMoonlet(it, dx)
    } else if (it.swirl) {
      // Dust goes round and round; flying into the middle twirls the rocket
      for (let k = 0; k < 3; k++) {
        const a = it.t * 5 + (k / 3) * Math.PI * 2
        smoke.emit(o.position.x + Math.cos(a) * 1.4, o.position.y + Math.sin(a) * 1.1, -0.3, { vx: -Math.sin(a) * 3, vy: Math.cos(a) * 2.4, spread: 0.3, life: 0.7, size: rand(0.35, 0.6), endSize: 0.9, color: pick(['#ffb08a', '#ff8a5c', '#ffd0b0']), drag: 2 })
      }
      if (!it.hit && game.state === 'flight' && Math.abs(rp.x - o.position.x) < 1.4 && Math.abs(rp.y - o.position.y) < 1.5) {
        it.hit = true
        flight.whirl = 0.75
        audio.whistle(true)
        audio.whoosh(0.6)
      }
    } else if (it.hoop) {
      it.pulse = Math.max(0, (it.pulse ?? 0) - dt * 1.5)
      o.scale.setScalar(1 + 0.25 * Math.sin(it.pulse * Math.PI))
      o.rotation.y = Math.sin(it.t * 0.8) * 0.15
      // Through the hole as the rocket's middle rises past it: a chime, a shower and two stars
      if (it.below && rp.y >= o.position.y && game.state === 'flight') {
        it.below = false
        if (Math.abs(rp.x - o.position.x) < 1.55 - rocket.width * 0.25) {
          it.pulse = 1
          audio.hoop()
          sparks.burst(o.position, ['#ffe0b0', '#d9c7ff', '#ffb76b', '#ffffff'], 16, 4, 0.6)
          giveStars(2)
        }
      }
    } else if (it.junk) {
      o.rotation.z += it.spin * dt
      o.rotation.y += it.spin * 0.6 * dt
      o.position.x += it.vx * dt
      o.position.y += it.vy * dt
      if (it.hit) it.vy -= 2 * dt
      else if (game.state === 'flight' && flight.dizzy <= 0) {
        const dx = rp.x - o.position.x
        const dy = rp.y - o.position.y
        if (Math.abs(dx) < rw * 0.8 + 0.4 && Math.abs(dy) < rh * 0.8 + 0.3) bumpJunk(it)
      }
    } else if (it.ufo) {
      updateUfo(it, dt)
      if (o.position.y > cam.y + view.hh * 3) {
        flight.ufo = null
        recycle(i)
      }
      continue
    } else if (it.rainbow) {
      updateRainbow(it, dt)
    } else if (it.cloud) {
      o.position.x += Math.sin(it.t * 0.3) * 0.2 * dt
    } else if (it.planet) {
      o.rotation.y += dt * 0.15
      if (it.hello !== undefined && o.position.y < cam.y + 1) {
        flyBy(it.hello, o.position)
        it.hello = undefined
      }
    }
    const bottom = cam.y - view.hh * (it.planet ? 2.5 : 1) - (it.cloud ? 8 : 3)
    if (o.position.y < bottom || Math.abs(o.position.x) > view.hw * 3 + 10) recycle(i)
  }
}

// --- The flop: a rocket far too wobbly for its boosters sputters up, coughs and bounces home -----

const FLOP_UP = 6.5
const flop = { stage: 0, y: 0, rest: 0, vy: 0, top: 0, dir: 1, at: 0, nextPop: 0, bounces: 0 }

function flopOff() {
  game.state = 'flop'
  game.t = 0
  flopRun++
  rocket.wobbler.position.set(0, 0, 0)
  Object.assign(flop, { stage: 0, rest: rocket.root.position.y, y: rocket.root.position.y, vy: 0, dir: pick([-1, 1]), nextPop: 0, bounces: 0 })
  // (no big 🚀 over the screen here: nothing should hide the cartwheel)
  $('countdown').classList.remove('show')
  audio.pop()
  audio.setEngine(0.3)
}

/** A grey puff from the engines (a sputter), or a ring of dust where the rocket hits the pad. */
function puff(n, color, power = 1) {
  for (const p of rocket.nozzles(nozzleList)) {
    for (let i = 0; i < n; i++) smoke.emit(p.x, p.y - 0.4, p.z, { vx: rand(-1.5, 1.5) * power, vy: rand(-2.5, -0.5) * power, vz: rand(-0.5, 0.5), spread: 0.4, life: 1.1, size: rand(0.6, 1), endSize: 2, color, drag: 1.5 })
  }
}
function dustRing(count, power) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    smoke.emit(Math.cos(a) * 0.8, padTop + 0.15, Math.sin(a) * 0.8, { vx: Math.cos(a) * rand(2, 4) * power, vy: rand(0.2, 1), vz: Math.sin(a) * rand(1, 2) * power, spread: 0.4, life: 1.2, size: rand(0.7, 1.2), endSize: 2.2, color: '#f4efe6', drag: 2 })
  }
}

function updateFlop(dt) {
  game.t += dt
  const f = flop
  const t = game.t
  const wob = rocket.wobbler
  if (f.stage === 0) {
    // Up it goes, wobbling harder and harder, the engine popping and coughing
    const u = Math.min(1, t / 1.9)
    f.y = f.rest + FLOP_UP * (1 - (1 - u) ** 2)
    wob.rotation.z = Math.sin(t * 9) * 0.4 * u
    wob.position.x = Math.sin(t * 4.5) * 0.5 * u
    rocket.setFlame(t > f.nextPop - 0.08 ? 0.15 : 0.55)
    if (t > f.nextPop) {
      f.nextPop = t + rand(0.2, 0.34)
      audio.pop()
      puff(3, pick(['#cfcad8', '#b8b2c6', '#ffffff']))
    }
    audio.setEngine(0.25 + Math.random() * 0.15)
    if (u >= 1) {
      // Out of puff: a little cough, a slide whistle down, and a cartoon hang in the air
      f.stage = 1
      f.at = t
      rocket.setFlame(0)
      audio.setEngine(0)
      audio.cough()
      audio.whistle(false)
      puff(6, '#9d97ad', 0.6)
    }
  } else if (f.stage === 1) {
    wob.rotation.z = damp(wob.rotation.z, f.dir * 0.25, 6, dt)
    if (t - f.at > 0.5) {
      f.stage = 2
      f.top = f.y
    }
  } else if (f.stage === 2) {
    f.vy -= 26 * dt
    f.y += f.vy * dt
    // One cartwheel on the first fall, upright again just as it lands
    if (f.bounces === 0) {
      const fallen = clamp((f.top - f.y) / (f.top - f.rest), 0, 1)
      wob.rotation.z = f.dir * (0.25 + smoothstep(fallen, 0, 0.92) * (Math.PI * 2 - 0.25))
    } else wob.rotation.z = damp(wob.rotation.z, 0, 8, dt)
    wob.position.x = damp(wob.position.x, 0, 4, dt)
    if (f.y <= f.rest) {
      const hit = -f.vy
      f.y = f.rest
      f.vy = hit * 0.42
      f.bounces++
      wob.rotation.z = f.bounces === 1 ? 0 : wob.rotation.z
      rocket.squash = Math.min(1.6, hit / 12)
      audio.boing()
      audio.thump()
      dustRing(Math.round(10 + hit * 1.5), Math.min(1.4, hit / 12))
      if (f.bounces === 1) {
        robot.spin = 1
        robot.wave = 2
      }
      if (f.vy < 2.2 || f.bounces >= 4) {
        f.stage = 3
        f.at = t
        f.vy = 0
        // A dizzy pilot: little stars go round
        const head = (rocket.pilot ?? rocket.root).getWorldPosition(new THREE.Vector3())
        for (let i = 0; i < 3; i++) setTimeout(() => game.state === 'flop' && popups.show(head.clone().add(v3b.set(rand(-0.6, 0.6), 0.9 + i * 0.3, 0.5)), '💫', true), i * 260)
        audio.dizzy()
      }
    }
  } else if (f.stage === 3) {
    const k = Math.max(0, 1 - (t - f.at) / 1.4)
    wob.rotation.z = Math.sin(t * 7) * 0.08 * k
    if (t - f.at > 1.8) return toGarage({ keepFx: true })
  }
  rocket.root.position.y = f.y
  // The shadow shrinks as the rocket climbs
  const h = clamp((f.y - f.rest) / FLOP_UP, 0, 1)
  shadow.scale.setScalar((rocket.width * 1.4 + 0.6) * (1 - h * 0.5))
}

// --- Arrival and landing ----------------------------------------------------------------

const party = { planet: null, pilot: null, flag: null, friend: null, dest: 0, t: 0, spot: new THREE.Vector3(), flagSpot: new THREE.Vector3(), friendSpot: new THREE.Vector3(), hopFrom: new THREE.Vector3(), news: [], stage: 0 }

function arrive() {
  game.state = 'arrive'
  game.t = 0
  // The picked place was for this trip only: next time the 🚀 goes back to the boosters' reach
  save.aim = null
  // The trip is over: a ⚡ still waiting goes dark and the floating one goes away
  $('turbo').classList.remove('full')
  $('turbo').disabled = true
  show('turbo-cue', false)
  const d = DESTS[flight.target]
  goalPlanet = models[d.model].clone()
  goalPlanet.scale.setScalar(3.4)
  goalPlanet.position.set(0, flight.alt + view.hh * 2 + 6, -10)
  scene.add(goalPlanet)
  audio.whoosh(1.6)
}

function updateArrive(dt) {
  game.t += dt
  const f = flight
  f.alt += f.speed * dt
  f.x = damp(f.x, 0, 2, dt)
  rocket.root.position.set(f.x, f.alt, 0)
  rocket.wobbler.rotation.z = damp(rocket.wobbler.rotation.z, 0, 4, dt)
  goalPlanet.rotation.y += dt * 0.3
  goalPlanet.position.y -= dt * 4
  updateItems(dt)
  if (game.t > 1.4 && !game.busy) {
    game.busy = true
    wipe(DESTS[f.target].emoji, setupLanding).then(() => (game.busy = false))
  }
}

/** Close a circle over the screen, do `mid`, then open it again. */
function wipe(emoji, mid) {
  return new Promise((resolve) => {
    const el = $('wipe')
    $('wipe-emoji').textContent = emoji
    el.classList.add('closed')
    setTimeout(() => {
      mid()
      setTimeout(() => {
        el.classList.remove('closed')
        setTimeout(resolve, 550)
      }, 250)
    }, 580)
  })
}

function groundAt(x, z) {
  const c = party.planet.position
  return c.y + Math.sqrt(Math.max(0, PLANET_R * PLANET_R - x * x - (z - c.z) * (z - c.z)))
}

function setupLanding() {
  clearFlight()
  const d = flight.target
  party.dest = d
  party.stage = 0
  party.t = 0
  game.state = 'landing'
  game.t = 0
  show('journey', false)
  show('flightbar', false)
  show('turbo-cue', false)
  show('tray', false)
  show('actions', false)
  show('reach', false)
  garage.visible = false
  $('finger').classList.add('hidden')
  rocket.setFlame(0.7)
  rocket.wobbler.rotation.set(0, 0, 0)
  rocket.wobbler.position.set(0, 0, 0)
  rocket.root.scale.setScalar(0.8)
  const planet = models[DESTS[d].model].clone()
  planet.scale.setScalar(PLANET_R)
  planet.rotation.x = -0.5
  // Keep a ring's near edge low, so it never hides the rocket on top
  for (const n of ['dest_ringed_band', 'dest_ringed_band2']) planet.getObjectByName(n)?.rotateX(0.85)
  planet.position.set(LAND.x, LAND.y - 1.4 - PLANET_R, LAND.z)
  scene.add(planet)
  party.planet = planet
  party.rest = LAND.y - 1.4 + rocket.half * 0.8 - 0.05
  rocket.root.position.set(0, party.rest + 10, 0)
  party.spot.set(1.9, 0, 1.2)
  party.spot.y = groundAt(party.spot.x, party.spot.z)
  party.flagSpot.set(2.75, 0, 0.6)
  party.flagSpot.y = groundAt(party.flagSpot.x, party.flagSpot.z)
  party.friendSpot.set(-2.1, 0, 1.1)
  party.friendSpot.y = groundAt(party.friendSpot.x, party.friendSpot.z)
  // Clear away any planet decorations sitting where the rocket, pilot, flag or friend go
  planet.updateMatrixWorld(true)
  const clear = [party.spot, party.flagSpot, party.friendSpot, v3b.set(0, LAND.y - 1.4, 0).clone()]
  for (const c of planet.children) {
    if (c.name.endsWith('_body') || /_(eye|cheek|smile|band|band2|tail)/.test(c.name)) continue
    c.getWorldPosition(v3)
    if (clear.some((p) => p.distanceTo(v3) < 1.6)) c.visible = false
  }
  cam.snap = true
  audio.setEngine(0.4)
  audio.playSong('flight')
}

function clearParty() {
  party.trick = null
  for (const k of ['planet', 'pilot', 'flag', 'friend', 'toy']) {
    if (party[k]) scene.remove(party[k])
    party[k] = null
  }
  rocket.root.scale.setScalar(1)
}

function makeDancer(id, scale) {
  const p = models[`pilot_${id}`].clone()
  p.scale.setScalar(scale)
  p.userData.arms = [p.getObjectByName(`${id}_arm_l`), p.getObjectByName(`${id}_arm_r`)]
  p.userData.legs = [p.getObjectByName(`${id}_leg_l`), p.getObjectByName(`${id}_leg_r`)]
  p.userData.head = p.getObjectByName(`${id}_head`)
  p.userData.feet = -p.getObjectByName(`${id}_feet`).position.y * scale
  return p
}

/** The pink alien friend from the Alien Planet (the alien pilot in other colours). */
function makeFriend(scale) {
  const f = makeDancer('alien', scale)
  const pink = new Map()
  f.traverse((o) => {
    if (o.isMesh && (o.material.name === 'fur_alien' || o.material.name === 'suit_alien')) {
      if (!pink.has(o.material)) pink.set(o.material, o.material.clone())
      o.material = pink.get(o.material)
    }
  })
  for (const [orig, m] of pink) m.color.set(orig.name === 'fur_alien' ? '#ff9ad5' : '#3bb5ff')
  return f
}

function updateLanding(dt) {
  game.t += dt
  const t = game.t
  if (party.stage === 0) {
    // Gentle descent, slowing down
    const u = Math.min(1, t / 2.4)
    rocket.root.position.y = party.rest + 10 * (1 - u) ** 2.2
    rocket.wobbler.rotation.z = Math.sin(t * 3) * 0.05 * (1 - u)
    rocket.setFlame(0.4 + (1 - u) * 0.5)
    const nz = rocket.nozzles(nozzleList)
    for (const n of nz) sparks.emit(n.x, n.y - 0.4, n.z, { vx: rand(-0.3, 0.3), vy: -4, spread: 0.5, life: 0.35, size: 0.5, endSize: 0.1, color: pick(exhaust()), drag: 1.5 })
    if (u >= 1) {
      party.stage = 1
      rocket.setFlame(0)
      rocket.squash = 1
      audio.thump()
      audio.setEngine(0)
      const dust = DESTS[party.dest].dust
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2
        smoke.emit(Math.cos(a) * 0.8, LAND.y - 1.3, Math.sin(a) * 0.8, { vx: Math.cos(a) * rand(2, 4), vy: rand(0.3, 1.2), vz: Math.sin(a) * rand(1, 2), spread: 0.5, life: 1.3, size: rand(0.7, 1.2), endSize: 2, color: dust, drag: 2 })
      }
    }
  } else if (party.stage === 1 && t > 3.1) {
    // The pilot hops out
    party.stage = 2
    party.hopT = 0
    rocket.pilot.getWorldPosition(party.hopFrom)
    rocket.pilot.visible = false
    party.pilot = makeDancer(save.rocket.pilot, 1.25)
    party.pilot.position.copy(party.hopFrom)
    scene.add(party.pilot)
    party.trick = null
    party.tricks = 0
    makeToy(party.dest)
    audio.whistle(true)
    if (party.dest === DESTS.length - 1) {
      // The alien friend waves hello
      party.friend = makeFriend(1.25)
      party.friend.position.set(party.friendSpot.x, party.friendSpot.y + party.friend.userData.feet, party.friendSpot.z)
      party.friend.rotation.y = 0.3
      scene.add(party.friend)
    }
  } else if (party.stage === 2) {
    party.hopT += dt
    const u = Math.min(1, party.hopT / 0.85)
    const p = party.pilot
    const to = v3.set(party.spot.x, party.spot.y + p.userData.feet, party.spot.z)
    p.position.lerpVectors(party.hopFrom, to, u)
    p.position.y += Math.sin(u * Math.PI) * 2.2
    p.rotation.y = u * Math.PI * 2
    p.rotation.z = -Math.sin(u * Math.PI) * 0.3
    if (u >= 1) {
      party.stage = 3
      party.t = 0
      p.rotation.set(0, -0.2, 0)
      audio.thump()
      smoke.emit(to.x, party.spot.y, to.z, { vy: 0.5, spread: 1.5, life: 0.8, size: 0.6, endSize: 1.2, color: DESTS[party.dest].dust, drag: 2 })
    }
  } else if (party.stage === 3) {
    party.t += dt
    if (party.t > 0.5 && !party.flag) {
      party.flag = models.flag.clone()
      const fab = party.flag.getObjectByName('flag_fabric')
      fab.material = fab.material.clone()
      fab.material.color.set(save.rocket.colors.tank)
      party.flag.position.copy(party.flagSpot)
      party.flag.position.y -= 0.05
      party.flag.rotation.y = -0.4
      party.flag.scale.set(1.3, 0.01, 1.3)
      party.flag.userData.t = 0
      scene.add(party.flag)
      audio.thump()
      audio.whistle(true)
    }
    if (party.t > 1.2) startParty()
  }
  animateDancers(dt, party.stage >= 4)
}

/** Each landing hands over a few of the planet's gifts; the rest wait for coming back. */
const GIFTS_PER_LANDING = 3
function startParty() {
  party.stage = 4
  game.state = 'party'
  game.t = 0
  const d = party.dest
  save.visited[d] = true
  party.news = [...flight.flyby, ...giftsLeft(d).slice(0, GIFTS_PER_LANDING).map((n) => ({ ...n, from: d }))]
  flight.flyby = []
  for (const n of party.news) {
    save.got.add(`${n.slot}:${n.id}`)
    save.fresh.add(`${n.slot}:${n.id}`)
  }
  // The friend from the Alien Planet rides home and waits in the garage from now on
  if (d === DESTS.length - 1) save.friend = true
  save.landed = d
  save.flights++
  persist()
  audio.fanfare()
  audio.playSong('dance')
  banner(`🎉 ${DESTS[d].emoji} 🎉`, 3200, true)
  confetti()
  // The card waits, so the first tricks are in plain view: it comes after the first trick, or at 4.5 s
  setTimeout(() => {
    if (game.state === 'party' && $('reward').classList.contains('hidden')) showReward()
  }, 4500)
}

/** One happy pop of confetti around the pilot and the flag as the party starts. */
const CONFETTI = ['#ff4f6d', '#ffd23f', '#5cd65c', '#3bb5ff', '#9b5de5', '#ff8fc7', '#ffffff']
function confetti() {
  const at = party.pilot?.position ?? rocket.root.position
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2
    sparks.emit(at.x + Math.cos(a) * 0.6, at.y + 1, at.z + 0.5, { vx: Math.cos(a) * rand(1.5, 3.5), vy: rand(3, 6), vz: Math.sin(a) * rand(0.5, 1.5), spread: 0.3, life: 2, size: rand(0.35, 0.55), endSize: 0.2, color: CONFETTI[i % CONFETTI.length], grav: -6, drag: 0.8 })
  }
}

function showReward() {
  const d = DESTS[party.dest]
  $('reward-head').textContent = `${d.emoji} 🚩`
  const el = $('reward-new')
  el.innerHTML = ''
  el.classList.toggle('many', party.news.length + (flight.stars ? 1 : 0) > 6)
  party.news.forEach((n, i) => {
    const g = document.createElement('div')
    g.className = 'gift'
    g.style.animationDelay = `${0.15 + i * 0.1}s`
    g.innerHTML = `<img src="${thumbOf(n.slot, n.id)}" alt="">`
    // Gifts found on the way wear their planet's badge
    if (n.from !== party.dest) g.insertAdjacentHTML('beforeend', `<span class="from">${DESTS[n.from].emoji}</span>`)
    el.append(g)
    setTimeout(() => audio.unlock1(i), 150 + i * 100)
  })
  // The star picture leads the row whenever this trip caught stars
  if (flight.stars) {
    const g = document.createElement('div')
    g.className = 'gift pic'
    g.append(cardPicture())
    el.prepend(g)
  }
  lastInput = performance.now()
  show('reward')
}

/**
 * The wall's star picture, small on the reward card: the dots this trip's stars lit pop on, so
 * every landing (even one with no gifts left) shows what the stars were for.
 */
function cardPicture() {
  const before = pictureAt(save.skyShown)
  const after = pictureAt(save.sky)
  // A picture finished on this trip is shown whole (the next one starts on the wall at home)
  const now = after.n === before.n ? after : { n: before.n, pic: before.pic, lit: before.pic.dots.length }
  const fresh = before.lit
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'card-pic')
  const bg = document.createElementNS(NS, 'rect')
  Object.entries({ x: 2, y: 2, width: 96, height: 96, rx: 16, fill: '#2a2266', stroke: '#ffd23f', 'stroke-width': 4 }).forEach(([k, v]) => bg.setAttribute(k, v))
  svg.append(bg)
  const at = ([u, v]) => [10 + u * 80, 90 - v * 80]
  if (now.lit >= now.pic.dots.length) {
    for (const [a, b] of now.pic.lines) {
      const l = document.createElementNS(NS, 'line')
      const [x1, y1] = at(now.pic.dots[a])
      const [x2, y2] = at(now.pic.dots[b])
      Object.entries({ x1, y1, x2, y2, stroke: now.pic.color, 'stroke-width': 3, 'stroke-linecap': 'round', class: 'pic-line' }).forEach(([k, v]) => l.setAttribute(k, v))
      svg.append(l)
    }
  }
  now.pic.dots.forEach((d, k) => {
    const c = document.createElementNS(NS, 'circle')
    const [cx, cy] = at(d)
    const lit = k < now.lit
    Object.entries({ cx, cy, r: lit ? 6 : 3, fill: lit ? now.pic.color : '#7c74b8' }).forEach(([k2, v]) => c.setAttribute(k2, v))
    if (lit && k >= fresh) {
      c.setAttribute('class', 'pic-new')
      c.style.animationDelay = `${0.4 + (k - fresh) * 0.15}s`
    }
    svg.append(c)
  })
  return svg
}

/** The landing song is one phrase (about nine seconds); after it the dancers ease into a still pose. */
const DANCE_FOR = 9
function animateDancers(dt, dancing, resting = false) {
  const t = game.time
  if (party.flag) {
    const f = party.flag
    f.userData.t += dt
    const u = Math.min(1, f.userData.t / 0.6)
    const s = 1.3 * (u < 1 ? 1 + 0.25 * Math.sin(u * Math.PI) * (1 - u) : 1)
    f.scale.set(1.3, 1.3 * (u < 1 ? u * (2 - u) * s / 1.3 : 1), 1.3)
    const cloth = f.getObjectByName('flag_cloth')
    cloth.rotation.y = Math.sin(t * 4) * 0.25
    cloth.rotation.z = Math.sin(t * 2.7) * 0.05
  }
  for (const [p, phase] of [[party.pilot, 0], [party.friend, 1.3]]) {
    if (!p || party.stage < 3) continue
    const [al, ar] = p.userData.arms
    const [ll, lr] = p.userData.legs
    const head = p.userData.head
    if (!dancing && p === party.pilot) {
      // Waving hello while the flag goes up
      ar.rotation.z = 2.4 + Math.sin(t * 9) * 0.4
      al.rotation.z = 0
      continue
    }
    if (p === party.friend && party.stage < 4) {
      ar.rotation.z = 2.4 + Math.sin(t * 8) * 0.4
      continue
    }
    const spot = p === party.pilot ? party.spot : party.friendSpot
    const facing = p === party.pilot ? -0.2 : 0.3
    if (resting) {
      for (const limb of [al, ar, ll, lr, head]) limb.rotation.z = damp(limb.rotation.z, 0, 4, dt)
      p.position.y = damp(p.position.y, spot.y + p.userData.feet, 6, dt)
      const turn = Math.atan2(Math.sin(p.rotation.y - facing), Math.cos(p.rotation.y - facing))
      p.rotation.y = facing + damp(turn, 0, 4, dt)
      continue
    }
    const beat = t * Math.PI * 2.5 + phase
    const cycle = (t + phase) % 6
    p.position.y = spot.y + p.userData.feet + Math.abs(Math.sin(beat)) * 0.32
    al.rotation.z = -2.2 - Math.sin(beat) * 0.6
    ar.rotation.z = 2.2 - Math.sin(beat) * 0.6
    ll.rotation.z = Math.max(0, Math.sin(beat)) * 0.4
    lr.rotation.z = -Math.max(0, -Math.sin(beat)) * 0.4
    head.rotation.z = Math.sin(beat) * 0.2
    p.rotation.y = facing + (cycle > 4.5 ? (cycle - 4.5) / 1.5 * Math.PI * 2 : Math.sin(beat * 0.5) * 0.3)
  }
  if (party.planet) {
    const s = 1 + (dancing ? Math.sin(t * Math.PI * 5) * 0.012 : 0)
    party.planet.scale.set(PLANET_R / s, PLANET_R * s, PLANET_R / s)
  }
}

function updateParty(dt) {
  game.t += dt
  const dancing = game.t < DANCE_FOR && !party.trick
  animateDancers(dt, dancing, !dancing)
  updateToy(dt)
}

/**
 * Each place has its own landing toy: tap the scene and the pilot plays with it. Floaty
 * moon-gravity hops on the Moon; a dust devil on Mars that whisks the pilot round; a hula hoop
 * from the Ring Planet; a loop-the-loop on an icy comet trail; a jump-and-spin with the friend on
 * the Alien Planet.
 */
const TRICK_FOR = [
  [2.4, 2.6],
  [2.4, 2.2],
  [2.6, 2.4],
  [2.2, 2.6],
  [2.2, 2.0],
]
function makeToy(d) {
  party.toy = null
  if (d === 1) {
    // A little dust devil wandering about the surface
    const devil = new THREE.Group()
    devil.userData = { x: -1.6, dir: 1 }
    party.toy = devil
  } else if (d === 2) {
    // A hula hoop lying beside the pilot, in the Ring Planet's colours
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 36), new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#ffb76b', emissiveIntensity: 0.35, roughness: 0.4 }))
    hoop.rotation.x = Math.PI / 2
    hoop.position.set(party.spot.x - 0.9, party.spot.y + 0.05, party.spot.z + 0.5)
    hoop.userData.rest = hoop.position.clone()
    party.toy = hoop
  }
  if (party.toy) scene.add(party.toy)
}
function startTrick() {
  if (game.state !== 'party' || party.trick || !party.pilot) return
  // Taps take turns between the planet's two tricks
  party.trick = { t: 0, from: party.pilot.position.clone(), v: party.tricks % 2 }
  party.tricks++
  const d = party.dest
  // Every trick starts with a pop: a ring, a puff of the planet's dust and a springy stretch
  const at = party.pilot.position
  rings.spawn(v3.set(at.x, at.y + 0.6, at.z + 0.3), DESTS[d].dust, 3.2, 0.5)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    smoke.emit(at.x + Math.cos(a) * 0.4, party.spot.y + 0.05, at.z + Math.sin(a) * 0.4, { vx: Math.cos(a) * rand(1.5, 2.5), vy: rand(0.3, 1), vz: Math.sin(a) * rand(0.8, 1.4), spread: 0.3, life: 0.9, size: rand(0.5, 0.8), endSize: 1.4, color: DESTS[d].dust, drag: 2 })
  }
  sparks.burst(v3.set(at.x, at.y + 0.8, at.z + 0.3), ['#fff3a0', '#ffffff', DESTS[d].dust], 12, 3, 0.5)
  if (d === 0) audio.whistle(true)
  else if (d === 1) audio.whoosh(1.6)
  else if (d === 2) audio.hoop()
  else if (d === 3) audio.ice(3)
  else audio.cheer()
}
function updateToy(dt) {
  const d = party.dest
  const t = game.time
  const toy = party.toy
  if (d === 1 && toy) {
    // The dust devil wanders to and fro (and comes to the pilot during its trick)
    const u = toy.userData
    if (!party.trick || party.trick.v) {
      u.x += u.dir * dt * 0.5
      if (u.x > -0.9 || u.x < -2.6) u.dir *= -1
      toy.position.set(u.x, groundAt(u.x, 1.4), 1.4)
    } else toy.position.lerp(v3.set(party.spot.x, party.spot.y, party.spot.z), Math.min(1, dt * 6))
    const big = party.trick && !party.trick.v ? 1.6 : 1
    for (let k = 0; k < 3; k++) {
      const h = Math.random() * 1.6 * big
      const a = t * 9 + k * 2.1 + h * 3
      const r = (0.15 + h * 0.3) * big
      smoke.emit(toy.position.x + Math.cos(a) * r, toy.position.y + h, toy.position.z + Math.sin(a) * r, { vx: -Math.sin(a) * 2, vy: 0.6, vz: Math.cos(a) * 2, spread: 0.2, life: 0.5, size: rand(0.25, 0.45), endSize: 0.7, color: pick(['#ffb08a', '#ff8a5c', '#ffd0b0']), drag: 2 })
    }
  }
  const tr = party.trick
  const p = party.pilot
  if (!tr || !p) return
  tr.t += dt
  const len = TRICK_FOR[d][tr.v]
  const u = Math.min(1, tr.t / len)
  const [al, ar] = p.userData.arms
  const base = v3b.set(party.spot.x, party.spot.y + p.userData.feet, party.spot.z)
  // A springy squash-and-stretch as the trick starts
  const spring = 1 + 0.3 * Math.exp(-tr.t * 5) * Math.sin(tr.t * 22)
  p.scale.set(1.25 / Math.sqrt(spring), 1.25 * spring, 1.25 / Math.sqrt(spring))
  if (d === 0 && tr.v) {
    // Moon gravity, again: three bouncy hops, each one higher
    const k = Math.min(2, Math.floor(u * 3))
    const w = u * 3 - k
    p.position.set(base.x - 0.25 + k * 0.25, base.y + Math.sin(w * Math.PI) * (0.8 + k * 0.7), base.z)
    p.rotation.z = Math.sin(w * Math.PI) * 0.3 * (k % 2 ? 1 : -1)
    al.rotation.z = -1.6 - Math.sin(w * Math.PI)
    ar.rotation.z = 1.6 + Math.sin(w * Math.PI)
  } else if (d === 1 && tr.v) {
    // A cartwheel across the red sand and back
    const there = Math.sin(u * Math.PI)
    p.position.set(base.x - there * 2.2, base.y + Math.abs(Math.sin(u * Math.PI * 2)) * 0.8, base.z)
    p.rotation.z = u * Math.PI * 4
    al.rotation.z = -2.8
    ar.rotation.z = 2.8
    if (Math.random() < 0.3) smoke.emit(p.position.x, party.spot.y, p.position.z, { vy: 0.4, spread: 0.6, life: 0.6, size: 0.4, endSize: 0.8, color: DESTS[1].dust, drag: 2 })
  } else if (d === 2 && tr.v && toy) {
    // Ring toss: the hoop sails up and drops over the rocket's nose, then hops back
    const nose = v3.set(rocket.root.position.x, rocket.root.position.y + rocket.half * 0.8 * 0.9, rocket.root.position.z)
    const go = smoothstep(u, 0, 0.45)
    const back = smoothstep(u, 0.65, 1)
    const arc = Math.sin(go * Math.PI) * 2.2 * (1 - back) + Math.sin(back * Math.PI) * 1.5
    const down = smoothstep(u, 0.45, 0.62) * rocket.half * 0.8 * 0.3
    toy.position.lerpVectors(toy.userData.rest, nose, go * (1 - back))
    toy.position.y += arc - down * (1 - back)
    toy.rotation.set(Math.PI / 2, 0, u * Math.PI * 6)
    al.rotation.z = -2.6 * (1 - go)
    ar.rotation.z = 2.6
    if (u > 0.45 && !tr.clink) {
      tr.clink = true
      audio.hoop()
      sparks.burst(toy.position, ['#ffe0b0', '#d9c7ff', '#ffffff'], 12, 3, 0.5)
    }
  } else if (d === 3 && tr.v) {
    // A zoom round the comet in a big figure-eight, icy sparkles behind
    const a = u * Math.PI * 2
    p.position.set(base.x - 1.4 - Math.sin(a) * 2, base.y + 1.5 + Math.sin(a * 2) * 0.9, base.z + Math.cos(a) * 0.4)
    p.rotation.z = Math.sin(a) * 0.5
    al.rotation.z = -2.6
    ar.rotation.z = 2.6
    sparks.emit(p.position.x, p.position.y, p.position.z, { vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), spread: 0.3, life: 0.9, size: rand(0.35, 0.55), endSize: 0, color: pick(['#c9f6ff', '#9fe8ff', '#ffffff']), drag: 1 })
  } else if (d === 4 && tr.v && party.friend) {
    // High five: pilot and friend leap toward each other and clap in the middle
    const f = party.friend
    const meet = Math.sin(u * Math.PI)
    const mid = (party.spot.x + party.friendSpot.x) / 2
    p.position.set(lerp(base.x, mid + 0.45, meet), base.y + meet * 2, base.z)
    f.position.set(lerp(party.friendSpot.x, mid - 0.45, meet), party.friendSpot.y + f.userData.feet + meet * 2, party.friendSpot.z)
    ar.rotation.z = 2.8
    f.userData.arms[1].rotation.z = 2.8
    if (u > 0.5 && !tr.clap) {
      tr.clap = true
      audio.cheer()
      sparks.burst(v3.set(mid, base.y + 3, base.z), EXHAUSTS[3], 22, 4, 0.7)
    }
  } else if (d === 0) {
    // Moon gravity: a slow, high, floaty hop with a somersault
    p.position.set(base.x, base.y + Math.sin(u * Math.PI) * 2.6, base.z)
    p.rotation.x = smoothstep(u, 0.2, 0.8) * Math.PI * 2
    al.rotation.z = -2.6
    ar.rotation.z = 2.6
  } else if (d === 1) {
    // Whisked round and up by the dust devil
    const lift = Math.sin(u * Math.PI)
    p.position.set(base.x + Math.sin(u * Math.PI * 4) * 0.5 * lift, base.y + lift * 2.4, base.z + Math.cos(u * Math.PI * 4) * 0.5 * lift)
    p.rotation.y = -0.2 + u * Math.PI * 6
    al.rotation.z = -2.4
    ar.rotation.z = 2.4
  } else if (d === 2 && toy) {
    // The hoop hops up round the pilot's middle and spins, the pilot wiggling with it
    const on = smoothstep(u, 0, 0.15) * (1 - smoothstep(u, 0.85, 1))
    const waist = v3.set(base.x, base.y + 0.55 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.9, base.z)
    const a = tr.t * 14
    const spin = v3.set(waist.x + Math.cos(a) * 0.12, waist.y + Math.sin(a * 0.5) * 0.04, waist.z + Math.sin(a) * 0.12)
    toy.position.lerpVectors(toy.userData.rest, spin, on)
    toy.rotation.set(Math.PI / 2 + Math.sin(a) * 0.25 * on, 0, Math.cos(a) * 0.25 * on)
    // ...and the pilot bounces up and twirls inside it
    p.position.set(base.x + Math.sin(a) * 0.08 * on, base.y + Math.abs(Math.sin(u * Math.PI * 2)) * 0.9, base.z)
    p.rotation.y = -0.2 + u * Math.PI * 4
    p.rotation.z = Math.sin(a) * 0.15 * on
    al.rotation.z = -1.4
    ar.rotation.z = 1.4
  } else if (d === 3) {
    // A loop-the-loop on an icy comet trail
    const a = u * Math.PI * 2
    p.position.set(base.x - Math.sin(a) * 1.3, base.y + (1 - Math.cos(a)) * 1.3, base.z)
    p.rotation.z = a
    al.rotation.z = -2.6
    ar.rotation.z = 2.6
    sparks.emit(p.position.x, p.position.y, p.position.z, { vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), spread: 0.3, life: 0.9, size: rand(0.35, 0.55), endSize: 0, color: pick(['#c9f6ff', '#9fe8ff', '#ffffff']), drag: 1 })
  } else {
    // Alien Planet: pilot and friend jump and spin together
    tr.v = 0
    for (const [who, spot] of [[p, party.spot], [party.friend, party.friendSpot]]) {
      if (!who) continue
      who.position.y = spot.y + who.userData.feet + Math.sin(u * Math.PI) * 2.6
      who.rotation.y = (who === p ? -0.2 : 0.3) + u * Math.PI * 4
    }
  }
  if (u >= 1) {
    party.trick = null
    if ($('reward').classList.contains('hidden')) setTimeout(() => game.state === 'party' && $('reward').classList.contains('hidden') && showReward(), 400)
    p.rotation.set(0, -0.2, 0)
    p.scale.setScalar(1.25)
    p.position.copy(base)
    if (toy && d === 2) {
      toy.position.copy(toy.userData.rest)
      toy.rotation.set(Math.PI / 2, 0, 0)
    }
    audio.thump()
    smoke.emit(base.x, party.spot.y, base.z, { vy: 0.5, spread: 1.5, life: 0.8, size: 0.6, endSize: 1.2, color: DESTS[d].dust, drag: 2 })
    if (d === 4) confetti()
  }
}

function backToGarage(thenLaunch = false) {
  if (game.busy) return
  game.busy = true
  audio.click()
  $('finger').classList.add('hidden')
  // Head to the tab with something new, so it is easy to find
  const fresh = [...save.fresh].pop()?.split(':')[0]
  if (fresh) game.tab = fresh
  wipe('🔧', () => {
    toGarage({ snap: true })
    if (thenLaunch) {
      $('tray').classList.add('away')
      $('actions').classList.add('away')
    }
  }).then(() => {
    game.busy = false
    if (thenLaunch) launch()
  })
}
$('to-garage').addEventListener('click', () => backToGarage(false))
$('again').addEventListener('click', () => backToGarage(true))
// Coming home mid-countdown slides the tray back in: the GO column settles above it once it has arrived
$('tray').addEventListener('transitionend', () => { if (game.state === 'garage') layoutActions() })

// --- Input ----------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock()
  pointerHeld = true
  if (game.state === 'flight') return steerPointer(e)
  if (game.state === 'party') return startTrick()
  if (game.state !== 'garage' && game.state !== 'title') return
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  const slot = rocket.pick(raycaster)
  if (slot && game.state === 'garage') {
    setTab(slot)
    choose(slot, nextUnlocked(slot))
    return
  }
  if (game.state === 'garage' && tapToy(raycaster)) return
  if (raycaster.intersectObject(robot.obj, true).length) {
    robot.spin = 1
    robot.wave = 2
    // Robot's hello: three soft rounded notes (sine and triangle, never a harsh square buzz)
    audio.tone(880, { dur: 0.16, vol: 0.08, type: 'sine', echo: false })
    audio.tone(660, { when: 0.15, dur: 0.16, vol: 0.07, type: 'triangle', echo: false })
    audio.tone(990, { when: 0.3, dur: 0.24, vol: 0.07, type: 'sine' })
  }
})

/**
 * Buttons a stray tap (or a palm) must not trigger: 🏠, 🔊 and 🎵. A ring fills round the
 * button while it is held; let go early and nothing
 * happens.
 */
// Every finger on the screen, wherever it is: a hold starts only with one finger down in the
// whole page, any other finger landing cancels it, and no new hold starts until all have lifted.
const fingers = new Set()
let fingersClear = true
let cancelHold = () => {}
addEventListener('pointerdown', (e) => {
  cancelHold()
  fingers.add(e.pointerId)
  if (fingers.size > 1) {
    fingersClear = false
    cancelHold()
  }
}, true)
for (const type of ['pointerup', 'pointercancel']) addEventListener(type, (e) => {
  fingers.delete(e.pointerId)
  if (!fingers.size) fingersClear = true
}, true)
function holdButton(id, needsHold, act, holdFor = 700) {
  const b = $(id)
  let timer = 0
  let finger = null
  const release = () => {
    clearTimeout(timer)
    timer = 0
    finger = null
    b.classList.remove('holding')
  }
  b.style.setProperty('--hold-for', `${holdFor}ms`)
  b.addEventListener('pointerdown', (e) => {
    audio.unlock()
    e.stopPropagation()
    if (!needsHold()) return
    release()
    if (fingers.size !== 1 || !fingersClear) return
    cancelHold()
    finger = e.pointerId
    cancelHold = release
    void b.offsetWidth
    b.classList.add('holding')
    timer = setTimeout(() => {
      const valid = finger !== null && fingers.has(finger) && fingers.size === 1 && fingersClear
      release()
      if (valid) act()
    }, holdFor)
  })
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, (e) => { if (e.pointerId === finger) release() }, true)
  b.addEventListener('pointerleave', (e) => { if (e.pointerId === finger) release() })
  b.addEventListener('lostpointercapture', release)
  b.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
    }
  })
  b.addEventListener('click', (e) => {
    // Native Enter/Space clicks have no pointer and must never bypass a hold.
    if (e.detail === 0 || needsHold()) {
      e.preventDefault()
      return
    }
    act()
  })
}
addEventListener('keydown', () => cancelHold(), true)
addEventListener('blur', () => {
  cancelHold()
  fingers.clear()
  fingersClear = true
})
holdButton('home', () => game.state !== 'title' && game.state !== 'loading', () => goHome())
holdButton('sound', () => true, () => toggleSound(), 1300)
holdButton('music', () => true, () => toggleMusic(), 1300)
function goHome() {
  if (game.busy) return
  if (game.state === 'garage') {
    audio.click()
    toTitle()
  } else if (['countdown', 'flop', 'flight', 'arrive', 'landing', 'party'].includes(game.state)) backToGarage(false)
}

function toggleSound() {
  audio.unlock()
  audio.setMuted(!audio.muted)
  renderSound()
}
function toggleMusic() {
  audio.unlock()
  audio.setMusic(!audio.musicOn)
  renderSound()
}

addEventListener('keydown', (e) => {
  audio.unlock()
  const k = e.key
  // Keyboard mute is available only outside play; play settings require a pointer hold.
  if ((k === 'm' || k === 'M') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    if (['title', 'loading'].includes(game.state)) toggleSound()
    return
  }
  if (k === 'Escape') {
    // Building and flying are play: leave through the deliberate home-button hold.
    if (['title', 'loading'].includes(game.state)) return goHome()
    return
  }
  if (game.state === 'title' && (k === 'Enter' || k === ' ')) {
    e.preventDefault()
    audio.click()
    return toGarage()
  }
  if (game.state === 'garage') {
    const i = SLOTS.findIndex((s) => s.id === game.tab)
    if (k === 'Enter' || k === ' ') {
      e.preventDefault()
      return launch()
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault()
      audio.click()
      return setTab(SLOTS[(i + (k === 'ArrowRight' ? 1 : SLOTS.length - 1)) % SLOTS.length].id)
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault()
      const list = PARTS[game.tab].filter((p) => isUnlocked(p, save.got))
      const j = list.findIndex((p) => p.id === save.rocket[game.tab])
      return choose(game.tab, list[(j + (k === 'ArrowDown' ? 1 : list.length - 1)) % list.length].id)
    }
    if (k === 'r' || k === 'R') return surprise()
    if (k === 'p' || k === 'P') {
      const s = slotDef(game.tab)
      if (s.paint) paint(COLORS[(COLORS.indexOf(save.rocket.colors[game.tab]) + 1) % COLORS.length])
    }
    return
  }
  if (game.state === 'flight' && (k === 'Enter' || k === ' ' || k === 't' || k === 'T')) {
    e.preventDefault()
    return useTurbo()
  }
  if (game.state === 'party' && (k === 'Enter' || k === ' ')) {
    e.preventDefault()
    return backToGarage(true)
  }
  keys.add(k)
  if (k.startsWith('Arrow') || k === ' ') e.preventDefault()
})
addEventListener('keyup', (e) => keys.delete(e.key))
addEventListener('blur', () => keys.clear())
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('gesturestart', (e) => e.preventDefault())
addEventListener('touchmove', (e) => {
  if (!e.target.closest?.('.items')) e.preventDefault()
}, { passive: false })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend()
  else if (audio.ctx) audio.unlock()
})

// --- Sky, robot and the main loop -----------------------------------------------------

const skyTop = new THREE.Color()
const skyBottom = new THREE.Color()
const spaceTop = new THREE.Color()
const spaceBottom = new THREE.Color()

function updateSky(dt) {
  let s = 0
  if (game.state === 'flight' || game.state === 'arrive') s = smoothstep(flight.alt - flight.start, 12, 75)
  else if (game.state === 'landing' || game.state === 'party') s = 1
  const d = DESTS[game.state === 'landing' || game.state === 'party' ? party.dest : flight.target]
  spaceTop.set(d.sky[0])
  spaceBottom.set(d.sky[1])
  // day -> dusk -> space
  if (s < 0.5) {
    skyTop.copy(SKY.day[0]).lerp(SKY.dusk[0], s * 2)
    skyBottom.copy(SKY.day[1]).lerp(SKY.dusk[1], s * 2)
  } else {
    skyTop.copy(SKY.dusk[0]).lerp(spaceTop, (s - 0.5) * 2)
    skyBottom.copy(SKY.dusk[1]).lerp(spaceBottom, (s - 0.5) * 2)
  }
  skyMat.uniforms.uTop.value.lerp(skyTop, Math.min(1, dt * 6))
  skyMat.uniforms.uBottom.value.lerp(skyBottom, Math.min(1, dt * 6))
  const u = starField.material.uniforms
  u.uCam.value = cam.y
  u.uTime.value = game.time
  u.uAlpha.value = damp(u.uAlpha.value, smoothstep(s, 0.35, 0.9), 4, dt)
  hemi.intensity = lerp(1.5, 0.95, s)
  key.intensity = lerp(2.5, 1.7, s)
  scene.environmentIntensity = lerp(0.45, 0.3, s)
}

/** 1 while the child is busy, easing to 0 a few seconds after the last touch: the garage settles still. */
let lively = 1
function updateGarage(dt) {
  const t = game.time
  lively = damp(lively, idle() < 5 ? 1 : 0, 1.5, dt)
  // Robot: a little sway while the child works; he waves only when something happens (a card, a launch, a tap)
  robot.wave -= dt
  const waving = robot.wave > 0
  robot.arm.rotation.z = damp(robot.arm.rotation.z, waving ? 2.5 + Math.sin(t * 10) * 0.45 : 0.1, 8, dt)
  robot.armL.rotation.z = damp(robot.armL.rotation.z, game.state === 'countdown' ? -2.5 + Math.sin(t * 10) * 0.4 : -0.1, 8, dt)
  robot.spin = Math.max(0, robot.spin - dt)
  robot.obj.rotation.y = robot.turn + (1 - robot.spin) * (robot.spin > 0 ? Math.PI * 2 : 0) + Math.sin(t * 1.2) * 0.08 * lively
  robot.obj.position.y = Math.abs(Math.sin(t * 3)) * 0.04 * lively
  updatePadSway(dt)
  // Roof hatch and gantry arm move aside for take-off
  doors.l.position.x = damp(doors.l.position.x, -doors.open * 2.4, 3, dt)
  doors.r.position.x = damp(doors.r.position.x, doors.open * 2.4, 3, dt)
  doors.arm.position.x = damp(doors.arm.position.x, doors.armX + doors.open * 1.2, 3, dt)
  if (game.state !== 'countdown') padLights.forEach((m, i) => (m.emissiveIntensity = 1 + 0.8 * lively * Math.sin(t * 3 + i * 0.8)))
  updateWall(dt)
}

const debug = { paused: false }
const timer = new THREE.Timer()
timer.connect(document)

function frame() {
  timer.update()
  if (debug.paused) return
  tick(Math.min(timer.getDelta(), 1 / 20))
}

function tick(dt) {
  game.time += dt
  if (game.state === 'loading' || !rocket) {
    renderer.render(scene, camera)
    return
  }
  switch (game.state) {
    case 'countdown':
      updateCountdown(dt)
      break
    case 'flop':
      updateFlop(dt)
      break
    case 'flight':
      updateFlight(dt)
      break
    case 'arrive':
      updateArrive(dt)
      break
    case 'landing':
      updateLanding(dt)
      break
    case 'party':
      updateParty(dt)
      break
  }
  if (garage.visible) updateGarage(dt)
  rocket.update(dt, game.time)
  sparks.update(dt)
  smoke.update(dt)
  rings.update(dt)
  updateCamera(dt)
  updateSky(dt)
  audio.updateMusic()
  if ((game.state === 'garage' || game.state === 'party') && Math.random() < dt * 2) placeFinger()
  renderer.render(scene, camera)
}

resize()
renderSound()
renderer.setAnimationLoop(frame)

load()
  .then(() => {
    show('loading', false)
    resize()
    toTitle()
    cam.snap = true
  })
  .catch((err) => {
    console.error(err)
    $('loading-text').textContent = '🔄'
    $('loading').addEventListener('click', () => location.reload())
  })

// Handy for testing: ?debug exposes the game state in the console
if (new URLSearchParams(location.search).has('debug')) window.rg = { land(d) { clearFlight(); flight.target = d; flight.stars = 7; setupLanding() }, debug, flop, step(sec = 1) { for (let i = 0; i < sec * 30; i++) tick(1 / 30) }, keys, game, save, flight, party, choose, launch, surprise, toGarage, backToGarage, useTurbo, items, spawnPattern, get flopRun() { return flopRun }, wall, giveStars, zoneAt, get robot() { return robot }, get rocket() { return rocket } }
