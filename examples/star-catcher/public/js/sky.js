import * as THREE from 'three'
import { makeGlowTexture, numberTexture } from './effects.js'

/**
 * The real northern-sky constellations a trip draws from (five per trip, the first always a
 * five-star one). Star positions come from a gnomonic projection of each star's catalogue
 * RA/Dec (east to the left, as seen in the sky), normalised to a 0–1 box with y pointing down.
 * `turn` rotates a shape so it fits the panel (the sky turns over the night, so a turned
 * constellation is still true). Stars are numbered and lit in `stars` order, and a line appears
 * once both of its ends are lit. `riddle` is the question asked about it in the night sky at home.
 * All of them can be seen together from the northern half of the world (Orion sits on the
 * equator), so the night sky at home is one real sky.
 */
export const CONSTELLATIONS = [
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    spoken: 'Cassiopeia',
    short: 'It looks like a W',
    fact: 'Cassiopeia looks like the letter W.',
    riddle: 'Find the W.',
    // Segin, Ruchbah, Navi, Schedar, Caph (Navi lifted a touch so the W reads clearly)
    stars: [[0, 0], [0.22, 0.31], [0.51, 0.2], [0.7, 0.62], [1, 0.37]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    id: 'cygnus',
    name: 'Cygnus',
    spoken: 'Cygnus the swan',
    short: 'A swan, and a cross',
    fact: 'Cygnus is a swan flying, and its stars make a big cross.',
    riddle: 'Find the cross.',
    // Deneb, Sadr, Albireo, Gienah, Delta Cygni
    stars: [[0.11, 0], [0.3, 0.3], [0.96, 1], [0, 0.65], [0.69, 0.01]],
    big: { 0: 1.25 }, // Deneb
    lines: [[0, 1], [1, 2], [3, 1], [1, 4]],
  },
  {
    id: 'cepheus',
    name: 'Cepheus',
    spoken: 'Cepheus the king',
    short: 'It looks like a little house',
    fact: 'Cepheus looks like a little house with a pointy roof.',
    riddle: 'Find the little house.',
    // Alderamin, Alfirk, Errai (the roof's point), Iota, Zeta Cephei
    stars: [[0.55, 0.74], [0.41, 0.37], [0, 0], [0.06, 0.59], [0.26, 1]],
    turn: 0.45,
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 3]],
  },
  {
    id: 'lyra',
    name: 'Lyra',
    spoken: 'Lyra the harp',
    short: 'A little harp with bright Vega',
    fact: 'Lyra is a little harp. Its star Vega is one of the brightest in the sky.',
    riddle: 'Find the harp with the very bright star.',
    // Vega, Epsilon, Zeta, Delta, Sulafat, Sheliak
    stars: [[0.64, 0.12], [0.43, 0], [0.42, 0.3], [0.14, 0.4], [0, 1], [0.27, 0.91]],
    big: { 0: 1.5 }, // Vega
    colors: { 0: '#dfeaff' },
    lines: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 2]],
  },
  {
    id: 'orion',
    name: 'Orion',
    spoken: 'Orion the hunter',
    short: 'Three stars make his belt',
    fact: 'Orion the hunter has three stars in a row for his belt.',
    riddle: 'Find the hunter with a belt of three stars.',
    // Betelgeuse (red), Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Rigel (blue-white)
    // (the belt is spread a touch, so its three stars stay three dots even on a small card)
    stars: [[0, 0], [0.44, 0.06], [0.37, 0.44], [0.28, 0.5], [0.19, 0.56], [0.11, 1], [0.59, 0.91]],
    colors: { 0: '#ffb27a', 6: '#cfe3ff' },
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [4, 5], [2, 6]],
  },
  {
    id: 'little-dipper',
    name: 'Little Dipper',
    spoken: 'the Little Dipper',
    short: 'The North Star is on its handle',
    fact: "The North Star is at the end of the Little Dipper's handle.",
    riddle: 'Find the little spoon with the North Star.',
    // Polaris, Yildun, Epsilon, Zeta, Eta, Pherkad, Kochab
    stars: [[0.1, 0], [0.03, 0.2], [0, 0.45], [0.11, 0.69], [0.01, 0.79], [0.21, 1], [0.31, 0.86]],
    big: { 0: 1.45 }, // the North Star
    turn: -1.35,
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    id: 'big-dipper',
    name: 'Big Dipper',
    spoken: 'the Big Dipper',
    short: 'A big spoon that points north',
    fact: 'The Big Dipper is a big spoon, and it points to the North Star.',
    riddle: 'Find the big spoon.',
    // Dubhe, Merak, Phecda, Megrez, Alioth, Mizar, Alkaid
    stars: [[0.93, 0], [1, 0.21], [0.73, 0.37], [0.59, 0.25], [0.38, 0.28], [0.2, 0.29], [0, 0.48]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
  },
]

