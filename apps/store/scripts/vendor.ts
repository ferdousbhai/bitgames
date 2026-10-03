/**
 * Builds public/vendor/, the only code games may load besides their own files:
 * - three/: the latest three.js and its addons, copied from node_modules
 * - bitgames/multiplayer-1.js: the multiplayer SDK, bundled from packages/game-sdk
 * Every game imports /vendor/three/, so upgrading `three` in package.json
 * upgrades all games at once.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { join, resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname
// three's exports map hides package.json, so read it from the installed folder directly.
const threeDir = resolve(root, 'node_modules', 'three')
const { version } = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')) as { version: string }
const vendor = join(root, 'public', 'vendor')
const target = join(vendor, 'three')
const stamp = join(target, 'VERSION')

if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== version) {
  // Drop the previous copy, and any old versioned folders from before /vendor/three/.
  rmSync(vendor, { recursive: true, force: true })
  cpSync(join(threeDir, 'build'), join(target, 'build'), {
    recursive: true,
    filter: (src) => !src.endsWith('.cjs'),
  })
  cpSync(join(threeDir, 'examples', 'jsm'), join(target, 'examples', 'jsm'), { recursive: true })
  cpSync(join(threeDir, 'LICENSE'), join(target, 'LICENSE'))
  writeFileSync(stamp, version)
  console.log(`vendored three@${version}`)
}

// Rebuilt every time: it's small, and it changes with the SDK source.
await build({
  entryPoints: [resolve(root, '..', '..', 'packages', 'game-sdk', 'src', 'multiplayer.ts')],
  outfile: join(root, 'public', 'vendor', 'bitgames', 'multiplayer-1.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
})
