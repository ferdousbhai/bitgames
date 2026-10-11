// The counting sky: every level is one friend's spoken, pictured request such as "Bear wants 4 blue
// balloons". Matching pops go into the friend's basket and the child decides when to hand it over:
// too many and the child lets the extras go, too few and the friend asks again. Other balloons still pop for fun but
// are not counted. There is no timer and no failure.

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

/** The friends who ask for balloons. Each request is for one of them, and the child hands the basket over. */
export const FRIENDS = [
  { face: '🐻', name: 'Bear' }, { face: '🦊', name: 'Fox' }, { face: '🐸', name: 'Frog' }, { face: '🐷', name: 'Pig' },
  { face: '🐼', name: 'Panda' }, { face: '🦉', name: 'Owl' }, { face: '🐨', name: 'Koala' }, { face: '🐭', name: 'Mouse' },
]

/** The biggest count asked for at each level: 1–3 to start, growing gently to 10. */
const HIGHEST = [3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10]
/**
 * The counts asked for. Tiers 1 and 2 (numbered, then plain slots) grow gently to 10 with the level.
 * Tier 3 (ten-frames, see main.js) starts at up to 7 and climbs one with each clean basket (`climb`),
 * to 10, and from level 8 into the teens on two ten-frames.
 */
export function countRange(level, tier = 1, climb = 0) {
  if (tier === 3) {
    const hi = Math.min(level < 8 ? 10 : 14, 7 + climb)
    return [Math.max(4, hi - 4), hi]
  }
  const hi = HIGHEST[Math.min(level, HIGHEST.length) - 1]
  return [Math.max(2, hi - 3), hi]
}

/** The early levels follow a fixed, gentle order; later ones mix all the kinds of request. */
const OPENING = ['colour', 'shape', 'colour', 'shape', 'colour', 'add', 'shape', 'dots']
/** Tier 2 (from level 3) brings in the two-colour basket, which needs sorting as well as counting. */
const OPENING_2 = ['colour', 'shape', 'colour', 'shape', 'pair', 'add', 'pair', 'dots']
/** Tier 3 adds new kinds of thinking, not only bigger numbers: one more / one less, two colours, and making two bunches the same. */
const MIXED = { 1: ['colour', 'shape', 'add', 'dots'], 2: ['colour', 'shape', 'add', 'dots', 'pair'], 3: ['colour', 'add', 'dots', 'more', 'less', 'same', 'pair'] }
/** The kinds of request a red sky mixes: all about red balloons, among pink, orange and purple ones that look close. */
const FOCUS_RED = { 1: ['colour', 'add'], 2: ['colour', 'add', 'pair'], 3: ['colour', 'add', 'pair', 'more', 'less', 'same'] }
/** How many dot balloons a dots request asks for (the dots are the number to match, not the count). */
export const DOT_FINDS = 3

const between = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1))
const pickOther = (list, not, rand) => {
  const options = list.filter((x) => x !== not)
  return options[Math.floor(rand() * options.length)]
}
const plural = (n, one, many) => (n === 1 ? one : many)
const balloonWord = (n) => plural(n, 'balloon', 'balloons')

/**
 * The request for a level. `recent` (earlier requests, newest last) keeps friends, colours, kinds and counts varied.
 * Returns { type, friend, colour?, colours?, kind?, dots?, ref?, has?, parts: [n] or [a, b], total, say, want, named, accept(balloon) }.
 * `colours` (a two-colour basket) names the colour of each part; `has` is how many the friend already holds ('same').
 * `say` is spoken once; `want` is the short reminder after a basket handed over too soon.
 * Every request but dots is finished by handing the basket over, so stopping at the number is the child's decision.
 */
