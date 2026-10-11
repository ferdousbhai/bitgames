import * as THREE from 'three'
import { listWords } from './speech.js'

/**
 * Each world's gentle purpose (see worlds.js `goal`), and the pictures that show it:
 * - rings: numbered rings come two at a time; the child flies through the number that comes next
 *   (1 to 5, counting on to 10, counting down, or by twos). The other ring's number is a near miss
 *   chosen for the lesson. A wrong ring or a missed pair isn't a failure: the number waits for the
 *   next pair. After two wrong rings in a row the wrong one dims, as a quiet hint.
 * - gather: treasures of two or three kinds float in little groups. The basket has a slot for each
 *   treasure asked for. Up to two wrong ones (another kind; at the stretch tier also one more than asked)
 *   ride along in an "oops" corner and are given back at the nest; any more float away.
 *   The challenge tier asks for a total with "more blue than pink" or "one more blue than pink". The basket takes
 *   either kind, so the rule is the child's to keep; a basket that breaks it is put right at the nest (nest.js).
 * Each world has three tiers; main.js picks one from how the last world of the same kind went.
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

/** An inline SVG of a treasure kind; `empty` draws a faint dashed outline (a slot still to fill). */
export function treasureSVG(kind, empty = false) {
  const t = TREASURES[kind]
  const pts = OUTLINES[t.shape].map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ')
  // an empty slot keeps its kind's colour, faintly, so "2 pink and 3 blue" reads before any are found
  const fill = empty ? `${t.color}66` : t.color
  const stroke = empty ? t.color : '#ffffff'
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

// --- This trip's goals ---------------------------------------------------------------

const between = (r) => (Array.isArray(r) ? r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)) : r)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
/** The highest tier a world offers (main.js keeps the child's level within it). */
export const TOP_LEVEL = 2

/**
 * This trip's goal for a world, drawn fresh from its spec at the child's level
 * (0 easier, 1 stretch, 2 challenge for 6-8 year olds; see worlds.js `tiers`).
 */
export function makeGoal(spec, level = 0, stepPick) {
  if (!spec) return null
  const tier = spec.tiers[Math.min(level, spec.tiers.length - 1)]
  if (spec.type === 'rings') {
    const n = between(tier.size)
    // `stepPick`: the way of counting the child chose at the last nest (by threes or by fives)
    const step = tier.down ? -1 : Array.isArray(tier.step) ? (tier.step.includes(stepPick) ? stepPick : pick(tier.step)) : tier.step
    // by threes or fives starts at the step itself (3, 6, 9 ...); counting on starts somewhere in the middle
    const first = tier.down ? n : tier.start === undefined ? step : between(tier.start)
    const seq = Array.from({ length: n }, (_, i) => first + i * step)
    const count = tier.down ? 'down' : step > 1 ? 'by' : first > 1 ? 'on' : 'up'
    // two spare pairs, so a missed number has somewhere to wait (more drift in before the nest if needed)
    return { type: 'rings', count, step, decoy: tier.decoy, seq, level, slots: n + 2 }
  }
  const kinds = [...spec.kinds].sort(() => Math.random() - 0.5)
  if (tier.total) {
    // a total the child splits, with a rule the basket doesn't enforce: "more blue than pink" (7 could be
    // 7 + 0, 5 + 2 or 4 + 3) or "one more blue than pink" (7 is only 4 + 3). Both kinds fit in the basket,
    // so a careless flyer can break the rule, and puts it right at the nest. The third kind (if any) isn't wanted.
    const rule = Math.random() < 0.5 ? 'one' : 'more'
    let total = between(tier.total)
    if (rule === 'one' && total % 2 === 0) total += total < tier.total[1] ? 1 : -1
    const more = kinds.slice(0, 2)
    return { type: 'gather', kinds: spec.kinds, total, more, rule, wants: more.map((k) => [k, total]), level, slots: spec.groups }
  }
  // the kind with the most is asked for first, so "4 pink and 2 blue" reads like the slots
  const wants = tier.wants.map((range, i) => [kinds[i], between(range)]).sort((a, b) => b[1] - a[1])
  return { type: 'gather', kinds: spec.kinds, wants, level, slots: spec.groups }
}

