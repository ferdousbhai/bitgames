// Sharing the finished birthday cake equally between the friends at the party.
// It follows the recipe studio's equal-share rule (js/recipe-studio.js, "Share the cake"):
// the cake is cut into two slices for every friend, and the share is fair when every
// plate holds slices / friends. Here the cake is the one the child just stacked, and a plate
// that is already ahead waits while a friend with fewer slices gets one, so the child deals
// "one for you, one for you" and sees the equal groups grow on the plates.

const SVG = 'http://www.w3.org/2000/svg'
export const SLICES_EACH = 2

const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
const svg = (tag, attrs) => {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

/** One slice seen from the side: a wedge striped with the cake's own layers, icing on top. */
function sliceIcon(layers) {
  const s = svg('svg', { viewBox: '0 0 40 40', class: 'slice', 'aria-hidden': 'true' })
  const id = `w${Math.random().toString(36).slice(2, 8)}`
  const clip = svg('clipPath', { id })
  clip.append(svg('path', { d: 'M3 37 L37 37 L37 6 Z' }))
  s.append(clip)
  const g = svg('g', { 'clip-path': `url(#${id})` })
  const n = Math.max(1, layers.length)
  const h = 31 / n
  layers.forEach((f, i) => {
    const y = 37 - (i + 1) * h
    g.append(svg('rect', { x: 0, y, width: 40, height: h + 0.4, fill: f.sponge }))
    g.append(svg('rect', { x: 0, y, width: 40, height: Math.min(2.4, h * 0.3), fill: f.filling }))
  })
  const top = layers[layers.length - 1]
  g.append(svg('rect', { x: 0, y: 4, width: 40, height: 3.4, fill: top?.icing || '#fff' }))
  s.append(g, svg('path', { d: 'M3 37 L37 37 L37 6 Z', fill: 'none', stroke: 'rgba(120,60,90,.35)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }))
  return s
}

/** The whole cake from above, cut into equal wedges. */
function cakeTop(n, top, rim) {
  const s = svg('svg', { viewBox: '-55 -55 110 110', class: 'share-cake', role: 'img', 'aria-label': `A cake cut into ${n} equal slices` })
  s.append(svg('circle', { cx: 0, cy: 0, r: 53, fill: '#fff', stroke: rim, 'stroke-width': 4 }))
  const wedges = []
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2
    const mid = (a0 + a1) / 2
    const r = 46
    const ox = Math.cos(mid) * 2.2
    const oy = Math.sin(mid) * 2.2
    const d = `M${ox} ${oy} L${ox + Math.cos(a0) * r} ${oy + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${ox + Math.cos(a1) * r} ${oy + Math.sin(a1) * r} Z`
    // White cut lines and a sponge-coloured rim keep every slice visible, even on dark icing.
    const w = svg('path', { d, fill: top, stroke: '#fff', 'stroke-width': 2.5, 'stroke-linejoin': 'round', class: 'wedge' })
    s.append(w)
    wedges.push(w)
  }
  return { s, wedges }
}

/**
 * root: the overlay element to fill. speak(text) talks (respecting mute). sound: the game's synth.
 * onDone({ guests, each, slices }) runs once every slice is shared fairly.
 */
export function createPartyShare({ root, speak, sound, onDone }) {
  let guests = []
  let plates = [] // slices on each plate
  let slices = 0
  let given = 0
  let wedges = []
  let buttons = []
  let finished = false
  let layers = []

  const card = el('div', 'share-card')
  const head = el('div', 'share-head')
  const faces = el('div', 'share-faces')
  const say = el('div', 'share-say')
  say.setAttribute('role', 'status')
  say.setAttribute('aria-live', 'polite')
  const row = el('div', 'share-plates')
  card.append(head, row, say)
  root.append(card)

  const count = (i) => plates[i]
  const fewest = () => Math.min(...plates)

  function render() {
    buttons.forEach((b, i) => {
      const box = b.querySelector('.on-plate')
      while (box.children.length < plates[i]) {
        const icon = sliceIcon(layers)
        icon.classList.add('arrive')
        box.append(icon)
      }
      // The friends with the fewest slices are the ones waiting for the next one.
      b.classList.toggle('waiting', !finished && plates[i] === fewest() && given < slices)
      b.setAttribute('aria-label', `${guests[i].name}: ${plates[i]} ${plates[i] === 1 ? 'slice' : 'slices'}`)
    })
  }

  function give(i) {
    if (finished || i < 0 || i >= guests.length) return false
    const g = guests[i]
    if (count(i) > fewest()) {
      // Never a buzzer: name who is still waiting so the child can share it out evenly.
      const waiting = guests.filter((_, k) => plates[k] === fewest()).map((w) => w.name)
      const text = `${g.name} has ${count(i)}. ${waiting.join(' and ')} ${waiting.length > 1 ? 'are' : 'is'} still waiting!`
      say.textContent = `${g.emoji} ${'🍰'.repeat(count(i))} … ${guests.filter((_, k) => plates[k] === fewest()).map((w) => w.emoji).join(' ')} ⏳`
      speak(text)
      sound?.click()
      buttons[i].classList.remove('nudge')
      void buttons[i].offsetWidth
      buttons[i].classList.add('nudge')
      return false
    }
    plates[i]++
    wedges[given]?.classList.add('gone')
    given++
    sound?.pop(0, plates[i] * 2)
    say.textContent = `${g.emoji} ${'🍰'.repeat(plates[i])}`
    render()
    if (given === slices) {
      finished = true
      render()
      const each = slices / guests.length
      const fair = plates.every((p) => p === each)
      const text = `${guests.length} friends, ${each} slices each!`
      say.textContent = `${guests.map((w) => w.emoji).join('')} ${'🍰'.repeat(each)} ✓`
      sound?.perfect(4)
      speak(fair ? `${text} Everyone has the same.` : text)
      row.classList.add('fair')
      setTimeout(() => onDone?.({ guests, each, slices }), 2400)
    } else {
      speak(`${g.name}, ${plates[i]}`)
    }
    return true
  }

  return {
    /** guests: [{ emoji, name, plate }], cakeLayers: the FLAVOURS entries from the bottom up. */
    start(list, cakeLayers) {
      guests = list
      layers = cakeLayers
      slices = guests.length * SLICES_EACH
      plates = guests.map(() => 0)
      given = 0
      finished = false
      const top = layers[layers.length - 1]
      const cut = cakeTop(slices, top?.rainbow ? '#ffd6e4' : top?.icing || '#fffaf0', top?.sponge || '#f7d98f')
      wedges = cut.wedges
      faces.textContent = guests.map((g) => g.emoji).join('')
      head.replaceChildren(cut.s, faces)
      row.classList.remove('fair')
      buttons = guests.map((g, i) => {
        const b = el('button', 'share-plate')
        b.type = 'button'
        b.style.setProperty('--plate', g.plate)
        b.append(el('span', 'face', g.emoji), el('span', 'on-plate'))
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          sound?.unlock?.()
          give(i)
        })
        return b
      })
      row.replaceChildren(...buttons)
      say.textContent = `🍰 ➜ ${guests.map((g) => g.emoji).join(' ')}`
      render()
      root.classList.remove('hidden')
      speak(`${guests.length} friends at the party! Tap a plate to share the cake.`)
    },
    hide() {
      root.classList.add('hidden')
      finished = true
    },
    give,
    /** Space or Enter hands the next slice to the first friend still waiting. */
    giveNext() {
      return give(plates.indexOf(fewest()))
    },
    get state() {
      return { guests: guests.map((g) => g.emoji), plates: [...plates], slices, given, finished }
    },
  }
}
