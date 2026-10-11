import * as THREE from 'three'
import { BLUE, HALF_D, HALF_W, MIXES, RED, TINTS, WHITE, YELLOW, colourOf, ratioCode } from './paint.js'

/**
 * Paint requests: a dashed chalk outline on the ground ("paint the fish green").
 * The outline is drawn in the colour it wants, but the pots only hold red, yellow
 * and blue, so the child has to work out the mix and roll it inside the lines
 * while the paint is still wet. A shape is finished once most of it is that colour;
 * its outline then turns to dark ink, so the finished picture is a page of
 * coloured-in shapes. Some shapes have two parts (a tree's crown and trunk).
 */

const ORANGE = RED | YELLOW
const GREEN = YELLOW | BLUE
const PURPLE = RED | BLUE
const BROWN = RED | YELLOW | BLUE
const SECONDARIES = [ORANGE, GREEN, PURPLE]
// Tints (the top step): a colour made light with white.
const PINK = RED | WHITE
const LIGHT_BLUE = BLUE | WHITE
const LIGHT_GREEN = GREEN | WHITE
const LIGHT_ORANGE = ORANGE | WHITE

const ring = (cx, cy, rx, ry, n = 28, a0 = 0, a1 = Math.PI * 2) =>
  Array.from({ length: n }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / (a1 - a0 >= Math.PI * 2 - 1e-6 ? n : n - 1)
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
  })
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/**
 * Shapes in unit space (about -1..1, y up on the screen). `parts` lists each part's
 * outline and the colours it may ask for (`tints`: the light colours it may ask for at the top step;
 * a light mix needs three coats inside WET_MS, so only the smaller ice-cream scoop asks for one); `deco` adds thin ink details (an eye, a body) that
 * help the shape read but are not painted.
 */
