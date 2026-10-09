import { DESTS, PARTS } from './parts.js'
import { SLOT_WORDS, WOBBLY, compareBuilds, explainFlight, isBuild, placeName } from './workshop.js'

/**
 * The fair test inside every launch: after a part change the robot asks "farther, the same, or
 * less far?", the last rocket flies along as a ghost, and the landing names the cause. Single-part
 * changes (fair tests) fill a pictured "what I found out" notebook.
 */

/** Only the parts: paint never changes a flight. */
export function partsOf(rocket) {
  const out = {}
  for (const slot of Object.keys(PARTS)) out[slot] = rocket[slot]
  return out
}
export const validBuild = (value) => (isBuild(value) ? partsOf(value) : null)

/** The three guesses, as pictures first. `answer` matches compareBuilds(before, now).answer. */
export const GUESSES = [
  { id: 'farther', answer: 'b', arrow: '⬆', label: 'Farther', say: 'farther' },
  { id: 'same', answer: 'same', arrow: '=', label: 'Same', say: 'the same' },
  { id: 'less', answer: 'a', arrow: '⬇', label: 'Less far', say: 'less far' },
]
const guessOf = (id) => GUESSES.find((g) => g.id === id)

/** The test for this launch, or null when no part changed since the last flight. */
export function fairTest(last, rocket) {
  if (!last) return null
  const now = partsOf(rocket)
  const result = compareBuilds(last, now)
  if (!result.changed.length) return null
  return { before: last, now, result, guess: null }
}

/** One spoken verdict for the landing: never "wrong", and the cause in the game's real rules. */
export function verdict(test) {
  const guess = guessOf(test.guess)
  const matched = guess?.answer === test.result.answer
  const why = explainFlight(test.before, test.now, test.result)
  return { matched, why, say: `${matched ? 'You guessed it!' : 'Ooh, a new discovery!'} ${why}` }
}

// --- The notebook ---------------------------------------------------------------------------

/** Order of the pages: the one that changes distance first, then the wobbly ones, then the fun ones. */
const PAGES = ['booster', 'fins', 'tank', 'nose', 'cabin', 'pilot', 'sticker']
const RANK = { same: 1, fun: 1, wobble: 2, distance: 2 }
const plural = (slot) => slot === 'fins' || slot === 'booster'

/** What a fair test (exactly one part changed) found out, or null. */
export function noteFrom(test) {
  const { changed } = test.result
  if (changed.length !== 1) return null
  const slot = changed[0]
  const kind = slot === 'booster' ? 'distance' : WOBBLY.has(slot) ? (test.result.a.wobble !== test.result.b.wobble ? 'wobble' : 'same') : 'fun'
  return { slot, kind, id: test.now[slot] }
}

export function noteSentence(slot, kind) {
  const name = SLOT_WORDS[slot]
  if (kind === 'distance') return 'Boosters change how far the rocket goes. Bigger boosters push harder!'
  if (kind === 'wobble') return `The ${name} ${plural(slot) ? 'change' : 'changes'} the wobble, not the distance.`
  if (kind === 'same') return `The ${name} did not change the distance.`
  return `The ${name} ${plural(slot) ? 'are' : 'is'} just for fun. Same distance!`
}

/** Saved notes: { slot: { kind, id } }. Unknown entries are dropped. */
export function sanitizeNotes(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const slot of PAGES) {
    const n = value[slot]
    if (n && RANK[n.kind] && PARTS[slot].some((p) => p.id === n.id)) out[slot] = { kind: n.kind, id: n.id }
  }
  return out
}

/** Adds a note if it is new (or tells more than the old one). Returns true when a page changed. */
export function addNote(notes, note) {
  if (!note) return false
  const old = notes[note.slot]
  if (old && RANK[old.kind] >= RANK[note.kind]) return false
  notes[note.slot] = { kind: note.kind, id: note.id }
  return true
}

const ICONS = { distance: ['🪐', '⬆'], wobble: ['〰️', '🪐='], same: ['🪐='], fun: ['🎨', '🪐='] }

function el(tag, className, text) {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}
function img(src, className = '') {
  const i = el('img', className)
  i.src = src || ''
  i.alt = ''
  return i
}

/** A guess as a picture: last time's rocket faded on the left, this one higher, level or lower. */
export function guessPicture(id, beforeSrc, nowSrc) {
  const g = guessOf(id)
  const pic = el('span', `ft-pic ft-${id}`)
  pic.append(el('i', 'ft-mark'), img(beforeSrc, 'ft-before'), img(nowSrc, 'ft-now'), el('b', 'ft-arrow', g.arrow))
  return pic
}