/**
 * A trip starts with a five-star constellation (the gentle count-to-five mission), and the rest
 * wait in a shuffled pool: at each planet the child picks the next shape from two of them.
 */
export function planTrip() {
  const shuffle = (list) => list.map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c)
  const first = shuffle(CONSTELLATIONS.filter((c) => c.stars.length === 5))[0]
  return { trip: [first], pool: shuffle(CONSTELLATIONS.filter((c) => c !== first)) }
}

// Rotate (if asked) and renormalise each shape once, keeping its true proportions.
for (const c of CONSTELLATIONS) {
  const a = c.turn || 0
  const p = c.stars.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])
  const xs = p.map((q) => q[0])
  const ys = p.map((q) => q[1])
  const mx = Math.min(...xs)
  const my = Math.min(...ys)
  const s = Math.max(Math.max(...xs) - mx, Math.max(...ys) - my)
  c.shape = p.map(([x, y]) => [(x - mx) / s, (y - my) / s])
  c.aspect = (Math.max(...xs) - mx) / (Math.max(...ys) - my)
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3)
const LIT_COLOR = '#fff1b8'
const LINE_COLOR = '#ffe4a0'
const WHITE = new THREE.Color('#ffffff')

function roundedRect(w, h, r) {
  const s = new THREE.Shape()
  s.moveTo(r, 0)
  s.lineTo(w - r, 0)
  s.quadraticCurveTo(w, 0, w, r)
  s.lineTo(w, h - r)
  s.quadraticCurveTo(w, h, w - r, h)
  s.lineTo(r, h)
  s.quadraticCurveTo(0, h, 0, h - r)
  s.lineTo(0, r)
  s.quadraticCurveTo(0, 0, r, 0)
  return new THREE.ShapeGeometry(s, 6)
}

/** A calm rounded backdrop, rebuilt only when its box changes size. */
class Backdrop {
  constructor(parent, color, opacity, edge) {
    this.fill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }))
    this.edge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: edge, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }))
    this.edge.renderOrder = 0
    this.fill.renderOrder = 1
    parent.add(this.edge, this.fill)
    this.key = ''
  }

  place(r) {
    const key = `${r.w | 0}x${r.h | 0}`
    if (key !== this.key) {
      this.key = key
      const rad = Math.min(r.w, r.h) * 0.16
      this.fill.geometry.dispose()
      this.edge.geometry.dispose()
      this.fill.geometry = roundedRect(r.w, r.h, rad)
      this.edge.geometry = roundedRect(r.w + 3, r.h + 3, rad + 1.5)
    }
    this.fill.position.set(r.x, r.y, 0)
    this.edge.position.set(r.x - 1.5, r.y - 1.5, 0)
  }

  set visible(v) {
    this.fill.visible = this.edge.visible = v
  }

  dispose() {
    for (const mesh of [this.fill, this.edge]) {
      mesh.parent?.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}

const unitLine = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)
const ringGeo = new THREE.RingGeometry(0.78, 1, 40)

/**
 * One constellation drawn into a screen box: a faint ghost of the whole shape, dim places for
 * every star, lit stars and lines. With `values` (the number each star carries) the panel also
 * labels the star to catch next and the one lit last, pushed apart so close stars stay readable.
 */