export const SHAPES = {
  fish: { emoji: '🐟', name: 'fish', deco: [ring(0.6, 0.14, 0.08, 0.08, 10)], parts: [{ poly: [...ring(0.2, 0, 0.8, 0.52, 26, (-5 * Math.PI) / 6, (5 * Math.PI) / 6), [-1, 0.55], [-0.82, 0], [-1, -0.55]], colours: SECONDARIES, tints: [LIGHT_BLUE, PINK] }] },
  heart: {
    emoji: '❤️', name: 'heart',
    parts: [{ poly: Array.from({ length: 36 }, (_, k) => { const t = (k / 36) * Math.PI * 2; return [(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.1] }), colours: [PURPLE, ORANGE], tints: [PINK] }],
  },
  star: { emoji: '⭐', name: 'star', parts: [{ poly: Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.48 : 1.05; return [Math.cos(a) * r, Math.sin(a) * r - 0.05] }), colours: [ORANGE, PURPLE, GREEN], tints: [LIGHT_BLUE, PINK] }] },
  leaf: { emoji: '🍃', name: 'leaf', deco: [[[-0.92, 0], [0.92, 0]]], parts: [{ poly: [...ring(0, -0.55, 1.05, 1.0, 14, Math.PI * 0.18, Math.PI * 0.82), ...ring(0, 0.55, 1.05, 1.0, 14, Math.PI * 1.18, Math.PI * 1.82)], colours: [GREEN] }] },
  balloon: { emoji: '🎈', name: 'balloon', parts: [{ poly: [...ring(0, 0.15, 0.68, 0.82, 30, -Math.PI / 2 + 0.22, (3 * Math.PI) / 2 - 0.22), [-0.16, -0.86], [0.16, -0.86]], colours: SECONDARIES, tints: [PINK, LIGHT_BLUE] }] },
  sun: { emoji: '☀️', name: 'sun', parts: [{ poly: Array.from({ length: 48 }, (_, k) => { const a = (k / 48) * Math.PI * 2, r = 0.84 + 0.14 * Math.cos(8 * a); return [Math.cos(a) * r, Math.sin(a) * r] }), colours: [ORANGE] }] },
  apple: { emoji: '🍏', name: 'apple', deco: [[[0, 0.48], [0.08, 0.86]]], parts: [{ poly: Array.from({ length: 40 }, (_, k) => { const a = (k / 40) * Math.PI * 2, top = Math.exp(-((a - Math.PI / 2) ** 2) / 0.06); return [Math.cos(a) * 0.86, Math.sin(a) * 0.8 - 0.28 * top - 0.05] }), colours: [GREEN] }] },
  butterfly: { emoji: '🦋', name: 'butterfly', deco: [ring(0, 0, 0.09, 0.5, 14), [[0, 0.45], [-0.26, 0.8]], [[0, 0.45], [0.26, 0.8]]], parts: [{ poly: Array.from({ length: 48 }, (_, k) => { const a = (k / 48) * Math.PI * 2, r = 0.28 + 0.74 * Math.abs(Math.sin(2 * a)) ** 0.7, y = Math.sin(a) * r; return [Math.cos(a) * r, y > 0 ? y : y * 0.75] }), colours: SECONDARIES, tints: [LIGHT_BLUE, PINK] }] },
  // Two-part shapes are bigger, with a little gap between the parts, so a roller can paint one without the other.
  tree: {
    emoji: '🌳', name: 'tree', size: 3.3,
    parts: [
      { poly: ring(0, 0.4, 0.68, 0.56, 30), colours: [GREEN], word: 'leaves' },
      { poly: rect(-0.3, -1.0, 0.3, -0.27), colours: [BROWN], word: 'trunk' },
    ],
  },
  flower: {
    emoji: '🌸', name: 'flower', size: 3.3,
    parts: [
      { poly: Array.from({ length: 40 }, (_, k) => { const a = (k / 40) * Math.PI * 2, r = 0.5 + 0.1 * Math.cos(5 * a); return [Math.cos(a) * r, 0.44 + Math.sin(a) * r] }), colours: [PURPLE, ORANGE], tints: [PINK], word: 'petals' },
      { poly: rect(-0.2, -1.05, 0.2, -0.28), colours: [GREEN], word: 'stem' },
    ],
  },
  carrot: {
    emoji: '🥕', name: 'carrot', size: 3.1,
    parts: [
      { poly: [[-0.46, 0.22], [0.46, 0.22], [0.07, -1.05], [-0.07, -1.05]], colours: [ORANGE], word: 'root' },
      { poly: [[-0.4, 0.34], [-0.68, 0.98], [-0.16, 0.66], [0, 1.08], [0.16, 0.66], [0.68, 0.98], [0.4, 0.34]], colours: [GREEN], word: 'leaves' },
    ],
  },
  mushroom: {
    emoji: '🍄', name: 'mushroom', size: 3.2,
    parts: [
      { poly: ring(0, -0.02, 0.98, 0.9, 28, 0, Math.PI), colours: [ORANGE, PURPLE], word: 'cap' },
      { poly: rect(-0.28, -1.0, 0.28, -0.2), colours: [BROWN], word: 'stalk' },
    ],
  },
  boat: {
    emoji: '⛵', name: 'boat', size: 3.2,
    parts: [
      { poly: [[-0.7, -0.18], [0.08, 1.04], [0.72, -0.18]], colours: SECONDARIES, tints: [LIGHT_BLUE, PINK], word: 'sail' },
      { poly: [[-1.0, -0.36], [1.0, -0.36], [0.64, -0.98], [-0.64, -0.98]], colours: [BROWN], word: 'hull' },
    ],
  },
  icecream: {
    emoji: '🍦', name: 'ice cream', size: 3.2,
    parts: [
      { poly: ring(0, 0.5, 0.64, 0.5, 30), colours: SECONDARIES, tints: [PINK, LIGHT_GREEN, LIGHT_ORANGE], word: 'scoop' },
      { poly: [[-0.52, -0.16], [0.52, -0.16], [0, -1.1]], colours: [BROWN], word: 'cone' },
    ],
  },
}
const SINGLE = ['fish', 'heart', 'star', 'leaf', 'balloon', 'sun', 'apple', 'butterfly']
const DOUBLE = ['tree', 'flower', 'carrot', 'mushroom', 'boat', 'icecream']
/** Shapes that can carry a rule ("a mix of blue and one more paint"): any one-part shape that may be more than one colour. */
const RULED = SINGLE.filter((n) => SHAPES[n].parts[0].colours.length > 1)
/** Two-part shapes whose first part may be more than one colour: the top step puts a rule on that part. */
const RULED2 = DOUBLE.filter((n) => SHAPES[n].parts[0].colours.length > 1)
/** Shapes whose first part may ask for a light colour (from the white step). */
const TINTED = [...SINGLE, ...DOUBLE].filter((n) => SHAPES[n].parts[0].tints)
/** Shapes whose first part may ask for a two-paint mix, so it can ask for more of one paint (the top step). */
const LEANED = [...SINGLE, ...DOUBLE].filter((n) => SHAPES[n].parts[0].colours.some((m) => SECONDARIES.includes(m)))
/** The white pot comes out at this step; ratios ("a yellowish orange") at the next. */
export const WHITE_STEP = 5
export const RATIO_STEP = 6
/** How big a shape is: half its width on the ground, in metres (unless the shape says). */
const SHAPE_SIZE = 2.7
const sizeOf = (shape) => SHAPES[shape].size ?? SHAPE_SIZE
/** How far a shape reaches from its middle (with a little room), for a given scale. */
export const reachOf = (shape, scale = 1) => sizeOf(shape) * scale * 1.1
/** A first coat must cover this share of a part (nearly all of it) before the next paint goes on, to count as painting in coats. */
export const COAT_SHARE = 0.8
/** A paint that covered less than this share of a part was only rolled across it on the way, not a coat. */
export const TRANSIT_SHARE = 0.1
/** A part is painted once this share of it is the wanted colour. */
export const DONE_SHARE = 0.6
/** A mistake is noticed once this share of a part is a colour that can't become the wanted one. */
export const WRONG_SHARE = 0.14
/**
 * When one part of a shape is painted, the others open this long afterwards: a careful child
 * finishing the last row of the petals may roll on over the stem for a moment, and that is not a slip.
 */
