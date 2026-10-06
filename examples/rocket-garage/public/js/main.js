import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Audio } from './audio.js'
import { Particles, Popups, Rings, makeGlowTexture } from './effects.js'
import { COLORS, DESTS, PARTS, SLOTS, isUnlocked, modelName, part, reach, sanitize, unlocksAt, wobble } from './parts.js'
import { Rocket } from './rocket.js'
import { Thumbs } from './thumbs.js'
import { createWorkshop } from './workshop.js'

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
const save = {
  visited,
  rocket: sanitize(saved.rocket, visited),
  fresh: new Set(Array.isArray(saved.fresh) ? saved.fresh.filter((s) => typeof s === 'string') : []),
  stars: Number.isFinite(saved.stars) ? saved.stars : 0,
  flights: Number.isFinite(saved.flights) ? saved.flights : 0,
  picked: !!saved.picked,
}
function persist() {
  store.set(SAVE, { visited: save.visited, rocket: save.rocket, fresh: [...save.fresh], stars: save.stars, flights: save.flights, picked: save.picked })
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
audio.muted = store.get('rocket-garage-muted', false)
audio.musicOn = store.get('rocket-garage-music', true)
const glowTex = makeGlowTexture(false)
const sparks = new Particles(scene, 900)
const smoke = new Particles(scene, 500, true)
const rings = new Rings(scene)
const popups = new Popups($('popups'), camera)

// --- Game state ----------------------------------------------------------------------

const TURBO = 14
const LAND = new THREE.Vector3(0, -2000, 0)
const PLANET_R = 4
const game = {
  state: 'loading', // loading | title | garage | countdown | flight | arrive | landing | party
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
  garage.getObjectByName('garage_robot').position.set(-2.6, 0, 1.1)
  garage.getObjectByName('garage_robot').rotation.y = 0.35
  garage.getObjectByName('garage_toolbox').position.set(2.5, 0, 1.5)
  garage.getObjectByName('garage_toolbox').rotation.y = -0.4
  robot = {
    obj: garage.getObjectByName('garage_robot'),
    arm: garage.getObjectByName('garage_robot_arm'),
    armL: garage.getObjectByName('garage_robot_arm_l'),
    wave: 2,
    spin: 0,
  }
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

  rocket = new Rocket(models, glowTex)
  scene.add(rocket.root)
  rocket.build(save.rocket)
  placeOnPad()
  scene.add(shadow)

  thumbs = new Thumbs(128)
  for (const slot of SLOTS) for (const pt of PARTS[slot.id]) makeThumb(slot.id, pt.id)
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
  const opts = slot === 'sticker' ? { turn: 0, tilt: 0, fill: 0.78 } : slot === 'pilot' ? { turn: -0.15, tilt: 0.05, fill: 0.86 } : slot === 'booster' ? { turn: -0.3, fill: 0.8 } : {}
  thumbCache[`${slot}:${id}`] = thumbs.shot(obj, opts)
  return thumbCache[`${slot}:${id}`]
}

function thumbOf(slot, id) {
  if (id === 'none') return thumbCache[`${slot}:${PARTS[slot][1].id}`]
  return thumbCache[`${slot}:${id}`] ?? makeThumb(slot, id)
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
  layoutActions()
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

function renderReach(ping = -1) {
  const r = reach(save.rocket)
  const el = $('reach')
  el.innerHTML = ''
  DESTS.forEach((d, i) => {
    if (i > 0) {
      const dash = document.createElement('span')
      dash.className = 'dash' + (i <= r ? ' lit' : '')
      el.append(dash)
    }
    const s = document.createElement('span')
    s.className = 'd' + (i > r ? ' far' : '') + (i === r ? ' goal' : '') + (i === ping ? ' ping' : '')
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
  for (const s of SLOTS) {
    const b = document.createElement('button')
    b.className = 'tab' + (s.id === game.tab ? ' on' : '')
    b.dataset.slot = s.id
    b.setAttribute('aria-label', s.id)
    const img = document.createElement('img')
    img.src = thumbOf(s.id, save.rocket[s.id]) ?? ''
    img.alt = ''
    b.append(img)
    if (PARTS[s.id].some((p) => save.fresh.has(`${s.id}:${p.id}`))) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      dot.textContent = '✨'
      b.append(dot)
    }
    tabs.append(b)
  }
  renderItems()
  renderPaints()
  layoutActions()
  renderExperiment()
}

function renderItems() {
  const el = $('items')
  el.innerHTML = ''
  const slot = game.tab
  for (const p of PARTS[slot]) {
    const b = document.createElement('button')
    const open = isUnlocked(p, save.visited)
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
    } else if (save.fresh.has(`${slot}:${p.id}`)) {
      b.insertAdjacentHTML('beforeend', '<span class="new">✨</span>')
    }
    el.append(b)
  }
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
  if (!isUnlocked(p, save.visited)) return nope(slot, id)
  const before = reach(save.rocket)
  const same = save.rocket[slot] === id
  save.rocket[slot] = id
  save.fresh.delete(`${slot}:${id}`)
  if (!save.picked) {
    save.picked = true
    hintStep()
  }
  rocket.build(save.rocket, slot)
  if (game.state === 'garage' || game.state === 'title') placeOnPad()
  if (!quiet) {
    audio.snap(PARTS[slot].indexOf(p))
    sparkleAt(slot)
    if (slot === 'pilot') audio.whistle(true)
  }
  const after = reach(save.rocket)
  if (after > before && !quiet) {
    setTimeout(() => audio.reach(), 220)
    renderReach(after)
    banner(`${DESTS[after].emoji} !`, 1300)
  } else renderReach()
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
  sparks.burst(v3, ['#fff3a0', '#ffd23f', '#ffffff', '#8ef0c8'], 18, 4.5, 0.55)
  rings.spawn(v3, '#fff3a0', 2.4, 0.4)
}

function nextUnlocked(slot) {
  const list = PARTS[slot].filter((p) => isUnlocked(p, save.visited))
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
    sparks.burst(v3, [color, color, '#ffffff'], 22, 4, 0.6)
  }
  for (const p of PARTS[slot]) if (p.id !== 'none') makeThumb(slot, p.id)
  renderTray()
  persist()
}

function surprise() {
  audio.rattle()
  for (const slot of SLOTS) {
    const list = PARTS[slot.id].filter((p) => isUnlocked(p, save.visited))
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
  renderReach(reach(save.rocket))
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
      if (!isUnlocked(part(drag.slot, drag.id), save.visited)) return
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
  if (!isUnlocked(part(d.slot, d.id), save.visited)) return nope(d.slot, d.id)
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
  if (game.state === 'party') return !$('reward').classList.contains('hidden') && idle() > 8 && performance.now() - rewardAt > 6000 ? $('again') : null
  if (game.state !== 'garage' || $('workshop')?.open) return null
  if (!save.picked) {
    const items = [...$('items').children]
    return items.find((b) => !b.classList.contains('on') && !b.classList.contains('locked')) ?? null
  }
  if (save.flights === 0 || idle() > 15) return $('launch')
  return null
}
function placeFinger() {
  const el = game.state === 'garage' || game.state === 'party' ? hintTarget() : null
  const f = $('finger')
  if (!el) return f.classList.add('hidden')
  const r = el.getBoundingClientRect()
  f.style.left = `${r.left + r.width / 2 - 20}px`
  f.style.top = `${r.top + r.height / 2}px`
  f.classList.remove('hidden')
}
function hintStep() {
  setTimeout(placeFinger, 50)
}

// --- Title & garage -------------------------------------------------------------------

/** Speaks short phrases for children who are not reading yet (only when sound is on). */
function speak(text) {
  if (audio.muted || !text || typeof speechSynthesis === 'undefined') return
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?'’-]/gu, ' '))
    u.lang = 'en-US'
    u.rate = 0.95
    u.pitch = 1.15
    speechSynthesis.speak(u)
  } catch {}
}

/** A picture of a whole rocket, for comparing builds side by side. */
let thumbRocket = null
const rocketThumbs = new Map()
function rocketThumb(cfg) {
  const key = JSON.stringify(cfg)
  if (!rocketThumbs.has(key)) {
    thumbRocket ??= new Rocket(models, glowTex)
    thumbRocket.build(cfg)
    if (rocketThumbs.size > 12) rocketThumbs.clear()
    rocketThumbs.set(key, thumbs.shot(thumbRocket.wobbler, { turn: -0.35, tilt: 0.08, fill: 0.92, px: 256 }))
    thumbRocket.root.add(thumbRocket.wobbler)
  }
  return rocketThumbs.get(key)
}

function workshopSound(kind) {
  if (kind === 'pick') audio.click()
  else if (kind === 'save') audio.paint()
  else if (kind === 'go') audio.whoosh(1.6)
  else if (kind === 'yay') audio.fanfare()
  else if (kind === 'hmm') audio.reach()
}

/** The 🧪 button shows an A once a rocket is saved, and wiggles when exactly one part has changed. */
function renderExperiment() {
  const status = workshop.status(save.rocket)
  const b = $('experiment')
  b.classList.toggle('has-a', status >= 0)
  b.classList.toggle('ready', status === 1)
}

const workshop = createWorkshop({ readRocket: () => save.rocket, thumbOf, rocketThumb, speak, sound: workshopSound, onChange: () => renderExperiment() })
$('experiment').onclick = () => {
  if (game.state !== 'garage') return
  audio.unlock()
  audio.click()
  keys.clear()
  workshop.open()
}

function toTitle() {
  workshop.close()
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

function toGarage({ snap = false } = {}) {
  clearFlight()
  clearParty()
  smoke.clear()
  sparks.clear()
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
  hintStep()
}

$('play').addEventListener('click', () => {
  audio.unlock()
  audio.click()
  toGarage()
})

// --- Countdown and lift-off ------------------------------------------------------------

function launch() {
  if (game.state !== 'garage' || game.busy) return
  workshop.close()
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
  // Shake, rumble and smoke grow toward lift-off
  rocket.wobbler.position.x = Math.sin(game.time * 47) * 0.02 * k * 2
  rocket.wobbler.rotation.z = Math.sin(game.time * 31) * 0.015 * k * 2
  doors.open = Math.min(1, doors.open + dt * 0.5)
  if (game.t > 1) rocket.setFlame(0.15 + Math.random() * 0.1 * k)
  audio.setEngine(k * 0.5)
  for (let i = 0; i < 1 + k * 4; i++) {
    const a = Math.random() * Math.PI * 2
    smoke.emit(Math.cos(a) * 0.6, padTop + 0.2, Math.sin(a) * 0.6, { vx: Math.cos(a) * rand(1, 3) * k, vy: rand(0.2, 1.2), vz: Math.sin(a) * rand(0.5, 1.5), spread: 0.6, life: 1.6, size: rand(0.8, 1.6) * (0.5 + k), endSize: 2.5, color: '#ffffff', drag: 1.2 })
  }
  padLights.forEach((m, i) => (m.emissiveIntensity = Math.sin(game.time * 12 + i) > 0 ? 3 : 0.3))
  const n = 3 - Math.floor(game.t)
  if (n !== game.count && n >= 1) {
    game.count = n
    showCount(String(n))
    audio.beep()
  }
  if (game.t >= 3) liftoff()
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
  combo: 0,
  comboT: 0,
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
  const base = reach(save.rocket)
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
    combo: 0,
    comboT: 0,
  })
  flight.passed.clear()
  flight.dist = flight.cruise * (12 + base * 3.2)
  shadow.visible = false
  show('flightbar')
  show('journey')
  // Turbo carries you one stop further, but only past places you have already visited: a first
  // trip always lands at the boosters' own destination, so no planet (or its new parts) gets skipped.
  flight.canTurbo = base < DESTS.length - 1 && save.visited[base]
  $('turbo').classList.toggle('hidden', !flight.canTurbo)
  $('turbo').classList.remove('full')
  renderStars()
  renderJourney()
  save.flights++
  persist()
}

