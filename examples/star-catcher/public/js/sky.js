import * as THREE from 'three'
import { makeGlowTexture } from './effects.js'

/**
 * Star pictures that come alive. Each is drawn in a 0–1 box with y pointing down, facing right.
 * `stars` light in order as they are caught, going round the animal's outline, so its shape grows
 * star by star. `loops` are the outlines (star indices and a body colour): their edges are the
 * lines, and once the picture wakes they fill in as a chunky, glowing body. `extra` lines are
 * strands outside a loop (a cat's tail). `face` puts eyes, a smile and cheeks at [u, v], moving
 * with star `follow`; `r` is the eye size. `pose(t, i, hop, [u, v], out)` writes star i's offset
 * (box units, y down) at time t; `hop` (0–1) is the trick a tap sets off. `speed` is how fast it
 * travels (picture widths a second); `voice` names its sound in audio.js.
 */
export const CREATURES = [
  {
    id: 'bear',
    voice: 'bear',
    speed: 0.22,
    // rump, back, shoulder, ear, head, nose, chin, front paw ×2, belly, back paw ×2
    stars: [[0.04, 0.36], [0.33, 0.17], [0.6, 0.14], [0.7, 0], [0.82, 0.08], [1, 0.32], [0.86, 0.5], [0.84, 0.95], [0.64, 0.95], [0.48, 0.66], [0.34, 0.95], [0.12, 0.95]],
    loops: [[[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], '#ffaa5e']],
    face: { at: [0.83, 0.27], follow: 4, r: 0.042 },
    pose(t, i, hop, uv, o) {
      const w = t * 5
      const jump = Math.sin(Math.PI * hop)
      o[0] = 0
      o[1] = -jump * 0.35
      if (i === 7 || i === 8) {
        o[0] = Math.sin(w) * 0.08
        o[1] -= Math.max(0, Math.cos(w)) * 0.07 + jump * 0.08
      } else if (i === 10 || i === 11) {
        o[0] = -Math.sin(w) * 0.08
        o[1] -= Math.max(0, -Math.cos(w)) * 0.07 + jump * 0.08
      } else {
        o[1] -= Math.abs(Math.sin(w)) * 0.03
        if (i >= 3 && i <= 6) o[1] += Math.sin(w * 2) * 0.015 - jump * 0.06
      }
    },
  },
  {
    id: 'fish',
    voice: 'fish',
    speed: 0.32,
    // body: tail joint, back, fin tip, head top, nose, chin, belly, tail joint; tail fin: top, notch, bottom
    stars: [[0.26, 0.42], [0.42, 0.2], [0.52, 0.02], [0.72, 0.16], [1, 0.5], [0.76, 0.84], [0.44, 0.84], [0.26, 0.6], [0, 0.12], [0.1, 0.5], [0, 0.88]],
    loops: [[[0, 1, 2, 3, 4, 5, 6, 7], '#5fc2ff'], [[0, 8, 9, 10, 7], '#9fa8ff']],
    face: { at: [0.76, 0.44], follow: 4, r: 0.045 },
    pose(t, i, hop, [u], o) {
      const amp = (1 - u) ** 2 * 0.2
      o[0] = 0
      o[1] = Math.sin(t * 6 - u * 3) * amp + Math.sin(t * 1.4) * 0.05 - Math.sin(Math.PI * hop) * 0.45
    },
  },
  {
    id: 'bird',
    voice: 'bird',
    speed: 0.45,
    // tail ×2, belly, chest, beak (low, tip, high), head top, back, wing tip, wing root
    stars: [[0, 0.3], [0.06, 0.62], [0.42, 0.9], [0.72, 0.8], [0.86, 0.58], [1, 0.5], [0.86, 0.42], [0.72, 0.24], [0.5, 0.42], [0.34, 0], [0.22, 0.48]],
    loops: [[[0, 1, 2, 3, 4, 6, 7, 8, 10], '#6fe3b0'], [[4, 5, 6], '#ffb347'], [[8, 9, 10], '#b8f5d8']],
    colors: { 5: '#ffc27a' },
    face: { at: [0.7, 0.46], follow: 7, r: 0.042 },
    pose(t, i, hop, uv, o) {
      const f = (1 - Math.cos(t * 7)) * 0.5
      const loop = Math.PI * 2 * hop
      o[0] = Math.sin(loop) * 0.3
      o[1] = -Math.sin(t * 7) * 0.03 - (1 - Math.cos(loop)) * 0.25
      // The wing beats from high above down to level with the back, never folding into the body
      if (i === 9) o[1] += f * 0.3
      if (i === 8 || i === 10) o[1] += f * 0.04
    },
  },
  {
    id: 'bunny',
    voice: 'bunny',
    speed: 0.3,
    // tail, back, head back, ear tip, between the ears, ear tip, forehead, nose, chin, front paw, tummy, back paw
    stars: [[0, 0.66], [0.18, 0.42], [0.5, 0.34], [0.44, 0], [0.6, 0.28], [0.74, 0], [0.76, 0.3], [0.96, 0.5], [0.82, 0.64], [0.82, 0.96], [0.52, 0.86], [0.14, 0.96]],
    loops: [[[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], '#ffc0e0']],
    colors: { 0: '#ffffff' },
    face: { at: [0.76, 0.46], follow: 6, r: 0.045 },
    pose(t, i, hop, uv, o) {
      const air = Math.max(0, Math.sin(t * 3.4))
      o[0] = 0
      o[1] = -air * 0.22 - Math.sin(Math.PI * hop) * 0.45
      if (i === 3 || i === 5) o[0] -= air * 0.08 + hop * 0.05
      if (i === 11) o[0] -= air * 0.08
      if (i === 9) o[0] += air * 0.06
    },
  },
  {
    id: 'butterfly',
    voice: 'butterfly',
    speed: 0.28,
    symmetric: true,
    // head, tail, wing tips (upper, lower) left then right, antennae, the pinch between each pair of wings
    stars: [[0.5, 0.2], [0.5, 0.82], [0, 0], [0.14, 1], [1, 0], [0.86, 1], [0.38, 0], [0.62, 0], [0.24, 0.56], [0.76, 0.56]],
    loops: [[[0, 2, 8, 3, 1], '#ff8fc7'], [[0, 4, 9, 5, 1], '#7cc6fe']],
    extra: [[0, 1], [0, 6], [0, 7]],
    face: { at: [0.5, 0.3], follow: 0, r: 0.045 },
    pose(t, i, hop, [u], o) {
      const s = 0.78 + 0.22 * Math.cos(t * (6 + hop * 8))
      o[0] = (i >= 2 && i <= 5) || i >= 8 ? (u - 0.5) * (s - 1) : 0
      o[1] = Math.sin(t * 2.2) * 0.07 - Math.sin(Math.PI * hop) * 0.35
    },
  },
  {
    id: 'cat',
    voice: 'cat',
    speed: 0.12,
    // ear, head top, ear, cheek, back, haunch, front paw, chest, cheek, tail ×2
    stars: [[0.06, 0], [0.29, 0.1], [0.52, 0], [0.56, 0.32], [0.72, 0.6], [0.8, 0.96], [0.2, 0.96], [0.16, 0.56], [0.02, 0.32], [0.96, 0.74], [1, 0.32]],
    loops: [[[0, 1, 2, 3, 4, 5, 6, 7, 8], '#ffcf3f']],
    extra: [[5, 9], [9, 10]],
    face: { at: [0.29, 0.24], follow: 1, r: 0.05 },
    pose(t, i, hop, uv, o) {
      const jump = Math.sin(Math.PI * hop)
      o[0] = 0
      o[1] = -jump * 0.4
      if (i <= 3 || i === 8) o[0] = Math.sin(t * 1.1) * 0.02
      if (i === 10) {
        o[0] = Math.sin(t * 2.4) * 0.12
        o[1] += Math.cos(t * 2.4) * 0.08 - jump * 0.15
      }
      if (i === 9) o[0] = Math.sin(t * 2.4 - 0.8) * 0.04
    },
  },
]

