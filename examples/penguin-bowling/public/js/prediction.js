// Predictions invite counting; the actual pin result is always shown neutrally.
export function createPrediction({ button, hud, getStanding, onOpen }) {
  let guess = null
  let value = 0
  let max = 10

  const dialog = document.createElement('dialog')
  dialog.id = 'pin-prediction'
  dialog.innerHTML = `<h2>Count, then predict</h2>
    <p>How many pins might fall on your next slide?</p>
    <div class="pin-counter">
      <button id="pin-less" aria-label="One fewer pin">−</button>
      <output id="pin-value">0</output>
      <button id="pin-more" aria-label="One more pin">+</button>
    </div>
    <p id="pin-total"></p>
    <button id="pin-confirm">Keep my prediction</button><button id="pin-close">Just play</button>`
  document.body.append(dialog)
  const $ = (selector) => dialog.querySelector(selector)
  const less = $('#pin-less')
  const more = $('#pin-more')

  const readout = document.createElement('div')
  readout.id = 'pin-discovery'
  readout.setAttribute('role', 'status')
  readout.hidden = true
  hud.append(readout)
  function say(text) {
    readout.hidden = false
    readout.textContent = text
  }

  function draw() {
    $('#pin-value').textContent = value
    $('#pin-total').textContent = `${max} pins are standing.`
    less.disabled = value === 0
    more.disabled = value === max
  }

  button.onclick = () => {
    max = getStanding()
    value = Math.min(guess ?? Math.ceil(max / 2), max)
    onOpen?.()
    draw()
    dialog.showModal()
  }
  less.onclick = () => { value = Math.max(0, value - 1); draw() }
  more.onclick = () => { value = Math.min(max, value + 1); draw() }
  $('#pin-confirm').onclick = () => {
    guess = value
    say(`My prediction: ${guess} pins will fall.`)
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
    },
    result(knocked, standing, before) {
      const predicted = guess === null ? '' : `I predicted ${guess}. `
      say(`${predicted}${knocked} fell + ${standing} standing = ${before} pins.`)
      guess = null
    },
    reset() {
      guess = null
      readout.hidden = true
      dialog.close()
    },
  }
}
