import * as THREE from 'three'
import { BIOMES, FLOWERS, OBSTACLE_NAMES } from './biomes.js'
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
 * Call it off the startup path: it borrows a second WebGL context, released as soon as it is done.
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
    // the place's obstacles, and the carrot that grows in the grass between them
    for (const name of [...biome.kinds, 'carrot']) {
      const obj = copy(templates[name], { recolor: biome.recolor })
      obj.position.set(0, 0, 0)
      obj.rotation.set(0, name === 'log' ? 0.7 : -0.3, name === 'carrot' ? -0.35 : 0)
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
  // the wild flowers Pip picks, one picture per colour, for planting at home
  for (const [color, { hex }] of Object.entries(FLOWERS)) {
    const obj = copy(templates.flower, { recolor: { petal: [hex] } })
    obj.position.set(0, 0, 0)
    obj.rotation.set(0, -0.3, 0)
    scene.add(obj)
    box.setFromObject(obj).getCenter(centre)
    box.getSize(extent)
    const dist = ((Math.max(extent.x, extent.y) / 2) * 1.12) / tan + extent.z / 2
    camera.position.copy(centre).addScaledVector(view, dist)
    camera.lookAt(centre)
    renderer.render(scene, camera)
    pictures[`flower:${color}`] = canvas.toDataURL()
    scene.remove(obj)
  }
  renderer.dispose()
  renderer.forceContextLoss()
  return pictures
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
    span.textContent = { log: '🪵', rock: '🪨', stump: '🪵', toadstool: '🍄', pumpkin: '🎃', snowman: '⛄', carrot: '🥕' }[name] ?? '•'
    return span
  }

  /** A wild flower's picture (or a coloured ✿ when there are no pictures). */
  flower(color) {
    const src = this.pictures[`flower:${color}`]
    if (src) {
      const img = document.createElement('img')
      img.src = src
      img.alt = ''
      img.draggable = false
      return img
    }
    const span = document.createElement('span')
    span.textContent = '✿'
    span.style.color = FLOWERS[color].glyph
    return span
  }

  /**
   * A row: the number Pip needs, then that many empty places in rows of five (like a ten-frame).
   * On the basket tier a 🧺 shows the places are a basket to fill, not every carrot in the row. On the
   * counting tier the basket has no empty places: carrots land in it, and the child keeps the count.
   */
  row(seg) {
    const n = seg.n
    this.el.className = `cue row${seg.basket ? ' basket' : ''}${seg.counting ? ' counting' : ''}`
    const count = document.createElement('b')
    count.className = 'cue-count'
    count.textContent = seg.basket ? `🧺${n}` : String(n)
    const tray = document.createElement('div')
    tray.className = 'cue-tray'
    tray.style.setProperty('--cols', String(Math.min(n, 5)))
    this.counting = !!seg.counting
    this.need = n
    this.slots = this.counting ? [] : Array.from({ length: n }, () => {
      const slot = document.createElement('span')
      slot.className = 'cue-carrot'
      slot.textContent = '🥕'
      tray.append(slot)
      return slot
    })
    this.tray = tray
    this.away = 0
    this.el.replaceChildren(count, tray)
    this.el.setAttribute('aria-label', seg.basket ? `Pip needs ${carrotWords(n)}` : `${carrotWords(n)} coming`)
    this.el.hidden = false
  }

  /** One more carrot in the tray; past a full basket it sits outside, to go back to the field. */
  fill(got) {
    if (got > this.need) {
      const extra = document.createElement('span')
      extra.className = 'cue-carrot over'
      extra.textContent = '🥕'
      this.tray.after(extra)
    } else if (this.counting) {
      const slot = document.createElement('span')
      slot.className = 'cue-carrot got'
      slot.textContent = '🥕'
      this.tray.append(slot)
    } else this.slots[got - 1]?.classList.add('got')
    this.el.setAttribute('aria-label', this.counting ? carrotWords(Math.min(got, this.need)) : `${got} of ${this.need} carrots`)
  }

  /** A carrot got away: its place, counted from the right, stays empty and is marked. */
  miss() {
    this.away++
    this.slots[this.slots.length - this.away]?.classList.add('away')
  }

  /** Too many in the basket: it was too heavy, and one carrot that was in it rolled back out. */
  spill() {
    const kept = this.counting ? [...this.tray.querySelectorAll('.got')] : this.slots
    const slot = kept[Math.min(this.need, kept.length) - 1]
    slot?.classList.remove('got')
    slot?.classList.add('away')
  }

  /** A rhythm: one picture per step, the hidden one as "?" and the ones after it blank. */
  rhythm(seg) {
    this.el.className = 'cue rhythm'
    const note = document.createElement('b')
    note.className = 'cue-count'
    note.textContent = '🎵'
    const strip = document.createElement('div')
    strip.className = 'cue-strip'
    this.slots = seg.items.map((name, i) => {
      const slot = document.createElement('span')
      slot.className = `cue-step${i && seg.starts.includes(i) ? ' unit' : ''}${i === 0 ? ' next' : ''}`
      // the steps after the "?" stay blank until the answer, so the strip can't give it away
      if (i === seg.ask) slot.append(this.question())
      else if (i > seg.ask) slot.classList.add('later')
      else slot.append(this.picture(seg.biome, name))
      strip.append(slot)
      return slot
    })
    this.el.replaceChildren(note, strip)
    this.el.setAttribute('aria-label', `Pattern: ${patternWords(seg.items.slice(0, seg.ask))}, and then?`)
    this.el.hidden = false
  }

  question() {
    const q = document.createElement('span')
    q.className = 'cue-question'
    q.textContent = '?'
    return q
  }

  /** Pip has passed step i of the rhythm (`away`: a carrot of the pattern that Pip hopped over). */
  passed(i, away = false) {
    this.slots[i]?.classList.remove('next')
    this.slots[i]?.classList.add(away ? 'away' : 'done')
    this.slots[i + 1]?.classList.add('next')
  }

  /** A step that was under mist shows in the strip as Pip reaches it. */
  unveil(seg, i) {
    const slot = this.slots[i]
    if (!slot?.classList.contains('later')) return
    slot.classList.remove('later')
    slot.replaceChildren(this.picture(seg.biome, seg.items[i]))
  }

  /** Listen again: each step from `from` to just before the "?" lights up in turn, with `onStep(i, delay)` for its note. */
  replay(from, to, onStep, gap = 0.5) {
    for (let i = from; i < to; i++) {
      const slot = this.slots[i]
      const at = (i - from) * gap
      onStep(i, at)
      setTimeout(() => slot?.classList.add('sing'), at * 1000)
      setTimeout(() => slot?.classList.remove('sing'), (at + gap) * 1000)
    }
  }

  /** The hidden step is shown in the strip too (the ones after it stay blank, under the mist). */
  revealStep(seg) {
    this.slots[seg.ask]?.replaceChildren(this.picture(seg.biome, seg.items[seg.ask]))
  }

  hide() {
    this.el.hidden = true
    this.closeAsk()
  }

  /** "What comes next?": a big picture button for each choice (the pattern's kinds, or all three of the place's). */
  ask(seg, onPick) {
    const title = document.createElement('p')
    title.className = 'ask-title'
    title.textContent = 'What comes next?'
    const choices = document.createElement('div')
    choices.className = 'ask-choices'
    this.onPick = onPick
    this.askSeg = seg
    this.choiceRow = choices
    for (const name of seg.choices) this.addChoice(name)
    this.askEl.replaceChildren(title, choices)
    this.askEl.hidden = false
    choices.firstChild?.focus({ preventScroll: true })
  }

  /** One picture button; `at` puts it in a given place among the others. */
  addChoice(name, at = Infinity) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ask-choice'
    button.setAttribute('aria-label', OBSTACLE_NAMES[name])
    button.append(this.picture(this.askSeg.biome, name))
    button.dataset.name = name
    button.onclick = () => this.onPick(name)
    this.choiceRow.insertBefore(button, this.choiceRow.children[at] ?? null)
    return button
  }

  closeAsk() {
    this.askEl.hidden = true
    this.askEl.replaceChildren()
  }

  /** A choice that did not fit the pattern rests, faded, while the child has another go. */
  rest(name) {
    const button = this.choices.find((b) => b.dataset.name === name)
    if (!button) return
    button.disabled = true
    this.choices[0]?.focus({ preventScroll: true })
  }

  /** The ask buttons still to choose from, for keyboard play. */
  get choices() {
    return this.askEl.hidden ? [] : [...this.askEl.querySelectorAll('button:not(:disabled)')]
  }
}

