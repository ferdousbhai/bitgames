import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CREATURES } from './creatures.js'
import { PLACES } from './world.js'
import { fieldNote } from './field-guide.js'
import { listWords } from './speech.js'
import { lower } from './riddles.js'

/** Animals that keep to one spot: the book's hint for them says where in the water to look. */
const HIDES = { snail: 'Pond snails hide under lily pads.' }

/**
 * Book pictures are framed by each model's longest side, so the crayfish (long feelers and claws reaching
 * forward) came out a smudge next to the others: it is seen from above and drawn bigger, to read at the
 * same size. The seal is long and slim, so it is a little bigger too.
 */
const THUMB = { crayfish: 1.25, seal: 1.12 }

/**
 * The sorting page (2026-10-11): every catch in the book goes where it really lives. Each basket names
 * the places that belong to it, so where you fished is the bridge to fresh water or sea.
 */
const BASKETS = [
  { id: 'fresh', icon: '🏞️', places: ['lake', 'river', 'night'], word: 'Fresh water', say: 'Fresh water: ponds, lakes and rivers.' },
  { id: 'sea', icon: '🌊', places: ['ice', 'reef'], word: 'Sea', say: 'The sea: big and salty.' },
  { id: 'pretend', icon: '🧸', places: [], word: 'Not real', say: 'Not a real animal: toys, rubbish and pretend friends.' },
]
const orWords = new Intl.ListFormat('en', { type: 'disjunction' })
/** A place inside a sentence, by the name on its button, so every screen calls it the same ("the starry night"). */
const placeWord = (p) => `the ${PLACES[p].name.toLowerCase()}`
/** Toys, rubbish, treasure and the made-up fish: why each is "not real" (field-guide.js says the same). */
const PRETEND = {
  bluefish: 'Blue Fish is a pretend friend.',
  goldenfish: 'Golden Fish is pretend magic.',
  duck: 'A rubber duck is a toy.',
  boot: 'A boot is rubbish.',
  chest: 'A treasure chest is not alive.',
}
const REAL_Q = {
  bluefish: 'Is Blue Fish a real animal?',
  goldenfish: 'Is Golden Fish a real animal?',
  duck: 'Is a rubber duck a real animal?',
  boot: 'Is a boot an animal?',
  chest: 'Is a treasure chest an animal?',
}
/** Real animals, said as a group ("You catch crabs at…"). */
const MANY = {
  goldfish: 'goldfish', trout: 'rainbow trout', turtle: 'turtles', frog: 'frogs', crayfish: 'crayfish', snail: 'pond snails',
  clownfish: 'clownfish', pufferfish: 'pufferfish', crab: 'crabs', octopus: 'octopuses', jellyfish: 'jellyfish', narwhal: 'narwhals', whale: 'whales',
  cod: 'Arctic cod',
  seal: 'ringed seals',
}
const FRESH = new Set(BASKETS[0].places)
/** Where a catch belongs: pretend things by name, real animals by the waters they are caught in. */
export function homeOf(c) {
  if (PRETEND[c.id]) return 'pretend'
  return Object.keys(c.places).every((p) => FRESH.has(p)) ? 'fresh' : 'sea'
}
// Sorting is for this trip only (it used to be saved for good, so the page could be done just once)
try {
  localStorage.removeItem('fish-pond-sorted')
} catch {}

/**
 * The collection book: one sticker per creature. Caught ones show in full
 * colour with their name; the rest are mystery silhouettes with the
 * toy-story places where they appear. Pictures are rendered once from the real models.
 */
