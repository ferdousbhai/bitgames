import * as THREE from 'three'

/**
 * Each world's gentle purpose (see worlds.js `goal`), and the pictures that show it:
 * - rings: big numbered rings flown in order, 1 → target. A missed ring isn't a failure: the
 *   next ring ahead takes its number, so the number waits for the child.
 * - gather: treasures of two or three kinds float in little groups; the child chooses which to
 *   fly to. Everything goes in the basket; the goal is a number of one kind. At the nest the
 *   family sorts the basket into rows by kind, counting each row aloud.
 * The same outlines draw the 3D treasures, the HUD and the nest/end-card pictures.
 */

export const TREASURES = {
  pink: { shape: 'heart', color: '#ff6fae', one: 'pink heart', many: 'pink hearts', word: 'pink' },
  blue: { shape: 'heart', color: '#3fb4ff', one: 'blue heart', many: 'blue hearts', word: 'blue' },
  star: { shape: 'star', color: '#ffd23f', one: 'star', many: 'stars' },
  moon: { shape: 'moon', color: '#ffd23f', one: 'moon', many: 'moons' },
  heart: { shape: 'heart', color: '#ffd23f', one: 'heart', many: 'hearts' },
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

const OUTLINES = { star: starPoints(), heart: heartPoints(), moon: moonPoints() }

// --- 2D pictures (HUD, nest tray, end card) -----------------------------------------

/** An inline SVG of a treasure kind; `empty` draws just a soft outline (a slot still to fill). */
export function treasureSVG(kind, empty = false) {
  const t = TREASURES[kind]
  const pts = OUTLINES[t.shape].map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ')
  const fill = empty ? 'rgba(255,255,255,0.18)' : t.color
  const stroke = empty ? 'rgba(255,255,255,0.85)' : '#ffffff'
  return `<svg class="tre${empty ? ' empty' : ''}" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true"><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="0.16" stroke-linejoin="round"${empty ? ' stroke-dasharray="0.3 0.18"' : ''}/></svg>`
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

// --- Big numbers for the rings ------------------------------------------------------------

const numbers = {}
/** A big friendly numeral with a thick outline, drawn once per number. */
export function numberTexture(n) {
  if (numbers[n]) return numbers[n]
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.font = `900 ${n >= 10 ? 150 : 190}px ui-rounded, "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  // a purple numeral in a thick white outline reads on bright skies, the ring's glow and the night alike
  g.lineWidth = 40
  g.strokeStyle = '#ffffff'
  g.strokeText(String(n), 128, 140)
  g.lineWidth = 8
  g.strokeStyle = '#4a1d8a'
  g.strokeText(String(n), 128, 140)
  g.fillStyle = '#7a3fc0'
  g.fillText(String(n), 128, 140)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  numbers[n] = tex
  return tex
}

// --- Words -----------------------------------------------------------------------------

/** "4 pink hearts", "1 star" */
export function countOf(kind, n) {
  return `${n} ${n === 1 ? TREASURES[kind].one : TREASURES[kind].many}`
}

/** The kinds in a world's basket, the wanted kind first, each with how many were brought home. */
export function sortedRows(goal, got) {
  return [goal.want, ...goal.kinds.filter((k) => k !== goal.want)].filter((k) => got[k] > 0).map((k) => [k, got[k]])
}

/** What Ember learned in a world, said at the end: "You flew 1 to 5 in order!" */
export function learnedSentence(entry) {
  const { goal } = entry
  if (goal.type === 'rings') {
    const n = entry.reached
    if (n <= 0) return ''
    if (n === 1) return 'You flew through ring 1!'
    return `You flew 1 to ${n} in order!`
  }
  const rows = sortedRows(goal, entry.got)
  if (!rows.length) return ''
  const shapes = new Set(rows.map(([k]) => TREASURES[k].shape))
  // same shape, different colours: "4 pink and 3 blue hearts"
  if (shapes.size === 1 && rows.length > 1 && rows.every(([k, n]) => TREASURES[k].word && n > 1)) {
    const parts = rows.map(([k, n]) => `${n} ${TREASURES[k].word}`)
    return `You sorted ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)} ${TREASURES[rows[0][0]].many.split(' ').pop()}!`
  }
  const parts = rows.map(([k, n]) => countOf(k, n))
  return `You sorted ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}!`
}

/** The world's goal said aloud as it starts. */
export function goalSentence(goal) {
  if (goal.type === 'rings') return `Fly through the rings in order, 1 to ${goal.target}!`
  return `Bring home ${countOf(goal.want, goal.count)}!`
}