export const OPEN_GRACE_MS = 2500
/** Every so often the child picks the colour: "Paint the flower any colour you can mix!" */
export const CHOICE_EVERY = 5

/**
 * A rule instead of a named colour (the top steps). Rules are about which paints are in a mix:
 * - `with` a paint: "a mix of blue and one more paint" (green or purple, the child picks);
 * - `without` one: "a mix of two paints with no yellow" (only purple, by elimination);
 * - both (tier 4): "a mix with blue but no red" (only green);
 * - `any`: the child's own choice of any mixed colour, brown too (and, with `light`, the light colours).
 * Returns the colours that keep the rule.
 */
export function ruleColours(rule) {
  if (!rule) return []
  if (rule.any) return rule.light ? [...SECONDARIES, BROWN, ...TINTS] : [...SECONDARIES, BROWN]
  return SECONDARIES.filter((m) => (!rule.with || m & rule.with) && (!rule.without || !(m & rule.without)))
}

/** A rule with at least one answer: one paint it must have, one it must not, or both (different paints). */
function makeRule(tier, rnd) {
  const bits = [RED, YELLOW, BLUE]
  const a = bits[Math.floor(rnd() * 3)]
  if (tier >= 4 && rnd() < 0.5) {
    const b = bits.filter((x) => x !== a)[Math.floor(rnd() * 2)]
    return { with: a, without: b }
  }
  return rnd() < 0.55 ? { with: a } : { without: a }
}

