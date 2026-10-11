import { DESTS, PARTS, isSteady, reach } from './parts.js'
import { BOOSTER_WORDS, PLURAL_SLOTS, SLOT_WORDS, WOBBLY, buildRace, changedWords, compareBuilds, el, explainFlight, isBuild, keyGuard, placeName, ruling } from './workshop.js'

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

/**
 * One spoken verdict for the landing: never "wrong", and the cause in the game's real rules. A
 * planet guess (`test.planet`, asked of older children) must name the very planet; a missed one
 * hears where it really went first.
 */
export function verdict(test) {
  const planet = Number.isInteger(test.planet)
  const matched = planet ? test.planet === test.result.b.reach : guessOf(test.guess)?.answer === test.result.answer
  const why = explainFlight(test.before, test.now, test.result)
  const went = planet && !matched ? `It went to ${placeName(test.result.b.reach)}. ` : ''
  return { matched, why, say: `${matched ? 'You guessed it!' : 'Ooh, a new discovery!'} ${went}${why}` }
}

/** The guess as a small picture: the farther / same / less far rockets, or the planet picked. */
export function testChip(test, rocketThumb) {
  if (!Number.isInteger(test.planet)) return guessPicture(test.guess, rocketThumb(test.before), rocketThumb(test.now))
  const pic = el('span', 'ft-pic ft-planet-guess')
  pic.append(el('i', 'ft-mark'), img(rocketThumb(test.now), 'ft-now'), el('b', 'ft-guess-planet', DESTS[test.planet].emoji))
  return pic
}

// --- The notebook ---------------------------------------------------------------------------

/** Order of the pages: the one that changes distance first, then the wobbly ones, then the fun ones. */
const PAGES = ['booster', 'fins', 'tank', 'nose', 'cabin', 'pilot', 'sticker']
const RANK = { same: 1, fun: 1, wobble: 2, distance: 2 }
const plural = (slot) => PLURAL_SLOTS.has(slot)

/** What a fair test (exactly one part changed) found out, or null. */
export function noteFrom(test) {
  const { changed } = test.result
  if (changed.length !== 1) return null
  const slot = changed[0]
  const { kind } = ruling(test.result)
  const wobbled = test.result.a.wobble !== test.result.b.wobble
  // A wobble page always shows the part that wobbles (the test may have gone wobbly ➜ steady)
  const id = kind === 'wobble' && wobbled && isSteady(test.now) ? test.before[slot] : test.now[slot]
  return { slot, kind: kind === 'wobble' && !wobbled ? 'same' : kind, id }
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

// --- Which single parts wobble ------------------------------------------------------------

/**
 * Saved findings about single parts, { 'fins:fish': 'w' | 's' }, with anything unknown dropped.
 * Only nose, tank and fins are ever marked: the parts that can make the wobble.
 */
export function sanitizeKnown(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [key, v] of Object.entries(value)) {
    const [slot, id] = key.split(':')
    if (WOBBLY.has(slot) && PARTS[slot].some((p) => p.id === id) && (v === 'w' || v === 's')) out[key] = v
  }
  return out
}

/**
 * What a one-part test of the nose, tank or fins proves about that part, and nothing more: a
 * rocket that flew steady has a steady part there; when steady turned wobbly (or back), the part
 * that changed is the wobbly one. Returns the keys that are new. A part is only ever marked
 * after the child has tested it, never from the rules.
 */
export function learnParts(known, test) {
  const { changed } = test.result
  if (changed.length !== 1 || !WOBBLY.has(changed[0])) return []
  const slot = changed[0]
  const was = isSteady(test.before)
  const is = isSteady(test.now)
  const found = []
  const mark = (id, v) => {
    const key = `${slot}:${id}`
    if (known[key] === v) return
    known[key] = v
    found.push(key)
  }
  if (was) mark(test.before[slot], 's')
  if (is) mark(test.now[slot], 's')
  if (was && !is) mark(test.now[slot], 'w')
  if (!was && is) mark(test.before[slot], 'w')
  return found
}

const PART_WORDS = { icecream: 'ice cream', stripes: 'striped', classic: 'classic' }
/** "The fish fins wobble." / "The cone nose is steady." */
export function partSentence(key, v) {
  const [slot, id] = key.split(':')
  const many = PLURAL_SLOTS.has(slot)
  const name = `${PART_WORDS[id] ?? id} ${SLOT_WORDS[slot]}`
  return v === 'w' ? `The ${name} ${many ? 'wobble' : 'wobbles'}.` : `The ${name} ${many ? 'are' : 'is'} steady.`
}
export const WOB_MARK = { w: '〰️', s: '━' }

