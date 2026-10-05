import { CATEGORIES } from '#/lib/categories'
import { VENDOR_BASE } from '#/lib/site'
import pkg from '../../package.json' with { type: 'json' }
import { MAX_FILES_PER_GAME, MAX_GAME_BYTES, mb } from './limits'
import { MANIFEST_FILE, workerName } from './starter'

/** The `three` version in package.json, which scripts/vendor.ts copies to /vendor/three/. Games always get the latest. */
const THREE_VERSION = pkg.dependencies.three
const THREE_BASE = `${VENDOR_BASE}/three`

/** Sent to the agent when it connects. Kept short; get_context has the details. */
export const INSTRUCTIONS = `BitGames is a game store for young children (about 4 to 8 years old).
Games run on the creator's own Cloudflare account. Once shipped, a game plays right away at its own link on BitGames, and an adult reviews it before it is listed in the store for other families.
Call get_context once before building. Use your filesystem, shell and browser tools to build and test locally. The workflow is: get_context, save_game, get_context with gameId and includeStarter=true for starter files, build in public/, deploy to Cloudflare, then publish_game with the version URL. Give the user its playUrl. Keep destructive deletion and withdrawal explicit.`

export const GUIDE = `# Making a BitGames game

## Who plays
Children of about 4 to 8. Many can't read well yet. An adult reviews every version before it is listed in the store, and games that break these rules aren't listed:
- Gentle and happy. No violence, weapons, blood, scary themes, or mean words.
- No losing that feels bad: no "Game over" screens, no lives that run out. Slow down or let them try again.
- Playable without reading: big pictures, emoji, sounds, and one-sentence instructions.
- Big tap targets. Works with touch, mouse and keyboard, in landscape and portrait.
- No text input, chat, links out, purchases, ads, or collecting any information about the player.
- Original or properly licensed art. If you use a CC-BY model, credit its creator in the game.

## Where a game lives
Each game is a folder of static files deployed to the creator's Cloudflare account. BitGames records its file hashes and plays it through a gateway that serves only those files after verifying their bytes. Use relative paths for your own files; upstream absolute URLs are blocked. A Worker backend or unlisted endpoint is not available to the game inside BitGames.
1. save_game with all info fields registers the game and returns its id and stable playUrl. Later, pass gameId and partial info to edit its details. Metadata edits withdraw pending review; publish again when ready.
2. get_context with gameId and includeStarter=true returns a project to write into an empty folder: \`cloudflare.config.ts\` and \`wrangler.config.ts\` (the Worker \`${workerName('<id>')}\`, static files from \`public/\`), \`bitgames.mjs\`, \`public/_headers\` and a working starter \`public/index.html\`. Change the starter rather than starting from nothing, and keep \`_headers\` as it is.
3. Build the game in \`public/\`. \`index.html\` is the entry point.
4. Deploy with \`npm install\` then \`npm run deploy\`. It runs \`node bitgames.mjs\`, which lists every file in \`public/\` with its SHA-256 in \`public/${MANIFEST_FILE}\`, then \`cf deploy\`. The creator logs in once with \`npx cf auth login\`.
5. Every deploy is a new version with its own preview URL that never changes: \`https://<first 8 characters of the "Current Version ID">-${workerName('<id>')}.<account>.workers.dev/\`. Open it to check the game.
6. Optionally call publish_game with checkOnly=true to validate without changing anything. Then publish_game with that URL. BitGames downloads every file and checks it against ${MANIFEST_FILE}. The game then plays right away at its own link (/try/<token>), which the user can share with anyone, and the version goes to a reviewer to be listed in the store. Once approved, exactly that version is what the store shows. To update a game, deploy again and ship the new version: the link plays it at once, while the store keeps its current version until the update is approved. The gateway refuses changed or unlisted files. BitGames also re-checks listed versions. get_context with gameId returns version history and review notes (pass nextHistoryCursor as historyCursor to read older versions); publish_game with a previous versionId restores those files at your link and submits them for review again. withdraw_submission cancels only the listing request; delete_game removes the game and history from BitGames.

BitGames hosts three.js ${THREE_VERSION} with all of its addons (\`examples/jsm\`). Use exactly this import map:

\`\`\`html
<script type="importmap">
{ "imports": {
  "three": "${THREE_BASE}/build/three.module.js",
  "three/addons/": "${THREE_BASE}/examples/jsm/"
} }
</script>
\`\`\`

## The sandbox
On BitGames, games run in a locked-down frame:
- They can load only their own files (use relative paths like \`./models/bunny.glb\`) and the libraries under \`${VENDOR_BASE}/\`. Every other request is blocked, including CDNs such as jsDelivr or unpkg, so put any other library you need into the game's own files.
- There are no cookies, and \`localStorage\` throws. Keep all state in memory.
- \`alert\`, \`prompt\`, popups, forms and links that open other pages don't work.
- Start sounds with Web Audio inside a pointer or key event, because browsers block audio until the player interacts.
- Use static files only. BitGames serves the recorded bytes and rejects mismatches; backend requests and files absent from the manifest are unavailable.

## Limits
- Up to ${MAX_FILES_PER_GAME} files and ${mb(MAX_GAME_BYTES)} per game, with at most 25 MB per file (bundle code into a few modules).

## Playing together (multiplayer)
Games can let up to 8 people in the same home play together, each on their own device. BitGames shows the lobby: one device taps "Play together" then "Start a game", and the game gets a code of three animals. Other devices on the same internet connection see it in their "Play together" list and tap it to join (the first device lets them in with one tap); a device anywhere else taps the three animals instead. Game data then goes directly between the devices over WebRTC.

\`\`\`js
import { joinRoom } from '${VENDOR_BASE}/bitgames/multiplayer-1.js'

const room = await joinRoom({ maxPlayers: 4 })   // shows the lobby; resolves when ready
if (room.solo) { /* playing alone: add computer players */ }
room.isHost                       // true on the device that started the room; run shared logic (start, laps, bots) there
room.selfId                       // this device's player id
room.peers                        // ids of the other connected players
room.on('join', (id) => {})       // a player connected (also fires for players already in the room)
room.on('leave', (id) => {})
room.on('message', (msg, from) => {})
room.send({ type: 'start' })                     // reliable, to everyone
room.send({ type: 'pos', x, y }, { fast: true }) // may drop; for frequent updates like positions (20-30 per second)
room.send(msg, { to: id })                       // one player only
\`\`\`

Messages are any JSON value. Keep fast messages small (under about 1 KB). The lobby needs the BitGames page around the game, so test multiplayer at the game's link (/try/...) in two browser windows after shipping; opened on its own, joinRoom returns a solo room.
Set together=true in the game info for multiplayer games.

## Full screen
Pressing Play on BitGames fills the whole screen (true fullscreen where the browser allows it), on tablets and phones in either orientation, and often on an iPad with only a touchscreen. Make the game fit that:
- Fill the window: a canvas sized to \`innerWidth\` × \`innerHeight\`, re-sized on \`resize\` (which also fires when the device turns).
- Use the viewport tag from the starter (\`viewport-fit=cover\`, no zooming), and keep HUD and buttons at least 16px from the edges with \`calc(16px + env(safe-area-inset-*))\`.
- BitGames shows a ✕ button in the top-right corner. Keep about 60×60px there free of buttons and important HUD.
- Show touch controls whenever there's a touchscreen (\`@media (any-pointer: coarse)\`), even if a mouse or keyboard is also connected. For held buttons (steer, gas), use touch events with \`preventDefault()\` (\`{ passive: false }\`): on an iPad, every browser is WebKit, and it cancels a held touch for its press-and-hold menu otherwise.

## Making 3D models in Blender
If the Blender MCP server is connected, model things there, then export them as glTF binary into the game's \`public/models/\` folder:
1. Build or import the model. Keep it low-poly (under about 20k triangles per model), and use simple materials with a Principled BSDF and base colour or image textures.
2. Apply transforms and put the model's origin where it should stand.
3. Export only the model to a .glb file:
   \`bpy.ops.export_scene.gltf(filepath="<project>/public/models/bunny.glb", export_format="GLB", use_selection=True, export_apply=True)\`
   Read the valid options first if your Blender version rejects these.
4. Load the model in the game:
   \`\`\`js
   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
   const gltf = await new GLTFLoader().loadAsync('./models/bunny.glb')
   scene.add(gltf.scene)
   \`\`\`
   Animations exported from Blender are in \`gltf.animations\`; play them with \`THREE.AnimationMixer\`.

Don't use Draco or meshopt compression: their decoders need extra permissions the sandbox doesn't give.

## Cover picture
Add a cover so children can recognise the game: a 1280x720 screenshot of an exciting moment, saved as \`public/cover.jpg\`, \`cover.webp\` or \`cover.png\`. Without one, the tile shows the game's emoji.

## Checking your work
Open the version URL from the deploy, or have the user open it, and play the game; fix every console error. After publish_game, the game's link (/try/<token>, also in get_context) plays the shipped version inside BitGames with the real sandbox and the multiplayer lobby. Query parameters on the link are passed to the game, so /try/<token>?debug reaches your game as location.search. Use get_context to see whether it is listed in the store, and any review notes.

## Categories
${CATEGORIES.map((c) => `- ${c.slug}: ${c.name} ${c.emoji}`).join('\n')}
Set together=true only for games that two or more people can play at the same time.
`