/**
 * The ways of counting a ring world offers, easiest first, each pictured by its first three numbers
 * ("1 2 3", "2 4 6", "3 6 9", "5 10 15"), for the child to choose the next world's challenge.
 */
export function countChoices(spec) {
  return spec.tiers.flatMap((tier, level) => (tier.down ? [-1] : [tier.step].flat()).map((step) => {
    const first = tier.down ? 5 : tier.start === undefined ? step : [tier.start].flat()[0]
    const words = step < 0 ? 'Count down' : step > 1 ? `Count by ${STEP_WORDS[step]}` : first > 1 ? `Count on from ${first}` : 'Count one by one'
    return { level, step: Array.isArray(tier.step) ? step : undefined, seq: [0, 1, 2].map((i) => first + i * step), words }
  }))
}

/**
 * The other ring's number in a pair: a mistake worth making for this goal.
 * far: a different-looking number (numeral recognition). near: the next-but-one or the last one
 * (counting order). down: one up or one too far down. teen: 41 for 14, or 4 (reading teen numerals).
 * skip: one off, or a whole step too far
 * (the odd numbers when counting by twos; 14 or 20 when 15 is next by fives).
 */
export function decoyFor(goal, i) {
  const s = goal.seq[i]
  const k = goal.step ?? 1
  // teen: the digits swapped (14 and 41), the next-but-one, or the same ones digit without the ten (14 and 4)
  const swapped = s >= 10 && s % 10 && s % 11 ? Number(String(s).split('').reverse().join('')) : s + 2
  const options = { far: [s + 2, s + 3, s - 2, s - 3], near: [s + 1, s + 2, s - 1], down: [s + 1, s - 1, s - 2], skip: [s - 1, s + 1, s + k, s - k], teen: [swapped, swapped, s + 1, s - 10] }[goal.decoy]
  return pick(options.filter((n) => n >= 1 && n !== s && n <= 99))
}

/** How many treasures the basket holds now. */
const inBasket = (g) => g.goal.wants.reduce((sum, [k]) => sum + (g.got[k] || 0), 0)
/** A "more pink than blue" basket: the second kind may have at most this many. */
const fewerMax = (goal) => Math.floor((goal.total - 1) / 2)

/** Does a "more than" basket keep its rule? ("one more": exactly one more of the first kind.) */
export function ruleKept(goal, got) {
  const [a, b] = goal.more.map((k) => got[k] || 0)
  return goal.rule === 'one' ? a === b + 1 : a > b
}

/** Can a "more than" basket still keep its rule when it's full? (No: too many of one kind already.) */
export function ruleReachable(goal, got) {
  const [a, b] = goal.more.map((k) => got[k] || 0)
  if (b > fewerMax(goal)) return false
  return goal.rule !== 'one' || a <= fewerMax(goal) + 1
}

/** Has the world's goal been met? (A "more than" basket is done when it is full; the nest checks the rule.) */
export function goalDone(g) {
  if (g.goal.type === 'rings') return g.reached >= g.goal.seq.length
  if (g.goal.total) return inBasket(g) >= g.goal.total
  return g.goal.wants.every(([k, n]) => (g.got[k] || 0) >= n)
}

/** The kinds the basket still has room for. A "more than" basket takes either kind until it is full. */
export function stillWanted(g) {
  const { goal } = g
  if (goal.type !== 'gather') return []
  if (goal.total) return inBasket(g) >= goal.total ? [] : [...goal.more]
  return goal.wants.filter(([k, n]) => (g.got[k] || 0) < n).map(([k]) => k)
}

