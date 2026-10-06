// Pure curriculum rules are deterministic so every adventure can be inspected
// independently of graphics, audio, storage, or a child's pointer device.

export const colourHex = { Red: '#f37983', Yellow: '#ffda74', Blue: '#7caeea', Orange: '#f3ac6f', Green: '#89cba4', Purple: '#b195df' }

// Two primary colours and the secondary colour they make.
export const colourMixes = [['Red', 'Yellow', 'Orange'], ['Yellow', 'Blue', 'Green'], ['Blue', 'Red', 'Purple']]

const parcelColours = ['Red', 'Yellow', 'Blue', 'Green', 'Purple']
const shapes = ['Circle', 'Triangle', 'Square', 'Star']

const animalTracks = [
  ['🐾 Four paw prints', 'fox'],
  ['🐦 Three little toes', 'bird'],
  ['🦆 Webbed feet', 'duck'],
  ['🐌 One long slime trail', 'snail'],
]

const compareWords = {
  size: ['biggest', 'smallest'],
  number: ['largest number', 'smallest number'],
  length: ['longest', 'shortest'],
  depth: ['deepest', 'nearest the surface'],
}

const memoryPrompts = {
  'tool-twins': 'Match each helper to their tool.',
  'letter-buddies': 'Match each big letter to its little letter.',
}

const pathPrompts = {
  bee: 'Plan a pollen delivery to the flower.',
  turtle: 'Plan a route to the turtle’s pearl.',
  robot: 'Program a route to rescue the rocket.',
  penguin: 'Plan a safe route to the fish picnic.',
}

// Each glyph is a list of strokes, in the order and direction children are taught to form
// them; each stroke is a list of points with y = -2 at the top and y = 2 on the baseline.
// Capitals: lines start at the top, go down before across, and across left to right.
const capitalStrokes = {
  L: [[[-1, -2], [-1, 2], [2, 2]]],
  T: [[[0, -2], [0, 2]], [[-2, -2], [2, -2]]],
  V: [[[-2, -2], [0, 2], [2, -2]]],
  A: [[[0, -2], [-2, 2]], [[0, -2], [2, 2]], [[-1, 0], [1, 0]]],
  // Down; then from the top, slant down and push straight up.
  N: [[[-2, -2], [-2, 2]], [[-2, -2], [2, 2], [2, -2]]],
}

// Little letters follow the early-years print of the letter tiles (LETTER_PATHS in engine.js:
// an 80-wide box, x-height 45, baseline 100, ascenders 10): a single-storey a, an l with a tail.
// Curly letters start at the top right and go round anticlockwise, as in "c, then up and down".
const PRINT = 4 / 90
const fromPrint = ([x, y]) => [(x - 40) * PRINT, (y - 10) * PRINT - 2]
// An ellipse from angle a0 to a1 in degrees; y grows downwards, so falling angles go anticlockwise.
const arc = (cx, cy, rx, ry, a0, a1) => Array.from({ length: 33 }, (_, i) => {
  const t = ((a0 + ((a1 - a0) * i) / 32) * Math.PI) / 180
  return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]
})
const bezier = (p0, p1, p2, p3) => Array.from({ length: 13 }, (_, i) => {
  const t = i / 12
  const u = 1 - t
  return [0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k])
})
// Back up the stem and over the hump, then down (n, h, m).
const hump = (x, w) => [
  ...bezier([x, 64], [x + 2, 52], [x + w * 0.3, 45], [x + w * 0.55, 45]),
  ...bezier([x + w * 0.55, 45], [x + w * 0.85, 45], [x + w, 51], [x + w, 62]),
  [x + w, 100],
]
const tail = (x) => bezier([x, 86], [x, 96], [x + 6, 100], [x + 16, 100])
const ball = arc(36, 72.5, 24, 27.5, -40, -360)
const littleStrokes = {
  l: [[[34, 10], ...tail(34)]],
  t: [[[38, 22], ...tail(38)], [[22, 45], [56, 45]]],
  c: [arc(39.5, 72.5, 25, 27.5, -42.3, -317.7)],
  o: [arc(40, 72.5, 25, 27.5, -60, -420)],
  a: [[...ball, [60, 45], [60, 100]]],
  d: [[...ball, [60, 10], [60, 100]]],
  n: [[[20, 45], [20, 100], ...hump(20, 40)]],
  h: [[[20, 10], [20, 100], ...hump(20, 40)]],
  m: [[[12, 45], [12, 100], ...hump(12, 28), ...hump(40, 28)]],
  s: [[
    ...bezier([58, 53], [54, 47], [47, 45], [40, 45]), ...bezier([40, 45], [30, 45], [22, 50], [22, 58]),
    ...bezier([22, 58], [22, 67], [30, 69], [40, 72]), ...bezier([40, 72], [51, 75], [59, 78], [59, 87]),
    ...bezier([59, 87], [59, 96], [50, 100], [40, 100]), ...bezier([40, 100], [31, 100], [24, 97], [20, 91]),
  ]],
}
for (const [letter, strokes] of Object.entries(littleStrokes)) littleStrokes[letter] = strokes.map((stroke) => stroke.map(fromPrint))