/**
 * The burrow pantry: one shelf for each place, holding that place's two rows as crates (in fives,
 * like a ten-frame), and a little 🎵 crate of the carrots munched in its pattern. A carrot that got
 * away leaves its place in the crate empty, so what was missed on the way shows at home too.
 * Returns the crates, for the question at the burrow.
 */
export function renderPantry(el, rows) {
  el.replaceChildren()
  el.hidden = rows.length === 0
  const shelves = document.createElement('div')
  shelves.className = 'pantry-shelves'
  const crates = []
  for (const biome of [...new Set(rows.map((r) => r.biome))]) {
    const shelf = document.createElement('div')
    shelf.className = 'pantry-shelf'
    shelf.dataset.biome = biome
    const place = document.createElement('span')
    place.className = 'pantry-place'
    place.textContent = BIOMES[biome].emoji
    place.setAttribute('aria-hidden', 'true')
    shelf.append(place)
    // the place's two rows, then the carrots from its pattern
    rows.filter((r) => r.biome === biome).sort((p, q) => !!p.pattern - !!q.pattern).forEach((row, i) => {
      if (i) {
        const plus = document.createElement('span')
        plus.className = `pantry-plus${row.pattern ? ' to-pattern' : ''}`
        plus.textContent = '+'
        shelf.append(plus)
      }
      const crate = document.createElement('span')
      crate.className = 'pantry-crate'
      crate.style.setProperty('--cols', String(Math.min(Math.max(row.n, row.got), 5)))
      crate.setAttribute('aria-label', carrotWords(row.got))
      for (let k = 0; k < Math.max(row.n, row.got); k++) {
        const c = document.createElement('span')
        c.textContent = '🥕'
        if (k >= row.got) c.className = 'away'
        c.setAttribute('aria-hidden', 'true')
        crate.append(c)
      }
      const label = document.createElement('b')
      label.textContent = String(row.got)
      // a button, so the question at the burrow can ask which crate has more
      const wrap = document.createElement('button')
      wrap.type = 'button'
      wrap.disabled = true
      wrap.className = `pantry-row${row.pattern ? ' pattern' : ''}`
      if (row.pattern) {
        const tag = document.createElement('i')
        tag.className = 'pantry-tag'
        tag.textContent = '🎵'
        tag.setAttribute('aria-hidden', 'true')
        wrap.append(tag)
      }
      wrap.append(crate, label)
      shelf.append(wrap)
      crates.push({ el: wrap, row, shelf })
    })
    shelves.append(shelf)
  }
  const ask = document.createElement('div')
  ask.className = 'pantry-ask'
  ask.hidden = true
  const sum = document.createElement('div')
  sum.className = 'pantry-total'
  sum.hidden = true
  el.append(shelves, ask, sum)
  return crates
}

