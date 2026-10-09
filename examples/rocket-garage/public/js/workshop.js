import { DESTS, PARTS, reach, wobble } from './parts.js'
import { listWords } from './speech.js'

const STORAGE_KEY = 'rocket-garage:reference:v1'
const QUESTION = 'Which rocket will fly farther?'

// Compare the actual toy-flight rules. This is deliberately the same model as
// flight: booster power selects reach; nose/tank/fins affect wobble.
export function compareBuilds(a, b) {
  const changed = Object.keys(PARTS).filter((slot) => a[slot] !== b[slot])
  const reachA = reach(a)
  const reachB = reach(b)
  return {
    changed,
    a: { reach: reachA, wobble: wobble(a) },
    b: { reach: reachB, wobble: wobble(b) },
    answer: reachA === reachB ? 'same' : reachA > reachB ? 'a' : 'b',
  }
}

export const BOOSTER_WORDS = { none: 'no boosters', small: 'small boosters', big: 'big boosters', mega: 'mega boosters', rainbow: 'rainbow boosters' }
export const SLOT_WORDS = { nose: 'nose', cabin: 'window', pilot: 'pilot', tank: 'tank', sticker: 'sticker', fins: 'fins', booster: 'boosters' }
export const WOBBLY = new Set(['nose', 'tank', 'fins'])
/** Slots whose names are plural words: "the fins change", "the boosters are". */
export const PLURAL_SLOTS = new Set(['fins', 'booster'])
/** "the Moon", but "Mars". */
export const placeName = (i) => (DESTS[i].id === 'mars' ? '' : 'the ') + DESTS[i].name

const MANY = ' You changed more than one part, so it is hard to tell which one did it.'

/**
 * The one rule behind both explanations: boosters change the distance; nose, tank and fins only
 * the wobble; everything else is just for fun. `explain` and `explainFlight` put it into words.
 */
export function ruling({ changed }) {
  const wobbly = changed.filter((slot) => WOBBLY.has(slot))
  const words = (slots) => listWords.format(slots.map((s) => SLOT_WORDS[s]))
  return {
    kind: changed.length === 0 ? 'none' : changed.includes('booster') ? 'distance' : wobbly.length ? 'wobble' : 'fun',
    many: changed.length > 1 ? MANY : '',
    wobbly: words(wobbly),
    wobblyPlural: wobbly.length > 1 || PLURAL_SLOTS.has(wobbly[0]),
    parts: words(changed),
    plural: changed.length > 1,
  }
}

/** One or two short, honest sentences: what changed, and why the rockets flew the way they did. */
export function explain(a, b, result = compareBuilds(a, b)) {
  const r = ruling(result)
  if (r.kind === 'none') return 'Same parts, so they fly the same.'
  if (r.kind === 'distance') {
    if (result.answer === 'same') return `Both rockets still reach ${placeName(result.a.reach)}.${r.many}`
    const [far, near] = result.answer === 'a' ? [a, b] : [b, a]
    const push = near.booster === 'none' ? 'give an extra push' : `push harder than ${BOOSTER_WORDS[near.booster]}`
    return `${capital(BOOSTER_WORDS[far.booster])} ${push}!${r.many}`
  }
  if (r.kind === 'wobble') {
    const more = result.b.wobble > result.a.wobble ? 'B wobbles more' : result.b.wobble < result.a.wobble ? 'A wobbles more' : 'they wobble the same'
    return `Same boosters, same distance. The ${r.wobbly} only ${r.wobblyPlural ? 'change' : 'changes'} the wobble: ${more}.`
  }
  return `Same boosters, same distance. The ${r.parts} ${r.plural ? 'are' : 'is'} just for fun!`
}
const capital = (s) => s[0].toUpperCase() + s.slice(1)

/**
 * The same rule told about one rocket against its last flight ("before" against "now"), for the
 * question asked at every launch after a part change. One spoken sentence that names the cause.
 */