// Each level's five letters, easiest first, with a word that begins with the letter's sound.
// Little steps: big straight-line letters. Growing: little letters, then the curly c family.
// Explorer: more curly letters and the "down, back up and over" family.
const letterSets = [
  [['L', 'lion', '🦁'], ['T', 'tiger', '🐯'], ['V', 'van', '🚐'], ['A', 'apple', '🍎'], ['N', 'nose', '👃']],
  [['l', 'leaf', '🍃'], ['t', 'tent', '⛺'], ['c', 'cat', '🐱'], ['o', 'octopus', '🐙'], ['a', 'ant', '🐜']],
  [['d', 'dog', '🐶'], ['n', 'nut', '🥜'], ['h', 'hat', '🎩'], ['m', 'moon', '🌙'], ['s', 'sun', '☀️']],
]
const glyphStrokes = { ...capitalStrokes, ...littleStrokes }
const digitStrokes = [
  ['1', [[[0, -2], [0, 2]]]],
  ['2', [[[-1.6, -1], [-1.3, -1.7], [-0.5, -2], [0.6, -1.9], [1.4, -1.4], [1.5, -0.7], [1, 0.1], [-1.6, 2], [1.7, 2]]]],
  ['3', [[[-1.4, -1.7], [-0.5, -2], [0.8, -1.8], [1.5, -1.2], [1.2, -0.5], [0, 0], [1.2, 0.5], [1.5, 1.2], [0.8, 1.8], [-0.5, 2], [-1.4, 1.7]]]],
  ['4', [[[-1, -2], [-1, 0.6], [1.7, 0.6]], [[1, -2], [1, 2]]]],
  ['7', [[[-1.6, -2], [1.6, -2], [-0.8, 2]]]],
]

const bedtimeRoutines = [
  ['breakfast', 8, 0],
  ['outdoor play', 10, 30],
  ['a bedtime story', 7, 0],
  ['lunch', 12, 0],
  ['an afternoon snack', 3, 30],
]

const experimentQuestions = {
  magnet: 'Will the magnet attract it?',
  float: 'Will it float in water?',
  grow: 'Will this help a plant grow?',
}
const experimentFacts = {
  magnet: 'Iron and many steels are attracted to magnets.',
  float: 'Floating depends on the object’s material, shape, and trapped air.',
  grow: 'Plants need water, light, nutrients, and space.',
}

