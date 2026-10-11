// Each birthday friend orders a pictured cake, listed from the bottom layer to the top.
// Early friends ask for short sequences; later friends ask for repeating patterns
// (AB AB, ABC ABC) whose last unit is hidden, so the child works out what comes next.
// A child who builds cakes carefully gets harder patterns (ABB, AAB, AABB, growing) at
// any friend; a child who is finding it tricky goes back to the simpler ones.

const ORDERS = [
  { layers: ['vanilla', 'strawberry', 'strawberry', 'vanilla'] }, // 🐻
  { layers: ['strawberry', 'vanilla', 'strawberry', 'chocolate'] }, // 🐰
  { layers: ['chocolate', 'lemon', 'vanilla', 'lemon', 'chocolate'] }, // 🐱
  { layers: ['mint', 'chocolate', 'mint', 'chocolate', 'mint', 'chocolate'], unit: 2 }, // 🐶 AB AB AB
  { layers: ['blueberry', 'lemon', 'strawberry', 'mint', 'vanilla'] }, // 🐼
  { layers: ['strawberry', 'lemon', 'rainbow', 'strawberry', 'lemon', 'rainbow'], unit: 3 }, // 🐷 ABC ABC
  { layers: ['blueberry', 'lemon', 'blueberry', 'lemon', 'blueberry', 'lemon'], unit: 2 }, // 🦊
  { layers: ['mint', 'strawberry', 'vanilla', 'mint', 'strawberry', 'vanilla'], unit: 3 }, // 🐥
]

/** The harder patterns: each is one repeating unit, as letters. */
const UNITS = {
  tier2: ['AB', 'ABC'],
  tier3: ['ABB', 'AAB', 'ABC', 'AABB'],
}

const ALL = ['vanilla', 'strawberry', 'chocolate', 'lemon', 'mint', 'blueberry', 'rainbow']

/** Equal groups of `unit`: three of a short unit, two of a long one (the friends' own orders). */
const repeats = (unit) => Array(unit === 2 ? 3 : 2).fill(unit)

/** How many times a harder unit repeats: any count that keeps the cake six to nine layers tall, so cakes vary. */
const repeatsFor = (unit, random) => {
  const counts = [2, 3, 4].filter((r) => unit * r >= 6 && unit * r <= 9)
  return Array(counts[(random() * counts.length) | 0]).fill(unit)
}

/**
 * How many layers at the top are "?". Up to tier 2 the whole last unit is hidden (so ABC ABC shows
 * ABC and the child builds the whole repeat, not only its last layer); at tier 3 everything past the
 * first two units (so a long AB cake hides two repeats), while one whole unit always stays in view.
 */
const hiddenFor = (length, unit, tier = 0) => {
  if (tier < 3) return Math.min(unit, length - unit)
  return Math.min(length - unit, Math.max(unit, length - 2 * unit))
}

/**
 * The friend's order for this level and tier.
 * Returns { layers, groups, hidden }: groups are the pattern's parts (lengths, for spacing the dots;
 * empty for a plain sequence), and hidden is how many layers at the top are shown as "?".
 * flavours: the flavours the child has met so far (the friend's new one included); patterns use only these.
 */
export function orderFor(level, tier = 0, { fresh = null, flavours = [], random = Math.random } = {}) {
  const fixed = level <= ORDERS.length ? ORDERS[level - 1] : null
  // Tiers 0 and 1 keep each friend's own order. From tier 2 every other friend still brings their own
  // (so the birthday friends stay themselves), and the rest ask for a pattern to finish.
  if (fixed && (tier < 2 || level % 2 === 1)) {
    const groups = fixed.unit ? repeats(fixed.unit) : []
    // At the hardest tier a friend's own order (not a pattern) is a memory order: it is shown while the
    // friend says it, then the dots turn to "?" and the child builds it from memory.
    const memory = tier >= 3 && !fixed.unit
    return { layers: [...fixed.layers], groups, hidden: fixed.unit ? hiddenFor(fixed.layers.length, fixed.unit, tier) : 0, memory }
  }
  // From tier 2 some friends ask the child to make up the pattern: the child chooses the repeating part
  // (two layers, or three at the hardest tier) and then keeps their own pattern going. Until then the
  // layers are null; design is the length of the part the child will choose.
  if (tier >= 2 && level % 4 === 2) {
    const unit = tier >= 3 ? 3 : 2
    return { layers: Array(unit * 3).fill(null), groups: repeats(unit).concat(unit === 3 ? [3] : []), hidden: 0, design: unit }
  }
  // The pattern's flavours: the friend's new flavour first (so it still gets to show off), then others
  // the child already knows. A new flavour never turns up before its friend brings it.
  const pool = [...new Set(flavours.length >= 2 ? flavours : ALL.slice(0, 2))]
  const parts = []
  if (pool.includes(fresh)) parts.push(pool.splice(pool.indexOf(fresh), 1)[0])
  while (parts.length < 3 && pool.length) parts.push(pool.splice((random() * pool.length) | 0, 1)[0])
  const pick = (list) => list[(random() * list.length) | 0]
  // The hardest tier sometimes grows: A B, A B B, A B B B (the whole last group is the child's to work out).
  if (tier >= 3 && random() < 0.3) {
    const [a, b] = parts
    const groups = [2, 3, 4]
    const layers = groups.flatMap((n) => [a, ...Array(n - 1).fill(b)])
    return { layers, groups, hidden: 4, growing: true }
  }
  // Only units with as many different flavours as the child has met (ABC needs three).
  const units = (tier >= 3 ? UNITS.tier3 : UNITS.tier2).filter((u) => new Set(u).size <= parts.length)
  const unit = pick(units).split('').map((ch) => parts[ch.charCodeAt(0) - 65])
  const groups = repeatsFor(unit.length, random)
  const layers = groups.flatMap(() => unit)
  return { layers, groups, hidden: hiddenFor(layers.length, unit.length, tier) }
}

/** "strawberry, vanilla, strawberry, chocolate" */
export const orderWords = (layers) => layers.join(', ')

export const animalName = (animal) => animal.charAt(0).toUpperCase() + animal.slice(1)
