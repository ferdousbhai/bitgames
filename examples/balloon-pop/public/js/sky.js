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
  // Yellow is only ever a mixing colour (and the crowned gold balloon counts as yellow then).
  '#ffd23f': 'yellow', '#ffdb58': 'yellow',
}
export const colourName = (hex) => NAME_OF[hex] ?? null
/** Yellow joins the sky only for mixing; it is printed a little deeper so the word reads on the cream card. */
export const YELLOW = '#ffd23f'
export const WORD_COLOURS = { ...SKY_COLOURS, yellow: '#e0a400' }
/** The colours a young child mixes: each secondary colour from two primaries. */
export const MIXES = { purple: ['red', 'blue'], orange: ['red', 'yellow'], green: ['blue', 'yellow'] }

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
/**
 * Tier 2 starts at level 3 and brings in the two-colour basket (sorting as well as counting), which colour there is
 * most of (comparing) and mixing a colour from two others, all within the first visit.
 */
const OPENING_2 = ['colour', 'shape', 'colour', 'pair', 'add', 'most', 'dots', 'mix', 'pair', 'shape']
/** Tier 3 adds new kinds of thinking, not only bigger numbers: one more / one less, two colours, and making two bunches the same. */
/** Tiers 2 and 3 also ask which colour a friend has most of, and for colours mixed from two others. */
const MIXED = { 1: ['colour', 'shape', 'add', 'dots'], 2: ['colour', 'shape', 'add', 'dots', 'pair', 'most', 'mix'], 3: ['colour', 'add', 'dots', 'more', 'less', 'same', 'pair', 'most', 'mix'] }
/**
 * The menu's focused skies, and the kinds of request each one mixes at each tier:
 * - red: all about red balloons, among pink, orange and purple ones that look close;
 * - heart: all about hearts (of any colour), growing from "4 hearts" to adding on, one more / one less and the same;
 * - three: every friend wants exactly three (of a colour, a shape, a dot number, or two colours), so the youngest
 *   practise finding the right ones and stopping at three, handed over with Give like any basket.
 */
const FOCUS = {
  red: { 1: ['colour', 'add'], 2: ['colour', 'add', 'pair'], 3: ['colour', 'add', 'pair', 'more', 'less', 'same'] },
  heart: { 1: ['shape'], 2: ['shape', 'add', 'more'], 3: ['shape', 'add', 'more', 'less', 'same'] },
  three: { 1: ['colour', 'shape'], 2: ['colour', 'shape', 'pair', 'dots'], 3: ['colour', 'shape', 'pair', 'dots', 'add'] },
}
/** Colours too close to tell apart as small dots or dashed slots on the card: a bunch or a two-colour basket never holds both. */
const CLOSE = { red: 'pink', pink: 'red' }

/**
 * The other friend in one more / one less / the same: one not yet at the picnic when there is one (they are still
 * out with their own bunch), never the friend asking.
 */
