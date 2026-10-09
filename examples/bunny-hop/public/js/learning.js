import * as THREE from 'three'
import { BIOMES, OBSTACLE_NAMES } from './biomes.js'
import { copy } from './models.js'

/**
 * Learning inside the hop: counted carrot rows shown as a little tray of carrots, obstacle
 * rhythms shown as a row of pictures, and the "What comes next?" question. Everything is
 * pictured and spoken, so a child who cannot read yet can follow it.
 */

/**
 * Small pictures of each place's obstacles, rendered once from the real models (with that
 * place's colours), so the picture cue matches exactly what is on the path.
 * Returns { 'meadow:log': dataURL, … }; empty if a second WebGL context is not available.
 */
export function obstaclePictures(templates) {
  const size = 128
  const canvas = document.createElement('canvas')
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  } catch {
    return {}
  }
  renderer.setPixelRatio(1)
  renderer.setSize(size, size, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#7a9a6a', 2.4))
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4)
  sun.position.set(3, 6, 5)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50)
  const view = new THREE.Vector3(0.3, 0.35, 1).normalize()
  const box = new THREE.Box3()
  const centre = new THREE.Vector3()
  const extent = new THREE.Vector3()
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const pictures = {}
  for (const biome of BIOMES) {
    for (const name of new Set(biome.rhythms.flat())) {
      const obj = copy(templates[name], { recolor: biome.recolor })
      obj.position.set(0, 0, 0)
      obj.rotation.set(0, name === 'log' ? 0.7 : -0.3, 0)
      scene.add(obj)
      box.setFromObject(obj).getCenter(centre)
      box.getSize(extent)
      // fill the picture: frame the front face, then step back past the model's depth
      const dist = ((Math.max(extent.x, extent.y) / 2) * 1.12) / tan + extent.z / 2
      camera.position.copy(centre).addScaledVector(view, dist)
      camera.lookAt(centre)
      renderer.render(scene, camera)
      pictures[`${biome.id}:${name}`] = canvas.toDataURL()
      scene.remove(obj)
    }
  }
  renderer.dispose()
  return pictures
}

/**
 * Spoken words that respect the game's mute. `queue` lets counting follow on without cutting words off.
 * The learning missions (shared adventure.js) speak too and always cancel what is playing, so:
 * - while a mission's words are playing, the game's words wait their turn instead of cutting them off;
 * - `interject(fn)` wraps anything that lets a mission speak: game words it cuts off are said again after it.
 */
export function createVoice(isMuted) {
  const canSpeak = 'speechSynthesis' in window
  const mine = new Set() // the game's own utterances not yet finished
  function speak(text) {
    const words = new SpeechSynthesisUtterance(text)
    words.lang = 'en-US'
    words.rate = 0.82
    words.text0 = text
    const done = () => mine.delete(words)
    words.onend = done
    words.onerror = done
    mine.add(words)
    speechSynthesis.speak(words)
  }
  return {
    say(text, queue = false) {
      if (!canSpeak || isMuted()) return
      const missionTalking = speechSynthesis.speaking && mine.size === 0
      if (!queue && !missionTalking) {
        mine.clear()
        speechSynthesis.cancel()
      }
      speak(text)
    },
    interject(fn) {
      if (!canSpeak || mine.size === 0) return fn()
      // notice whether fn really cancelled the game's words (a mission only speaks on some events)
      const before = [...mine]
      let cancelled = false
      const cancel = speechSynthesis.cancel
      speechSynthesis.cancel = function () {
        cancelled = true
        return cancel.call(this)
      }
      try {
        fn()
      } finally {
        delete speechSynthesis.cancel
        if (speechSynthesis.cancel !== cancel) speechSynthesis.cancel = cancel
      }
      if (!cancelled) return
      for (const w of before) mine.delete(w)
      if (!isMuted()) before.forEach((w) => speak(w.text0))
    },
    hush() {
      mine.clear()
      if (canSpeak) speechSynthesis.cancel()
    },
  }
}

export const carrotWords = (n) => `${n} carrot${n === 1 ? '' : 's'}`

/** Names a pattern unit aloud: "log, log, rock". */
export const patternWords = (unit) => unit.map((name) => OBSTACLE_NAMES[name]).join(', ')

/** The cue at the bottom of the screen: a carrot tray during a row, a picture strip during a rhythm. */
export class Cue {
  constructor(el, askEl, pictures) {
    this.el = el
    this.askEl = askEl
    this.pictures = pictures
    this.slots = []
  }

  picture(biome, name) {
    const src = this.pictures[`${BIOMES[biome].id}:${name}`]
    if (src) {
      const img = document.createElement('img')
      img.src = src
      img.alt = ''
      img.draggable = false
      return img
    }
    // no picture (no WebGL for the thumbnails): fall back to a near-enough emoji
    const span = document.createElement('span')
    span.textContent = { log: '🪵', rock: '🪨', stump: '🪵', toadstool: '🍄', pumpkin: '🎃', snowman: '⛄' }[name] ?? '•'
    return span
  }