class ConstellationView {
  constructor(def, parent, glow, values = null) {
    this.def = def
    this.values = values
    this.group = new THREE.Group()
    parent.add(this.group)
    this.pts = def.shape.map(() => new THREE.Vector2())
    this.size = 10
    this.litAt = def.stars.map(() => -1) // time each star was lit (-1: not yet)
    this.litCount = 0
    // Joining the dots (see Sky.join): the time each star was joined, in the child's own order
    this.joinedAt = def.stars.map(() => -1)
    this.joinCount = 0
    this.linesBy = 'lit' // 'lit': a line grows once both its stars are lit; 'joined': once both are joined
    this.near = def.shape.map(() => Infinity) // how far each star is from its closest neighbour, in pixels
    this.stars = def.shape.map((_, i) => {
      const color = new THREE.Color(def.colors?.[i] || LIT_COLOR)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }))
      halo.renderOrder = 4
      core.renderOrder = 5
      this.group.add(halo, core)
      return { halo, core, color }
    })
    this.lines = def.lines.map(([a, b]) => {
      const mesh = new THREE.Mesh(unitLine, new THREE.MeshBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }))
      mesh.renderOrder = 3
      // The ghost: the whole shape drawn faintly from the start, so the child sees the picture being built
      const ghost = new THREE.Mesh(unitLine, new THREE.MeshBasicMaterial({ color: '#c9bbff', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }))
      ghost.renderOrder = 2
      mesh.visible = false
      this.group.add(ghost, mesh)
      return { a, b, mesh, ghost }
    })
    this.next = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }))
    this.next.renderOrder = 4
    this.group.add(this.next)
    // The keyboard's ring in the join card (arrow keys move it, Enter joins), dashed-looking gold
    this.focusRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }))
    this.focusRing.renderOrder = 4
    this.focusRing.visible = false
    this.group.add(this.focusRing)
    this.focus = -1
    this.hidden = [] // in 'join', the stars whose number shows "?" until the child picks it
    this.picking = false // the child is choosing the hidden number of the next star
    const label = () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }))
      sp.renderOrder = 7
      sp.visible = false
      this.group.add(sp)
      return sp
    }
    // One number for every star; which of them show depends on `labels`
    this.starLabels = def.stars.map(() => label())
    this.glow = glow
    this.highlight = 0
    this.call = 0 // the next star's ring brightens for a moment after a wrong catch, then settles
    // 'all': the next star shows its number; 'ask': it shows "?" (the child works it out from the
    // last one); 'ask2': "?" with the last two shown (find the pattern); 'join': every star numbered
    this.labels = 'all'
    this.ring = true // in 'join', the ring marks the star to tap next (always for the first one)
  }

  /** Fit the shape inside box `r` ({ x, y, w, h } in GL pixels, y up), keeping its proportions. */
  place(r) {
    this.size = Math.min(20, Math.max(9, Math.min(r.w, r.h) * 0.1))
    // Room for the ring and the number of a star on the very edge of the shape
    const pad = Math.max(Math.min(r.w, r.h) * 0.12, this.values ? this.size * 1.6 : 0)
    const w = r.w - pad * 2
    const h = r.h - pad * 2
    const a = this.def.aspect
    const fw = Math.min(w, h * a)
    const fh = fw / a
    const ox = r.x + pad + (w - fw) / 2
    const oy = r.y + pad + (h - fh) / 2
    const span = Math.max(fw, fh)
    this.def.shape.forEach(([u, v], i) => this.pts[i].set(ox + u * span, oy + fh - v * span))
    this.box = r
    this.pts.forEach((p, i) => (this.near[i] = Math.min(...this.pts.map((q, j) => (j === i ? Infinity : p.distanceTo(q))))))
  }

  /** Stars lit so far, which is also the next star waiting to be lit. */
  get lit() {
    return this.litCount
  }

  /** Light star `i` at time `at`. */
  light(i, at) {
    if (this.litAt[i] < 0) this.litCount++
    this.litAt[i] = at
  }

  /**
   * Numbers beside their stars: `list` is [{ i, text, opacity }], placed in order. Each takes the
   * one of twelve spots around its star that stays inside the box and is clearest of every other
   * star and of the numbers already placed, so close stars (Orion's belt) never share a number's spot.
   */
  placeLabels(list) {
    const shown = new Set()
    const placed = []
    // Kept a little inside the box, clear of its rounded corners
    const m = Math.min(this.box.w, this.box.h) * 0.04
    const b = { x: this.box.x + m, y: this.box.y + m, w: this.box.w - m * 2, h: this.box.h - m * 2 }
    // Points along every line, so a number never sits on the shape's lines either
    const along = []
    for (const { a, b: e } of this.lines) for (let t = 0.2; t < 0.85; t += 0.15) along.push(new THREE.Vector2().lerpVectors(this.pts[a], this.pts[e], t))
    // Digits about 24 px tall on a tablet panel (a little bigger in the join card)
    const h = Math.min(46, Math.max(20, this.size * (this.labels === 'join' ? 2.9 : 2.5)))
    for (const { i, text, opacity } of list) {
      const sp = this.starLabels[i]
      shown.add(sp)
      const tex = numberTexture(text)
      if (sp.material.map !== tex) {
        sp.material.map = tex
        sp.material.needsUpdate = true
      }
      const hw = (h * tex.userData.aspect) / 2
      sp.scale.set(hw * 2, h, 1)
      const p = this.pts[i]
      const off = this.size * 1.1 + h * 0.42
      let best = null
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + Math.PI / 2
        const x = p.x + Math.cos(a) * (off + Math.abs(Math.cos(a)) * (hw - h / 2))
        const y = p.y + Math.sin(a) * off
        const inside = x - hw >= b.x && x + hw <= b.x + b.w && y - h / 2 >= b.y && y + h / 2 <= b.y + b.h
        let clear = Infinity
        this.pts.forEach((q, j) => j !== i && (clear = Math.min(clear, Math.max(Math.abs(q.x - x) - hw, Math.abs(q.y - y) - h / 2))))
        for (const q of along) clear = Math.min(clear, Math.max(Math.abs(q.x - x) - hw, Math.abs(q.y - y) - h / 2) + h * 0.35)
        let overlap = 0
        for (const o of placed) overlap += Math.max(0, Math.min(x + hw, o.x + o.hw) - Math.max(x - hw, o.x - o.hw)) * Math.max(0, Math.min(y + h / 2, o.y + h / 2) - Math.max(y - h / 2, o.y - h / 2))
        const score = Math.min(clear, h) - (inside ? 0 : 1000) - overlap * 0.2 + Math.sin(a) * 0.5
        if (!best || score > best.score) best = { x, y, score }
      }
      const x = Math.min(Math.max(best.x, b.x + hw), b.x + b.w - hw)
      const y = Math.min(Math.max(best.y, b.y + h / 2), b.y + b.h - h / 2)
      placed.push({ x, y, hw })
      sp.position.set(x, y, 0)
      sp.material.opacity = opacity
      sp.visible = true
    }
    for (const sp of this.starLabels) if (!shown.has(sp)) sp.visible = false
  }

  /** Which numbers show: in 'join' every star's; otherwise the star to catch next and the last one or two lit. */
  labelList(n) {
    const v = this.values
    if (this.labels === 'join') {
      // Joined stars dim, so the numbers still to choose from stand out
      return v.map((_, i) => ({ i, text: this.hidden.includes(i) && this.joinedAt[i] < 0 ? '?' : String(v[i]), opacity: this.joinedAt[i] < 0 ? 0.97 : 0.6 }))
    }
    const total = this.pts.length
    if (n >= total) return []
    const known = this.labels === 'ask2' ? 2 : this.labels === 'ask' ? 1 : total
    const list = [{ i: n, text: n < known ? String(v[n]) : '?', opacity: 0.97 }]
    if (n > 0) list.push({ i: n - 1, text: String(v[n - 1]), opacity: 0.88 })
    if (this.labels === 'ask2' && n > 1) list.push({ i: n - 2, text: String(v[n - 2]), opacity: 0.8 })
    return list
  }

  update(now, { showNext = true, still = false } = {}) {
    const s = this.size
    const glowBoost = 1 + this.highlight * 0.35
    this.stars.forEach((st, i) => {
      const p = this.pts[i]
      const big = this.def.big?.[i] || 1
      const at = this.litAt[i]
      const k = at < 0 ? 0 : still ? 1 : ease((now - at) / 0.45)
      const ja = this.joinedAt[i]
      const joined = ja < 0 ? 0 : still ? 1 : ease((now - ja) / 0.35)
      st.core.position.set(p.x, p.y, 0)
      st.halo.position.set(p.x, p.y, 0)
      // Unlit: a small dim dot showing where the star belongs. Lit: a warm star with a soft halo.
      // Glows stay inside half the gap to the nearest star, so close stars (Orion's belt) read as separate dots.
      const gap = this.near[i]
      st.core.scale.setScalar(Math.min(s * big * (0.95 + 0.75 * k + 0.25 * joined), Math.max(gap * 0.8, 8)))
      st.core.material.opacity = 0.62 + 0.38 * k
      st.core.material.color.copy(st.color).lerp(WHITE, 0.4 + 0.6 * (1 - k))
      st.halo.scale.setScalar(Math.min(s * big * 3 * k * (glowBoost + 0.3 * joined), Math.max(gap * 1.1, 6) * k))
      st.halo.material.opacity = 0.75 * k
    })
    const total = this.pts.length
    // The ghost is brightest while the shape is still empty, so the child sees the picture to build
    const ghost = this.linesBy === 'joined' ? 0.32 - 0.12 * (this.joinCount / total) : 0.34 - 0.16 * (this.litCount / total)
    for (const line of this.lines) {
      line.ghost.material.opacity = ghost
      const a = this.pts[line.a]
      const b = this.pts[line.b]
      // Lines stop a little short of their stars, so close stars (Orion's belt) stay separate dots
      const d = a.distanceTo(b)
      const gap = Math.min(d * 0.22, s * 0.32)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      line.ghost.position.set(a.x + cos * gap, a.y + sin * gap, 0)
      line.ghost.rotation.z = ang
      line.ghost.scale.set(Math.max(0.001, d - gap * 2), Math.max(1.2, s * 0.14), 1)
      const when = this.linesBy === 'joined' ? this.joinedAt : this.litAt
      const ta = when[line.a]
      const tb = when[line.b]
      if (ta < 0 || tb < 0) {
        line.mesh.visible = false
        continue
      }
      // The line grows out from the star lit first toward the one just lit
      const [from, to] = ta <= tb ? [line.a, line.b] : [line.b, line.a]
      const start = Math.max(ta, tb)
      const k = still ? 1 : ease((now - start) / 0.55)
      const f = this.pts[from]
      const dir = from === line.a ? 1 : -1
      line.mesh.visible = k > 0
      line.mesh.position.set(f.x + cos * gap * dir, f.y + sin * gap * dir, 0)
      line.mesh.rotation.z = dir > 0 ? ang : ang + Math.PI
      line.mesh.scale.set(Math.max(0.001, (d - gap * 2) * k), Math.max(1.6, s * 0.2), 1)
      line.mesh.material.opacity = 0.7 + 0.3 * this.highlight
    }
    const joining = this.labels === 'join'
    const n = joining ? this.joinCount : this.lit
    this.next.visible = showNext && n < total && (!joining || this.ring || n === 0 || this.call > 0 || this.picking)
    if (this.next.visible) {
      const p = this.pts[n]
      this.next.position.set(p.x, p.y, 0)
      this.next.scale.setScalar(s * (1.25 + 0.25 * this.call))
      this.next.material.opacity = 0.35 + 0.5 * this.call
    }
    this.focusRing.visible = joining && this.focus >= 0 && !this.picking
    if (this.focusRing.visible) {
      const p = this.pts[this.focus]
      this.focusRing.position.set(p.x, p.y, 0)
      this.focusRing.scale.setScalar(s * 1.7)
    }
    this.placeLabels(this.values && showNext ? this.labelList(n) : [])
  }

  dispose() {
    this.group.parent?.remove(this.group)
    this.group.traverse((o) => o.material?.dispose())
  }
}