/** The index.html every new game starts with: a bouncy shape to tap, with sound and resizing done. */
export const STARTER_GAME = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>My BitGames game</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #bfe6ff; font-family: system-ui, sans-serif; touch-action: none; user-select: none; }
  #hud { position: fixed; top: calc(16px + env(safe-area-inset-top)); left: 0; right: 0; text-align: center; font-size: 40px; font-weight: 800; color: #fff; text-shadow: 0 3px 0 #6c63ff; pointer-events: none; }
</style>
<script type="importmap">
{ "imports": {
  "three": "${THREE_BASE}/build/three.module.js",
  "three/addons/": "${THREE_BASE}/examples/jsm/"
} }
</script>
</head>
<body>
<div id="hud">⭐ 0</div>
<script type="module">
import * as THREE from 'three'
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#bfe6ff')
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(0, 0, 8)
scene.add(new THREE.HemisphereLight('#ffffff', '#ffd6e8', 2.5))

// Replace this with your own models, e.g.:
//   const gltf = await new GLTFLoader().loadAsync('./models/bunny.glb'); scene.add(gltf.scene)
const toy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), new THREE.MeshStandardMaterial({ color: '#ff6b9d', flatShading: true }))
scene.add(toy)

let score = 0
let squish = 0
const hud = document.getElementById('hud')

let audio
function boop() {
  audio ??= new AudioContext()
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.frequency.value = 400 + Math.random() * 400
  gain.gain.setValueAtTime(0.2, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2)
  osc.connect(gain).connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + 0.2)
}

const raycaster = new THREE.Raycaster()
addEventListener('pointerdown', (e) => {
  raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera)
  if (!raycaster.intersectObject(toy).length) return
  score++
  hud.textContent = '⭐ ' + score
  squish = 1
  toy.material.color.setHSL(Math.random(), 0.8, 0.65)
  boop()
})

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const timer = new THREE.Timer()
renderer.setAnimationLoop(() => {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  squish = Math.max(0, squish - dt * 3)
  toy.rotation.y += dt
  toy.scale.setScalar(1 + Math.sin(squish * Math.PI) * 0.3)
  renderer.render(scene, camera)
})
</script>
</body>
</html>
`
