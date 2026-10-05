import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createStudioDialog, createStudioView } from './studio-dialog.js'
import { MAX_DROPS, mixToyPaint } from './colour-model.js'

const PAINTS = [
  { name: 'Red', emoji: '🔴', hex: '#eb5063' },
  { name: 'Yellow', emoji: '🟡', hex: '#f8d64e' },
  { name: 'Blue', emoji: '🔵', hex: '#4e8ad5' },
]
const BLANK = '#fff9eb'
const SQUARES = 25

export function createColourStudio({ openButton, onOpen, onClose }) {
  const drops = [0, 0, 0]
  const history = [] // paint index of each drop, for Undo
  const picture = Array(SQUARES).fill(BLANK)
  let saved = null // colour A, kept to compare with the current mixture
  let view = null
  let kit = null
  let loading = false
  let assetError = false
  const mix = () => mixToyPaint(drops)

  const studio = createStudioDialog({
    id: 'colour-studio',
    title: '🎨 My colour workshop',
    openButton,
    onOpen: () => {
      onOpen?.()
      draw()
      loadKit()
    },
    onClose,
    html: `
    <p>Our toy paint mixes red, yellow and blue. Real paints can mix differently.</p>
    <canvas class="studio-preview" role="img" aria-label="Paint bottles, mixing cup and your mosaic"></canvas>
    <div id="paint-drops" class="studio-row"></div>
    <div class="studio-row"><button id="paint-undo">⌫ Undo drop</button><button id="paint-clear">Empty cup</button><button id="paint-compare">Keep colour A</button></div>
    <p class="studio-status" role="status" aria-live="polite">Add a drop to start mixing.</p>
    <div id="colour-comparison" class="studio-row" aria-label="Compare your colours"></div>
    <p>Touch a square to paint it with your mixture.</p><div class="paint-grid" aria-label="Your colour mosaic"></div>
    <div class="studio-row"><button id="paint-picture-clear">Clear my picture</button><button id="paint-assets-retry" hidden>Retry toy models</button></div>`,
  })
  const $ = (selector) => studio.dialog.querySelector(selector)
  const status = $('.studio-status')

  // Places a scaled copy of a toy-kit model on the table, optionally repainting its non-white parts.
  function prop(name, size, x, z, tint) {
    const original = kit?.getObjectByName(name)
    if (!original) return
    const model = original.clone(true)
    const box = new THREE.Box3().setFromObject(model)
    const span = box.getSize(new THREE.Vector3())
    model.position.sub(box.getCenter(new THREE.Vector3()))
    const holder = new THREE.Group()
    holder.add(model)
    holder.scale.setScalar(size / Math.max(span.x, span.y, span.z))
    holder.position.set(x, size / 2, z)
    view.root.add(holder)
    if (!tint) return
    const paint = view.material(tint)
    model.traverse((o) => {
      if (!o.isMesh) return
      const { r, g, b } = o.material.color
      if (Math.min(r, g, b) <= 0.7) o.material = paint
    })
  }

  function drawScene(result) {
    view.clear()
    prop('cup', 1.35, 2, 1)
    const liquid = view.mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 32), result.hex)
    liquid.position.set(2, 0.85, 1)
    liquid.visible = result.drops > 0
    PAINTS.forEach((paint, i) => {
      const x = -2.4 + i * 1.45
      prop('bottle', 1.3, x, 1, paint.hex)
      const token = view.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24), paint.hex)
      token.position.set(x, 0.06, 1)
    })
    const frame = view.mesh(new THREE.BoxGeometry(4.8, 0.08, 3.2), '#b6a3c9')
    frame.position.set(-0.45, 0.02, -1.5)
    picture.forEach((colour, i) => {
      const tile = view.mesh(new THREE.BoxGeometry(0.8, 0.065, 0.48), colour)
      tile.position.set(-2.15 + (i % 5) * 0.85, 0.12, -2.55 + Math.floor(i / 5) * 0.53)
    })
    if (saved) {
      const swatch = view.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), saved.hex)
      swatch.position.set(3, 0.06, -1.7)
    }
    view.render()
  }

  function draw() {
    if (!studio.open) return
    view ??= createStudioView($('.studio-preview'))
    const result = mix()
    drawScene(result)

    dropButtons.forEach((button, i) => {
      button.textContent = `${PAINTS[i].emoji} ${PAINTS[i].name}: ${drops[i]}`
      button.disabled = result.drops >= MAX_DROPS
    })
    $('#paint-undo').disabled = !history.length
    status.textContent = result.drops
      ? `${result.name} · ${result.drops} drops (${drops[0]} red, ${drops[1]} yellow, ${drops[2]} blue).`
      : 'Add a drop to start mixing.'

    const comparison = $('#colour-comparison')
    comparison.replaceChildren()
    if (saved) {
      for (const [label, colour] of [['A', saved], ['B', result]]) {
        const swatch = document.createElement('span')
        swatch.style.cssText = `background:${colour.hex};border:2px solid #786684;border-radius:14px;padding:10px;color:#30273d`
        swatch.textContent = `${label}: ${colour.name} (${colour.drops} drops)`
        comparison.append(swatch)
      }
    }
    cells.forEach((cell, i) => { cell.style.background = picture[i] })
    $('#paint-assets-retry').hidden = !assetError
  }

  // The toy models are optional: mixing and painting keep working while they load or if they fail.
  async function loadKit() {
    if (kit || loading) return
    loading = true
    try {
      kit = (await new GLTFLoader().loadAsync('./models/colour-kit.glb')).scene
      assetError = false
    } catch {
      assetError = true
    } finally {
      loading = false
      draw()
      if (assetError) status.textContent = 'The toy models could not load. You can still mix and paint; Retry loads the toys again.'
    }
  }

  function button(label, parent, onClick) {
    const b = document.createElement('button')
    b.setAttribute('aria-label', label)
    b.onclick = onClick
    $(parent).append(b)
    return b
  }
  const dropButtons = PAINTS.map((paint, i) => button(`Add ${paint.name.toLowerCase()} drop`, '#paint-drops', () => {
    if (mix().drops >= MAX_DROPS) return
    drops[i]++
    history.push(i)
    draw()
  }))
  const cells = picture.map((_, i) => button(`Paint square ${i + 1}`, '.paint-grid', () => {
    const colour = mix()
    if (!colour.drops) {
      status.textContent = 'Mix a colour first, then paint a square.'
      return
    }
    picture[i] = colour.hex
    draw()
  }))

  $('#paint-undo').onclick = () => {
    if (history.length) drops[history.pop()]--
    draw()
  }
  $('#paint-clear').onclick = () => {
    drops.fill(0)
    history.length = 0
    draw()
  }
  $('#paint-compare').onclick = () => {
    const colour = mix()
    if (!colour.drops) {
      status.textContent = 'Mix a colour first to keep it as colour A.'
      return
    }
    saved = colour
    draw()
  }
  $('#paint-picture-clear').onclick = () => {
    picture.fill(BLANK)
    draw()
  }
  $('#paint-assets-retry').onclick = loadKit

  return {
    close: studio.close,
    get open() { return studio.open },
    get state() {
      return { drops: [...drops], picture: [...picture], saved, assetReady: !!kit, assetError, draws: view?.draws || 0 }
    },
  }
}
