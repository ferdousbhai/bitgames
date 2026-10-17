import * as THREE from 'three'

/**
 * The sparkly treasures Ember finds in each world (see worlds.js `treasures`): hearts, stars and moons in the
 * world's colours. They float in little arcs to swoop through, or sit inside bubbles. Nothing asks for them;
 * the ones Ember catches ride along in the bag and land on the nest's island. The same outlines draw the
 * 3D treasures and the 2D pictures.
 */

export const TREASURES = {
  pink: { shape: 'heart', color: '#ff6fae' },
  blue: { shape: 'heart', color: '#3fb4ff' },
  star: { shape: 'star', color: '#ffd23f' },
  moon: { shape: 'moon', color: '#ffd23f' },
  heart: { shape: 'heart', color: '#ffd23f' },
  mint: { shape: 'star', color: '#5fe0b0' },
  sweet: { shape: 'candy', color: '#b28dff' },
  // a sleepy night-sky star, before Ember lights it (see Course.constellation)
  night: { shape: 'star', color: '#8a96d8' },
}

// --- Outlines (unit size, centred, y up) ------------------------------------------------

function starPoints() {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 0.46 : 1
    pts.push([Math.cos(a) * r, Math.sin(a) * r - 0.08])
  }
  return pts
}

function heartPoints() {
  const pts = []
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    pts.push([x / 16.5, y / 16.5 + 0.1])
  }
  return pts
}

function moonPoints() {
  // a chunky crescent: the outer circle's left side, then a smaller circle's left side back
  const pts = []
  const a0 = Math.PI / 3
  for (let i = 0; i <= 24; i++) {
    const a = a0 + (i / 24) * (Math.PI * 2 - 2 * a0)
    pts.push([Math.cos(a), Math.sin(a)])
  }
  const c = 0.6
  const r = Math.hypot(0.5 - c, Math.sin(a0))
  const p = Math.atan2(-Math.sin(a0), 0.5 - c) + Math.PI * 2 // the lower tip, on the inner circle
  const q = Math.atan2(Math.sin(a0), 0.5 - c) // the upper tip
  for (let i = 1; i < 18; i++) {
    const a = p - (i / 18) * (p - q)
    pts.push([c + Math.cos(a) * r, Math.sin(a) * r])
  }
  // tilt it a little, like a sleepy moon, and centre it
  const k = -0.35
  const turned = pts.map(([x, y]) => [x * Math.cos(k) - y * Math.sin(k), x * Math.sin(k) + y * Math.cos(k)])
  const cx = (Math.min(...turned.map((t) => t[0])) + Math.max(...turned.map((t) => t[0]))) / 2
  return turned.map(([x, y]) => [x - cx, y])
}

function candyPoints() {
  // a wrapped sweet: a round middle with a twist of wrapper either side
  const pts = []
  const r = 0.62
  const a0 = Math.PI / 5
  pts.push([1.12, 0.55], [1.12, -0.55])
  for (let i = 0; i <= 14; i++) {
    const a = -a0 - (i / 14) * (Math.PI - 2 * a0)
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  pts.push([-1.12, -0.55], [-1.12, 0.55])
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI - a0 - (i / 14) * (Math.PI - 2 * a0)
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  // a little smaller overall, so a row of sweets on the nest's island stays apart
  return pts.map(([x, y]) => [x * 0.8, y * 0.8])
}

const OUTLINES = { star: starPoints(), heart: heartPoints(), moon: moonPoints(), candy: candyPoints() }

// --- 2D pictures -----------------------------------------------------------------------

/** An inline SVG of a treasure kind, for the bag in the corner and the end card. */
export function treasureSVG(kind) {
  const t = TREASURES[kind]
  const pts = OUTLINES[t.shape].map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ')
  return `<svg class="tre" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true"><polygon points="${pts}" fill="${t.color}" stroke="#ffffff" stroke-width="0.16" stroke-linejoin="round"/></svg>`
}

// --- 3D treasures ---------------------------------------------------------------------

const geos = {}
const mats = {}
export function treasureMesh(kind) {
  const t = TREASURES[kind]
  if (!geos[t.shape]) {
    const shape = new THREE.Shape(OUTLINES[t.shape].map(([x, y]) => new THREE.Vector2(x, y)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.09, bevelSegments: 2, curveSegments: 6 })
    g.center()
    geos[t.shape] = g
  }
  mats[kind] ??= new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.05 })
  return new THREE.Mesh(geos[t.shape], mats[kind])
}