/**
 * Once the total has been seen, the shelves fold into one line of place totals
 * ("🌼 5 + 🍄 8 + 🍂 11 + ❄️ 14"), above the total, so Pip stands clear above the pantry.
 */
export function foldPantry(el, rows) {
  const line = document.createElement('div')
  line.className = 'pantry-sums'
  line.setAttribute('aria-hidden', 'true')
  ;[...new Set(rows.map((r) => r.biome))].forEach((biome, i) => {
    const part = document.createElement('span')
    part.textContent = `${i ? '+ ' : ''}${BIOMES[biome].emoji} ${rows.filter((r) => r.biome === biome).reduce((n, r) => n + r.got, 0)}`
    line.append(part)
  })
  el.querySelector('.pantry-shelves')?.replaceWith(line)
}

/**
 * The smallest group that repeats all along a planted row, with at least two whole goes and two
 * colours (pink, yellow, pink, yellow → [pink, yellow]); null when the row does not repeat (yet).
 */
export function repeatOf(row) {
  for (let len = 2; len * 2 <= row.length; len++) {
    const unit = row.slice(0, len)
    if (new Set(unit).size > 1 && row.every((c, i) => c === unit[i % len])) return unit
  }
  return null
}

/**
 * Pip's door garden: the flowers picked on the trip, by colour (how many are left of each), and a
 * row of places in front of the burrow to plant them in, one tap each. Tapping the last flower
 * planted takes it back. `onChange(row, color)` hears each change (color is null for a take-back).
 */
