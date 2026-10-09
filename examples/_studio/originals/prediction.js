// Predictions invite counting; the actual pin result is always shown neutrally.
// Pictures carry the meaning for children who can't read yet: the guessed pins
// tip over in the dialog, and the line under the HUD shows 💭 guess · 💥 fell.
// getLayout (optional) returns rows of pins, back row first, as true (standing) /
// false (fallen), so the dialog shows the same pins the child can see on the lane.
export function createPrediction({ button, hud, getStanding, getLayout, onOpen, sound, voice }) {
  let guess = null
  let value = 0
  let max = 10
  let layout = null
  // A no-break space keeps "10 pins" together when the result line wraps.
  const pins = (n) => `${n}\u00a0${n === 1 ? 'pin' : 'pins'}`

  const dialog = document.createElement('dialog')
  dialog.id = 'pin-prediction'
  dialog.innerHTML = `<h2><span aria-hidden="true">💭</span> Count, then predict</h2>
    <p>How many pins might fall on your next slide? Tap the pins!</p>
    <div id="pin-pick" class="pin-pick"></div>
    <div class="pin-counter">
      <button id="pin-less" aria-label="One fewer pin">−</button>
      <output id="pin-value">0</output>
      <button id="pin-more" aria-label="One more pin">+</button>
    </div>
    <p id="pin-total"></p>
    <div class="pin-actions"><button id="pin-confirm" class="pin-keep">✅ Keep my prediction</button><button id="pin-close">🐧 Just play</button></div>`
  document.body.append(dialog)
  const $ = (selector) => dialog.querySelector(selector)
  const less = $('#pin-less')
  const more = $('#pin-more')
  const pick = $('#pin-pick')

  const readout = document.createElement('div')
  readout.id = 'pin-discovery'
  readout.setAttribute('role', 'status')
  readout.hidden = true
  hud.append(readout)
  function say(text, icons = '', kind = '') {
    readout.hidden = false
    readout.className = kind
    readout.innerHTML = ''
    if (icons) readout.append(Object.assign(document.createElement('b'), { className: 'pin-icons', textContent: icons }))
    readout.append(Object.assign(document.createElement('span'), { textContent: text }))
    // Replay the pop so a new line is noticed.
    readout.style.animation = 'none'
    void readout.offsetWidth
    readout.style.animation = ''
  }
  // Each tap's answer replaces the last one, so a quick child never hears a backlog
  const speak = voice.sayNow

  // Pins in the bowling triangle (4, 3, 2, 1 from the back); tapping one picks that many.
  // With a layout, fallen spots stay as gaps so the triangle matches the lane.
  function drawPins() {
    pick.innerHTML = ''
    const rows = layout ?? [4, 3, 2, 1].map((size, r) => Array.from({ length: size }, (_, i) => [0, 4, 7, 9][r] + i < max))
    let n = 0
    for (const spots of rows) {
      const row = document.createElement('div')
      for (const up of spots) {
        if (!up) {
          row.append(Object.assign(document.createElement('span'), { className: 'pin gap' }))
          continue
        }
        const k = max - n++ // front pins fall first: the front pin is number 1
        const b = document.createElement('button')
        b.className = 'pin' + (k <= value ? ' fall' : '')
        b.setAttribute('aria-label', pins(k))
        b.onclick = () => {
          value = value === k ? k - 1 : k
          sound?.('tap')
          draw()
        }
        row.append(b)
      }
      if (spots.some(Boolean)) pick.append(row)
    }
  }

  function draw() {
    $('#pin-value').textContent = value
    $('#pin-total').textContent = `${pins(max)} ${max === 1 ? 'is' : 'are'} standing.`
    less.disabled = value === 0
    more.disabled = value === max
    drawPins()
  }

  button.onclick = () => {
    max = getStanding()
    layout = getLayout?.() ?? null
    value = Math.min(guess ?? Math.ceil(max / 2), max)
    onOpen?.()
    draw()
    dialog.showModal()
    speak('How many pins will fall?')
  }
  less.onclick = () => { value = Math.max(0, value - 1); sound?.('tap'); draw() }
  more.onclick = () => { value = Math.min(max, value + 1); sound?.('tap'); draw() }
  $('#pin-confirm').onclick = () => {
    guess = value
    say(`My prediction: ${pins(guess)} will fall.`, `💭 ${guess}`)
    sound?.('keep')
    speak(`${guess}! Let's see.`)
    dialog.close()
  }
  $('#pin-close').onclick = () => dialog.close()
  // Keep the bowling game's keyboard controls out of the open dialog.
  addEventListener('keydown', (e) => { if (dialog.open) e.stopImmediatePropagation() }, true)

  return {
    get open() { return dialog.open },
    get guess() { return guess },
    aim() { button.disabled = false },
    rolling() {
      button.disabled = true
      dialog.close()
      // An old result line would describe pins that are no longer there.
      if (guess === null) readout.hidden = true
    },
    result(knocked, standing, before) {
      const exact = guess !== null && guess === knocked
      const predicted = guess === null ? '' : `I predicted ${guess}. `
      const icons = guess === null ? `💥 ${knocked}` : `💭 ${guess} · 💥 ${knocked}${exact ? ' 🎯' : ''}`
      say(`${predicted}${knocked} fell + ${standing} standing = ${pins(before)}.`, icons, exact ? 'exact' : '')
      if (guess !== null) speak(exact ? `${knocked} fell. You got it exactly!` : `${knocked} fell.`)
      if (exact) sound?.('exact')
      guess = null
      return { exact }
    },
    reset() {
      guess = null
      readout.hidden = true
      dialog.close()
    },
  }
}
