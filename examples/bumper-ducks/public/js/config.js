/** Everything the simulation, the view and the menus share. One unit is one Blender unit. */

export const R = 11 // radius of the water
export const DUCK_R = 1.1 // a bumper boat's radius
export const ROUND_TIME = 90 // seconds
export const PARTY_TIME = 15 // the last seconds are a bubble party
export const MAX_PLAYERS = 4

/** The six ducks: colour of the rubber, colour of the boat, and what they wear. */
export const DUCKS = {
  sunny: { emoji: '🐥', body: '#ffd23f', ring: '#ff4d5e', acc: 'acc_tuft' },
  rosie: { emoji: '🎀', body: '#ff9ccb', ring: '#9b5de5', acc: 'acc_bow' },
  sailor: { emoji: '⚓', body: '#7fd3ff', ring: '#244a9e', acc: 'acc_sailor' },
  king: { emoji: '👑', body: '#ffad4d', ring: '#2ec4b6', acc: 'acc_crown' },
  cool: { emoji: '😎', body: '#9be564', ring: '#ff9a2e', acc: 'acc_shades' },
  bloom: { emoji: '🌸', body: '#c9a7ff', ring: '#3ec7a0', acc: 'acc_flower' },
}
export const DUCK_IDS = Object.keys(DUCKS)
export const validDuck = (d) => typeof d === 'string' && Object.hasOwn(DUCKS, d)

/**
 * The places to play. Obstacles are circles in the water: `fixed` ones never
 * move (the bath's big mama duck, the pond's lily pads); the puddle's paper
 * boats drift and can be pushed around.
 */
export const ARENAS = {
  bath: {
    emoji: '🛁',
    color: '#5ec8f2',
    water: { deep: '#2fb2ee', shallow: '#8fe0ff', foam: '#ffffff' },
    sky: ['#fff4fb', '#d7f1ff'],
    obstacles: [{ kind: 'mama', x: 0, z: 0, r: 2.0, fixed: true }],
  },
  pond: {
    emoji: '🐸',
    color: '#6cc24a',
    water: { deep: '#2f9fb8', shallow: '#76d1c3', foam: '#e8fff4' },
    sky: ['#7cc8ff', '#e3f6ff'],
    obstacles: [
      { kind: 'lily', x: -5.2, z: -3.6, r: 1.3, fixed: true, frog: true },
      { kind: 'lily', x: 5.6, z: -2.4, r: 1.3, fixed: true, frog: true },
      { kind: 'lily', x: 0.6, z: 5.4, r: 1.3, fixed: true },
    ],
  },
  puddle: {
    emoji: '🌧️',
    color: '#7e8cc9',
    water: { deep: '#4f86c6', shallow: '#a7c8ec', foam: '#eef4ff' },
    sky: ['#8796b5', '#cfd8e8'],
    rain: true,
    obstacles: [
      { kind: 'boat', x: -4, z: 2, r: 1.0, mass: 1.6 },
      { kind: 'boat', x: 4.5, z: -3, r: 1.0, mass: 1.6 },
    ],
  },
}
export const ARENA_IDS = Object.keys(ARENAS)
export const validArena = (a) => typeof a === 'string' && Object.hasOwn(ARENAS, a)

/** Gift box powers: how long they last and how they show on the HUD. */
export const POWERS = {
  giant: { emoji: '🍄', time: 8 },
  speedy: { emoji: '⚡', time: 7 },
  shield: { emoji: '🛡️', time: 8 },
}
export const POWER_IDS = Object.keys(POWERS)

export const ITEMS = {
  bubble: { points: 1, radius: 0.55 },
  ten: { points: 10, radius: 0.95 },
  star: { points: 3, radius: 0.6 },
  gift: { points: 0, radius: 0.6 },
}

/**
 * Pond helpers (the calm default): every duck fills one shared ten-frame together, with no clock.
 * Bubbles carry gentle colours so sorting can be the goal. Bumper race is the lively timed round.
 */
export const MODES = ['calm', 'lively']
export const validMode = (m) => MODES.includes(m)
export const BUBBLE_COLOURS = [
  { name: 'blue', hex: '#5aa9ff' },
  { name: 'green', hex: '#5fcf6a' },
  { name: 'pink', hex: '#ff8fc8' },
  { name: 'yellow', hex: '#ffd23f' },
]
/** A ten raft: ten bubbles held together in one floating ten-frame. In the jar it is the token TEN. */
export const TEN = 9

/**
 * Pond helpers' goals climb a ladder of levels. Each round is a short trip of related goals made fresh at
 * its level, and the next level is chosen from how carefully the child played (see main.js), so it adapts
 * and never gates: the menu's ▶ steps through every level too.
 *  0  fill one ten (count to ten, any colour)
 *  1  find n bubbles of one colour, then n of another (sorting)
 *  2  three ways to make one number inside a ten-frame: 9 = 6 pink + 3 blue = 4 green + 5 yellow = …
 *  3–5 place value with ten rafts and single bubbles, tens first: make 23, then 10 more (33), then a few
 *      more ones (35). The jar carries over, so each step is one choice: a raft or a single bubble?
 *      From level 4 the last step crosses a ten (37, then 5 more): single bubbles fill the ones frame to
 *      ten, it bundles into a raft (regrouping), and the rest start a new frame (42); a raft would make 47.
 *      Levels 4–5 add a second crossing to the next ten (42, then 8 more: 50), and single bubbles float
 *      scarce while crossing, so a raft must be broken into ten ones to finish.
 *      Level 5 shows only the number (no empty spaces), so the child works out the tens and ones.
 */