export class Book {
  constructor({ el, audio, voice, creatures, getBook, getTier = () => 1 }) {
    this.el = el
    this.audio = audio
    this.voice = voice
    this.creatures = creatures
    this.getBook = getBook
    this.getTier = getTier
    this.open = false
    this.pics = {}
    this.page = 'book'
    this.sorted = new Set() // catches put in their basket this trip (newTrip empties the baskets)
    this.tries = new Map() // wrong baskets per catch this visit: the second hint is plainer
    this.aside = [] // older players: a catch put in the wrong basket twice waits at the end of the tray
    this.told = new Set() // catches whose home has been said (their basket is ringed)
    this.picked = null
    this.sortIntro = false
    this.sortPage = el.querySelector('.sort-page')
    this.tray = el.querySelector('.sort-tray')
    for (const tab of el.querySelectorAll('.book-tab')) {
      tab.addEventListener('click', (e) => {
        e.stopPropagation()
        this.audio.click()
        this.setPage(tab.dataset.page)
      })
    }
    this.buildBaskets()
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
    const grid = this.el.querySelector('.book-grid')
    grid.textContent = ''
    const recall = this.getTier() >= 3
    let found = 0
    for (const c of CREATURES) {
      const n = Number(book[c.id]) || 0
      if (n) found++
      const tile = document.createElement('button')
      tile.className = 'tile' + (n ? ' got' : ' missing')
      const img = document.createElement('img')
      img.alt = n ? c.name : '?'
      img.draggable = false
      const pic = this.pics[c.id]
      if (pic) img.src = n ? pic.color : pic.dark
      tile.appendChild(img)
      const label = document.createElement('div')
      label.className = 'tile-name'
      // (once two-clue riddles come, a mystery tile shows no places: where it lives is remembered, or asked)
      label.textContent = n ? c.name : recall ? '' : Object.keys(c.places).map((p) => PLACES[p].emoji).join('')
      tile.appendChild(label)
      // A caught tile shows just its picture and name: no "×3" tally to chase
      if (!n) {
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
          // Where in the water, for an animal that hides (knowing where it lives tells you where to cast)
          if (HIDES[c.id]) {
            this.note.textContent += ` ${HIDES[c.id]}`
            return this.voice.sayNow(`Not found yet! ${HIDES[c.id]}`)
          }
          this.voice.sayNow(where.length === Object.keys(PLACES).length ? 'Not found yet! It could be in any place.' : `Not found yet! Try ${orWords.format(where.map(placeWord))}.`)
        }
      })
      grid.appendChild(tile)
    }
    this.el.querySelector('.book-count').textContent = `${found} / ${CREATURES.length}`
    // Sorting needs something to sort
    this.el.querySelector('.book-tab[data-page="sort"]').hidden = found < 1
    if (this.page === 'sort') this.renderSort()
  }

  /** A new trip: the baskets are emptied, so every catch can be sorted again (and the question asked again). */
  newTrip() {
    this.sorted.clear()
    this.sortIntro = false
  }

  show() {
    this.page = 'book'
    this.picked = null
    this.tries.clear()
    this.aside = []
    this.told.clear()
    this.render()
    this.setPage('book', true)
    this.open = true
    this.el.classList.remove('hidden')
    this.fit()
  }

  /** The book has two pages: the pictures, and the sorting page where each catch goes home. */
  setPage(page, quiet = false) {
    this.page = page
    for (const tab of this.el.querySelectorAll('.book-tab')) tab.setAttribute('aria-pressed', String(tab.dataset.page === page))
    this.grid.hidden = page !== 'book'
    this.sortPage.hidden = page !== 'sort'
    this.picked = null
    if (page === 'book') {
      this.note.textContent = '👆 Tap a picture!'
      this.fit()
      if (!quiet) this.voice.hush()
      return
    }
    this.renderSort()
    const left = this.unsorted().length
    this.note.textContent = left ? '👆 Tap one, then tap where it lives.' : '🏞️ 🌊 🧸 Everyone is home!'
    if (!left) return this.sortIntro ? this.voice.hush() : ((this.sortIntro = true), this.voice.sayNow('Everyone is in the right place.'))
    // The question once a visit; after that the words on the page are enough
    if (!this.sortIntro) this.voice.sayNow('Where does each one live? Fresh water, the sea, or not a real animal?')
    else this.voice.hush()
    this.sortIntro = true
  }

  /** Catches in the book that have not been put in a basket yet. */
  unsorted() {
    const book = this.getBook()
    return CREATURES.filter((c) => Number(book[c.id]) > 0 && !this.sorted.has(c.id))
  }

  buildBaskets() {
    this.baskets = {}
    const row = this.el.querySelector('.sort-baskets')
    for (const b of BASKETS) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `basket ${b.id}`
      el.dataset.basket = b.id
      el.setAttribute('aria-label', b.word)
      const head = document.createElement('div')
      head.className = 'basket-head'
      head.innerHTML = `<span class="basket-icon" aria-hidden="true">${b.icon}</span><span class="basket-word">${b.word}</span><span class="basket-places" aria-hidden="true">${b.places.map((p) => PLACES[p].emoji).join('') || '🥾🦆'}</span>`
      const inside = document.createElement('div')
      inside.className = 'basket-in'
      el.append(head, inside)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.picked) return this.drop(b.id)
        // With nothing picked, a basket says what belongs in it
        this.audio.click()
        this.note.textContent = `${b.icon} ${b.say}`
        this.voice.sayNow(b.say)
      })
      row.appendChild(el)
      this.baskets[b.id] = { el, inside }
    }
  }

  renderSort() {
    this.tray.textContent = ''
    // From tier 2 the baskets show no place pictures, so sorting is remembering "fresh water or sea", not
    // matching the ❄️ of the place clue to the ❄️ under a basket (tapping a basket still says what goes in it)
    this.el.querySelector('.sort-baskets').classList.toggle('recall', this.getTier() >= 2)
    for (const { inside, el } of Object.values(this.baskets)) {
      inside.textContent = ''
      el.classList.remove('hint')
    }
    const book = this.getBook()
    // Catches set aside after two wrong tries wait at the end of the tray, for a fresh look later
    const order = [...CREATURES].sort((a, b) => this.aside.indexOf(a.id) - this.aside.indexOf(b.id))
    for (const c of order) {
      if (!(Number(book[c.id]) > 0)) continue
      const pic = this.pics[c.id]
      if (this.sorted.has(c.id)) {
        const img = document.createElement('img')
        img.alt = c.name
        img.draggable = false
        if (pic) img.src = pic.color
        this.baskets[homeOf(c)].inside.appendChild(img)
        continue
      }
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.className = 'sort-tile'
      tile.dataset.id = c.id
      tile.setAttribute('aria-label', c.name)
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      if (pic) img.src = pic.color
      const name = document.createElement('div')
      name.className = 'tile-name'
      name.textContent = c.name
      tile.append(img, name)
      this.dragOn(tile, c)
      this.tray.appendChild(tile)
    }
    this.marks()
  }

  /** The picked catch is raised. Once its home has been said (clue), its basket is ringed. */
  marks() {
    for (const t of this.tray.children) t.classList.toggle('picked', t.dataset.id === this.picked)
    const p = this.told.has(this.picked) && CREATURES.find((c) => c.id === this.picked)
    for (const [id, { el }] of Object.entries(this.baskets)) el.classList.toggle('hint', !!p && homeOf(p) === id)
  }

  pick(c) {
    if (this.sorted.has(c.id) || this.picked === c.id) return
    this.picked = c.id
    this.audio.click()
    this.note.textContent = `${c.name}: where does it live?`
    this.voice.sayNow(c.name)
    // Only the marks change: the tile under the finger must stay the same element for a drag
    this.marks()
  }

  /** Tap a catch to pick it up, then tap a basket; or drag it straight into one. */
  dragOn(tile, c) {
    tile.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      this.pick(c)
      const x0 = e.clientX
      const y0 = e.clientY
      let ghost = null
      try {
        tile.setPointerCapture(e.pointerId)
      } catch {}
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 12) return
        if (!ghost) {
          ghost = tile.querySelector('img').cloneNode()
          ghost.className = 'sort-ghost'
          document.body.appendChild(ghost)
          tile.classList.add('lifted')
        }
        ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -50%)`
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.basket')
        for (const { el } of Object.values(this.baskets)) el.classList.toggle('over', el === over)
      }
      const up = (ev) => {
        tile.removeEventListener('pointermove', move)
        tile.removeEventListener('pointerup', up)
        tile.removeEventListener('pointercancel', up)
        if (!ghost) return
        ghost.remove()
        tile.classList.remove('lifted')
        for (const { el } of Object.values(this.baskets)) el.classList.remove('over')
        const over = ev.type === 'pointerup' && document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.basket')
        if (over) this.drop(over.dataset.basket)
      }
      tile.addEventListener('pointermove', move)
      tile.addEventListener('pointerup', up)
      tile.addEventListener('pointercancel', up)
    })
    // Keyboard: Tab to a catch and press it (pointer taps are already handled above)
    tile.addEventListener('click', (e) => {
      e.stopPropagation()
      if (e.detail === 0) this.pick(c)
    })
  }

  /** The picked catch goes into a basket: home if it belongs, back to the tray with a reason if not. */
  drop(basket) {
    const c = CREATURES.find((x) => x.id === this.picked)
    if (!c) return
    const home = homeOf(c)
    if (basket === home) {
      this.sorted.add(c.id)
      this.picked = null
      this.audio.plop()
      const line = `Yes! ${this.why(c)}`
      this.renderSort()
      if (!this.unsorted().length) {
        this.audio.chord()
        this.note.textContent = `${line} 🏞️ 🌊 🧸 Everyone is home!`
        return this.voice.sayNow(`${line} Everyone is in the right place.`)
      }
      this.note.textContent = line
      return this.voice.sayNow(line)
    }
    // Not there: gently back to the tray, still picked, with a clue to think with
    const tries = (this.tries.get(c.id) ?? 0) + 1
    this.tries.set(c.id, tries)
    this.audio.bubbles()
    // Older players, a second wrong try: no answer yet. The catch waits at the end of the tray and the
    // child sorts the others first, so trying every basket in turn doesn't finish the page.
    if (this.getTier() >= 2 && tries === 2 && !this.aside.includes(c.id) && this.unsorted().length > 1) {
      this.aside.push(c.id)
      this.picked = null
      this.renderSort()
      const line = `Not there. We'll come back to the ${lower(c.name)}.`
      this.note.textContent = line
      return this.voice.sayNow(line)
    }
    const line = `Not there. ${this.clue(c, tries)}`
    // The same words again stay on the page only: the ringed basket is enough
    if (this.note.textContent !== line) this.voice.sayNow(line)
    this.note.textContent = line
    this.marks()
  }

  /** The plain reason it belongs where it does. */
  why(c) {
    const home = homeOf(c)
    if (home === 'pretend') return PRETEND[c.id]
    const who = MANY[c.id] ?? lower(c.name)
    return `${who[0].toUpperCase()}${who.slice(1)} live in ${home === 'fresh' ? 'fresh water' : 'the sea'}.`
  }

  /**
   * After a wrong basket, everyone first gets something to think with: where they caught it, or "is it
   * real?" (so tapping baskets in turn is not quicker than thinking). Tier 1 hears the answer on the second
   * miss (and the basket is ringed); older players have it set aside then (drop), and only a miss after
   * coming back to it gives the answer.
   */
  clue(c, tries) {
    if (tries >= 2) {
      this.told.add(c.id)
      return this.why(c)
    }
    if (homeOf(c) === 'pretend') return REAL_Q[c.id]
    const who = MANY[c.id] ?? lower(c.name)
    return `You catch ${who} at ${listWords.format(Object.keys(c.places).map(placeWord))}.`
  }

  /** Pick the column count that makes the biggest pictures with every sticker on screen. */
  fit() {
    if (!this.open || this.page !== 'book') return
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
    this.picked = null
    this.voice.hush()
    this.el.classList.add('hidden')
  }
}
