import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { games, instructions, themes } from '../catalogue.mjs'
import { mixToyPaint } from '../originals/colour-model.js'
import { compareBuilds } from '../../rocket-garage/public/js/workshop.js'
import { DEFAULT_ROCKET } from '../../rocket-garage/public/js/parts.js'
import { challenge, pathResult, tangramPieces } from '../runtime/challenges.js'
import { findRoute } from './route.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const exampleIds = readdirSync(root).filter((d) => existsSync(join(root, d, 'game.json')))
const readJson = (...parts) => JSON.parse(readFileSync(join(root, ...parts)))
const validAges = (ages) => ages?.length === 2 && ages[0] >= 2 && ages[1] <= 8 && ages[0] <= ages[1]
const MiB = 1024 * 1024

test('exactly 100 standalone games; 88 distinct new learning designs', () => {
  assert.equal(exampleIds.length, 100)
  assert.equal(games.length, 88)
  assert.equal(new Set(games.map((g) => g.id)).size, 88)
  assert.equal(new Set(games.map((g) => g.tagline)).size, 88)
  assert.equal(new Set(games.map((g) => g.mode)).size, 26)
  for (const id of exampleIds) {
    const meta = readJson(id, 'game.json')
    assert.ok(validAges(meta.ages), `${id}: age range`)
    assert.ok(meta.learning, `${id}: learning goal`)
  }
  for (const g of games) {
    assert.ok(validAges(g.ages), `${g.id}: age range`)
    assert.ok(instructions[g.mode])
    const meta = readJson(g.id, 'game.json')
    assert.equal(meta.id, g.id)
    assert.ok(['puzzle', 'animals', 'space'].includes(meta.category))
  }
})

/** Every public file the store hashes: hidden files and the hosting files are not part of the manifest. */
const unhashed = new Set(['bitgames.json', '_headers', '_redirects'])
function shippedFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .flatMap((e) => {
      if (e.isDirectory()) return shippedFiles(join(dir, e.name), `${prefix}${e.name}/`)
      return unhashed.has(e.name) ? [] : [prefix + e.name]
    })
}

test('every example ships exactly its hashed manifest within store limits', () => {
  for (const id of exampleIds) {
    const dir = join(root, id, 'public')
    const manifest = JSON.parse(readFileSync(join(dir, 'bitgames.json')))
    const files = shippedFiles(dir).sort()
    assert.deepEqual(Object.keys(manifest.files).sort(), files, id)
    assert.ok(files.length <= 40, `${id}: file limit`)
    let bytes = 0
    for (const file of files) {
      const data = readFileSync(join(dir, file))
      bytes += data.length
      assert.equal(createHash('sha256').update(data).digest('hex'), manifest.files[file], `${id}: stale manifest ${file}`)
      assert.ok(data.length <= 25 * MiB, `${id}: ${file} too large`)
    }
    assert.ok(bytes <= 50 * MiB, `${id}: total size`)
    if (games.some((g) => g.id === id)) assert.ok(bytes < 2e6, `${id}: new games stay under 2 MB`)
  }
})

/** Parse a binary glTF 2.0 file and return its JSON chunk. */
function readGlb(path) {
  const bytes = readFileSync(path)
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const jsonLength = bytes.readUInt32LE(12)
  return JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
}

/** The toy models a new game loads by name from its toybox. */
function requiredToys(g) {
  const toys = new Set([
    ...themes[g.theme][3],
    ...(g.lifeModels || []),
    ...(g.storyToys || []),
    ...Object.values(g.props || {}).map((p) => p.model),
  ])
  for (const key of ['item', 'hero', 'goal', 'distractor']) if (g[key]) toys.add(g[key])
  for (const [item] of g.items || []) if (/^[a-z]+$/.test(item)) toys.add(item)
  const byGame = {
    'bead-bridge': ['snail'],
    'sleepy-owl-lullaby': ['owl'],
    'frog-choir': ['frog'],
    'picnic-pairs': ['apple', 'pear', 'strawberry'],
    'butterfly-patterns': ['leaf'],
    'firefly-lanterns': ['lantern'],
    'giraffe-ruler': ['giraffe'],
    'bridge-builder': ['boat'],
    'garden-fence': ['flower'],
  }
  const byMode = {
    path: () => ['stone', g.obstacle],
    mix: () => ['bottle', { cauldron: 'cauldron', smoothie: 'cup', jellyfish: 'jellyfish', planet: 'planet' }[g.vessel]],
    experiment: () => ['magnet', 'flower', ...g.sets.map((entry) => entry[2])],
    match: () => ['parcel', 'rocket', 'tree', 'rabbit', 'boat', 'fox', 'bird', 'duck', 'snail'],
    pitch: () => ['bird'],
    build: () => ['parcel'],
  }
  for (const toy of [...(byGame[g.id] || []), ...(byMode[g.mode]?.() || [])]) toys.add(toy)
  return toys
}