/**
 * The calm sky panel (the constellation being built on this leg) and the night sky at home
 * (every constellation the child built). Drawn as a second, flat pass over the game in screen
 * pixels; its boxes follow DOM placeholders so CSS owns the layout in every orientation.
 */
export class Sky {
  constructor({ reducedMotion = false, onLit, onComplete } = {}) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10)
    this.glow = makeGlowTexture(true)
    this.reducedMotion = reducedMotion
    this.onLit = onLit
    this.onComplete = onComplete
    this.time = 0
    this.panelRoot = new THREE.Group()
    this.finaleRoot = new THREE.Group()
    this.choiceRoot = new THREE.Group()
    this.scene.add(this.panelRoot, this.finaleRoot, this.choiceRoot)
    // A soft dimming of the whole scene behind the cards at a planet (joining the dots, choosing the next shape)
    this.dim = new Backdrop(this.scene, '#070424', 0.62, '#070424')
    this.dim.fill.renderOrder = -2
    this.dim.edge.renderOrder = -3
    this.dim.edge.material.opacity = 0
    this.dim.visible = false
    this.backdrop = new Backdrop(this.panelRoot, '#0d0833', 0.8, '#b9a8ff')
    this.view = null
    this.index = -1
    this.claimed = 0 // stars promised to the panel, including those still flying up
    this.flights = []
    this.done = [] // { def, litAt } for each finished constellation
    Object.assign(this, planTrip()) // trip: the constellations chosen so far, in order; pool: the ones still to choose from
    this.choice = null // the two shapes offered at a planet
    this.joining = false // the finished shape is in the big card, waiting for its dots to be joined
    this.panelEl = null
    this.finale = null
    this.panelRoot.visible = false
    this.w = 1
    this.h = 1
    this.tmp = new THREE.Vector2()
  }

  get def() {
    return this.trip[this.index]
  }

  get total() {
    return this.def ? this.def.stars.length : 0
  }

  /** Stars lit so far on this leg (landed, not flying). */
  get lit() {
    return this.view ? this.view.lit : 0
  }

  get full() {
    return this.claimed >= this.total
  }

  resize(w, h) {
    this.w = w
    this.h = h
    Object.assign(this.camera, { left: 0, right: w, top: h, bottom: 0 })
    this.camera.updateProjectionMatrix()
    this.layout()
  }

  /** A DOM element's box in GL pixels (origin bottom-left). */
  rectOf(el) {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: this.h - r.bottom, w: r.width, h: r.height }
  }

  layout() {
    this.dim.place({ x: -400, y: -400, w: this.w + 800, h: this.h + 800 })
    if (this.view && this.panelEl) {
      const r = this.rectOf(this.panelEl)
      this.backdrop.place(r)
      // The bottom strip is kept for the constellation's name (or, in the big card, the words)
      const strip = this.joining ? 0.13 : 0.2
      this.view.place({ x: r.x, y: r.y + r.h * strip, w: r.w, h: r.h * (1 - strip) })
    }
    if (this.finale) {
      this.finale.backdrop.place({ x: -400, y: -400, w: this.w + 800, h: this.h + 800 }) // corners well off screen
      this.finale.views.forEach((v, i) => {
        const r = this.rectOf(this.finale.cells[i])
        v.place({ x: r.x, y: r.y + r.h * 0.22, w: r.w, h: r.h * 0.78 })
      })
    }
    this.choice?.forEach(({ view, backdrop, cell }) => {
      const r = this.rectOf(cell)
      backdrop.place(r)
      view.place({ x: r.x, y: r.y + r.h * 0.24, w: r.w, h: r.h * 0.76 })
    })
  }

  /** Two shapes from the pool for the child to choose between at a planet. */
  offer() {
    return this.pool.slice(0, 2)
  }

  /** The child chose `def` as the next constellation of the trip. */
  pick(def) {
    this.pool = this.pool.filter((c) => c !== def)
    this.trip.push(def)
    this.closeChoice()
  }

  /** Draws each offered shape (all its stars and lines, so it can be compared) into its card. */
  showChoice(defs, cells) {
    this.closeChoice()
    this.choice = defs.map((def, i) => {
      const backdrop = new Backdrop(this.choiceRoot, '#0d0833', 0.96, '#b9a8ff')
      const view = new ConstellationView(def, this.choiceRoot, this.glow)
      def.stars.forEach((_, k) => view.light(k, this.time + 0.2 + i * 0.3 + k * 0.08))
      return { view, backdrop, cell: cells[i] }
    })
    this.dim.visible = true
    this.layout()
  }

  closeChoice() {
    if (!this.joining) this.dim.visible = false
    if (!this.choice) return
    this.choice.forEach(({ view, backdrop }) => {
      view.dispose()
      backdrop.dispose()
    })
    this.choiceRoot.clear()
    this.choice = null
  }

  /**
   * The finished shape moves into the big card `el` with every star numbered and no lines yet:
   * the child joins the dots by tapping the stars in counting order, and each line appears once
   * both its stars are joined.
   */
  join(el, ring, hidden = []) {
    if (!this.view) return
    this.joining = true
    this.panelEl = el
    Object.assign(this.view, { labels: 'join', linesBy: 'joined', ring, call: 0, hidden, focus: -1, picking: false })
    this.dim.visible = true
    this.backdrop.fill.material.opacity = 1 // the planet behind never shows through the card
    this.layout()
  }

  /** The next star to join hides its number. */
  hiddenNext() {
    const v = this.view
    return Boolean(v && this.joining && v.hidden.includes(v.joinCount))
  }

  /** The child is picking the hidden number (taps on the stars wait meanwhile). */
  get picking() {
    return Boolean(this.view?.picking)
  }

  set picking(on) {
    if (this.view) this.view.picking = on
  }

  /** Moves the keyboard ring to the next (or previous) star still to join, from left to right. */
  moveFocus(step) {
    const v = this.view
    if (!v || !this.joining) return
    const open = v.pts.map((p, i) => i).filter((i) => v.joinedAt[i] < 0).sort((a, b) => v.pts[a].x - v.pts[b].x || v.pts[b].y - v.pts[a].y)
    if (!open.length) return
    const at = open.indexOf(v.focus)
    v.focus = open[at < 0 ? (step > 0 ? 0 : open.length - 1) : (at + step + open.length) % open.length]
  }

  /** The star of the card nearest to screen point (x, y, CSS pixels), or -1. A tap on a star's number counts as a tap on the star. */
  starAt(x, y) {
    const v = this.view
    if (!v || !this.joining) return -1
    const gx = x
    const gy = this.h - y
    const need = v.joinCount
    const reach = Math.max(34, v.size * 2.2)
    let best = -1
    let bestD = Infinity
    v.pts.forEach((p, i) => {
      const lab = v.starLabels[i].position
      const d = Math.min(Math.hypot(p.x - gx, p.y - gy), Math.hypot(lab.x - gx, lab.y - gy) + 4)
      if (d < bestD) [best, bestD] = [i, d]
    })
    if (best < 0 || bestD > reach) return -1
    // Close stars are kind to small fingers: a tap almost as near the wanted star counts as that star
    const p = v.pts[need]
    if (p && best !== need && Math.hypot(p.x - gx, p.y - gy) < bestD + 12) return need
    return best
  }

  /** Join star `i` (the next in order). Returns true once every star is joined. */
  joinStar(i) {
    const v = this.view
    if (v.joinedAt[i] < 0) v.joinCount++
    v.joinedAt[i] = this.time
    if (v.focus === i) v.focus = -1
    return v.joinCount === v.pts.length
  }

  /** The joined shape goes back to its place in the corner panel. */
  unjoin(el) {
    this.joining = false
    this.dim.visible = false
    this.backdrop.fill.material.opacity = 0.8
    this.panelEl = el
    if (this.view) Object.assign(this.view, { labels: 'done', focus: -1, picking: false })
    this.layout()
  }

  /** Start building constellation `index` of the trip in the panel box `el`; `values` are the numbers its stars carry. */
  begin(index, el, values) {
    this.clearPanel()
    this.index = index
    this.panelEl = el
    this.claimed = 0
    this.view = new ConstellationView(this.def, this.panelRoot, this.glow, values)
    // Lines are drawn by the child at the planet, joining the dots
    this.view.linesBy = 'joined'
    this.panelRoot.visible = true
    this.layout()
  }

  clearPanel() {
    this.view?.dispose()
    this.view = null
    for (const f of this.flights) this.dropFlight(f)
    this.flights = []
  }

  dropFlight(f) {
    this.scene.remove(f.sprite)
    f.sprite.material.dispose()
  }

  /** Everything back to the start of a trip. */
  reset() {
    this.joining = false
    this.dim.visible = false
    this.backdrop.fill.material.opacity = 0.8
    this.clearPanel()
    this.closeFinale()
    this.closeChoice()
    this.done = []
    Object.assign(this, planTrip())
    this.index = -1
    this.claimed = 0
    this.panelRoot.visible = false
  }

  /** A caught star at screen point (x, y, CSS pixels) flies up to light the next star. */
  claim(x, y, data) {
    if (!this.view || this.full) return false
    const i = this.claimed++
    this.fly(x, y, this.view.stars[i].color, (out) => out.copy(this.view.pts[i]), () => this.land(i, data))
    return true
  }

  /** How the panel numbers the stars: 'all' shows the next number, 'ask' shows "?" there. */
  set labels(mode) {
    if (this.view) this.view.labels = mode
  }

  /** After a wrong catch the next star's ring brightens for a moment: "this is the one we need". */
  call() {
    if (this.view) this.view.call = 1
  }

  fly(x, y, color, target, land) {
    if (this.reducedMotion) {
      target(this.tmp)
      land()
      return
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    sprite.renderOrder = 6
    this.scene.add(sprite)
    this.flights.push({ sprite, from: new THREE.Vector2(x, this.h - y), target, land, t: 0, view: this.view })
  }

  land(i, data) {
    const view = this.view
    view.light(i, this.time)
    this.onLit?.(i + 1, this.total, data)
    if (view.lit === this.total) {
      // Let the last line finish drawing before the name is spoken
      const def = this.def
      setTimeout(() => {
        if (this.view !== view) return
        this.done.push({ def, litAt: [...view.litAt] })
        this.onComplete?.(def, this.index)
      }, this.reducedMotion ? 300 : 900)
    }
  }

  update(dt) {
    this.time += dt
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k]
      if (f.view !== this.view) {
        this.dropFlight(f)
        this.flights.splice(k, 1)
        continue
      }
      f.t += dt / 0.8
      const to = f.target(this.tmp)
      const e = ease(f.t)
      // A soft arc up to its place in the panel
      const cx = (f.from.x + to.x) / 2 + (f.from.x < to.x ? -1 : 1) * 60
      const cy = Math.max(f.from.y, to.y) + 40
      const u = 1 - e
      f.sprite.position.set(u * u * f.from.x + 2 * u * e * cx + e * e * to.x, u * u * f.from.y + 2 * u * e * cy + e * e * to.y, 1)
      const s = (this.view?.size || 10) * (2.6 - e)
      f.sprite.scale.setScalar(s)
      if (f.t >= 1) {
        this.dropFlight(f)
        this.flights.splice(k, 1)
        f.land()
      }
    }
    if (this.view) this.view.call = Math.max(0, this.view.call - dt * 0.8)
    this.view?.update(this.time, { still: this.reducedMotion })
    this.choice?.forEach(({ view }) => view.update(this.time, { showNext: false, still: this.reducedMotion }))
    if (this.finale) {
      const k = this.reducedMotion ? 1 : ease((this.time - this.finale.at) / 1.2)
      this.finale.backdrop.fill.material.opacity = 0.55 * k
      this.finale.views.forEach((v) => {
        v.highlight = Math.max(0, v.highlight - dt * 0.5)
        v.update(this.time, { showNext: false, still: this.reducedMotion })
      })
    }
  }

  /** Home: every constellation the child built, each drawn into its own cell. */
  showFinale(cells) {
    this.clearPanel()
    this.panelRoot.visible = false
    this.closeFinale()
    const backdrop = new Backdrop(this.finaleRoot, '#070424', 0, '#070424')
    backdrop.edge.visible = false
    const views = this.done.map((d, i) => {
      const v = new ConstellationView(d.def, this.finaleRoot, this.glow)
      // The stars light again one constellation after another, in the order they were made
      d.def.stars.forEach((_, k) => v.light(k, this.time + 0.4 + i * 0.5 + k * 0.08))
      return v
    })
    this.finale = { backdrop, views, cells, at: this.time }
    this.layout()
  }

  /** Brighten one constellation at home when its card is tapped. */
  highlight(i) {
    const v = this.finale?.views[i]
    if (v) v.highlight = 1
  }

  closeFinale() {
    if (!this.finale) return
    this.finale.views.forEach((v) => v.dispose())
    this.finale.backdrop.dispose()
    this.finaleRoot.clear()
    this.finale = null
  }

  render(renderer) {
    if (!this.view && !this.finale && !this.choice && !this.flights.length) return
    // The big card can move with the page (a rotated tablet): it follows its box every frame
    if (this.joining) this.layout()
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
  }
}
