import * as THREE from 'three'
import * as CANNON from 'cannon'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Track } from './track.js'
import { canvasTexture, rng, speckle } from './util.js'

/**
 * The three cities. Each one returns a Track: a looped road plus scenery and
 * colliders. Blender props (palm, gate, cathedral, tram, staircase) are used
 * when loaded; simple stand-ins are drawn otherwise.
 */
export const CITIES = {
  ubud: { name: 'Ubud', emoji: '🌾', flag: '🇮🇩', blurb: 'Rice fields and jungle roads', color: '#6fbf3a' },
  helsinki: { name: 'Helsinki', emoji: '⛪', flag: '🇫🇮', blurb: 'Cobblestones and trams', color: '#3a7bd5' },
  montreal: { name: 'Montreal', emoji: '🍁', flag: '🇨🇦', blurb: 'Staircases and orange cones', color: '#d64a2f' },
}

const cache = new Map()
/** Memoises `make` by key, so every race (and every loop iteration) reuses one material or texture. */
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}
const keyOf = (value) => JSON.stringify(value, (_, v) => (v?.isTexture ? v.uuid : v))

/**
 * One material per distinct set of options. Track.addGeometry merges geometry
 * per material, so a fresh material per call would cost a draw call each.
 */
const std = (o) => cached('std' + keyOf(o), () => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }))

/** Wraps a texture builder so each distinct set of arguments is drawn only once. */
const memoTexture = (name, build) => (...args) => cached(name + keyOf(args), () => build(...args))

// --- Shared textures ---------------------------------------------------------

