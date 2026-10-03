import { CATEGORIES } from '#/lib/categories'
import { VENDOR_BASE } from '#/lib/site'
import pkg from '../../package.json' with { type: 'json' }
import { MAX_FILES_PER_GAME, MAX_GAME_BYTES, mb } from './limits'
import { MANIFEST_FILE, workerName } from './starter'

/** The `three` version in package.json, which scripts/vendor.ts copies to /vendor/three/. Games always get the latest. */
const THREE_VERSION = pkg.dependencies.three
const THREE_BASE = `${VENDOR_BASE}/three`

/** Sent to the agent when it connects. Kept short; get_guide has the details. */
export const INSTRUCTIONS = `BitGames is a game store for young children (about 4 to 8 years old).
Games run on the creator's own Cloudflare account; BitGames lists them in one place, and an adult reviews every version before children see it.
Call get_guide once before building. The workflow is: create_game, get_starter_project, build the game in public/, deploy it to Cloudflare, then submit_version with the version preview URL.`

export const GUIDE = `# Making a BitGames game

## Who plays
Children of about 4 to 8. Many can't read well yet. Every version is reviewed by an adult before it is published, and games that break these rules are rejected:
- Gentle and happy. No violence, weapons, blood, scary themes, or mean words.
- No losing that feels bad: no "Game over" screens, no lives that run out. Slow down or let them try again.
- Playable without reading: big pictures, emoji, sounds, and one-sentence instructions.
- Big tap targets. Works with touch, mouse and keyboard, in landscape and portrait.
- No text input, chat, links out, purchases, ads, or collecting any information about the player.
- Original or properly licensed art. If you use a CC-BY model, credit its creator in the game.

## Where a game lives
Each game is a folder of static files deployed as a Worker on the creator's own Cloudflare account. BitGames keeps the catalog (title, tile, reviews) and plays the game in a frame on its pages.
1. create_game registers the game and gives you its id.
2. get_starter_project returns a project to write into an empty folder: \`cloudflare.config.ts\` and \`wrangler.config.ts\` (the Worker \`${workerName('<id>')}\`, static files from \`public/\`), \`bitgames.mjs\`, \`public/_headers\` and a working starter \`public/index.html\`. Change the starter rather than starting from nothing, and keep \`_headers\` as it is.
3. Build the game in \`public/\`. \`index.html\` is the entry point.
4. Deploy with \`npm install\` then \`npm run deploy\`. It runs \`node bitgames.mjs\`, which lists every file in \`public/\` with its SHA-256 in \`public/${MANIFEST_FILE}\`, then \`cf deploy\`. The creator logs in once with \`npx cf auth login\`.
5. Every deploy is a new version with its own preview URL that never changes: \`https://<first 8 characters of the "Current Version ID">-${workerName('<id>')}.<account>.workers.dev/\`. Open it to check the game.
6. submit_version with that URL. BitGames downloads every file, checks it against ${MANIFEST_FILE}, and sends the version to a reviewer. Once approved, exactly that version is what children play. To update a game, deploy again and submit the new version; the store keeps the current one until the update is approved. BitGames re-checks published versions and takes down a game whose files change.

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
- Use static files only: no Worker code, so a reviewed version can't behave differently later.

## Limits
- Up to ${MAX_FILES_PER_GAME} files and ${mb(MAX_GAME_BYTES)} per game (bundle code into a few modules).

## Playing together (multiplayer)
Games can let up to 8 people in the same home play together, each on their own device. BitGames shows the lobby: one device taps "Start a family game" and gets a code made of three animals, and the others tap "Join" and pick the same animals. Game data then goes directly between the devices over WebRTC.

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

Messages are any JSON value. Keep fast messages small (under about 1 KB). The lobby needs the BitGames page around the game, so test multiplayer on the preview page (/try/...) in two browser windows after submitting; opened on its own, joinRoom returns a solo room.
Set together=true in the game info for multiplayer games.

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
Open the version URL from the deploy, or have the user open it, and play the game; fix every console error. After submit_version, the preview page (/try/<token>, from list_my_games) plays the submitted version inside BitGames with the real sandbox and the multiplayer lobby. Query parameters on the preview page are passed to the game, so /try/<token>?debug reaches your game as location.search. Use list_my_games to see review results and notes.

## Categories
${CATEGORIES.map((c) => `- ${c.slug}: ${c.name} ${c.emoji}`).join('\n')}
Set together=true only for games that two or more people can play at the same time.
`

/** The index.html every new game starts with: a bouncy shape to tap, with sound and resizing done. */
export const STARTER_GAME = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>My BitGames game</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #bfe6ff; font-family: system-ui, sans-serif; touch-action: none; user-select: none; }
  #hud { position: fixed; top: 16px; left: 0; right: 0; text-align: center; font-size: 40px; font-weight: 800; color: #fff; text-shadow: 0 3px 0 #6c63ff; pointer-events: none; }
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
