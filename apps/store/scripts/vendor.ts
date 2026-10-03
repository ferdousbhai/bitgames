/**
 * Builds public/vendor/, the only code games may load besides their own files:
 * - three-<version>/: three.js and its addons, copied from node_modules
 * - bitgames/multiplayer-1.js: the multiplayer SDK, bundled from packages/game-sdk
 * Serving these ourselves means nothing a game loads can change after review.
 * Published games pin their three version, so older three-<version>/ folders
 * are never removed here; deploy from a machine that still has them (or
 * re-vendor them) after upgrading three.
 */
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { join, resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname
// three's exports map hides package.json, so read it from the installed folder directly.
const threeDir = resolve(root, 'node_modules', 'three')
const { version } = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')) as { version: string }
const target = join(root, 'public', 'vendor', `three-${version}`)

if (!existsSync(join(target, 'build', 'three.module.js'))) {
  cpSync(join(threeDir, 'build'), join(target, 'build'), {
    recursive: true,
    filter: (src) => !src.endsWith('.cjs'),
  })
  cpSync(join(threeDir, 'examples', 'jsm'), join(target, 'examples', 'jsm'), { recursive: true })
  cpSync(join(threeDir, 'LICENSE'), join(target, 'LICENSE'))
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