// Normalise each shape once (keeping its true proportions), list its lines and triangulate its body.
for (const c of CREATURES) {
  const xs = c.stars.map((q) => q[0])
  const ys = c.stars.map((q) => q[1])
  const mx = Math.min(...xs)
  const my = Math.min(...ys)
  const s = Math.max(Math.max(...xs) - mx, Math.max(...ys) - my)
  c.shape = c.stars.map(([x, y]) => [(x - mx) / s, (y - my) / s])
  c.aspect = (Math.max(...xs) - mx) / (Math.max(...ys) - my)
  const seen = new Set()
  c.lines = []
  const edge = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(k)) return
    seen.add(k)
    c.lines.push([a, b])
  }
  for (const [loop] of c.loops) loop.forEach((a, k) => edge(a, loop[(k + 1) % loop.length]))
  for (const [a, b] of c.extra || []) edge(a, b)
  c.tris = c.loops.map(([loop]) => THREE.ShapeUtils.triangulateShape(loop.map((i) => new THREE.Vector2(c.shape[i][0], -c.shape[i][1])), []).flat())
}

/** Five pictures for a trip, one per planet, never starting with the same one twice in a row. */
let lastFirst = null
function planTrip() {
  for (;;) {
    const order = CREATURES.map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c).slice(0, 5)
    if (order[0] !== lastFirst) {
      lastFirst = order[0]
      return order
    }
  }
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3)
/** Overshoots a little and settles: a bouncy arrival. */
const easeBack = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2)
const LIT_COLOR = '#fff1b8'
const LINE_COLOR = '#ffe4a0'
const OUTLINE = '#fff6dc'
const WHITE = new THREE.Color('#ffffff')

const unitLine = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)
const unitCircle = new THREE.CircleGeometry(1, 24)
const smileArc = new THREE.RingGeometry(0.72, 1, 20, 1, Math.PI * 1.15, Math.PI * 0.7)
const popRing = new THREE.RingGeometry(0.8, 1, 32)
const shapeGeo = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))))
const pom = new THREE.CircleGeometry(0.22, 16)
/** Accessories for repeat friends, in units of the eye size (y up from the top of the head). */
const WEAR = {
  hat: [[shapeGeo([[-0.6, 0], [0.6, 0], [0.1, 1.5]]), '#ff6fae'], [shapeGeo([[-0.6, 0], [0.6, 0], [0.55, 0.2], [-0.55, 0.2]]), '#ffe066'], [pom.clone().translate(0.1, 1.55, 0), '#ffffff']],
  bow: [[shapeGeo([[0, 0.3], [-0.85, 0.75], [-0.85, -0.15]]), '#ff5f8f'], [shapeGeo([[0, 0.3], [0.85, 0.75], [0.85, -0.15]]), '#ff5f8f'], [pom.clone().translate(0, 0.3, 0), '#ffd1e0']],
  crown: [[shapeGeo([[-0.7, 0], [0.7, 0], [0.7, 0.9], [0.35, 0.45], [0, 1], [-0.35, 0.45], [-0.7, 0.9]]), '#ffd23f'], [pom.clone().scale(0.6, 0.6, 1).translate(0, 0.35, 0), '#ff6fae']],
}
const poseOut = [0, 0]
const FIELD_FAINT = 0.42 // how strongly the picture waiting in the play field shows
const basic = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, ...extra })

/**
 * One star picture drawn into a screen box. While it is being caught: faint places for every star,
 * lit stars with soft halos, and thin lines growing between them. Awake (`amount` 0 → 1): a chunky
 * filled body with a thick outline and a face, every star following the pose.
 */
