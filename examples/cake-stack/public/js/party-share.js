import { listWords } from './speech.js'
// Sharing the finished birthday cake equally between the friends at the party: real division.
// The cake (the one the child just stacked) is cut into 4, 6, 8 or 12 slices for 2–4 friends.
// The child deals the slices: any plate takes one, so nothing decides for them. When the cake is
// empty the friends look at their plates: is it fair? If one plate has more, the child taps a slice
// to put it back on the cake and shares it again. On harder cakes the slices do not always go
// round, and the baker's plate is there for the ones that cannot. The share is fair when every
// friend has the same and the baker has fewer than one more each.
// For the oldest children the cut itself is a choice: two ways to cut the cake, only one of which
// goes round every friend exactly. The other still works, but the baker eats the leftovers.

const SVG = 'http://www.w3.org/2000/svg'

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

/** The whole cake from above, cut into equal wedges, each with a cherry, on a sponge-coloured rim. */
function cakeTop(n, top, rim) {
  const s = svg('svg', { viewBox: '-55 -55 110 110', class: n >= 12 ? 'share-cake many' : 'share-cake', role: 'img', 'aria-label': `A cake cut into ${n} equal slices` })
  // The plate and the cake's sponge side show round the edge, so even a pale (vanilla) top reads as a cake.
  // A slice that has been given leaves its place on the plate empty (see .gone), and once every slice is
  // gone the sponge ring fades too (.empty), so an empty cake really looks like an empty plate.
  s.append(svg('circle', { cx: 0, cy: 0, r: 54, fill: '#f6e3ee' }), svg('circle', { class: 'rim', cx: 0, cy: 0, r: 49, fill: rim, stroke: 'rgba(120,60,90,.4)', 'stroke-width': 1.5 }))
  const wedges = []
  const [r8, g8, b8] = [1, 3, 5].map((k) => parseInt(top.slice(k, k + 2), 16))
  const dark = 0.3 * r8 + 0.59 * g8 + 0.11 * b8 < 110
  // Many slices get a wider gap and a thicker cut line, so even twelve read one by one at a glance.
  const many = n >= 8
  const cutLine = dark ? '#fff' : 'rgba(120,60,90,.5)'
  // The sponge shows as a wide ring round the icing, and through the gaps between the slices.
  const r = 43
  const gap = many ? 3.6 : 2.4
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2
    const mid = (a0 + a1) / 2
    const ox = Math.cos(mid) * gap
    const oy = Math.sin(mid) * gap
    const d = `M${ox} ${oy} L${ox + Math.cos(a0) * r} ${oy + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${ox + Math.cos(a1) * r} ${oy + Math.sin(a1) * r} Z`
    // Soft brown cut lines show every slice on pale icing, white ones on dark (chocolate) icing.
    const w = svg('g', { class: 'wedge' })
    w.append(
      svg('path', { d, fill: top, stroke: cutLine, 'stroke-width': many ? 2.4 : 1.8, 'stroke-linejoin': 'round' }),
      // One cherry near the outer edge of every slice, where even a thin slice has room for a big one.
      svg('circle', { cx: ox + Math.cos(mid) * r * 0.72, cy: oy + Math.sin(mid) * r * 0.72, r: n >= 12 ? 5 : Math.max(5.5, 9 - n * 0.45), fill: '#e8456b', stroke: '#fff', 'stroke-width': 1.4 }),
    )
    s.append(w)
    wedges.push(w)
  }
  return { s, wedges }
}

const BAKER = { emoji: '🧑‍🍳', name: 'the baker', plate: '#f3e6d4' }

/**
 * root: the overlay element to fill. speak(text) talks (respecting mute); speakOnce(text) says a
 * sentence only once per cake (every sentence passed to it is fixed, so it really is once).
 * sound: the game's synth. onDone({ guests, each, slices, left }) runs once the share is fair.
 */