const otherFriend = (friend, away, rand) => {
  const out = FRIENDS.filter((f) => f !== friend && !away.includes(f.face))
  return pickOther(out.length ? out : FRIENDS.filter((f) => f !== friend), null, rand)
}
const between = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1))
const pickOther = (list, not, rand) => {
  const options = list.filter((x) => x !== not)
  return options[Math.floor(rand() * options.length)]
}
/** The next kind from the bag (refilled, shuffled, when it has none of these kinds left), never the last one again. */
function deal(kinds, not, rand, bag) {
  if (!bag) return pickOther(kinds, not, rand)
  let i = bag.findIndex((k) => kinds.includes(k) && (k !== not || kinds.length < 2))
  if (i < 0) {
    bag.splice(0, bag.length, ...shuffle(kinds, rand))
    i = Math.max(0, bag.findIndex((k) => k !== not))
  }
  return bag.splice(i, 1)[0]
}
const plural = (n, one, many) => (n === 1 ? one : many)
const balloonWord = (n) => plural(n, 'balloon', 'balloons')
const listWords = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)
const shuffle = (list, rand) => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The request for a level. `recent` (earlier requests, newest last) keeps friends, colours, kinds and counts varied.
 * Returns { type, friend, colour?, colours?, kind?, dots?, ref?, has?, parts: [n] or [a, b], total, say, want, named, accept(balloon) }.
 * `colours` (a two-colour basket) names the colour of each part; `has` is how many the friend already holds ('same',
 * and counting on in a tier 1–2 'add', where `total` is only the basket's part).
 * `say` is spoken once; `want` is the short reminder after a basket handed over too soon.
 * Every request is finished by handing the basket over, so stopping at the number is the child's decision.
 * `away` lists the friends already at the picnic: each request is for a friend who is not there yet, so a visit
 * gathers everyone once. `taught` lists the mixes already named this visit (a tier-3 mix then asks without naming them).
 * `reach` is the level the counts are sized by: the level itself, until a child is stepped down a tier, when it
 * goes back to that tier's first level so an eased child is asked for small numbers again (main.js stepDown).
 * `bag` (kept by the caller for a visit) deals the kinds of request like cards: every kind of the tier comes once
 * before any comes again, so a visit meets one more, one less, the same, most and mixing, not mostly one of them.
 */
export function makeRequest(level, recent = [], rand = Math.random, tier = 1, climb = 0, focus = null, away = [], taught = [], reach = level, bag = null) {
  const [lo, hi] = countRange(reach, tier, climb)
  const last = recent.at(-1)
  const lastColour = recent.findLast((r) => r.colour)?.colour
  const lastKind = recent.findLast((r) => r.kind)?.kind
  const waiting = FRIENDS.filter((f) => !away.includes(f.face))
  const friend = pickOther(waiting.length ? waiting : FRIENDS, waiting.length > 1 ? last?.friend : null, rand)
  const who = friend.name
  // A focused sky (the menu's Hearts, Red or Three) keeps to its own kinds of request, still counted into the basket.
  const kinds = FOCUS[focus]?.[tier]
  let type = tier < 3 ? (tier === 2 ? OPENING_2 : OPENING)[level - 1] : null
  if (!type || (kinds && !kinds.includes(type))) type = deal(kinds ?? MIXED[tier], last?.type, rand, bag)
  const three = focus === 'three'
  let total = three ? 3 : between(lo, hi, rand)
  // Never the same count twice in a row (the gentle range allows it from level 1).
  if (!three && last && total === last.total && hi > lo) total = total === hi ? total - 1 : total + 1

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
    // The friend wants a few of them, handed over like any basket: two numbers, how many dots and how many balloons.
    const dots = tier === 3 ? between(3, 8, rand) : between(2, tier === 2 ? 6 : 5, rand)
    const n = three ? 3 : tier === 1 ? between(2, 3, rand) : between(2, 4, rand)
    const these = `${n} ${balloonWord(n)} with ${dots} dots`
    return {
      type, friend, dots, parts: [n], total: n,
      say: `${who} wants ${these}.`, want: `${who} wants ${these}.`,
      named: `${n} ${balloonWord(n)}, ${dots} dots on every one!`,
      accept: (b) => b.dots === dots,
    }
  }
  if (type === 'most') {
    // Which colour does the friend have most of? Their bunch is jumbled on the card; the child counts each colour,
    // compares, and gives a few more of the one there is most of. Any of the bunch's colours goes in the basket,
    // so a guess is only found out at the hand-over. Tier 2: two colours at least 2 apart; tier 3: three colours, 1 apart.
    const trio = tier === 3
    // Red and pink never share a bunch: at the card's size they read as one colour.
    const names = shuffle(Object.keys(SKY_COLOURS), rand).filter((c, i, all) => !all.slice(0, i).includes(CLOSE[c])).slice(0, trio ? 3 : 2)
    const most = trio ? between(4, 7, rand) : between(4, 6, rand)
    const counts = trio ? [most, most - 1, between(1, most - 2, rand)] : [most, between(1, most - 2, rand)]
    const n = trio ? between(2, 3, rand) : between(1, 2, rand)
    const held = shuffle(names.flatMap((c, i) => Array(counts[i]).fill(SKY_COLOURS[c])), rand)
    const colourWords = listWords(shuffle(names, rand))
    return {
      type, friend, colour: names[0], colours: [names[0]], bunchColours: names, held, parts: [n], total: n,
      say: `${who} has ${colourWords} balloons. Which colour does ${who} have most of? Give ${who} ${n} more of that one.`,
      want: `Give ${who} ${n} more of the colour ${who} has most of.`,
      caption: `Which colour has most? Give ${who} ${n} more.`,
      named: `${most} ${names[0]} is the most! ${most} and ${n} more make ${most + n}.`,
      accept: (b) => !b.dots && COLOURED_KINDS.includes(b.kindName) && names.includes(colourName(b.color)),
    }
  }
  if (type === 'mix') {
    // A colour there is no balloon for: purple, orange or green, mixed from two others. Each new one needs one of each,
    // so 2 green is 2 blue and 2 yellow. Tier 2 names the two colours; tier 3 names them only the first time this visit.
    // Once a mix has been heard this visit, tier 2 asks for two, so "one of each, for each" is used, not just heard.
    const target = pickOther(Object.keys(MIXES), recent.findLast((r) => r.type === 'mix')?.target, rand)
    const [a, b] = MIXES[target]
    const n = tier === 3 ? between(2, 4, rand) : taught.includes(target) ? 2 : between(1, 2, rand)
    const tell = tier < 3 || !taught.includes(target)
    const these = `${n} ${target} ${balloonWord(n)}`
    const recipe = `${a[0].toUpperCase()}${a.slice(1)} and ${b} make ${target}.`
    return {
      type, friend, target, colours: [a, b], parts: [n, n], total: 2 * n, named: `${n} ${a} and ${n} ${b} make ${these}!`,
      recipe, told: tell,
      say: tell ? `${who} wants ${these}. ${recipe} Mix them!` : `${who} wants ${these}. Which two colours make ${target}?`,
      want: tell ? `${who} wants ${these}: one ${a} and one ${b} for each.` : `${who} wants ${these}, mixed from two colours.`,
      accept: (x) => !x.dots && (COLOURED_KINDS.includes(x.kindName) || x.kindName === 'gold') && [a, b].includes(colourName(x.color)),
    }
  }
  // What is counted: balloons of one colour, or in Hearts for friends, hearts of any colour.
  const hearts = focus === 'heart'
  const colour = hearts ? undefined : focus === 'red' ? 'red' : pickOther(Object.keys(SKY_COLOURS), lastColour, rand)
  const look = hearts ? { kind: 'heart', picture: SHAPES.heart.picture } : { colour }
  const things = (n) => (hearts ? `${n} ${plural(n, 'heart', 'hearts')}` : `${n} ${colour} ${balloonWord(n)}`)
  const thing = hearts ? 'heart' : `${colour} balloon`
  // Dotted balloons from a dots request belong to that request only.
  const accept = hearts ? (b) => b.kindName === 'heart' : (b) => !b.dots && COLOURED_KINDS.includes(b.kindName) && colourName(b.color) === colour
  if (type === 'pair') {
    // Two colours in one basket: "3 red and 2 blue". Each colour has to be right, so the child sorts as well as counts.
    total = Math.max(3, Math.min(total, tier === 3 ? 10 : 8))
    const a = between(Math.ceil(total / 2), Math.min(5, total - 1), rand)
    const b = total - a
    // Never red with pink: their empty dashed slots look alike on a small screen.
    const second = pickOther(Object.keys(SKY_COLOURS).filter((c) => c !== CLOSE[colour]), colour, rand)
    const colours = [colour, second]
    const both = `${a} ${colour} ${balloonWord(a)} and ${b} ${second} ${balloonWord(b)}`
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
    const other = otherFriend(friend, away, rand)
    return {
      type, friend, other, ...look, ref, has, parts: [n], total: n,
      say: `${other.name} has ${things(ref)}. ${who} has ${has}. Give ${who} enough to have the same.`,
      want: `Give ${who} enough ${hearts ? 'hearts' : `${colour} balloons`} to have the same as ${other.name}.`,
      named: `${has} and ${n} more make ${ref}, the same as ${other.name}!`,
      accept,
    }
  }
  if (type === 'more' || type === 'less') {
    // One more or one less than another friend's bunch, which the card shows: the child works out the number.
    // A tier-3 child well on the climb compares into the teens too (13 and one more is 14).
    const ref = between(type === 'more' ? 3 : 4, tier === 3 && climb >= 5 ? 13 : Math.max(5, Math.min(9, hi)), rand)
    const n = type === 'more' ? ref + 1 : ref - 1
    const other = otherFriend(friend, away, rand)
    const how = type === 'more' ? 'one more' : 'one less'
    return {
      type, friend, other, ...look, ref, parts: [n], total: n,
      say: `${other.name} has ${things(ref)}. ${who} wants ${how} ${thing} than ${other.name}.`,
      want: `${who} wants ${how} ${thing} than ${other.name}.`,
      named: `${n}! ${how[0].toUpperCase()}${how.slice(1)} than ${ref} is ${n}.`,
      accept,
    }
  }
  if (type === 'add') {
    // Two small groups: "3, then 2 more". The first group is the bigger one, so the child counts on from it.
    // Tiers 1 and 2 keep each group to one row of five; tier 3 lets the first group fill most of a ten-frame,
    // and once its counts reach the teens it asks for a full ten and a few more ("10, then 3 more"), on two frames.
    // Counting on (tiers 1–2) adds at least 2, so there is something to count on.
    total = Math.max(total, tier < 3 ? 4 : 3)
    if (tier === 3) total = Math.min(total, hi > 10 ? 14 : 10)
    const a = total > 10 ? 10 : tier === 3 ? between(Math.max(Math.ceil(total / 2), total - 4), total - 1, rand) : between(Math.max(Math.ceil(total / 2), total - 5), Math.min(5, total - 2), rand)
    const b = total - a
    if (tier < 3) {
      // Counting on: the friend already holds the first group (drawn filled on the card) and the child adds the rest,
      // heard as "4, 5. That's 5!" from where the friend's group ends. The basket wants only the b more.
      return {
        type, friend, ...look, has: a, parts: [a, b], total: b,
        say: `${who} has ${things(a)}. ${who} wants ${b} more.`,
        want: `${who} has ${a}. ${who} wants ${b} more.`,
        named: `${a} and ${b} more make ${total}!`,
        accept,
      }
    }
    return {
      type, friend, ...look, parts: [a, b], total,
      say: `${who} wants ${things(a)}, then ${b} more.`,
      want: `${who} wants ${hearts ? things(a) : `${a} ${colour}`}, then ${b} more.`,
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
 * so matching the card means counting the dots, not matching a picture. Each number has several arrangements
 * (`variant`), so a child cannot learn one picture per number and has to count.
 */
export function scatterLayout(n, variant = 0) {
  let seed = n * 7919 + 13 + variant * 104729
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
