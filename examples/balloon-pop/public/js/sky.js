// The counting sky (Phase 2): every level is one spoken, pictured request such as
// "Pop 4 blue balloons". Picture slots fill with each matching pop and are counted aloud;
// other balloons still pop for fun but are not counted. There is no timer and no failure.

/** The colours a request can name. Teal and gold are never asked for (teal reads as blue or green). */
export const SKY_COLOURS = { red: '#ff595e', orange: '#ff9f1c', green: '#8ac926', blue: '#4d96ff', purple: '#9b5de5', pink: '#ff6b9d' }

/** What a child would call each balloon colour, hearts included, so a red heart counts as a red balloon. */
const NAME_OF = {
  '#ff595e': 'red', '#ff4d6d': 'red',
  '#ff9f1c': 'orange',
  '#8ac926': 'green',
  '#4d96ff': 'blue',
  '#9b5de5': 'purple', '#c77dff': 'purple',
  '#ff6b9d': 'pink', '#ff8fab': 'pink',
}
export const colourName = (hex) => NAME_OF[hex] ?? null

export const COLOURED_KINDS = ['round', 'smile', 'heart', 'mini']
const SHAPES = {
  heart: { picture: '💖', one: 'heart', many: 'hearts' },
  bunny: { picture: '🐰', one: 'bunny', many: 'bunnies' },
}

/** The biggest count asked for at each level: 1–3 to start, growing gently to 10. */
const HIGHEST = [3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10]
export function countRange(level) {
  const hi = HIGHEST[Math.min(level, HIGHEST.length) - 1]
  return [Math.max(1, hi - 3), hi]
}

/** The early levels follow a fixed, gentle order; later ones mix all four kinds of request. */
const OPENING = ['colour', 'shape', 'colour', 'shape', 'colour', 'add', 'shape', 'dots']

const between = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1))
const pickOther = (list, not, rand) => {
  const options = list.filter((x) => x !== not)
  return options[Math.floor(rand() * options.length)]
}
const plural = (n, one, many) => (n === 1 ? one : many)

/**
 * The request for a level. `recent` (earlier requests, newest last) keeps colours, kinds and counts varied.
 * Returns { type, colour?, kind?, parts: [n] or [a, b], total, say, named, accept(balloon) }.
 */
export function makeRequest(level, recent = [], rand = Math.random) {
  const [lo, hi] = countRange(level)
  const last = recent.at(-1)
  const lastColour = recent.findLast((r) => r.colour)?.colour
  const lastKind = recent.findLast((r) => r.kind)?.kind
  let type = OPENING[level - 1]
  if (!type) type = pickOther(['colour', 'shape', 'add', 'dots'], last?.type, rand)
  let total = between(lo, hi, rand)
  // Never the same count twice in a row (the gentle range allows it from level 1).
  if (last && total === last.total && hi > lo) total = total === hi ? total - 1 : total + 1

  if (type === 'shape') {
    // Hearts arrive at level 2, bunnies at level 4.
    const kind = level < 4 ? 'heart' : level === 4 ? 'bunny' : pickOther(['heart', 'bunny'], lastKind, rand)
    const s = SHAPES[kind]
    return {
      type, kind, parts: [total], total, picture: s.picture,
      say: `Pop the ${s.many}! ${total} ${plural(total, s.one, s.many)}.`,
      named: `${total} ${plural(total, s.one, s.many)}!`,
      accept: (b) => b.kindName === kind,
    }
  }
  if (type === 'dots') {
    return {
      type, parts: [total], total,
      say: 'Look at the gold balloon. Pop one balloon for each dot.',
      named: `${total} ${plural(total, 'dot', 'dots')}, ${total} ${plural(total, 'balloon', 'balloons')}!`,
      accept: () => true,
    }
  }
  const colour = pickOther(Object.keys(SKY_COLOURS), lastColour, rand)
  const accept = (b) => COLOURED_KINDS.includes(b.kindName) && colourName(b.color) === colour
  if (type === 'add') {
    // Two small groups, each one row of at most five: "Pop 3, then 2 more".
    total = Math.max(total, 3)
    // The first group is the bigger one, so the child counts on from it.
    const a = between(Math.max(Math.ceil(total / 2), total - 5), Math.min(5, total - 1), rand)
    const b = total - a
    return {
      type, colour, parts: [a, b], total,
      say: `Pop ${a} ${colour} ${plural(a, 'balloon', 'balloons')}, then ${b} more.`,
      named: `${a} and ${b} more make ${total} ${colour} balloons!`,
      accept,
    }
  }
  return {
    type: 'colour', colour, parts: [total], total,
    say: `Pop ${total} ${colour} ${plural(total, 'balloon', 'balloons')}.`,
    named: `${total} ${colour} ${plural(total, 'balloon', 'balloons')}!`,
    accept,
  }
}

/** Dot positions (percent of the gold balloon's face) for 1–10 dots: dice faces, then two rows. */
export function dotLayout(n) {
  const dice = {
    1: [[50, 46]],
    2: [[34, 30], [66, 62]],
    3: [[30, 26], [50, 46], [70, 66]],
    4: [[32, 28], [68, 28], [32, 64], [68, 64]],
    5: [[30, 26], [70, 26], [50, 46], [30, 66], [70, 66]],
    6: [[32, 24], [68, 24], [32, 46], [68, 46], [32, 68], [68, 68]],
  }
  if (dice[n]) return dice[n]
  // 7–10: a top row of five and the rest below, like a ten-frame.
  const spots = []
  for (let i = 0; i < n; i++) {
    const row = i < 5 ? 0 : 1
    const inRow = row ? n - 5 : 5
    const col = row ? i - 5 : i
    spots.push([50 + (col - (inRow - 1) / 2) * 17, 34 + row * 26])
  }
  return spots
}
