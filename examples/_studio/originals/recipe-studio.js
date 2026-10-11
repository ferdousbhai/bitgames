import * as THREE from 'three'
import { createStudioDialog, createStudioView } from './studio-dialog.js'
import { FLAVOURS, STEP, STAND_TOP } from './cake.js'

// Each recipe lists its layers from the bottom up.
const RECIPES = [
  ['vanilla', 'strawberry', 'vanilla'],
  ['chocolate', 'lemon', 'chocolate', 'lemon'],
  ['blueberry', 'mint', 'vanilla', 'mint', 'blueberry'],
]
const PANTRY = ['vanilla', 'strawberry', 'chocolate', 'lemon', 'mint', 'blueberry']
const MAX_LAYERS = 5
const FRIENDS = [
  { emoji: '🐻', name: 'Bear', plate: '#bedacc' },
  { emoji: '🐰', name: 'Bunny', plate: '#bed4ed' },
  { emoji: '🦊', name: 'Fox', plate: '#e6caea' },
]
// The baker's plate sits beside the cake: it takes only the slices that cannot go round.
const BAKER = { emoji: '🧑‍🍳', name: 'the baker', plate: '#f3e6d4', x: 3.3, z: -0.7 }
const BAKER_PLATE = -1
// The cake can be cut four ways, as at the party: some share out exactly, some leave slices over.
const CUTS = [4, 6, 8, 12]
const PLATE_GAP = 2.9
// Horizontal axis across the studio camera's line of sight (the camera looks from +x, +z).
const TIP_AXIS = new THREE.Vector3(11.4, 0, -7).normalize()

// Each friend's face floats over their plate, so a child can match a plate to its button without reading.
const faces = new Map()
function faceSprite(emoji) {
  if (!faces.has(emoji)) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const g = canvas.getContext('2d')
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(64, 64, 60, 0, Math.PI * 2)
    g.fill()
    g.font = '84px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(emoji, 64, 70)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    faces.set(emoji, new THREE.SpriteMaterial({ map, depthTest: false }))
  }
  const sprite = new THREE.Sprite(faces.get(emoji))
  sprite.renderOrder = 2
  return sprite
}

/**
 * sound (optional) is the game's synth: pop, perfect, cheer, click, good, wobble.
 * Feedback is also spoken, so a child who cannot read yet still hears what happened.
 */