export function explainFlight(before, now, result = compareBuilds(before, now)) {
  const r = ruling(result)
  if (r.kind === 'none') return 'Same parts, so it flies the same.'
  if (r.kind === 'distance') {
    const was = BOOSTER_WORDS[before.booster]
    const is = BOOSTER_WORDS[now.booster]
    if (result.answer === 'same') return `Both still reach ${placeName(result.b.reach)}.${r.many}`
    if (result.answer === 'b') return `${capital(is)} ${before.booster === 'none' ? 'gave it a push' : `push harder than ${was}`}, so it went farther!${r.many}`
    return `${now.booster === 'none' ? 'With no boosters there was no extra push' : `${capital(is)} push less than ${was}`}, so it did not go as far.${r.many}`
  }
  if (r.kind === 'wobble') {
    if (result.a.wobble !== result.b.wobble) return `The ${r.wobbly} changed the wobble, not the distance.${r.many}`
    return `The ${r.parts} did not change the distance.`
  }
  return `The ${r.parts} ${r.plural ? 'are' : 'is'} just for fun. Same distance!`
}

/** "You changed the fins." or "You changed 3 parts." */
export const changedWords = (changed) => (changed.length === 1 ? `You changed the ${SLOT_WORDS[changed[0]]}.` : `You changed ${changed.length} parts.`)

export const isBuild = (value) => value && Object.keys(PARTS).every((slot) => PARTS[slot].some((p) => p.id === value[slot]))

/** Rocket A from an earlier visit, if one was saved. */
export function readStoredReference() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return isBuild(stored) ? stored : null
  } catch {
    return null
  }
}

export function el(tag, className, text) {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** Keep the garage's keyboard controls out of an open dialog; the dialog's own key handlers still run. */
export function keyGuard(dialog) {
  const guard = (e) => e.stopPropagation()
  dialog.addEventListener('keydown', guard)
  dialog.addEventListener('keyup', guard)
}

function buildCard(label, build, slot, rocketThumb) {
  const card = el('section', `workshop-build build-${slot}`)
  card.dataset.card = slot
  const badge = el('b', 'workshop-badge', label)
  const picture = el('img', 'workshop-rocket')
  picture.src = rocketThumb(build) || ''
  picture.alt = `Rocket ${label}`
  card.append(badge, picture)
  return card
}

/**
 * One race track for two rockets: the planets along the top, then a lane for each,
 * so which one went farther is plain to see without comparing two separate pictures.
 * `lanes` is [{ slot: 'a' | 'b', build, badge: element }].
 */
export function buildRace(lanes, rocketThumb, className = '') {
  const race = el('div', `workshop-race ${className}`.trim())
  const stops = el('div', 'workshop-stops')
  stops.append(el('span'), el('span', 'workshop-stop workshop-home', '🏠'))
  for (const destination of DESTS) stops.append(el('span', 'workshop-stop', destination.emoji))
  race.append(stops)
  for (const { slot, build, badge } of lanes) {
    const lane = el('div', `workshop-lane lane-${slot}`)
    lane.append(badge)
    const track = el('div', 'workshop-rail')
    track.dataset.build = slot
    const ship = el('span', 'workshop-ship')
    const img = el('img')
    img.src = rocketThumb(build) || ''
    img.alt = ''
    ship.append(img)
    track.append(ship)
    lane.append(track)
    race.append(lane)
  }
  return race
}

/** Did rocket `slot` win? On a tie, both did. */
const won = (result, slot) => result.answer === slot || result.answer === 'same'

/**
 * Fly both little ships to their planets (once the race is in the page). `result` is a
 * compareBuilds result; the winner's lane (both, on a tie) glows when they land.
 * Returns the landing timer.
 */
export function flyRace(race, result, { duration = 1700, onDone = () => {} } = {}) {
  const rails = [...race.querySelectorAll('.workshop-rail')]
  for (const rail of rails) rail.querySelector('.workshop-ship').style.setProperty('--wobble', `${4 + result[rail.dataset.build].wobble * 14}deg`)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const rail of rails) {
      // The rail carries how far it flies: the ship and its glowing trail both follow it
      rail.style.setProperty('--at', String(result[rail.dataset.build].reach + 1))
      rail.querySelector('.workshop-ship').classList.add('flying')
    }
  }))
  return setTimeout(() => {
    const stops = race.querySelectorAll('.workshop-stops .workshop-stop')
    for (const rail of rails) {
      const slot = rail.dataset.build
      rail.querySelector('.workshop-ship').classList.remove('flying')
      // The planet each rocket reached pops up above its lane
      stops[result[slot].reach + 1]?.classList.add('reached')
      race.querySelector(`.lane-${slot}`).classList.toggle('winner', won(result, slot))
    }
    onDone()
  }, duration)
}

/**
 * A fair-test workshop: rocket A is saved, the child changes one part in the garage (that is
 * rocket B), predicts which flies farther, then watches both fly on little tracks.
 * Pictures, a pointing hand and spoken words carry it for children who are not reading yet.
 */