test('every new game is self-contained, with real Blender GLBs and a rendered cover', () => {
  const runtimeFiles = ['engine', 'activities', 'experiences', 'quantities', 'spatial', 'discovery', 'playlab', 'stories', 'challenges', 'game', 'audio']
    .map((name) => `js/${name}.js`)
  for (const g of games) {
    const pub = join(root, g.id, 'public')
    for (const file of ['index.html', 'style.css', ...runtimeFiles, 'cover.jpg', 'models/world.glb', 'models/toybox.glb']) {
      assert.ok(existsSync(join(pub, file)), `${g.id}: ${file}`)
    }
    for (const file of ['world.glb', 'toybox.glb']) {
      const gltf = readGlb(join(pub, 'models', file))
      assert.ok(gltf.meshes.length > 0)
      assert.ok(!gltf.images?.some((i) => i.uri && !i.uri.startsWith('data:')), `${g.id}: ${file} must embed its textures`)
    }
    const toyNames = new Set(readGlb(join(pub, 'models', 'toybox.glb')).nodes.map((n) => n.name))
    for (const toy of requiredToys(g)) assert.ok(toyNames.has(toy), `${g.id}: missing toy ${toy}`)
    const cover = readFileSync(join(pub, 'cover.jpg'))
    assert.equal(cover.readUInt16BE(), 0xffd8)
    assert.ok(cover.length > 10000)
  }
})

/** Mode-specific promises each generated challenge must keep. */
function checkChallenge(c, level) {
  if (c.tiles.length && ['pattern', 'arithmetic', 'match', 'rhyme', 'choice'].includes(c.mode)) {
    assert.equal(c.tiles.filter((x) => x === c.target).length, 1)
  }
  switch (c.mode) {
    case 'collect':
      assert.ok(c.target > 0 && c.target <= c.total)
      break
    case 'compare':
      assert.equal(c.values.filter((x) => x === c.target).length, 1)
      assert.equal(c.target, c.greater ? Math.max(...c.values) : Math.min(...c.values))
      break
    case 'memory': {
      const counts = Map.groupBy(c.cards, (card) => card.pair)
      assert.ok([...counts.values()].every((cards) => cards.length === 2))
      assert.equal(c.cards.length, 4 + level * 2)
      break
    }
    case 'path': {
      // An independent search proves a route exists for every random obstacle map.
      const route = findRoute(c)
      assert.ok(route)
      assert.ok(pathResult(c, route).ok)
      assert.equal(pathResult(c, [[0, -1]]).ok, false)
      break
    }
    case 'trace':
      assert.ok(c.points.length >= 5)
      assert.ok(c.points.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= 3.1 && Math.abs(z) <= 3.1))
      break
    case 'arithmetic': {
      const expected = { add: c.a + c.b, subtract: c.a - c.b, multiply: c.a * c.b, divide: c.a / c.b }[c.operation]
      assert.equal(c.target, expected)
      assert.ok(Number.isInteger(c.target) && c.target >= 0)
      break
    }
    case 'fraction':
      assert.ok(c.numerator > 0 && c.numerator < c.denominator)
      break
    case 'balance':
      assert.ok(c.base < c.target && c.tiles.includes(1))
      break
    case 'mirror':
      assert.equal(c.pattern.length, c.snowflake ? c.rings : c.size ** 2)
      assert.ok(c.pattern.some(Boolean))
      break
    case 'clock':
      assert.ok(c.hour >= 1 && c.hour <= 12 && [0, 15, 30, 45].includes(c.minute))
      break
    case 'build':
      assert.ok(c.heights.every((n) => n > 0 && n <= 4))
      break
    case 'spell':
      assert.ok([...c.word].every((letter) => c.tiles.includes(letter)))
      break
    case 'tenframe':
      assert.ok(c.target >= 1 && c.target <= 10)
      break
  }
}