  /** A row of n carrots: the number, then n empty places in rows of five (like a ten-frame). */
  row(n) {
    this.el.className = 'cue row'
    const count = document.createElement('b')
    count.className = 'cue-count'
    count.textContent = String(n)
    const tray = document.createElement('div')
    tray.className = 'cue-tray'
    tray.style.setProperty('--cols', String(Math.min(n, 5)))
    this.slots = Array.from({ length: n }, () => {
      const slot = document.createElement('span')
      slot.className = 'cue-carrot'
      slot.textContent = '🥕'
      tray.append(slot)
      return slot
    })
    this.el.replaceChildren(count, tray)
    this.el.setAttribute('aria-label', `${carrotWords(n)} coming`)
    this.el.hidden = false
  }

  /** One more carrot in the tray. */
  fill(got) {
    this.slots[got - 1]?.classList.add('got')
    this.el.setAttribute('aria-label', `${got} of ${this.slots.length} carrots`)
  }

  /** A rhythm: one picture per obstacle, the hidden one as "?". */
  rhythm(seg) {
    this.el.className = 'cue rhythm'
    const note = document.createElement('b')
    note.className = 'cue-count'
    note.textContent = '🎵'
    const strip = document.createElement('div')
    strip.className = 'cue-strip'
    this.slots = seg.items.map((name, i) => {
      const slot = document.createElement('span')
      slot.className = `cue-step${i % seg.unit.length === 0 && i ? ' unit' : ''}${i === 0 ? ' next' : ''}`
      if (i === seg.ask) slot.append(this.question())
      else slot.append(this.picture(seg.biome, name))
      strip.append(slot)
      return slot
    })
    this.el.replaceChildren(note, strip)
    this.el.setAttribute('aria-label', `Pattern: ${patternWords(seg.unit)}`)
    this.el.hidden = false
  }

  question() {
    const q = document.createElement('span')
    q.className = 'cue-question'
    q.textContent = '?'
    return q
  }

  /** Pip has passed obstacle i of the rhythm. */
  passed(i) {
    this.slots[i]?.classList.remove('next')
    this.slots[i]?.classList.add('done')
    this.slots[i + 1]?.classList.add('next')
  }

  /** The hidden obstacle is shown in the strip too. */
  revealStep(seg) {
    this.slots[seg.ask]?.replaceChildren(this.picture(seg.biome, seg.items[seg.ask]))
  }

  hide() {
    this.el.hidden = true
    this.closeAsk()
  }

  /** "What comes next?": a big picture button for each kind of obstacle in the pattern. */
  ask(seg, onPick) {
    const title = document.createElement('p')
    title.className = 'ask-title'
    title.textContent = 'What comes next?'
    const choices = document.createElement('div')
    choices.className = 'ask-choices'
    for (const name of new Set(seg.unit)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ask-choice'
      button.setAttribute('aria-label', OBSTACLE_NAMES[name])
      button.append(this.picture(seg.biome, name))
      button.onclick = () => onPick(name)
      choices.append(button)
    }
    this.askEl.replaceChildren(title, choices)
    this.askEl.hidden = false
    choices.firstChild?.focus({ preventScroll: true })
  }

  closeAsk() {
    this.askEl.hidden = true
    this.askEl.replaceChildren()
  }

  /** The ask buttons, for keyboard play. */
  get choices() {
    return this.askEl.hidden ? [] : [...this.askEl.querySelectorAll('button')]
  }
}

/** The burrow pantry: each row Pip brought home as its own little crate, added up. */
export function renderPantry(el, rows, total) {
  el.replaceChildren()
  el.hidden = rows.length === 0
  const shelf = document.createElement('div')
  shelf.className = 'pantry-shelf'
  rows.forEach((n, i) => {
    if (i) {
      const plus = document.createElement('span')
      plus.className = 'pantry-plus'
      plus.textContent = '+'
      shelf.append(plus)
    }
    const crate = document.createElement('span')
    crate.className = 'pantry-crate'
    crate.style.setProperty('--cols', String(Math.min(n, 5)))
    crate.setAttribute('aria-label', carrotWords(n))
    for (let k = 0; k < n; k++) {
      const c = document.createElement('span')
      c.textContent = '🥕'
      c.setAttribute('aria-hidden', 'true')
      crate.append(c)
    }
    const label = document.createElement('b')
    label.textContent = String(n)
    const wrap = document.createElement('span')
    wrap.className = 'pantry-row'
    wrap.append(crate, label)
    shelf.append(wrap)
  })
  const sum = document.createElement('div')
  sum.className = 'pantry-total'
  sum.innerHTML = `<span>=</span><b id="final">${total}</b><span aria-hidden="true">🥕</span>`
  el.append(shelf, sum)
}

/** What Pip says at home: the rows added up (each named when there are only a few). */
export function pantryWords(rows, total) {
  if (!rows.length) return ''
  if (rows.length === 1) return `${carrotWords(total)} in the pantry!`
  return `${rows.slice(0, -1).join(', ')} and ${rows.at(-1)} make ${carrotWords(total)} in the pantry!`
}
