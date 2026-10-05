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

// Each glyph is a list of strokes; each stroke is a list of corner points.
const letterStrokes = [
  ['A', [[[0, -2], [-2, 2]], [[0, -2], [2, 2]], [[-1, 0], [1, 0]]]],
  ['L', [[[-1, -2], [-1, 2], [2, 2]]]],
  ['M', [[[-2, -2], [-2, 2]], [[-2, -2], [0, 0], [2, -2]], [[2, -2], [2, 2]]]],
  ['V', [[[-2, -2], [0, 2], [2, -2]]]],
  ['N', [[[-2, -2], [-2, 2]], [[-2, -2], [2, 2]], [[2, -2], [2, 2]]]],
]
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

// Adds four evenly spaced points between each pair of corners.
function resample(corners) {
  return corners.flatMap((p, i) => {
    if (i === corners.length - 1) return [p]
    const next = corners[i + 1]
    return Array.from({ length: 5 }, (_, j) => [p[0] + ((next[0] - p[0]) * j) / 5, p[1] + ((next[1] - p[1]) * j) / 5])
  })
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
      const pairs = shuffle(g.pairs, rng).slice(0, 2 + level)
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
        const [glyph, strokes] = (g.trace === 'letter' ? letterStrokes : digitStrokes)[round % 5]
        c.glyph = glyph
        c.strokes = strokes.map(resample)
        c.points = []
        c.strokeStarts = []
        for (const stroke of c.strokes) {
          c.strokeStarts.push(c.points.length)
          c.points.push(...stroke)
        }
      }
      c.prompt = c.glyph ? `Follow the trail to draw ${c.glyph}.` : 'Follow the glowing dots in order.'
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
      const [word, picture] = g.words[(round + level) % g.words.length]
      const extraLetters = shuffle('AEIOURSTLM'.split(''), rng).slice(0, level)
      c.word = word
      c.picture = picture
      c.tiles = shuffle([...new Set([...word, ...extraLetters])], rng)
      c.prompt = `Spell ${word.toLowerCase()}.`
      break
    }

    case 'rhyme': {
      const [word, answer, ...others] = g.sets[(round + level) % g.sets.length]
      c.word = word
      c.target = answer
      c.tiles = shuffle([answer, ...others], rng)
      c.prompt = `Which word rhymes with ${word.toLowerCase()}?`
      c.fact = `${word.toLowerCase()} and ${answer.toLowerCase()} have the same ending sound.`
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