const asphalt = memoTexture('asphalt', function asphalt({ lines = true, patches = false, edge = '#d8d8d0' } = {}) {
  return canvasTexture(256, 512, (g, w, h) => {
    const r = rng(3)
    speckle(g, w, h, '#4a4b4f', 0.18, 9000, 2, r)
    if (patches) {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(20,20,22,${0.3 + r() * 0.3})`
        g.beginPath()
        g.ellipse(r() * w, r() * h, 12 + r() * 30, 8 + r() * 20, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.strokeStyle = 'rgba(15,15,15,0.6)'
      for (let i = 0; i < 10; i++) {
        g.beginPath()
        let x = r() * w, y = r() * h
        g.moveTo(x, y)
        for (let k = 0; k < 5; k++) g.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.5) * 40))
        g.stroke()
      }
    }
    g.fillStyle = edge
    g.fillRect(6, 0, 6, h)
    g.fillRect(w - 12, 0, 6, h)
    if (lines) {
      g.fillStyle = '#f2d24a'
      for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y, 6, 70)
    }
  })
})

const cobbles = memoTexture('cobbles', function cobbles() {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(11)
    g.fillStyle = '#5e5a55'
    g.fillRect(0, 0, w, h)
    const size = 22
    for (let y = 0; y < h; y += size) {
      const shift = (y / size) % 2 ? size / 2 : 0
      for (let x = -size; x < w; x += size) {
        const c = 110 + r() * 50
        g.fillStyle = `rgb(${c},${c - 6},${c - 14})`
        g.beginPath()
        g.roundRect(x + shift + 1.5, y + 1.5, size - 3, size - 3, 5)
        g.fill()
      }
    }
    // Tram rails
    g.fillStyle = '#b8bcc2'
    for (const x of [0.36, 0.44, 0.56, 0.64]) g.fillRect(x * w - 3, 0, 6, h)
  })
})

const grassTexture = memoTexture('grassTexture', function grassTexture(base = '#5fa83a') {
  return canvasTexture(256, 256, (g, w, h) => speckle(g, w, h, base, 0.25, 6000, 3, rng(5)), { repeat: [60, 60] })
})

const riceTexture = memoTexture('riceTexture', function riceTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(9)
    g.fillStyle = '#5fb84a'
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 6) {
        g.fillStyle = `rgba(${40 + r() * 60},${150 + r() * 80},${30 + r() * 40},0.9)`
        g.fillRect(x + r() * 2, y, 2, 6)
      }
    }
  }, { repeat: [3, 3] })
})

/** A building front: wall colour, a grid of windows and a door; tiles every 8 m x 12 m. */
const facade = memoTexture('facade', function facade({ wall, window = '#2d3a4a', frame = '#f4f1ea', brick = false, shutters = null, floors = 4 }) {
  return canvasTexture(256, 384, (g, w, h) => {
    const r = rng(wall.length * 31)
    if (brick) {
      g.fillStyle = '#7a3324'
      g.fillRect(0, 0, w, h)
      for (let y = 0; y < h; y += 8) {
        for (let x = -12; x < w; x += 24) {
          const c = 0.75 + r() * 0.35
          g.fillStyle = `rgb(${Math.floor(160 * c)},${Math.floor(70 * c)},${Math.floor(50 * c)})`
          g.fillRect(x + ((y / 8) % 2 ? 12 : 0) + 1, y + 1, 22, 6)
        }
      }
    } else {
      speckle(g, w, h, wall, 0.06, 2000, 3, r)
      g.fillStyle = 'rgba(255,255,255,0.5)'
      for (let f = 1; f < floors; f++) g.fillRect(0, (f * h) / floors - 3, w, 5)
    }
    const fh = h / floors
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < 2; c++) {
        const x = 36 + c * 128, y = f * fh + fh * 0.22
        g.fillStyle = frame
        g.fillRect(x - 5, y - 5, 66, fh * 0.6 + 10)
        g.fillStyle = window
        g.fillRect(x, y, 56, fh * 0.6)
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.fillRect(x + 4, y + 4, 16, fh * 0.6 - 8)
        g.fillStyle = frame
        g.fillRect(x + 26, y, 4, fh * 0.6)
        if (shutters) {
          g.fillStyle = shutters
          g.fillRect(x - 16, y, 10, fh * 0.6)
          g.fillRect(x + 62, y, 10, fh * 0.6)
        }
      }
    }
  })
})

/** Box with wall UVs scaled in metres, so windows keep their size on any building. */
function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv
  const faceWidth = [d, d, w, w, w, w]
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k
      if (face === 2 || face === 3) uv.setXY(i, 0.02, 0.02) // roof and floor: a plain wall pixel
      else uv.setXY(i, uv.getX(i) * (faceWidth[face] / 8), uv.getY(i) * (h / 12))
    }
  }
  return geo
}

// --- Shared props -----------------------------------------------------------

const trunkMat = std({ color: '#7b5a3a' })
const leafMats = {
  palm: std({ color: '#3f8f2f', side: THREE.DoubleSide }),
  birch: std({ color: '#7fbf4a' }),
  maple: std({ color: '#d9442b' }),
  mapleGold: std({ color: '#f0a020' }),
  jungle: std({ color: '#2f7a2a' }),
}

function tree(track, position, kind, r) {
  const h = kind === 'palm' ? 7 + r() * 3 : 5 + r() * 3
  const yaw = r() * Math.PI * 2
  const trunk = new THREE.CylinderGeometry(kind === 'palm' ? 0.18 : 0.22, 0.3, h, 7)
  trunk.translate(position.x, h / 2, position.z)
  track.addGeometry(trunk, kind === 'birch' ? std({ color: '#e8e4dc' }) : trunkMat)
  if (kind === 'palm') {
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.ConeGeometry(0.5, 3.4, 4, 1, true)
      leaf.rotateZ(Math.PI / 2 + 0.5)
      leaf.translate(1.6, 0, 0)
      leaf.rotateY(yaw + (i / 7) * Math.PI * 2)
      leaf.translate(position.x, h, position.z)
      track.addGeometry(leaf, leafMats.palm)
    }
  } else {
    const mat = kind === 'maple' ? (r() < 0.3 ? leafMats.mapleGold : leafMats.maple) : kind === 'birch' ? leafMats.birch : leafMats.jungle
    for (let i = 0; i < 4; i++) {
      const ball = new THREE.IcosahedronGeometry(1.4 + r() * 0.9, 0)
      ball.translate(position.x + (r() - 0.5) * 2, h - 0.5 + r() * 1.5, position.z + (r() - 0.5) * 2)
      track.addGeometry(ball, mat)
    }
  }
  trunkCollider(track, position)
}

/** Trunks are solid: hitting a tree is a crash. */
function trunkCollider(track, position, width = 0.5) {
  track.addStaticBox(new THREE.Vector3(position.x, 1.5, position.z), new THREE.Vector3(width, 3, width), 0, null, { visual: false })
}

function lampPost(track, position, mat) {
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 5, 6)
  pole.translate(position.x, 2.5, position.z)
  track.addGeometry(pole, mat)
  const head = new THREE.SphereGeometry(0.3, 8, 6)
  head.translate(position.x, 5.1, position.z)
  track.addGeometry(head, std({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 0.4 }))
  trunkCollider(track, position, 0.3)
}

/** One mesh per cone (orange body and base, white stripe as vertex colours), built once and shared. */
let coneGeometry
function makeConeGeometry() {
  const part = (geo, y, color) => {
    geo.translate(0, y, 0)
    const c = new THREE.Color(color)
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: geo.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3))
    return geo
  }
  const geometry = mergeGeometries([
    part(new THREE.ConeGeometry(0.28, 0.75, 12), 0, '#ff6a00'),
    part(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), 0.05, '#ffffff'),
    part(new THREE.BoxGeometry(0.6, 0.06, 0.6), -0.36, '#ff6a00'),
  ])
  geometry.userData.shared = true
  return geometry
}
function cone(track, position) {
  coneGeometry ??= makeConeGeometry()
  const m = new THREE.Mesh(coneGeometry, std({ vertexColors: true, roughness: 0.6 }))
  track.addProp(m, new CANNON.Box(new CANNON.Vec3(0.25, 0.38, 0.25)), new THREE.Vector3(position.x, 0.4, position.z), 3)
}

const crateMat = std({ color: '#b0793f' })
function crate(track, position, size = 0.8, mat = crateMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat)
  track.addProp(m, new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), new THREE.Vector3(position.x, size / 2, position.z), 12 * size)
}

function mountain(track, x, z, radius, height, color, snow = false) {
  const g = new THREE.ConeGeometry(radius, height, 9, 3)
  g.translate(x, height / 2 - 2, z)
  track.addGeometry(g, std({ color, flatShading: true }), false)
  if (snow) {
    const cap = new THREE.ConeGeometry(radius * 0.28, height * 0.28, 9)
    cap.translate(x, height - 2 - height * 0.14 + 0.5, z)
    track.addGeometry(cap, std({ color: '#f6f6f6', flatShading: true }), false)
  }
}

function sceneryBase(track, { ground, sky, fog, sun }) {
  // Split into a grid and sunk a little: one giant quad has too little depth precision
  // at low camera angles and would poke through the road.
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 64, 64), ground)
  g.rotation.x = -Math.PI / 2
  g.position.y = -0.06
  g.receiveShadow = true
  track.group.add(g)
  track.sky = sky
  track.fog = fog
  track.sunColor = sun
}

// --- Ubud ---------------------------------------------------------------------

function buildUbud(env, props) {
  const track = new Track({
    ...env,
    width: 7.5,
    seed: 101,
    points: [[0, 0], [70, -14], [130, 6], [178, 58], [168, 130], [118, 172], [56, 150], [4, 188], [-62, 164], [-104, 108], [-92, 46], [-48, 18]],
  })
  const r = track.random
  sceneryBase(track, { ground: std({ map: grassTexture('#4f9a33') }), sky: ['#7ec8f0', '#f6e7c8'], fog: '#d9ead0', sun: '#fff1d6' })
  track.buildRoad(std({ map: asphalt({ lines: false, patches: true, edge: '#8b7a55' }), roughness: 0.9 }))
  track.buildStrip(std({ color: '#8b6f47' }), track.width / 2, track.width / 2 + 1.2, 0.015) // dirt verge
  const water = std({ color: '#7fb6c7', metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.85 })
  const rice = std({ map: riceTexture() })
  const terraceWall = std({ color: '#8a6a45' })

  // Stepped rice terraces climbing away from the road. The first step is a low wall: bump it and you crash.
  track.lineSides({ offset: track.width / 2 + 3.2, spacing: () => 11, depth: 26 }, ({ center, yaw, sign, sample }) => {
    for (let step = 0; step < 3; step++) {
      const height = 0.55 + step * 0.65
      const out = sample.side.clone().multiplyScalar(sign * (step * 8.5 - 8.5))
      const c = center.clone().add(out)
      track.addStaticBox(new THREE.Vector3(c.x, height / 2, c.z), new THREE.Vector3(10.8, height, 8.4), yaw, terraceWall)
      const top = new THREE.PlaneGeometry(10.4, 8)
      top.rotateX(-Math.PI / 2)
      top.rotateY(yaw)
      top.translate(c.x, height + 0.02, c.z)
      track.addGeometry(top, step % 2 ? water : rice, false)
    }
    if (r() < 0.35) tree(track, center.clone().addScaledVector(sample.side, sign * 14), r() < 0.6 ? 'palm' : 'jungle', r)
  })

  // Palms right at the roadside
  track.lineSides({ offset: track.width / 2 + 1.6, spacing: () => 16 + r() * 18, depth: 0.6 }, ({ center }) => {
    if (props.palm) {
      track.addObject(props.palm, center, r() * 6, 0.9 + r() * 0.3)
      trunkCollider(track, center)
    } else tree(track, center, 'palm', r)
  })

  // Balinese split gate (candi bentar) at the start line, one tower on each side.
  const start = track.sampleAt(0)
  for (const sign of [-1, 1]) {
    const c = start.p.clone().addScaledVector(start.side, sign * (track.width / 2 + 2.4))
    const yaw = track.alongAt(start)
    // The prop's tower extends along its +X, which this yaw points away from the road on the left; mirror it on the right.
    if (props.gate) track.addObject(props.gate, c, yaw + (sign > 0 ? Math.PI : 0), 1)
    else {
      for (let k = 0; k < 5; k++) {
        const b = new THREE.BoxGeometry(3 - k * 0.5, 1.6, 2.2 - k * 0.3)
        b.rotateY(yaw)
        b.translate(c.x, 0.8 + k * 1.6, c.z)
        track.addGeometry(b, std({ color: k % 2 ? '#9c5a3c' : '#c08a5a' }))
      }
    }
    track.addStaticBox(new THREE.Vector3(c.x, 3, c.z), new THREE.Vector3(2.8, 6, 2.2), yaw, null, { visual: false })
  }
  // Little shrines, fruit stalls with crates to scatter, and a ramp over a "ravine".
  for (const d of [140, 420, 640]) {
    const s = track.sampleAt(d)
    const c = s.p.clone().addScaledVector(s.side, track.width / 2 + 2)
    const shrine = new THREE.BoxGeometry(1.2, 2.4, 1.2)
    shrine.translate(c.x, 1.2, c.z)
    track.addGeometry(shrine, std({ color: '#b9a080' }))
    const roof = new THREE.ConeGeometry(1.2, 1, 4)
    roof.rotateY(Math.PI / 4)
    roof.translate(c.x, 2.9, c.z)
    track.addGeometry(roof, std({ color: '#4a3424' }))
    track.addStaticBox(new THREE.Vector3(c.x, 1.2, c.z), new THREE.Vector3(1.2, 2.4, 1.2), 0, null, { visual: false })
  }
  for (const d of [260, 520]) {
    const s = track.sampleAt(d)
    for (let k = 0; k < 7; k++) {
      const c = s.p.clone().addScaledVector(s.side, -(track.width / 2 - 1 - (k % 3) * 0.9)).addScaledVector(s.t, Math.floor(k / 3) * 0.9)
      crate(track, c, 0.8, std({ color: k % 2 ? '#f0a020' : '#c0392b' }))
    }
  }
  track.addRamp(350, { length: 8, width: 4, height: 1.3, lateral: 1.2, material: std({ color: '#8a6a45' }) })
  mountain(track, 380, -520, 260, 280, '#5a6b4e')
  mountain(track, -300, -420, 160, 140, '#4f7a3a')
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = 260 + r() * 260
    tree(track, new THREE.Vector3(Math.cos(a) * d + 40, 0, Math.sin(a) * d + 80), r() < 0.5 ? 'palm' : 'jungle', r)
  }
  track.waterZones = true // off the road you splash through paddies
  track.finish()
  return track
}

// --- Helsinki ------------------------------------------------------------------

function buildHelsinki(env, props) {
  const track = new Track({
    ...env,
    width: 10,
    seed: 202,
    points: [[0, 0], [130, 0], [168, 22], [176, 100], [160, 150], [100, 168], [30, 160], [-20, 190], [-80, 180], [-110, 130], [-100, 60], [-60, 14]],
  })
  const r = track.random
  sceneryBase(track, { ground: std({ map: grassTexture('#6c9a4a') }), sky: ['#9cc9f5', '#eef3f8'], fog: '#dfe8f0', sun: '#ffffff' })
  track.buildRoad(std({ map: cobbles(), roughness: 0.75 }))
  const curb = std({ color: '#b5b2ab' })
  track.buildStrip(curb, track.width / 2, track.width / 2 + 0.35, 0.1)
  track.buildStrip(std({ color: '#9d9a94' }), track.width / 2 + 0.35, track.width / 2 + 4, 0.1)
  const styles = [
    { wall: '#e8c35a', shutters: null }, { wall: '#9ec3dd' }, { wall: '#f1d6c9' }, { wall: '#f4f1ea', window: '#2c3e55' },
    { wall: '#c7d9b3' }, { wall: '#e7a979' },
  ].map((s) => std({ map: facade({ ...s, floors: 5 }) }))
  const cornice = std({ color: '#5b6066' })
  track.lineSides({ offset: track.width / 2 + 4, spacing: () => 15 + r() * 6, depth: 14 }, ({ center, yaw }) => {
    const w = 13 + r() * 5, h = 15 + r() * 7
    track.addStaticBox(new THREE.Vector3(center.x, h / 2, center.z), new THREE.Vector3(w, h, 14), yaw, null, { visual: false })
    const geo = buildingGeometry(w, h, 14)
    geo.rotateY(yaw)
    geo.translate(center.x, h / 2, center.z)
    track.addGeometry(geo, styles[Math.floor(r() * styles.length)])
    const top = new THREE.BoxGeometry(w + 0.6, 1, 14.6)
    top.rotateY(yaw)
    top.translate(center.x, h + 0.4, center.z)
    track.addGeometry(top, cornice)
  })
  // Birch trees and lamp posts on the sidewalk
  track.lineSides({ offset: track.width / 2 + 2.2, spacing: () => 18 + r() * 10, depth: 0.5 }, ({ center, dist }) => {
    if (Math.floor(dist / 40) % 2) tree(track, center, 'birch', r)
    else lampPost(track, center, std({ color: '#2b3a2f' }))
  })
  // Helsinki Cathedral on its platform, looking over the loop.
  const cathedralPos = new THREE.Vector3(30, 0, 95)
  if (props.cathedral) track.addObject(props.cathedral, cathedralPos, 0, 1.2)
  else {
    const base = new THREE.BoxGeometry(30, 4, 30)
    base.translate(cathedralPos.x, 2, cathedralPos.z)
    track.addGeometry(base, std({ color: '#d9d6cf' }))
    const hall = new THREE.BoxGeometry(18, 16, 18)
    hall.translate(cathedralPos.x, 12, cathedralPos.z)
    track.addGeometry(hall, std({ color: '#f7f6f2' }))
    const dome = new THREE.SphereGeometry(6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    dome.scale(1, 1.3, 1)
    dome.translate(cathedralPos.x, 26, cathedralPos.z)
    track.addGeometry(dome, std({ color: '#3f8f6a', metalness: 0.3, roughness: 0.4 }))
  }
  // Harbour with the ferry, and the SkyWheel
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 400), std({ color: '#3d6f8f', metalness: 0.5, roughness: 0.15 }))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(30, 0.03, -260)
  track.group.add(sea)
  const ferry = new THREE.BoxGeometry(80, 14, 18)
  ferry.translate(-40, 7, -200)
  track.addGeometry(ferry, std({ color: '#f2f2f2' }))
  const ferryBand = new THREE.BoxGeometry(80.4, 3, 18.4)
  ferryBand.translate(-40, 5, -200)
  track.addGeometry(ferryBand, std({ color: '#1f5fa8' }))
  const wheel = new THREE.TorusGeometry(18, 0.6, 6, 40)
  wheel.translate(140, 24, -120)
  track.addGeometry(wheel, std({ color: '#f4f4f4' }))
  for (let i = 0; i < 16; i++) {
    const cab = new THREE.BoxGeometry(2.2, 2.4, 2.2)
    const a = (i / 16) * Math.PI * 2
    cab.translate(140 + Math.cos(a) * 18, 24 + Math.sin(a) * 18, -120)
    track.addGeometry(cab, std({ color: i % 2 ? '#1a8f5a' : '#e8e8e8' }))
  }
  const leg = new THREE.CylinderGeometry(0.6, 0.6, 26, 6)
  leg.translate(140, 12, -120)
  track.addGeometry(leg, std({ color: '#cfcfcf' }))
  // Parked trams on the long straight (crash into them if you go wide)
  for (const d of [60, 600]) {
    const s = track.sampleAt(d)
    const c = s.p.clone().addScaledVector(s.side, track.width / 2 + 2.6)
    const yaw = track.alongAt(s)
    if (props.tram) {
      track.addObject(props.tram, c, yaw, 1)
      track.addStaticBox(new THREE.Vector3(c.x, 1.7, c.z), new THREE.Vector3(2.6, 3.4, 26), yaw, null, { visual: false })
    } else {
      track.addStaticBox(new THREE.Vector3(c.x, 1.7, c.z), new THREE.Vector3(2.6, 3.4, 26), yaw, std({ color: '#2f8f4f' }))
    }
  }
  track.addRamp(820, { length: 9, width: 4.5, height: 1.5, lateral: -1.8, material: std({ color: '#c9c3b8' }) })
  for (const d of [300, 960]) {
    const s = track.sampleAt(d)
    for (let k = 0; k < 6; k++) crate(track, s.p.clone().addScaledVector(s.side, (k - 2.5) * 1.2).addScaledVector(s.t, (k % 2) * 1.5), 0.9, std({ color: '#3a6ea5' }))
  }
  track.finish()
  return track
}

// --- Montreal --------------------------------------------------------------------

function buildMontreal(env, props) {
  const track = new Track({
    ...env,
    width: 9,
    seed: 303,
    points: [[0, 0], [118, -10], [156, 28], [146, 104], [96, 144], [26, 124], [-24, 156], [-92, 126], [-104, 52], [-64, 10]],
  })
  const r = track.random
  sceneryBase(track, { ground: std({ map: grassTexture('#7aa04f') }), sky: ['#8fbfef', '#fbe9d4'], fog: '#efe4d8', sun: '#fff0e0' })
  track.buildRoad(std({ map: asphalt({ lines: true, patches: true }), roughness: 0.9 }))
  track.buildStrip(std({ color: '#a7a39c' }), track.width / 2, track.width / 2 + 3.2, 0.12)
  const bricks = [facade({ wall: '#8a3a28', brick: true, floors: 3, frame: '#f2efe6' }), facade({ wall: '#8a3a28', brick: true, floors: 3, frame: '#2b4f7a' })].map((t) => std({ map: t }))
  const roofMat = std({ color: '#3f3a36' })
  const stairMat = std({ color: '#2d2d30', metalness: 0.4, roughness: 0.6 })
  track.lineSides({ offset: track.width / 2 + 5.5, spacing: () => 11 + r() * 3, depth: 12 }, ({ center, yaw, sign, sample }) => {
    const w = 10 + r() * 1.5, h = 10.5 + r()
    track.addStaticBox(new THREE.Vector3(center.x, h / 2, center.z), new THREE.Vector3(w, h, 12), yaw, null, { visual: false })
    const geo = buildingGeometry(w, h, 12)
    geo.rotateY(yaw)
    geo.translate(center.x, h / 2, center.z)
    track.addGeometry(geo, bricks[Math.floor(r() * 2)])
    const top = new THREE.BoxGeometry(w + 0.4, 0.8, 12.4)
    top.rotateY(yaw)
    top.translate(center.x, h + 0.3, center.z)
    track.addGeometry(top, roofMat)
    // The famous outside staircases, out on the sidewalk.
    if (r() < 0.75) {
      // Balcony against the facade, the flight running out over the sidewalk.
      const front = center.clone().addScaledVector(sample.side, -sign * (6 + 0.5))
      // Face the foot of the stairs (the prop's -Z) towards the street.
      const toStreet = sample.side.clone().multiplyScalar(-sign)
      if (props.staircase) track.addObject(props.staircase, front, Math.atan2(-toStreet.x, -toStreet.z), 1)
      else {
        for (let k = 0; k < 8; k++) {
          const step = new THREE.BoxGeometry(1.4, 0.15, 0.5)
          const a = k * 0.55
          step.translate(Math.cos(a) * 0.7, 0.4 + k * 0.42, Math.sin(a) * 0.7)
          step.rotateY(yaw)
          step.translate(front.x, 0, front.z)
          track.addGeometry(step, stairMat)
        }
      }
      track.addStaticBox(new THREE.Vector3(front.x, 1.8, front.z), new THREE.Vector3(2.2, 3.6, 2.2), yaw, null, { visual: false })
    }
  })
  track.lineSides({ offset: track.width / 2 + 1.4, spacing: () => 20 + r() * 12, depth: 0.5 }, ({ center }) => tree(track, center, 'maple', r))
  // Orange cones: Montreal's most famous wildlife. Knock them all over.
  for (let d = 40; d < track.length; d += 55 + r() * 40) {
    const s = track.sampleAt(d)
    const sideways = (r() < 0.5 ? -1 : 1) * (track.width / 2 - 1.2)
    for (let k = 0; k < 6; k++) cone(track, s.p.clone().addScaledVector(s.side, sideways - Math.sign(sideways) * (k % 2) * 0.9).addScaledVector(s.t, k * 2.2))
  }
  // Snowbanks at a couple of corners
  const snow = std({ color: '#f4f7fb', roughness: 0.95 })
  for (const d of [180, 470]) {
    const s = track.sampleAt(d)
    for (let k = 0; k < 4; k++) {
      const c = s.p.clone().addScaledVector(s.side, track.width / 2 + 0.6).addScaledVector(s.t, k * 2.5)
      const pile = new THREE.SphereGeometry(1.3, 8, 6)
      pile.scale(1, 0.55, 1)
      pile.translate(c.x, 0.2, c.z)
      track.addGeometry(pile, snow)
      track.addStaticBox(new THREE.Vector3(c.x, 0.4, c.z), new THREE.Vector3(2, 0.8, 2), 0, null, { visual: false })
    }
  }
  track.addRamp(270, { length: 8, width: 4, height: 1.4, lateral: 1.6, material: std({ color: '#ff7a1a' }) })
  // Mount Royal with its cross, and the Olympic Stadium's leaning tower
  mountain(track, -120, -420, 300, 150, '#4f7a3a')
  const cross = new THREE.BoxGeometry(2, 30, 2)
  cross.translate(-120, 160, -420)
  track.addGeometry(cross, std({ color: '#f5f5f5', emissive: '#ffffff', emissiveIntensity: 0.3 }), false)
  const arm = new THREE.BoxGeometry(14, 2, 2)
  arm.translate(-120, 166, -420)
  track.addGeometry(arm, std({ color: '#f5f5f5', emissive: '#ffffff', emissiveIntensity: 0.3 }), false)
  const tower = new THREE.CylinderGeometry(4, 8, 160, 8)
  tower.translate(0, 80, 0)
  tower.rotateZ(-0.42)
  tower.translate(320, 0, -300)
  track.addGeometry(tower, std({ color: '#e8e6e1' }), false)
  const stadium = new THREE.CylinderGeometry(90, 100, 30, 24)
  stadium.translate(300, 15, -300)
  track.addGeometry(stadium, std({ color: '#d9d6cf' }), false)
  track.finish()
  return track
}

export function buildCity(id, env, props = {}) {
  if (id === 'ubud') return buildUbud(env, props)
  if (id === 'helsinki') return buildHelsinki(env, props)
  return buildMontreal(env, props)
}