/**
 * Picks the next request for a tier from what was asked before (newest last), so shapes and
 * colours keep changing through a round:
 * - 0 and 1: one-part shapes in orange, green or purple (0 shows the recipe, 1 hides it);
 * - 2: mostly two-part shapes with brown;
 * - 3: rules ("a mix of blue and one more paint", "no yellow") and two-part shapes, recipes kept hidden;
 * - 4: rules on two-part shapes, and rules with two conditions ("with blue but no red");
 * - 5: the white pot. About half the requests are light colours ("a pink heart", "a light green
 *   scoop"); the rest are tier 4's, where white would spoil the colour, so the child decides when it belongs.
 * - 6: ratios. About a third of the requests lean one way ("a yellowish orange sun": yellow, red, then
 *   yellow again on top), so the child decides which paint goes on twice; the rest are tier 5's.
 * Every CHOICE_EVERY-th request is the child's own choice of colour, at any step.
 */
export function chooseJob(tier, history = [], rnd = Math.random) {
  const roll = rnd()
  const choice = history.length % CHOICE_EVERY === CHOICE_EVERY - 1
  const ratio = !choice && tier >= RATIO_STEP && rnd() < 0.36
  const light = !choice && !ratio && tier >= WHITE_STEP && rnd() < (tier >= RATIO_STEP ? 0.4 : 0.55)
  const ruled = !choice && !light && !ratio && tier >= 3 && roll < (tier >= 5 ? 0.5 : tier >= 4 ? 0.85 : 0.45)
  let pool
  if (ratio) pool = LEANED
  else if (light) pool = TINTED
  else if (choice) pool = tier >= 2 && roll < 0.5 ? RULED2 : RULED
  else if (ruled) pool = tier >= 4 && roll < 0.45 ? RULED2 : RULED
  else pool = tier >= 3 ? (roll < 0.8 ? DOUBLE : SINGLE) : tier >= 2 ? (roll < 0.65 ? DOUBLE : SINGLE) : SINGLE
  // Shapes keep changing: not one of the last three, and never one asked much more often than the rest this round.
  const recent = history.slice(-3).map((h) => h.shape)
  const times = (n) => history.filter((h) => h.shape === n).length
  let names = pool.filter((n) => !recent.includes(n))
  if (!names.length) names = pool
  const fewest = Math.min(...names.map(times))
  names = names.filter((n) => times(n) <= fewest + 1)
  const asked = new Set(history.map((h) => `${h.shape}:${h.targets.join()}`))
  const last = history.at(-1)
  // A rule as a key, so "no blue" is not asked twice running and the picture keeps a mix of colours.
  const ruleKey = (r) => (r ? `${r.with ?? 0}-${r.without ?? 0}` : '')
  const lastRules = history.filter((h) => h.rules?.[0] && !h.rules[0].any).slice(-2).map((h) => ruleKey(h.rules[0]))
  for (let k = 0; k < 30; k++) {
    const shape = names[Math.floor(rnd() * names.length)]
    const tilt = Math.round((rnd() - 0.5) * 30) / 100
    const targets = SHAPES[shape].parts.map((p, i) => {
      const list = light && !i ? p.tints : ratio && !i ? p.colours.filter((m) => SECONDARIES.includes(m)) : p.colours
      const m = list[Math.floor(rnd() * list.length)]
      // More of one of its two paints: a yellowish or a reddish orange.
      return ratio && !i ? ratioCode(m, MIXES[m].recipe[Math.floor(rnd() * 2)]) : m
    })
    if (choice || ruled) {
      // The rule goes on the first part (the one that may be more than one colour); a trunk stays brown.
      const rules = targets.map((_, i) => (i ? null : choice ? { any: 1, ...(tier >= 5 ? { light: 1 } : {}) } : makeRule(tier, rnd)))
      if (ruled && k < 24 && lastRules.includes(ruleKey(rules[0]))) continue
      return { shape, targets: targets.map((m, i) => (rules[i] ? 0 : m)), rules, tilt }
    }
    // Something not asked yet this round, and a new colour each time where there is a choice.
    if (k < 24 && asked.has(`${shape}:${targets.join()}`)) continue
    if (k < 16 && last && targets[0] === last.targets[0] && SHAPES[shape].parts[0].colours.length > 1) continue
    return { shape, targets, tilt }
  }
  return { shape: 'fish', targets: [GREEN], tilt: 0 }
}

