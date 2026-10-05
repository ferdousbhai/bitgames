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
  { emoji: '🐻', plate: '#bedacc' },
  { emoji: '🐰', plate: '#bed4ed' },
  { emoji: '🦊', plate: '#e6caea' },
]
const PLATE_GAP = 2.9

export function createRecipeStudio({ cakeKit, openButton }) {
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
    <section id="share-panel" hidden><p>Choose a slice, then a friend's plate. Give everyone the same number.</p><div class="studio-row"><button id="share-size">Try 3 friends</button><button id="share-undo">⌫ Undo share</button><button id="share-reset">Start sharing again</button></div><div id="slice-buttons" class="studio-row"></div><div id="friend-buttons" class="studio-row"></div><button id="share-check">Check equal shares ✓</button></section>
    <p class="studio-status" role="status" aria-live="polite">Choose the first layer.</p>`,
  })
  const $ = (selector) => studio.dialog.querySelector(selector)
  const status = $('.studio-status')
  const say = (text) => { status.textContent = text }
  const recipe = () => RECIPES[recipeIndex]
  const slicesOf = (friend) => owners.filter((owner) => owner === friend).length
  const plateX = (friend) => (friend - (friends - 1) / 2) * PLATE_GAP

  function resetShares() {
    owners.length = slices
    owners.fill(null)
    selected = null
    history.length = 0
  }

  // The kit's fallback pieces are built fresh, so the view owns (and disposes) them.
  function drawCake() {
    const stand = cakeKit.stand()
    if (!cakeKit.src.cake_stand) view.own(stand)
    view.root.add(stand)
    layers.forEach((flavour, i) => {
      const layer = cakeKit.layer(flavour)
      if (!cakeKit.src.cake_layer) view.own(layer.group)
      layer.group.position.y = STAND_TOP + i * STEP
      layer.body.scale.set(2.6, 1, 2.6)
      view.root.add(layer.group)
    })
    if (!layers.length) {
      const candle = cakeKit.topper('topper_star')
      candle.position.y = STAND_TOP
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
    const cakePlate = view.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 40), '#eed6e8')
    cakePlate.position.y = 0.04
    for (let f = 0; f < friends; f++) {
      const plate = view.mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 32), FRIENDS[f].plate)
      plate.position.set(plateX(f), 0.04, 2.6)
    }
    for (let i = 0; i < slices; i++) drawWedge(i)
  }

  function draw() {
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
      step.className = 'recipe-step'
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
        updateControls()
        say(`Slice ${i + 1} is ready. Choose a friend's plate.`)
      }
      return b
    }))

    $('#friend-buttons').replaceChildren(...FRIENDS.slice(0, friends).map((friend, f) => {
      const b = document.createElement('button')
      b.textContent = `${friend.emoji} ${slicesOf(f)} slices`
      b.setAttribute('aria-label', `Friend ${f + 1} plate`)
      b.onclick = () => {
        if (selected === null) {
          say('Choose an unshared slice first.')
          return
        }
        history.push(selected)
        owners[selected] = f
        selected = null
        say(`${owners.filter((o) => o !== null).length} of ${slices} slices shared.`)
        draw()
      }
      return b
    }))

    $('#recipe-undo').disabled = !layers.length
    $('#share-undo').disabled = !history.length
  }

  for (const flavour of PANTRY) {
    const b = document.createElement('button')
    b.textContent = `${FLAVOURS[flavour].emoji} ${flavour}`
    b.onclick = () => {
      if (layers.length === MAX_LAYERS) {
        say('Five layers is our tallest cake. Undo a layer to change it.')
        return
      }
      layers.push(flavour)
      say(`${layers.length} layers: ${layers.map((f) => FLAVOURS[f].emoji).join(' → ')}`)
      draw()
    }
    $('#flavour-buttons').append(b)
  }

  $('#recipe-undo').onclick = () => {
    layers.pop()
    say('Try a different layer.')
    draw()
  }
  $('#recipe-check').onclick = () => {
    const matches = layers.length === recipe().length && layers.every((f, i) => f === recipe()[i])
    say(matches ? 'The cake matches every picture, from bottom to top!' : 'Compare each layer with the pictures, starting at the bottom. Undo lets you change it.')
  }
  $('#recipe-next').onclick = () => {
    recipeIndex = (recipeIndex + 1) % RECIPES.length
    layers = []
    say('A new recipe! Choose the bottom layer first.')
    draw()
  }

  $('#recipe-tab').onclick = () => {
    sharing = false
    say('Build from bottom to top.')
    draw()
  }
  $('#share-tab').onclick = () => {
    sharing = true
    resetShares()
    say(`${slices} equal slices for ${friends} friends.`)
    draw()
  }
  // Two slices each: 4 slices for 2 friends (halves) or 6 for 3 friends (thirds).
  $('#share-size').onclick = () => {
    friends = friends === 2 ? 3 : 2
    slices = friends * 2
    $('#share-size').textContent = `Try ${friends === 2 ? 3 : 2} friends`
    resetShares()
    say(`${slices} equal slices for ${friends} friends.`)
    draw()
  }
  $('#share-undo').onclick = () => {
    if (history.length) owners[history.pop()] = null
    selected = null
    say('The last slice is back on the cake.')
    draw()
  }
  $('#share-reset').onclick = () => {
    resetShares()
    say('Try another way to share equally.')
    draw()
  }
  $('#share-check').onclick = () => {
    const fair = owners.every((o) => o !== null) && FRIENDS.slice(0, friends).every((_, f) => slicesOf(f) === slices / friends)
    say(fair
      ? `Everyone has 2 of ${slices} equal slices: ${friends === 2 ? 'one half' : 'one third'} of the cake each!`
      : 'Count the slices on every plate. Share all the slices and give everyone the same number.')
  }

  resetShares()
  return {
    get open() { return studio.open },
    get state() {
      return { layers: [...layers], owners: [...owners], friends, slices, sharing, selected, recipeIndex, draws: view?.draws || 0 }
    },
  }
}
