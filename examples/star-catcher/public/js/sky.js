import * as THREE from 'three'
import { makeGlowTexture } from './effects.js'

/**
 * The five real constellations of the journey, one per planet. Star positions come from a
 * gnomonic projection of each star's catalogue RA/Dec (east to the left, as seen in the sky),
 * normalised to a 0–1 box with y pointing down. `turn` rotates a tall shape so it fits the
 * panel (the sky turns over the night, so a turned constellation is still true). Each star is
 * lit in `order`, and a line appears once both of its ends are lit.
 */
export const CONSTELLATIONS = [
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    spoken: 'Cassiopeia',
    short: 'It looks like a W',
    fact: 'Cassiopeia looks like the letter W.',
    // Segin, Ruchbah, Navi, Schedar, Caph (Navi lifted a touch so the W reads clearly)
    stars: [[0, 0], [0.22, 0.31], [0.51, 0.2], [0.7, 0.62], [1, 0.37]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    id: 'crux',
    name: 'Southern Cross',
    spoken: 'the Southern Cross',
    short: 'Sailors used it to find south',
    fact: 'Sailors used the Southern Cross to find the way south.',
    // Gacrux, Acrux, Mimosa, Imai
    stars: [[0.35, 0], [0.44, 1], [0, 0.44], [0.69, 0.28]],
    lines: [[0, 1], [2, 3]],
  },
  {
    id: 'orion',
    name: 'Orion',
    spoken: 'Orion the hunter',
    short: 'Three stars make his belt',
    fact: 'Orion has three stars in a row for his belt.',
    // Betelgeuse (red), Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Rigel (blue-white)
    stars: [[0, 0], [0.44, 0.06], [0.34, 0.45], [0.28, 0.5], [0.21, 0.55], [0.11, 1], [0.59, 0.91]],
    colors: { 0: '#ffb27a', 6: '#cfe3ff' },
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [4, 5], [2, 6]],
  },
  {
    id: 'little-dipper',
    name: 'Little Dipper',
    spoken: 'the Little Dipper',
    short: 'The North Star is on its handle',
    fact: "The North Star is at the end of the Little Dipper's handle.",
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
    short: 'It points to the North Star',
    fact: 'The Big Dipper points to the North Star.',
    // Dubhe, Merak, Phecda, Megrez, Alioth, Mizar, Alkaid
    stars: [[0.93, 0], [1, 0.21], [0.73, 0.37], [0.59, 0.25], [0.38, 0.28], [0.2, 0.29], [0, 0.48]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
  },
]

export const TOTAL_STARS = CONSTELLATIONS.reduce((n, c) => n + c.stars.length, 0)

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
const TWINKLE_COLOR = '#8fd8ff'
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
}

const unitLine = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)
const ringGeo = new THREE.RingGeometry(0.78, 1, 40)

