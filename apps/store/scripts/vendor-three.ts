/**
 * Copies three.js from node_modules into public/vendor/three-<version>/ so
 * games load it from our own origin. Games may only run code served by
 * BitGames, so nothing a game loads can change after it has been reviewed.
 */
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname
// three's exports map hides package.json, so read it from the installed folder directly.
const threeDir = resolve(root, 'node_modules', 'three')
const { version } = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')) as { version: string }
const target = join(root, 'public', 'vendor', `three-${version}`)

if (!existsSync(join(target, 'build', 'three.module.js'))) {
  rmSync(join(root, 'public', 'vendor'), { recursive: true, force: true })
  cpSync(join(threeDir, 'build'), join(target, 'build'), {
    recursive: true,
    filter: (src) => !src.endsWith('.cjs'),
  })
  cpSync(join(threeDir, 'examples', 'jsm'), join(target, 'examples', 'jsm'), { recursive: true })
  cpSync(join(threeDir, 'LICENSE'), join(target, 'LICENSE'))
  console.log(`vendored three@${version}`)
}