export function makeRequest(level, recent = [], rand = Math.random, tier = 1, climb = 0, focus = null) {
  const [lo, hi] = countRange(level, tier, climb)
  const last = recent.at(-1)
  const lastColour = recent.findLast((r) => r.colour)?.colour
  const lastKind = recent.findLast((r) => r.kind)?.kind
  const friend = pickOther(FRIENDS, last?.friend, rand)
  const who = friend.name
  let type = tier < 3 ? (tier === 2 ? OPENING_2 : OPENING)[level - 1] : null
  if (!type) type = pickOther(MIXED[tier], last?.type, rand)
  // A focused sky (the menu's Hearts or Red) keeps every request about hearts or about red, still counted into the basket.
  if (focus === 'heart') type = 'shape'
  else if (focus === 'red' && !FOCUS_RED[tier].includes(type)) type = pickOther(FOCUS_RED[tier], last?.type, rand)
  let total = between(lo, hi, rand)
  // Never the same count twice in a row (the gentle range allows it from level 1).
  if (last && total === last.total && hi > lo) total = total === hi ? total - 1 : total + 1

  if (type === 'shape') {
    // Hearts arrive at level 2, bunnies at level 4.
    const kind = focus === 'heart' || level < 4 ? 'heart' : level === 4 ? 'bunny' : pickOther(['heart', 'bunny'], lastKind, rand)
    const s = SHAPES[kind]
    const many = `${total} ${plural(total, s.one, s.many)}`
    return {
      type, friend, kind, parts: [total], total, picture: s.picture,
      say: `${who} wants ${many}.`, want: `${who} wants ${many}.`,
      named: `${many}!`,
      accept: (b) => b.kindName === kind,
    }
  }
  if (type === 'dots') {
    // A real quantity match: some balloons carry dots, and only those with this many go in the basket.
    // Tier 1 keeps to 2–5 dots and tier 2 to 2–6 (shown on the card as a dice face); tier 3 asks for 3–8 from the numeral alone.
    const dots = tier === 3 ? between(3, 8, rand) : between(2, tier === 2 ? 6 : 5, rand)
    return {
      type, friend, dots, parts: [DOT_FINDS], total: DOT_FINDS,
      say: `${who} wants the balloons with ${dots} dots.`, want: `${who} wants the balloons with ${dots} dots.`,
      named: `${dots} dots, every one!`,
      accept: (b) => b.dots === dots,
    }
  }
  const colour = focus === 'red' ? 'red' : pickOther(Object.keys(SKY_COLOURS), lastColour, rand)
  // Dotted balloons from a dots request belong to that request only.
  const accept = (b) => !b.dots && COLOURED_KINDS.includes(b.kindName) && colourName(b.color) === colour
  if (type === 'pair') {
    // Two colours in one basket: "3 red and 2 blue". Each colour has to be right, so the child sorts as well as counts.
    total = Math.max(3, Math.min(total, tier === 3 ? 10 : 8))
    const a = between(Math.ceil(total / 2), Math.min(5, total - 1), rand)
    const b = total - a
    const second = pickOther(Object.keys(SKY_COLOURS), colour, rand)
    const colours = [colour, second]
    const both = `${a} ${colour} and ${b} ${second} ${balloonWord(2)}`
    return {
      type, friend, colours, parts: [a, b], total,
      say: `${who} wants ${both}.`, want: `${who} wants ${both}.`,
      named: `${a} ${colour} and ${b} ${second} make ${total}!`,
      accept: (x) => !x.dots && COLOURED_KINDS.includes(x.kindName) && colours.includes(colourName(x.color)),
    }
  }
  if (type === 'same') {
    // Making two bunches the same: the friend already holds some (drawn in their ten-frame), the other friend more.
    // The child works out the difference and gives just that many.
    const has = between(2, 6, rand)
    const n = between(2, Math.min(5, 10 - has), rand)
    const ref = has + n
    const other = pickOther(FRIENDS.filter((f) => f !== friend), null, rand)
    return {
      type, friend, other, colour, ref, has, parts: [n], total: n,
      say: `${other.name} has ${ref} ${colour} balloons. ${who} has ${has}. Give ${who} enough to have the same.`,
      want: `Give ${who} enough ${colour} balloons to have the same as ${other.name}.`,
      named: `${has} and ${n} more make ${ref}, the same as ${other.name}!`,
      accept,
    }
  }
  if (type === 'more' || type === 'less') {
    // One more or one less than another friend's bunch, which the card shows: the child works out the number.
    const ref = between(type === 'more' ? 3 : 4, Math.max(5, Math.min(9, hi)), rand)
    const n = type === 'more' ? ref + 1 : ref - 1
    const other = pickOther(FRIENDS.filter((f) => f !== friend), null, rand)
    const how = type === 'more' ? 'one more' : 'one less'
    return {
      type, friend, other, colour, ref, parts: [n], total: n,
      say: `${other.name} has ${ref} ${colour} balloons. ${who} wants ${how} ${colour} balloon than ${other.name}.`,
      want: `${who} wants ${how} ${colour} balloon than ${other.name}.`,
      named: `${n}! ${how[0].toUpperCase()}${how.slice(1)} than ${ref} is ${n}.`,
      accept,
    }
  }
  if (type === 'add') {
    // Two small groups: "3, then 2 more". The first group is the bigger one, so the child counts on from it.
    // Tiers 1 and 2 keep each group to one row of five; tier 3 lets the first group fill most of a ten-frame.
    total = Math.max(total, 3)
    if (tier === 3) total = Math.min(total, 10)
    const a = tier === 3 ? between(Math.max(Math.ceil(total / 2), total - 4), total - 1, rand) : between(Math.max(Math.ceil(total / 2), total - 5), Math.min(5, total - 1), rand)
    const b = total - a
    return {
      type, friend, colour, parts: [a, b], total,
      say: `${who} wants ${a} ${colour} ${balloonWord(a)}, then ${b} more.`,
      want: `${who} wants ${a} ${colour}, then ${b} more.`,
      named: `${a} and ${b} more make ${total}!`,
      accept,
    }
  }
  const many = `${total} ${colour} ${balloonWord(total)}`
  return {
    type: 'colour', friend, colour, parts: [total], total,
    say: `${who} wants ${many}.`, want: `${who} wants ${many}.`,
    named: `${many}!`,
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

/**
 * Dot positions (0–1 across a balloon's face) for a dotted sky balloon: a scattered, non-dice arrangement,
 * so matching the card means counting the dots, not matching a picture. The same `n` always looks the same.
 */
export function scatterLayout(n) {
  let seed = n * 7919 + 13
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const spots = []
  for (let tries = 0; spots.length < n && tries < 4000; tries++) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 0.36
    const p = [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 1.1]
    if (spots.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) > (n > 6 ? 0.2 : 0.24))) spots.push(p)
  }
  return spots
}
