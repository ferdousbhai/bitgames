/**
 * The project every BitGames game is deployed from: a static-assets Worker on
 * the creator's own Cloudflare account. The MCP server hands these files to
 * creators' agents, and the games in examples/ are built from them too.
 *
 * Kept free of Worker and path-alias imports so Node scripts can load it.
 */
import { GAME_CSP_HEADER } from '../lib/site.ts'
import { isGameId } from './limits.ts'

/** The `cf` and `wrangler` versions the project is known to deploy with. */
export const DEPLOY_TOOLS = { cf: '1.0.0-beta.12', wrangler: '4.147.0' }

export const MANIFEST_FILE = 'bitgames.json'

/** The Worker a game deploys as. Its version preview URLs are what BitGames pins. */
export const workerName = (gameId: string) => `bitgames-${gameId}`

/**
 * Files outside public/: the deploy setup and the manifest script. Paths are
 * relative to the project folder.
 */
export function starterProject(gameId: string): Record<string, string> {
  if (!isGameId(gameId)) throw new Error('Invalid game id.')
  return {
    'package.json': `${JSON.stringify(
      {
        name: workerName(gameId),
        private: true,
        type: 'module',
        scripts: { deploy: 'node bitgames.mjs && cf deploy' },
        devDependencies: DEPLOY_TOOLS,
      },
      null,
      2,
    )}\n`,
    'cloudflare.config.ts': `import { defineConfig } from "cf/config";

// Each deploy is a new version with its own preview URL, which BitGames pins once it is reviewed.
export default defineConfig({
  worker: {
    name: "${workerName(gameId)}",
    compatibilityDate: "2026-10-01",
    previewUrls: true,
  },
});
`,
    'wrangler.config.ts': `import { defineWranglerConfig } from "wrangler/experimental-config";

// The game is plain static files in public/.
export default defineWranglerConfig({
  "assetsDirectory": "public"
});
`,
    'bitgames.mjs': `/**
 * Writes public/${MANIFEST_FILE}: every file in public/ with its SHA-256. BitGames
 * checks these before and after review, so the version children play never changes.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./public/', import.meta.url))
const SKIP = new Set(['${MANIFEST_FILE}', '_headers', '_redirects'])
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return []
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const files = {}
for (const file of walk(root).sort()) {
  const path = relative(root, file).split('\\\\').join('/')
  if (!SKIP.has(path)) files[path] = createHash('sha256').update(readFileSync(file)).digest('hex')
}
writeFileSync(join(root, '${MANIFEST_FILE}'), JSON.stringify({ files }, null, 2) + '\\n')
console.log(\`${MANIFEST_FILE}: \${Object.keys(files).length} files\`)
`,
    '.gitignore': 'node_modules/\n.cloudflare/\n.wrangler/\npublic/bitgames.json\n',
    'public/_headers': `# BitGames plays the game in a sandboxed frame with no origin of its own, and
# This policy protects direct previews on your own Cloudflare version URL.
# BitGames playback supplies its own stricter policy through the verified file
# gateway. CORS also allows tools to inspect scripts and models in direct previews.
/*
  Content-Security-Policy: ${GAME_CSP_HEADER}
  Allow-CSP-From: *
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
`,
  }
}
