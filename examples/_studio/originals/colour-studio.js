import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createStudioDialog, createStudioView } from './studio-dialog.js'
import { MAX_DROPS, mixToyPaint } from './colour-model.js'

const PAINTS = [
  { name: 'Red', word: 'red', ish: 'reddish', emoji: '🔴', hex: '#eb5063' },
  { name: 'Yellow', word: 'yellow', ish: 'yellowish', emoji: '🟡', hex: '#f8d64e' },
  { name: 'Blue', word: 'blue', ish: 'bluish', emoji: '🔵', hex: '#4e8ad5' },
]
/** The brown two equal favourites lean to, by index sum - 1: red+yellow, red+blue, yellow+blue. */
const LEANS = ['an orangey', 'a purplish', 'a greenish']
const BLANK = '#fff9eb'
const SQUARES = 25
const POUR_MS = 520
const SETTLE_MS = 300
const HINT_MS = 6000
const FRONT = 0.9 // how far in front of the middle the cup stands, towards the camera
const BACK = 0.5 // and the bottles behind
const RIGHT = 2.1 // the cup stands a little to the right, so it hides no bottle
const LOOK = new THREE.Vector3(0, 0.4, 0.6) // where the studio view's camera looks

/**
 * The colour words a child hears and sees: the model's own name ("Orange mixture" -> "Orange",
 * "Earthy mixture" -> "Brown") plus which paint there is more of when two are mixed unevenly.
 */
export function describeMix(drops) {
  const result = mixToyPaint(drops)
  const used = drops.map((n, i) => [n, i]).filter(([n]) => n > 0)
  const base = result.name === 'Earthy mixture' ? 'Brown' : result.name.replace(' mixture', '')
  let more = ''
  let say = ''
  if (used.length === 1) say = `${base}!`
  else if (used.length === 2) {
    const [[a, i], [b, j]] = used
    const pair = `${PAINTS[i].word} and ${PAINTS[j].word}`
    if (a === b) say = `${pair[0].toUpperCase()}${pair.slice(1)} make ${base.toLowerCase()}!`
    else {
      const major = PAINTS[a > b ? i : j]
      more = `more ${major.word}`
      say = `More ${major.word}: a ${major.ish} ${base.toLowerCase()}!`
    }
  } else if (used.length === 3) {
    // Brown leans toward whatever there is more of, so the words match the swatch (colour-model.js tints three-paint browns).
    const top = Math.max(...drops)
    const most = [0, 1, 2].filter((i) => drops[i] === top)
    if (most.length === 3) say = 'Red, yellow and blue together make brown!'
    else if (most.length === 1) {
      more = `more ${PAINTS[most[0]].word}`
      say = `More ${PAINTS[most[0]].word}: a ${PAINTS[most[0]].ish} brown!`
    } else {
      const [i, j] = most
      more = `more ${PAINTS[i].word} and ${PAINTS[j].word}`
      say = `More ${PAINTS[i].word} and ${PAINTS[j].word}: ${LEANS[i + j - 1]} brown!`
    }
  }
  return { ...result, base, more, say }
}