/** Two lanes along the planets, like the workshop's track: last time above, this flight below. */
export function flightRace(test, rocketThumb, landed) {
  const race = el('div', 'workshop-race ft-race')
  const stops = el('div', 'workshop-stops')
  stops.append(el('span'), el('span', 'workshop-stop workshop-home', '🏠'))
  for (const d of DESTS) stops.append(el('span', 'workshop-stop', d.emoji))
  race.append(stops)
  const lanes = [['a', test.before, test.result.a], ['b', test.now, { ...test.result.b, reach: landed ?? test.result.b.reach }]]
  for (const [slot, build, r] of lanes) {
    const lane = el('div', `workshop-lane lane-${slot}`)
    lane.append(el('span', 'ft-lane-badge', slot === 'a' ? '👻' : ''))
    const rail = el('div', 'workshop-rail')
    rail.dataset.at = String(r.reach + 1)
    const ship = el('span', 'workshop-ship')
    ship.style.setProperty('--wobble', `${4 + r.wobble * 14}deg`)
    ship.append(img(rocketThumb(build)))
    rail.append(ship)
    lane.append(rail)
    race.append(lane)
  }
  return race
}

/** Fly both little ships to their planets (call once the race is in the page). */
export function runRace(race, result, onDone = () => {}) {
  const ships = [...race.querySelectorAll('.workshop-ship')]
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const rail of race.querySelectorAll('.workshop-rail')) rail.style.setProperty('--at', rail.dataset.at)
    for (const ship of ships) ship.classList.add('flying')
  }))
  return setTimeout(() => {
    for (const ship of ships) ship.classList.remove('flying')
    const stops = race.querySelectorAll('.workshop-stops .workshop-stop')
    for (const rail of race.querySelectorAll('.workshop-rail')) stops[Number(rail.dataset.at)]?.classList.add('reached')
    for (const [slot, won] of [['a', result.answer !== 'b'], ['b', result.answer !== 'a']]) race.querySelector(`.lane-${slot}`).classList.toggle('winner', won)
    onDone()
  }, 1700)
}

function keyGuard(dialog) {
  const guard = (e) => { if (dialog.open) e.stopPropagation() }
  addEventListener('keydown', guard, true)
  addEventListener('keyup', guard, true)
}

/** "Will it go farther, the same, or less far?" before a launch with a changed part. */
export function createPredict({ thumbOf, rocketThumb, speak, sound = () => {}, onGuess, onBack }) {
  const dialog = el('dialog', 'ft-dialog')
  dialog.id = 'predict'
  dialog.setAttribute('aria-labelledby', 'predict-q')
  dialog.innerHTML = `<div class="ft-head"><div class="ft-last"></div><div class="ft-swap" aria-hidden="true"></div>
    <button id="predict-say" class="ft-round" aria-label="Say it again">🔊</button><button id="predict-back" class="ft-round" aria-label="Back to the garage">🔧</button></div>
    <p id="predict-q">Will it go farther, the same, or less far?</p>
    <div class="ft-guesses" role="group" aria-labelledby="predict-q"></div>`
  document.body.append(dialog)
  keyGuard(dialog)
  const guesses = dialog.querySelector('.ft-guesses')
  let test = null
  let said = ''

  function swapPicture(changed) {
    const swap = dialog.querySelector('.ft-swap')
    swap.replaceChildren()
    for (const slot of changed.slice(0, 3)) {
      const pair = el('span', 'ft-pair')
      for (const [i, build] of [test.before, test.now].entries()) {
        if (i) pair.append(el('i', '', '➜'))
        const holder = el('span', 'ft-part')
        const src = build[slot] === 'none' ? '' : thumbOf(slot, build[slot])
        holder.append(src ? img(src) : el('span', '', '🚫'))
        pair.append(holder)
      }
      swap.append(pair)
    }
    if (changed.length > 3) swap.append(el('span', 'ft-more', '…'))
  }

  function choose(id) {
    if (!test || test.guess) return
    test.guess = id
    sound('pick')
    for (const b of guesses.children) b.setAttribute('aria-pressed', String(b.dataset.guess === id))
    speak(`You think ${guessOf(id).say}. Let’s find out!`)
    const chosen = test
    setTimeout(() => {
      if (dialog.open) dialog.close()
      onGuess(chosen)
    }, 450)
  }

  dialog.querySelector('#predict-say').onclick = () => speak(said)
  dialog.querySelector('#predict-back').onclick = () => {
    test = null
    dialog.close()
    onBack()
  }
  dialog.addEventListener('cancel', () => { test = null; onBack() })
  dialog.addEventListener('keydown', (e) => {
    const i = { 1: 0, 2: 1, 3: 2 }[e.key]
    if (i !== undefined) return choose(GUESSES[i].id)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const list = [...guesses.children]
      const at = list.indexOf(document.activeElement)
      const next = at < 0 ? 0 : (at + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length
      list[next]?.focus()
      e.preventDefault()
    }
  })

  return {
    get open() { return dialog.open },
    ask(next) {
      test = next
      const before = rocketThumb(test.before)
      const now = rocketThumb(test.now)
      const last = dialog.querySelector('.ft-last')
      last.replaceChildren(img(before, 'ft-last-rocket'), el('span', 'ft-last-planet', DESTS[test.result.a.reach].emoji))
      last.setAttribute('aria-label', `Last time it reached ${placeName(test.result.a.reach)}`)
      swapPicture(test.result.changed)
      guesses.replaceChildren(...GUESSES.map((g) => {
        const b = el('button', 'ft-guess')
        b.dataset.guess = g.id
        b.setAttribute('aria-label', `It will go ${g.say}`)
        b.setAttribute('aria-pressed', 'false')
        b.append(guessPicture(g.id, before, now), el('span', 'ft-label', g.label))
        b.onclick = () => choose(g.id)
        return b
      }))
      const what = test.result.changed.length === 1 ? `You changed the ${SLOT_WORDS[test.result.changed[0]]}.` : `You changed ${test.result.changed.length} parts.`
      said = `${what} Last time, it reached ${placeName(test.result.a.reach)}. Will it go farther, the same, or less far?`
      dialog.showModal()
      dialog.focus()
      speak(said)
    },
    close() {
      test = null
      if (dialog.open) dialog.close()
    },
  }
}