/** World point of a unit-space shape point (y up on the screen is -z in the world). */
const place = (job, [u, v]) => {
  const c = Math.cos(job.tilt), s = Math.sin(job.tilt)
  const x = u * c - v * s, y = u * s + v * c
  return [job.x + x * job.size, job.z - y * job.size]
}

function inside(poly, x, z) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

/** How far behind a tall thing (per metre of its height) the follow camera can't see the ground. */
const HIDDEN_BEHIND = 0.75

/** Is a spot good for a shape: inside the page (`edge` metres in from the sides), clear of obstacles and other shapes. */
export function fits(shape, x, z, obstacles, others, scale = 1, edge = 0.5) {
  const r = reachOf(shape, scale)
  if (Math.abs(x) > HALF_W - edge - r || Math.abs(z) > HALF_D - edge - r) return false
  // A tall thing hides the ground just behind it (up the screen) from the follow camera, so a shape keeps clear of that too.
  const nearest = (o) => Math.min(o.z, Math.max(o.z - (o.h ?? 0) * HIDDEN_BEHIND, z))
  if (obstacles.some((o) => Math.hypot(o.x - x, nearest(o) - z) < o.r + r)) return false
  return !others.some((o) => Math.hypot(o.x - x, o.z - z) < r + o.r + 0.3)
}

/** One request on the ground: its cells, its outline and how it is going. */
export class Job {
  constructor(spec, paint, scene) {
    Object.assign(this, spec)
    this.def = SHAPES[spec.shape]
    this.scale = spec.scale ?? 1
    this.size = sizeOf(spec.shape) * this.scale
    this.r = this.size * 1.1
    this.done = false
    this.parts = this.def.parts.map((part, k) => {
      const poly = part.poly.map((p) => place(this, p))
      const cells = []
      paint.cells(this.x, this.z, this.r * 1.1, (i, cx, cz) => {
        if (!paint.mask[i] && inside(poly, cx, cz)) cells.push(i)
      })
      const rule = spec.rules?.[k] || null
      // A ratio's code holds its mix (the low bits) and the paint it has more of (see ratioCode).
      const code = rule ? 0 : spec.targets[k]
      const target = code & 15, lean = code >> 4
      // The colours this part will take: the one asked for, or any that keeps the rule.
      const ok = rule ? ruleColours(rule) : [target]
      return {
        poly, cells: Int32Array.from(cells), target, lean, code, rule, ok, word: part.word,
        done: false, share: 0, wrong: 0, near: 0, off: 0, slipping: false, byMix: new Int32Array(16), t0: spec.t0,
        // The paints rolled onto this part by the child, one entry per change of pot (see `roll`).
        runs: [], runAt: [], firstCover: 1, carry: 0, from: 0, cellSet: new Set(cells),
      }
    })
    // A clean page for the shape: whatever was under the chalk is washed away when it appears
    // (at the same game time on every device), so only paint laid for this shape counts.
    for (const part of this.parts) for (const i of part.cells) paint.write(i, spec.t0, 0)
    this.group = new THREE.Group()
    this.ghostGroup = null
    this.scene = scene
    this.draw()
    scene.add(this.group)
  }

  /** Dashed outlines in the wanted colour while waiting; solid dark ink once painted. */
  draw() {
    for (const m of this.group.children) {
      m.geometry.dispose()
      m.material.dispose()
    }
    this.group.clear()
    const line = (geo, color, opacity, order) => {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = order
      this.group.add(mesh)
    }
    // Details in thin ink: soft while waiting, darker once the shape is painted.
    for (const d of this.def.deco ?? []) line(ribbon(d.map((p) => place(this, p)), 0.12, 0, 0), '#3b2a4a', this.done ? 0.8 : 0.4, 2)
    for (const part of this.parts) {
      if (part.done) line(ribbon(part.poly, 0.16, 0, 0), '#3b2a4a', 0.85, 2)
      else {
        // Chalk dashes in the wanted colour on a soft white edge, so they show on any paint.
        // A rule's chalk is in the paint it names ("with blue"), or plain grey ("no yellow").
        const chalk = part.rule ? (part.rule.with ? darker(MIXES[part.rule.with].hex) : '#6f6480') : darker(colourOf(part.code).hex)
        line(ribbon(part.poly, 0.34, 0.5, 0.18, -0.04), '#ffffff', 0.75, 2)
        line(ribbon(part.poly, 0.2, 0.42, 0.26), chalk, 0.95, 3)
      }
    }
  }