// Mulberry32: a small seeded generator, so a seed always gives the same puzzle.
function random(seed) {
  return () => {
    seed = ((seed | 0) + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(values, rng) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const clockTime = (hour, minute) => `${hour}:${String(minute).padStart(2, '0')}`

// Board positions: the camera looks down at about 50 degrees, which shortens the board's depth to
// 77%, so glyphs are stretched that much front to back to look as drawn. Dots are then spaced
// evenly along each stroke, keeping its corners (and the turn where a stroke goes back up its line).
// `trail` follows the stroke closely (five steps per dot) so curves are drawn smooth; `marks` are
// the trail positions of the dots.
const GLYPH_X = 1.15
const GLYPH_Z = 1.5
const DOT_SPACING = 0.9
const TRAIL_STEPS = 5
function resample(points) {
  const placed = points.map(([x, y]) => [x * GLYPH_X, y * GLYPH_Z])
    .filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6)
  const pieces = [[placed[0]]]
  for (let i = 1; i < placed.length; i++) {
    pieces.at(-1).push(placed[i])
    const next = placed[i + 1]
    if (!next) break
    const [ax, ay] = [placed[i][0] - placed[i - 1][0], placed[i][1] - placed[i - 1][1]]
    const [bx, by] = [next[0] - placed[i][0], next[1] - placed[i][1]]
    const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))))
    if (turn > 0.6) pieces.push([placed[i]])
  }
  const dots = []
  const trail = []
  const marks = []
  for (const piece of pieces) {
    const lengths = [0]
    for (let i = 1; i < piece.length; i++) lengths.push(lengths[i - 1] + Math.hypot(piece[i][0] - piece[i - 1][0], piece[i][1] - piece[i - 1][1]))
    const total = lengths.at(-1)
    const steps = Math.max(1, Math.round(total / DOT_SPACING)) * TRAIL_STEPS
    for (let k = 0; k < steps; k++) {
      const at = (total * k) / steps
      let i = 1
      while (i < piece.length - 1 && lengths[i] < at) i++
      const t = (at - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1)
      trail.push([piece[i - 1][0] + (piece[i][0] - piece[i - 1][0]) * t, piece[i - 1][1] + (piece[i][1] - piece[i - 1][1]) * t])
      if (k % TRAIL_STEPS === 0) {
        dots.push(trail.at(-1))
        marks.push(trail.length - 1)
      }
    }
  }
  trail.push(placed.at(-1))
  dots.push(placed.at(-1))
  marks.push(trail.length - 1)
  return { dots, trail, marks }
}

// A pattern of random cells with at least one filled in.
function randomCells(count, chance, rng) {
  const cells = Array.from({ length: count }, () => rng() < chance)
  if (!cells.some(Boolean)) cells[0] = true
  return cells
}

