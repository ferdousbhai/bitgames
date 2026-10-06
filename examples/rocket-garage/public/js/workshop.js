import { DESTS, PARTS, reach, wobble } from './parts.js'

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

const BOOSTER_WORDS = { none: 'no boosters', small: 'small boosters', big: 'big boosters', mega: 'mega boosters', rainbow: 'rainbow boosters' }
const SLOT_WORDS = { nose: 'nose', cabin: 'window', pilot: 'pilot', tank: 'tank', sticker: 'sticker', fins: 'fins', booster: 'boosters' }
const WOBBLY = new Set(['nose', 'tank', 'fins'])

/** One or two short, honest sentences: what changed, and why the rockets flew the way they did. */
export function explain(a, b, result = compareBuilds(a, b)) {
  const { changed } = result
  if (changed.length === 0) return 'Same parts, so they fly the same.'
  const many = changed.length > 1 ? ' You changed more than one part, so it is hard to tell which one did it.' : ''
  if (changed.includes('booster')) {
    if (result.answer === 'same') return `Both rockets still reach the ${DESTS[result.a.reach].name}.${many}`
    const far = result.answer === 'a' ? a : b
    const near = result.answer === 'a' ? b : a
    const push = near.booster === 'none' ? 'give an extra push' : `push harder than ${BOOSTER_WORDS[near.booster]}`
    return `${capital(BOOSTER_WORDS[far.booster])} ${push}!${many}`
  }
  const wobbly = changed.filter((slot) => WOBBLY.has(slot))
  if (wobbly.length) {
    const more = result.b.wobble > result.a.wobble ? 'B wobbles more' : result.b.wobble < result.a.wobble ? 'A wobbles more' : 'they wobble the same'
    const names = wobbly.map((s) => SLOT_WORDS[s])
    const verb = names.length > 1 || names[0] === 'fins' ? 'change' : 'changes'
    return `Same boosters, same distance. The ${names.join(' and ')} only ${verb} the wobble: ${more}.`
  }
  const names = changed.map((s) => SLOT_WORDS[s])
  return `Same boosters, same distance. The ${names.join(' and ')} ${names.length > 1 || names[0] === 'boosters' ? 'are' : 'is'} just for fun!`
}
const capital = (s) => s[0].toUpperCase() + s.slice(1)

const isBuild = (value) => value && Object.keys(PARTS).every((slot) => PARTS[slot].some((p) => p.id === value[slot]))

/** Rocket A from an earlier visit, if one was saved. */
export function readStoredReference() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return isBuild(stored) ? stored : null
  } catch {
    return null
  }
}

function el(tag, className, text) {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

function buildCard(label, build, slot, rocketThumb) {
  const card = el('section', `workshop-build build-${slot}`)
  card.dataset.card = slot
  const badge = el('b', 'workshop-badge', label)
  const picture = el('img', 'workshop-rocket')
  picture.src = rocketThumb(build) || ''
  picture.alt = `Rocket ${label}`
  const rail = el('div', 'workshop-rail')
  rail.dataset.build = slot
  rail.append(el('span', 'workshop-home', '🏠'))
  for (const destination of DESTS) rail.append(el('span', 'workshop-stop', destination.emoji))
  const ship = el('span', 'workshop-ship')
  ship.append(el('img'))
  ship.firstChild.src = picture.src
  ship.firstChild.alt = ''
  rail.append(ship)
  card.append(badge, picture, rail)
  return card
}

/**
 * A fair-test workshop: rocket A is saved, the child changes one part in the garage (that is
 * rocket B), predicts which flies farther, then watches both fly on little tracks.
 * Pictures, a pointing hand and spoken words carry it for children who are not reading yet.
 */
export function createWorkshop({ readRocket, thumbOf, rocketThumb = () => '', speak = () => {}, sound = () => {}, onChange = () => {} }) {
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
  // Keep the garage's keyboard controls out of the open workshop.
  const guard = (e) => { if (dialog.open) e.stopPropagation() }
  addEventListener('keydown', guard, true)
  addEventListener('keyup', guard, true)

  const $ = (id) => dialog.querySelector(`#${id}`)
  const saveButton = $('workshop-save')
  const testButton = $('workshop-test')
  const garageButton = $('workshop-garage')
  const finger = dialog.querySelector('.workshop-finger')
  const predictButtons = [...dialog.querySelectorAll('[data-predict]')]
  let said = ''
  const feedback = (text, voice = text) => {
    $('workshop-feedback').textContent = text
    said = voice
    if (dialog.open && voice) speak(voice)
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
  function point(target) {
    for (const b of dialog.querySelectorAll('.nudge')) b.classList.remove('nudge')
    if (!target) return finger.classList.remove('show')
    target.classList.add('nudge')
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
    dialog.querySelector('.workshop-builds').replaceChildren(buildCard('A', reference, 'a', rocketThumb), buildCard('B', current, 'b', rocketThumb))
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
      feedback(QUESTION, say ? (changed.length === 1 ? `You changed the ${SLOT_WORDS[changed[0]]}. ${QUESTION}` : `You changed ${changed.length} parts. ${QUESTION}`) : '')
      point(predictButtons[1])
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
    for (const slot of ['a', 'b']) {
      // The rail carries how far it flies: the ship and its glowing trail both follow it
      const rail = dialog.querySelector(`[data-build="${slot}"]`)
      rail.style.setProperty('--at', String(result[slot].reach + 1))
      const ship = rail.querySelector('.workshop-ship')
      ship.style.setProperty('--wobble', `${4 + result[slot].wobble * 14}deg`)
      ship.classList.add('flying')
    }
    timer = setTimeout(() => {
      for (const ship of dialog.querySelectorAll('.workshop-ship')) ship.classList.remove('flying')
      for (const slot of ['a', 'b']) {
        dialog.querySelector(`[data-card="${slot}"]`).classList.toggle('winner', result.answer === slot || result.answer === 'same')
        // A flag goes up on the planet each rocket reached
        dialog.querySelectorAll(`[data-build="${slot}"] .workshop-stop`)[result[slot].reach]?.classList.add('reached')
      }
      const matched = prediction === result.answer
      const verdict = matched ? '✔ Your prediction matched!' : '💡 A new discovery!'
      const outcome = result.answer === 'same' ? 'They fly the same.' : `${result.answer.toUpperCase()} flies farther.`
      const why = explain(reference, current, result)
      feedback(`${verdict} ${outcome} ${why}`, `${matched ? 'Yes! You were right!' : 'Ooh, a new discovery!'} ${result.answer === 'same' ? 'They fly the same.' : `Rocket ${result.answer.toUpperCase()} flies farther.`} ${why}`)
      sound(matched ? 'yay' : 'hmm')
      setBusy(false)
      point(garageButton)
    }, 1900)
  }

  function close() {
    stop()
    point(null)
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    if (dialog.open) dialog.close()
  }
  $('workshop-close').onclick = close
  garageButton.onclick = close
  $('workshop-say').onclick = () => { if (said) speak(said) }
  dialog.addEventListener('cancel', stop)
  dialog.addEventListener('close', () => { point(null); onChange() })

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