for (const g of games) {
  test(`${g.title}: solvable curriculum at all three difficulties`, () => {
    for (let level = 0; level < 3; level++) {
      for (let round = 0; round < 5; round++) {
        for (let seed = 0; seed < 15; seed++) {
          const c = challenge(g, level, round, seed)
          assert.ok(c.prompt.length > 0)
          assert.deepEqual(c, challenge(g, level, round, seed), 'challenges are deterministic per seed')
          checkChallenge(c, level)
        }
      }
    }
  })
}

test('all new projects match the installed Cloudflare schema and enable tracing', async () => {
  // Worker names, preview URLs and wrangler.config.ts are compared with the
  // starter project in apps/store/scripts/starter.test.ts.
  const localRequire = createRequire(join(root, games[0].id, 'package.json'))
  const configRoot = join(dirname(localRequire.resolve('cf/package.json')), '..', '@cloudflare/config')
  const metadata = JSON.parse(readFileSync(join(configRoot, 'package.json')))
  const entry = metadata.exports['.']?.import ?? metadata.exports.import
  const { InputConfigSchema } = await import(pathToFileURL(join(configRoot, entry)))
  for (const g of games) {
    const { default: config } = await import(pathToFileURL(join(root, g.id, 'cloudflare.config.ts')))
    assert.ok(InputConfigSchema.safeParse(config).success, `${g.id}: invalid Cloudflare config`)
    assert.ok(config.worker.observability.enabled)
    assert.ok(config.worker.observability.traces.enabled)
  }
})

test('route lessons vary endpoints and never rely on a fixed border solution', () => {
  for (const game of games.filter((g) => g.mode === 'path')) {
    const starts = new Set()
    const destinations = new Set()
    let blockedDirectRoutes = 0
    for (let seed = 0; seed < 100; seed++) {
      const c = challenge(game, 1, seed % 5, seed)
      starts.add(c.start.join(','))
      destinations.add(c.goal.join(','))
      // Walk straight along x, then along y.
      const plan = []
      for (let x = c.start[0]; x !== c.goal[0]; x += Math.sign(c.goal[0] - x)) plan.push([Math.sign(c.goal[0] - x), 0])
      for (let y = c.start[1]; y !== c.goal[1]; y += Math.sign(c.goal[1] - y)) plan.push([0, Math.sign(c.goal[1] - y)])
      if (!pathResult(c, plan).ok) blockedDirectRoutes++
    }
    assert.ok(starts.size > 8, game.id)
    assert.ok(destinations.size > 8, game.id)
    assert.ok(blockedDirectRoutes > 10, `${game.id}: route planning must require inspecting obstacles`)
  }
})

test('rocket comparisons isolate functional parts from decoration', () => {
  const a = structuredClone(DEFAULT_ROCKET)
  const b = structuredClone(a)
  b.colors.nose = '#ffffff'
  assert.equal(compareBuilds(a, b).answer, 'same')
  assert.deepEqual(compareBuilds(a, b).changed, [])
  b.booster = 'small'
  assert.equal(compareBuilds(a, b).answer, 'b')
  assert.deepEqual(compareBuilds(a, b).changed, ['booster'])
  b.booster = 'none'
  b.tank = 'ball'
  const result = compareBuilds(a, b)
  assert.equal(result.answer, 'same')
  assert.ok(result.b.wobble > result.a.wobble)
})

