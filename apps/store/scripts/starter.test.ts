import { readFileSync, readdirSync } from 'node:fs'
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