// 📏 is "how far it goes" (a planet here would read as the Ring Planet)
const ICONS = { distance: ['📏', '⬆'], wobble: ['〰️', '📏='], same: ['📏='], fun: ['🎨', '📏='] }

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

/** Two lanes along the planets, like the workshop's track: last time (the ghost) above, this flight below. */
export function flightRace(test, rocketThumb) {
  return buildRace([
    { slot: 'a', build: test.before, badge: el('span', 'ft-lane-badge', '👻') },
    { slot: 'b', build: test.now, badge: el('span', 'ft-lane-badge', '') },
  ], rocketThumb, 'ft-race')
}

/**
 * "Will it go farther, the same, or less far?" before a launch with a changed part. Older children
 * (`planets: true`, from mission tier 2) name the very planet instead, so every fair test uses
 * what the notebook says each booster reaches.
 */
export function createPredict({ thumbOf, rocketThumb, voice, sound = () => {}, onGuess, onBack }) {
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
  let going = null // the guessed test, once the dialog is closing to launch it
  let launchTimer = 0
  let planets = false

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
    // A planet: the farther / same / less far it implies is kept too, for the ghost and the notebook
    const planet = Number.isInteger(id) ? id : null
    const a = test.result.a.reach
    test.guess = planet === null ? id : planet > a ? 'farther' : planet === a ? 'same' : 'less'
    test.planet = planet
    sound('pick')
    for (const b of guesses.children) b.setAttribute('aria-pressed', String(b.dataset.guess === String(id)))
    voice.sayNow(`You think ${planet === null ? guessOf(id).say : placeName(planet)}. Let’s find out!`)
    const chosen = test
    launchTimer = setTimeout(() => {
      going = chosen
      dialog.close()
    }, 450)
  }

  dialog.querySelector('#predict-say').onclick = () => voice.sayNow(said)
  dialog.querySelector('#predict-back').onclick = () => dialog.close()
  // Every way out ends here: a guess that is on its way launches; 🔧, Escape or leaving the garage
  // (even straight after a guess) goes back to building and stops the question.
  dialog.addEventListener('close', () => {
    clearTimeout(launchTimer)
    const chosen = going
    going = null
    test = null
    if (chosen) return onGuess(chosen)
    voice.hush()
    onBack()
  })
  dialog.addEventListener('keydown', (e) => {
    const n = Number(e.key) - 1
    if (planets && Number.isInteger(n) && n >= 0 && n < DESTS.length) return choose(n)
    const i = { 1: 0, 2: 1, 3: 2 }[e.key]
    if (!planets && i !== undefined) return choose(GUESSES[i].id)
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
    ask(next, { planets: byPlanet = false } = {}) {
      test = next
      planets = byPlanet
      const before = rocketThumb(test.before)
      const now = rocketThumb(test.now)
      const last = dialog.querySelector('.ft-last')
      last.replaceChildren(img(before, 'ft-last-rocket'), el('span', 'ft-last-planet', DESTS[test.result.a.reach].emoji))
      last.setAttribute('aria-label', `Last time it reached ${placeName(test.result.a.reach)}`)
      swapPicture(test.result.changed)
      dialog.classList.toggle('by-planet', planets)
      const q = planets ? 'Where will it land now?' : 'Will it go farther, the same, or less far?'
      dialog.querySelector('#predict-q').textContent = q
      guesses.replaceChildren(...(planets
        ? DESTS.map((d, i) => {
            const b = el('button', 'where-planet')
            b.dataset.guess = String(i)
            b.setAttribute('aria-label', `It will land on ${placeName(i)}`)
            b.setAttribute('aria-pressed', 'false')
            b.append(el('span', '', d.emoji))
            b.onclick = () => choose(i)
            return b
          })
        : GUESSES.map((g) => {
            const b = el('button', 'ft-guess')
            b.dataset.guess = g.id
            b.setAttribute('aria-label', `It will go ${g.say}`)
            b.setAttribute('aria-pressed', 'false')
            b.append(guessPicture(g.id, before, now), el('span', 'ft-label', g.label))
            b.onclick = () => choose(g.id)
            return b
          })))
      said = `${changedWords(test.result.changed)} Last time, it reached ${placeName(test.result.a.reach)}. ${q}`
      dialog.showModal()
      dialog.focus()
      voice.sayNow(said)
    },
    close() { if (dialog.open) dialog.close() },
  }
}