  /** Can mix m still become one of the part's colours (it is one paint of a recipe, or the colour itself)? */
  static fits(part, m) {
    return part.ok.some((c) => (m & ~c) === 0)
  }

  /**
   * Looks at the paint inside each part. Returns { finished, wrong, active }: `finished` lists parts
   * now painted (see fill), `wrong` the part being painted if it newly holds a colour the wanted one
   * can't be made from, and `active` the part the child is working on.
   *
   * Only the part being painted can slip (paint spilling over a gap into the next part is not a
   * mistake), and only paint laid on it since it opened counts: a cell is a slip only when the
   * paint that spoils it (the extra paint the wanted colour has no room for) was laid since then,
   * and not while the child was still rolling the paint of the part before (see `carry` in roll).
   */
  check(paint) {
    const finished = []
    let active = null, most = -1
    const T = paint.times
    for (const part of this.parts) {
      if (part.done) continue
      let hit = 0, bad = 0, near = 0, off = 0
      const coats = part.rule ? 2 : colourOf(part.code).recipe.length
      part.byMix.fill(0)
      for (const i of part.cells) {
        const m = paint.mix[i]
        part.byMix[m]++
        if (!m) continue
        // A ratio is its mix with more of the right paint. The even mix is on its way there (two of its three coats);
        // one leaning the other way is a ratio mistake (`off`), a step back: the other paint evens it out again.
        if (part.ok.includes(m)) {
          if (!part.lean || paint.lean[i] === part.lean) hit++
          else if (paint.lean[i]) [off, near] = [off + 1, near + 1 / 3]
          else near += 2 / 3
        }
        // A coat on its way counts by how many of the colour's coats are on (yellow is a third of a yellowish orange).
        else if (Job.fits(part, m)) near += Math.min(1, coatsIn(m) / coats)
        else if (!part.carry && part.ok.every((c) => [0, 1, 2, 3].some((k) => m & ~c & (1 << k) && T[k][i] >= Math.max(part.t0, part.from)))) bad++
      }
      const n = part.cells.length || 1
      part.share = hit / n
      part.near = near / n
      part.wrong = bad / n
      part.off = off / n
      if (part.share >= DONE_SHARE) finished.push(part)
      // The part being painted is the one with the most of its own paint on it (the first, when none has any).
      const mine = hit + near
      if (mine > most) [active, most] = [part, mine]
    }
    // A slip is noticed once, until it is put right (the spoiled paint dries and is painted over).
    for (const part of this.parts) if (part.wrong < WRONG_SHARE * 0.5) part.slipping = false
    let wrong = null
    if (active && active.wrong >= WRONG_SHARE && !active.slipping) {
      active.slipping = true
      wrong = active
    }
    return { finished, wrong, active }
  }