class PictureView {
  constructor(def, parent, glow, look = null) {
    this.def = def
    this.look = look
    this.group = new THREE.Group()
    parent.add(this.group)
    this.base = def.shape.map(() => new THREE.Vector2())
    this.pts = def.shape.map(() => new THREE.Vector2())
    this.size = 10
    this.span = 1
    this.cx = 0
    this.litAt = def.stars.map(() => -1) // time each star was lit (-1: not yet)
    this.litCount = 0
    this.near = def.shape.map(() => Infinity) // how far each star is from its closest neighbour, in pixels
    this.alive = false
    this.t = 0 // pose time
    this.hop = 0 // the trick's progress (0: none)
    this.amount = 0 // how awake it looks (body, outline and face ease in)
    this.flip = 1 // -1 faces left (eased through 0 when it turns)
    this.highlight = 0
    this.opacity = 1
    this.blink = 2 + Math.random() * 3
    this.stars = def.shape.map((_, i) => {
      const color = new THREE.Color(def.colors?.[i] || LIT_COLOR)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }))
      // A round joint, so the thick awake outline has no gaps at its corners
      const joint = new THREE.Mesh(unitCircle, basic(OUTLINE, 0))
      halo.renderOrder = 5
      core.renderOrder = 6
      joint.renderOrder = 4
      this.group.add(halo, core, joint)
      return { halo, core, joint, color }
    })
    // The body: one mesh per loop, triangulated once, its corners following the stars
    this.fills = def.loops.map(([loop, base], k) => {
      const color = look?.colors?.[k] || base
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array(def.stars.length * 3)
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setIndex(def.tris[k].map((j) => loop[j]))
      const mesh = new THREE.Mesh(geo, basic(color, 0, { side: THREE.DoubleSide }))
      // Later loops (a wing, a beak) sit over the body
      mesh.renderOrder = 2 + k * 0.01
      mesh.frustumCulled = false
      mesh.visible = false
      // A soft glow of the same colour around the body
      const glowMesh = new THREE.Mesh(geo, basic(color, 0, { side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))
      glowMesh.renderOrder = 1
      glowMesh.frustumCulled = false
      glowMesh.visible = false
      this.group.add(glowMesh, mesh)
      return { mesh, glowMesh, pos }
    })
    this.lines = def.lines.map(([a, b]) => {
      const mesh = new THREE.Mesh(unitLine, basic(LINE_COLOR, 0.75))
      mesh.renderOrder = 3
      // A faint ghost of the whole picture, so the child sees something is being drawn
      const ghost = new THREE.Mesh(unitLine, basic('#c9bbff', 0.2))
      ghost.renderOrder = 2
      mesh.visible = false
      this.group.add(ghost, mesh)
      return { a, b, mesh, ghost }
    })
    // The face: two eyes with a shine, a smile and pink cheeks
    const part = (geo, color, order) => {
      const m = new THREE.Mesh(geo, basic(color, 0))
      m.renderOrder = order
      m.visible = false
      this.group.add(m)
      return m
    }
    this.face = def.face && {
      eyes: [part(unitCircle, '#2a1a5e', 7), part(unitCircle, '#2a1a5e', 7)],
      shines: [part(unitCircle, '#ffffff', 8), part(unitCircle, '#ffffff', 8)],
      cheeks: [part(unitCircle, '#ff7fb0', 7), part(unitCircle, '#ff7fb0', 7)],
      smile: part(smileArc, '#2a1a5e', 7),
      base: new THREE.Vector2(),
      // A repeat friend's party hat, bow or crown
      wear: look?.wear ? [...WEAR[look.wear].map(([geo, color]) => part(geo, color, 7.5))] : [],
    }
  }

  /** Fit the picture inside box `r` ({ x, y, w, h } in GL pixels, y up), keeping its proportions. */
  place(r) {
    this.size = Math.min(26, Math.max(9, Math.min(r.w, r.h) * 0.09))
    const pad = Math.min(r.w, r.h) * 0.1
    const w = r.w - pad * 2
    const h = r.h - pad * 2
    const a = this.def.aspect
    const fw = Math.min(w, h * a)
    const fh = fw / a
    const ox = r.x + pad + (w - fw) / 2
    const oy = r.y + pad + (h - fh) / 2
    this.span = Math.max(fw, fh)
    this.cx = ox + fw / 2
    this.def.shape.forEach(([u, v], i) => this.base[i].set(ox + u * this.span, oy + fh - v * this.span))
    if (this.face) this.face.base.set(ox + this.def.face.at[0] * this.span, oy + fh - this.def.face.at[1] * this.span)
    this.base.forEach((p, i) => (this.near[i] = Math.min(...this.base.map((q, j) => (j === i ? Infinity : p.distanceTo(q))))))
  }

  get lit() {
    return this.litCount
  }

  light(i, at) {
    if (this.litAt[i] < 0) this.litCount++
    this.litAt[i] = at
  }

  /** Star i's pose offset in pixels (y up), scaled by how awake the picture is. */
  offset(i, k) {
    if (k <= 0) return poseOut.fill(0)
    this.def.pose(this.t, i, this.hop, this.def.shape[i], poseOut)
    poseOut[0] *= this.span * k
    poseOut[1] *= -this.span * k
    return poseOut
  }

  update(now, still = false, dt = 0) {
    const def = this.def
    const s = this.size
    const awake = this.alive ? this.amount : 0
    const fade = this.opacity
    this.pts.forEach((p, i) => {
      const b = this.base[i]
      const o = this.offset(i, awake)
      p.set(this.cx + this.flip * (b.x + o[0] - this.cx), b.y + o[1])
    })
    const glowBoost = 1 + this.highlight * 0.5
    this.stars.forEach((st, i) => {
      const p = this.pts[i]
      const at = this.litAt[i]
      const k = at < 0 ? 0 : still ? 1 : ease((now - at) / 0.45)
      // A fresh star clicks in with a pop (bigger, then settling)
      const pop = at < 0 || still ? 0 : Math.max(0, 1 - (now - at) / 0.5) * Math.sin(Math.min(1, (now - at) / 0.5) * Math.PI)
      st.core.position.set(p.x, p.y, 0)
      st.halo.position.set(p.x, p.y, 0)
      const gap = this.near[i]
      st.core.scale.setScalar(Math.min(s * (0.95 + 0.75 * k + 1.2 * pop) * (1 - 0.3 * awake), Math.max(gap * 0.9, 8)))
      st.core.material.opacity = (0.5 + 0.5 * k) * fade
      st.core.material.color.copy(st.color).lerp(WHITE, 0.4 + 0.6 * (1 - k))
      st.halo.scale.setScalar(Math.min(s * 3 * k * (glowBoost + pop) * (1 - 0.35 * awake), Math.max(gap * 1.3, 6) * k))
      st.halo.material.opacity = 0.75 * k * fade
    })
    // The awake body: a strong fill, a soft glow and a thick outline
    const thick = Math.max(1.6, s * 0.2) + awake * this.span * 0.035
    for (const f of this.fills) {
      const show = awake > 0.001
      f.mesh.visible = f.glowMesh.visible = show
      if (!show) continue
      this.pts.forEach((p, i) => f.pos.set([p.x, p.y, 0], i * 3))
      f.mesh.geometry.attributes.position.needsUpdate = true
      f.mesh.material.opacity = Math.min(1, awake * 1.2) * 0.92 * fade
      f.glowMesh.material.opacity = awake * (0.35 + 0.3 * this.highlight) * fade
    }
    this.stars.forEach((st, i) => {
      st.joint.visible = awake > 0.001
      if (!st.joint.visible) return
      st.joint.position.set(this.pts[i].x, this.pts[i].y, 0)
      st.joint.scale.setScalar(thick / 2)
      st.joint.material.opacity = awake * fade
    })
    const total = this.pts.length
    const ghost = (0.22 - 0.12 * (this.litCount / total)) * fade * (1 - awake)
    for (const line of this.lines) {
      line.ghost.material.opacity = ghost
      const a = this.pts[line.a]
      const b = this.pts[line.b]
      const d = a.distanceTo(b)
      const gap = Math.min(d * 0.22, s * 0.32) * (1 - awake)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      line.ghost.position.set(a.x + Math.cos(ang) * gap, a.y + Math.sin(ang) * gap, 0)
      line.ghost.rotation.z = ang
      line.ghost.scale.set(Math.max(0.001, d - gap * 2), Math.max(1.2, s * 0.14), 1)
      const ta = this.litAt[line.a]
      const tb = this.litAt[line.b]
      if (ta < 0 || tb < 0) {
        line.mesh.visible = false
        continue
      }
      // The line grows out from the star lit first toward the one just lit
      const [from, to] = ta <= tb ? [line.a, line.b] : [line.b, line.a]
      const k = still ? 1 : ease((now - Math.max(ta, tb)) / 0.55)
      const f = this.pts[from]
      const t = this.pts[to]
      const an = Math.atan2(t.y - f.y, t.x - f.x)
      line.mesh.visible = k > 0
      line.mesh.position.set(f.x + Math.cos(an) * gap, f.y + Math.sin(an) * gap, 0)
      line.mesh.rotation.z = an
      line.mesh.scale.set(Math.max(0.001, (f.distanceTo(t) - gap * 2) * k), thick, 1)
      line.mesh.material.color.set(awake > 0.5 ? OUTLINE : LINE_COLOR)
      line.mesh.material.opacity = (0.7 + 0.3 * Math.max(this.highlight, awake)) * fade
    }
    this.updateFace(awake, fade, dt)
  }

  updateFace(awake, fade, dt) {
    const face = this.face
    if (!face) return
    const show = awake > 0.05
    for (const m of [...face.eyes, ...face.shines, ...face.cheeks, face.smile, ...face.wear]) m.visible = show
    if (!show) return
    const { follow, r } = this.def.face
    const o = this.offset(follow, awake)
    const cx = this.cx + this.flip * (face.base.x + o[0] - this.cx)
    const cy = face.base.y + o[1]
    const er = this.span * r * Math.min(1, awake * 1.4)
    // A blink now and then (a quick squeeze, never a flash); wide eyes during a trick
    this.blink -= dt
    if (this.blink < -0.15) this.blink = 2.5 + Math.random() * 3
    const lid = this.blink < 0 ? 0.15 : 1
    const wide = 1 + 0.25 * Math.sin(Math.PI * this.hop)
    const gap = er * 1.7
    const look = this.flip * er * 0.35 // eyes glance the way it faces
    face.eyes.forEach((m, k) => {
      m.position.set(cx + (k ? gap : -gap) + look, cy, 0)
      m.scale.set(er * wide, er * lid * wide, 1)
      m.material.opacity = fade
    })
    face.shines.forEach((m, k) => {
      m.position.set(cx + (k ? gap : -gap) + look - er * 0.3, cy + er * 0.35, 0)
      m.scale.setScalar(er * 0.38 * (lid < 1 ? 0 : 1))
      m.material.opacity = fade
    })
    face.cheeks.forEach((m, k) => {
      m.position.set(cx + (k ? gap * 1.9 : -gap * 1.9) + look, cy - er * 1.5, 0)
      m.scale.set(er * 0.75, er * 0.5, 1)
      m.material.opacity = 0.55 * fade
    })
    // The accessory sits on top of the head, tipped the way it faces
    for (const m of face.wear) {
      m.visible = show
      m.position.set(cx + look * 1.5, cy + er * 2.6, 0)
      m.scale.set(er * 3.4 * this.flip, er * 3.4, 1)
      m.material.opacity = fade
    }
    face.smile.position.set(cx + look, cy - er * 0.9, 0)
    face.smile.scale.setScalar(er * (1.1 + 0.4 * Math.sin(Math.PI * this.hop)))
    face.smile.material.opacity = fade
  }

  dispose() {
    this.group.parent?.remove(this.group)
    this.group.traverse((o) => o.material?.dispose())
    for (const f of this.fills) f.mesh.geometry.dispose()
  }
}

