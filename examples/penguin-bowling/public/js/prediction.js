// Predictions invite counting; the actual pin result is always shown neutrally.
// Pictures carry the meaning for children who can't read yet: the guessed pins
// tip over in the dialog, and the line under the HUD shows 💭 guess · 💥 fell.
export function createPrediction({ button, hud, getStanding, onOpen, sound, muted }) {
  let guess = null
  let value = 0
  let max = 10

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
  function speak(text) {
    try {
      if (muted?.() || !('speechSynthesis' in window)) return
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.95
      u.pitch = 1.15
      speechSynthesis.speak(u)
    } catch {}
  }

  // Pins in the bowling triangle (4, 3, 2, 1 from the back); tapping one picks that many.
  function drawPins() {
    pick.innerHTML = ''
    let n = 0
    for (const size of [4, 3, 2, 1]) {
      const row = document.createElement('div')
      for (let i = 0; i < size; i++, n++) {
        if (n >= max) break
        const k = max - n // front pins fall first: the front pin is number 1
        const b = document.createElement('button')
        b.className = 'pin' + (k <= value ? ' fall' : '')
        b.setAttribute('aria-label', `${k} ${k === 1 ? 'pin' : 'pins'}`)
        b.onclick = () => {
          value = value === k ? k - 1 : k
          sound?.('tap')
          draw()
        }
        row.append(b)
      }
      if (row.children.length) pick.append(row)
    }
  }

  function draw() {
    $('#pin-value').textContent = value
    $('#pin-total').textContent = `${max} pins are standing.`
    less.disabled = value === 0
    more.disabled = value === max
    drawPins()
  }

  button.onclick = () => {
    max = getStanding()
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
    say(`My prediction: ${guess} pins will fall.`, `💭 ${guess}`)
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
      say(`${predicted}${knocked} fell + ${standing} standing = ${before} pins.`, icons, exact ? 'exact' : '')
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