test('seven tangram polygons partition a square without gaps or overlaps', () => {
  const area = (vertices) => Math.abs(vertices.reduce((sum, p, i) => {
    const q = vertices[(i + 1) % vertices.length]
    return sum + p[0] * q[1] - q[0] * p[1]
  }, 0)) / 2
  assert.deepEqual(tangramPieces.map((p) => area(p.vertices)).sort((a, b) => a - b), [1, 1, 2, 2, 2, 4, 4])
  assert.equal(tangramPieces.filter((p) => p.vertices.length === 3).length, 5)
  // Ray casting point-in-polygon test.
  function contains(vertices, x, y) {
    let inside = false
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const a = vertices[i]
      const b = vertices[j]
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
    }
    return inside
  }
  for (let x = 0.071; x < 4; x += 0.139) {
    for (let y = 0.053; y < 4; y += 0.137) {
      assert.equal(tangramPieces.filter((p) => contains(p.vertices, x, y)).length, 1, `uncovered or overlapping point ${x},${y}`)
    }
  }
})

test('bakery ready times agree with elapsed-time arithmetic across noon', () => {
  const g = games.find((g) => g.id === 'bakery-alarm')
  for (let seed = 0; seed < 100; seed++) {
    for (let level = 1; level < 3; level++) {
      const c = challenge(g, level, 0, seed)
      assert.equal(((c.startHour % 12) * 60 + c.startMinute + c.bakeMinutes) % 720, (c.hour % 12) * 60 + c.minute)
    }
  }
})

test('harder patterns use interior gaps and an answer from the displayed sequence', () => {
  for (const game of games.filter((g) => g.mode === 'pattern')) {
    for (let seed = 0; seed < 40; seed++) {
      const c = challenge(game, 2, seed % 5, seed)
      assert.ok(c.gap > 0 && c.gap < c.pattern.length - 1)
      assert.equal(c.target, c.pattern[c.gap])
      assert.ok(c.tiles.includes(c.target))
    }
  }
})

test('kindness situations permit several caring responses without duplicate options', () => {
  const game = games.find((g) => g.id === 'kindness-cafe')
  for (let round = 0; round < 5; round++) {
    for (let level = 0; level < 3; level++) {
      const c = challenge(game, level, round, 73)
      assert.ok(c.acceptable.length >= 2)
      assert.equal(new Set(c.tiles).size, c.tiles.length)
      assert.ok(c.acceptable.every((a) => c.tiles.includes(a)))
      assert.equal(c.storyIndex, (round + level) % game.challenges.length)
    }
  }
})

test('building plans specify distinct positions as well as heights', () => {
  for (const game of games.filter((g) => g.mode === 'build')) {
    for (let level = 0; level < 3; level++) {
      const c = challenge(game, level, 0, 9)
      assert.equal(c.positions.length, c.heights.length)
      assert.equal(new Set(c.positions.map((p) => p.join(','))).size, c.heights.length)
      if (level) assert.ok(c.positions.some((p) => p[1] === 1))
    }
  }
})

test('the RYB toy model conserves drop counts and compares relative colour recipes', () => {
  assert.equal(mixToyPaint([0, 0, 0]).name, 'Empty cup')
  const primaries = [
    [[1, 0, 0], 'Red'], [[0, 1, 0], 'Yellow'], [[0, 0, 1], 'Blue'],
    [[1, 1, 0], 'Orange mixture'], [[1, 0, 1], 'Purple mixture'], [[0, 1, 1], 'Green mixture'], [[1, 1, 1], 'Earthy mixture'],
  ]
  for (const [drops, name] of primaries) {
    const mix = mixToyPaint(drops)
    assert.equal(mix.name, name)
    assert.equal(mix.drops, drops.reduce((a, b) => a + b, 0))
    assert.match(mix.hex, /^#[0-9a-f]{6}$/)
  }
  assert.equal(mixToyPaint([1, 1, 0]).hex, mixToyPaint([3, 3, 0]).hex)
  assert.notEqual(mixToyPaint([1, 1, 0]).hex, mixToyPaint([3, 1, 0]).hex)
})

test('toy paint rejects negative, fractional, unbounded or malformed recipes', () => {
  for (const drops of [[-1, 0, 0], [0.5, 1, 0], [13, 0, 0], [6, 6, 1], [1, 2], [NaN, 1, 0]]) {
    assert.throws(() => mixToyPaint(drops), RangeError)
  }
})