export function challenge(g, level, round, seed) {
  const rng = random(seed + round * 7919 + level * 103)
  const int = (min, max) => min + Math.floor(rng() * (max - min + 1))
  const pick = (values) => values[int(0, values.length - 1)]
  // The answer and its neighbours; a fourth option from the second level.
  const choices = (answer) =>
    shuffle([...new Set([answer, Math.max(0, answer - 1), answer + 1, answer + 2])].slice(0, 3 + Number(level > 0)), rng)

  const c = { mode: g.mode, round, level, prompt: '', fact: '', tiles: [] }
  switch (g.mode) {
    case 'collect':
      c.target = int(1, 3 + level * 2)
      c.total = c.target + 2 + level
      c.item = g.item
      c.distractor = g.distractor
      c.prompt = `${g.verb} ${c.target} ${g.noun}.`
      c.fact = g.reward
      break

    case 'match':
      c.variant = g.variant
      if (g.variant === 'colour') {
        c.target = pick(parcelColours)
        c.tiles = shuffle([...new Set([c.target, ...shuffle(parcelColours, rng)])].slice(0, 3 + level), rng)
        c.prompt = `Deliver the ${c.target.toLowerCase()} parcel.`
      }
      if (g.variant === 'shape') {
        c.target = pick(shapes)
        c.tiles = shuffle(shapes, rng)
        c.prompt = `Find the ${c.target.toLowerCase()} key.`
      }
      if (g.variant === 'shadow') {
        c.tiles = shuffle(['rocket', 'tree', 'rabbit', 'boat'], rng)
        c.target = pick(c.tiles)
        c.prompt = 'Which toy makes this shadow?'
      }
      if (g.variant === 'tracks') {
        const [marks, animal] = animalTracks[round % animalTracks.length]
        c.target = animal
        c.tiles = shuffle(animalTracks.map((track) => track[1]), rng)
        c.prompt = `Who left these tracks? ${marks}`
        c.fact = `These tracks belong to a ${animal}.`
      }
      break

    case 'sort':
      c.bins = g.bins
      c.items = shuffle(g.items, rng).slice(0, level === 0 ? 4 : 6)
      c.prompt = 'Choose a toy, then choose its home.'
      c.fact = 'You sorted every toy by what it has in common.'
      break

    case 'pattern':
      if (g.kind === 'number') {
        const start = int(1, 5)
        const step = level === 0 ? 1 : pick([2, 3, 5])
        c.pattern = Array.from({ length: 5 }, (_, i) => start + i * step)
        c.fact = `Each number grows by ${step}.`
      } else {
        const tokens = shuffle(g.tokens, rng)
        const unit = level === 0 ? [tokens[0], tokens[1]] : level === 1 ? [tokens[0], tokens[0], tokens[1]] : tokens
        // Two full repeats, then the first token of a third.
        c.pattern = Array.from({ length: unit.length * 2 + 1 }, (_, i) => unit[i % unit.length])
        c.tiles = shuffle(g.tokens, rng)
        c.fact = `The repeating part is ${unit.join(' ')}.`
      }
      c.gap = level === 0 ? c.pattern.length - 1 : int(1, c.pattern.length - 2)
      c.target = c.pattern[c.gap]
      if (g.kind === 'number') c.tiles = choices(c.target)
      c.prompt = 'What belongs in the empty place?'
      break

    case 'order':
      c.stages = g.stages
      c.tiles = shuffle(g.stages, rng)
      c.prompt = 'Tell the story from beginning to end.'
      c.fact = g.fact
      break

    case 'compare': {
      c.variant = g.variant
      let values = shuffle([1, 2, 3, 4].slice(0, level === 0 ? 3 : 4), rng)
      if (g.variant === 'number') values = values.map((v) => v * (level + 1) + int(0, 1))
      // Equal comparisons are deliberately excluded: every prompt has one answer.
      c.values = [...new Set(values)]
      c.greater = round % 2 === 0
      c.target = c.greater ? Math.max(...c.values) : Math.min(...c.values)
      c.prompt = `Find the ${compareWords[g.variant][c.greater ? 0 : 1]}.`
      c.item = g.item
      break
    }

    case 'memory': {
      // A design's easyPairs (Letter Buddies' C/c, O/o...) give the first level one gentle pair.
      const pairs = level === 0 && g.easyPairs
        ? [shuffle(g.easyPairs, rng)[0], shuffle(g.pairs, rng)[0]]
        : shuffle(g.pairs, rng).slice(0, 2 + level)
      c.cards = shuffle(pairs.flatMap(([a, b], pair) => [{ text: a, pair }, { text: b, pair }]), rng)
      c.prompt = memoryPrompts[g.id] ?? 'Find the matching pairs.'
      break
    }

    case 'echo':
      c.tokens = g.tokens
      c.notes = g.notes
      c.sequence = Array.from({ length: 2 + level + (round > 2 ? 1 : 0) }, () => int(0, g.tokens.length - 1))
      c.prompt = 'Watch the song. Then play it back.'
      break

    case 'path': {
      c.size = 3 + level
      const last = c.size - 1
      const corners = [[0, 0], [last, 0], [0, last], [last, last]]
      c.start = level === 0 ? pick(corners) : [int(0, last), int(0, last)]
      const farEnough = []
      for (let y = 0; y < c.size; y++) {
        for (let x = 0; x < c.size; x++) {
          if (Math.abs(x - c.start[0]) + Math.abs(y - c.start[1]) >= last) farEnough.push([x, y])
        }
      }
      c.goal = pick(farEnough)

      // Reserve a shuffled shortest path, rather than an invariant border route.
      const safe = new Set([c.start.join(',')])
      let [x, y] = c.start
      while (x !== c.goal[0] || y !== c.goal[1]) {
        const steps = []
        if (x !== c.goal[0]) steps.push([Math.sign(c.goal[0] - x), 0])
        if (y !== c.goal[1]) steps.push([0, Math.sign(c.goal[1] - y)])
        const [dx, dy] = pick(steps)
        x += dx
        y += dy
        safe.add(`${x},${y}`)
      }
      c.obstacles = []
      for (let y = 0; y < c.size; y++) {
        for (let x = 0; x < c.size; x++) {
          if (!safe.has(`${x},${y}`) && rng() < 0.3 + level * 0.12) c.obstacles.push([x, y])
        }
      }
      c.hero = g.hero
      c.goalItem = g.goal
      c.obstacleItem = g.obstacle || 'stone'
      c.prompt = pathPrompts[g.hero]
      break
    }

    case 'trace':
      c.hero = g.hero
      c.trace = g.trace
      if (g.trace === 'spiral') {
        c.points = Array.from({ length: 25 }, (_, i) => {
          const t = i / 24
          const angle = t * Math.PI * 3
          const radius = 2.7 * (1 - t) + 0.3
          return [Math.cos(angle) * radius, Math.sin(angle) * radius]
        })
      }
      if (g.trace === 'wave') {
        c.points = Array.from({ length: 25 }, (_, i) => [-3 + i / 4, Math.sin((i / 24) * Math.PI * (2 + level)) * 1.7])
      }
      if (g.trace === 'letter' || g.trace === 'number') {
        ;[c.glyph, c.word, c.picture] = g.trace === 'letter' ? letterSets[level][round % 5] : [digitStrokes[round % 5][0]]
        const strokes = g.trace === 'letter' ? glyphStrokes[c.glyph] : digitStrokes[round % 5][1]
        const sampled = strokes.map((stroke) => resample(stroke))
        c.strokes = sampled.map(({ dots }) => dots)
        c.trails = sampled.map(({ trail }) => trail)
        c.marks = sampled.map(({ marks }) => marks)
        c.points = []
        c.strokeStarts = []
        for (const stroke of c.strokes) {
          c.strokeStarts.push(c.points.length)
          c.points.push(...stroke)
        }
      }
      c.prompt = c.glyph ? `Follow the trail to draw ${c.glyph}.` : 'Follow the glowing dots in order.'
      if (g.trace === 'letter') {
        // Letters are spoken on their own, as capitals, so voices say their names ("ay", never "uh").
        const size = c.glyph === c.glyph.toUpperCase() ? 'big' : 'little'
        const name = [size === 'big' ? 'Big' : 'Little', c.glyph.toUpperCase()]
        c.prompt = `Trace ${size} ${c.glyph}.`
        c.say = [`Trace ${size}`, c.glyph.toUpperCase()]
        c.fact = `${size === 'big' ? 'Big' : 'Little'} ${c.glyph} is for ${c.picture} ${c.word}.`
        c.factSay = [...name, `is for ${c.word}.`]
      }
      break

    case 'arithmetic': {
      const a = int(1, 2 + level)
      const b = int(1, 2 + level)
      const acorns = (n) => `${n} acorn${n === 1 ? '' : 's'}`
      c.operation = g.operation
      c.item = g.item
      if (g.operation === 'add') {
        c.a = a
        c.b = b
        c.target = a + b
        c.prompt = `Bring ${acorns(a)} and ${acorns(b)} together. How many altogether?`
      }
      if (g.operation === 'subtract') {
        c.a = a + b
        c.b = b
        c.target = a
        c.prompt = `${c.a} fish are here. ${b} swim away. How many remain?`
      }
      if (g.operation === 'multiply') {
        c.a = a + 1
        c.b = b + 1
        c.target = c.a * c.b
        c.prompt = `${c.a} trays have ${c.b} buns each. How many buns?`
      }
      if (g.operation === 'divide') {
        c.a = (a + 1) * b
        c.b = a + 1
        c.target = b
        c.prompt = `Share ${c.a} stars between ${c.b} friends. How many each?`
      }
      c.tiles = choices(c.target)
      break
    }

    case 'balance':
      c.target = int(3, 5 + level * 3)
      c.base = int(0, c.target - 1)
      c.tiles = [1, 2, 3]
      c.item = g.item
      c.prompt = `Balance ${c.target} ${g.unit}. The other pan starts with ${c.base}.`
      c.fact = `${c.base} plus ${c.target - c.base} equals ${c.target}.`
      break

    case 'mix': {
      const [first, second, result] = colourMixes[(round + level) % colourMixes.length]
      c.ingredients = [first, second]
      c.target = result
      c.prompt = `Make ${result.toLowerCase()} paint.`
      c.fact = `${first} and ${second} make ${result.toLowerCase()}.`
      break
    }

    case 'fraction':
      c.denominator = level === 0 ? 2 : level === 1 ? 4 : pick([4, 6, 8])
      c.numerator = int(1, c.denominator - 1)
      c.rect = g.food === 'quilt'
      c.prompt = `Colour ${c.numerator} of ${c.denominator} equal parts of the ${g.food}.`
      c.fact = `You coloured ${c.numerator}/${c.denominator} of the whole.`
      break

    case 'clock':
      c.hour = int(1, 12)
      c.minute = level === 0 ? 0 : level === 1 ? pick([0, 30]) : pick([0, 15, 30, 45])
      c.prompt = `${g.event} ${clockTime(c.hour, c.minute)}.`
      if (g.id === 'bakery-alarm' && level > 0) {
        // Work back from the ready time to when the bake started, on a 12-hour dial.
        c.bakeMinutes = pick([15, 30, 45])
        const start = ((c.hour % 12) * 60 + c.minute - c.bakeMinutes + 720) % 720
        c.startHour = Math.floor(start / 60) || 12
        c.startMinute = start % 60
        c.prompt = `The bake starts at ${clockTime(c.startHour, c.startMinute)} and lasts ${c.bakeMinutes} minutes. Set the ready time.`
      }
      if (g.id === 'bunny-bedtime') {
        const [routine, hour, minute] = bedtimeRoutines[round % bedtimeRoutines.length]
        c.hour = hour
        c.minute = level ? minute : 0
        c.prompt = `Set bunny’s clock for ${routine} at ${clockTime(c.hour, c.minute)}.`
      }
      c.fact = 'The short hand shows hours. The long hand shows minutes.'
      break

    case 'mirror':
      if (g.id === 'snowflake-studio') {
        c.snowflake = true
        c.rings = 2 + level
        c.pattern = randomCells(c.rings, 0.6, rng)
        c.prompt = 'Reflect the icy branches. Make six matching arms.'
      } else {
        c.size = level === 0 ? 3 : 4
        c.pattern = randomCells(c.size * c.size, 0.45, rng)
        c.prompt = `Reflect the ${g.subject} across the mirror line.`
      }
      break

    case 'rotate':
      c.target = int(0, 3)
      c.initial = (c.target + 1 + int(0, 2)) % 4
      c.shape = g.shape
      if (g.id === 'tangram-turntable') {
        c.tangram = true
        c.turns = Array.from({ length: 7 }, () => int(1, 3))
        c.prompt = 'Fit all seven tangram pieces to make one square.'
      } else {
        c.prompt = `Turn the ${g.subject} to match its outline.`
      }
      break

    case 'measure':
      c.target = int(2, 4 + level * 2)
      c.prompt = `Measure the ${g.subject} with ${g.unit}.`
      c.fact = `The length is ${c.target} equal ${g.unit}, with no gaps.`
      break

    case 'spell': {
      // Each adventure starts at a different word, then walks the list without repeats.
      const [word, picture, friend] = g.words[(round + level + Math.abs(Math.floor(seed))) % g.words.length]
      // Extra letters are never in the word, so each difficulty always adds `level` new tiles.
      const extraLetters = shuffle('AEIOURSTLM'.split('').filter((l) => !word.includes(l)), rng).slice(0, level)
      c.word = word
      c.picture = picture
      if (friend) c.friend = friend
      c.tiles = shuffle([...new Set([...word, ...extraLetters])], rng)
      // Never deal the word's letters already in reading order, or tapping left to right spells it.
      const inOrder = () => [...new Set(word)].every((l, i, w) => !i || c.tiles.indexOf(l) > c.tiles.indexOf(w[i - 1]))
      for (let turn = 0; turn < c.tiles.length && inOrder(); turn++) c.tiles.push(c.tiles.shift())
      if (inOrder()) c.tiles.reverse()
      c.prompt = `Spell ${word.toLowerCase()}.`
      break
    }

    case 'rhyme': {
      // Each adventure starts at a different set, then walks the list without repeats. Words are
      // lowercase, as children first read them; each one names its clay picture.
      const [word, answer, ...others] = g.sets[(round + level + Math.abs(Math.floor(seed))) % g.sets.length].map((w) => w.toLowerCase())
      c.word = word
      c.target = answer
      // Little steps: the rhyme and one other word; Growing: two others; Explorer: three.
      c.tiles = shuffle([answer, ...others.slice(0, level + 1)], rng)
      c.prompt = `Which word rhymes with ${word}?`
      // The choices are read aloud one by one, so a child who can't read yet hears every word.
      c.say = [`Which word rhymes with ${word}?`, ...c.tiles.map((w, i) => (i === c.tiles.length - 1 ? `or ${w}?` : `${w},`))]
      c.fact = `${word}, ${answer}. They rhyme!`
      break
    }

    case 'choice': {
      c.storyIndex = (round + level) % g.challenges.length
      const [prompt, answer, ...others] = g.challenges[c.storyIndex]
      c.prompt = prompt
      c.acceptable = Array.isArray(answer) ? answer : [answer]
      c.target = c.acceptable[0]
      c.tiles = shuffle([...c.acceptable, ...others], rng)
      c.fact = c.target
      break
    }

    case 'experiment': {
      const [object, result, toy] = g.sets[(round + level) % g.sets.length]
      c.object = object
      c.toy = toy
      c.target = result
      c.property = g.property
      c.prompt = `${object}: ${experimentQuestions[g.property]}`
      c.fact = `${object}: ${result ? 'Yes' : 'No'}! ${experimentFacts[g.property]}`
      break
    }

    case 'pitch':
      c.notes = shuffle([220, 440, 660].slice(0, 2 + Number(level > 0)), rng)
      c.greater = round % 2 === 0
      c.target = c.notes.indexOf(c.greater ? Math.max(...c.notes) : Math.min(...c.notes))
      c.prompt = `Listen. Which ${g.subject === 'birds' ? 'bird' : 'crystal'} makes the ${c.greater ? 'highest' : 'lowest'} sound?`
      break

    case 'rhythm':
      // The first step is always a beat, so every rhythm has somewhere to start.
      c.pattern = Array.from({ length: 4 + level }, (_, i) => i === 0 || rng() < 0.6)
      c.prompt = 'Listen to the beats and rests. Build the same rhythm.'
      c.fact = 'A rest is a quiet space in the rhythm.'
      break

    case 'build':
      c.heights = Array.from({ length: 3 + Number(level > 0) }, () => int(1, 2 + level))
      c.positions = level === 0 ? [[0, 0], [1, 0], [2, 0]] : [[0, 0], [1, 0], [0, 1], [1, 1]]
      c.prompt = `Build the ${g.subject} to match the floor plan.`
      break

    case 'tenframe':
      c.target = int(1, 3 + level * 3)
      c.item = g.item
      c.prompt = `Put ${c.target} ${g.noun} in the ten spaces.`
      c.fact = `${c.target} filled spaces and ${10 - c.target} empty spaces make ten.`
      break

    default:
      throw new Error(`Unknown activity ${g.mode}`)
  }
  return c
}