export function createWorkshop({ readRocket, thumbOf, rocketThumb = () => '', voice, sound = () => {}, onChange = () => {} }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'workshop'
  dialog.setAttribute('aria-labelledby', 'workshop-title')
  dialog.innerHTML = `<div class="workshop-head"><h2 id="workshop-title">🧪 Robot’s test workshop</h2><button id="workshop-say" class="workshop-round" aria-label="Say it again">🔊</button><button id="workshop-close" class="workshop-round" aria-label="Back to the garage">✕</button></div>
    <div class="workshop-builds"></div>
    <div class="workshop-change"><div class="workshop-swap" aria-hidden="true"></div><p id="workshop-rule"></p></div>
    <div class="workshop-prediction" role="group" aria-label="${QUESTION}"><button data-predict="a" aria-label="Rocket A flies farther">A</button><button data-predict="same" aria-label="Both fly the same">=</button><button data-predict="b" aria-label="Rocket B flies farther">B</button></div>
    <p id="workshop-feedback" role="status" aria-live="polite">${QUESTION}</p>
    <div class="workshop-footer"><button id="workshop-save" aria-label="Save this rocket as A">📸 A</button><button id="workshop-garage" aria-label="Back to the garage to change one part">🔧</button><button id="workshop-test" disabled aria-label="Test fly both rockets">▶</button></div>
    <span class="workshop-finger" aria-hidden="true">👆</span>`
  document.body.append(dialog)
  keyGuard(dialog)

  const $ = (id) => dialog.querySelector(`#${id}`)
  const saveButton = $('workshop-save')
  const testButton = $('workshop-test')
  const garageButton = $('workshop-garage')
  const finger = dialog.querySelector('.workshop-finger')
  const predictButtons = [...dialog.querySelectorAll('[data-predict]')]
  const predictionRow = dialog.querySelector('.workshop-prediction')
  // Each tap's answer replaces the last one (sayNow), so a quick child never hears a backlog
  let said = ''
  const feedback = (text, words = text) => {
    $('workshop-feedback').textContent = text
    said = words
    if (dialog.open && words) voice.sayNow(words)
  }

  let reference = readStoredReference() // build A
  let current = null // build B: the garage's rocket when the workshop opened
  let prediction = null
  let running = false
  let timer = 0

  function setBusy(busy) {
    running = busy
    testButton.disabled = saveButton.disabled = busy
    for (const button of predictButtons) button.disabled = busy
  }

  function stop() {
    clearTimeout(timer)
    running = false
  }

  /** The pointing hand shows the next thing to tap. */
  function point(target, hand = true) {
    for (const b of dialog.querySelectorAll('.nudge')) b.classList.remove('nudge')
    predictionRow.classList.remove('choose')
    // Asking for a guess: all three answers glow in turn, so the hand never hints at one of them
    // (or covers the question under them)
    if (target === predictionRow) {
      predictionRow.classList.add('choose')
      return finger.classList.remove('show')
    }
    if (!target) return finger.classList.remove('show')
    target.classList.add('nudge')
    if (!hand) return finger.classList.remove('show')
    requestAnimationFrame(() => {
      const r = target.getBoundingClientRect()
      const d = dialog.getBoundingClientRect()
      finger.style.left = `${r.left - d.left + r.width / 2 - 18 + dialog.scrollLeft}px`
      finger.style.top = `${r.top - d.top + r.height * 0.55 + dialog.scrollTop}px`
      finger.classList.add('show')
    })
  }

  function swapPicture(changed) {
    const swap = dialog.querySelector('.workshop-swap')
    swap.replaceChildren()
    if (changed.length === 0) {
      swap.append(el('span', 'workshop-same', '='))
      return
    }
    for (const slot of changed.slice(0, 3)) {
      const pair = el('span', 'workshop-pair')
      for (const [i, build] of [reference, current].entries()) {
        if (i) pair.append(el('i', '', '➜'))
        const holder = el('span', 'workshop-part')
        const src = build[slot] === 'none' ? '' : thumbOf(slot, build[slot])
        if (src) {
          const img = el('img')
          img.src = src
          img.alt = ''
          holder.append(img)
        } else holder.append(el('span', '', '🚫'))
        pair.append(holder)
      }
      swap.append(pair)
    }
    if (changed.length > 1) swap.append(el('span', 'workshop-many', '✋'))
  }

  function render(say = true) {
    stop()
    prediction = null
    current = structuredClone(readRocket())
    reference ??= structuredClone(current)
    const { changed } = compareBuilds(reference, current)
    dialog.querySelector('.workshop-builds').replaceChildren(
      buildCard('A', reference, 'a', rocketThumb),
      buildCard('B', current, 'b', rocketThumb),
      buildRace([
        { slot: 'a', build: reference, badge: el('b', 'workshop-lane-badge', 'A') },
        { slot: 'b', build: current, badge: el('b', 'workshop-lane-badge', 'B') },
      ], rocketThumb),
    )
    swapPicture(changed)
    dialog.dataset.changes = String(Math.min(changed.length, 2))
    $('workshop-rule').textContent = changed.length === 0
      ? 'A and B are the same. Change one part in the garage.'
      : changed.length === 1
        ? `One change: ${SLOT_WORDS[changed[0]]}. A fair test!`
        : `${changed.length} changes. Change just one part to see what it does.`
    for (const button of predictButtons) {
      button.disabled = false
      button.setAttribute('aria-pressed', 'false')
    }
    testButton.disabled = true
    saveButton.disabled = false
    if (changed.length === 0) {
      feedback('Change one part, then come back.', say ? 'This is rocket A. Go to the garage, change one part, then come back!' : '')
      point(garageButton)
    } else {
      feedback(QUESTION, say ? `${changedWords(changed)} ${QUESTION}` : '')
      point(predictionRow)
    }
    onChange()
  }

  for (const button of predictButtons) {
    button.onclick = () => {
      if (running) return
      prediction = button.dataset.predict
      sound('pick')
      for (const option of predictButtons) option.setAttribute('aria-pressed', String(option === button))
      testButton.disabled = false
      const guess = prediction === 'same' ? 'the same' : `rocket ${prediction.toUpperCase()}`
      feedback(`You think: ${guess}. Press ▶`, `You think ${guess}. Press play to test!`)
      point(testButton)
    }
  }

  saveButton.onclick = () => {
    reference = structuredClone(readRocket())
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reference)) } catch {}
    sound('save')
    render(false)
    feedback('📸 Rocket A saved! Now change one part.', 'Rocket A saved! Go to the garage and change one part.')
    point(garageButton)
  }

  testButton.onclick = () => {
    if (!prediction || running) return
    setBusy(true)
    point(null)
    const result = compareBuilds(reference, current)
    feedback('3… 2… 1…', '')
    sound('go')
    timer = flyRace(dialog.querySelector('.workshop-race'), result, { duration: 1900, onDone: () => {
      for (const slot of ['a', 'b']) dialog.querySelector(`[data-card="${slot}"]`).classList.toggle('winner', won(result, slot))
      const matched = prediction === result.answer
      const verdict = matched ? '✔ Your prediction matched!' : '💡 A new discovery!'
      const why = explain(reference, current, result)
      // "Same boosters, same distance" already says they tie, so it isn't said twice
      const outcome = result.answer !== 'same' ? `${result.answer.toUpperCase()} flies farther.` : why.startsWith('Same') ? '' : 'They fly the same.'
      const spoken = result.answer !== 'same' ? `Rocket ${result.answer.toUpperCase()} flies farther.` : outcome
      feedback(`${verdict} ${outcome} ${why}`.replace('  ', ' '), `${matched ? 'Yes! You were right!' : 'Ooh, a new discovery!'} ${spoken} ${why}`)
      sound(matched ? 'yay' : 'hmm')
      setBusy(false)
      // The 🔧 glows for "go and try another change"; no hand, so the result stays in view
      point(garageButton, false)
    } })
  }

  const close = () => { if (dialog.open) dialog.close() }
  $('workshop-close').onclick = close
  garageButton.onclick = close
  $('workshop-say').onclick = () => { if (said) voice.sayNow(said) }
  // Every way out (✕, 🔧, Escape) ends here, so the race and the robot's words stop together
  dialog.addEventListener('close', () => {
    stop()
    point(null)
    voice.hush()
    onChange()
  })

  return {
    open() {
      dialog.showModal()
      render()
    },
    close,
    /** 0 = nothing saved yet or no change, 1 = exactly one part changed (ready to test), 2 = more. */
    status(rocket) {
      if (!reference) return -1
      return Math.min(compareBuilds(reference, rocket).changed.length, 2)
    },
  }
}