export function renderGarden(el, counts, cue, onChange) {
  const left = { ...counts }
  const size = Math.min(8, Object.values(counts).reduce((a, b) => a + b, 0))
  const row = []
  const garden = document.createElement('div')
  garden.className = 'garden'
  const bed = document.createElement('div')
  bed.className = 'garden-bed'
  const places = Array.from({ length: size }, () => {
    const place = document.createElement('button')
    place.type = 'button'
    place.className = 'garden-place'
    place.disabled = true
    place.setAttribute('aria-label', 'empty place')
    place.onclick = () => {
      // only the last flower planted can be taken back, so the row stays in order
      if (place !== places[row.length - 1]) return
      const color = row.pop()
      left[color]++
      draw()
      onChange(row, null)
    }
    bed.append(place)
    return place
  })
  const seeds = document.createElement('div')
  seeds.className = 'garden-seeds'
  const buttons = Object.keys(counts).filter((c) => counts[c] > 0).map((color) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'garden-seed'
    button.dataset.color = color
    const n = document.createElement('b')
    button.append(cue.flower(color), n)
    button.onclick = () => {
      if (!left[color] || row.length >= size) return
      left[color]--
      row.push(color)
      draw()
      onChange(row, color)
    }
    seeds.append(button)
    return button
  })
  function draw() {
    places.forEach((place, i) => {
      place.replaceChildren(...(row[i] ? [cue.flower(row[i])] : []))
      place.classList.toggle('planted', !!row[i])
      place.disabled = i !== row.length - 1
      place.setAttribute('aria-label', row[i] ? `${row[i]} flower${i === row.length - 1 ? ', tap to take it back' : ''}` : 'empty place')
    })
    for (const button of buttons) {
      const color = button.dataset.color
      button.querySelector('b').textContent = String(left[color])
      button.disabled = !left[color] || row.length >= size
      button.setAttribute('aria-label', `plant a ${color} flower, ${left[color]} left`)
    }
  }
  draw()
  garden.append(bed, seeds)
  el.append(garden)
  return { buttons, get choices() { return [...buttons, ...places].filter((b) => !b.disabled) } }
}

/** The pantry's total, with Pip's winter goal beside it: met, or how many short. */
export function showPantryTotal(el, total, goal) {
  const sum = el.querySelector('.pantry-total')
  sum.replaceChildren()
  sum.innerHTML = `<span>=</span><b id="final">${total}</b><span aria-hidden="true">🥕</span>`
  const winter = document.createElement('span')
  winter.className = `pantry-goal${total >= goal ? ' met' : ''}`
  winter.textContent = `❄️ ${goal}${total >= goal ? ' ✓' : ''}`
  winter.setAttribute('aria-label', total >= goal ? `Enough for winter: Pip needed ${goal}` : `Pip needs ${goal} for winter`)
  sum.append(winter)
  sum.hidden = false
}

/** What Pip says at home about winter: the total, and whether it is enough (with spares or a gap, for older hoppers). */
export function pantryWords(total, goal, older) {
  if (total >= goal) return `${carrotWords(total)}. Enough for winter${older && total > goal ? `, and ${total - goal} to spare` : ''}!`
  return `${carrotWords(total)}. Pip needs ${goal} for winter${older ? `: ${goal - total} more next time` : ''}.`
}