// Walks a planned route; stops at the first step off the board or into an obstacle.
export function pathResult(c, plan) {
  let [x, y] = c.start
  const visited = [[x, y]]
  for (const [dx, dy] of plan) {
    x += dx
    y += dy
    const blocked = x < 0 || y < 0 || x >= c.size || y >= c.size || c.obstacles.some((p) => p[0] === x && p[1] === y)
    if (blocked) return { ok: false, visited, reason: 'That step meets an obstacle. Try another route.' }
    visited.push([x, y])
  }
  return { ok: x === c.goal[0] && y === c.goal[1], visited, reason: 'Keep planning until your friend reaches the treasure.' }
}

// A classical seven-piece tangram partition of a 4 × 4 square. Coordinates
// describe actual polygons, rather than seven copies of the same triangle.
export const tangramPieces = [
  { name: 'large triangle', vertices: [[0, 0], [4, 0], [2, 2]] },
  { name: 'large triangle', vertices: [[0, 0], [2, 2], [0, 4]] },
  { name: 'medium triangle', vertices: [[4, 4], [2, 4], [4, 2]] },
  { name: 'small triangle', vertices: [[2, 2], [3, 1], [3, 3]] },
  { name: 'small triangle', vertices: [[0, 4], [1, 3], [2, 4]] },
  { name: 'square', vertices: [[2, 2], [3, 3], [2, 4], [1, 3]] },
  { name: 'parallelogram', vertices: [[4, 0], [4, 2], [3, 3], [3, 1]] },
]