/** One constellation drawn into a screen box: dim places for every star, lit stars and growing lines. */
class ConstellationView {
  constructor(def, parent, glow) {
    this.def = def
    this.group = new THREE.Group()
    parent.add(this.group)
    this.pts = def.shape.map(() => new THREE.Vector2())
    this.size = 10
    this.litAt = def.stars.map(() => -1) // time each star was lit (-1: not yet)
    this.twinkles = [] // { u, v, at } bonus sparkles from gems
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
      mesh.visible = false
      this.group.add(mesh)
      return { a, b, mesh }
    })
    this.next = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }))
    this.next.renderOrder = 4
    this.group.add(this.next)
    this.twinkleSprites = []
    this.glow = glow
    this.highlight = 0
  }

  /** Fit the shape inside box `r` ({ x, y, w, h } in GL pixels, y up), keeping its proportions. */
  place(r) {
    const pad = Math.min(r.w, r.h) * 0.16
    const w = r.w - pad * 2
    const h = r.h - pad * 2
    const a = this.def.aspect
    const fw = Math.min(w, h * a)
    const fh = fw / a
    const ox = r.x + pad + (w - fw) / 2
    const oy = r.y + pad + (h - fh) / 2
    const span = Math.max(fw, fh)
    this.def.shape.forEach(([u, v], i) => this.pts[i].set(ox + u * span, oy + fh - v * span))
    this.size = Math.max(9, Math.min(r.w, r.h) * 0.1)
    this.box = r
  }

  /** The next star waiting to be lit. */
  get lit() {
    return this.litAt.filter((t) => t >= 0).length
  }

  addTwinkle(now) {
    // Away from the constellation's own stars, so it never hides the shape
    const r = this.box
    let best = null
    for (let k = 0; k < 12; k++) {
      const u = 0.1 + Math.random() * 0.8
      const v = 0.1 + Math.random() * 0.8
      const x = r.x + u * r.w
      const y = r.y + v * r.h
      const d = Math.min(...this.pts.map((p) => Math.hypot(p.x - x, p.y - y)), ...this.twinkles.map((t) => Math.hypot(r.x + t.u * r.w - x, r.y + t.v * r.h - y)))
      if (!best || d > best.d) best = { u, v, d }
    }
    return this.pushTwinkle({ u: best.u, v: best.v, at: now })
  }

  pushTwinkle(t) {
    this.twinkles.push(t)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: TWINKLE_COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    s.renderOrder = 2
    this.group.add(s)
    this.twinkleSprites.push(s)
    return t
  }

  twinklePos(t, out) {
    return out.set(this.box.x + t.u * this.box.w, this.box.y + t.v * this.box.h)
  }

  update(now, { showNext = true, still = false } = {}) {
    const s = this.size
    const glowBoost = 1 + this.highlight * 0.35
    this.stars.forEach((st, i) => {
      const p = this.pts[i]
      const big = this.def.big?.[i] || 1
      const at = this.litAt[i]
      const k = at < 0 ? 0 : still ? 1 : ease((now - at) / 0.45)
      st.core.position.set(p.x, p.y, 0)
      st.halo.position.set(p.x, p.y, 0)
      // Unlit: a small dim dot showing where the star belongs. Lit: a warm star with a soft halo.
      st.core.scale.setScalar(s * big * (0.95 + 0.75 * k))
      st.core.material.opacity = 0.5 + 0.5 * k
      st.core.material.color.copy(st.color).lerp(WHITE, 0.4 + 0.6 * (1 - k))
      st.halo.scale.setScalar(s * big * 3 * k * glowBoost)
      st.halo.material.opacity = 0.75 * k
    })
    for (const line of this.lines) {
      const ta = this.litAt[line.a]
      const tb = this.litAt[line.b]
      if (ta < 0 || tb < 0) {
        line.mesh.visible = false
        continue
      }
      // The line grows out from the star lit first toward the one just lit
      const [from, to] = ta <= tb ? [line.a, line.b] : [line.b, line.a]
      const start = Math.max(ta, tb)
      const k = still ? 1 : ease((now - start) / 0.55)
      const a = this.pts[from]
      const b = this.pts[to]
      const len = a.distanceTo(b)
      line.mesh.visible = k > 0
      line.mesh.position.set(a.x, a.y, 0)
      line.mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x)
      line.mesh.scale.set(Math.max(0.001, len * k), Math.max(1.6, s * 0.24), 1)
      line.mesh.material.opacity = 0.7 + 0.3 * this.highlight
    }
    const n = this.lit
    this.next.visible = showNext && n < this.pts.length
    if (this.next.visible) {
      const p = this.pts[n]
      this.next.position.set(p.x, p.y, 0)
      this.next.scale.setScalar(s * 1.25)
    }
    this.twinkles.forEach((t, i) => {
      const sp = this.twinkleSprites[i]
      this.twinklePos(t, sp.position)
      const k = still ? 1 : ease((now - t.at) / 0.5)
      sp.scale.setScalar(s * 1.6 * k)
      sp.material.opacity = 0.8 * k
    })
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
    this.scene.add(this.panelRoot, this.finaleRoot)
    this.backdrop = new Backdrop(this.panelRoot, '#0d0833', 0.62, '#b9a8ff')
    this.view = null
    this.index = -1
    this.claimed = 0 // stars promised to the panel, including those still flying up
    this.flights = []
    this.done = [] // { def, litAt, twinkles } for each finished constellation
    this.panelEl = null
    this.finale = null
    this.panelRoot.visible = false
    this.w = 1
    this.h = 1
    this.tmp = new THREE.Vector2()
  }

  get def() {
    return CONSTELLATIONS[this.index]
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
    if (this.view && this.panelEl) {
      const r = this.rectOf(this.panelEl)
      this.backdrop.place(r)
      // The bottom strip is kept for the constellation's name
      this.view.place({ x: r.x, y: r.y + r.h * 0.2, w: r.w, h: r.h * 0.8 })
    }
    if (this.finale) {
      this.finale.backdrop.place({ x: -400, y: -400, w: this.w + 800, h: this.h + 800 }) // corners well off screen
      this.finale.views.forEach((v, i) => {
        const r = this.rectOf(this.finale.cells[i])
        v.place({ x: r.x, y: r.y + r.h * 0.22, w: r.w, h: r.h * 0.78 })
      })
    }
  }

  /** Start building constellation `index` in the panel box `el`. */
  begin(index, el) {
    this.clearPanel()
    this.index = index
    this.panelEl = el
    this.claimed = 0
    this.view = new ConstellationView(this.def, this.panelRoot, this.glow)
    this.panelRoot.visible = true
    this.layout()
  }

  clearPanel() {
    this.view?.dispose()
    this.view = null
    for (const f of this.flights) this.scene.remove(f.sprite)
    this.flights = []
  }

  /** Everything back to the start of a trip. */
  reset() {
    this.clearPanel()
    this.closeFinale()
    this.done = []
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

  /** A caught gem floats up as a small blue twinkle beside the constellation (at most six). */
  twinkle(x, y) {
    const view = this.view
    if (!view || view.twinkles.length >= 6) return false
    const t = view.addTwinkle(Infinity) // its place is kept now; it shows when the flight lands
    this.fly(x, y, new THREE.Color(TWINKLE_COLOR), (out) => view.twinklePos(t, out), () => (t.at = this.time), true)
    return true
  }

  fly(x, y, color, target, land, twinkle = false) {
    if (this.reducedMotion) {
      target(this.tmp)
      land()
      return
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    sprite.renderOrder = 6
    this.scene.add(sprite)
    this.flights.push({ sprite, from: new THREE.Vector2(x, this.h - y), target, land, t: 0, twinkle, view: this.view })
  }

  land(i, data) {
    const view = this.view
    view.litAt[i] = this.time
    this.onLit?.(i + 1, this.total, data)
    if (view.lit === this.total) {
      // Let the last line finish drawing before the name is spoken
      const def = this.def
      setTimeout(() => {
        if (this.view !== view) return
        this.done.push({ def, litAt: [...view.litAt], twinkles: view.twinkles.map((t) => ({ u: t.u, v: t.v })) })
        this.onComplete?.(def, this.index)
      }, this.reducedMotion ? 300 : 900)
    }
  }

  update(dt) {
    this.time += dt
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k]
      if (f.view !== this.view) {
        this.scene.remove(f.sprite)
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
        this.scene.remove(f.sprite)
        f.sprite.material.dispose()
        this.flights.splice(k, 1)
        f.land()
      }
    }
    this.view?.update(this.time, { still: this.reducedMotion })
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
      v.litAt = d.def.stars.map((_, k) => this.time + 0.4 + i * 0.5 + k * 0.08)
      d.twinkles.forEach((t) => v.pushTwinkle({ ...t, at: this.time + 0.6 + i * 0.5 }))
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
    this.finaleRoot.clear()
    this.finale = null
  }

  render(renderer) {
    if (!this.view && !this.finale && !this.flights.length) return
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
  }
}