/** The pictured "what I found out" notebook: one page per part, filled by fair tests. */
export function createNotebook({ notes, thumbOf, voice, sound = () => {}, onTest = null, flown = () => new Set(), known = () => ({}) }) {
  const dialog = el('dialog', 'ft-dialog ft-notebook')
  dialog.id = 'notebook'
  dialog.setAttribute('aria-labelledby', 'notebook-title')
  dialog.innerHTML = `<div class="ft-head"><h2 id="notebook-title">📓 What I found out</h2>
    <button id="notebook-test" class="ft-round" aria-label="Test two rockets side by side">🧪</button><button id="notebook-say" class="ft-round" aria-label="Say it again">🔊</button><button id="notebook-close" class="ft-round" aria-label="Close the notebook">✕</button></div>
    <div class="ft-pages"></div><div class="ft-flown" role="group" aria-label="Where each booster landed"></div><div class="ft-wob" role="group" aria-label="Which parts wobble"><button class="ft-wob-key" aria-label="A straight line means steady. A wavy line means wobbly."><b>━</b> steady <b>〰️</b> wobbly</button><span class="ft-wob-parts"></span></div><p id="notebook-line" role="status" aria-live="polite"></p>`
  document.body.append(dialog)
  keyGuard(dialog)
  const pages = dialog.querySelector('.ft-pages')
  const line = dialog.querySelector('#notebook-line')
  const went = dialog.querySelector('.ft-flown')
  const wob = dialog.querySelector('.ft-wob')
  const wobParts = dialog.querySelector('.ft-wob-parts')
  let said = ''
  const tell = (text) => {
    line.textContent = text
    said = text
    voice.sayNow(text)
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
    // Where each booster has landed: the garage no longer labels them, so this is the record to look up
    const order = PARTS.booster.map((p) => p.id).filter((id) => flown().has(id))
    went.replaceChildren(...order.map((id) => {
      const text = `${BOOSTER_WORDS[id][0].toUpperCase()}${BOOSTER_WORDS[id].slice(1)} reach ${placeName(reach({ booster: id }))}.`
      const b = el('button', 'ft-went')
      b.setAttribute('aria-label', text)
      const src = id === 'none' ? '' : thumbOf('booster', id)
      b.append(src ? img(src) : el('span', 'ft-went-none', '🚫'), el('i', '', '➜'), el('span', 'ft-went-planet', DESTS[reach({ booster: id })].emoji))
      b.onclick = () => {
        sound('pick')
        tell(text)
      }
      return b
    }))
    went.classList.toggle('hidden', !order.length)
    // Each nose, tank or fins the child has tested on its own, marked steady ━ or wobbly 〰️
    const keys = Object.keys(known()).sort((a, b) => PAGES.indexOf(a.split(':')[0]) - PAGES.indexOf(b.split(':')[0]))
    wobParts.replaceChildren(...keys.map((key) => {
      const [slot, id] = key.split(':')
      const v = known()[key]
      const text = partSentence(key, v)
      const b = el('button', `ft-wob-part ${v === 'w' ? 'wobbly' : 'steady'}`)
      b.setAttribute('aria-label', text)
      b.append(img(thumbOf(slot, id)), el('b', '', WOB_MARK[v]))
      b.onclick = () => {
        sound('pick')
        tell(text)
      }
      return b
    }))
    wob.classList.toggle('hidden', !keys.length)
  }

  dialog.querySelector('.ft-wob-key').onclick = () => {
    sound('pick')
    tell('A straight line means steady. A wavy line means wobbly.')
  }
  dialog.querySelector('#notebook-close').onclick = () => dialog.close()
  // "Test again": the side-by-side workshop lives in the notebook, beside what it finds out
  const test = dialog.querySelector('#notebook-test')
  if (onTest) test.onclick = () => {
    dialog.close()
    onTest()
  }
  else test.remove()
  dialog.addEventListener('close', () => voice.hush())
  dialog.querySelector('#notebook-say').onclick = () => voice.sayNow(said)

  return {
    get open() { return dialog.open },
    show({ look = '' } = {}) {
      render()
      went.classList.toggle('look', look === 'flown')
      const found = Object.keys(notes()).length
      dialog.showModal()
      if (look === 'flown') return tell(`Where did each booster go? Tap one to hear it.`)
      tell(found ? `You found out ${found} thing${found > 1 ? 's' : ''}! Tap a page to hear it.` : 'Change just one part, then fly. What you find out goes here!')
    },
    close() { if (dialog.open) dialog.close() },
  }
}
