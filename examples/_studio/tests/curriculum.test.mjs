import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { originalIds } from '../catalogue.mjs'
import { mixToyPaint } from '../originals/colour-model.js'
import { compareBuilds } from '../../rocket-garage/public/js/workshop.js'
import { DEFAULT_ROCKET } from '../../rocket-garage/public/js/parts.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
const wipe = JSON.parse(readFileSync(new URL('../../../docs/audit/proposed-wipe-2026-10-08.json', import.meta.url)))
const protectedIds = [...wipe.protectedGameIds].sort()
const retiredIds = wipe.games.map((game) => game.id)
const exampleIds = readdirSync(root).filter((id) => existsSync(join(root, id, 'game.json'))).sort()
const readJson = (...parts) => JSON.parse(readFileSync(join(root, ...parts)))
const MiB = 1024 * 1024

test('the approved wipe preserves every original project and excludes all retired projects', () => {
  assert.equal(protectedIds.length, 12, 'The approved scope protects twelve originals')
  assert.equal(new Set(protectedIds).size, protectedIds.length)
  assert.equal(retiredIds.length, 89, 'The approved retirement scope contains exactly eighty-nine projects')
  assert.equal(new Set(retiredIds).size, retiredIds.length)
  assert.ok(retiredIds.every((id) => !protectedIds.includes(id)))
  assert.deepEqual(exampleIds, protectedIds)
  assert.deepEqual([...originalIds].sort(), protectedIds, 'Build inputs must match the protected originals')
  for (const id of retiredIds) assert.ok(!existsSync(join(root, id)), `${id}: retired source directory remains`)
})

test('preserved originals retain usable metadata, entry points and local artwork', () => {
  for (const id of protectedIds) {
    const metadata = readJson(id, 'game.json')
    assert.equal(metadata.id, id)
    for (const field of ['title', 'tagline', 'howToPlay', 'emoji', 'color', 'category', 'learning']) {
      assert.ok(typeof metadata[field] === 'string' && metadata[field].trim(), `${id}: ${field}`)
    }
    assert.ok(Array.isArray(metadata.ages) && metadata.ages.length === 2, `${id}: age range`)
    assert.ok(metadata.ages.every(Number.isInteger) && metadata.ages[0] >= 2 && metadata.ages[1] <= 8 && metadata.ages[0] <= metadata.ages[1], `${id}: valid ages`)
    assert.equal(typeof metadata.together, 'boolean', `${id}: together flag`)
    assert.equal(typeof metadata.featured, 'boolean', `${id}: featured flag`)
    if (metadata.url) assert.equal(new URL(metadata.url).protocol, 'https:', `${id}: pinned deployment URL`)
    const publicDir = join(root, id, 'public')
    const index = readFileSync(join(publicDir, 'index.html'), 'utf8')
    assert.match(index, /(?:src|href)=["'][^"']*js\/main\.js/, `${id}: executable entry point`)
    assert.ok(readFileSync(join(publicDir, 'js/main.js')).length > 1000, `${id}: preserved gameplay source`)
    const cover = readFileSync(join(publicDir, 'cover.jpg'))
    assert.equal(cover.readUInt16BE(), 0xffd8, `${id}: JPEG cover`)
    assert.ok(cover.length > 1000, `${id}: nonempty cover`)
  }
})

/** The same file scope the store hashes: no dotfiles or hosting-only files. */
const unhashed = new Set(['bitgames.json', '_headers', '_redirects'])
function shippedFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .flatMap((entry) => entry.isDirectory()
      ? shippedFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : unhashed.has(entry.name) ? [] : [prefix + entry.name])
}

test('every preserved original ships exactly its hashed manifest within store limits', () => {
  for (const id of protectedIds) {
    const dir = join(root, id, 'public')
    const manifest = readJson(id, 'public', 'bitgames.json')
    const files = shippedFiles(dir).sort()
    assert.deepEqual(Object.keys(manifest.files).sort(), files, id)
    assert.ok(files.length <= 40, `${id}: file limit`)
    let bytes = 0
    for (const file of files) {
      const data = readFileSync(join(dir, file))
      bytes += data.length
      assert.equal(createHash('sha256').update(data).digest('hex'), manifest.files[file], `${id}: stale manifest ${file}`)
      assert.ok(data.length <= 25 * MiB, `${id}: ${file} too large`)
      if (file.endsWith('.glb')) {
        assert.equal(data.toString('utf8', 0, 4), 'glTF', `${id}: ${file} GLB header`)
        assert.equal(data.readUInt32LE(4), 2, `${id}: ${file} glTF version`)
        assert.equal(data.readUInt32LE(8), data.length, `${id}: ${file} intact binary length`)
      }
    }
    assert.ok(bytes <= 50 * MiB, `${id}: total size`)
  }
})

test('the built catalogue contains only protected originals with current metadata', () => {
  const catalogue = readJson('catalogue', 'games.json')
  assert.deepEqual(catalogue.map((game) => game.id).sort(), protectedIds)
  for (const game of catalogue) {
    assert.ok(!retiredIds.includes(game.id), `${game.id}: retired listing`)
    assert.deepEqual(game, readJson(game.id, 'game.json'), `${game.id}: stale catalogue metadata`)
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
