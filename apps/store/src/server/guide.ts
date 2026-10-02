import { CATEGORIES } from '#/lib/categories'
import { MAX_FILE_BYTES, MAX_GAME_BYTES } from './limits'

/** Must match the exact `three` version in package.json, which scripts/vendor.ts copies to /vendor/. */
export const THREE_VERSION = '0.186.1'
const THREE_BASE = `/vendor/three-${THREE_VERSION}`

/** Sent to the agent when it connects. Kept short; get_guide has the details. */
export const INSTRUCTIONS = `BitGames is a game store for young children (about 4 to 8 years old).
You build three.js browser games for it with the tools here, and an adult reviews every game before children see it.
Call get_guide once before building. The workflow is: create_game, edit files with write_file, add Blender models with get_upload_url and curl, check the preview URL, then submit_for_review.`

export const GUIDE = `# Making a BitGames game

## Who plays
Children of about 4 to 8. Many can't read well yet. Every game is reviewed by an adult before it is published, and games that break these rules are rejected:
- Gentle and happy. No violence, weapons, blood, scary themes, or mean words.
- No losing that feels bad: no "Game over" screens, no lives that run out. Slow down or let them try again.
- Playable without reading: big pictures, emoji, sounds, and one-sentence instructions.
- Big tap targets. Works with touch, mouse and keyboard, in landscape and portrait.
- No text input, chat, links out, purchases, ads, or collecting any information about the player.
- Original or properly licensed art. If you use a CC-BY model, credit its creator in the game.

## How a game is built
A game is a folder of static files served from \`/preview/<token>/\` while it is a draft, and \`/play/<id>/\` once published. \`index.html\` is the entry point. create_game writes a working starter index.html; change it rather than starting from nothing.

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
Games run in a locked-down sandbox:
- They can load only their own files (use relative paths like \`./models/bunny.glb\`) and the three.js copy under \`${THREE_BASE}/\`. Every other request is blocked, including CDNs such as jsDelivr or unpkg, so put any other library you need into the game's own files.
- There are no cookies, and \`localStorage\` throws. Keep all state in memory.
- \`alert\`, \`prompt\`, popups, forms and links that open other pages don't work.
- Start sounds with Web Audio inside a pointer or key event, because browsers block audio until the player interacts.

## Limits
- Files: up to ${MAX_FILE_BYTES / 1024 / 1024} MB each and ${MAX_GAME_BYTES / 1024 / 1024} MB per game.
- Text files (.html .js .css .json) are written with write_file.
- Binary files (.glb .png .jpg .webp .mp3 .ogg .wav) are uploaded with get_upload_url.

## Playing together (multiplayer)
Games can let up to 8 people in the same home play together, each on their own device. BitGames shows the lobby: one device taps "Start a family game" and gets a code made of three animals, and the others tap "Join" and pick the same animals. Game data then goes directly between the devices over WebRTC.

\`\`\`js
import { joinRoom } from '/vendor/bitgames/multiplayer-1.js'

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

Messages are any JSON value. Keep fast messages small (under about 1 KB). The lobby needs the BitGames page around the game, so test multiplayer on the preview page (/try/...) in two browser windows; opened on its own, joinRoom returns a solo room.
Set together=true in the game info for multiplayer games.

## Making 3D models in Blender
If the Blender MCP server is connected, model things there, then export them as glTF binary:
1. Build or import the model. Keep it low-poly (under about 20k triangles per model), and use simple materials with a Principled BSDF and base colour or image textures.
2. Apply transforms and put the model's origin where it should stand.
3. Export only the model to a .glb file:
   \`bpy.ops.export_scene.gltf(filepath="/tmp/bunny.glb", export_format="GLB", use_selection=True, export_apply=True)\`
   Read the valid options first if your Blender version rejects these.
4. Call get_upload_url with the game id and a path like \`models/bunny.glb\`, then run the curl command it returns.
5. Load the model in the game:
   \`\`\`js
   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
   const gltf = await new GLTFLoader().loadAsync('./models/bunny.glb')
   scene.add(gltf.scene)
   \`\`\`
   Animations exported from Blender are in \`gltf.animations\`; play them with \`THREE.AnimationMixer\`.

Don't use Draco or meshopt compression: their decoders need extra permissions the sandbox doesn't give.

## Checking your work
Open the preview URL (/try/<token>) in a browser, or have the user open it, and play the game. The raw files are under /preview/<token>/ if you need to load them directly. Fix every console error. When it is fun and follows the rules above, call submit_for_review. Use list_my_games to see review results and notes.

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

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  squish = Math.max(0, squish - dt * 3)
  toy.rotation.y += dt
  toy.scale.setScalar(1 + Math.sin(squish * Math.PI) * 0.3)
  renderer.render(scene, camera)
})
</script>
</body>
</html>
`
