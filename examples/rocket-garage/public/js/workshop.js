import { DESTS, PARTS, reach, wobble } from './parts.js'

const STORAGE_KEY = 'rocket-garage:reference:v1'
const QUESTION = 'Which build will travel farther?'

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

const isBuild = (value) => value && Object.keys(PARTS).every((slot) => PARTS[slot].some((p) => p.id === value[slot]))

function buildCard(label, build, slot, thumbOf) {
  const card = document.createElement('section')
  card.className = 'workshop-build'
  const heading = document.createElement('h3')
  heading.textContent = `${label} 🚀`
  const picture = document.createElement('img')
  picture.src = thumbOf('booster', build.booster) || ''
  picture.alt = `${build.booster} booster`
  const rail = document.createElement('div')
  rail.className = 'workshop-rail'
  rail.dataset.build = slot
  const ship = document.createElement('span')
  ship.className = 'workshop-ship'
  ship.textContent = '🚀'
  rail.append(ship)
  const destinations = document.createElement('div')
  destinations.className = 'workshop-destinations'
  for (const destination of DESTS) {
    const mark = document.createElement('span')
    mark.textContent = destination.emoji
    destinations.append(mark)
  }
  card.append(heading, picture, rail, destinations)
  return card
}

// A fair-test workshop: save build A, change one part in the garage, predict, then watch both fly.
export function createWorkshop({ readRocket, thumbOf }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'workshop'
  dialog.setAttribute('aria-labelledby', 'workshop-title')
  dialog.innerHTML = `<div class="workshop-head"><h2 id="workshop-title">Robot’s test workshop</h2><button id="workshop-close" aria-label="Close workshop">✕</button></div>
    <p>Save A. Change one part in the garage. Compare it with B.</p>
    <div class="workshop-builds"></div>
    <p id="workshop-rule"></p>
    <div class="workshop-prediction" role="group" aria-label="${QUESTION}"><button data-predict="a">A 🚀</button><button data-predict="same">Same ↔</button><button data-predict="b">B 🚀</button></div>
    <p id="workshop-feedback" role="status" aria-live="polite">${QUESTION}</p>
    <div class="workshop-footer"><button id="workshop-save">Save current build as A</button><button id="workshop-test" disabled>▶ Run workshop test</button></div>`
  document.body.append(dialog)
  // Keep the garage's keyboard controls out of the open workshop.
  const guard = (e) => { if (dialog.open) e.stopPropagation() }
  addEventListener('keydown', guard, true)
  addEventListener('keyup', guard, true)

  const $ = (id) => dialog.querySelector(`#${id}`)
  const saveButton = $('workshop-save')
  const testButton = $('workshop-test')
  const predictButtons = [...dialog.querySelectorAll('[data-predict]')]
  const feedback = (text) => { $('workshop-feedback').textContent = text }

  let reference = null // build A
  let current = null // build B: the garage's rocket when the workshop opened
  let prediction = null
  let running = false
  let timer = 0
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (isBuild(stored)) reference = stored
  } catch {}

  function setBusy(busy) {
    running = busy
    testButton.disabled = saveButton.disabled = busy
    for (const button of predictButtons) button.disabled = busy
  }

  function stop() {
    clearTimeout(timer)
    running = false
  }

  function render() {
    stop()
    prediction = null
    current = structuredClone(readRocket())
    reference ??= structuredClone(current)
    const { changed } = compareBuilds(reference, current)
    dialog.querySelector('.workshop-builds').replaceChildren(buildCard('A', reference, 'a', thumbOf), buildCard('B', current, 'b', thumbOf))
    $('workshop-rule').textContent = changed.length === 0
      ? 'These builds have the same parts. Try changing just the booster.'
      : changed.length === 1
        ? `One change: ${changed[0]}. A good comparison!`
        : `You changed ${changed.length} parts. Try changing just one to see its effect.`
    for (const button of predictButtons) {
      button.disabled = false
      button.setAttribute('aria-pressed', 'false')
    }
    testButton.disabled = true
    saveButton.disabled = false
    feedback(QUESTION)
  }

  for (const button of predictButtons) {
    button.onclick = () => {
      if (running) return
      prediction = button.dataset.predict
      for (const option of predictButtons) option.setAttribute('aria-pressed', String(option === button))
      testButton.disabled = false
      feedback(`Your prediction: ${prediction === 'same' ? 'same distance' : `build ${prediction.toUpperCase()}`}`)
    }
  }

  saveButton.onclick = () => {
    reference = structuredClone(readRocket())
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reference)) } catch {}
    render()
    feedback('Build A saved. Close the workshop, change one part, and return.')
  }

  testButton.onclick = () => {
    if (!prediction || running) return
    setBusy(true)
    const result = compareBuilds(reference, current)
    feedback('Watch where each build travels…')
    for (const slot of ['a', 'b']) {
      const ship = dialog.querySelector(`[data-build="${slot}"] .workshop-ship`)
      ship.style.left = `${10 + result[slot].reach * 20}%`
      ship.style.setProperty('--wobble', `${result[slot].wobble * 7}deg`)
      ship.classList.add('flying')
    }
    timer = setTimeout(() => {
      for (const ship of dialog.querySelectorAll('.workshop-ship')) ship.classList.remove('flying')
      const verdict = prediction === result.answer ? 'Your prediction matched.' : 'A new discovery!'
      const outcome = result.answer === 'same' ? 'Both reach the same destination.' : `Build ${result.answer.toUpperCase()} travels farther.`
      feedback(`${verdict} ${outcome} A reaches ${DESTS[result.a.reach].name}; B reaches ${DESTS[result.b.reach].name}. In this toy workshop, boosters change reach; tank, nose and fins change wobble.`)
      setBusy(false)
    }, 1600)
  }

  function close() {
    stop()
    dialog.close()
  }
  $('workshop-close').onclick = close
  dialog.addEventListener('cancel', stop)

  return {
    open() {
      render()
      dialog.showModal()
    },
    close,
  }
}