/** The kinds that would keep a "more than" basket's rule (all wanted kinds for other baskets). */
export function bestKinds(g) {
  const left = stillWanted(g)
  if (!g.goal.total || !left.length) return left
  const keep = left.filter((k) => ruleReachable(g.goal, { ...g.got, [k]: (g.got[k] || 0) + 1 }))
  return keep.length ? keep : left
}

// --- Words -----------------------------------------------------------------------------

/** "4 pink hearts", "1 star" */
export function countOf(kind, n) {
  return `${n} ${n === 1 ? TREASURES[kind].one : TREASURES[kind].many}`
}

/** "2 pink and 3 blue hearts" (one shape in two colours), or "3 stars and 2 moons". */
function rowsWords(rows) {
  const shapes = new Set(rows.map(([k]) => TREASURES[k].shape))
  if (shapes.size === 1 && rows.length > 1 && rows.every(([k, n]) => TREASURES[k].word && n > 1)) {
    return `${listWords.format(rows.map(([k, n]) => `${n} ${TREASURES[k].word}`))} ${TREASURES[rows[0][0]].many.split(' ').pop()}`
  }
  return listWords.format(rows.map(([k, n]) => countOf(k, n)))
}

/** The treasures brought home, in the order they were asked for. */
export function sortedRows(goal, got) {
  return goal.wants.map(([k]) => [k, got[k] || 0]).filter(([, n]) => n > 0)
}

const STEP_WORDS = { 2: 'twos', 3: 'threes', 5: 'fives' }

/** What Ember learned in a world, said at the nest and the end: "You counted 1 to 5!" */
export function learnedSentence(entry) {
  const { goal } = entry
  if (goal.type === 'rings') {
    const n = entry.reached
    if (n <= 0) return ''
    const first = goal.seq[0]
    const last = goal.seq[n - 1]
    if (n === 1) return `You flew through ${first}!`
    if (goal.count === 'down') return `You counted down from ${first} to ${last}!`
    if (goal.count === 'by') return `You counted by ${STEP_WORDS[goal.step]} to ${last}!`
    if (goal.count === 'on') return `You counted on from ${first} to ${last}!`
    return `You counted 1 to ${last}!`
  }
  const rows = sortedRows(goal, entry.got)
  return rows.length ? `You brought home ${rowsWords(rows)}!` : ''
}

/** "more pink than blue", "more stars than moons" */
export function moreWords([a, b], rule = 'more') {
  const same = TREASURES[a].shape === TREASURES[b].shape && TREASURES[a].word
  const more = rule === 'one' ? 'one more' : 'more'
  // "one more moon than stars", "more moons than stars"
  return same ? `${more} ${TREASURES[a].word} than ${TREASURES[b].word}` : `${more} ${rule === 'one' ? TREASURES[a].one : TREASURES[a].many} than ${TREASURES[b].many}`
}

/** The world's goal said aloud as it starts. */
export function goalSentence(goal) {
  if (goal.type === 'rings') {
    const { seq } = goal
    const last = seq[seq.length - 1]
    if (goal.count === 'down') return `Count down from ${seq[0]} to 1! Fly through the next number.`
    if (goal.count === 'by') return `Count by ${STEP_WORDS[goal.step]}: ${seq.slice(0, 3).join(', ')}, all the way to ${last}!`
    if (goal.count === 'on') return `Count on from ${seq[0]} to ${last}!`
    return `Count 1 to ${last}! Fly through the next number.`
  }
  if (goal.total) {
    const [a, b] = goal.more
    const things = TREASURES[a].shape === TREASURES[b].shape ? TREASURES[a].many.split(' ').pop() : `${TREASURES[a].many} and ${TREASURES[b].many}`
    return `Bring home ${goal.total} ${things}, with ${moreWords(goal.more, goal.rule)}!`
  }
  return `Bring home ${rowsWords(goal.wants)}!`
}

/** "pink hearts", "stars or moons": what the basket still needs. */
export function neededWords(kinds) {
  return new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(kinds.map((k) => TREASURES[k].many))
}
