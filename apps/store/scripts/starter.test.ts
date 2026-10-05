import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { starterProject } from '../src/server/starter.ts'

/** The games in examples/ are deployed from the same project creators get, so they must not drift from it. */
const examples = join(import.meta.dirname, '..', '..', '..', 'examples')

describe('examples match the starter project', () => {
  for (const id of readdirSync(examples).filter((name) => existsSync(join(examples, name, 'game.json')))) {
    it(id, async () => {
      for (const [path, content] of Object.entries(starterProject(id))) {
        const file = join(examples, id, path)
        const actual = readFileSync(file, 'utf8')
        if (path === 'package.json') {
          // A game may add local art/build commands while retaining the exact
          // deployment script, dependency pins, and package identity.
          const pkg = JSON.parse(actual)
          assert.deepEqual({ ...pkg, scripts: { deploy: pkg.scripts.deploy } }, JSON.parse(content), file)
        } else if (path === 'cloudflare.config.ts') {
          // Compatibility dates and observability evolve independently of the
          // creator starter. Keep all other hosting settings identical.
          const { default: config } = await import(pathToFileURL(file).href)
          const { compatibilityDate, observability, ...worker } = config.worker
          assert.deepEqual(worker, { name: `bitgames-${id}`, previewUrls: true }, file)
          assert.match(compatibilityDate, /^\d{4}-\d{2}-\d{2}$/)
          assert.ok(compatibilityDate >= '2026-10-01' && compatibilityDate <= new Date().toISOString().slice(0, 10))
          if (observability) assert.equal(observability.enabled, true)
          assert.deepEqual(Object.keys(config), ['worker'], file)
        } else {
          // CSP, asset routing, hashing, and ignored secrets never drift.
          assert.equal(actual, content, file)
        }
      }
    })
  }
})

it('generates manifests in paths with spaces and rejects unsafe game ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bitgames project '))
  try {
    mkdirSync(join(dir, 'public', 'models'), { recursive: true })
    writeFileSync(join(dir, 'public', 'index.html'), '<html>Happy game</html>')
    writeFileSync(join(dir, 'public', 'models', 'toy.glb'), 'model')
    writeFileSync(join(dir, 'bitgames.mjs'), starterProject('happy-game')['bitgames.mjs']!)
    execFileSync(process.execPath, ['bitgames.mjs'], { cwd: dir })
    const manifest = JSON.parse(readFileSync(join(dir, 'public', 'bitgames.json'), 'utf8')) as { files: Record<string, string> }
    assert.equal(manifest.files['models/toy.glb'], createHash('sha256').update('model').digest('hex'))
    assert.equal(Object.keys(manifest.files).length, 2)
    assert.throws(() => starterProject('bad"id'), /Invalid game id/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