  /**
   * The child's roller, in paint `bits`, is over (x, z): the unfinished part it touches notes the paint,
   * once per change of pot. Rolling one paint all over and then the other on top is two coats;
   * swapping pots back and forth while scrubbing makes many. A part not open yet (see fill) notes nothing.
   */
  roll(paint, t, x, z, bits) {
    if (!bits) return
    for (const part of this.parts) {
      if (part.done || t < part.t0 || part.runs.at(-1) === bits) continue
      // The paint the child was rolling when the part before was painted: finishing that row over this part is not a coat here.
      // Nor is it a slip: the part is judged on paint laid from the child's next pot on.
      if (part.carry) {
        if (bits === part.carry) continue
        part.carry = 0
        part.from = t
      }
      const touches = [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]].some(([dx, dz]) => {
        const at = paint.index(x + dx, z + dz)
        return at >= 0 && part.cellSet.has(at)
      })
      if (!touches) continue
      if (part.runs.length) {
        // The last paint ends here. A roller that only crossed a corner on its way (carrying the paint
        // of the part before, say) laid no coat: it is forgotten. Otherwise the first coat notes how much it covered.
        const k = part.runs.length - 1
        const cover = coverSince(part, paint, part.runs[k], part.runAt[k])
        if (cover < TRANSIT_SHARE) {
          part.runs.pop()
          part.runAt.pop()
        } else if (k === 0) part.firstCover = cover
        if (part.runs.at(-1) === bits) continue
      }
      part.runs.push(bits)
      part.runAt.push(t)
    }
  }

  /**
   * Was this part painted in coats: the first paint over most of it, then each other paint of its
   * colour laid once on top, with at most one touch-up? Quick swaps over a corner of it are not coats.
   */
  static layered(part) {
    return part.runs.length <= colourOf(part.code).recipe.length + 1 && part.firstCover >= COAT_SHARE
  }

  /** The most common wrong colour in a part (to name what happened), from the last check. */
  wrongColour(part) {
    let best = 0
    for (let m = 1; m < 16; m++) if (!Job.fits(part, m) && part.byMix[m] > (best ? part.byMix[best] : 0)) best = m
    return best
  }

  /** The colour a part is being painted (for a rule, the allowed colour there is most of). */
  chosen(part) {
    if (!part.rule) return part.target
    return part.ok.reduce((a, b) => (part.byMix[b] > part.byMix[a] ? b : a))
  }

  /**
   * Tidies a painted part inside its lines at game time t, in colour `colour` (the asked one, or
   * the one the child chose for a rule): every cell is washed and then given exactly that colour,
   * and kept so, so each device ends with the same crisp shape and later rolling (painting the
   * next part, say) can't spoil it. The other parts start afresh from here: paint that spilled onto
   * them while this part was painted is not a slip there, and `carry` (the child's paint now) laid on
   * them before the child changes pot is not a coat there.
   */
  fill(part, paint, t, colour = part.target, carry = 0) {
    part.target = colour
    part.code = part.lean ? ratioCode(colour, part.lean) : colour
    part.done = true
    this.done = this.parts.every((p) => p.done)
    for (const p of this.parts) if (!p.done) {
      p.t0 = Math.max(p.t0, t + OPEN_GRACE_MS)
      p.runs = []
      p.runAt = []
      p.firstCover = 1
      p.carry = carry
      p.from = 0
    }
    for (const i of part.cells) {
      paint.write(i, t, 0)
      paint.write(i, t + 1, colour)
      if (part.lean) paint.setLean(i, part.lean)
      // From now on the shape keeps its colour, even if a roller crosses it.
      paint.locked[i] = t
    }
    this.ghost(null)
    if (this.done) this.tidy(paint, t + 1)
  }

  /**
   * The whole shape is painted: the paint that went over its lines close by is washed away, so
   * the picture becomes a page of neatly coloured-in shapes (other shapes nearby are kept).
   */
  tidy(paint, t) {
    const own = new Set()
    for (const part of this.parts) for (const i of part.cells) own.add(i)
    paint.cells(this.x, this.z, this.r, (i) => {
      if (!own.has(i)) paint.write(i, t, 0)
    })
  }

  /**
   * A quiet picture of how to do it, for a child who is stuck: two soft crossing stripes on the
   * shape, one in each paint, with their mix where they cross. Still (no motion); `null` clears it.
   */
  ghost(part, at = null, plan = null) {
    if (this.ghostGroup) {
      for (const m of this.ghostGroup.children) {
        m.geometry.dispose()
        m.material.dispose()
      }
      this.ghostGroup.removeFromParent()
      this.ghostGroup = null
    }
    if (!part) return
    // The colour and its paints in the order the child is told (see planOf in main.js).
    const colour = plan?.colour ?? (part.rule ? part.ok[0] : part.code)
    const paints = plan?.order ?? colourOf(colour).recipe
    // Where the child can see it (`at`, chosen on screen), or the middle of the part.
    const c = at ? [at.x, at.z] : part.poly.reduce((s, [x, z]) => [s[0] + x / part.poly.length, s[1] + z / part.poly.length], [0, 0])
    const g = new THREE.Group()
    const len = this.size * 0.9, w = 1.2
    const strip = (hex, sx, sz, y, opacity, turn = 0) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false }))
      mesh.position.y = y
      mesh.rotation.y = turn
      mesh.renderOrder = 1
      g.add(mesh)
    }
    // One stripe of each paint, crossing (two at right angles, three like a star), with the mix where
    // they all meet. Nearly solid, so the paints show true over whatever is on the ground.
    paints.forEach((bit, k) => strip('#ffffff', len + 0.24, w + 0.24, 0.018, 0.9, (k * Math.PI) / paints.length))
    paints.forEach((bit, k) => strip(MIXES[bit].hex, len, w, 0.02 + k * 0.003, 0.92, (k * Math.PI) / paints.length))
    strip(colourOf(colour).hex, w, w, 0.03, 1)
    g.rotation.y = -this.tilt
    g.position.set(c[0], 0, c[1])
    this.scene.add(g)
    this.ghostGroup = g
  }

  /** Is (x, z) on this shape (with a margin), for robots and pickups to keep away. */
  near(x, z, margin = 0) {
    return Math.hypot(x - this.x, z - this.z) < this.r + margin
  }

  dispose() {
    this.ghost(null)
    for (const m of this.group.children) {
      m.geometry.dispose()
      m.material.dispose()
    }
    this.group.removeFromParent()
  }
}