/** Colours for repeat friends (the second bear of a session is not the same bear). */
const REPEAT_COLORS = ['#b79bff', '#7fd8ff', '#ffd84a', '#8fe8a0', '#ff9fb0', '#ffb36b', '#9fb4ff']
const ACCESSORIES = ['hat', 'bow', 'crown']
const MAX_ZOO = 12 // the sky zoo keeps this many friends from the session

/**
 * The picture being caught on this leg (waiting faintly in the middle of the play field), the
 * picture that wakes up there and then joins the parade behind Kitty's rocket, and the sky zoo at
 * home where every friend of the session plays. Drawn as a second, flat pass over the game in
 * screen pixels; boxes follow DOM placeholders, so CSS owns the layout in every orientation.
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
    this.actorRoot = new THREE.Group()
    this.scene.add(this.actorRoot)
    this.view = null
    this.look = null // the colours and accessory the picture being caught will wake up with
    this.index = -1
    this.claimed = 0 // stars promised to the picture, including those still flying up
    this.flights = []
    this.pops = [] // rings that spread where a star clicks into the picture
    this.actors = [] // awake pictures: on the stage, in the parade, or in the zoo at home
    this.collection = [] // every friend made this session (kept across trips): { def, look }
    this.trip = planTrip()
    this.leader = new THREE.Vector2(-100, -100) // the rocket's middle, GL pixels: the parade follows its path
    this.leaderR = 60 // how far friends keep from the rocket, pixels
    this.leaderDir = -1 // which way the rocket last flew (-1 left, 1 right)
    this.path = [] // the rocket's recent path, newest first, a point every few pixels
    this.hazards = [] // catchable stars (GL pixels): parade friends fade and shrink out of their way
    this.treats = [] // sparkles fed to the zoo friends at home
    this.onEat = null
    this.w = 1
    this.h = 1
  }

  get def() {
    return this.trip[this.index]
  }

  get total() {
    return this.def ? this.def.stars.length : 0
  }

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
    if (this.view && this.fieldEl) this.view.place(this.fieldRect())
    for (const a of this.actors) if (a.el) a.bounds = this.rectOf(a.el)
  }

  /**
   * Start catching picture `index` of the trip. It waits faintly in the middle of the play field
   * (`field`, the stage box): caught stars swoop into it, right where the child is looking, and
   * that is where it wakes up. A friend made before this session wakes in new colours with a hat,
   * a bow or a crown.
   */
  begin(index, field) {
    this.clearPicture()
    this.index = index
    this.fieldEl = field
    this.claimed = 0
    const seen = this.collection.filter((e) => e.def === this.def).length
    this.look = seen ? { colors: this.def.loops.map((_, k) => REPEAT_COLORS[(seen - 1 + k * 3 + CREATURES.indexOf(this.def)) % REPEAT_COLORS.length]), wear: ACCESSORIES[(seen - 1 + CREATURES.indexOf(this.def)) % ACCESSORIES.length] } : null
    this.view = new PictureView(this.def, this.actorRoot, this.glow, this.look)
    this.view.opacity = FIELD_FAINT
    this.layout()
  }

  /** The play-field picture's box: centred in the stage, as big as the picture will be awake. */
  fieldRect() {
    const b = this.rectOf(this.fieldEl)
    // Fits the stage with room left for hops and leaps
    const w = Math.min(b.w * 0.66, b.h * 0.85 * this.def.aspect)
    const h = w / this.def.aspect
    return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h }
  }

  clearPicture() {
    this.view?.dispose()
    this.view = null
    for (const f of this.flights) this.drop(f.sprite)
    this.flights = []
  }

  drop(obj) {
    this.scene.remove(obj)
    obj.material.dispose()
  }

  /** Everything back to the start of a trip (the session's collection of friends stays). */
  reset() {
    this.clearPicture()
    this.clearActors()
    for (const t of this.treats) this.drop(t.sprite)
    this.treats = []
    this.path = []
    for (const p of this.pops) this.drop(p.mesh)
    this.pops = []
    this.trip = planTrip()
    this.index = -1
    this.claimed = 0
  }

  clearActors() {
    for (const a of this.actors) a.view.dispose()
    this.actors = []
  }

  /** A caught star at screen point (x, y, CSS pixels) swoops up to light the next star; `delay` in seconds. */
  claim(x, y, color, delay = 0) {
    if (!this.view || this.full) return false
    const i = this.claimed++
    if (this.reducedMotion) {
      this.land(i)
      return true
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: color || this.view.stars[i].color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    sprite.renderOrder = 9
    sprite.visible = false
    this.scene.add(sprite)
    this.flights.push({ sprite, i, from: new THREE.Vector2(x, this.h - y), t: -delay / 0.55, view: this.view })
    return true
  }

  land(i) {
    const view = this.view
    view.light(i, this.time)
    // A ring spreads where it clicks in
    if (!this.reducedMotion) {
      const mesh = new THREE.Mesh(popRing, basic('#fff3c4', 0.9))
      mesh.renderOrder = 9
      mesh.position.set(view.pts[i].x, view.pts[i].y, 0)
      this.scene.add(mesh)
      this.pops.push({ mesh, t: 0, size: view.size })
    }
    this.onLit?.(view.lit, this.total)
    if (view.lit === this.total) {
      // Let the last line finish growing before the picture wakes
      const def = this.def
      setTimeout(() => this.view === view && this.onComplete?.(def), this.reducedMotion ? 300 : 650)
    }
  }

  /** The finished picture wakes up where it was drawn, on the stage box `el`. */
  wake(el) {
    const view = this.view
    if (!view) return null
    const r = this.fieldRect()
    this.view = null
    for (const f of this.flights) this.drop(f.sprite)
    this.flights = []
    view.alive = true
    const entry = { def: this.def, look: this.look }
    this.collection.push(entry)
    if (this.collection.length > MAX_ZOO) this.collection.shift()
    // A squash, then a bounce up to full size and colour
    const from = { x: r.x + r.w * 0.1, y: r.y, w: r.w * 0.8, h: r.h * 0.8 }
    const bounds = this.rectOf(el)
    const actor = this.actor(view, { mode: 'stage', el, bounds, w: r.w, h: r.h, x: r.x + r.w / 2, y: r.y + r.h / 2, from, grow: 0, entry })
    this.actors.push(actor)
    return actor
  }

  actor(view, extra) {
    return { view, def: view.def, el: null, bounds: null, w: 100, h: 100, x: 0, y: 0, vx: 1, vy: 0, from: null, grow: 1, hopT: -1, turn: 1, mode: 'zoo', near: 0, playIn: 3 + Math.random() * 4, ...extra }
  }

  /** Box size for a picture `width` px across (tall pictures are limited by their height instead). */
  sizeFor(def, width) {
    return def.aspect >= 1 ? { w: width, h: width / def.aspect } : { w: width * def.aspect, h: width }
  }

  /** The stage picture shrinks and joins the parade of friends following Kitty's rocket. */
  toParade() {
    const width = Math.min(130, Math.max(64, Math.min(this.w, this.h) * 0.13))
    for (const a of this.actors) {
      if (a.mode !== 'stage') continue
      a.mode = 'parade'
      a.el = null
      a.grow = 1
      const size = this.sizeFor(a.def, width)
      a.tw = size.w
      a.th = size.h
    }
  }

  /**
   * Home: every friend of the session (the newest MAX_ZOO) glides to its own spot
   * in the night sky inside `area` (above `kittyTop`), then plays. This trip's parade flies in; earlier friends are
   * already waiting there.
   */
  showZoo(area, kittyTop = null) {
    this.clearPicture()
    const box = this.rectOf(area)
    // Keep clear of Kitty resting in the corner (`kittyTop` is her rocket's top, CSS pixels)
    if (kittyTop != null && box.y < this.h - kittyTop) {
      const lift = this.h - kittyTop - box.y
      box.y += lift
      box.h = Math.max(box.h * 0.5, box.h - lift)
    }
    const parade = new Map(this.actors.map((a) => [a.entry, a]))
    this.actors = []
    const n = this.collection.length
    const cols = Math.min(n, box.w < box.h ? (n > 6 ? 3 : 2) : n > 6 ? 4 : 3)
    const rows = Math.ceil(n / cols)
    const width = Math.min(box.w / cols, (box.h / rows) * 1.2, 320) * 0.66
    this.collection.forEach((entry, i) => {
      const { def, look } = entry
      let a = parade.get(entry)
      if (!a) {
        const view = new PictureView(def, this.actorRoot, this.glow, look)
        def.stars.forEach((_, k) => view.light(k, this.time - 1))
        Object.assign(view, { alive: true, amount: 1, t: Math.random() * 10 })
        a = this.actor(view, { entry })
        const size = this.sizeFor(def, width * 0.3)
        Object.assign(a, size)
      }
      parade.delete(entry)
      const size = this.sizeFor(def, width * (0.9 + Math.random() * 0.2))
      const row = Math.floor(i / cols)
      const inRow = Math.min(cols, n - row * cols)
      const flyer = def.id === 'bird' || def.id === 'butterfly' || def.id === 'fish'
      // A loose grid (each row centred): every friend plays in its own cell, so nobody bumps into another
      const cw = box.w / inRow
      const ch = box.h / rows
      const cell = { x: box.x + (i % cols) * cw, y: box.y + box.h - (row + 1) * ch, w: cw, h: ch }
      if (!a.x && !a.y) Object.assign(a, { x: cell.x + cw / 2, y: cell.y + ch / 2 })
      Object.assign(a, {
        mode: 'zoo', el: null, bounds: cell, tw: size.w, th: size.h,
        home: { x: cell.x + cw / 2, y: cell.y + ch / 2 },
        settle: 1.2, vx: Math.random() < 0.5 ? -1 : 1, vy: flyer ? (Math.random() < 0.5 ? -0.25 : 0.25) : 0, turn: 1,
      })
      this.actors.push(a)
    })
    for (const a of parade.values()) a.view.dispose()
  }

  /** The awake picture under screen point (x, y, CSS pixels), or null. */
  actorAt(x, y) {
    const gy = this.h - y
    let best = null
    let bestD = Infinity
    for (const a of this.actors) {
      if (a.mode === 'parade') continue
      const d = Math.max(Math.abs(x - a.x) - a.w / 2, Math.abs(gy - a.y) - a.h / 2)
      if (d < 30 && d < bestD) [best, bestD] = [a, d]
    }
    return best
  }

  /** The picture on the stage, if one is awake there. */
  get star() {
    return this.actors.find((a) => a.mode === 'stage') || null
  }

  /** A tap sets off the picture's happy trick (a hop, a loop, a leap). Returns false while one is still playing. */
  trick(a) {
    a.view.highlight = 1
    if (a.hopT >= 0) return false
    a.hopT = 0
    return true
  }

  update(dt) {
    this.time += dt
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k]
      if (f.view !== this.view) {
        this.drop(f.sprite)
        this.flights.splice(k, 1)
        continue
      }
      f.t += dt / 0.7
      if (f.t < 0) continue
      f.sprite.visible = true
      const to = this.view.pts[f.i]
      const e = ease(f.t)
      // A swooping arc up to its place in the picture, shrinking as it arrives
      const cx = (f.from.x + to.x) / 2 + (f.from.x < to.x ? -1 : 1) * 80
      const cy = Math.max(f.from.y, to.y) + 50
      const u = 1 - e
      f.sprite.position.set(u * u * f.from.x + 2 * u * e * cx + e * e * to.x, u * u * f.from.y + 2 * u * e * cy + e * e * to.y, 1)
      f.sprite.scale.setScalar((this.view?.size || 10) * (4.2 - e * 2.4))
      if (f.t >= 1) {
        this.drop(f.sprite)
        this.flights.splice(k, 1)
        this.land(f.i)
      }
    }
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const p = this.pops[k]
      p.t += dt / 0.45
      p.mesh.scale.setScalar(p.size * (0.6 + 2.6 * ease(p.t)))
      p.mesh.material.opacity = 0.9 * (1 - p.t)
      if (p.t >= 1) {
        this.drop(p.mesh)
        this.pops.splice(k, 1)
      }
    }
    this.view?.update(this.time, this.reducedMotion, dt)
    this.updateTreats(dt)
    this.updateActors(dt)
  }

  /** Turns `a` to face `dir` unless it turned a moment ago (so nobody flickers back and forth). */
  face(a, dir) {
    if (dir === a.vx || a.turn > 0) return
    a.vx = dir
    a.turn = 1.2
  }

  updateActors(dt) {
    // Remember the rocket's path by distance, so the parade keeps even gaps however fast Kitty flies
    const head = this.path[0]
    if (!head || Math.hypot(head.x - this.leader.x, head.y - this.leader.y) > 4) {
      this.path.unshift({ x: this.leader.x, y: this.leader.y })
      if (this.path.length > 600) this.path.pop()
    }
    let paraded = 0
    for (let k = 0; k < this.actors.length; k++) {
      const a = this.actors[k]
      const v = a.view
      v.t += dt
      a.turn -= dt
      v.highlight = Math.max(0, v.highlight - dt * 0.8)
      if (a.hopT >= 0) {
        a.hopT += dt / 1.1
        if (a.hopT >= 1) a.hopT = -1
      }
      v.hop = a.hopT < 0 ? 0 : a.hopT
      if (a.tw) {
        // Growing or shrinking toward its size for the parade or the zoo
        const g = 1 - Math.exp(-dt * 4)
        a.w += (a.tw - a.w) * g
        a.h += (a.th - a.h) * g
      }
      a.growRect = null
      if (a.mode === 'stage' && a.grow < 1) {
        // Waking: a squash, then a bounce up to its full size
        a.grow = Math.min(1, a.grow + dt / (this.reducedMotion ? 0.2 : 0.85))
        const e = easeBack(a.grow)
        const tx = a.x - a.w / 2
        const ty = a.y - a.h / 2
        const lift = Math.sin(ease(a.grow) * Math.PI) * 80
        a.growRect = { x: a.from.x + (tx - a.from.x) * e, y: a.from.y + (ty - a.from.y) * e + lift, w: a.from.w + (a.w - a.from.w) * e, h: a.from.h + (a.h - a.from.h) * e }
        // The body pops in at once (a bare outline never shows), then the pose eases in
        v.amount = Math.max(0.7, ease(a.grow))
      } else {
        v.amount = Math.min(1, v.amount + dt * 1.5)
        if (a.mode === 'parade') {
          this.follow(a, paraded++, dt)
        } else {
          this.wander(a, dt)
        }
      }
    }
    this.spaceParade(dt)
    for (const a of this.actors) {
      const v = a.view
      let rect = a.growRect || { x: a.x - a.w / 2, y: a.y - a.h / 2, w: a.w, h: a.h }
      // A happy, springy breath: a little wider, then a little taller
      if (!this.reducedMotion && a.grow >= 1) {
        const b = Math.sin(v.t * 3.2) * 0.035
        rect = { x: rect.x - rect.w * b * 0.5, y: rect.y, w: rect.w * (1 + b), h: rect.h * (1 - b) }
      }
      // Turning is an instant flip with a little squash, so it never shows as a thin sliver
      if (!a.def.symmetric && v.flip !== a.vx) {
        v.flip = a.vx
        a.squash = 1
      }
      if (a.squash > 0) {
        a.squash = Math.max(0, a.squash - dt * 4)
        const q = Math.sin(a.squash * Math.PI) * 0.12
        rect = { x: rect.x + rect.w * q * 0.5, y: rect.y, w: rect.w * (1 - q), h: rect.h * (1 + q) }
      }
      // Parade friends fade and shrink while a star passes them; everyone else shows fully
      const show = a.mode === 'parade' ? 0.95 - 0.65 * a.near : 1
      v.opacity += (show - v.opacity) * Math.min(1, dt * 6)
      if (a.near > 0.01) {
        const q = 0.25 * a.near
        rect = { x: rect.x + rect.w * q * 0.5, y: rect.y + rect.h * q * 0.5, w: rect.w * (1 - q), h: rect.h * (1 - q) }
      }
      v.place(rect)
      v.update(this.time, this.reducedMotion, dt)
    }
  }

  /**
   * Keeps the whole parade apart: every pair of friends at least a body apart, everyone clear of
   * Kitty, and each friend sidestepping the stars falling past it, all settled together.
   */
  spaceParade(dt) {
    const parade = this.actors.filter((a) => a.mode === 'parade')
    if (!parade.length) return
    const size = (a) => Math.max(a.w, a.h)
    const apart = (a, x, y, min, share) => {
      const dx = a.x - x
      const dy = a.y - y
      const d = Math.hypot(dx, dy) || 0.01
      if (d >= min) return
      a.x += (dx / d) * (min - d) * share
      a.y += (dy / d) * (min - d) * share
    }
    // Sidestep stars passing by (first, so the spacing below has the last word)
    for (const a of parade) {
      for (const h of this.hazards) {
        const min = size(a) * 0.9
        const dx = a.x - h.x
        const dy = a.y - h.y
        const d = Math.hypot(dx, dy) || 0.01
        if (d >= min) continue
        const step = Math.min(min - d, 1500 * dt)
        a.x += (dx / d) * step
        a.y += (dy / d) * step
      }
    }
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < parade.length; i++) {
        for (let j = i + 1; j < parade.length; j++) {
          const a = parade[i]
          const b = parade[j]
          const min = (size(a) + size(b)) * 0.5
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d >= min) continue
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          // Each steps back half the overlap, away from the middle between them
          const dir = d > 0.01 ? [(a.x - b.x) / d, (a.y - b.y) / d] : [1, 0]
          a.x = mx + (dir[0] * min) / 2
          a.y = my + (dir[1] * min) / 2
          b.x = mx - (dir[0] * min) / 2
          b.y = my - (dir[1] * min) / 2
        }
        apart(parade[i], this.leader.x, this.leader.y, this.leaderR + size(parade[i]) * 0.5, 1)
      }
      for (const a of parade) {
        a.x = Math.min(Math.max(a.x, a.w / 2), this.w - a.w / 2)
        a.y = Math.min(Math.max(a.y, a.h / 2), this.h - a.h / 2)
      }
    }
  }

  /** The point `d` pixels back along the rocket's path (straight down past its end). */
  pathAt(d) {
    let prev = this.leader
    for (const p of this.path) {
      const step = Math.hypot(p.x - prev.x, p.y - prev.y)
      if (step >= d) return { x: prev.x + ((p.x - prev.x) * d) / step, y: prev.y + ((p.y - prev.y) * d) / step }
      d -= step
      prev = p
    }
    return { x: prev.x, y: prev.y - d }
  }

  /**
   * Friend `n` of the parade rides the rocket's path at an even gap behind the one ahead, always
   * below Kitty (or beside her, behind the way she last flew, when she is low in the sky).
   */
  follow(a, n, dt) {
    const size = Math.max(a.w, a.h)
    const gap = size * 0.95
    const p = this.pathAt(this.leaderR + size * 0.5 + n * gap)
    let tx = p.x
    let ty = Math.min(p.y, this.leader.y - this.leaderR - a.h * 0.35 - n * gap * 0.25)
    if (ty < a.h * 0.55) {
      const back = this.leaderDir || -1
      tx = this.leader.x - back * (this.leaderR + size * 0.6 + n * gap)
      ty = Math.max(a.h * 0.55, this.leader.y - this.leaderR * 0.4)
      // No room on that side: the other side then
      if (tx < a.w / 2 || tx > this.w - a.w / 2) tx = this.leader.x + back * (this.leaderR + size * 0.6 + n * gap)
    }
    tx = Math.min(Math.max(tx, a.w / 2), this.w - a.w / 2)
    ty = Math.min(Math.max(ty, a.h / 2), this.h - a.h / 2)
    const g = 1 - Math.exp(-dt * 6)
    const mx = (tx - a.x) * g
    a.x += mx
    a.y += (ty - a.y) * g
    if (Math.abs(mx) > 40 * dt) this.face(a, Math.sign(mx))
    // (spaceParade then keeps every friend apart, clear of Kitty and of passing stars)
    // A star coming near: the friend fades and shrinks out of its way, so the catch stays clear
    const reach = size * 1.1
    const near = this.hazards.some((h) => Math.abs(h.x - a.x) < reach && Math.abs(h.y - a.y) < reach)
    a.near += ((near ? 1 : 0) - a.near) * Math.min(1, dt * 8)
  }

  /** At home: a tap on empty sky drops a sparkle; the nearest friend hurries over and gobbles it. */
  feed(x, y) {
    const zoo = this.actors.filter((a) => a.mode === 'zoo')
    if (!zoo.length) return
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#fff3a0', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    sprite.renderOrder = 9
    sprite.scale.setScalar(44)
    this.scene.add(sprite)
    const t = { sprite, x, y: this.h - y, t: 0 }
    this.treats.push(t)
    let best = null
    for (const a of zoo) if (!a.chase && (!best || Math.hypot(a.x - t.x, a.y - t.y) < Math.hypot(best.x - t.x, best.y - t.y))) best = a
    if (best) best.chase = t
  }

  updateTreats(dt) {
    for (let k = this.treats.length - 1; k >= 0; k--) {
      const t = this.treats[k]
      t.t += dt
      t.y -= 30 * dt
      t.sprite.position.set(t.x + Math.sin(t.t * 3) * 6, t.y, 1)
      t.sprite.material.rotation = t.t
      t.sprite.scale.setScalar(44 * (1 + Math.sin(t.t * 5) * 0.08))
      if (t.eaten || t.t > 8) {
        this.drop(t.sprite)
        this.treats.splice(k, 1)
        for (const a of this.actors) if (a.chase === t) a.chase = null
      }
    }
  }

  /** Walking (swimming, flying) around its space on the stage or in the zoo, turning at the edges. */
  wander(a, dt) {
    if (a.chase) {
      // Off to gobble a sparkle
      const t = a.chase
      const dx = t.x - a.x
      const dy = t.y - a.y
      const d = Math.hypot(dx, dy)
      if (d < Math.max(a.w, a.h) * 0.35) {
        t.eaten = true
        a.chase = null
        a.settle = 1.6
        this.trick(a)
        this.onEat?.(a)
        return
      }
      const step = Math.min(d, Math.max(a.w, a.h) * 1.6 * dt)
      a.x += (dx / d) * step
      a.y += (dy / d) * step
      if (Math.abs(dx) > 8) this.face(a, Math.sign(dx))
      return
    }
    if (a.mode === 'zoo') {
      // Every now and then a friend does its trick all by itself
      a.playIn -= dt
      if (a.playIn <= 0) {
        a.playIn = 4 + Math.random() * 5
        this.trick(a)
      }
    }
    if (a.settle > 0) {
      // Gliding to its own spot in the zoo first
      a.settle -= dt
      const g = 1 - Math.exp(-dt * 3)
      a.x += (a.home.x - a.x) * g
      a.y += (a.home.y - a.y) * g
      return
    }
    a.x += a.vx * a.def.speed * a.w * dt * (a.mode === 'zoo' ? 0.5 : 1)
    a.y += a.vy * a.h * dt
    const b = a.bounds
    const minX = b.x + a.w / 2
    const maxX = Math.max(minX, b.x + b.w - a.w / 2)
    if (a.x < minX) {
      a.x = minX
      a.vx = 1
      a.turn = 1.2
    }
    if (a.x > maxX) {
      a.x = maxX
      a.vx = -1
      a.turn = 1.2
    }
    const minY = b.y + a.h / 2
    const maxY = Math.max(minY, b.y + b.h - a.h / 2)
    if (a.y < minY) [a.y, a.vy] = [minY, Math.abs(a.vy)]
    if (a.y > maxY) [a.y, a.vy] = [maxY, -Math.abs(a.vy)]
  }

  render(renderer) {
    if (!this.view && !this.actors.length && !this.flights.length && !this.pops.length) return
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
  }
}
