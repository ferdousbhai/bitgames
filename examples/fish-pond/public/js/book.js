import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CREATURES } from './creatures.js'
import { PLACES } from './world.js'

/**
 * Book pictures are framed by each model's longest side, so the crayfish (long feelers and claws reaching
 * forward) came out a smudge next to the others: it is seen from above and drawn bigger, to read at the
 * same size. The seal is long and slim, so it is a little bigger too.
 */
const THUMB = { crayfish: 1.25, seal: 1.12 }

/**
 * The picture book: one sticker per creature, no words. Caught ones show in full colour and wiggle
 * when tapped; the rest are dark mystery shapes with the pictures of the places where they can be found.
 * Pictures are rendered once from the real models.
 */
export class Book {
  constructor({ el, audio, creatures, getBook, getExtra = () => ({}) }) {
    this.el = el
    this.audio = audio
    this.creatures = creatures
    this.getBook = getBook
    this.getExtra = getExtra
    this.open = false
    this.pics = {}
    this.grid = el.querySelector('.book-grid')
    addEventListener('resize', () => this.fit())
    el.querySelector('.book-close').addEventListener('click', (e) => {
      e.stopPropagation()
      this.audio.click()
      this.hide()
    })
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) this.hide()
    })
  }

  /** Render a picture and a silhouette of every creature. */
  build() {
    let r
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch {
      return
    }
    const S = 192
    r.setPixelRatio(1)
    r.setSize(S, S)
    r.toneMapping = THREE.NeutralToneMapping
    r.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.7
    scene.add(new THREE.HemisphereLight('#ffffff', '#b8c8ff', 2.2))
    const key = new THREE.DirectionalLight('#fff4e0', 2.6)
    key.position.set(2, 3, 4)
    scene.add(key)
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    cam.position.set(0, 0.45, 2.7)
    cam.lookAt(0, 0, 0)
    const shadow = new THREE.MeshBasicMaterial({ color: '#46507e' })
    for (const c of CREATURES) {
      const m = this.creatures.make(c.id, 1.05 * (THUMB[c.id] ?? 1))
      const face = ['pufferfish', 'octopus', 'jellyfish', 'duck', 'chest', 'boot', 'crab', 'crayfish'].includes(c.id) ? -1.0 : -0.4
      m.group.rotation.set(0.1, face, 0)
      // The crayfish is long and flat, with feelers reaching far forward: side-on it was a thin smudge, so its
      // picture looks down on its back, nose up, claws spread (the way you see one in a stream)
      if (c.id === 'crayfish') m.group.rotation.set(1.15, Math.PI / 2, 0)
      scene.add(m.group)
      r.render(scene, cam)
      const color = r.domElement.toDataURL('image/png')
      scene.overrideMaterial = shadow
      r.render(scene, cam)
      const dark = r.domElement.toDataURL('image/png')
      scene.overrideMaterial = null
      scene.remove(m.group)
      this.pics[c.id] = { color, dark }
    }
    r.dispose()
    r.forceContextLoss?.()
    this.render()
  }

  render() {
    const book = this.getBook()
    const extra = this.getExtra()
    this.grid.textContent = ''
    let found = 0
    for (const [i, c] of CREATURES.entries()) {
      const n = Number(book[c.id]) || 0
      if (n) found++
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.className = 'tile' + (n ? ' got' : ' missing')
      tile.setAttribute('aria-label', n ? c.name : 'Not found yet')
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      const pic = this.pics[c.id]
      if (pic) img.src = n ? pic.color : pic.dark
      tile.appendChild(img)
      // Badges for the big one 🏅 and the shiny one ✨ of a creature, once found
      const got = extra[c.id] ?? {}
      if (n && (got.big || got.shiny)) {
        const badges = document.createElement('div')
        badges.className = 'tile-badges'
        badges.setAttribute('aria-hidden', 'true')
        badges.textContent = `${got.big ? '🏅' : ''}${got.shiny ? '✨' : ''}`
        tile.appendChild(badges)
      }
      if (!n) {
        // Where to look for it, in place pictures
        const where = document.createElement('div')
        where.className = 'tile-where'
        where.setAttribute('aria-hidden', 'true')
        where.textContent = Object.keys(c.places).map((p) => PLACES[p].emoji).join('')
        const q = document.createElement('div')
        q.className = 'tile-q'
        q.textContent = '?'
        tile.append(where, q)
      }
      tile.addEventListener('click', (e) => {
        e.stopPropagation()
        tile.classList.remove('wiggle', 'hop')
        void tile.offsetWidth
        tile.classList.add(n ? 'hop' : 'wiggle')
        // Each caught creature has its own note on a happy little scale
        if (n) this.audio.chime(i)
        else this.audio.bubbles()
      })
      this.grid.appendChild(tile)
    }
    this.el.querySelector('.book-count').textContent = `${found} / ${CREATURES.length}`
  }

  show() {
    this.open = true
    this.render()
    this.el.classList.remove('hidden')
    this.fit()
  }

  /** Pick the column count that makes the biggest pictures with every sticker on screen. */
  fit() {
    if (!this.open) return
    const g = this.grid
    const W = g.clientWidth - 8
    const H = g.clientHeight - 8
    const gap = 8
    const n = CREATURES.length
    const best = (chrome) => {
      let b = { c: 5, s: 0 }
      for (let c = 3; c <= n; c++) {
        const rows = Math.ceil(n / c)
        const s = Math.min((W - gap * (c - 1)) / c - 8, (H - gap * (rows - 1)) / rows - chrome, 128)
        if (s > b.s + 1) b = { c, s }
      }
      return b
    }
    const b = best(12)
    g.style.gridTemplateColumns = `repeat(${b.c}, 1fr)`
    g.style.setProperty('--pic', `${Math.max(24, Math.floor(b.s))}px`)
  }

  hide() {
    this.open = false
    this.el.classList.add('hidden')
  }
}