export function createPartyShare({ root, speak, speakOnce = speak, sound, onDone }) {
  let guests = []
  let plates = [] // slices on each friend's plate; the baker's plate, when there is one, is the last
  let slices = 0
  let wedges = []
  let cakeSvg = null // the cake top being shared (it shows as an empty plate once every slice is given)
  let boxes = [] // the plates as elements, the baker's last
  let withBaker = false
  let finished = false
  let checks = 0 // how many times the empty cake has been checked and found unfair
  let layers = []
  let doneTimer = 0
  let cutting = false // the child is choosing how many slices to cut

  const card = el('div', 'share-card')
  const head = el('div', 'share-head')
  const say = el('div', 'share-say')
  say.setAttribute('role', 'status')
  say.setAttribute('aria-live', 'polite')
  const row = el('div', 'share-plates')
  card.append(head, row, say)
  root.append(card)

  const friends = () => plates.slice(0, guests.length)
  const baker = () => (withBaker ? plates[guests.length] : 0)
  const given = () => plates.reduce((a, b) => a + b, 0)
  const left = () => slices - given()
  const nameOf = (i) => (i === guests.length ? BAKER.name : guests[i].name)
  const emojiOf = (i) => (i === guests.length ? BAKER.emoji : guests[i].emoji)

  function nudge(b) {
    sound?.click()
    b.classList.remove('nudge')
    void b.offsetWidth
    b.classList.add('nudge')
  }

  function render() {
    // The cake keeps one wedge for every slice still on it.
    wedges.forEach((w, k) => w.classList.toggle('gone', k >= left()))
    cakeSvg?.classList.toggle('empty', !cutting && slices > 0 && left() === 0)
    // While slices are still on the cake, a tap anywhere on a plate (its slices too) gives it one more.
    // Only when the cake is empty and the plates are being checked can a slice be tapped to go back, so a
    // child who keeps tapping the middle of a plate never takes slices off by accident.
    card.classList.toggle('dealing', left() > 0)
    boxes.forEach((b, i) => {
      const box = b.querySelector('.on-plate')
      while (box.children.length > plates[i]) box.lastChild.remove()
      while (box.children.length < plates[i]) {
        // Each slice on a plate can be tapped to put it back on the cake.
        const s = el('button', 'slice-btn')
        s.type = 'button'
        s.setAttribute('aria-label', `Put a slice from ${nameOf(i)} back on the cake`)
        s.tabIndex = -1
        s.append(sliceIcon(layers))
        s.addEventListener('click', (e) => {
          e.stopPropagation()
          sound?.unlock?.()
          takeBack(i)
        })
        box.append(s)
      }
      for (const s of box.children) s.tabIndex = left() > 0 ? -1 : 0
      b.querySelector('.count').textContent = String(plates[i])
      b.querySelector('.give').setAttribute('aria-label', `Give ${nameOf(i)} a slice. ${nameOf(i)} has ${plates[i]}.`)
    })
    card.classList.toggle('counting', checks >= 2 && !finished)
  }

  function finish() {
    finished = true
    render()
    const n = guests.length
    const each = plates[0]
    const rest = baker()
    say.textContent = `${guests.map((w) => w.emoji).join('')} ${'🍰'.repeat(each)}${rest ? `  ${BAKER.emoji} ${'🍰'.repeat(rest)}` : ''} ✓`
    sound?.perfect(4)
    speak(rest
      ? `${slices} slices, ${n} friends. ${each} each, and ${rest} for the baker!`
      : `${slices} slices, ${n} friends. ${each} each. Everyone has the same!`)
    row.classList.add('fair')
    doneTimer = setTimeout(() => onDone?.({ guests, each, slices, left: rest }), 2600)
  }

  /** The cake is empty: the friends look at their plates. Never a buzzer, and the child does the fixing. */
  function check() {
    const f = friends()
    const even = f.every((p) => p === f[0])
    if (even && baker() < guests.length) return finish()
    checks++
    sound?.wobble?.()
    say.textContent = '⚖️ ?'
    card.classList.add('checking')
    if (!even) speakOnce('Is it fair? Look at every plate. Tap a slice to put it back.')
    else speakOnce('The baker has enough for every friend to have one more!')
    render()
  }

  /** One slice from the cake onto plate i (the baker's plate is guests.length). Any plate takes it. */
  function give(i) {
    if (finished || i < 0 || i >= plates.length) return false
    const b = boxes[i]
    if (cutting) {
      nudge(b)
      return false
    }
    if (left() === 0) {
      nudge(b)
      return false
    }
    const ahead = plates[i] > Math.min(...friends())
    plates[i]++
    card.classList.remove('checking')
    // A soft pop that rises with the plate; no counting aloud. A slice landing on a plate that is
    // already ahead wobbles as it lands, a quiet sign the plates are getting uneven.
    sound?.pop(0, plates[i] * 2)
    render()
    const slice = b.querySelector('.on-plate').lastChild
    slice?.classList.add(ahead ? 'wobble' : 'arrive')
    say.textContent = `${emojiOf(i)} ${'🍰'.repeat(plates[i])}`
    if (left() === 0) check()
    return true
  }

  /** A slice goes back from plate i onto the cake. */
  function takeBack(i) {
    if (cutting || finished || i < 0 || i >= plates.length || !plates[i] || left() > 0) return false
    plates[i]--
    card.classList.remove('checking')
    sound?.click()
    say.textContent = `${emojiOf(i)} ➜ 🎂`
    render()
    return true
  }

  function plateFor(i, who, extra = '') {
    const b = el('div', `share-plate${extra}`)
    b.style.setProperty('--plate', who.plate)
    const face = el('button', 'give')
    face.type = 'button'
    face.append(el('span', 'face', who.emoji), el('span', 'count'))
    b.append(face, el('span', 'on-plate'))
    // The whole plate takes a slice; once the cake is empty, the slices on it can be tapped to put one back.
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      sound?.unlock?.()
      give(i)
    })
    return b
  }

  /** The cake as a whole, ready to be cut into `count` slices: its wedges, the plates and the caption. */
  function cutCake(count) {
    slices = count
    cutting = false
    const top = layers[layers.length - 1]
    const cut = cakeTop(slices, top?.rainbow ? '#ffd6e4' : top?.icing || '#fffaf0', top?.sponge || '#f7d98f')
    wedges = cut.wedges
    cakeSvg = cut.s
    head.replaceChildren(cut.s)
    card.classList.remove('cutting')
    say.textContent = `${slices} 🍰 ➜ ${guests.map((g) => g.emoji).join(' ')}`
    render()
  }

  /** Two ways to cut the cake, side by side: the child picks one before the slices are dealt. */
  function offerCuts(cuts) {
    cutting = true
    card.classList.add('cutting')
    const top = layers[layers.length - 1]
    head.replaceChildren(...cuts.map((n) => {
      const b = el('button', 'cut-choice')
      b.type = 'button'
      b.setAttribute('aria-label', `Cut ${n} slices`)
      b.append(cakeTop(n, top?.rainbow ? '#ffd6e4' : top?.icing || '#fffaf0', top?.sponge || '#f7d98f').s, el('b', null, String(n)))
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        sound?.unlock?.()
        sound?.click()
        cutCake(n)
        speak(`${n} slices. Share them fairly!`)
      })
      return b
    }))
    say.textContent = `🍰 ? ➜ ${guests.map((g) => g.emoji).join(' ')}`
    speakOnce(`How shall we cut it, so ${listWords.format(guests.map((g) => g.name))} get the same, and none are left?`)
  }

  return {
    /**
     * guests: [{ emoji, name, plate }], cakeLayers: the FLAVOURS entries from the bottom up.
     * slices: how many to cut; withBaker: the baker's plate is there for leftovers (it is offered on
     * harder cakes even when the slices go round exactly, so the child has to decide).
     */
    start(list, cakeLayers, { slices: count = list.length * 2, withBaker: bakerToo = false, cuts = null } = {}) {
      clearTimeout(doneTimer)
      guests = list
      layers = cakeLayers
      // cuts: two slice counts to choose between (the baker's plate is always there then, for leftovers)
      withBaker = bakerToo || !!cuts || count % guests.length !== 0
      plates = [...guests.map(() => 0), ...(withBaker ? [0] : [])]
      finished = false
      checks = 0
      wedges = []
      cakeSvg = null
      row.classList.remove('fair')
      card.classList.remove('checking', 'counting')
      boxes = [...guests.map((g, i) => plateFor(i, g)), ...(withBaker ? [plateFor(guests.length, BAKER, ' baker')] : [])]
      row.replaceChildren(...boxes)
      root.classList.remove('hidden')
      if (cuts) {
        slices = 0
        offerCuts(cuts)
        return
      }
      cutCake(count)
      speak(`${slices} slices for ${listWords.format(guests.map((g) => g.name))}. Share them fairly!`)
    },
    hide() {
      clearTimeout(doneTimer)
      root.classList.add('hidden')
      finished = true
    },
    give,
    takeBack,
    get state() {
      return { guests: guests.map((g) => g.emoji), plates: friends(), baker: withBaker ? baker() : null, slices, left: left(), checks, finished, cutting }
    },
  }
}
