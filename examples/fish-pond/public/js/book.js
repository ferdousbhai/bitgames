import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CREATURES } from './creatures.js'
import { PLACES } from './world.js'
import { fieldNote } from './field-guide.js'

/**
 * The collection book: one sticker per creature. Caught ones show in full
 * colour with how many you have; the rest are mystery silhouettes with the
 * toy-story places where they appear. Pictures are rendered once from the real models.
 */
export class Book {
  constructor({ el, audio, voice, creatures, getBook }) {
    this.el = el
    this.audio = audio
    this.voice = voice
    this.creatures = creatures
    this.getBook = getBook
    this.open = false
    this.pics = {}
    this.note = document.createElement('p')
    this.note.className = 'field-guide'
    this.note.setAttribute('role', 'status')
    this.grid = el.querySelector('.book-grid')
    // The note shares the header row on short screens, so the stickers all fit without scrolling
    el.querySelector('.book-close').before(this.note)
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
      const m = this.creatures.make(c.id, 1.05)
      const face = ['pufferfish', 'octopus', 'jellyfish', 'duck', 'chest', 'boot', 'crab'].includes(c.id) ? -1.0 : -0.4
      m.group.rotation.set(0.1, face, 0)
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
    const grid = this.el.querySelector('.book-grid')
    grid.textContent = ''
    let found = 0
    for (const c of CREATURES) {
      const n = Number(book[c.id]) || 0
      if (n) found++
      const tile = document.createElement('button')
      tile.className = `tile stars${c.stars}` + (n ? ' got' : ' missing')
      const img = document.createElement('img')
      img.alt = n ? c.name : '?'
      img.draggable = false
      const pic = this.pics[c.id]
      if (pic) img.src = n ? pic.color : pic.dark
      tile.appendChild(img)
      const stars = document.createElement('div')
      stars.className = 'tile-stars'
      stars.textContent = '⭐'.repeat(c.stars)
      tile.appendChild(stars)
      const label = document.createElement('div')
      label.className = 'tile-name'
      label.textContent = n ? c.name : Object.keys(c.places).map((p) => PLACES[p].emoji).join('')
      tile.appendChild(label)
      if (n) {
        const badge = document.createElement('div')
        badge.className = 'tile-count'
        badge.textContent = `×${n}`
        tile.appendChild(badge)
      } else {
        const q = document.createElement('div')
        q.className = 'tile-q'
        q.textContent = '?'
        tile.appendChild(q)
      }
      tile.addEventListener('click', (e) => {
        e.stopPropagation()
        tile.classList.remove('wiggle')
        void tile.offsetWidth
        tile.classList.add('wiggle')
        if (n) {
          const fact = fieldNote(c.id, c.name)
          this.note.textContent = `${c.name}: ${fact}`
          this.audio.newOne()
          this.voice.sayNow(`${c.name}! ${fact}`)
        } else {
          // A mystery stays a mystery: just where to look for it
          const where = Object.keys(c.places)
          this.note.textContent = `❓ Not found yet! Look here: ${where.map((p) => PLACES[p].emoji).join(' ')}`
          this.audio.bubbles()
          this.voice.sayNow(where.length === Object.keys(PLACES).length ? 'Not found yet! It could be in any place.' : `Not found yet! Try the ${where.map((p) => PLACES[p].name.toLowerCase()).join(' or the ')}.`)
        }
      })
      grid.appendChild(tile)
    }
    this.el.querySelector('.book-count').textContent = `${found} / ${CREATURES.length}`
    this.el.querySelector('.book-fill').style.width = `${(found / CREATURES.length) * 100}%`
  }

  show() {
    this.render()
    this.note.textContent = '👆 Tap a picture!'
    this.open = true
    this.el.classList.remove('hidden')
    this.fit()
  }

  /** Pick the column count that makes the biggest pictures with every sticker on screen. */
  fit() {
    if (!this.open) return
    const g = this.grid
    g.classList.remove('compact')
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
    // Names under the pictures when there is room; otherwise just the pictures (tapping says the name)
    let b = best(46)
    if (b.s < 60) {
      b = best(12)
      g.classList.add('compact')
    }
    g.style.gridTemplateColumns = `repeat(${b.c}, 1fr)`
    g.style.setProperty('--pic', `${Math.max(24, Math.floor(b.s))}px`)
  }

  hide() {
    this.open = false
    this.voice.hush()
    this.el.classList.add('hidden')
  }
}
