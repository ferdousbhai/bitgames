import * as THREE from 'three'
import { createStudioDialog, createStudioView } from './studio-dialog.js'
import { createVoice } from './speech.js'
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
 * sound (optional) is the game's synth: pop, perfect, cheer, click, good, wobble, muted.
 * Feedback is also spoken, so a child who cannot read yet still hears what happened.
 */
export function createRecipeStudio({ cakeKit, openButton, sound = null, voice = createVoice({ isMuted: () => !!sound?.muted }) }) {
  let view = null
  let recipeIndex = 0
  let layers = []
  let sharing = false
  let friends = 2
  let slices = 4
  let selected = null // slice index waiting for a plate
  const owners = [] // per slice: friend index, or null while still on the cake
  const history = [] // shared slice indices, for Undo

  const studio = createStudioDialog({
    id: 'birthday-studio',
    title: '🎂 Birthday recipe studio',
    openButton,
    onOpen: draw,
    html: `
    <div class="studio-row"><button id="recipe-tab" aria-pressed="true">Build a recipe</button><button id="share-tab" aria-pressed="false">Share the cake</button></div>
    <canvas class="studio-preview" role="img" aria-label="Your cake and equal portions"></canvas>
    <section id="recipe-panel"><p>Follow the pictures from the bottom layer to the top.</p><div class="recipe-strip" aria-label="Recipe from bottom to top"></div><div id="flavour-buttons" class="studio-row"></div><div class="studio-row"><button id="recipe-undo">⌫ Undo layer</button><button id="recipe-check">Check recipe ✓</button><button id="recipe-next">Next recipe →</button></div></section>
    <section id="share-panel" hidden><p>Tap a friend's plate to give them a slice. Give everyone the same number.</p><div class="studio-row"><button id="share-size">Try 3 friends</button><button id="share-undo">⌫ Undo</button><button id="share-reset">↺ Start again</button></div><div id="slice-buttons" class="studio-row"></div><div id="friend-buttons" class="studio-row"></div><button id="share-check">Check equal shares ✓</button></section>
    <p class="studio-status" role="status" aria-live="polite">Choose the first layer.</p>`,
  })
  const $ = (selector) => studio.dialog.querySelector(selector)
  const status = $('.studio-status')
  const say = (text) => { status.textContent = text }
  const play = (name, ...args) => {
    sound?.unlock?.()
    sound?.[name]?.(...args)
  }
  // Each tap's answer replaces the last one, so a quick child never hears a backlog
  const speak = (text) => voice.say(text, { interrupt: true })
  studio.dialog.addEventListener('close', () => voice.hush())
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
    selected = null
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
    wedge.position.set(plateX(owner) + ((onPlate % 2) - 0.5) * 0.45, 0, 2.5 + Math.floor(onPlate / 2) * 0.3)
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

    const last = recipe().length - 1
    $('.recipe-strip').replaceChildren(...recipe().map((flavour, i) => {
      const step = document.createElement('span')
      const built = layers[i]
      step.className = `recipe-step${built === flavour ? ' done' : built ? ' wrong' : i === layers.length ? ' next' : ''}`
      step.style.setProperty('--icing', FLAVOURS[flavour].icing)
      step.style.setProperty('--sponge', FLAVOURS[flavour].sponge)
      step.setAttribute('aria-label', `${i + 1}: ${flavour}`)
      step.innerHTML = `<span>${FLAVOURS[flavour].emoji}</span><small>${i === 0 ? 'Bottom' : i === last ? 'Top' : `Layer ${i + 1}`}</small>`
      return step
    }))

    $('#slice-buttons').replaceChildren(...owners.map((owner, i) => {
      const b = document.createElement('button')
      b.textContent = `🍰 ${i + 1}`
      b.setAttribute('aria-label', `Slice ${i + 1}`)
      b.setAttribute('aria-pressed', String(selected === i))
      b.disabled = owner !== null
      b.onclick = () => {
        selected = i
        play('click')
        updateControls()
        say(`Slice ${i + 1} is ready. Choose a friend's plate.`)
      }
      return b
    }))

    $('#friend-buttons').replaceChildren(...FRIENDS.slice(0, friends).map((friend, f) => {
      const b = document.createElement('button')
      b.className = 'plate'
      b.style.setProperty('--plate', friend.plate)
      b.innerHTML = `<span>${friend.emoji}</span> <b>${'🍰'.repeat(slicesOf(f)) || '·'}</b> <small>${slicesOf(f)}</small>`
      b.setAttribute('aria-label', `Friend ${f + 1} plate`)
      b.onclick = () => {
        // Tapping a plate with no slice chosen hands over the next slice still on the cake.
        if (selected === null) selected = owners.indexOf(null)
        if (selected === -1) {
          selected = null
          checkShares()
          return
        }
        history.push(selected)
        owners[selected] = f
        selected = null
        play('pop', 0, slicesOf(f) * 2)
        const shared = owners.filter((o) => o !== null).length
        say(`${shared} of ${slices} slices shared.`)
        speak(`${friend.name}: ${slicesOf(f)}`)
        draw()
        if (shared === slices) setTimeout(() => sharing && owners.every((o) => o !== null) && checkShares(), 500)
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
    b.innerHTML = `<span>${FLAVOURS[flavour].emoji}</span><small>${flavour}</small>`
    b.onclick = () => {
      if (layers.length === MAX_LAYERS) {
        say('Five layers is our tallest cake. Undo a layer to change it.')
        return
      }
      layers.push(flavour)
      const i = layers.length - 1
      const right = recipe()[i] === flavour
      say(`${layers.length} ${layers.length === 1 ? 'layer' : 'layers'}: ${layers.map((f) => FLAVOURS[f].emoji).join(' → ')}`)
      draw()
      // A right layer chimes higher each time; a layer that differs from its picture gets a soft wobble.
      if (right) play('perfect', i * 2)
      else play('wobble')
      if (layers.length === recipe().length) setTimeout(checkRecipe, 450)
      else speak(flavour)
    }
    $('#flavour-buttons').append(b)
  }

  $('#recipe-undo').onclick = () => {
    layers.pop()
    play('click')
    say('Try a different layer.')
    draw()
  }
  function checkRecipe() {
    if (sharing) return
    const matches = layers.length === recipe().length && layers.every((f, i) => f === recipe()[i])
    if (matches) {
      say('🎉 The cake matches every picture, from bottom to top!')
      play('perfect', 6)
      play('cheer')
      speak('Yummy! Your cake matches the recipe!')
      bounce()
      return
    }
    say('🔎 Compare each layer with the pictures, starting at the bottom. Undo lets you change it.')
    play('wobble')
    const wrong = layers.findIndex((f, i) => f !== recipe()[i])
    speak(wrong >= 0 ? `Oops! Look at layer ${wrong + 1}.` : `This recipe has ${recipe().length} layers.`)
  }
  $('#recipe-check').onclick = checkRecipe
  $('#recipe-next').onclick = () => {
    recipeIndex = (recipeIndex + 1) % RECIPES.length
    layers = []
    play('click')
    say('A new recipe! Choose the bottom layer first.')
    speak('A new recipe! Start at the bottom.')
    draw()
  }

  $('#recipe-tab').onclick = () => {
    sharing = false
    play('click')
    say('Build from bottom to top.')
    draw()
  }
  $('#share-tab').onclick = () => {
    sharing = true
    play('click')
    resetShares()
    say(`${slices} equal slices for ${friends} friends.`)
    speak(`Share the cake with ${friends} friends. Tap a plate!`)
    draw()
  }
  // Two slices each: 4 slices for 2 friends (halves) or 6 for 3 friends (thirds).
  $('#share-size').onclick = () => {
    friends = friends === 2 ? 3 : 2
    slices = friends * 2
    $('#share-size').textContent = `Try ${friends === 2 ? 3 : 2} friends`
    resetShares()
    play('click')
    say(`${slices} equal slices for ${friends} friends.`)
    speak(`${friends} friends.`)
    draw()
  }
  $('#share-undo').onclick = () => {
    if (history.length) owners[history.pop()] = null
    selected = null
    play('click')
    say('The last slice is back on the cake.')
    draw()
  }
  $('#share-reset').onclick = () => {
    resetShares()
    play('click')
    say('Try another way to share equally.')
    draw()
  }
  function checkShares() {
    const fair = owners.every((o) => o !== null) && FRIENDS.slice(0, friends).every((_, f) => slicesOf(f) === slices / friends)
    say(fair
      ? `🎉 Everyone has 2 of ${slices} equal slices: ${friends === 2 ? 'one half' : 'one third'} of the cake each!`
      : '🔎 Count the slices on every plate. Share all the slices and give everyone the same number.')
    if (fair) {
      play('perfect', 6)
      play('cheer')
      speak(`Fair share! Everyone has two slices: ${friends === 2 ? 'one half' : 'one third'} each!`)
      bounce()
    } else {
      play('wobble')
      speak(owners.includes(null) ? 'Some slices are still on the cake.' : 'Not fair yet! Count the slices on every plate.')
    }
  }
  $('#share-check').onclick = checkShares

  resetShares()
  return {
    get open() { return studio.open },
    get state() {
      return { layers: [...layers], owners: [...owners], friends, slices, sharing, selected, recipeIndex, draws: view?.draws || 0 }
    },
  }
}