/** The pictured "what I found out" notebook: one page per part, filled by fair tests. */
export function createNotebook({ notes, thumbOf, speak, sound = () => {} }) {
  const dialog = el('dialog', 'ft-dialog ft-notebook')
  dialog.id = 'notebook'
  dialog.setAttribute('aria-labelledby', 'notebook-title')
  dialog.innerHTML = `<div class="ft-head"><h2 id="notebook-title">📓 What I found out</h2>
    <button id="notebook-say" class="ft-round" aria-label="Say it again">🔊</button><button id="notebook-close" class="ft-round" aria-label="Close the notebook">✕</button></div>
    <div class="ft-pages"></div><p id="notebook-line" role="status" aria-live="polite"></p>`
  document.body.append(dialog)
  keyGuard(dialog)
  const pages = dialog.querySelector('.ft-pages')
  const line = dialog.querySelector('#notebook-line')
  let said = ''
  const tell = (text) => {
    line.textContent = text
    said = text
    speak(text)
  }

  function render() {
    pages.replaceChildren(...PAGES.map((slot) => {
      const note = notes()[slot]
      const b = el('button', `ft-page${note ? ' found' : ''}`)
      b.dataset.slot = slot
      const partId = note?.id ?? PARTS[slot][1].id
      b.append(el('span', 'ft-page-part'))
      const src = thumbOf(slot, partId === 'none' ? PARTS[slot][1].id : partId)
      b.firstChild.append(src ? img(src) : el('span', '', '🚫'))
      const icons = el('span', 'ft-page-icons')
      for (const icon of note ? ICONS[note.kind] : ['?']) icons.append(el('b', '', icon))
      b.append(icons)
      const text = note ? noteSentence(slot, note.kind) : `Change only the ${SLOT_WORDS[slot]}, then fly, to find out what ${plural(slot) ? 'they do' : 'it does'}.`
      b.setAttribute('aria-label', text)
      b.onclick = () => {
        sound('pick')
        for (const p of pages.children) p.classList.toggle('on', p === b)
        tell(text)
      }
      return b
    }))
  }

  dialog.querySelector('#notebook-close').onclick = () => dialog.close()
  dialog.querySelector('#notebook-say').onclick = () => speak(said)

  return {
    get open() { return dialog.open },
    show() {
      render()
      const found = Object.keys(notes()).length
      dialog.showModal()
      tell(found ? `You found out ${found} thing${found > 1 ? 's' : ''}! Tap a page to hear it.` : 'Change just one part, then fly. What you find out goes here!')
    },
    close() { if (dialog.open) dialog.close() },
  }
}