export function createRecipeStudio({ cakeKit, openButton, sound = null, voice }) {
  let view = null
  let recipeIndex = 0
  let layers = []
  let sharing = false
  // One pending check at a time: any tap in the studio (or closing it) cancels it, and a tap that
  // completes a recipe or share books it again
  let checkTimer = 0
  const checkSoon = (check, ms) => { clearTimeout(checkTimer); checkTimer = setTimeout(check, ms) }
  const cancelCheck = () => clearTimeout(checkTimer)
  let friends = 2
  let slices = 4
  const owners = [] // per slice: friend index, BAKER_PLATE, or null while still on the cake
  const history = [] // shared slice indices, for Undo

  const studio = createStudioDialog({
    id: 'birthday-studio',
    // Picture-only, like everything else in the studio: the words are there for screen readers alone.
    title: '<span aria-hidden="true">🎂 📖</span><span class="studio-sr">Birthday recipe studio</span>',
    openButton,
    onOpen: () => {
      draw()
      // A pre-reader hears how the studio works once, instead of reading it.
      if (!sharing) voice.sayOnce?.('Build the cake like the pictures, from the bottom up.', { interrupt: true })
    },
    onClose: cancelCheck,
    voice,
    html: `
    <div class="studio-row"><button id="recipe-tab" aria-pressed="true" aria-label="Build a recipe" title="Build a recipe">🎂</button><button id="share-tab" aria-pressed="false" aria-label="Share the cake" title="Share the cake">🍽️🍽️</button></div>
    <canvas class="studio-preview" role="img" aria-label="Your cake and equal portions"></canvas>
    <section id="recipe-panel"><div class="recipe-strip" aria-label="Recipe from bottom to top"></div><div id="flavour-buttons" class="studio-row"></div><div class="studio-row"><button id="recipe-undo" aria-label="Undo layer" title="Undo layer">⌫</button><button id="recipe-check" aria-label="Check recipe" title="Check recipe">✓</button><button id="recipe-next" aria-label="Next recipe" title="Next recipe">➡️</button></div></section>
    <section id="share-panel" hidden><div class="studio-row"><button id="share-size" aria-label="Try 3 friends" title="Try 3 friends">🐻🐰🦊</button><button id="share-cut" aria-label="Cut 6 slices" title="Cut 6 slices">🔪 🎂</button><button id="share-undo" aria-label="Undo" title="Undo">⌫</button><button id="share-reset" aria-label="Start again" title="Start again">🔄</button></div><div id="friend-buttons" class="studio-row"></div><button id="share-check" aria-label="Check equal shares" title="Check equal shares">✓ ⚖️</button></section>
    <p class="studio-status" role="status" aria-live="polite">⬇️ 🎂</p>`,
  })
  const $ = (selector) => studio.dialog.querySelector(selector)
  const status = $('.studio-status')
  // The status line is pictures, so a child who cannot read yet can follow it too.
  const say = (text) => { status.textContent = text }
  const faces = () => FRIENDS.slice(0, friends).map((f) => f.emoji).join(' ')
  const play = (name, ...args) => {
    sound?.unlock?.()
    sound?.[name]?.(...args)
  }
  // Each tap's answer replaces the last one, so a quick child never hears a backlog
  studio.dialog.addEventListener('click', cancelCheck, true)
  const speak = voice.sayNow
  const stillMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let hop = 0
  /** A happy bounce of the preview cake, drawn for a moment and then the view rests again. */
  function bounce() {
    if (stillMotion.matches || !view) return
    cancelAnimationFrame(hop)
    const start = performance.now()
    const base = view.root.scale.x
    const step = (now) => {
      const t = Math.min(1, (now - start) / 700)
      const s = Math.sin(t * Math.PI * 3) * (1 - t) * 0.12
      view.root.scale.set(base * (1 - s * 0.5), base * (1 + s), base * (1 - s * 0.5))
      view.render()
      hop = t < 1 ? requestAnimationFrame(step) : 0
    }
    hop = requestAnimationFrame(step)
  }
  const recipe = () => RECIPES[recipeIndex]
  const slicesOf = (friend) => owners.filter((owner) => owner === friend).length
  const plateX = (friend) => (friend - (friends - 1) / 2) * PLATE_GAP

  function resetShares() {
    owners.length = slices
    owners.fill(null)
    history.length = 0
  }

  // The view's tabletop is the one box in its scene.
  function showTable(visible) {
    const table = view.root.parent.children.find((o) => o.isMesh && o.geometry.type === 'BoxGeometry')
    if (table) table.visible = visible
  }

  // The kit's fallback pieces are built fresh, so the view owns (and disposes) them.
  function drawCake() {
    // The recipe cake fills the preview; the sharing table keeps the wide view.
    // Four- and five-layer cakes shrink and sit lower, so the top layer always stays in the picture.
    const extra = Math.max(0, layers.length - 3)
    view.root.scale.setScalar(2.3 - extra * 0.3)
    view.root.position.set(0, -0.9 - extra * 0.3, 0)
    // Tipped back a little, so the preview looks at the cake more from the side and every layer shows its side colours like the recipe pictures.
    view.root.quaternion.setFromAxisAngle(TIP_AXIS, -0.36)
    // The flat studio table would cut through the tipped stand, so the cake gets its own round party board instead.
    showTable(false)
    const board = view.mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.06, 48), '#ffc9dc')
    board.position.y = -0.03
    const stand = cakeKit.stand()
    if (!cakeKit.src.cake_stand) view.own(stand)
    view.root.add(stand)
    layers.forEach((flavour, i) => {
      const layer = cakeKit.layer(flavour)
      if (!cakeKit.src.cake_layer) view.own(layer.group)
      layer.group.position.y = STAND_TOP + i * STEP
      // Game-sized layers: wide enough to see each flavour, tall enough to count them
      layer.body.scale.set(1.5, 1, 1.5)
      view.root.add(layer.group)
    })
    if (!layers.length) {
      const candle = cakeKit.topper('topper_star')
      // A big gold star marks the empty stand where the first layer goes
      candle.position.y = STAND_TOP
      candle.scale.setScalar(2.2)
      view.root.add(candle)
    }
  }

  // One slice of the layered cake: on the cake stand, or on its owner's plate.
  function drawWedge(index) {
    const wedge = new THREE.Group()
    view.root.add(wedge)
    const angle = (Math.PI * 2) / slices
    const start = index * angle
    const flavours = layers.length ? layers : recipe()
    flavours.forEach((flavour, i) => {
      const piece = view.mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.26, 12, 1, false, start, angle - 0.025), FLAVOURS[flavour].sponge)
      piece.position.y = 0.24 + i * 0.3
      wedge.add(piece)
      const icing = view.mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.035, 12, 1, false, start, angle - 0.025), FLAVOURS[flavour].icing)
      icing.position.y = 0.39 + i * 0.3
      wedge.add(icing)
    })
    const owner = owners[index]
    if (owner === null) {
      // Nudge each slice outward a little so the cuts show.
      const middle = start + angle / 2
      wedge.position.set(Math.sin(middle) * 0.14, 0, Math.cos(middle) * 0.14)
      return
    }
    // Earlier slices on the same plate set where this one sits, two per row.
    const onPlate = owners.slice(0, index).filter((o) => o === owner).length
    const [x, z] = owner === BAKER_PLATE ? [BAKER.x, BAKER.z - 0.15] : [plateX(owner), 2.5]
    wedge.position.set(x + ((onPlate % 2) - 0.5) * 0.45, 0, z + Math.floor(onPlate / 2) * 0.3)
    wedge.rotation.y = -start
    wedge.scale.setScalar(0.6)
  }

  function drawSharing() {
    view.root.scale.setScalar(1)
    view.root.position.set(0, 0, 0)
    view.root.quaternion.identity()
    showTable(true)
    const cakePlate = view.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 40), '#eed6e8')
    cakePlate.position.y = 0.04
    for (let f = 0; f < friends; f++) {
      const plate = view.mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 32), FRIENDS[f].plate)
      plate.position.set(plateX(f), 0.04, 2.6)
      const face = faceSprite(FRIENDS[f].emoji)
      face.scale.setScalar(0.85)
      face.position.set(plateX(f) + 0.95, 0.55, 3.35)
      view.root.add(face)
    }
    const bakerPlate = view.mesh(new THREE.CylinderGeometry(1, 1, 0.08, 32), BAKER.plate)
    bakerPlate.position.set(BAKER.x, 0.04, BAKER.z)
    const chef = faceSprite(BAKER.emoji)
    chef.scale.setScalar(0.7)
    chef.position.set(BAKER.x + 0.8, 0.5, BAKER.z + 0.6)
    view.root.add(chef)
    for (let i = 0; i < slices; i++) drawWedge(i)
  }

  function draw() {
    cancelAnimationFrame(hop)
    hop = 0
    view ??= createStudioView($('.studio-preview'))
    view.clear()
    if (sharing) drawSharing()
    else drawCake()
    view.render()
    updateControls()
  }

  function updateControls() {
    $('#recipe-panel').hidden = sharing
    $('#share-panel').hidden = !sharing
    $('#recipe-tab').setAttribute('aria-pressed', String(!sharing))
    $('#share-tab').setAttribute('aria-pressed', String(sharing))

    $('.recipe-strip').replaceChildren(...recipe().map((flavour, i) => {
      const step = document.createElement('span')
      const built = layers[i]
      step.className = `recipe-step${built === flavour ? ' done' : built ? ' wrong' : i === layers.length ? ' next' : ''}`
      step.style.setProperty('--icing', FLAVOURS[flavour].icing)
      step.style.setProperty('--sponge', FLAVOURS[flavour].sponge)
      step.setAttribute('aria-label', `${i + 1}: ${flavour}`)
      // Numbered from the bottom (1) up, instead of words a pre-reader cannot read.
      step.innerHTML = `<span>${FLAVOURS[flavour].emoji}</span><small>${i + 1}</small>`
      return step
    }))

    // A tap on a plate hands it the next slice still on the cake. The plates show slices, not numerals:
    // the child counts them and compares, as at the party.
    const plates = [...FRIENDS.slice(0, friends).map((friend, f) => [friend, f]), [BAKER, BAKER_PLATE]]
    $('#friend-buttons').replaceChildren(...plates.map(([friend, f]) => {
      const b = document.createElement('button')
      b.className = f === BAKER_PLATE ? 'plate baker' : 'plate'
      b.style.setProperty('--plate', friend.plate)
      b.innerHTML = `<span>${friend.emoji}</span> <b>${'🍰'.repeat(slicesOf(f)) || '·'}</b>`
      b.setAttribute('aria-label', f === BAKER_PLATE ? `The baker's plate, ${slicesOf(f)} slices` : `Friend ${f + 1} plate, ${slicesOf(f)} slices`)
      b.onclick = () => {
        const next = owners.indexOf(null)
        if (next === -1) {
          checkShares()
          return
        }
        history.push(next)
        owners[next] = f
        play('pop', 0, slicesOf(f) * 2)
        const shared = owners.filter((o) => o !== null).length
        // The plates and a rising pop carry the count; no slice is spoken.
        say(`${friend.emoji} ${'🍰'.repeat(slicesOf(f))}`)
        draw()
        if (shared === slices) checkSoon(checkShares, 500)
      }
      return b
    }))

    $('#recipe-undo').disabled = !layers.length
    $('#recipe-next').classList.toggle('ready', layers.length === recipe().length && layers.every((f, i) => f === recipe()[i]))
    $('#share-undo').disabled = !history.length
  }

  for (const flavour of PANTRY) {
    const b = document.createElement('button')
    b.className = 'flavour'
    b.style.setProperty('--icing', FLAVOURS[flavour].icing)
    b.style.setProperty('--sponge', FLAVOURS[flavour].sponge)
    b.setAttribute('aria-label', `${FLAVOURS[flavour].emoji} ${flavour}`)
    // The colours and the picture name the flavour; the voice says its name the first time it is tapped
    // (once per round, like every other sentence), so building a recipe is not a stream of words.
    b.innerHTML = `<span>${FLAVOURS[flavour].emoji}</span>`
    b.title = flavour
    b.onclick = () => {
      if (layers.length === MAX_LAYERS) {
        say('5 ✋ ⌫')
        return
      }
      layers.push(flavour)
      const i = layers.length - 1
      const right = recipe()[i] === flavour
      say(layers.map((f) => FLAVOURS[f].emoji).join(' ⬆️ '))
      draw()
      // A right layer chimes higher each time; a layer that differs from its picture gets a soft wobble.
      if (right) play('perfect', i * 2)
      else play('wobble')
      if (layers.length === recipe().length) checkSoon(checkRecipe, 450)
      else if (voice.sayOnce) voice.sayOnce(flavour, { interrupt: true })
      else speak(flavour)
    }
    $('#flavour-buttons').append(b)
  }

  $('#recipe-undo').onclick = () => {
    layers.pop()
    play('click')
    say('⌫')
    draw()
  }
  function checkRecipe() {
    const matches = layers.length === recipe().length && layers.every((f, i) => f === recipe()[i])
    if (matches) {
      say('🎉 ✓')
      play('perfect', 6)
      play('cheer')
      speak('Yummy! Your cake matches the recipe!')
      bounce()
      return
    }
    play('wobble')
    const wrong = layers.findIndex((f, i) => f !== recipe()[i])
    say(wrong >= 0 ? `🔎 ${wrong + 1}` : `🔎 ${recipe().length} 🍰`)
    speak(wrong >= 0 ? `Oops! Look at layer ${wrong + 1}.` : `This recipe has ${recipe().length} layers.`)
  }
  $('#recipe-check').onclick = checkRecipe
  $('#recipe-next').onclick = () => {
    recipeIndex = (recipeIndex + 1) % RECIPES.length
    layers = []
    play('click')
    say('🆕 ⬇️ 🎂')
    speak('A new recipe! Start at the bottom.')
    draw()
  }

  $('#recipe-tab').onclick = () => {
    sharing = false
    play('click')
    say('⬇️ 🎂')
    draw()
  }
  $('#share-tab').onclick = () => {
    sharing = true
    play('click')
    resetShares()
    say(`${slices} 🍰 ➜ ${faces()}`)
    speak(`Share the cake with ${friends} friends. Give everyone the same!`)
    draw()
  }
  // Two or three friends share the same cake: 6 slices go round both ways, 4 and 8 leave one or two
  // for the baker when three share, and 12 goes round in halves and thirds alike.
  $('#share-size').onclick = () => {
    friends = friends === 2 ? 3 : 2
    // Picture-only for pre-readers: the button shows the friends it would bring
    const other = friends === 2 ? 3 : 2
    $('#share-size').textContent = FRIENDS.slice(0, other).map((f) => f.emoji).join('')
    $('#share-size').setAttribute('aria-label', `Try ${other} friends`)
    $('#share-size').title = `Try ${other} friends`
    resetShares()
    play('click')
    say(`${slices} 🍰 ➜ ${faces()}`)
    speak(`${friends} friends.`)
    draw()
  }
  // The knife cuts the cake again, into the next number of slices (and every slice goes back on the cake).
  $('#share-cut').onclick = () => {
    slices = CUTS[(CUTS.indexOf(slices) + 1) % CUTS.length]
    const next = CUTS[(CUTS.indexOf(slices) + 1) % CUTS.length]
    $('#share-cut').setAttribute('aria-label', `Cut ${next} slices`)
    $('#share-cut').title = `Cut ${next} slices`
    resetShares()
    play('click')
    say(`${slices} 🍰 ➜ ${faces()}`)
    speak(`${slices} slices.`)
    draw()
  }
  $('#share-undo').onclick = () => {
    if (history.length) owners[history.pop()] = null
    play('click')
    say('🍰 ➜ 🎂')
    draw()
  }
  $('#share-reset').onclick = () => {
    resetShares()
    play('click')
    say('🔄')
    draw()
  }
  // Fair: every slice is off the cake, every friend has the same, and the baker has only slices that
  // could not go round again (fewer than there are friends).
  function checkShares() {
    const each = slicesOf(0)
    const left = slicesOf(BAKER_PLATE)
    const onCake = owners.includes(null)
    const even = FRIENDS.slice(0, friends).every((_, f) => slicesOf(f) === each)
    const fair = !onCake && even && left < friends
    const plates = FRIENDS.slice(0, friends).map((f) => `${f.emoji}${'🍰'.repeat(each)}`).join('  ')
    say(fair ? `🎉 ${plates}${left ? `  ${BAKER.emoji}${'🍰'.repeat(left)}` : ` = ${friends === 2 ? '½' : '⅓'}`}` : onCake ? '🎂 🍰 ?' : '🔎 ⚖️')
    if (fair) {
      play('perfect', 6)
      play('cheer')
      speak(left ? `Fair share! ${each} each, and ${left} for the baker.` : `Fair share! ${each} each: ${friends === 2 ? 'one half' : 'one third'} of the cake each!`)
      bounce()
    } else {
      play('wobble')
      speak(onCake ? 'Some slices are still on the cake.' : even ? 'The baker has enough to go round again!' : 'Not fair yet! Count the slices on every plate.')
    }
  }
  $('#share-check').onclick = checkShares

  resetShares()
  return {
    get open() { return studio.open },
    get state() {
      return { layers: [...layers], owners: [...owners], friends, slices, sharing, recipeIndex, draws: view?.draws || 0 }
    },
  }
}
