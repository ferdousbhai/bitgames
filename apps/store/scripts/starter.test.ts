import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { starterProject } from '../src/server/starter.ts'

/** The games in examples/ are deployed from the same project creators get, so they must not drift from it. */
const examples = join(import.meta.dirname, '..', '..', '..', 'examples')

describe('examples match the starter project', () => {
  for (const id of readdirSync(examples, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    it(id, () => {
      for (const [path, content] of Object.entries(starterProject(id))) {
        assert.equal(readFileSync(join(examples, id, path), 'utf8'), content, `examples/${id}/${path}`)
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