export const LEVELS = 6
/** From this level the jar shows only the number: how many tens and ones is the child's to work out. */
export const HIDE_LEVEL = 5
const pick = (n, rand) => Math.floor(rand() * n)
const otherColour = (not, rand) => {
  const left = [...BUBBLE_COLOURS.keys()].filter((c) => !not.includes(c))
  return left[pick(left.length, rand)]
}
export function makeGoal(level, rand = Math.random) {
  return makeTrip(level, rand)[0]
}
/** A round's goals, in order. Place-value steps after the first `carry` the jar over and add to it. */
export function makeTrip(level, rand = Math.random) {
  const l = clamp(Math.floor(Number(level)) || 0, 0, LEVELS - 1)
  if (l === 0) return [{ level: 0, kind: 'tens', n: 1 }]
  if (l === 1) {
    const a = pick(BUBBLE_COLOURS.length, rand)
    return [
      { level: 1, kind: 'colour', c: a, n: 3 + pick(4, rand) },
      { level: 1, kind: 'colour', c: otherColour([a], rand), n: 3 + pick(4, rand) },
    ]
  }
  if (l === 2) {
    // One number, three ways. The first way is shown (6 pink and 3 blue); the next two are the children's
    // own: any two colours that make the number in a way not made yet (see freeBondFits).
    const total = 6 + pick(5, rand) // 6 to 10: one ten-frame
    const first = 2 + pick(total - 3, rand)
    const a = pick(BUBBLE_COLOURS.length, rand)
    const shown = { level: 2, kind: 'bond', parts: [[a, first], [otherColour([a], rand), total - first]] }
    const free = { level: 2, kind: 'bond', n: total, free: true }
    return [shown, { ...free }, { ...free }]
  }
  // Place value. The middle step varies, so each stage asks "how many rafts, how many singles?": 10 more
  // (one raft), 20 more (two rafts), or a ten and a few ones (11, 12 more: a raft, then singles).
  const tens = l === 3 ? 1 : l === 4 ? 2 : 3 + pick(2, rand)
  const ones = l === 3 ? 2 + pick(5, rand) : 4 + pick(4, rand) // 2–6, or 4–7 before crossing a ten
  const kinds = [[1, 0], [2, 0], [1, 1], [1, 2]].filter(([dt, d1]) => tens + dt + (l > 3 ? 2 : 0) <= 8 && ones + d1 <= 8)
  const [dt, d1] = kinds[pick(kinds.length, rand)]
  const mid = { level: l, kind: 'place', tens: tens + dt, ones: ones + d1, carry: true }
  if (l === 3) {
    const more = 1 + pick(Math.min(3, 9 - mid.ones), rand)
    return [{ level: l, kind: 'place', tens, ones }, mid, { level: l, kind: 'place', tens: mid.tens, ones: mid.ones + more, carry: true }]
  }
  // Crossing a ten: enough more ones to fill the frame and one or two over. Then a second crossing to
  // the next ten (or just past it): 42 and 8 more make 50. Single bubbles float scarce on these steps, so
  // breaking a raft into ten ones is the way to finish (see Sim.calmSpawn).
  const over = 1 + pick(2, rand)
  const cross = { level: l, kind: 'place', tens: mid.tens + 1, ones: over, carry: true, regroup: true }
  return [{ level: l, kind: 'place', tens, ones }, mid, cross, { level: l, kind: 'place', tens: cross.tens + 1, ones: pick(3, rand), carry: true, regroup: true }]
}
/**
 * Where a place-value goal's spaces are: `tens` raft spaces first, then (when the step crosses a ten) a
 * `bundle` of ten single spaces that becomes a raft once full, then the ones.
 */
export function placeLayout(g) {
  const bundle = g.regroup ? 10 : 0
  const tens = g.regroup ? g.tens - 1 : g.tens
  return { tens, bundle, ones: tens + bundle }
}
/** What each space in the jar wants, in order: a colour index, 'any' single bubble, or 'ten' (a raft). */
export function goalSlots(g) {
  if (g.kind === 'tens') return Array(g.n * 10).fill('any')
  if (g.kind === 'colour') return Array(g.n).fill(g.c)
  if (g.kind === 'bond') return g.free ? Array(g.n).fill('any') : g.parts.flatMap(([c, n]) => Array(n).fill(c))
  const at = placeLayout(g)
  return [...Array(at.tens).fill('ten'), ...Array(at.bundle).fill('any'), ...Array(g.ones).fill('any')]
}
/** Does a space that wants `want` take this jar token (a colour index, or TEN)? -1 is a bubble a device missed. */
export const slotTakes = (want, token) => (want === 'ten' ? token === TEN : token !== TEN && (want === 'any' || token === want || token === -1))
/**
 * Can this token go in the jar now? Place value counts the tens first (10, 20, 21, 22…): while a raft
 * space is open, single bubbles wait on the water.
 */