export function createColourStudio({ openButton, onOpen, onClose, speak = () => {}, sound = () => {} }) {
  const drops = [0, 0, 0]
  const history = [] // paint index of each drop, for Undo
  const picture = Array(SQUARES).fill(BLANK)
  let saved = null // colour A, kept to compare with the current mixture
  let view = null
  let kit = null
  let loading = false
  let assetError = false
  let greeted = false
  let hintTimer = 0
  const mix = () => describeMix(drops)

  const studio = createStudioDialog({
    id: 'colour-studio',
    title: '🎨 Mix my colours',
    openButton,
    onOpen: () => {
      onOpen?.()
      draw()
      loadKit()
      if (!greeted) speak('Tap a paint pot to drip paint in the cup!')
      greeted = true
      nudgeLater()
    },
    onClose: () => {
      clearTimeout(hintTimer)
      onClose?.()
    },
    html: `
    <div class="cs-body">
      <div id="paint-drops" class="cs-pots" aria-label="Paint pots"></div>
      <div class="cs-mix">
        <canvas class="studio-preview" role="img" aria-label="Paint bottles dripping into the mixing cup"></canvas>
        <div class="cs-readout">
          <p class="studio-status" role="status" aria-live="polite"></p>
          <div id="colour-comparison" aria-label="Compare your colours"></div>
        </div>
        <div class="cs-tools">
          <button id="paint-undo" aria-label="Undo drop">↩️<span> Undo</span></button>
          <button id="paint-clear" aria-label="Empty cup">🫗<span> Empty</span></button>
          <button id="paint-compare" aria-label="Keep this colour to compare">📌<span> Keep</span></button>
          <button id="paint-picture-clear" aria-label="Clear my picture">🧽<span> Clear</span></button>
          <button id="paint-assets-retry" hidden>🔁<span> Toys</span></button>
        </div>
      </div>
      <div class="cs-art"><div class="paint-grid" aria-label="Your colour mosaic: touch a square to paint it"></div></div>
    </div>
    <p class="cs-note">For grown-ups: a simple red, yellow and blue toy paint. Real paints can mix a little differently.</p>`,
  })
  const $ = (selector) => studio.dialog.querySelector(selector)
  const status = $('.studio-status')

  // --- The tabletop: three paint bottles dripping into a mixing cup ---------------------------

  let scene = null // the objects of the current drawing, for the pour animation

  // A lavender gingham tablecloth (Poly Haven CC0, recoloured in blender/tablecloth.py); plain until it loads.
  const cloth = new THREE.TextureLoader().load('./models/tablecloth.jpg', () => { if (studio.open && !anim) draw() }, undefined, () => {})
  cloth.colorSpace = THREE.SRGBColorSpace
  cloth.wrapS = cloth.wrapT = THREE.RepeatWrapping
  cloth.repeat.set(5, 5)
  cloth.anisotropy = 4
  let anim = null

  /** A rough stand-in for each kit toy, so mixing still shows if the models fail to load. */
  function standIn(name) {
    const group = new THREE.Group()
    const add = (geometry, colour, y) => {
      const m = view.mesh(geometry, colour)
      m.removeFromParent()
      m.position.y = y
      group.add(m)
    }
    if (name === 'cup') {
      add(new THREE.CylinderGeometry(0.34, 0.24, 0.72, 32, 1, true), '#f59fb8', 0.48)
      add(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 32), '#f59fb8', 0.1)
    } else {
      add(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 24), '#888888', 0.3)
      add(new THREE.CylinderGeometry(0.055, 0.055, 0.25, 16), '#888888', 0.65)
    }
    group.traverse((o) => { if (o.material) o.material.side = THREE.DoubleSide })
    return group
  }

  // Places a scaled copy of a toy-kit model on the table, optionally repainting its non-white parts.
  function prop(name, size, x, z, tint) {
    const original = kit?.getObjectByName(name)
    const model = original ? original.clone(true) : standIn(name)
    const box = new THREE.Box3().setFromObject(model)
    const span = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    model.position.x -= centre.x
    model.position.z -= centre.z
    model.position.y -= box.min.y
    const holder = new THREE.Group()
    holder.add(model)
    holder.scale.setScalar(size / Math.max(span.x, span.y, span.z))
    holder.position.set(x, 0, z)
    view.root.add(holder)
    model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = o.receiveShadow = true
      if (!tint) return
      const { r, g, b } = o.material.color
      if (Math.min(r, g, b) <= 0.7) o.material = view.material(tint)
    })
    return { holder, model, top: span.y }
  }

  /** Zooms the toys to fill the preview, whatever its shape (the view keeps the whole table in frame). */
  function render() {
    const { width, height } = $('.studio-preview').getBoundingClientRect()
    if (width && height) {
      const aspect = width / height
      const half = Math.max(2.65, 5 / aspect)
      const k = Math.min(1.9, Math.max(0.6, Math.min((half * aspect * 0.86) / 4.1, (half * 0.86) / 2.3)))
      view.root.scale.setScalar(k)
      view.root.position.copy(LOOK).multiplyScalar(1 - k)
      // The tabletop stays just above the view's own table at any zoom.
      if (scene) scene.floor.position.y = (-0.045 - view.root.position.y) / k
    }
    view.render()
  }

  /** How full the cup looks (in the cup model's own units): near the rim, so the colour shows from above. */
  const liquidLevel = (n) => 0.6 + 0.2 * Math.min(1, n / MAX_DROPS)
  const liquidRadius = (level) => 0.24 + (0.1 * (level - 0.12)) / 0.72 - 0.06

  function drawScene(shownHex, shownDrops) {
    view.clear()
    // A warm tabletop wider than any view, so no table edge shows on tall or wide screens.
    const floor = view.mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), cloth.image ? '#ffffff' : '#fbe6c8')
    floor.material.roughness = 1
    if (cloth.image) floor.material.map = cloth
    floor.position.y = -0.04
    floor.castShadow = false
    // Seen from the front-right: the bottles stand in a row at the back, the cup in front of them.
    const cup = prop('cup', 2.9, 0.2 + 0.5 * FRONT + 0.86 * RIGHT, 0.6 + 0.86 * FRONT - 0.5 * RIGHT)
    const liquid = view.mesh(new THREE.CylinderGeometry(1, 1, 0.04, 40), shownHex)
    liquid.material.roughness = 0.25
    liquid.removeFromParent()
    cup.model.add(liquid)
    const level = liquidLevel(shownDrops)
    liquid.position.y = level
    liquid.scale.set(liquidRadius(level), 1, liquidRadius(level))
    liquid.visible = shownDrops > 0
    const bottles = PAINTS.map((paint, i) => {
      const t = (i - 1) * 1.4 - 1.5
      const x = 0.2 + 0.86 * t - 0.5 * BACK
      const z = 0.6 - 0.5 * t - 0.86 * BACK
      const bottle = prop('bottle', 2.1, x, z, paint.hex)
      const puddle = view.mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 28), paint.hex)
      puddle.position.set(x, 0.03, z)
      return bottle
    })
    const drop = view.mesh(new THREE.SphereGeometry(0.22, 20, 14), '#ffffff')
    drop.visible = false
    scene = { cup, liquid, bottles, drop, floor }
  }

  /** One frame of the pour: the bottle hops and tips toward the cup, a drop arcs in, the paint ripples. */
  function pourFrame() {
    if (!anim || !scene || !studio.open) return
    const t = performance.now() - anim.start
    const { cup, liquid, bottles, drop } = scene
    const bottle = bottles[anim.paint].holder
    const home = anim.home
    const pour = Math.min(1, t / POUR_MS)
    const lift = Math.sin(Math.min(1, t / (POUR_MS + SETTLE_MS)) * Math.PI)
    // Hop and tip toward the cup.
    const toCup = new THREE.Vector3(cup.holder.position.x - home.x, 0, cup.holder.position.z - home.z).normalize()
    bottle.quaternion.setFromAxisAngle(new THREE.Vector3(toCup.z, 0, -toCup.x), lift * 0.4)
    bottle.position.set(home.x + toCup.x * lift * 0.2, lift * 0.9, home.z + toCup.z * lift * 0.2)
    const from = new THREE.Vector3(home.x + toCup.x * 0.8, 3, home.z + toCup.z * 0.8)
    view.root.updateMatrixWorld(true)
    const to = view.root.worldToLocal(liquid.getWorldPosition(new THREE.Vector3()))
    drop.material.color.set(PAINTS[anim.paint].hex)
    drop.visible = t > 120 && pour < 1
    const k = Math.max(0, (t - 120) / (POUR_MS - 120))
    drop.position.lerpVectors(from, to, k)
    drop.position.y += Math.sin(k * Math.PI) * 1.3
    if (pour >= 1 && !anim.landed) {
      anim.landed = true
      liquid.material.color.set(anim.hex)
      liquid.visible = true
      sound('drip', anim.paint)
    }
    const settle = Math.max(0, t - POUR_MS) / SETTLE_MS
    const wobble = anim.landed ? 1 + Math.sin(settle * Math.PI * 3) * 0.12 * (1 - Math.min(1, settle)) : 1
    cup.holder.scale.y = cup.holder.scale.x * (2 - wobble)
    render()
    if (t < POUR_MS + SETTLE_MS) requestAnimationFrame(pourFrame)
    else {
      anim = null
      draw()
    }
  }

  // --- The controls ---------------------------------------------------------------------------

  function dots(counts) {
    return counts.flatMap((n, i) => Array(n).fill(`<i style="background:${PAINTS[i].hex}"></i>`)).join('')
  }

  function readout(colour, counts) {
    const words = counts.map((n, i) => n && `${n} ${PAINTS[i].word}`).filter(Boolean).join(', ')
    return `<i class="cs-swatch" style="background:${colour.hex}"></i><span class="cs-words"><span class="cs-name"><b>${colour.base}</b>${colour.more ? `<small> ${colour.more}</small>` : ''}</span><span class="cs-dots" aria-hidden="true">${dots(counts)}</span><span class="cs-sr"> (${words})</span></span>`
  }

  function draw() {
    if (!studio.open) return
    if (!view) {
      view = createStudioView($('.studio-preview'))
      new ResizeObserver(() => { if (studio.open && !anim) render() }).observe($('.studio-preview'))
    }
    const result = mix()
    if (!anim) {
      drawScene(result.hex, result.drops)
      render()
    }

    dropButtons.forEach((button, i) => {
      button.querySelector('b').textContent = drops[i] || ''
      button.disabled = result.drops >= MAX_DROPS
    })
    $('#paint-undo').disabled = !history.length
    $('#paint-clear').disabled = !history.length
    if (result.drops) status.innerHTML = readout(result, drops)
    else status.innerHTML = '<i class="cs-swatch cs-empty"></i><span class="cs-words"><b>👆 Tap a paint pot!</b></span>'

    const comparison = $('#colour-comparison')
    comparison.replaceChildren()
    comparison.hidden = !saved
    if (saved) {
      const kept = document.createElement('span')
      kept.className = 'cs-kept'
      kept.innerHTML = `📌<i class="cs-swatch" style="background:${saved.hex}"></i><span class="cs-sr">Kept colour: ${saved.base}</span>`
      comparison.append(kept)
    }
    cells.forEach((cell, i) => { cell.style.background = picture[i] })
    $('#paint-assets-retry').hidden = !assetError
    studio.dialog.classList.toggle('cs-has-paint', result.drops > 0)
  }

  /** A child who stops touching gets a wiggle (and a reminder) on what to do next. */
  function nudgeLater() {
    clearTimeout(hintTimer)
    studio.dialog.classList.remove('cs-nudge-pots', 'cs-nudge-art')
    hintTimer = setTimeout(() => {
      if (!studio.open) return
      const empty = !mix().drops
      studio.dialog.classList.add(empty ? 'cs-nudge-pots' : 'cs-nudge-art')
      speak(empty ? 'Tap a paint pot!' : 'Touch a square to paint your picture!')
    }, HINT_MS)
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
    }
  }

  function button(label, parent, onClick) {
    const b = document.createElement('button')
    b.setAttribute('aria-label', label)
    b.onclick = () => {
      onClick()
      nudgeLater()
    }
    $(parent).append(b)
    return b
  }
  const dropButtons = PAINTS.map((paint, i) => {
    const b = button(`Add ${paint.word} drop`, '#paint-drops', () => {
      const before = mix()
      if (before.drops >= MAX_DROPS) return
      drops[i]++
      history.push(i)
      const result = mix()
      speak(result.say)
      if (view && studio.open) {
        // The cup shows the old colour until the new drop lands (a quick second tap restarts the pour).
        drawScene(before.hex, before.drops)
        const { x, z } = scene.bottles[i].holder.position
        const restart = !!anim
        anim = { paint: i, start: performance.now(), home: { x, z }, hex: result.hex, landed: false }
        if (!restart) requestAnimationFrame(pourFrame)
      }
      draw()
    })
    b.className = 'cs-pot'
    b.style.setProperty('--paint', paint.hex)
    b.innerHTML = '<span class="cs-drop" aria-hidden="true"></span><b></b>'
    return b
  })
  const cells = picture.map((_, i) => button(`Paint square ${i + 1}`, '.paint-grid', () => {
    const colour = mix()
    if (!colour.drops) {
      speak('Mix a colour first! Tap a paint pot.')
      studio.dialog.classList.remove('cs-nudge-pots')
      void studio.dialog.offsetWidth
      studio.dialog.classList.add('cs-nudge-pots')
      return
    }
    picture[i] = colour.hex
    sound('dab', i)
    cells[i].classList.remove('cs-pop')
    void cells[i].offsetWidth
    cells[i].classList.add('cs-pop')
    draw()
  }))

  $('#paint-undo').onclick = () => {
    if (history.length) drops[history.pop()]--
    anim = null
    sound('undo')
    draw()
    nudgeLater()
  }
  $('#paint-clear').onclick = () => {
    drops.fill(0)
    history.length = 0
    anim = null
    sound('empty')
    draw()
    nudgeLater()
  }
  $('#paint-compare').onclick = () => {
    const colour = mix()
    if (!colour.drops) {
      speak('Mix a colour first, then keep it.')
      return
    }
    saved = colour
    sound('keep')
    speak(`Kept ${colour.base.toLowerCase()}! Now mix another colour to compare.`)
    draw()
    nudgeLater()
  }
  $('#paint-picture-clear').onclick = () => {
    picture.fill(BLANK)
    sound('empty')
    draw()
    nudgeLater()
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