function renderStars() {
  const el = $('stars')
  el.textContent = `⭐ ${flight.stars}`
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
  $('turbo-fill').style.width = `${Math.min(1, flight.stars / TURBO) * 100}%`
}

function passAlt(i) {
  return flight.start + flight.dist * (0.3 + (0.6 * (i + 1)) / (flight.target + 1))
}

let journeyMe = null
function renderJourney() {
  const track = $('journey')
  track.querySelectorAll('.stop, .me').forEach((e) => e.remove())
  const t = $('journey-track')
  const pct = (f) => `calc(18px + (100% - 36px) * ${f})`
  const home = document.createElement('span')
  home.className = 'stop'
  home.textContent = '🏠'
  home.style.bottom = pct(0)
  track.append(home)
  for (let i = 0; i <= flight.target; i++) {
    const s = document.createElement('span')
    s.className = 'stop' + (i === flight.target ? ' goal' : '')
    s.textContent = DESTS[i].emoji
    s.style.bottom = pct(i === flight.target ? 1 : (passAlt(i) - flight.start) / flight.dist)
    track.append(s)
  }
  journeyMe = document.createElement('span')
  journeyMe.className = 'me'
  journeyMe.textContent = '🚀'
  track.append(journeyMe)
  t.dataset.ok = '1'
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

function spawnPattern(y) {
  const xm = Math.max(1.5, view.hw - 1.4)
  const space = flight.alt > 70
  const r = Math.random()
  if (space && r < 0.22) {
    const kind = pick(['junk_satellite', 'junk_boot', 'junk_teapot', 'junk_duck'])
    spawn(kind, rand(-xm, xm), y, 0, { scale: rand(0.8, 1.05), spin: rand(-0.8, 0.8), vx: rand(-0.5, 0.5), junk: true })
    return 6
  }
  if (r < 0.5) {
    const x = rand(-xm * 0.8, xm * 0.8)
    const n = 3 + ((Math.random() * 3) | 0)
    for (let i = 0; i < n; i++) spawn('star', x, y + i * 1.5, 0, { scale: 0.42, star: true })
    return n * 1.5 + 3
  }
  if (r < 0.8) {
    // A swoopy arc of stars
    const x0 = rand(-xm * 0.6, xm * 0.6)
    const dir = Math.random() < 0.5 ? -1 : 1
    for (let i = 0; i < 5; i++) spawn('star', clamp(x0 + dir * Math.sin(i * 0.7) * 2.2, -xm, xm), y + i * 1.3, 0, { scale: 0.42, star: true })
    return 9
  }
  spawn('star', rand(-xm, xm), y, 0, { scale: 0.5, star: true })
  return 4
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
  flight.stars++
  save.stars++
  flight.combo = flight.comboT > 0 ? flight.combo + 1 : 0
  flight.comboT = 1.4
  audio.catch(flight.combo)
  sparks.burst(it.obj.position, ['#fff3a0', '#ffd23f', '#ffffff'], 16, 5, 0.6)
  rings.spawn(it.obj.position, '#ffd23f', 2)
  popups.show(it.obj.position, '+1')
  renderStars()
  if (!flight.turbo && flight.canTurbo && flight.stars >= TURBO && flight.target < DESTS.length - 1) {
    flight.turbo = true
    flight.target++
    flight.dist += flight.cruise * 4.5
    flight.boost = 2.5
    audio.turbo()
    banner(`⚡ ${DESTS[flight.target].emoji} !`, 2000)
    $('turbo').classList.add('full')
    renderJourney()
    sparks.burst(rocket.root.position, ['#8ef0c8', '#3bb5ff', '#c9b6ff', '#ffd23f'], 40, 8, 0.9)
  }
}

function bumpJunk(it) {
  it.hit = true
  const dir = Math.sign(it.obj.position.x - rocket.root.position.x) || 1
  it.vx = dir * 5
  it.vy = 3
  it.spin = dir * -5
  flight.dizzy = 1.1
  flight.vx -= dir * 5
  flight.combo = 0
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
  rocket.wobbler.rotation.z = clamp(-f.vx * 0.05, -0.45, 0.45) + W * (0.2 * Math.sin(t * 3.1) + 0.08 * Math.sin(t * 7.7))
  rocket.wobbler.rotation.x = W * 0.12 * Math.sin(t * 2.3)
  rocket.wobbler.position.x = W * 0.25 * Math.sin(t * 1.7)
  f.spin = f.dizzy > 0 ? f.spin + dt * 14 * (f.dizzy / 1.1 + 0.2) : damp(f.spin, Math.round(f.spin / (Math.PI * 2)) * Math.PI * 2, 6, dt)
  rocket.wobbler.rotation.y = f.spin

  // Exhaust: smoke billows near the ground, sparks all the way
  const nz = rocket.nozzles(nozzleList)
  const low = 1 - smoothstep(f.alt - f.start, 0, 30)
  for (const n of nz) {
    for (let i = 0; i < 2; i++) {
      sparks.emit(n.x + rand(-0.1, 0.1), n.y - 0.6 * rocket.root.scale.y, n.z, { vx: rand(-0.4, 0.4) - f.vx * 0.1, vy: -f.speed * 0.5 - 2, spread: 0.6, life: 0.4, size: rand(0.45, 0.7), endSize: 0.1, color: pick(EXHAUST), drag: 1.5 })
    }
    if (Math.random() < 0.35 + low * 0.6) {
      smoke.emit(n.x, n.y - 0.9, n.z - 0.2, { vx: rand(-1, 1) * (1 + low * 3), vy: -f.speed * 0.25 - 1, spread: 0.8, life: 1.2 + low, size: rand(0.6, 1) * (1 + low), endSize: 2.4 + low * 2, color: f.boost > 0 ? pick(['#c9b6ff', '#8ef0c8', '#fff3a0']) : '#ffffff', drag: 1 })
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
    const side = i % 2 ? -1 : 1
    const p = spawn(DESTS[i].model, side * (view.hw * 1.1 + 2), passAlt(i) + 10, -18, { scale: 3, planet: true, hello: i })
    p.obj.rotation.x = -0.2
  }

  updateItems(dt)
  f.comboT -= dt

  // Journey marker
  const prog = clamp((f.alt - f.start) / f.dist, 0, 1)
  if (journeyMe) journeyMe.style.bottom = `calc(18px + (100% - 36px) * ${prog})`
  $('journey-fill').style.height = `${prog * 100}%`
  if (prog >= 1) arrive()
}
const nozzleList = []
const EXHAUST = ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0']

function updateItems(dt) {
  const rp = rocket.root.position
  const rw = rocket.width * 0.5 + 0.35
  const rh = rocket.half * 0.9 + 0.4
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const o = it.obj
    it.t += dt
    if (it.star) {
      o.rotation.y = Math.sin(it.t * 2.2) * 0.6
      o.rotation.z = Math.sin(it.t * 1.4) * 0.2
      // Stars near the rocket drift in, so near misses still count
      const dx = rp.x - o.position.x
      const dy = rp.y - o.position.y
      if (Math.abs(dx) < rw + 0.9 && Math.abs(dy) < rh + 0.8 && game.state === 'flight') {
        o.position.x += dx * dt * 1.8
        o.position.y += dy * dt * 1.5
      }
      if (Math.abs(dx) < rw && Math.abs(dy) < rh && game.state === 'flight') {
        catchStar(it)
        recycle(i)
        continue
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
    } else if (it.cloud) {
      o.position.x += Math.sin(it.t * 0.3) * 0.2 * dt
    } else if (it.planet) {
      o.rotation.y += dt * 0.15
      if (it.hello !== undefined && o.position.y < cam.y + 1) {
        popups.show(o.position, `👋 ${DESTS[it.hello].emoji}`, true)
        audio.reach()
        it.hello = undefined
      }
    }
    const bottom = cam.y - view.hh * (it.planet ? 2.5 : 1) - (it.cloud ? 8 : 3)
    if (o.position.y < bottom || Math.abs(o.position.x) > view.hw * 3 + 10) recycle(i)
  }
}

// --- Arrival and landing ----------------------------------------------------------------

const party = { planet: null, pilot: null, flag: null, friend: null, dest: 0, t: 0, spot: new THREE.Vector3(), flagSpot: new THREE.Vector3(), friendSpot: new THREE.Vector3(), hopFrom: new THREE.Vector3(), news: [], stage: 0 }

function arrive() {
  game.state = 'arrive'
  game.t = 0
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
  for (const k of ['planet', 'pilot', 'flag', 'friend']) {
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
    for (const n of nz) sparks.emit(n.x, n.y - 0.4, n.z, { vx: rand(-0.3, 0.3), vy: -4, spread: 0.5, life: 0.35, size: 0.5, endSize: 0.1, color: pick(EXHAUST), drag: 1.5 })
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
    audio.whistle(true)
    if (party.dest === DESTS.length - 1) {
      // The alien friend waves hello
      party.friend = makeDancer('alien', 1.25)
      const pink = new Map()
      party.friend.traverse((o) => {
        if (o.isMesh && (o.material.name === 'fur_alien' || o.material.name === 'suit_alien')) {
          if (!pink.has(o.material)) pink.set(o.material, o.material.clone())
          o.material = pink.get(o.material)
        }
      })
      for (const [orig, m] of pink) m.color.set(orig.name === 'fur_alien' ? '#ff9ad5' : '#3bb5ff')
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

function startParty() {
  party.stage = 4
  game.state = 'party'
  game.t = 0
  const d = party.dest
  const first = !save.visited[d]
  save.visited[d] = true
  party.news = first ? unlocksAt(d) : []
  for (const n of party.news) save.fresh.add(`${n.slot}:${n.id}`)
  persist()
  audio.fanfare()
  audio.playSong('dance')
  banner(`🎉 ${DESTS[d].emoji} 🎉`, 3200, true)
  confetti()
  setTimeout(() => {
    if (game.state === 'party') showReward()
  }, 2200)
}

function confetti() {
  const colors = ['#ff6b6b', '#ffd23f', '#8ef0c8', '#7cc6fe', '#c9b6ff', '#ff8fc7']
  for (let i = 0; i < 90; i++) {
    sparks.emit(rand(-view.hw, view.hw), cam.y + view.hh + rand(0, 2), rand(-1, 2), { vx: rand(-1, 1), vy: rand(-2, -5), spread: 1, life: 2.6, size: rand(0.4, 0.7), endSize: 0.2, color: colors[i % colors.length], grav: -1.5, drag: 0.5 })
  }
}

function showReward() {
  const d = DESTS[party.dest]
  $('reward-head').textContent = `${d.emoji} 🚩`
  $('reward-stars').textContent = flight.stars ? `⭐ × ${flight.stars}` : ''
  const el = $('reward-new')
  el.innerHTML = ''
  party.news.forEach((n, i) => {
    const g = document.createElement('div')
    g.className = 'gift'
    g.style.animationDelay = `${0.3 + i * 0.18}s`
    g.innerHTML = `<img src="${thumbOf(n.slot, n.id)}" alt="">`
    el.append(g)
    setTimeout(() => audio.unlock1(i), 300 + i * 180)
  })
  show('reward')
  rewardAt = performance.now()
}
let rewardAt = 0

function animateDancers(dt, dancing) {
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
    const beat = t * Math.PI * 2.5 + phase
    const spot = p === party.pilot ? party.spot : party.friendSpot
    const cycle = (t + phase) % 6
    p.position.y = spot.y + p.userData.feet + Math.abs(Math.sin(beat)) * 0.32
    al.rotation.z = -2.2 - Math.sin(beat) * 0.6
    ar.rotation.z = 2.2 - Math.sin(beat) * 0.6
    ll.rotation.z = Math.max(0, Math.sin(beat)) * 0.4
    lr.rotation.z = -Math.max(0, -Math.sin(beat)) * 0.4
    head.rotation.z = Math.sin(beat) * 0.2
    p.rotation.y = (p === party.pilot ? -0.2 : 0.3) + (cycle > 4.5 ? (cycle - 4.5) / 1.5 * Math.PI * 2 : Math.sin(beat * 0.5) * 0.3)
  }
  if (party.planet) {
    const s = 1 + (dancing ? Math.sin(t * Math.PI * 5) * 0.012 : 0)
    party.planet.scale.set(PLANET_R / s, PLANET_R * s, PLANET_R / s)
  }
}

function updateParty(dt) {
  game.t += dt
  animateDancers(dt, true)
  if (Math.random() < dt * 3) {
    const colors = ['#ff6b6b', '#ffd23f', '#8ef0c8', '#7cc6fe', '#c9b6ff', '#ff8fc7']
    sparks.emit(rand(-view.hw, view.hw), cam.y + view.hh + 1, rand(-1, 2), { vx: rand(-1, 1), vy: rand(-2, -4), spread: 1, life: 2.6, size: rand(0.4, 0.6), endSize: 0.2, color: pick(colors), grav: -1, drag: 0.5 })
  }
}

function backToGarage(thenLaunch = false) {
  if (game.busy) return
  game.busy = true
  audio.click()
  $('finger').classList.add('hidden')
  // Head to the tab with something new, so it is easy to find
  const fresh = SLOTS.find((s) => PARTS[s.id].some((p) => save.fresh.has(`${s.id}:${p.id}`)))
  if (fresh) game.tab = fresh.id
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

// --- Input ----------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock()
  pointerHeld = true
  if (game.state === 'flight') return steerPointer(e)
  if (game.state !== 'garage' && game.state !== 'title') return
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  const slot = rocket.pick(raycaster)
  if (slot && game.state === 'garage') {
    setTab(slot)
    choose(slot, nextUnlocked(slot))
    return
  }
  if (raycaster.intersectObject(robot.obj, true).length) {
    robot.spin = 1
    robot.wave = 2
    audio.tone(880, { dur: 0.12, vol: 0.1, type: 'square', echo: false })
    audio.tone(660, { when: 0.13, dur: 0.12, vol: 0.1, type: 'square', echo: false })
    audio.tone(990, { when: 0.26, dur: 0.18, vol: 0.1, type: 'square' })
  }
})

$('home').addEventListener('click', () => {
  audio.unlock()
  goHome()
})
function goHome() {
  if (game.busy) return
  if (game.state === 'garage') {
    audio.click()
    toTitle()
  } else if (['countdown', 'flight', 'arrive', 'landing', 'party'].includes(game.state)) backToGarage(false)
}

function toggleSound() {
  audio.unlock()
  audio.setMuted(!audio.muted)
  store.set('rocket-garage-muted', audio.muted)
  renderSound()
}
$('sound').addEventListener('click', toggleSound)
$('music').addEventListener('click', () => {
  audio.unlock()
  audio.setMusic(!audio.musicOn)
  store.set('rocket-garage-music', audio.musicOn)
  renderSound()
})

addEventListener('keydown', (e) => {
  audio.unlock()
  const k = e.key
  if (k === 'm' || k === 'M') return toggleSound()
  if (k === 'Escape') return goHome()
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
      const list = PARTS[game.tab].filter((p) => isUnlocked(p, save.visited))
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

function updateGarage(dt) {
  const t = game.time
  // Robot: a little idle sway, waves now and then
  robot.wave -= dt
  if (robot.wave < -6) robot.wave = 2
  const waving = robot.wave > 0
  robot.arm.rotation.z = damp(robot.arm.rotation.z, waving ? 2.5 + Math.sin(t * 10) * 0.45 : 0.1, 8, dt)
  robot.armL.rotation.z = damp(robot.armL.rotation.z, game.state === 'countdown' ? -2.5 + Math.sin(t * 10) * 0.4 : -0.1, 8, dt)
  robot.spin = Math.max(0, robot.spin - dt)
  robot.obj.rotation.y = 0.35 + (1 - robot.spin) * (robot.spin > 0 ? Math.PI * 2 : 0) + Math.sin(t * 1.2) * 0.08
  robot.obj.position.y = Math.abs(Math.sin(t * 3)) * 0.04
  // Roof hatch and gantry arm move aside for take-off
  doors.l.position.x = damp(doors.l.position.x, -doors.open * 2.4, 3, dt)
  doors.r.position.x = damp(doors.r.position.x, doors.open * 2.4, 3, dt)
  doors.arm.position.x = damp(doors.arm.position.x, doors.armX + doors.open * 1.2, 3, dt)
  if (game.state !== 'countdown') padLights.forEach((m, i) => (m.emissiveIntensity = 1 + 0.8 * Math.sin(t * 3 + i * 0.8)))
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
    $('loading-text').textContent = 'Oops! Tap to try again 🔄'
    $('loading').addEventListener('click', () => location.reload())
  })

// Handy for testing: ?debug exposes the game state in the console
if (new URLSearchParams(location.search).has('debug')) window.rg = { probe(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera); return raycaster.intersectObjects(scene.children, true).slice(0, 5).map((h) => `${h.object.type}:${h.object.name}:${h.object.material?.name}:${h.object.visible}`) }, land(d) { clearFlight(); flight.target = d; flight.stars = 7; setupLanding() }, debug, step(sec = 1) { for (let i = 0; i < sec * 30; i++) tick(1 / 30) }, keys, game, save, flight, party, choose, launch, surprise, toGarage, backToGarage, get rocket() { return rocket } }