export function fitsNow(g, open, token) {
  const tensFirst = g?.kind === 'place' && open.includes('ten')
  return open.some((w) => w != null && slotTakes(w, token) && (!tensFirst || w === 'ten'))
}
/** Which space each token in the jar landed in: the first open space that takes it. */
export function placeJar(slots, tokens) {
  const used = slots.map(() => false)
  return tokens.map((t) => {
    const i = slots.findIndex((w, k) => !used[k] && slotTakes(w, t))
    if (i >= 0) used[i] = true
    return i
  })
}
/** A jar of bubbles as its colours, in the order they first came: [[colour, how many], …]. */
export function splitOf(tokens) {
  const parts = []
  for (const t of tokens) {
    if (!Number.isInteger(t) || t < 0 || t === TEN) continue
    const p = parts.find(([c]) => c === t)
    if (p) p[1]++
    else parts.push([t, 1])
  }
  return parts
}
/** One way to make a number, whichever colour came first: 5 + 3 and 3 + 5 are the same way. */
export const wayKey = (a, b) => `${Math.min(a, b)}+${Math.max(a, b)}`
/**
 * A free bond ("Another way to make 8!"): any two colours, in any amounts, as long as the jar can still
 * end as a two-colour way that is not one of the trip's `used` ways. A third colour, or a bubble that
 * would leave only a used way (6 + 2 again), bobs away.
 */
export function freeBondFits(n, jar, token, used = []) {
  if (token === TEN || token < 0 || jar.length >= n) return false
  const parts = splitOf([...jar, token])
  if (parts.length > 2) return false
  const a0 = parts[0][1]
  const b0 = parts[1]?.[1] ?? 0
  for (let a = a0; a <= n - Math.max(1, b0); a++) if (!used.includes(wayKey(a, n - a))) return true
  return false
}
/** How many bubbles a goal needs in the jar (a raft counts once). */
export const goalTarget = (g) => goalSlots(g).length
/** The number a goal makes: what the bubbles in the jar are worth. */
export const goalValue = (g) => (g.kind === 'tens' ? g.n * 10 : g.kind === 'colour' ? g.n : g.kind === 'bond' ? g.n ?? g.parts[0][1] + g.parts[1][1] : g.tens * 10 + g.ones)
/** A goal from the network: rebuilt from checked numbers, never trusted as sent. */
export function validGoal(g) {
  if (!g || typeof g !== 'object') return null
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
  const colour = (c) => int(c, 0, BUBBLE_COLOURS.length - 1)
  const level = int(g.level, 0, LEVELS - 1) ? g.level : 0
  if (g.kind === 'tens' && int(g.n, 1, 3)) return { level, kind: 'tens', n: g.n }
  if (g.kind === 'colour' && colour(g.c) && int(g.n, 1, 10)) return { level, kind: 'colour', c: g.c, n: g.n }
  if (g.kind === 'bond' && g.free && int(g.n, 3, 10)) return { level, kind: 'bond', n: g.n, free: true }
  if (g.kind === 'bond' && Array.isArray(g.parts) && g.parts.length === 2) {
    const [[a, x] = [], [b, y] = []] = g.parts.map((p) => (Array.isArray(p) ? p : []))
    if (colour(a) && colour(b) && a !== b && int(x, 1, 9) && int(y, 1, 9) && x + y <= 10) return { level, kind: 'bond', parts: [[a, x], [b, y]] }
  }
  if (g.kind === 'place' && int(g.tens, g.regroup ? 2 : 1, 9) && int(g.ones, 0, 9))
    return { level, kind: 'place', tens: g.tens, ones: g.ones, ...(g.carry ? { carry: true } : {}), ...(g.regroup ? { regroup: true } : {}) }
  return null
}
/** A trip from the network: one to four checked goals; a carried step must only add to the jar before it. */
export function validTrip(list) {
  if (!Array.isArray(list)) return null
  const trip = list.slice(0, 4).map(validGoal)
  if (!trip.length || trip.some((g) => !g)) return null
  trip[0] = { ...trip[0] }
  delete trip[0].carry
  for (let i = 1; i < trip.length; i++) {
    const [a, b] = [trip[i - 1], trip[i]]
    // A carried step only adds: the same tens or more, and (unless it crosses a ten) the same ones or more.
    // (A step after a crossing starts from the regrouped jar: its full bundle is one more raft.)
    const adds = a.kind === 'place' && b.kind === 'place' && (b.regroup ? b.tens === a.tens + 1 : b.tens >= a.tens && b.ones >= a.ones)
    if (b.carry && !adds) return null
    if (b.regroup && !b.carry) return null
  }
  return trip
}
/** Ducks have names, so the team results can say who helped. */
export const duckName = (id) => (validDuck(id) ? id[0].toUpperCase() + id.slice(1) : 'Ducky')

export const PLAYER_EMOJI = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐯', '🐨', '🐵']

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
/** Shortest signed difference between two angles. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