/** A flat strip along a closed outline, a little above the ground; dashes when `dash` > 0. */
function ribbon(poly, width, dash, gap, start = 0) {
  const pos = []
  const h = 0.035, w = width / 2
  const quad = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1
    const nx = (-dz / L) * w, nz = (dx / L) * w
    pos.push(ax + nx, h, az + nz, ax - nx, h, az - nz, bx + nx, h, bz + nz, ax - nx, h, az - nz, bx - nx, h, bz - nz, bx + nx, h, bz + nz)
  }
  let along = start + (dash + gap) * 10
  for (let k = 0; k < poly.length; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length]
    const L = Math.hypot(bx - ax, bz - az)
    if (!dash) {
      // Overlap a little at the corners so the line has no gaps.
      const ex = ((bx - ax) / (L || 1)) * w * 0.6, ez = ((bz - az) / (L || 1)) * w * 0.6
      quad(ax - ex, az - ez, bx + ex, bz + ez)
      continue
    }
    let s = 0
    while (s < L) {
      const phase = along % (dash + gap)
      const on = phase < dash
      const step = Math.max(1e-3, Math.min(L - s, on ? dash - phase : dash + gap - phase))
      if (on && step > 0.01) quad(ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L, ax + ((bx - ax) * (s + step)) / L, az + ((bz - az) * (s + step)) / L)
      s += step
      along += step
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return geo
}

/** How many paints are in a mix (its coats when painted one over another). */
const coatsIn = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1)

/** How much of a part paint `bits` (one pot) has touched since game time t, 0..1. */
function coverSince(part, paint, bits, t) {
  const T = paint.times[Math.log2(bits)]
  let n = 0
  for (const i of part.cells) if (T[i] >= t) n++
  return n / (part.cells.length || 1)
}

/** Chalk a little darker than its colour, so it shows on the ground (a light colour's chalk stays lighter). */
const darker = (hex) => {
  const c = new THREE.Color(hex)
  const hsl = c.getHSL({})
  return '#' + c.multiplyScalar(hsl.l > 0.72 ? 0.8 : 0.62).getHexString()
}

